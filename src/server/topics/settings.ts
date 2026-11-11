import "server-only"

import { eq, inArray, sql } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { organizationSettings, topicsMode, type TopicsMode } from "@/db/schema"

// Per-org Topics settings (spec §13). Engine module: every function takes the
// org id explicitly and never reads the session. Access checks belong to the
// caller (API route / admin server function).

export const TOPICS_MODES = topicsMode.enumValues
export function isTopicsMode(value: unknown): value is TopicsMode {
  return typeof value === "string" && (TOPICS_MODES as readonly string[]).includes(value)
}

export type OrgTopicsSettings = {
  organizationId: string
  topicsMode: TopicsMode
  llmDailyCapRub: number | null
  systemUserId: string | null
}

// Absent row = defaults (`off`, platform cap, no actor yet).
export async function getOrgTopicsSettings(organizationId: string): Promise<OrgTopicsSettings> {
  const [row] = await db
    .select()
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1)
  return {
    organizationId,
    topicsMode: row?.topicsMode ?? "off",
    llmDailyCapRub: row?.llmDailyCapRub == null ? null : Number(row.llmDailyCapRub),
    systemUserId: row?.systemUserId ?? null,
  }
}

export async function getTopicsMode(organizationId: string): Promise<TopicsMode> {
  return (await getOrgTopicsSettings(organizationId)).topicsMode
}

// Org ids in the given modes — for the scheduler (phase 2+).
export async function listOrgIdsByTopicsMode(modes: readonly TopicsMode[]): Promise<string[]> {
  if (modes.length === 0) return []
  const rows = await db
    .select({ id: organizationSettings.organizationId })
    .from(organizationSettings)
    .where(inArray(organizationSettings.topicsMode, [...modes]))
  return rows.map((r) => r.id)
}

// Upsert. `undefined` fields stay unchanged; `llmDailyCapRub: null` clears the
// override (back to the platform default).
export async function updateOrgTopicsSettings(
  organizationId: string,
  patch: { topicsMode?: TopicsMode; llmDailyCapRub?: number | null; systemUserId?: string | null },
  actorUserId: string | null,
): Promise<void> {
  if (patch.topicsMode !== undefined && !isTopicsMode(patch.topicsMode)) {
    throw new Error("Invalid topics mode")
  }
  if (patch.llmDailyCapRub != null && (!Number.isFinite(patch.llmDailyCapRub) || patch.llmDailyCapRub < 0)) {
    throw new Error("Invalid daily cap")
  }
  const values = {
    ...(patch.topicsMode !== undefined ? { topicsMode: patch.topicsMode } : {}),
    ...(patch.llmDailyCapRub !== undefined
      ? { llmDailyCapRub: patch.llmDailyCapRub == null ? null : patch.llmDailyCapRub.toFixed(2) }
      : {}),
    ...(patch.systemUserId !== undefined ? { systemUserId: patch.systemUserId } : {}),
  }
  await db
    .insert(organizationSettings)
    .values({ organizationId, ...values, updatedBy: actorUserId })
    .onConflictDoUpdate({
      target: organizationSettings.organizationId,
      set: { ...values, updatedAt: sql`now()`, updatedBy: actorUserId },
    })
}
