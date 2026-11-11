import "server-only"

import type { TopicsMode } from "@/db/schema"
import { withAiUsageContext } from "@/server/ai"
import { ensureOrgSystemActor } from "./actor"
import { getOrgTopicsSettings } from "./settings"

// Run context of the Topics engine for one org. Every engine entry point
// (scheduler, manual «Обработать», eval harness) builds it from an explicit
// org id — never from a session — so the same code runs from cron and from
// API routes.

export type TopicsContext = {
  organizationId: string
  mode: Exclude<TopicsMode, "off">
  // Author of automatic writes («Агент Truffalo»).
  actorUserId: string
}

// null = Topics is off for this org: the caller must do nothing.
export async function loadTopicsContext(organizationId: string): Promise<TopicsContext | null> {
  const settings = await getOrgTopicsSettings(organizationId)
  if (settings.topicsMode === "off") return null
  const actorUserId = settings.systemUserId ?? (await ensureOrgSystemActor(organizationId))
  return { organizationId, mode: settings.topicsMode, actorUserId }
}

// Every LLM call inside `fn` is metered against the org and its daily cap.
export function runInTopicsContext<T>(ctx: TopicsContext, fn: () => Promise<T>): Promise<T> {
  return withAiUsageContext({ organizationId: ctx.organizationId }, fn)
}
