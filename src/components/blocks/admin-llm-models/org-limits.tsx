"use client"

// Section B «Лимиты и Темы по организациям»: platform default daily cap,
// per-org cap override, per-org Topics mode, today's spend.

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  formatInt,
  formatRub,
  jsonInit,
  parseDecimal,
  type AdminLlmOrgRow,
  type AdminLlmSettings,
  type TopicsMode,
} from "./shared"

const MODE_LABELS: Record<TopicsMode, string> = {
  off: "Выкл.",
  shadow: "Тень",
  on: "Вкл.",
}

const MAX_CAP = 1_000_000

async function fetchOrgLimits() {
  const [s, o] = await Promise.all([
    apiFetch<AdminLlmSettings>("/api/admin/llm/settings"),
    apiFetch<{ orgs: AdminLlmOrgRow[] }>("/api/admin/llm/orgs"),
  ])
  return { s, o: o.orgs ?? [] }
}

export function OrgLimits() {
  const [settings, setSettings] = useState<AdminLlmSettings | null>(null)
  const [orgs, setOrgs] = useState<AdminLlmOrgRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const apply = useCallback((s: AdminLlmSettings, o: AdminLlmOrgRow[]) => {
    setSettings(s)
    setOrgs(o)
    setError(null)
  }, [])

  const load = useCallback(async () => {
    try {
      const { s, o } = await fetchOrgLimits()
      apply(s, o)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [apply])

  useEffect(() => {
    let cancelled = false
    fetchOrgLimits()
      .then(({ s, o }) => {
        if (!cancelled) apply(s, o)
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e))
      })
    return () => {
      cancelled = true
    }
  }, [apply])

  async function refresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  async function updateOrg(
    org: AdminLlmOrgRow,
    patch: { topicsMode?: TopicsMode; llmDailyCapRub?: number | null },
    successMessage: string,
  ): Promise<boolean> {
    try {
      await apiFetch("/api/admin/llm/orgs", jsonInit("PUT", { organizationId: org.organizationId, ...patch }))
      toast.success(successMessage)
      await load()
      return true
    } catch (e) {
      toast.error(errorMessage(e))
      return false
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium">Лимиты и Темы по организациям</h2>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          {refreshing ? <Loader className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Обновить
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {settings && <DefaultCapEditor key={settings.dailyCapRubDefault} settings={settings} onSaved={load} />}

      <p className="text-xs text-muted-foreground">
        Тень — движок работает, пользователи ничего не видят. Вкл. — пользователи видят темы.
      </p>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Организация</TableHead>
              <TableHead>Режим «Темы»</TableHead>
              <TableHead>Лимит ₽/день</TableHead>
              <TableHead>Потрачено сегодня, ₽</TableHead>
              <TableHead className="text-right">Вызовы сегодня</TableHead>
              <TableHead className="text-right">Отказы сегодня</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs === null ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center">
                  {error ? (
                    <span className="text-sm text-muted-foreground">Нет данных.</span>
                  ) : (
                    <Loader className="mx-auto size-5 animate-spin text-muted-foreground" />
                  )}
                </TableCell>
              </TableRow>
            ) : orgs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Организаций нет.
                </TableCell>
              </TableRow>
            ) : (
              orgs.map((org) => (
                <OrgRow
                  key={`${org.organizationId}:${org.llmDailyCapRub ?? "default"}`}
                  org={org}
                  defaultCap={settings?.dailyCapRubDefault ?? null}
                  onUpdate={updateOrg}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function DefaultCapEditor({
  settings,
  onSaved,
}: {
  settings: AdminLlmSettings
  onSaved: () => Promise<void>
}) {
  const [draft, setDraft] = useState(String(settings.dailyCapRubDefault))
  const [saving, setSaving] = useState(false)

  async function save() {
    const value = parseDecimal(draft)
    if (value === null || Number.isNaN(value) || value > MAX_CAP) {
      toast.error(`Лимит — число от 0 до ${formatInt(MAX_CAP)}`)
      return
    }
    setSaving(true)
    try {
      await apiFetch("/api/admin/llm/settings", jsonInit("PUT", { dailyCapRubDefault: value }))
      toast.success("Лимит по умолчанию сохранён")
      await onSaved()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <label htmlFor="llm-default-cap" className="text-sm font-medium">
        Лимит по умолчанию, ₽ в день на организацию
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="llm-default-cap"
          inputMode="decimal"
          className="w-40"
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
          Встроенное значение: {formatRub(settings.builtInDailyCapRub)} ₽
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        День считается по времени {settings.dayTimeZone}. Вызовы без цены не учитываются в лимите.
      </p>
    </div>
  )
}

function OrgRow({
  org,
  defaultCap,
  onUpdate,
}: {
  org: AdminLlmOrgRow
  defaultCap: number | null
  onUpdate: (
    org: AdminLlmOrgRow,
    patch: { topicsMode?: TopicsMode; llmDailyCapRub?: number | null },
    successMessage: string,
  ) => Promise<boolean>
}) {
  const [capDraft, setCapDraft] = useState(org.llmDailyCapRub == null ? "" : String(org.llmDailyCapRub))
  const [savingCap, setSavingCap] = useState(false)
  const [savingMode, setSavingMode] = useState(false)

  const ratio = org.effectiveCapRub > 0 ? org.spentTodayRub / org.effectiveCapRub : org.spentTodayRub > 0 ? 1 : 0
  const over = ratio >= 1
  const pct = Math.min(100, Math.round(ratio * 100))

  async function saveCap() {
    const value = parseDecimal(capDraft)
    if (value !== null && (Number.isNaN(value) || value > MAX_CAP)) {
      toast.error(`Лимит — число от 0 до ${formatInt(MAX_CAP)} или пусто`)
      return
    }
    if (value === org.llmDailyCapRub) return
    setSavingCap(true)
    const ok = await onUpdate(
      org,
      { llmDailyCapRub: value },
      value === null
        ? `«${org.organizationName}»: лимит по умолчанию`
        : `«${org.organizationName}»: лимит ${formatRub(value)} ₽/день`,
    )
    // On success the row remounts with fresh data (its key carries the cap).
    if (!ok) setSavingCap(false)
  }

  async function saveMode(mode: string) {
    if (mode === org.topicsMode) return
    setSavingMode(true)
    await onUpdate(
      org,
      { topicsMode: mode as TopicsMode },
      `«${org.organizationName}»: режим «Темы» — ${MODE_LABELS[mode as TopicsMode]}`,
    )
    setSavingMode(false)
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{org.organizationName}</TableCell>
      <TableCell>
        <Select value={org.topicsMode} onValueChange={saveMode} disabled={savingMode}>
          <SelectTrigger size="sm" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(MODE_LABELS) as TopicsMode[]).map((m) => (
              <SelectItem key={m} value={m}>
                {MODE_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            inputMode="decimal"
            className="h-8 w-48"
            value={capDraft}
            disabled={savingCap}
            placeholder={defaultCap === null ? "по умолчанию" : `по умолчанию (${formatRub(defaultCap)} ₽)`}
            onChange={(e) => setCapDraft(e.target.value)}
            onBlur={saveCap}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur()
            }}
          />
          {savingCap && <Loader className="size-4 animate-spin text-muted-foreground" />}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex min-w-40 flex-col gap-1">
          <span className={`text-sm tabular-nums ${over ? "font-medium text-destructive" : ""}`}>
            {formatRub(org.spentTodayRub)} / {formatRub(org.effectiveCapRub)}
          </span>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${over ? "bg-destructive" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatInt(org.callsToday)}</TableCell>
      <TableCell className={`text-right tabular-nums ${org.refusalsToday > 0 ? "text-destructive" : ""}`}>
        {formatInt(org.refusalsToday)}
      </TableCell>
    </TableRow>
  )
}
