"use client"

// «Цены Yandex»: the automatic daily price sync from the Yandex Billing API
// (src/server/llm-pricing.ts) and the link of each model to its Yandex price
// items (SKU = one line of the Yandex price list). A linked model gets a new
// «авто» price row when Yandex changes the price; an unlinked model keeps the
// manual prices below.

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  SKU_MODE_LABELS,
  apiFetch,
  errorMessage,
  formatDateTime,
  formatPrice,
  jsonInit,
  type PriceSyncRun,
  type PriceSyncState,
  type YandexSkuGroup,
} from "./shared"

const NO_LINK = "__none__"

const STATUS_LABELS: Record<PriceSyncRun["status"], string> = {
  ok: "успешно",
  partial: "с ошибками",
  failed: "ошибка",
  not_configured: "не настроено",
}

function groupLabel(g: YandexSkuGroup) {
  return `${g.modelName} · ${SKU_MODE_LABELS[g.mode]}`
}

export function PriceSync() {
  const [state, setState] = useState<PriceSyncState | null>(null)
  const [groups, setGroups] = useState<YandexSkuGroup[] | null>(null)
  const [groupsError, setGroupsError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [savingModel, setSavingModel] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const st = await apiFetch<PriceSyncState>("/api/admin/llm/price-sync")
      setState(st)
      setError(null)
      if (st.configured) {
        apiFetch<{ groups: YandexSkuGroup[] | null }>("/api/admin/llm/sku-links")
          .then((res) => {
            setGroups(res.groups ?? [])
            setGroupsError(null)
          })
          .catch((e) => setGroupsError(errorMessage(e)))
      }
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const groupBySkus = useMemo(() => {
    const map = new Map<string, YandexSkuGroup>()
    for (const g of groups ?? []) map.set(`${g.inputSkuId}|${g.outputSkuId}`, g)
    return map
  }, [groups])

  async function runNow() {
    setRunning(true)
    try {
      const res = await apiFetch<{ run: PriceSyncRun }>("/api/admin/llm/price-sync", { method: "POST" })
      const run = res.run
      if (run.status === "ok") {
        toast.success(run.added.length > 0 ? `Добавлено цен: ${run.added.length}` : "Цены не изменились")
      } else if (run.status === "not_configured") {
        toast.error("Синхронизация не настроена")
      } else {
        toast.error(`Синхронизация: ${STATUS_LABELS[run.status]}`)
      }
      window.dispatchEvent(new Event("llm-prices-changed"))
      await load()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setRunning(false)
    }
  }

  async function saveLink(model: string, value: string) {
    const group = (groups ?? []).find((g) => g.key === value)
    if (value !== NO_LINK && !group) return
    setSavingModel(model)
    try {
      await apiFetch(
        "/api/admin/llm/sku-links",
        jsonInit("PUT", {
          model,
          inputSkuId: group ? group.inputSkuId : null,
          outputSkuId: group ? group.outputSkuId : null,
        }),
      )
      toast.success(group ? `${model}: связь сохранена. Нажмите «Обновить цены».` : `${model}: синхронизация выключена`)
      await load()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSavingModel(null)
    }
  }

  const rows = useMemo(() => {
    if (!state) return []
    return [
      ...state.links.map((l) => ({ model: l.model, link: l })),
      ...state.unlinkedModels.map((model) => ({ model, link: null })),
    ].sort((a, b) => a.model.localeCompare(b.model))
  }, [state])

  const lastRun = state?.lastRun ?? null

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-medium">Цены Yandex (автоматически)</h2>
        <Button variant="outline" size="sm" onClick={runNow} disabled={running || !state?.configured}>
          {running ? <Loader className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Обновить цены
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {state && !state.configured && (
        <p className="rounded-md border border-amber-300 p-3 text-sm text-amber-700 dark:text-amber-400">
          {state.configError
            ? `Ошибка настройки: ${state.configError}`
            : "Синхронизация не настроена: нужны переменные YANDEX_BILLING_SA_KEY и YANDEX_BILLING_ACCOUNT_ID. Пока цены можно вводить вручную ниже."}
        </p>
      )}

      {state?.configured && (
        <div className="flex flex-col gap-1 rounded-md border p-3 text-sm">
          <p className="text-muted-foreground">
            Цены проверяются раз в сутки. Новая цена добавляется, только если Yandex её изменил.
          </p>
          {lastRun ? (
            <>
              <p>
                Последняя проверка: {formatDateTime(lastRun.at)} ({lastRun.trigger === "manual" ? "вручную" : "по расписанию"}) —{" "}
                <span className={lastRun.status === "ok" ? "" : "text-destructive"}>{STATUS_LABELS[lastRun.status]}</span>
                {lastRun.added.length > 0 ? `, добавлено цен: ${lastRun.added.length}` : ", цены не изменились"}.
              </p>
              {lastRun.added.map((a) => (
                <p key={`${a.model}|${a.validFrom}`} className="text-xs text-muted-foreground">
                  {a.model}: вход {formatPrice(a.inputRubPer1k)} ₽, выход {formatPrice(a.outputRubPer1k)} ₽ с{" "}
                  {formatDateTime(a.validFrom)}
                </p>
              ))}
              {lastRun.errors.map((e, i) => (
                <p key={i} className="text-xs text-destructive">
                  {e.model ? `${e.model}: ` : ""}
                  {e.message}
                </p>
              ))}
            </>
          ) : (
            <p>Проверок ещё не было. Первая — через несколько минут после запуска приложения.</p>
          )}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Модель</TableHead>
              <TableHead>Позиция прайса Yandex</TableHead>
              <TableHead>Связь</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state === null ? (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center">
                  {error ? (
                    <span className="text-sm text-muted-foreground">Нет данных.</span>
                  ) : (
                    <Loader className="mx-auto size-5 animate-spin text-muted-foreground" />
                  )}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                  Нет моделей.
                </TableCell>
              </TableRow>
            ) : (
              rows.map(({ model, link }) => {
                const current = link ? groupBySkus.get(`${link.inputSkuId}|${link.outputSkuId}`) : undefined
                const selectValue = link ? (current?.key ?? "__custom__") : NO_LINK
                return (
                  <TableRow key={model}>
                    <TableCell className="font-mono text-xs">{model}</TableCell>
                    <TableCell>
                      {state.configured && groups ? (
                        <NativeSelect
                          className="w-80"
                          value={selectValue}
                          disabled={savingModel === model}
                          onChange={(e) => saveLink(model, e.target.value)}
                        >
                          <NativeSelectOption value={NO_LINK}>— не синхронизировать —</NativeSelectOption>
                          {selectValue === "__custom__" && link && (
                            <NativeSelectOption value="__custom__" disabled>
                              {`SKU ${link.inputSkuId} / ${link.outputSkuId} (нет в прайсе)`}
                            </NativeSelectOption>
                          )}
                          {groups.map((g) => (
                            <NativeSelectOption key={g.key} value={g.key}>
                              {groupLabel(g)}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      ) : link ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {current ? groupLabel(current) : `SKU ${link.inputSkuId} / ${link.outputSkuId}`}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                      {state.configured && !groups && !groupsError && (
                        <Loader className="ml-2 inline size-4 animate-spin text-muted-foreground" />
                      )}
                    </TableCell>
                    <TableCell>
                      {link ? (
                        <Badge variant="secondary">{link.source === "default" ? "встроенная" : "задана админом"}</Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-300 text-amber-600">
                          нет связи
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
      {groupsError && <p className="text-xs text-destructive">Прайс Yandex не загружен: {groupsError}</p>}
      <p className="text-xs text-muted-foreground">
        Модель без связи не получает цену автоматически: её вызовы показаны как «нет цены», пока не
        добавлена ручная цена.
      </p>
    </section>
  )
}
