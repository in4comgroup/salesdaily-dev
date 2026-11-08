import "server-only"

import { AI_TASKS } from "./config"
import { getAiRuntime } from "./resolve"

export function getAiCatalog() {
  const runtime = getAiRuntime()
  return {
    tasks: Object.fromEntries(AI_TASKS.map((task) => [task, runtime.listModels(task)])),
    features: runtime.features(),
  }
}
