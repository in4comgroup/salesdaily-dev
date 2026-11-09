import "server-only"

import { type LanguageModel } from "ai"
import {
  AiConfigurationError, loadAiConfig, parseAiConfig,
  type AiCapability, type AiEnvironment, type AiFeature, type AiTask,
} from "./config"
import { authorizeAiModel, assertAiFeatureAllowed } from "./policy"
import { listAvailableAiModels, requiredTaskCapabilities } from "./registry"
import { createVercelGatewayAdapter } from "./adapters/vercel-gateway"
import { createYandexAdapter } from "./adapters/yandex"
import { createYandexService, type ServiceName, type YandexService } from "./services"
import { AiPolicyError } from "./policy"
import type { AiDiagnostics } from "./diagnostics"

export function createAiRuntime(
  input: unknown,
  env: AiEnvironment = process.env,
  fetchImplementation?: typeof fetch,
  diagnostics?: AiDiagnostics,
) {
  // Parse a private copy. No mutation of configuration is exposed to callers.
  const config = parseAiConfig(input)
  const environment = { ...env }

  // Credentials are required only for active, policy-approved connections.
  // Constructing adapters does not issue network requests.
  const adapters = new Map<string, (modelId: string, allowImages?: boolean) => Exclude<LanguageModel, string>>()
  for (const [id, connection] of Object.entries(config.connections)) {
    if (connection.enabled && config.policy.allowedConnections.includes(id)) {
      adapters.set(id, connection.adapter === "vercel-gateway"
        ? createVercelGatewayAdapter(connection, environment, fetchImplementation)
        : createYandexAdapter(connection, environment, fetchImplementation, diagnostics))
    }
  }

  const services = new Map<ServiceName, YandexService>()
  for (const name of ["speech", "search", "ocr"] as const) {
    const service = config.services[name]
    if (!service.enabled) continue
    const connection = config.connections[service.connectionId!]
    if (connection.adapter !== "yandex-openai-compatible") throw new AiConfigurationError("Yandex service requires a Yandex connection")
    services.set(name, createYandexService(name, service.credentialsEnv!, connection.folderIdEnv, environment, fetchImplementation))
  }

  const modelIds = new Map<string, string>()
  for (const [id, model] of Object.entries(config.models)) {
    if (!model.enabled || !config.policy.allowedConnections.includes(model.connectionId) ||
        !config.connections[model.connectionId].enabled) continue
    const upstreamId = model.upstreamModelId ?? environment[model.upstreamModelIdEnv!]?.trim()
    if (!upstreamId) throw new AiConfigurationError("Missing upstream model environment variable")
    const connection = config.connections[model.connectionId]
    if (connection.adapter === "yandex-openai-compatible" &&
        model.capabilities.some((c) => ["pdf", "audio", "video", "googleSearch"].includes(c))) {
      throw new AiConfigurationError("Yandex adapter supports text and inline images only")
    }
    // Validate model URI before any call; adapters only construct objects here.
    adapters.get(model.connectionId)!(upstreamId, model.capabilities.includes("image"))
    modelIds.set(id, upstreamId)
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
    preprocessing() { return { ...config.preprocessing } },
    listModels(task: AiTask) { return listAvailableAiModels(config, task) },
    assertFeatureAllowed(feature: AiFeature) { assertAiFeatureAllowed(config, feature) },
    isFeatureAllowed(feature: AiFeature) { return config.policy.features[feature] === true },
    features() { return { ...config.policy.features } },
    resolveGoogleSearch(task: "webSearch" | "companyResearch") {
      assertAiFeatureAllowed(config, "webSearch")
      const route = authorizeAiModel(config, task, undefined, ["text", "googleSearch"])
      const upstreamId = modelIds.get(route.modelId)!
      if (route.connection.adapter !== "vercel-gateway" || !upstreamId.startsWith("google/")) {
        throw new AiConfigurationError("Google Search requires an explicitly approved Google Gateway route")
      }
      return adapters.get(route.definition.connectionId)!(upstreamId)
    },
    resolve(request: { task: AiTask; modelId?: string; requiredCapabilities?: readonly AiCapability[] }) {
      const route = authorizeAiModel(config, request.task, request.modelId, [
        ...requiredTaskCapabilities(request.task, config), ...(request.requiredCapabilities ?? []),
      ])
      const adapter = adapters.get(route.definition.connectionId)
      if (!adapter) throw new AiConfigurationError("AI adapter is unavailable")
      const upstreamModelId = modelIds.get(route.modelId)!
      const model: Exclude<LanguageModel, string> = adapter(upstreamModelId, route.definition.capabilities.includes("image"))
      return {
        model,
        task: request.task,
        modelId: route.modelId,
        connectionId: route.definition.connectionId,
        configVersion: config.version,
        upstreamModelId,
        capabilities: [...route.definition.capabilities],
        adapter: route.connection.adapter,
      }
    },
  }
}

let runtime: ReturnType<typeof createAiRuntime> | undefined

// Process-scoped configuration: restart after changing the mounted JSON/env.
export function getAiRuntime() {
  return runtime ??= createAiRuntime(loadAiConfig())
}
