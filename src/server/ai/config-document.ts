import "server-only"

import { parseAiConfig, type AiConfig, type AiEnvironment } from "./config"
import { createAiRuntime } from "./resolve"

// Check a configuration document before it is saved as a database version
// (admin «Маршруты ИИ» and `tools/ai/run.mjs seed`):
//   1. schema (strict, version 2; every enabled model has its URI);
//   2. the runtime is built with the given env, without network requests —
//      keys and folder for everything enabled must be present, and model URIs
//      must belong to YANDEX_AI_FOLDER_ID.
// Throws AiConfigurationError / AiPolicyError with safe messages.
export function prepareAiConfigDocument(input: unknown, env: AiEnvironment): AiConfig {
  const config = parseAiConfig(input)
  createAiRuntime(config, env)
  return config
}
