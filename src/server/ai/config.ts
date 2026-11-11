import "server-only"

import { readFileSync } from "node:fs"
import { z } from "zod"

export const AI_TASKS = [
  "chat", "analytics", "cards", "deals", "orderRequest", "chatSummary",
  "companyResearch", "companyExtraction", "parseText", "parsePdf",
  "describeImage", "parseImage", "parseAudio", "parseVideo", "parseOffice", "orgAttribution", "webSearch",
] as const
export type AiTask = (typeof AI_TASKS)[number]

// Model input capabilities. Only the Yandex AI Studio API is used: no model
// takes PDF / audio / video directly (OCR and SpeechKit prepare them), and
// there is no Google Search tool.
export const AI_CAPABILITIES = ["text", "structuredOutput", "tools", "streaming", "image"] as const
export type AiCapability = (typeof AI_CAPABILITIES)[number]

export const AI_FEATURES = ["webSearch", "websiteFetch", "browserSpeechRecognition", "serverSpeechRecognition"] as const
export type AiFeature = (typeof AI_FEATURES)[number]

export const AI_SERVICES = ["ocr", "speech", "search"] as const

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/)
const uniqueIds = z.array(id).refine((ids) => new Set(ids).size === ids.length, "Duplicate IDs")

// Full Yandex model URI. The folder is checked against YANDEX_AI_FOLDER_ID when
// the runtime is built.
export const YANDEX_MODEL_URI = /^gpt:\/\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._/-]+$/

const modelSchema = z.strictObject({
  enabled: z.boolean(),
  label: z.string().trim().min(1),
  // Empty = the legacy env variable for this model ID (yandex-connection.ts,
  // LEGACY_MODEL_URI_ENV). Stage 2 of docs/ai/config-in-db-spec.md moves URIs
  // into the database.
  uri: z.string().regex(YANDEX_MODEL_URI).optional(),
  capabilities: z.array(z.enum(AI_CAPABILITIES)).min(1),
})

const taskSchema = z.strictObject({
  enabled: z.boolean(),
  defaultModel: id.optional(),
  allowedModels: uniqueIds,
})

// Configuration document, schema version 2 (Yandex only). There is no
// connection / provider section: the only connection is the Yandex AI Studio
// API, defined in code (yandex-connection.ts) with its address in env.
export const aiConfigSchema = z.strictObject({
  version: z.literal(2),
  features: z.strictObject({
    webSearch: z.boolean(),
    websiteFetch: z.boolean(),
    browserSpeechRecognition: z.boolean(),
    serverSpeechRecognition: z.boolean().default(false),
  }),
  files: z.strictObject({
    // vision = describeImage (Yandex vision model) → text model;
    // native = the parseImage model gets the inline image itself.
    images: z.enum(["native", "vision"]).default("vision"),
    maxMediaSeconds: z.number().int().min(1).max(600).default(180),
    pdfMaxPages: z.number().int().min(1).max(20).default(10),
  }).default({ images: "vision", maxMediaSeconds: 180, pdfMaxPages: 10 }),
  services: z.strictObject({
    ocr: z.boolean().default(false),
    speech: z.boolean().default(false),
    search: z.boolean().default(false),
  }).default({ ocr: false, speech: false, search: false }),
  models: z.record(id, modelSchema),
  tasks: z.partialRecord(z.enum(AI_TASKS), taskSchema),
}).superRefine((config, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: "custom", path, message })
  const on = (task: AiTask) => config.tasks[task]?.enabled === true

  if (config.files.images === "vision" && on("parseImage") && !on("describeImage")) {
    issue(["tasks", "describeImage"], "Image preprocessing requires describeImage")
  }
  if (on("parsePdf") && !config.services.ocr) issue(["services", "ocr"], "PDF parsing requires the OCR service")
  if ((on("parseAudio") || config.features.serverSpeechRecognition) && !config.services.speech) {
    issue(["services", "speech"], "Speech processing requires the SpeechKit service")
  }
  if ((on("webSearch") || on("companyResearch")) && !config.services.search) {
    issue(["services", "search"], "Web search and company research require the Search API service")
  }
  if (on("parseVideo")) issue(["tasks", "parseVideo"], "Video processing is unavailable with the Yandex APIs")

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
    if (!model?.enabled) {
      issue(["tasks", taskId, "defaultModel"], "Enabled task needs an enabled default model")
    }
  }
})

export type AiConfig = z.infer<typeof aiConfigSchema>

// Everything off: used when no valid configuration can be loaded. Needs no
// env values.
export const DISABLED_AI_CONFIG = {
  version: 2,
  features: { webSearch: false, websiteFetch: false, browserSpeechRecognition: false, serverSpeechRecognition: false },
  files: { images: "vision", maxMediaSeconds: 180, pdfMaxPages: 10 },
  services: { ocr: false, speech: false, search: false },
  models: {},
  tasks: {},
} as const
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
    // Never include input values (which may accidentally contain secrets):
    // paths only, plus the text of our own rules (they contain no values).
    const issues = [...new Set(result.error.issues.map((issue) => {
      const path = issue.path.join(".") || "root"
      return issue.code === "custom" ? `${path} (${issue.message})` : path
    }))]
    throw new AiConfigurationError(`Invalid AI configuration at: ${issues.join(", ")}`)
  }
  return result.data
}

// Reads the JSON document named by AI_CONFIG_PATH. Replaced by the database
// store in stage 2 of docs/ai/config-in-db-spec.md.
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
