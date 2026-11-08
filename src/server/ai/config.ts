import "server-only"

import { readFileSync } from "node:fs"
import { z } from "zod"

export const AI_TASKS = [
  "chat", "analytics", "cards", "deals", "orderRequest", "chatSummary",
  "companyResearch", "companyExtraction", "parseText", "parsePdf",
  "parseImage", "parseAudio", "parseVideo", "parseOffice", "orgAttribution", "webSearch",
] as const
export type AiTask = (typeof AI_TASKS)[number]

export const AI_CAPABILITIES = [
  "text", "structuredOutput", "tools", "streaming", "image", "pdf", "audio", "video", "googleSearch",
] as const
export type AiCapability = (typeof AI_CAPABILITIES)[number]

export const AI_FEATURES = ["webSearch", "websiteFetch", "browserSpeechRecognition"] as const
export type AiFeature = (typeof AI_FEATURES)[number]

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
const envName = z.string().regex(/^[A-Z][A-Z0-9_]*$/)
const uniqueIds = z.array(id).refine((ids) => new Set(ids).size === ids.length, "Duplicate IDs")

const connectionSchema = z.discriminatedUnion("adapter", [z.strictObject({
  enabled: z.boolean(),
  adapter: z.literal("vercel-gateway"),
  baseUrl: z.literal("https://ai-gateway.vercel.sh/v3/ai"),
  credentialsEnv: envName,
}), z.strictObject({
  enabled: z.boolean(),
  adapter: z.literal("yandex-openai-compatible"),
  baseUrl: z.literal("https://ai.api.cloud.yandex.net/v1"),
  credentialsEnv: envName,
  folderIdEnv: envName,
})])

const modelSchema = z.strictObject({
  enabled: z.boolean(),
  label: z.string().trim().min(1),
  connectionId: id,
  upstreamModelId: z.string().regex(/^[a-z0-9-]+\/[a-zA-Z0-9._/-]+$/).optional(),
  upstreamModelIdEnv: envName.optional(),
  capabilities: z.array(z.enum(AI_CAPABILITIES)).min(1),
}).refine((model) => Boolean(model.upstreamModelId) !== Boolean(model.upstreamModelIdEnv), {
  message: "Provide exactly one upstream model source",
})

const taskSchema = z.strictObject({
  enabled: z.boolean(),
  defaultModel: id.optional(),
  allowedModels: uniqueIds,
  // No automatic fallback in stage 1. Reject rather than silently ignore it.
  fallbackModels: z.array(id).max(0).default([]),
})

export const aiConfigSchema = z.strictObject({
  version: z.literal(1),
  policy: z.strictObject({
    allowedConnections: uniqueIds,
    features: z.strictObject({
      webSearch: z.boolean(),
      websiteFetch: z.boolean(),
      browserSpeechRecognition: z.boolean(),
    }),
  }),
  connections: z.record(id, connectionSchema),
  models: z.record(id, modelSchema),
  tasks: z.partialRecord(z.enum(AI_TASKS), taskSchema),
}).superRefine((config, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: "custom", path, message })

  for (const connectionId of config.policy.allowedConnections) {
    if (!Object.hasOwn(config.connections, connectionId)) {
      issue(["policy", "allowedConnections"], `Unknown connection: ${connectionId}`)
    }
  }
  for (const [modelId, model] of Object.entries(config.models)) {
    if (!Object.hasOwn(config.connections, model.connectionId)) {
      issue(["models", modelId, "connectionId"], "Unknown connection")
    }
  }
  for (const [taskId, task] of Object.entries(config.tasks)) {
    for (const modelId of task.allowedModels) {
      if (!Object.hasOwn(config.models, modelId)) {
        issue(["tasks", taskId, "allowedModels"], `Unknown model: ${modelId}`)
      }
    }
    if (task.defaultModel && !task.allowedModels.includes(task.defaultModel)) {
      issue(["tasks", taskId, "defaultModel"], "Default must be in allowedModels")
    }
    if (!task.enabled) continue
    const model = task.defaultModel && Object.hasOwn(config.models, task.defaultModel)
      ? config.models[task.defaultModel] : undefined
    const connection = model && Object.hasOwn(config.connections, model.connectionId)
      ? config.connections[model.connectionId] : undefined
    if (!model?.enabled || !connection?.enabled ||
        !config.policy.allowedConnections.includes(model.connectionId)) {
      issue(["tasks", taskId, "defaultModel"], "Enabled task needs an enabled, policy-approved default route")
    }
  }
})

export type AiConfig = z.infer<typeof aiConfigSchema>
export type AiConnection = AiConfig["connections"][string]
export type AiEnvironment = Readonly<Record<string, string | undefined>>

export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiConfigurationError"
  }
}

export function parseAiConfig(input: unknown): AiConfig {
  const result = aiConfigSchema.safeParse(input)
  if (!result.success) {
    // Never include input values (which may accidentally contain secrets).
    const paths = [...new Set(result.error.issues.map((issue) => issue.path.join(".") || "root"))]
    throw new AiConfigurationError(`Invalid AI configuration at: ${paths.join(", ")}`)
  }
  return result.data
}

export function loadAiConfig(env: AiEnvironment = process.env): AiConfig {
  const path = env.AI_CONFIG_PATH?.trim()
  if (!path) throw new AiConfigurationError("AI_CONFIG_PATH is required; no default AI route is enabled")
  let input: unknown
  try {
    input = JSON.parse(readFileSync(path, "utf8"))
  } catch {
    throw new AiConfigurationError("Cannot read AI_CONFIG_PATH as JSON")
  }
  return parseAiConfig(input)
}
