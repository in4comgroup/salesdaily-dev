"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  ClientResponsibleOption,
  ClientResponsibleState,
} from "@/app/api/clients/[id]/responsible/route"

// «Ответственный» picker for one client. The trigger shows the current
// responsible user immediately (from props); the option list is fetched only
// when the dropdown is first opened. Server rules (mirrored here):
//   org owner / admin → any member; plain member → org owners only.
export function ClientResponsibleSelect({
  clientId,
  responsibleUserId,
  responsibleName,
  onChanged,
  className,
}: {
  clientId: string
  responsibleUserId: string
  responsibleName: string | null
  onChanged?: (next: { responsibleUserId: string; responsibleName: string }) => void
  className?: string
}) {
  const [current, setCurrent] = useState({
    id: responsibleUserId,
    name: responsibleName,
  })
  const [options, setOptions] = useState<ClientResponsibleOption[] | null>(null)
  const [canAssignAny, setCanAssignAny] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Follow the parent when it reloads the client (or switches to another one).
  useEffect(() => {
    setCurrent({ id: responsibleUserId, name: responsibleName })
  }, [responsibleUserId, responsibleName])
  useEffect(() => {
    setOptions(null)
  }, [clientId])

  async function loadOptions() {
    if (options || loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/responsible`)
      const data = (await res.json()) as ClientResponsibleState & {
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить список")
      setOptions(data.options)
      setCanAssignAny(data.canAssignAny)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось загрузить список")
    } finally {
      setLoading(false)
    }
  }

  async function assign(userId: string) {
    if (userId === current.id) return
    const prev = current
    const picked = options?.find((o) => o.id === userId)
    setCurrent({ id: userId, name: picked?.name ?? null })
    setSaving(true)
    try {
      const res = await fetch(`/api/clients/${clientId}/responsible`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Не удалось сохранить")
      setCurrent({ id: data.responsibleUserId, name: data.responsibleName })
      toast.success(`Ответственный: ${data.responsibleName}`)
      onChanged?.(data)
    } catch (e) {
      setCurrent(prev)
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
    } finally {
      setSaving(false)
    }
  }

  const currentInOptions = options?.some((o) => o.id === current.id) ?? false

  return (
    <Select
      value={current.id}
      onValueChange={assign}
      onOpenChange={(open) => {
        if (open) void loadOptions()
      }}
      disabled={saving}
    >
      <SelectTrigger size="sm" className={className}>
        <SelectValue>{current.name ?? "—"}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {/* Keep the current value selectable-looking even when the caller
            may not pick it (a non-owner viewing a member's client). */}
        {!currentInOptions && (
          <SelectItem value={current.id} disabled>
            {current.name ?? "—"}
          </SelectItem>
        )}
        {loading && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Загрузка…
          </div>
        )}
        {options?.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
            {o.isOwner && (
              <span className="ml-1 text-xs text-muted-foreground">
                · владелец
              </span>
            )}
          </SelectItem>
        ))}
        {options && !canAssignAny && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground border-t mt-1">
            Передать компанию можно только владельцу организации
          </div>
        )}
      </SelectContent>
    </Select>
  )
}
