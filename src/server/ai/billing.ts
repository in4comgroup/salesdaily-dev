import "server-only"

import { createSign, constants as cryptoConstants } from "node:crypto"

// Yandex Cloud Billing API client + price planning for `llm_model_price`
// (Topics phase 0). No database code here: the DB side is
// src/server/llm-pricing.ts. Pure parts are covered by tools/ai/runtime.test.ts.
//
// Auth: the Billing API does NOT accept `Api-Key`. It needs an IAM token,
// which we get from a service-account authorized key (JSON with a private
// key) via a PS256 JWT exchange. The service account needs the role
// `billing.accounts.viewer` on the billing account.
//
// Env:
//   YANDEX_BILLING_SA_KEY      authorized key JSON, raw or base64-encoded
//   YANDEX_BILLING_ACCOUNT_ID  billing account id (contract prices, if any)

const IAM_URL = "https://iam.api.cloud.yandex.net/iam/v1/tokens"
const BILLING_URL = "https://billing.api.cloud.yandex.net/billing/v1"
const TIMEOUT_MS = 20_000

// Service «Yandex AI Studio» (text generation SKUs).
export const YANDEX_AI_STUDIO_SERVICE_ID = "dn2o984h40l32p7t5nsv"

export class YandexBillingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "YandexBillingError"
  }
}

// ── Credentials ─────────────────────────────────────────────────────────────

export type YandexServiceAccountKey = {
  id: string
  serviceAccountId: string
  privateKey: string
}

export type YandexBillingCredentials = {
  key: YandexServiceAccountKey
  billingAccountId: string
}

// null = not configured. Throws YandexBillingError when a value is present but
// invalid. Messages never contain the values.
export function readYandexBillingCredentials(
  env: Readonly<Record<string, string | undefined>> = process.env,
): YandexBillingCredentials | null {
  const rawKey = env.YANDEX_BILLING_SA_KEY?.trim()
  const billingAccountId = env.YANDEX_BILLING_ACCOUNT_ID?.trim()
  if (!rawKey && !billingAccountId) return null
  if (!rawKey || !billingAccountId) {
    throw new YandexBillingError("YANDEX_BILLING_SA_KEY and YANDEX_BILLING_ACCOUNT_ID must both be set")
  }
  if (!/^[a-z0-9]{20}$/.test(billingAccountId)) {
    throw new YandexBillingError("YANDEX_BILLING_ACCOUNT_ID has an unexpected format")
  }
  return { key: parseServiceAccountKey(rawKey), billingAccountId }
}

export function parseServiceAccountKey(raw: string): YandexServiceAccountKey {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    try {
      parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8"))
    } catch {
      parsed = undefined
    }
  }
  const o = parsed as { id?: unknown; service_account_id?: unknown; private_key?: unknown } | undefined
  if (!o || typeof o.id !== "string" || typeof o.service_account_id !== "string" || typeof o.private_key !== "string") {
    throw new YandexBillingError("YANDEX_BILLING_SA_KEY is not an authorized key JSON (raw or base64)")
  }
  // Yandex prepends a "PLEASE DO NOT REMOVE THIS LINE!" line to the PEM.
  const begin = o.private_key.indexOf("-----BEGIN")
  if (begin < 0) throw new YandexBillingError("YANDEX_BILLING_SA_KEY has no PEM private key")
  return { id: o.id, serviceAccountId: o.service_account_id, privateKey: o.private_key.slice(begin) }
}

export function createIamJwt(key: YandexServiceAccountKey, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const b64u = (v: string | Buffer) => Buffer.from(v).toString("base64url")
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "PS256", kid: key.id }))
  const body = b64u(JSON.stringify({ aud: IAM_URL, iss: key.serviceAccountId, iat: nowSeconds, exp: nowSeconds + 3600 }))
  const signer = createSign("RSA-SHA256")
  signer.update(`${head}.${body}`)
  const sig = signer.sign({ key: key.privateKey, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: 32 })
  return `${head}.${body}.${b64u(sig)}`
}

// ── API client ──────────────────────────────────────────────────────────────

export type YandexSkuRate = { startPricingQuantity?: string; unitPrice?: string; currency?: string }
export type YandexSkuPricingVersion = {
  type?: string
  effectiveTime?: string
  pricingExpressions?: { rates?: YandexSkuRate[] }[]
}
export type YandexSku = {
  id: string
  name: string
  serviceId?: string
  pricingUnit?: string
  pricingVersions?: YandexSkuPricingVersion[]
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "")
  let message = ""
  try {
    message = String((JSON.parse(text) as { message?: unknown }).message ?? "")
  } catch {
    message = ""
  }
  return `HTTP ${res.status}${message ? `: ${message.slice(0, 200)}` : ""}`
}

export function createYandexBillingClient(
  credentials: YandexBillingCredentials,
  fetchImplementation: typeof fetch = fetch,
) {
  let token: { value: string; expiresAt: number } | undefined

  async function iamToken(): Promise<string> {
    if (token && token.expiresAt - Date.now() > 5 * 60_000) return token.value
    const res = await fetchImplementation(IAM_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jwt: createIamJwt(credentials.key) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new YandexBillingError(`IAM token exchange failed: ${await readError(res)}`)
    const data = (await res.json()) as { iamToken?: unknown; expiresAt?: unknown }
    if (typeof data.iamToken !== "string") throw new YandexBillingError("IAM token exchange returned no token")
    const expiresAt = typeof data.expiresAt === "string" ? Date.parse(data.expiresAt) : Number.NaN
    token = { value: data.iamToken, expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 3600_000 }
    return token.value
  }

  async function get<T>(path: string): Promise<T> {
    const res = await fetchImplementation(`${BILLING_URL}${path}`, {
      headers: { Authorization: `Bearer ${await iamToken()}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new YandexBillingError(`Billing API ${path.split("?")[0]} failed: ${await readError(res)}`)
    return (await res.json()) as T
  }

  return {
    // All SKUs of one service with RUB prices for our billing account.
    async listSkus(serviceId: string = YANDEX_AI_STUDIO_SERVICE_ID): Promise<YandexSku[]> {
      const all: YandexSku[] = []
      let pageToken = ""
      for (let page = 0; page < 20; page++) {
        const query = new URLSearchParams({
          currency: "RUB",
          billingAccountId: credentials.billingAccountId,
          pageSize: "1000",
          filter: `serviceId="${serviceId}"`,
        })
        if (pageToken) query.set("pageToken", pageToken)
        const data = await get<{ skus?: YandexSku[]; nextPageToken?: string }>(`/skus?${query}`)
        all.push(...(data.skus ?? []))
        pageToken = data.nextPageToken ?? ""
        if (!pageToken) break
      }
      return all
    },
  }
}

// ── SKU → model groups (for the link picker) ────────────────────────────────

// "Text generation, YandexGPT Pro 5.1 model, input tokens, synchronous mode"
const TEXT_SKU = /^Text generation, (.+?) model, (input|output|cached|tool) tokens, (synchronous|asynchronous|batch) mode$/i

export type YandexSkuGroup = {
  key: string // `${modelName}|${mode}`
  modelName: string
  mode: "synchronous" | "asynchronous" | "batch"
  inputSkuId: string
  outputSkuId: string
}

export function groupTextGenerationSkus(skus: YandexSku[]): YandexSkuGroup[] {
  const map = new Map<string, { modelName: string; mode: string; input?: string; output?: string }>()
  for (const sku of skus) {
    const m = TEXT_SKU.exec(sku.name ?? "")
    if (!m) continue
    const [, modelName, kind, mode] = m
    const key = `${modelName}|${mode.toLowerCase()}`
    const g = map.get(key) ?? { modelName, mode: mode.toLowerCase() }
    if (kind.toLowerCase() === "input") g.input = sku.id
    if (kind.toLowerCase() === "output") g.output = sku.id
    map.set(key, g)
  }
  const groups: YandexSkuGroup[] = []
  for (const [key, g] of map) {
    if (!g.input || !g.output) continue
    groups.push({ key, modelName: g.modelName, mode: g.mode as YandexSkuGroup["mode"], inputSkuId: g.input, outputSkuId: g.output })
  }
  return groups.sort((a, b) => a.modelName.localeCompare(b.modelName) || a.mode.localeCompare(b.mode))
}

// ── Model ↔ SKU links ───────────────────────────────────────────────────────

export type SkuLink = { inputSkuId: string; outputSkuId: string }
export type SkuMap = Record<string, SkuLink>

// Built-in links for the models we use (synchronous mode). The key is the
// upstream model name without `gpt://<folder>/` (= llm_usage.model). Admin
// links in Settings → «Модели» override these.
export const DEFAULT_SKU_MAP: SkuMap = {
  // YandexGPT Pro 5.1
  "yandexgpt-5.1": { inputSkuId: "dn2jy5nvkpdkmwfvm6kj", outputSkuId: "dn2i63wvctocj7l4opc3" },
  // Qwen 3.6 35B
  "qwen3.6-35b-a3b": { inputSkuId: "dn2nquxmbxtd3ejvdzdc", outputSkuId: "dn2ym3cefutnlwkd52wl" },
}

export const SKU_ID = /^[a-z0-9]{20}$/

// ── Prices ──────────────────────────────────────────────────────────────────

// RUB per 1 000 tokens for one unit price.
export function unitFactorPer1k(pricingUnit: string | undefined): number | null {
  switch ((pricingUnit ?? "").replace(/\s/g, "").toLowerCase()) {
    case "1k*token": return 1
    case "token": return 1000
    case "1m*token": return 0.001
    default: return null
  }
}

export type PricePoint = { at: number; per1k: number }

// Price history of one SKU in RUB per 1k tokens, oldest first. A contract
// price, when the account has one, wins over the public (street) price. The
// base tier (lowest startPricingQuantity) is used.
export function skuPricePoints(sku: YandexSku): PricePoint[] {
  const factor = unitFactorPer1k(sku.pricingUnit)
  if (factor === null) {
    throw new YandexBillingError(`SKU ${sku.id}: unsupported pricing unit "${sku.pricingUnit ?? ""}"`)
  }
  const versions = sku.pricingVersions ?? []
  const contract = versions.filter((v) => v.type && v.type !== "STREET_PRICE")
  const chosen = contract.length > 0 ? contract : versions
  const points: PricePoint[] = []
  for (const v of chosen) {
    const at = Date.parse(v.effectiveTime ?? "")
    const rates = (v.pricingExpressions?.[0]?.rates ?? []).filter((r) => (r.currency ?? "RUB") === "RUB")
    rates.sort((a, b) => Number(a.startPricingQuantity ?? 0) - Number(b.startPricingQuantity ?? 0))
    const price = Number(rates[0]?.unitPrice)
    if (!Number.isFinite(at) || !Number.isFinite(price) || price < 0) continue
    points.push({ at, per1k: round6(price * factor) })
  }
  return points.sort((a, b) => a.at - b.at)
}

export function priceAt(points: PricePoint[], at: number): number | undefined {
  let result: number | undefined
  for (const p of points) {
    if (p.at <= at) result = p.per1k
    else break
  }
  return result
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6

export type PriceRow = { validFrom: Date; inputRubPer1k: number; outputRubPer1k: number }

// Rows to insert into `llm_model_price` for one model, so that the price
// valid now and every announced future change match Yandex. A row is added
// only when the price differs from the row already valid at that moment.
export function planModelPriceRows(input: {
  link: SkuLink
  skusById: ReadonlyMap<string, YandexSku>
  existing: readonly PriceRow[]
  now: Date
}): PriceRow[] {
  const inSku = input.skusById.get(input.link.inputSkuId)
  const outSku = input.skusById.get(input.link.outputSkuId)
  if (!inSku) throw new YandexBillingError(`SKU ${input.link.inputSkuId} not found in the price list`)
  if (!outSku) throw new YandexBillingError(`SKU ${input.link.outputSkuId} not found in the price list`)
  const inPoints = skuPricePoints(inSku)
  const outPoints = skuPricePoints(outSku)

  const now = input.now.getTime()
  const times = [...new Set([now, ...[...inPoints, ...outPoints].map((p) => p.at).filter((t) => t > now)])].sort((a, b) => a - b)
  const rows: PriceRow[] = [...input.existing].sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime())
  const planned: PriceRow[] = []
  for (const t of times) {
    const inPrice = priceAt(inPoints, t)
    const outPrice = priceAt(outPoints, t)
    if (inPrice === undefined || outPrice === undefined) continue
    if (t !== now && rows.some((r) => r.validFrom.getTime() === t)) continue
    let current: PriceRow | undefined
    for (const r of rows) if (r.validFrom.getTime() <= t) current = r
    if (current && round6(current.inputRubPer1k) === inPrice && round6(current.outputRubPer1k) === outPrice) continue
    const row = { validFrom: new Date(t), inputRubPer1k: inPrice, outputRubPer1k: outPrice }
    planned.push(row)
    rows.push(row)
    rows.sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime())
  }
  return planned
}
