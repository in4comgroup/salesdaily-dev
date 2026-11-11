import "server-only"

import type { AiCapability, AiConfig, AiFeature, AiTask } from "./config"

export class AiPolicyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AiPolicyError"
  }
}

export function assertAiFeatureAllowed(config: AiConfig, feature: AiFeature): void {
  if (!config.features[feature]) {
    throw new AiPolicyError(`AI feature is disabled: ${feature}`)
  }
}

// The chat sends text only; file parts (also in older messages) are refused.
// Files go through Sources, where OCR / SpeechKit / vision prepare them.
export function assertChatContentAllowed(
  messages: readonly { parts?: readonly { type: string }[] }[],
): void {
  if (messages.some((message) => message.parts?.some((part) => part.type === "file"))) {
    throw new AiPolicyError("File attachments are disabled for the text-only Yandex chat")
  }
}

export function authorizeAiModel(
  config: AiConfig,
  taskId: AiTask,
  selectedModelId?: string,
  requiredCapabilities: readonly AiCapability[] = [],
) {
  const task = Object.hasOwn(config.tasks, taskId) ? config.tasks[taskId] : undefined
  if (!task?.enabled) throw new AiPolicyError(`AI task is disabled or unconfigured: ${taskId}`)
  const modelId = selectedModelId ?? task.defaultModel
  if (!modelId || !task.allowedModels.includes(modelId)) {
    throw new AiPolicyError(`Model is not allowed for AI task: ${taskId}`)
  }
  const model = Object.hasOwn(config.models, modelId) ? config.models[modelId] : undefined
  if (!model?.enabled) throw new AiPolicyError("AI model is disabled or unknown")
  if (!requiredCapabilities.every((capability) => model.capabilities.includes(capability))) {
    throw new AiPolicyError(`AI model lacks required capabilities for task: ${taskId}`)
  }
  return { modelId, definition: model }
}
