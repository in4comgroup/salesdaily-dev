// Shared types + helpers for Settings → «Модели». Types mirror
// src/server/admin-llm.ts (kept local: that module is server-only).

export type TopicsMode = "off" | "shadow" | "on"

export type LlmUsageStatRow = {
  day: string
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

export type AdminLlmOrgRow = {
  organizationId: string
  organizationName: string
  topicsMode: TopicsMode
  llmDailyCapRub: number | null
  effectiveCapRub: number
  spentTodayRub: number
  callsToday: number
  refusalsToday: number
  systemUserId: string | null
}

export type AdminLlmSettings = {
  dailyCapRubDefault: number
  builtInDailyCapRub: number
  dayTimeZone: string
  markupPercent: number
  builtInMarkupPercent: number
}

export type LlmPriceRow = {
  id: string
  model: string
  inputRubPer1k: number
  outputRubPer1k: number
  validFrom: string
  createdAt: string
  auto: boolean
}

export type PriceSyncRun = {
  at: string
  trigger: "schedule" | "manual"
  status: "ok" | "partial" | "failed" | "not_configured"
  added: { model: string; validFrom: string; inputRubPer1k: number; outputRubPer1k: number }[]
  errors: { model: string | null; message: string }[]
  checkedModels: string[]
  unlinkedModels: string[]
}

export type ModelSkuLink = {
  model: string
  inputSkuId: string
  outputSkuId: string
  source: "default" | "admin"
}

export type PriceSyncState = {
  configured: boolean
  configError: string | null
  lastRun: PriceSyncRun | null
  links: ModelSkuLink[]
  unlinkedModels: string[]
}

export type YandexSkuGroup = {
  key: string
  modelName: string
  mode: "synchronous" | "asynchronous" | "batch"
  inputSkuId: string
  outputSkuId: string
}

export const SKU_MODE_LABELS: Record<YandexSkuGroup["mode"], string> = {
  synchronous: "синхронный",
  asynchronous: "асинхронный",
  batch: "пакетный",
}

// Client price = our cost × (1 + markup / 100). Display only.
export const withMarkup = (costRub: number, markupPercent: number) => costRub * (1 + markupPercent / 100)

// AI task id (config/ai/*.json) → process name in the UI.
export const TASK_LABELS: Record<string, string> = {
  chat: "ИИ-чат",
  analytics: "Аналитика: ИИ ассистент",
  cards: "Карточки Truffalo",
  deals: "Поиск сделок",
  orderRequest: "Заказ из запроса",
  chatSummary: "Итоги чата",
  companyResearch: "Данные компании: поиск в сети",
  companyExtraction: "Данные компании: извлечение",
  parseText: "Разбор: текст",
  parsePdf: "Разбор: PDF",
  parseImage: "Разбор: изображения",
  parseAudio: "Разбор: аудио",
  parseVideo: "Разбор: видео",
  parseOffice: "Разбор: документы Office",
  orgAttribution: "Разбор: автор сообщения",
  webSearch: "Веб-поиск",
  describeImage: "Описание изображений",
}

export const taskLabel = (task: string) => TASK_LABELS[task] ?? task

// fetch → JSON; throws Error(data.error) on a non-2xx response.
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new Error("Ошибка сети")
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Ошибка запроса (${res.status})`
    throw new Error(message)
  }
  return data as T
}

export function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Неизвестная ошибка"
}

const rubFormat = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const intFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })
const priceFormat = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
})

export const formatRub = (v: number) => rubFormat.format(v)
export const formatInt = (v: number) => intFormat.format(v)
export const formatPrice = (v: number) => priceFormat.format(v)

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// "12,5" / "12.5" → 12.5; "" → null; anything else → NaN.
export function parseDecimal(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, "").replace(",", ".")
  if (s === "") return null
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN
}

// ── «Маршруты ИИ» (src/server/admin-llm-routing.ts) ─────────────────────────

export type AiModelDoc = {
  enabled: boolean
  label: string
  uri?: string
  capabilities: string[]
}

export type AiTaskDoc = {
  enabled: boolean
  defaultModel?: string
  allowedModels: string[]
}

// Configuration document, schema version 2 (src/server/ai/config.ts).
export type AiConfigDoc = {
  version: 2
  features: Record<string, boolean>
  files: { images: "vision" | "native"; maxMediaSeconds: number; pdfMaxPages: number }
  services: Record<string, boolean>
  models: Record<string, AiModelDoc>
  tasks: Record<string, AiTaskDoc>
}

export type AiRoutingState = {
  running: {
    source: "database" | "file" | "disabled"
    versionId: number | null
    lastError: string | null
    checkedAt: string | null
  } | null
  activeVersionId: number | null
  document: AiConfigDoc
  documentSource: "database" | "file" | "disabled"
  versions: { id: number; comment: string | null; createdAt: string; createdByName: string | null; isActive: boolean }[]
  catalog: { tasks: string[]; capabilities: string[]; features: string[]; services: string[] }
  env: {
    apiUrl: string | null
    folderId: string | null
    keys: { name: string; present: boolean }[]
    legacyModelUris: { modelId: string; name: string; present: boolean }[]
  }
}
