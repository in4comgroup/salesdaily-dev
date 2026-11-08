"use client"

import { useEffect, useState } from "react"
import type { AiCapability, AiFeature, AiTask } from "@/server/ai/config"

type Model = { id: string; label: string; isDefault: boolean; capabilities: AiCapability[] }
type Catalog = { tasks: Partial<Record<AiTask, Model[]>>; features: Record<AiFeature, boolean> }

export function useAiModels(task: AiTask, selectedId?: string) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    fetch("/api/ai/config", { cache: "no-store", signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Не удалось загрузить настройки ИИ")
        return response.json() as Promise<Catalog>
      })
      .then(setCatalog)
      .catch(() => { if (!abort.signal.aborted) setError("Настройки ИИ недоступны") })
    return () => abort.abort()
  }, [])
  const models = catalog?.tasks[task] ?? []
  const currentModel = models.find((model) => model.id === selectedId)
    ?? models.find((model) => model.isDefault) ?? models[0]
  return {
    models, currentModel, modelId: currentModel?.id,
    enabled: Boolean(currentModel), loading: catalog === null && error === null,
    error, features: catalog?.features,
  }
}
