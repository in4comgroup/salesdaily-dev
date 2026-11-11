import "server-only"

import { AI_CAPABILITIES, type AiCapability, type AiConfig, type AiTask } from "./config"
import { AiPolicyError, authorizeAiModel } from "./policy"

// Baseline requirements cannot be relaxed by caller configuration. PDF and
// audio reach the model as text (OCR / SpeechKit), web search as snippets
// from the Search API.
export function requiredTaskCapabilities(task: AiTask, config?: AiConfig): readonly AiCapability[] {
  if (task === "describeImage") return ["text", "image"]
  if (task === "chat" || task === "analytics") return ["text", "tools", "streaming"]
  if (task === "webSearch" || task === "companyResearch") return ["text"]
  if (task === "parseImage" && config?.files.images === "native") return ["text", "structuredOutput", "image"]
  return ["text", "structuredOutput"]
}

export function listAvailableAiModels(config: AiConfig, task: AiTask) {
  const taskConfig = Object.hasOwn(config.tasks, task) ? config.tasks[task] : undefined
  if (!taskConfig?.enabled) return []
  return taskConfig.allowedModels.flatMap((modelId) => {
    try {
      const route = authorizeAiModel(config, task, modelId, requiredTaskCapabilities(task, config))
      return [{
        id: route.modelId,
        label: route.definition.label,
        isDefault: taskConfig.defaultModel === modelId,
        capabilities: AI_CAPABILITIES.filter((c) => route.definition.capabilities.includes(c)),
      }]
    } catch (error) {
      if (error instanceof AiPolicyError) return []
      throw error
    }
  })
}
