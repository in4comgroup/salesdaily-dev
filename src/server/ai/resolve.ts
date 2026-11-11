import "server-only"

import { type LanguageModel } from "ai"
import {
  AiConfigurationError, AI_SERVICES, loadAiConfig, parseAiConfig,
  type AiCapability, type AiEnvironment, type AiFeature, type AiTask,
} from "./config"
import { authorizeAiModel, assertAiFeatureAllowed } from "./policy"
import { listAvailableAiModels, requiredTaskCapabilities } from "./registry"
import { createYandexAdapter } from "./adapters/yandex"
import { createYandexService, type ServiceName, type YandexService } from "./services"
import {
  LEGACY_MODEL_URI_ENV, YANDEX_ENV, YANDEX_SERVICE_KEY_ENV,
  readYandexApiKey, readYandexFolderId, resolveYandexApiUrl,
} from "./yandex-connection"
import { AiPolicyError } from "./policy"
import type { AiDiagnostics } from "./diagnostics"
import { meterModel } from "./usage"

export function createAiRuntime(
  input: unknown,
  env: AiEnvironment = process.env,
  fetchImplementation?: typeof fetch,
  diagnostics?: AiDiagnostics,
) {
  // Parse a private copy. No mutation of configuration is exposed to callers.
  const config = parseAiConfig(input)
  const environment = { ...env }

  const enabledModels = Object.entries(config.models).filter(([, model]) => model.enabled)
  const enabledServices = AI_SERVICES.filter((name) => config.services[name])

  // Yandex access is needed only when something is enabled: a fully disabled
  // configuration needs no keys. Building adapters sends no network requests.
  const needsYandex = enabledModels.length > 0 || enabledServices.length > 0
  const apiUrl = needsYandex ? resolveYandexApiUrl(environment) : undefined
  const folderId = needsYandex ? readYandexFolderId(environment) : undefined
  const adapter = enabledModels.length > 0
    ? createYandexAdapter({ apiUrl: apiUrl!, apiKey: readYandexApiKey(environment, YANDEX_ENV.apiKey), folderId: folderId! },
      fetchImplementation, diagnostics)
    : undefined

  const services = new Map<ServiceName, YandexService>()
  for (const name of enabledServices) {
    services.set(name, createYandexService(name, {
      apiUrl: apiUrl!, folderId: folderId!, apiKey: readYandexApiKey(environment, YANDEX_SERVICE_KEY_ENV[name]),
    }, fetchImplementation))
  }

  const modelUris = new Map<string, string>()
  for (const [id, model] of enabledModels) {
    const legacyEnv = LEGACY_MODEL_URI_ENV[id]
    const uri = model.uri ?? (legacyEnv ? environment[legacyEnv]?.trim() : undefined)
    if (!uri) throw new AiConfigurationError(`Missing model URI for AI model: ${id}`)
    // Validates the URI (Yandex format, configured folder) before any call.
    adapter!(uri, model.capabilities.includes("image"))
    modelUris.set(id, uri)
  }

  // Validate baseline capability requirements before accepting this runtime.
  for (const [task, definition] of Object.entries(config.tasks)) {
    if (definition.enabled) {
      authorizeAiModel(config, task as AiTask, undefined, requiredTaskCapabilities(task as AiTask, config))
    }
  }

  return {
    hasService(name: ServiceName) { return services.has(name) },
    service(name: ServiceName) {
      const service = services.get(name)
      if (!service) throw new AiPolicyError(`AI service is disabled: ${name}`)
      return service
    },
    files() { return { ...config.files } },
    listModels(task: AiTask) { return listAvailableAiModels(config, task) },
    assertFeatureAllowed(feature: AiFeature) { assertAiFeatureAllowed(config, feature) },
    isFeatureAllowed(feature: AiFeature) { return config.features[feature] === true },
    features() { return { ...config.features } },
    // `organizationId` / `sourceItemId` attribute the call in `llm_usage` and
    // apply the org's daily cost cap. When omitted they come from
    // `withAiUsageContext()` (see ./usage.ts).
    resolve(request: {
      task: AiTask
      modelId?: string
      requiredCapabilities?: readonly AiCapability[]
      organizationId?: string | null
      sourceItemId?: string | null
    }) {
      const route = authorizeAiModel(config, request.task, request.modelId, [
        ...requiredTaskCapabilities(request.task, config), ...(request.requiredCapabilities ?? []),
      ])
      const upstreamModelId = modelUris.get(route.modelId)
      if (!adapter || !upstreamModelId) throw new AiConfigurationError("AI adapter is unavailable")
      const model: Exclude<LanguageModel, string> = meterModel(
        adapter(upstreamModelId, route.definition.capabilities.includes("image")),
        { task: request.task, modelId: route.modelId, upstreamModelId },
        { organizationId: request.organizationId, sourceItemId: request.sourceItemId },
      )
      return {
        model,
        task: request.task,
        modelId: route.modelId,
        configVersion: config.version,
        upstreamModelId,
        capabilities: [...route.definition.capabilities],
      }
    },
  }
}

let runtime: ReturnType<typeof createAiRuntime> | undefined

// Process-scoped configuration: restart after changing the mounted JSON/env.
export function getAiRuntime() {
  return runtime ??= createAiRuntime(loadAiConfig())
}
