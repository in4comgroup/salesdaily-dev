"use client"

// «Цены моделей» (₽ за 1 000 токенов): price history per model + markup.
// Rows marked «авто» come from the Yandex price sync (price-sync.tsx); a
// manual row is still possible for a model without a link. Cost is computed
// when a call is recorded, so a new price only affects calls from its
// «Действует с» on. «Для клиента» = price × (1 + markup / 100), display only.

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader, Plus, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
  formatInt,
  formatPrice,
  jsonInit,
  parseDecimal,
  withMarkup,
  type AdminLlmSettings,
  type LlmPriceRow,
} from "./shared"

const MAX_PRICE = 100_000
const MAX_MARKUP = 1000

export function ModelPrices() {
  const [prices, setPrices] = useState<LlmPriceRow[] | null>(null)
  const [knownModels, setKnownModels] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<AdminLlmSettings | null>(null)

  const [model, setModel] = useState("")
  const [inputPrice, setInputPrice] = useState("")
  const [outputPrice, setOutputPrice] = useState("")
  const [validFrom, setValidFrom] = useState("")
  const [adding, setAdding] = useState(false)

  const [pendingDelete, setPendingDelete] = useState<LlmPriceRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      const [res, st] = await Promise.all([
        apiFetch<{ prices: LlmPriceRow[]; knownModels: string[] }>("/api/admin/llm/prices"),
        apiFetch<AdminLlmSettings>("/api/admin/llm/settings"),
      ])
      setPrices(res.prices ?? [])
      setKnownModels(res.knownModels ?? [])
      setSettings(st)
      setError(null)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // The price sync block reloads this list after a run.
  useEffect(() => {
    const onChange = () => load()
    window.addEventListener("llm-prices-changed", onChange)
    return () => window.removeEventListener("llm-prices-changed", onChange)
  }, [load])

  const markup = settings?.markupPercent ?? null

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const name = model.trim()
    if (!name) {
      toast.error("Укажите модель")
      return
    }
    const inp = parseDecimal(inputPrice)
    const out = parseDecimal(outputPrice)
    const valid = (v: number | null): v is number => v !== null && !Number.isNaN(v) && v <= MAX_PRICE
    if (!valid(inp) || !valid(out)) {
      toast.error("Цены — числа от 0 до 100 000 ₽ за 1 000 токенов")
      return
    }
    let validFromIso: string | undefined
    if (validFrom) {
      const d = new Date(validFrom)
      if (Number.isNaN(d.getTime())) {
        toast.error("Неверная дата «Действует с»")
        return
      }
      validFromIso = d.toISOString()
    }
    setAdding(true)
    try {
      await apiFetch(
        "/api/admin/llm/prices",
        jsonInit("POST", { model: name, inputRubPer1k: inp, outputRubPer1k: out, validFrom: validFromIso }),
      )
      toast.success(`Цена для ${name} добавлена`)
      setModel("")
      setInputPrice("")
      setOutputPrice("")
      setValidFrom("")
      await load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setAdding(false)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await apiFetch(`/api/admin/llm/prices?id=${encodeURIComponent(pendingDelete.id)}`, { method: "DELETE" })
      toast.success("Цена удалена")
      setPendingDelete(null)
      await load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-base font-medium">Цены моделей (₽ за 1 000 токенов)</h2>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {settings && <MarkupEditor key={settings.markupPercent} settings={settings} onSaved={load} />}

      <form onSubmit={add} className="flex flex-col gap-2 rounded-md border p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Модель
            <Input
              list="llm-known-models"
              className="w-64"
              placeholder="yandexgpt/latest"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
            <datalist id="llm-known-models">
              {knownModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Вход, ₽
            <Input
              inputMode="decimal"
              className="w-28"
              placeholder="0,40"
              value={inputPrice}
              onChange={(e) => setInputPrice(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Выход, ₽
            <Input
              inputMode="decimal"
              className="w-28"
              placeholder="0,40"
              value={outputPrice}
              onChange={(e) => setOutputPrice(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Действует с
            <Input
              type="datetime-local"
              className="w-56"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </label>
          <Button type="submit" size="sm" className="h-9" disabled={adding}>
            {adding ? <Loader className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Добавить
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Ручная цена — для модели без связи с прайсом Yandex. Для связанной модели синхронизация
          добавит цену Yandex, если она отличается. Название без gpt://папка/, например
          yandexgpt-5.1. Новая цена действует только для новых вызовов. Пустое «Действует с» — с
          текущего момента.
        </p>
      </form>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Модель</TableHead>
              <TableHead className="text-right">Вход</TableHead>
              <TableHead className="text-right">Выход</TableHead>
              <TableHead className="text-right">Клиенту вход</TableHead>
              <TableHead className="text-right">Клиенту выход</TableHead>
              <TableHead>Действует с</TableHead>
              <TableHead>Источник</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {prices === null ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center">
                  {error ? (
                    <span className="text-sm text-muted-foreground">Нет данных.</span>
                  ) : (
                    <Loader className="mx-auto size-5 animate-spin text-muted-foreground" />
                  )}
                </TableCell>
              </TableRow>
            ) : prices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  Цен пока нет. Вызовы без цены не учитываются в стоимости и лимите.
                </TableCell>
              </TableRow>
            ) : (
              prices.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.model}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPrice(p.inputRubPer1k)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPrice(p.outputRubPer1k)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {markup === null ? "—" : formatPrice(withMarkup(p.inputRubPer1k, markup))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {markup === null ? "—" : formatPrice(withMarkup(p.outputRubPer1k, markup))}
                  </TableCell>
                  <TableCell>{formatDateTime(p.validFrom)}</TableCell>
                  <TableCell>
                    {p.auto ? <Badge variant="secondary">авто (Yandex)</Badge> : <Badge variant="outline">вручную</Badge>}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      aria-label="Удалить цену"
                      onClick={() => setPendingDelete(p)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить цену?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && (
                <>
                  {pendingDelete.model}: вход {formatPrice(pendingDelete.inputRubPer1k)} ₽, выход{" "}
                  {formatPrice(pendingDelete.outputRubPer1k)} ₽, действует с{" "}
                  {formatDateTime(pendingDelete.validFrom)}. Стоимость уже записанных вызовов не
                  изменится.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                confirmDelete()
              }}
            >
              {deleting && <Loader className="size-4 animate-spin" />}
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function MarkupEditor({ settings, onSaved }: { settings: AdminLlmSettings; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(String(settings.markupPercent))
  const [saving, setSaving] = useState(false)

  async function save() {
    const value = parseDecimal(draft)
    if (value === null || Number.isNaN(value) || value > MAX_MARKUP) {
      toast.error(`Наценка — число от 0 до ${formatInt(MAX_MARKUP)} %`)
      return
    }
    setSaving(true)
    try {
      await apiFetch("/api/admin/llm/settings", jsonInit("PUT", { markupPercent: value }))
      toast.success("Наценка сохранена")
      await onSaved()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <label htmlFor="llm-markup" className="text-sm font-medium">
        Наценка для клиента, %
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="llm-markup"
          inputMode="decimal"
          className="w-28"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save()
          }}
        />
        <Button size="sm" onClick={save} disabled={saving}>
          {saving && <Loader className="size-4 animate-spin" />}
          Сохранить
        </Button>
        <span className="text-xs text-muted-foreground">
          Встроенное значение: {formatInt(settings.builtInMarkupPercent)} %
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Цена для клиента = себестоимость × (1 + наценка / 100). Дневной лимит считается по
        себестоимости.
      </p>
    </div>
  )
}
