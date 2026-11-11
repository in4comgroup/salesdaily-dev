"use client"

// Settings → «Использование»: LLM usage per day / org / process (AI task) /
// model. Server rows are grouped by (Moscow day, org, task, model); the
// operator picks any subset of these keys and the table re-aggregates in the
// browser. «Для клиента» = our cost × (1 + current markup).

import { useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { Loader, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  apiFetch,
  errorMessage,
  formatInt,
  formatRub,
  taskLabel,
  withMarkup,
  type AdminLlmSettings,
  type LlmUsageStatRow,
} from "./shared"

type Period = "today" | "7d" | "30d" | "90d"
type GroupKey = "day" | "org" | "task" | "model"

const PERIODS: { value: Period; label: string; days: number }[] = [
  { value: "today", label: "Сегодня", days: 1 },
  { value: "7d", label: "7 дней", days: 7 },
  { value: "30d", label: "30 дней", days: 30 },
  { value: "90d", label: "90 дней", days: 90 },
]

const GROUP_KEYS: { value: GroupKey; label: string }[] = [
  { value: "day", label: "День" },
  { value: "org", label: "Организация" },
  { value: "task", label: "Процесс" },
  { value: "model", label: "Модель" },
]

const NO_ORG = "— (без организации)"

type Metrics = {
  calls: number
  errors: number
  budgetRefusals: number
  inputTokens: number
  outputTokens: number
  costRub: number
  unpricedCalls: number
  latencyWeighted: number // Σ avgLatency × calls
  p95LatencyMs: number // max of the group's p95 values
}

type Group = Metrics & {
  id: string
  day: string
  orgLabel: string
  task: string
  model: string
}

function emptyMetrics(): Metrics {
  return {
    calls: 0,
    errors: 0,
    budgetRefusals: 0,
    inputTokens: 0,
    outputTokens: 0,
    costRub: 0,
    unpricedCalls: 0,
    latencyWeighted: 0,
    p95LatencyMs: 0,
  }
}

function addRow(m: Metrics, r: LlmUsageStatRow) {
  m.calls += r.calls
  m.errors += r.errors
  m.budgetRefusals += r.budgetRefusals
  m.inputTokens += r.inputTokens
  m.outputTokens += r.outputTokens
  m.costRub += r.costRub
  m.unpricedCalls += r.unpricedCalls
  m.latencyWeighted += r.avgLatencyMs * r.calls
  if (r.calls > 0) m.p95LatencyMs = Math.max(m.p95LatencyMs, r.p95LatencyMs)
}

const avgLatency = (m: Metrics) => (m.calls > 0 ? Math.round(m.latencyWeighted / m.calls) : 0)

// Browser-side period: "today" starts at local midnight; N days = today + N-1
// previous days. The server caps the span at 92 days.
function periodRange(period: Period): { from: string; to: string } {
  const days = PERIODS.find((p) => p.value === period)?.days ?? 1
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  from.setDate(from.getDate() - (days - 1))
  const to = new Date(Date.now() + 60_000)
  return { from: from.toISOString(), to: to.toISOString() }
}

function formatDay(day: string): string {
  const [y, m, d] = day.split("-")
  return y && m && d ? `${d}.${m}.${y}` : day
}

const chartConfig = {
  costRub: { label: "Себестоимость, ₽", color: "var(--chart-1)" },
} satisfies ChartConfig

export function UsageStats() {
  const [period, setPeriod] = useState<Period>("7d")
  const [groupBy, setGroupBy] = useState<GroupKey[]>(["org", "task"])
  // `key` ties the loaded rows to the request that produced them, so
  // "loading" is derived (no synchronous setState inside the effect).
  const [data, setData] = useState<{ key: string; rows: LlmUsageStatRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [markupPercent, setMarkupPercent] = useState<number | null>(null)

  const requestKey = `${period}:${reloadTick}`
  const loading = data?.key !== requestKey && error === null

  useEffect(() => {
    let cancelled = false
    const { from, to } = periodRange(period)
    apiFetch<{ rows: LlmUsageStatRow[] }>(
      `/api/admin/llm/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    )
      .then((res) => {
        if (!cancelled) setData({ key: requestKey, rows: res.rows ?? [] })
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [period, requestKey])

  useEffect(() => {
    let cancelled = false
    apiFetch<AdminLlmSettings>("/api/admin/llm/settings")
      .then((s) => {
        if (!cancelled) setMarkupPercent(s.markupPercent)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [reloadTick])

  const rows = useMemo(() => data?.rows ?? [], [data])

  const totals = useMemo(() => {
    const m = emptyMetrics()
    for (const r of rows) addRow(m, r)
    return m
  }, [rows])

  const groups = useMemo(() => {
    const map = new Map<string, Group>()
    for (const r of rows) {
      const parts = [
        groupBy.includes("day") ? r.day : "",
        groupBy.includes("org") ? (r.organizationId ?? "∅") : "",
        groupBy.includes("task") ? r.task : "",
        groupBy.includes("model") ? r.model : "",
      ]
      const id = parts.join("|")
      let g = map.get(id)
      if (!g) {
        g = {
          ...emptyMetrics(),
          id,
          day: r.day,
          orgLabel: r.organizationId ? (r.organizationName ?? r.organizationId) : NO_ORG,
          task: r.task,
          model: r.model,
        }
        map.set(id, g)
      }
      addRow(g, r)
    }
    const list = [...map.values()]
    list.sort((a, b) => {
      if (groupBy.includes("day") && a.day !== b.day) return a.day < b.day ? 1 : -1
      if (b.costRub !== a.costRub) return b.costRub - a.costRub
      return b.calls - a.calls
    })
    return list
  }, [rows, groupBy])

  const dailyCost = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.costRub)
    return [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, costRub]) => ({ day: formatDay(day).slice(0, 5), costRub: Math.round(costRub * 100) / 100 }))
  }, [rows])

  const keyCols = GROUP_KEYS.filter((k) => groupBy.includes(k.value))

  function changePeriod(value: string) {
    if (!value) return
    setError(null)
    setPeriod(value as Period)
  }

  function reload() {
    setError(null)
    setReloadTick((t) => t + 1)
  }

  const tiles: { label: string; value: string }[] = [
    { label: "Вызовы", value: formatInt(totals.calls) },
    { label: "Ошибки", value: formatInt(totals.errors) },
    { label: "Отказы по лимиту", value: formatInt(totals.budgetRefusals) },
    { label: "Токены вход", value: formatInt(totals.inputTokens) },
    { label: "Токены выход", value: formatInt(totals.outputTokens) },
    { label: "Себестоимость, ₽", value: formatRub(totals.costRub) },
    {
      label: markupPercent === null ? "Для клиента, ₽" : `Для клиента (+${formatInt(markupPercent)} %), ₽`,
      value: markupPercent === null ? "—" : formatRub(withMarkup(totals.costRub, markupPercent)),
    },
  ]

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-medium">Статистика использования</h2>
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup type="single" variant="outline" size="sm" value={period} onValueChange={changePeriod}>
            {PERIODS.map((p) => (
              <ToggleGroupItem key={p.value} value={p.value} className="px-3">
                {p.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            {loading ? <Loader className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Обновить
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Группировать по:</span>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          value={groupBy}
          onValueChange={(v) => setGroupBy(v as GroupKey[])}
        >
          {GROUP_KEYS.map((k) => (
            <ToggleGroupItem key={k.value} value={k.value} className="px-3">
              {k.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div className="mt-1 text-lg font-medium tabular-nums">{loading ? "…" : t.value}</div>
          </div>
        ))}
      </div>

      {period !== "today" && dailyCost.length > 1 && (
        <div className="rounded-md border p-3">
          <div className="mb-2 text-xs text-muted-foreground">Себестоимость по дням, ₽</div>
          <ChartContainer config={chartConfig} style={{ height: 160 }} className="w-full">
            <BarChart accessibilityLayer data={dailyCost} margin={{ left: 4, right: 8, top: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={6} minTickGap={12} />
              <YAxis tickLine={false} axisLine={false} width={48} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="costRub" fill="var(--color-costRub)" radius={3} />
            </BarChart>
          </ChartContainer>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {keyCols.length === 0 && <TableHead>Группа</TableHead>}
              {keyCols.map((k) => (
                <TableHead key={k.value}>{k.label}</TableHead>
              ))}
              <TableHead className="text-right">Вызовы</TableHead>
              <TableHead className="text-right">Ошибки</TableHead>
              <TableHead className="text-right">Отказы (лимит)</TableHead>
              <TableHead className="text-right">Токены вх.</TableHead>
              <TableHead className="text-right">Токены вых.</TableHead>
              <TableHead className="text-right">Себестоимость, ₽</TableHead>
              <TableHead className="text-right">Для клиента, ₽</TableHead>
              <TableHead className="text-right">Ср. задержка, мс</TableHead>
              <TableHead className="text-right">p95 (макс.)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={Math.max(keyCols.length, 1) + 9} className="py-8 text-center">
                  <Loader className="mx-auto size-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : groups.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={Math.max(keyCols.length, 1) + 9}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  Нет вызовов за период.
                </TableCell>
              </TableRow>
            ) : (
              groups.map((g) => (
                <TableRow key={g.id}>
                  {keyCols.length === 0 && <TableCell>Все вызовы</TableCell>}
                  {keyCols.map((k) => (
                    <TableCell key={k.value} className="max-w-64 truncate">
                      {k.value === "day"
                        ? formatDay(g.day)
                        : k.value === "org"
                          ? g.orgLabel
                          : k.value === "task"
                            ? <span title={g.task}>{taskLabel(g.task)}</span>
                            : <span className="font-mono text-xs">{g.model}</span>}
                    </TableCell>
                  ))}
                  <MetricCells m={g} markupPercent={markupPercent} />
                </TableRow>
              ))
            )}
          </TableBody>
          {!loading && groups.length > 1 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={Math.max(keyCols.length, 1)} className="font-medium">
                  Итого
                </TableCell>
                <MetricCells m={totals} markupPercent={markupPercent} />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </section>
  )
}

function MetricCells({ m, markupPercent }: { m: Metrics; markupPercent: number | null }) {
  return (
    <>
      <TableCell className="text-right tabular-nums">{formatInt(m.calls)}</TableCell>
      <TableCell className={`text-right tabular-nums ${m.errors > 0 ? "text-destructive" : ""}`}>
        {formatInt(m.errors)}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatInt(m.budgetRefusals)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatInt(m.inputTokens)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatInt(m.outputTokens)}</TableCell>
      <TableCell className="text-right tabular-nums">
        <div className="flex items-center justify-end gap-2">
          {m.unpricedCalls > 0 && (
            <Badge variant="outline" className="text-amber-600 border-amber-300">
              нет цены: {formatInt(m.unpricedCalls)}
            </Badge>
          )}
          {formatRub(m.costRub)}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {markupPercent === null ? "—" : formatRub(withMarkup(m.costRub, markupPercent))}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatInt(avgLatency(m))}</TableCell>
      <TableCell className="text-right tabular-nums">{formatInt(m.p95LatencyMs)}</TableCell>
    </>
  )
}
