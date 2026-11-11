import "server-only"

import { db } from "@/db/drizzle"
import { user } from "@/db/schema"
import { getOrgTopicsSettings, updateOrgTopicsSettings } from "./settings"

// Per-org system actor «Агент Truffalo» (Q14, spec §13): the author of every
// automatic write of the engine (deals, tasks, journal rows).
//
// It is a plain `user` row WITHOUT a `member` row, so it never appears in
// member lists, pickers or analytics. It cannot sign in: no `account` row
// (no password / OAuth), `banned = true` (blocks OTP too) and an `.invalid`
// e-mail domain that can never receive mail.
//
// Ids are deterministic, so concurrent calls converge on one row.

export const SYSTEM_ACTOR_NAME = "Агент Truffalo"

export function systemActorUserId(organizationId: string) {
  return `system-agent-${organizationId}`
}

function systemActorEmail(organizationId: string) {
  const safe = organizationId.toLowerCase().replace(/[^a-z0-9-]/g, "-")
  return `agent+${safe}@system.salesdaily.invalid`
}

export async function ensureOrgSystemActor(organizationId: string): Promise<string> {
  const current = await getOrgTopicsSettings(organizationId)
  if (current.systemUserId) return current.systemUserId

  const id = systemActorUserId(organizationId)
  await db
    .insert(user)
    .values({
      id,
      name: SYSTEM_ACTOR_NAME,
      email: systemActorEmail(organizationId),
      emailVerified: false,
      role: "user",
      banned: true,
      banReason: "System actor (Topics engine). Not a login account.",
    })
    .onConflictDoNothing({ target: user.id })
  await updateOrgTopicsSettings(organizationId, { systemUserId: id }, null)
  return id
}
