"use client"

// «Маршруты ИИ»: the AI routing document (which Yandex models exist, which
// process uses which model, which services and features are on) stored as
// versions in the database. Save = a new active version (checked on the
// server first); history = make an older version active again. Running pods
// switch within 30 seconds. docs/ai/config-in-db-spec.md §7.
// Backend: /api/admin/llm/routing → src/server/admin-llm-routing.ts.

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader, Plus, RotateCcw, Save, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  apiFetch,
  errorMessage,
  formatDateTime,
  jsonInit,
  taskLabel,
  type AiConfigDoc,
  type AiModelDoc,
  type AiRoutingState,
} from "./shared"

const FEATURE_LABELS: Record<string, string> = {
  webSearch: "Веб-поиск в чате",
  websiteFetch: "Чтение сайтов компаний",
  browserSpeechRecognition: "Голосовой ввод средствами браузера",
  serverSpeechRecognition: "Голосовой ввод через SpeechKit",
}

const SERVICE_LABELS: Record<string, string> = {
  ocr: "Vision OCR (PDF)",
  speech: "SpeechKit (аудио, микрофон)",
  search: "Search API (веб-поиск, данные компаний)",
}

const CAPABILITY_LABELS: Record<string, string> = {
  text: "текст",
  structuredOutput: "структурный ответ",
  tools: "инструменты",
  streaming: "потоковый ответ",
  image: "изображения",
}

const SOURCE_LABELS: Record<AiRoutingState["documentSource"], string> = {
  database: "из БД",
  disabled: "ИИ выключен",
}

const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

export function AiRouting() {
  const [state, setState] = useState<AiRoutingState | null>(null)
  const [doc, setDoc] = useState<AiConfigDoc | null>(null)
  const [comment, setComment] = useState("")
  const [newModelId, setNewModelId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const next = await apiFetch<AiRoutingState>("/api/admin/llm/routing")
      setState(next)
      setDoc(structuredClone(next.document))
      setError(null)
      setSaveError(null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const dirty = useMemo(
    () => Boolean(state && doc && JSON.stringify(doc) !== JSON.stringify(state.document)),
    [state, doc],
  )

  // Every edit works on a copy of the document.
  const edit = (change: (draft: AiConfigDoc) => void) => {
    setDoc((current) => {
      if (!current) return current
      const draft = structuredClone(current)
      change(draft)
      return draft
    })
    setSaveError(null)
  }

  async function save() {
    if (!doc) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await apiFetch<{ id: number }>("/api/admin/llm/routing", jsonInit("POST", { config: doc, comment }))
      toast.success(`Версия ${res.id} сохранена и активна. Все серверы перейдут на неё за 30 секунд.`)
      setComment("")
      await load()
    } catch (e) {
      setSaveError(errorMessage(e))
      toast.error("Версия не сохранена")
    } finally {
      setSaving(false)
    }
  }

  async function activate(id: number) {
    setActivating(id)
    try {
      await apiFetch("/api/admin/llm/routing/activate", jsonInit("POST", { id }))
      toast.success(`Версия ${id} активна. Все серверы перейдут на неё за 30 секунд.`)
      await load()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setActivating(null)
    }
  }

  function addModel() {
    const id = newModelId.trim()
    if (!MODEL_ID.test(id)) {
      toast.error("ID модели: латиница, цифры, точка, дефис, подчёркивание")
      return
    }
    if (doc?.models[id]) {
      toast.error("Модель с таким ID уже есть")
      return
    }
    edit((d) => {
      d.models[id] = { enabled: false, label: id, uri: "", capabilities: ["text", "structuredOutput"] }
    })
    setNewModelId("")
  }

  function removeModel(id: string) {
    edit((d) => {
      delete d.models[id]
      for (const task of Object.values(d.tasks)) {
        task.allowedModels = task.allowedModels.filter((m) => m !== id)
        if (task.defaultModel === id) delete task.defaultModel
      }
    })
  }

  if (!state || !doc) {
    return (
      <section className="flex flex-col gap-4">
        <h2 className="text-base font-medium">Маршруты ИИ</h2>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <Loader className="size-5 animate-spin text-muted-foreground" />
        )}
      </section>
    )
  }

  const modelIds = Object.keys(doc.models)
  const running = state.running
  const folderPrefix = state.env.folderId ? `gpt://${state.env.folderId}/` : "gpt://<каталог>/"

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-medium">Маршруты ИИ</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load()} disabled={saving}>
            <RotateCcw className="size-4" />
            Сбросить изменения
          </Button>
          <Button size="sm" onClick={save} disabled={saving || (!dirty && state.documentSource === "database")}>
            {saving ? <Loader className="size-4 animate-spin" /> : <Save className="size-4" />}
            Сохранить новую версию
          </Button>
        </div>
      </div>

      {/* Status */}
      <div className="flex flex-col gap-1 rounded-md border p-3 text-sm">
        <p>
          Сейчас этот сервер работает:{" "}
          <strong>
            {running
              ? running.source === "database"
                ? `версия ${running.versionId} из БД`
                : SOURCE_LABELS[running.source]
              : "—"}
          </strong>
          {state.activeVersionId !== null && running?.versionId !== state.activeVersionId && (
            <span className="text-muted-foreground"> (активна версия {state.activeVersionId}; переход — за 30 секунд)</span>
          )}
        </p>
        {state.documentSource !== "database" && (
          <p className="text-amber-700 dark:text-amber-400">
            В БД нет активной версии — ИИ выключен. Настройте процессы и модели ниже и сохраните версию.
          </p>
        )}
        {running?.lastError && <p className="text-xs text-destructive">Ошибка загрузки: {running.lastError}</p>}
        <p className="text-xs text-muted-foreground">
          Адрес API: {state.env.apiUrl ?? "неверный YANDEX_AI_API_URL"} · Каталог: {state.env.folderId ?? "не задан"} ·
          Ключи:{" "}
          {state.env.keys.map((k) => (
            <span key={k.name} className={k.present ? "" : "text-destructive"}>
              {k.name} {k.present ? "✓" : "нет"}{" "}
            </span>
          ))}
        </p>
      </div>

      {/* Tasks */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Процесс</TableHead>
              <TableHead>Вкл.</TableHead>
              <TableHead>Модель по умолчанию</TableHead>
              <TableHead>Разрешённые модели</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.catalog.tasks.map((taskId) => {
              const task = doc.tasks[taskId] ?? { enabled: false, allowedModels: [] }
              const setTask = (change: (t: typeof task) => void) =>
                edit((d) => {
                  const t = d.tasks[taskId] ?? { enabled: false, allowedModels: [] }
                  change(t)
                  d.tasks[taskId] = t
                })
              return (
                <TableRow key={taskId}>
                  <TableCell>
                    <div className="text-sm">{taskLabel(taskId)}</div>
                    <div className="font-mono text-xs text-muted-foreground">{taskId}</div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={task.enabled}
                      disabled={taskId === "parseVideo"}
                      onCheckedChange={(v) => setTask((t) => { t.enabled = v })}
                    />
                  </TableCell>
                  <TableCell>
                    <NativeSelect
                      className="w-48"
                      value={task.defaultModel ?? ""}
                      onChange={(e) => setTask((t) => {
                        const value = e.target.value
                        if (!value) {
                          delete t.defaultModel
                          return
                        }
                        t.defaultModel = value
                        if (!t.allowedModels.includes(value)) t.allowedModels.push(value)
                      })}
                    >
                      <NativeSelectOption value="">—</NativeSelectOption>
                      {modelIds.map((id) => (
                        <NativeSelectOption key={id} value={id}>{id}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-3">
                      {modelIds.map((id) => (
                        <label key={id} className="flex items-center gap-1.5 text-xs">
                          <Checkbox
                            checked={task.allowedModels.includes(id)}
                            onCheckedChange={(v) => setTask((t) => {
                              t.allowedModels = v === true
                                ? [...t.allowedModels.filter((m) => m !== id), id]
                                : t.allowedModels.filter((m) => m !== id)
                              if (v !== true && t.defaultModel === id) delete t.defaultModel
                            })}
                          />
                          <span className="font-mono">{id}</span>
                        </label>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Models */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Модель (ID)</TableHead>
              <TableHead>Вкл.</TableHead>
              <TableHead>Название</TableHead>
              <TableHead>URI модели Yandex</TableHead>
              <TableHead>Возможности</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {modelIds.map((id) => {
              const model = doc.models[id]
              const setModel = (change: (m: AiModelDoc) => void) => edit((d) => change(d.models[id]))
              return (
                <TableRow key={id}>
                  <TableCell className="font-mono text-xs">{id}</TableCell>
                  <TableCell>
                    <Switch checked={model.enabled} onCheckedChange={(v) => setModel((m) => { m.enabled = v })} />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="w-44"
                      value={model.label}
                      onChange={(e) => setModel((m) => { m.label = e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="w-72 font-mono text-xs"
                      value={model.uri ?? ""}
                      placeholder={`${folderPrefix}…`}
                      onChange={(e) => setModel((m) => {
                        const value = e.target.value.trim()
                        if (value) m.uri = value
                        else delete m.uri
                      })}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-3">
                      {state.catalog.capabilities.map((cap) => (
                        <label key={cap} className="flex items-center gap-1.5 text-xs">
                          <Checkbox
                            checked={model.capabilities.includes(cap)}
                            onCheckedChange={(v) => setModel((m) => {
                              m.capabilities = v === true
                                ? [...m.capabilities.filter((c) => c !== cap), cap]
                                : m.capabilities.filter((c) => c !== cap)
                            })}
                          />
                          {CAPABILITY_LABELS[cap] ?? cap}
                        </label>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => removeModel(id)} aria-label={`Удалить ${id}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center gap-2">
        <Input
          className="w-56"
          placeholder="ID новой модели, например yandex-lite"
          value={newModelId}
          onChange={(e) => setNewModelId(e.target.value)}
        />
        <Button variant="outline" size="sm" onClick={addModel}>
          <Plus className="size-4" />
          Добавить модель
        </Button>
        <span className="text-xs text-muted-foreground">
          URI берите в каталоге моделей Yandex AI Studio; он должен начинаться с {folderPrefix}
        </span>
      </div>

      {/* Services, features, files */}
      <div className="grid gap-4 rounded-md border p-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Сервисы Yandex</p>
          {state.catalog.services.map((name) => (
            <label key={name} className="flex items-center gap-2 text-sm">
              <Switch
                checked={doc.services[name] === true}
                onCheckedChange={(v) => edit((d) => { d.services[name] = v })}
              />
              {SERVICE_LABELS[name] ?? name}
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Функции</p>
          {state.catalog.features.map((name) => (
            <label key={name} className="flex items-center gap-2 text-sm">
              <Switch
                checked={doc.features[name] === true}
                onCheckedChange={(v) => edit((d) => { d.features[name] = v })}
              />
              {FEATURE_LABELS[name] ?? name}
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Файлы</p>
          <Label className="flex flex-col items-start gap-1 text-xs font-normal">
            Изображения
            <NativeSelect
              value={doc.files.images}
              onChange={(e) => edit((d) => { d.files.images = e.target.value as "vision" | "native" })}
            >
              <NativeSelectOption value="vision">описание vision-моделью → текстовая модель</NativeSelectOption>
              <NativeSelectOption value="native">изображение сразу модели разбора</NativeSelectOption>
            </NativeSelect>
          </Label>
          <Label className="flex flex-col items-start gap-1 text-xs font-normal">
            Аудио: максимум секунд (1–600)
            <Input
              className="w-28"
              type="number"
              min={1}
              max={600}
              value={doc.files.maxMediaSeconds}
              onChange={(e) => edit((d) => { d.files.maxMediaSeconds = Number(e.target.value) })}
            />
          </Label>
          <Label className="flex flex-col items-start gap-1 text-xs font-normal">
            PDF: максимум страниц (1–20)
            <Input
              className="w-28"
              type="number"
              min={1}
              max={20}
              value={doc.files.pdfMaxPages}
              onChange={(e) => edit((d) => { d.files.pdfMaxPages = Number(e.target.value) })}
            />
          </Label>
        </div>
      </div>

      {/* Save */}
      <div className="flex flex-col gap-2">
        <Input
          placeholder="Комментарий к версии (что и зачем изменили)"
          value={comment}
          maxLength={500}
          onChange={(e) => setComment(e.target.value)}
        />
        {saveError && <p className="text-sm text-destructive">Проверка не прошла: {saveError}</p>}
        <p className="text-xs text-muted-foreground">
          При сохранении сервер проверяет конфигурацию и наличие ключей и URI для всего включённого, без обращений к
          Yandex. Ошибочная версия не сохраняется. Сохранённые версии не удаляются.
        </p>
      </div>

      {/* History */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Версия</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Автор</TableHead>
              <TableHead>Комментарий</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.versions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  Версий ещё нет.
                </TableCell>
              </TableRow>
            ) : (
              state.versions.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-xs">{v.id}</TableCell>
                  <TableCell className="text-xs">{formatDateTime(v.createdAt)}</TableCell>
                  <TableCell className="text-xs">{v.createdByName ?? "скрипт / система"}</TableCell>
                  <TableCell className="max-w-96 text-xs">{v.comment ?? "—"}</TableCell>
                  <TableCell>
                    {v.isActive ? (
                      <Badge variant="secondary">активна</Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={activating !== null || dirty}
                        title={dirty ? "Сначала сохраните или сбросьте изменения" : undefined}
                        onClick={() => activate(v.id)}
                      >
                        {activating === v.id && <Loader className="size-4 animate-spin" />}
                        Сделать активной
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
