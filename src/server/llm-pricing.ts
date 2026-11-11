import "server-only"

import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { llmModelPrice, platformSetting } from "@/db/schema"
import { loadAiConfig } from "@/server/ai/config"
import { normalizeUpstreamModel } from "@/server/ai/usage"
import { LEGACY_MODEL_URI_ENV } from "@/server/ai/yandex-connection"
import {
  DEFAULT_SKU_MAP,
  SKU_ID,
  createYandexBillingClient,
  groupTextGenerationSkus,
  planModelPriceRows,
  readYandexBillingCredentials,
  YandexBillingError,
  type PriceRow,
  type SkuLink,
  type YandexSku,
  type YandexSkuGroup,
} from "@/server/ai/billing"

// Automatic model prices (Topics phase 0). Every day the app reads our RUB
// prices from the Yandex Billing API and adds a `llm_model_price` row when a
// linked model's price changed (rows with created_by = NULL are automatic).
// Our cost stays the base of the daily cap; the markup is only shown as the
// client price.
//
// Schedule: a timer in every app process (src/instrumentation.ts) checks every
// 6 h and syncs when the last run is older than 23 h. A transaction-level
// advisory lock + the "price differs" check keep parallel replicas from adding
// duplicates. The admin can also run it from Settings → «Модели».

export const LLM_MARKUP_SETTING_KEY = "llm.markupPercent"
export const LLM_DEFAULT_MARKUP_PERCENT = 50
const SKU_MAP_SETTING_KEY = "llm.priceSync.skuMap"
const LAST_RUN_SETTING_KEY = "llm.priceSync.lastRun"
const SYNC_LOCK_KEY = 0x6c6c6d70 // "llmp"
const SYNC_MAX_AGE_MS = 23 * 3600_000
const SYNC_CHECK_INTERVAL_MS = 6 * 3600_000

export type PriceSyncTrigger = "schedule" | "manual"

export type PriceSyncRun = {
  at: string
  trigger: PriceSyncTrigger
  status: "ok" | "partial" | "failed" | "not_configured"
  added: { model: string; validFrom: string; inputRubPer1k: number; outputRubPer1k: number }[]
  errors: { model: string | null; message: string }[]
  checkedModels: string[]
  unlinkedModels: string[]
}

async function readSetting(key: string): Promise<unknown> {
  const [row] = await db.select({ value: platformSetting.value }).from(platformSetting)
    .where(eq(platformSetting.key, key)).limit(1)
  return row?.value
}

async function writeSetting(key: string, value: unknown, updatedBy: string | null) {
  await db.insert(platformSetting)
    .values({ key, value, updatedAt: new Date(), updatedBy })
    .onConflictDoUpdate({ target: platformSetting.key, set: { value, updatedAt: new Date(), updatedBy } })
}

// ── Markup ──────────────────────────────────────────────────────────────────

export async function getMarkupPercent(): Promise<number> {
  const value = await readSetting(LLM_MARKUP_SETTING_KEY)
  return typeof value === "number" && Number.isFinite(value) ? value : LLM_DEFAULT_MARKUP_PERCENT
}

export async function saveMarkupPercent(value: number, updatedBy: string) {
  await writeSetting(LLM_MARKUP_SETTING_KEY, Math.round(value * 100) / 100, updatedBy)
}

// ── Model ↔ SKU links ───────────────────────────────────────────────────────

// Stored admin overrides: { model: SkuLink | null }; null removes a built-in link.
type StoredSkuMap = Record<string, SkuLink | null>

async function readStoredSkuMap(): Promise<StoredSkuMap> {
  const value = await readSetting(SKU_MAP_SETTING_KEY)
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const out: StoredSkuMap = {}
  for (const [model, link] of Object.entries(value as Record<string, unknown>)) {
    if (link === null) out[model] = null
    else if (
      link && typeof link === "object" &&
      typeof (link as SkuLink).inputSkuId === "string" && typeof (link as SkuLink).outputSkuId === "string"
    ) out[model] = { inputSkuId: (link as SkuLink).inputSkuId, outputSkuId: (link as SkuLink).outputSkuId }
  }
  return out
}

export type ModelSkuLink = SkuLink & { model: string; source: "default" | "admin" }

export async function getEffectiveSkuLinks(): Promise<ModelSkuLink[]> {
  const stored = await readStoredSkuMap()
  const links: ModelSkuLink[] = []
  for (const model of new Set([...Object.keys(DEFAULT_SKU_MAP), ...Object.keys(stored)])) {
    if (Object.hasOwn(stored, model)) {
      const link = stored[model]
      if (link) links.push({ model, ...link, source: "admin" })
    } else {
      links.push({ model, ...DEFAULT_SKU_MAP[model], source: "default" })
    }
  }
  return links.sort((a, b) => a.model.localeCompare(b.model))
}

// link = null → the model is not synced (manual prices stay).
export async function saveSkuLink(model: string, link: SkuLink | null, updatedBy: string) {
  if (link && (!SKU_ID.test(link.inputSkuId) || !SKU_ID.test(link.outputSkuId))) {
    throw new YandexBillingError("Invalid SKU id")
  }
  const stored = await readStoredSkuMap()
  const next: StoredSkuMap = { ...stored }
  if (link === null && !Object.hasOwn(DEFAULT_SKU_MAP, model)) delete next[model]
  else next[model] = link
  await writeSetting(SKU_MAP_SETTING_KEY, next, updatedBy)
}

// Upstream model names the app can call now: enabled models of the current
// AI runtime configuration, without the folder.
export function configuredUpstreamModels(env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  try {
    const config = loadAiConfig(env)
    const names: string[] = []
    for (const [id, model] of Object.entries(config.models)) {
      if (!model.enabled) continue
      const legacyEnv = LEGACY_MODEL_URI_ENV[id]
      const uri = model.uri ?? (legacyEnv ? env[legacyEnv]?.trim() : undefined)
      if (uri) names.push(normalizeUpstreamModel(uri))
    }
    return names
  } catch {
    return []
  }
}

// Models that need a price: configured now + seen in usage (30 days).
async function modelsInUse(): Promise<string[]> {
  const seen = await db.execute<{ model: string }>(sql`
    SELECT DISTINCT model FROM public.llm_usage WHERE created_at >= now() - interval '30 days'
  `)
  return [...new Set([...configuredUpstreamModels(), ...seen.rows.map((r) => r.model)])].sort()
}

// ── Yandex price list (cached) ──────────────────────────────────────────────

let skuCache: { at: number; skus: YandexSku[] } | undefined
const SKU_CACHE_MS = 3600_000

function billingClient() {
  const credentials = readYandexBillingCredentials()
  return credentials ? createYandexBillingClient(credentials) : null
}

async function loadSkus(fresh: boolean): Promise<YandexSku[] | null> {
  if (!fresh && skuCache && Date.now() - skuCache.at < SKU_CACHE_MS) return skuCache.skus
  const client = billingClient()
  if (!client) return null
  const skus = await client.listSkus()
  skuCache = { at: Date.now(), skus }
  return skus
}

export async function listYandexSkuGroups(): Promise<YandexSkuGroup[] | null> {
  const skus = await loadSkus(false)
  return skus ? groupTextGenerationSkus(skus) : null
}

export function isPriceSyncConfigured(): boolean {
  return priceSyncConfigError() === null && readYandexBillingCredentials() !== null
}

// null = OK or not configured; a string = the env values are present but invalid.
export function priceSyncConfigError(): string | null {
  try {
    readYandexBillingCredentials()
    return null
  } catch (error) {
    return safeMessage(error)
  }
}

// ── Sync ────────────────────────────────────────────────────────────────────

export async function getLastPriceSyncRun(): Promise<PriceSyncRun | null> {
  const value = await readSetting(LAST_RUN_SETTING_KEY)
  return value && typeof value === "object" && !Array.isArray(value) ? (value as PriceSyncRun) : null
}

export async function syncLlmPrices(trigger: PriceSyncTrigger): Promise<PriceSyncRun> {
  const run: PriceSyncRun = {
    at: new Date().toISOString(), trigger, status: "ok", added: [], errors: [], checkedModels: [], unlinkedModels: [],
  }
  const links = await getEffectiveSkuLinks()
  const linked = new Set(links.map((l) => l.model))
  run.unlinkedModels = (await modelsInUse()).filter((m) => !linked.has(m))

  let skus: YandexSku[] | null
  try {
    skus = await loadSkus(true)
  } catch (error) {
    skus = null
    run.status = "failed"
    run.errors.push({ model: null, message: safeMessage(error) })
  }
  if (skus === null && run.status !== "failed") run.status = "not_configured"

  if (skus) {
    const skusById = new Map(skus.map((s) => [s.id, s]))
    await db.transaction(async (tx) => {
      const lock = await tx.execute<{ ok: boolean }>(sql`SELECT pg_try_advisory_xact_lock(${SYNC_LOCK_KEY}) AS ok`)
      // Another process is syncing right now: it does the same work, so this
      // run adds nothing and is not an error.
      if (!lock.rows[0]?.ok) return
      for (const link of links) {
        run.checkedModels.push(link.model)
        try {
          const existing = await tx.select().from(llmModelPrice).where(eq(llmModelPrice.model, link.model))
          const rows = planModelPriceRows({
            link,
            skusById,
            existing: existing.map((r): PriceRow => ({
              validFrom: r.validFrom, inputRubPer1k: Number(r.inputRubPer1k), outputRubPer1k: Number(r.outputRubPer1k),
            })),
            now: new Date(),
          })
          for (const row of rows) {
            const inserted = await tx.insert(llmModelPrice).values({
              id: randomUUID(),
              model: link.model,
              inputRubPer1k: row.inputRubPer1k.toFixed(6),
              outputRubPer1k: row.outputRubPer1k.toFixed(6),
              validFrom: row.validFrom,
              createdBy: null,
            }).onConflictDoNothing().returning({ id: llmModelPrice.id })
            if (inserted.length > 0) {
              run.added.push({
                model: link.model, validFrom: row.validFrom.toISOString(),
                inputRubPer1k: row.inputRubPer1k, outputRubPer1k: row.outputRubPer1k,
              })
            }
          }
        } catch (error) {
          run.errors.push({ model: link.model, message: safeMessage(error) })
        }
      }
    })
    if (run.errors.length > 0) run.status = run.errors.length >= Math.max(links.length, 1) ? "failed" : "partial"
  }

  await writeSetting(LAST_RUN_SETTING_KEY, run, null)
  const log = run.status === "ok" ? console.log : console.warn
  log(`[llm-pricing] price sync ${run.status}: ${run.added.length} price(s) added, ${run.errors.length} error(s), ${run.unlinkedModels.length} model(s) without link`)
  return run
}

function safeMessage(error: unknown): string {
  // Billing / IAM errors carry only status codes and Yandex messages; other
  // errors (DB) are reduced to their message.
  return error instanceof Error ? error.message.slice(0, 300) : "unknown error"
}

// Called by the schedule: sync only when the last run is old enough.
export async function syncLlmPricesIfDue(): Promise<void> {
  if (!isPriceSyncConfigured()) return
  const last = await getLastPriceSyncRun()
  const lastAt = last ? Date.parse(last.at) : Number.NaN
  // A failed run is retried at the next check (6 h), not after a day.
  const succeeded = last?.status === "ok" || last?.status === "partial"
  if (succeeded && Number.isFinite(lastAt) && Date.now() - lastAt < SYNC_MAX_AGE_MS) return
  await syncLlmPrices("schedule")
}

// Started once per Node.js process (src/instrumentation.ts).
export function startLlmPriceSyncSchedule() {
  const g = globalThis as unknown as Record<symbol, boolean | undefined>
  const key = Symbol.for("crm.llm.priceSync.started")
  if (g[key]) return
  g[key] = true
  const tick = () => {
    syncLlmPricesIfDue().catch((error) => {
      console.error("[llm-pricing] scheduled price sync failed:", safeMessage(error))
    })
  }
  // First check shortly after start (not during startup), then every 6 h.
  setTimeout(tick, 2 * 60_000).unref()
  setInterval(tick, SYNC_CHECK_INTERVAL_MS).unref()
}
