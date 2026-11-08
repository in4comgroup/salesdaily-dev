import "server-only"

import { AI_CAPABILITIES, type AiCapability, type AiConfig, type AiTask } from "./config"
import { AiPolicyError, authorizeAiModel } from "./policy"

// Baseline requirements cannot be relaxed by caller configuration.
export function requiredTaskCapabilities(task: AiTask): readonly AiCapability[] {
  if (task === "chat" || task === "analytics") return ["text", "tools", "streaming"]
  if (task === "webSearch" || task === "companyResearch") return ["text", "googleSearch"]
  const media: Partial<Record<AiTask, AiCapability>> = {
    parsePdf: "pdf", parseImage: "image", parseAudio: "audio", parseVideo: "video",
  }
  return ["text", "structuredOutput", ...(media[task] ? [media[task]!] : [])]
}

export function listAvailableAiModels(config: AiConfig, task: AiTask) {
  const taskConfig = Object.hasOwn(config.tasks, task) ? config.tasks[task] : undefined
  if (!taskConfig?.enabled) return []
  return taskConfig.allowedModels.flatMap((modelId) => {
    try {
      const route = authorizeAiModel(config, task, modelId, requiredTaskCapabilities(task))
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
