import "server-only"

import { sql } from "drizzle-orm"
import { db } from "@/db/drizzle"
import {
  AiBudgetError,
  registerAiUsageSink,
  type AiUsageEvent,
  type AiUsageSink,
} from "@/server/ai/usage"

// DB side of LLM metering (Topics phase 0, spec §13 / Q18). The middleware in
// src/server/ai/usage.ts calls this sink for every model call.
//
// Cost = tokens × the `llm_model_price` row valid at call time (RUB per 1k
// tokens). No price row → cost_rub NULL (shown as «нет цены» in «Модели»;
// such calls do not count toward the cap).
//
// Daily cap: org override (`organization_settings.llm_daily_cap_rub`), else
// platform default (`platform_setting` key `llm.dailyCapRub`), else 500 ₽.
// The day is the Moscow calendar day.

export const LLM_DEFAULT_DAILY_CAP_RUB = 500
export const LLM_DAILY_CAP_SETTING_KEY = "llm.dailyCapRub"
export const LLM_DAY_TIME_ZONE = "Europe/Moscow"

// Start of the current Moscow day as timestamptz (SQL fragment).
export const moscowDayStartSql = sql.raw(
  `(date_trunc('day', now() AT TIME ZONE '${LLM_DAY_TIME_ZONE}') AT TIME ZONE '${LLM_DAY_TIME_ZONE}')`,
)

export type OrgBudgetState = {
  capRub: number
  spentRub: number
  exceeded: boolean
}

export async function getOrgBudgetState(organizationId: string): Promise<OrgBudgetState> {
  const result = await db.execute<{ cap_rub: string; spent_rub: string }>(sql`
    SELECT
      COALESCE(
        (SELECT s.llm_daily_cap_rub FROM public.organization_settings s
          WHERE s.organization_id = ${organizationId}),
        (SELECT (p.value #>> '{}')::numeric FROM public.platform_setting p
          WHERE p.key = ${LLM_DAILY_CAP_SETTING_KEY}
            AND jsonb_typeof(p.value) = 'number'),
        ${LLM_DEFAULT_DAILY_CAP_RUB}::numeric
      ) AS cap_rub,
      (SELECT COALESCE(SUM(u.cost_rub), 0) FROM public.llm_usage u
        WHERE u.organization_id = ${organizationId}
          AND u.created_at >= ${moscowDayStartSql}) AS spent_rub
  `)
  const row = result.rows[0]
  const capRub = Number(row?.cap_rub ?? LLM_DEFAULT_DAILY_CAP_RUB)
  const spentRub = Number(row?.spent_rub ?? 0)
  return { capRub, spentRub, exceeded: spentRub >= capRub }
}

// For batch loops (parse): skip LLM work for an org that is over its cap,
// instead of failing items. DB errors → not exceeded (fail open).
export async function isOrgOverDailyLlmBudget(organizationId: string | null | undefined): Promise<boolean> {
  if (!organizationId) return false
  try {
    return (await getOrgBudgetState(organizationId)).exceeded
  } catch (error) {
    console.error("[llm-usage] budget check failed:", error instanceof Error ? error.message : "unknown")
    return false
  }
}

export async function recordLlmUsage(event: AiUsageEvent): Promise<void> {
  const input = event.inputTokens
  const output = event.outputTokens
  await db.execute(sql`
    INSERT INTO public.llm_usage (
      organization_id, task, model_id, model, operation,
      input_tokens, output_tokens, cost_rub, latency_ms, ok, error_class, source_item_id
    )
    SELECT
      ${event.organizationId}, ${event.task}, ${event.modelId}, ${event.model}, ${event.operation},
      ${input}::integer, ${output}::integer,
      CASE WHEN ${input}::integer IS NULL AND ${output}::integer IS NULL THEN NULL ELSE (
        SELECT (COALESCE(${input}::integer, 0) * p.input_rub_per_1k
              + COALESCE(${output}::integer, 0) * p.output_rub_per_1k) / 1000
        FROM public.llm_model_price p
        WHERE p.model = ${event.model} AND p.valid_from <= now()
        ORDER BY p.valid_from DESC
        LIMIT 1
      ) END,
      ${Math.max(0, Math.round(event.latencyMs))}::integer, ${event.ok}, ${event.errorClass},
      ${event.sourceItemId}
  `)
}

export function createDbUsageSink(): AiUsageSink {
  return {
    async assertWithinBudget(event) {
      if (!event.organizationId) return
      let exceeded = false
      try {
        exceeded = (await getOrgBudgetState(event.organizationId)).exceeded
      } catch (error) {
        // The cap is a cost guard, not a security control: a DB blip must not
        // stop AI features. Fail open and log.
        console.error("[llm-usage] budget check failed:", error instanceof Error ? error.message : "unknown")
        return
      }
      if (!exceeded) return
      console.warn(`[llm-usage] daily LLM cap reached; call refused (org=${event.organizationId}, task=${event.task})`)
      await recordLlmUsage({
        ...event, inputTokens: null, outputTokens: null, latencyMs: 0, ok: false, errorClass: "budget_exceeded",
      }).catch(() => undefined)
      throw new AiBudgetError()
    },
    record: recordLlmUsage,
  }
}

// Called once at Node.js startup (src/instrumentation.ts).
export function registerLlmUsageSink() {
  registerAiUsageSink(createDbUsageSink())
}
