import "server-only"

import { parseAiConfig, type AiConfig, type AiEnvironment } from "./config"
import { createAiRuntime } from "./resolve"
import { LEGACY_MODEL_URI_ENV } from "./yandex-connection"

// Check a configuration document before it is saved as a database version
// (admin «Маршруты ИИ» and `tools/ai/run.mjs seed`):
//   1. schema (strict, version 2);
//   2. model URIs missing in the document are copied from
//      YANDEX_AI_TEXT_MODEL_URI / YANDEX_AI_VISION_MODEL_URI (transition);
//   3. the runtime is built with the given env, without network requests —
//      keys, folder and URIs of everything enabled must be present and valid.
// Throws AiConfigurationError / AiPolicyError with safe messages.
export function prepareAiConfigDocument(input: unknown, env: AiEnvironment): { config: AiConfig; filledUris: string[] } {
  const config = parseAiConfig(input)
  const filledUris: string[] = []
  for (const [id, model] of Object.entries(config.models)) {
    if (model.uri) continue
    const name = LEGACY_MODEL_URI_ENV[id]
    const value = name ? env[name]?.trim() : undefined
    if (value) {
      model.uri = value
      filledUris.push(id)
    }
  }
  const checked = parseAiConfig(config)
  createAiRuntime(checked, env)
  return { config: checked, filledUris }
}
