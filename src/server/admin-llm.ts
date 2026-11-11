import "server-only"

import { randomUUID } from "node:crypto"
import { asc, desc, eq, sql } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { llmModelPrice, organization, platformSetting } from "@/db/schema"
import { getServerSession } from "@/lib/get-session"
import {
  LLM_DAILY_CAP_SETTING_KEY,
  LLM_DAY_TIME_ZONE,
  LLM_DEFAULT_DAILY_CAP_RUB,
  moscowDayStartSql,
} from "@/server/llm-usage"
import {
  LLM_DEFAULT_MARKUP_PERCENT,
  configuredUpstreamModels,
  getEffectiveSkuLinks,
  getLastPriceSyncRun,
  getMarkupPercent,
  isPriceSyncConfigured,
  listYandexSkuGroups,
  priceSyncConfigError,
  saveMarkupPercent,
  saveSkuLink,
  syncLlmPrices,
  type ModelSkuLink,
  type PriceSyncRun,
} from "@/server/llm-pricing"
import { SKU_ID, YandexBillingError, type YandexSkuGroup } from "@/server/ai/billing"
import {
  ensureOrgSystemActor,
  isTopicsMode,
  updateOrgTopicsSettings,
} from "@/server/topics"
import type { TopicsMode } from "@/db/schema"

// Settings → «Модели» (platform admin only): LLM usage / cost statistics,
// model prices, daily caps, per-org Topics flag. Spec §13–14, plan phase 0.

export class AdminLlmError extends Error {
  constructor(public readonly reason: "unauthorized" | "forbidden" | "invalid" | "not_found", message: string) {
    super(message)
    this.name = "AdminLlmError"
  }
}

export async function requirePlatformAdmin() {
  const session = await getServerSession()
  if (!session) throw new AdminLlmError("unauthorized", "Unauthorized")
  if (session.user.role !== "admin") throw new AdminLlmError("forbidden", "Forbidden")
  return session
}

// ── Statistics ──────────────────────────────────────────────────────────────

export type LlmUsageStatRow = {
  day: string // YYYY-MM-DD, Moscow calendar day
  organizationId: string | null
  organizationName: string | null
  task: string
  model: string
  calls: number
  errors: number
  budgetRefusals: number
  inputTokens: number
  outputTokens: number
  costRub: number
  unpricedCalls: number
  avgLatencyMs: number
  p95LatencyMs: number
}

const MAX_STATS_DAYS = 92

// Rows grouped by (Moscow day, org, task, model) for [from, to). The client
// re-aggregates by any subset of these keys.
export async function getLlmUsageStats(from: Date, to: Date): Promise<LlmUsageStatRow[]> {
  await requirePlatformAdmin()
  if (!(from < to)) throw new AdminLlmError("invalid", "from must be before to")
  if (to.getTime() - from.getTime() > MAX_STATS_DAYS * 86_400_000) {
    throw new AdminLlmError("invalid", `Period is limited to ${MAX_STATS_DAYS} days`)
  }
  const result = await db.execute<{
    day: string; organization_id: string | null; organization_name: string | null
    task: string; model: string; calls: string; errors: string; budget_refusals: string
    input_tokens: string; output_tokens: string; cost_rub: string; unpriced_calls: string
    avg_latency_ms: string | null; p95_latency_ms: string | null
  }>(sql`
    SELECT
      to_char(u.created_at AT TIME ZONE ${LLM_DAY_TIME_ZONE}, 'YYYY-MM-DD') AS day,
      u.organization_id,
      o.name AS organization_name,
      u.task,
      u.model,
      COUNT(*) FILTER (WHERE u.error_class IS DISTINCT FROM 'budget_exceeded') AS calls,
      COUNT(*) FILTER (WHERE NOT u.ok AND u.error_class IS DISTINCT FROM 'budget_exceeded') AS errors,
      COUNT(*) FILTER (WHERE u.error_class = 'budget_exceeded') AS budget_refusals,
      COALESCE(SUM(u.input_tokens), 0) AS input_tokens,
      COALESCE(SUM(u.output_tokens), 0) AS output_tokens,
      COALESCE(SUM(u.cost_rub), 0) AS cost_rub,
      COUNT(*) FILTER (WHERE u.cost_rub IS NULL AND (u.input_tokens IS NOT NULL OR u.output_tokens IS NOT NULL)) AS unpriced_calls,
      AVG(u.latency_ms) FILTER (WHERE u.error_class IS DISTINCT FROM 'budget_exceeded') AS avg_latency_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY u.latency_ms)
        FILTER (WHERE u.error_class IS DISTINCT FROM 'budget_exceeded') AS p95_latency_ms
    FROM public.llm_usage u
    LEFT JOIN public.organization o ON o.id = u.organization_id
    WHERE u.created_at >= ${from.toISOString()}::timestamptz
      AND u.created_at < ${to.toISOString()}::timestamptz
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY 1 DESC, 3 NULLS LAST, 4, 5
  `)
  return result.rows.map((r) => ({
    day: r.day,
    organizationId: r.organization_id,
    organizationName: r.organization_name,
    task: r.task,
    model: r.model,
    calls: Number(r.calls),
    errors: Number(r.errors),
    budgetRefusals: Number(r.budget_refusals),
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    costRub: Number(r.cost_rub),
    unpricedCalls: Number(r.unpriced_calls),
    avgLatencyMs: Math.round(Number(r.avg_latency_ms ?? 0)),
    p95LatencyMs: Math.round(Number(r.p95_latency_ms ?? 0)),
  }))
}

// ── Platform default cap ────────────────────────────────────────────────────

export async function getPlatformDailyCapRub(): Promise<number> {
  const [row] = await db
    .select({ value: platformSetting.value })
    .from(platformSetting)
    .where(eq(platformSetting.key, LLM_DAILY_CAP_SETTING_KEY))
    .limit(1)
  return typeof row?.value === "number" ? row.value : LLM_DEFAULT_DAILY_CAP_RUB
}

export async function getAdminLlmSettings() {
  await requirePlatformAdmin()
  return {
    dailyCapRubDefault: await getPlatformDailyCapRub(),
    builtInDailyCapRub: LLM_DEFAULT_DAILY_CAP_RUB,
    dayTimeZone: LLM_DAY_TIME_ZONE,
    markupPercent: await getMarkupPercent(),
    builtInMarkupPercent: LLM_DEFAULT_MARKUP_PERCENT,
  }
}

// Client price = our cost × (1 + markup / 100). Display only: the daily cap
// is always counted from our cost.
export async function setMarkupPercent(value: number) {
  const session = await requirePlatformAdmin()
  if (!Number.isFinite(value) || value < 0 || value > 1000) {
    throw new AdminLlmError("invalid", "Markup must be a number from 0 to 1000 %")
  }
  await saveMarkupPercent(value, session.user.id)
}

export async function setPlatformDailyCapRub(value: number) {
  const session = await requirePlatformAdmin()
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
    throw new AdminLlmError("invalid", "Cap must be a number from 0 to 1 000 000")
  }
  const rounded = Math.round(value * 100) / 100
  await db
    .insert(platformSetting)
    .values({ key: LLM_DAILY_CAP_SETTING_KEY, value: rounded, updatedBy: session.user.id })
    .onConflictDoUpdate({
      target: platformSetting.key,
      set: { value: rounded, updatedAt: sql`now()`, updatedBy: session.user.id },
    })
}

// ── Per-org: Topics flag + cap ──────────────────────────────────────────────

export type AdminLlmOrgRow = {
  organizationId: string
  organizationName: string
  topicsMode: TopicsMode
  llmDailyCapRub: number | null // override; null = platform default
  effectiveCapRub: number
  spentTodayRub: number
  callsToday: number
  refusalsToday: number
  systemUserId: string | null
}

export async function listAdminLlmOrgs(): Promise<AdminLlmOrgRow[]> {
  await requirePlatformAdmin()
  const platformCap = await getPlatformDailyCapRub()
  const result = await db.execute<{
    id: string; name: string; topics_mode: TopicsMode | null; llm_daily_cap_rub: string | null
    system_user_id: string | null; spent_today: string; calls_today: string; refusals_today: string
  }>(sql`
    SELECT
      o.id, o.name,
      s.topics_mode, s.llm_daily_cap_rub, s.system_user_id,
      COALESCE(t.spent_today, 0) AS spent_today,
      COALESCE(t.calls_today, 0) AS calls_today,
      COALESCE(t.refusals_today, 0) AS refusals_today
    FROM public.organization o
    LEFT JOIN public.organization_settings s ON s.organization_id = o.id
    LEFT JOIN (
      SELECT
        organization_id,
        SUM(cost_rub) AS spent_today,
        COUNT(*) FILTER (WHERE error_class IS DISTINCT FROM 'budget_exceeded') AS calls_today,
        COUNT(*) FILTER (WHERE error_class = 'budget_exceeded') AS refusals_today
      FROM public.llm_usage
      WHERE created_at >= ${moscowDayStartSql}
      GROUP BY organization_id
    ) t ON t.organization_id = o.id
    ORDER BY o.name
  `)
  return result.rows.map((r) => {
    const override = r.llm_daily_cap_rub == null ? null : Number(r.llm_daily_cap_rub)
    return {
      organizationId: r.id,
      organizationName: r.name,
      topicsMode: r.topics_mode ?? "off",
      llmDailyCapRub: override,
      effectiveCapRub: override ?? platformCap,
      spentTodayRub: Number(r.spent_today),
      callsToday: Number(r.calls_today),
      refusalsToday: Number(r.refusals_today),
      systemUserId: r.system_user_id,
    }
  })
}

export async function updateAdminLlmOrg(input: {
  organizationId: string
  topicsMode?: unknown
  llmDailyCapRub?: unknown
}): Promise<void> {
  const session = await requirePlatformAdmin()
  const [org] = await db
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, input.organizationId))
    .limit(1)
  if (!org) throw new AdminLlmError("not_found", "Organization not found")

  const patch: { topicsMode?: TopicsMode; llmDailyCapRub?: number | null } = {}
  if (input.topicsMode !== undefined) {
    if (!isTopicsMode(input.topicsMode)) throw new AdminLlmError("invalid", "Invalid topics mode")
    patch.topicsMode = input.topicsMode
  }
  if (input.llmDailyCapRub !== undefined) {
    const v = input.llmDailyCapRub
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1_000_000)) {
      throw new AdminLlmError("invalid", "Cap must be null or a number from 0 to 1 000 000")
    }
    patch.llmDailyCapRub = v as number | null
  }
  await updateOrgTopicsSettings(input.organizationId, patch, session.user.id)
  // The engine writes as «Агент Truffalo» as soon as it runs (shadow / on).
  if (patch.topicsMode && patch.topicsMode !== "off") await ensureOrgSystemActor(input.organizationId)
}

// ── Model prices ────────────────────────────────────────────────────────────

export type LlmPriceRow = {
  id: string
  model: string
  inputRubPer1k: number
  outputRubPer1k: number
  validFrom: string
  createdAt: string
  // true = added by the Yandex price sync (created_by IS NULL).
  auto: boolean
}

export async function listLlmPrices(): Promise<{ prices: LlmPriceRow[]; knownModels: string[] }> {
  await requirePlatformAdmin()
  const rows = await db
    .select()
    .from(llmModelPrice)
    .orderBy(asc(llmModelPrice.model), desc(llmModelPrice.validFrom))
  // Models seen in usage (last 92 days) + priced models — for the picker.
  const seen = await db.execute<{ model: string }>(sql`
    SELECT DISTINCT model FROM public.llm_usage
    WHERE created_at >= now() - interval '92 days'
  `)
  const knownModels = [...new Set([...seen.rows.map((r) => r.model), ...rows.map((r) => r.model)])].sort()
  return {
    prices: rows.map((r) => ({
      id: r.id,
      model: r.model,
      inputRubPer1k: Number(r.inputRubPer1k),
      outputRubPer1k: Number(r.outputRubPer1k),
      validFrom: r.validFrom.toISOString(),
      createdAt: r.createdAt.toISOString(),
      auto: r.createdBy === null,
    })),
    knownModels,
  }
}

const MODEL_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._/:-]{0,199}$/

// Cost is computed when a call is recorded, so a new price affects only calls
// from `validFrom` on; past rows keep their cost.
export async function addLlmPrice(input: {
  model: unknown
  inputRubPer1k: unknown
  outputRubPer1k: unknown
  validFrom?: unknown
}) {
  const session = await requirePlatformAdmin()
  const model = typeof input.model === "string" ? input.model.trim() : ""
  if (!MODEL_NAME.test(model) || model.startsWith("gpt:")) {
    throw new AdminLlmError("invalid", "Model name: e.g. yandexgpt/latest (without gpt://folder/)")
  }
  const price = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100_000 ? v : null
  const inputPrice = price(input.inputRubPer1k)
  const outputPrice = price(input.outputRubPer1k)
  if (inputPrice === null || outputPrice === null) {
    throw new AdminLlmError("invalid", "Prices must be numbers from 0 to 100 000 RUB per 1k tokens")
  }
  let validFrom = new Date()
  if (input.validFrom !== undefined && input.validFrom !== null && input.validFrom !== "") {
    validFrom = new Date(String(input.validFrom))
    if (Number.isNaN(validFrom.getTime())) throw new AdminLlmError("invalid", "Invalid validFrom")
  }
  try {
    await db.insert(llmModelPrice).values({
      id: randomUUID(),
      model,
      inputRubPer1k: inputPrice.toFixed(6),
      outputRubPer1k: outputPrice.toFixed(6),
      validFrom,
      createdBy: session.user.id,
    })
  } catch (error) {
    if ((error as { code?: string })?.code === "23505" || (error as { cause?: { code?: string } })?.cause?.code === "23505") {
      throw new AdminLlmError("invalid", "A price for this model with the same start time exists")
    }
    throw error
  }
}

export async function deleteLlmPrice(id: string) {
  await requirePlatformAdmin()
  const deleted = await db.delete(llmModelPrice).where(eq(llmModelPrice.id, id)).returning({ id: llmModelPrice.id })
  if (deleted.length === 0) throw new AdminLlmError("not_found", "Price not found")
}

// ── Yandex price sync ───────────────────────────────────────────────────────

export type PriceSyncState = {
  configured: boolean
  configError: string | null
  lastRun: PriceSyncRun | null
  links: ModelSkuLink[]
  // Models in use (config + last 92 days of usage) without a link.
  unlinkedModels: string[]
}

export async function getPriceSyncState(): Promise<PriceSyncState> {
  await requirePlatformAdmin()
  const links = await getEffectiveSkuLinks()
  const linked = new Set(links.map((l) => l.model))
  const seen = await db.execute<{ model: string }>(sql`
    SELECT DISTINCT model FROM public.llm_usage WHERE created_at >= now() - interval '92 days'
  `)
  const inUse = new Set([...configuredUpstreamModels(), ...seen.rows.map((r) => r.model)])
  return {
    configured: isPriceSyncConfigured(),
    configError: priceSyncConfigError(),
    lastRun: await getLastPriceSyncRun(),
    links,
    unlinkedModels: [...inUse].filter((m) => !linked.has(m)).sort(),
  }
}

export async function runPriceSyncNow(): Promise<PriceSyncRun> {
  await requirePlatformAdmin()
  return syncLlmPrices("manual")
}

// null when the Billing API is not configured.
export async function getYandexSkuGroups(): Promise<YandexSkuGroup[] | null> {
  await requirePlatformAdmin()
  try {
    return await listYandexSkuGroups()
  } catch (error) {
    if (error instanceof YandexBillingError) throw new AdminLlmError("invalid", error.message)
    throw error
  }
}

// inputSkuId / outputSkuId = null → stop syncing this model.
export async function setModelSkuLink(input: { model: unknown; inputSkuId: unknown; outputSkuId: unknown }) {
  const session = await requirePlatformAdmin()
  const model = typeof input.model === "string" ? input.model.trim() : ""
  if (!MODEL_NAME.test(model) || model.startsWith("gpt:")) {
    throw new AdminLlmError("invalid", "Model name: e.g. yandexgpt/latest (without gpt://folder/)")
  }
  if (input.inputSkuId === null && input.outputSkuId === null) {
    await saveSkuLink(model, null, session.user.id)
    return
  }
  const inputSkuId = typeof input.inputSkuId === "string" ? input.inputSkuId : ""
  const outputSkuId = typeof input.outputSkuId === "string" ? input.outputSkuId : ""
  if (!SKU_ID.test(inputSkuId) || !SKU_ID.test(outputSkuId)) {
    throw new AdminLlmError("invalid", "Invalid SKU id")
  }
  await saveSkuLink(model, { inputSkuId, outputSkuId }, session.user.id)
}
