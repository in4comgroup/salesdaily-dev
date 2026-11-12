export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    // AI configuration: the active database version (ai_config_version),
    // else AI off. Never stops the app.
    const { startAiConfigStore } = await import("./server/ai-config-store")
    await startAiConfigStore()
    // LLM usage metering + daily cost cap (src/server/llm-usage.ts).
    const { registerLlmUsageSink } = await import("./server/llm-usage")
    registerLlmUsageSink()
    // Daily model prices from the Yandex Billing API (src/server/llm-pricing.ts).
    const { startLlmPriceSyncSchedule } = await import("./server/llm-pricing")
    startLlmPriceSyncSchedule()
  }
}
