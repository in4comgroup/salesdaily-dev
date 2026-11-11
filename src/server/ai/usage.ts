import "server-only"

import { AsyncLocalStorage } from "node:async_hooks"
import { wrapLanguageModel, type LanguageModel } from "ai"
import { AiPolicyError } from "./policy"
import { AiProviderError } from "./errors"

// LLM usage metering + daily cost cap (Topics phase 0, spec §13 / Q18).
//
// Every model returned by `runtime.resolve()` is wrapped with a middleware that
//   1. refuses the call when the org's daily cost cap is reached, and
//   2. records one `llm_usage` row per call (tokens, latency, result; never the
//      prompt or the output text).
//
// This module has no database import: the DB sink lives in
// src/server/llm-usage.ts and is registered at Node.js startup
// (src/instrumentation.ts). Without a registered sink (CLI tools, tests) the
// model is returned unwrapped and nothing is metered.
//
// The org / source item come from `resolve({ organizationId, sourceItemId })`
// or, when the caller does not pass them, from the async context set with
// `withAiUsageContext()` at the entry point (parse, cards, deals, ...). The
// context is captured at resolve time, so streams consumed later still record
// against the right org.

export type AiUsageContext = {
  organizationId?: string | null
  sourceItemId?: string | null
}

export type AiUsageEvent = {
  organizationId: string | null
  sourceItemId: string | null
  task: string
  modelId: string
  model: string
  operation: "generate" | "stream"
  inputTokens: number | null
  outputTokens: number | null
  latencyMs: number
  ok: boolean
  errorClass: string | null
}

export interface AiUsageSink {
  // Throws AiBudgetError when the org's cap for today is reached. The sink
  // records the refused call itself.
  assertWithinBudget(event: Omit<AiUsageEvent, "inputTokens" | "outputTokens" | "latencyMs" | "ok" | "errorClass">): Promise<void>
  record(event: AiUsageEvent): Promise<void>
}

export class AiBudgetError extends AiPolicyError {
  constructor() {
    super("Дневной лимит расходов на ИИ для организации исчерпан. Попробуйте завтра или обратитесь к администратору.")
    this.name = "AiBudgetError"
  }
}

// Kept on globalThis: Next.js can load this module more than once (the
// instrumentation bundle and the route bundles), but there must be exactly one
// sink and one async context per process.
const KEY = Symbol.for("crm.ai.usage")
type Store = { als: AsyncLocalStorage<AiUsageContext>; sink?: AiUsageSink }
function store(): Store {
  const g = globalThis as unknown as Record<symbol, Store | undefined>
  return (g[KEY] ??= { als: new AsyncLocalStorage<AiUsageContext>() })
}

export function registerAiUsageSink(sink: AiUsageSink | undefined) {
  store().sink = sink
}

export function getAiUsageSink(): AiUsageSink | undefined {
  return store().sink
}

// Run `fn` with org / item attribution for every model resolved inside it.
// Nested calls merge: an inner sourceItemId keeps the outer organizationId.
export function withAiUsageContext<T>(context: AiUsageContext, fn: () => T): T {
  const parent = store().als.getStore()
  return store().als.run({ ...parent, ...context }, fn)
}

export function currentAiUsageContext(): AiUsageContext {
  return { ...store().als.getStore() }
}

// Upstream id without the Yandex folder: `gpt://<folder>/yandexgpt/latest` →
// `yandexgpt/latest`. Other ids (old `google/gemini-…` rows) stay as they are. This is
// the key of `llm_model_price`.
export function normalizeUpstreamModel(upstreamModelId: string): string {
  return upstreamModelId.replace(/^gpt:\/\/[^/]+\//, "")
}

export function classifyAiError(error: unknown): string {
  if (error instanceof AiBudgetError) return "budget_exceeded"
  if (error instanceof AiProviderError) {
    return error.statusCode ? `http_${error.statusCode}` : error.kind
  }
  if (error instanceof AiPolicyError) return "policy"
  if (error && typeof error === "object" && "name" in error) {
    const name = String((error as { name: unknown }).name)
    if (name === "AbortError" || name === "TimeoutError") return "aborted"
    if (/^[A-Za-z_]{1,64}$/.test(name)) return name
  }
  return "unknown"
}

type TokenCounts = { inputTokens: number | null; outputTokens: number | null }
function tokens(usage: unknown): TokenCounts {
  const u = usage as { inputTokens?: { total?: number }; outputTokens?: { total?: number } } | undefined
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null)
  return { inputTokens: n(u?.inputTokens?.total), outputTokens: n(u?.outputTokens?.total) }
}

function safeRecord(sink: AiUsageSink, event: AiUsageEvent) {
  // Metering must never break or delay the model call.
  sink.record(event).catch((error) => {
    console.error("[ai/usage] failed to record usage:", error instanceof Error ? error.message : "unknown")
  })
}

type WrappableModel = Parameters<typeof wrapLanguageModel>[0]["model"]

export function meterModel(
  model: Exclude<LanguageModel, string>,
  route: { task: string; modelId: string; upstreamModelId: string },
  explicit: AiUsageContext = {},
): Exclude<LanguageModel, string> {
  const sink = getAiUsageSink()
  if (!sink) return model

  const context = currentAiUsageContext()
  const base = {
    organizationId: (explicit.organizationId !== undefined ? explicit.organizationId : context.organizationId) ?? null,
    sourceItemId: (explicit.sourceItemId !== undefined ? explicit.sourceItemId : context.sourceItemId) ?? null,
    task: route.task,
    modelId: route.modelId,
    model: normalizeUpstreamModel(route.upstreamModelId),
  }

  // Both adapters return spec-v3 models (Yandex via wrapLanguageModel, the
  // Gateway natively). A v2 model would be a configuration bug: fail closed.
  if (model.specificationVersion !== "v3") {
    throw new AiPolicyError("AI model does not support usage metering")
  }
  return wrapLanguageModel({
    model: model as WrappableModel,
    middleware: {
      specificationVersion: "v3",
      wrapGenerate: async ({ doGenerate }) => {
        await sink.assertWithinBudget({ ...base, operation: "generate" })
        const started = Date.now()
        try {
          const result = await doGenerate()
          safeRecord(sink, {
            ...base, operation: "generate", ...tokens(result.usage),
            latencyMs: Date.now() - started, ok: true, errorClass: null,
          })
          return result
        } catch (error) {
          safeRecord(sink, {
            ...base, operation: "generate", inputTokens: null, outputTokens: null,
            latencyMs: Date.now() - started, ok: false, errorClass: classifyAiError(error),
          })
          throw error
        }
      },
      wrapStream: async ({ doStream }) => {
        await sink.assertWithinBudget({ ...base, operation: "stream" })
        const started = Date.now()
        let result: Awaited<ReturnType<typeof doStream>>
        try {
          result = await doStream()
        } catch (error) {
          safeRecord(sink, {
            ...base, operation: "stream", inputTokens: null, outputTokens: null,
            latencyMs: Date.now() - started, ok: false, errorClass: classifyAiError(error),
          })
          throw error
        }
        let recorded = false
        let failure: unknown
        const finish = (counts: TokenCounts) => {
          if (recorded) return
          recorded = true
          safeRecord(sink, {
            ...base, operation: "stream", ...counts, latencyMs: Date.now() - started,
            ok: failure === undefined, errorClass: failure === undefined ? null : classifyAiError(failure),
          })
        }
        return {
          ...result,
          stream: result.stream.pipeThrough(new TransformStream({
            transform(chunk, controller) {
              if (chunk.type === "error") failure ??= chunk.error
              // `finish` is the last chunk and carries the final usage.
              if (chunk.type === "finish") finish(tokens(chunk.usage))
              controller.enqueue(chunk)
            },
            flush() {
              finish({ inputTokens: null, outputTokens: null })
            },
          })),
        }
      },
    },
  })
}
