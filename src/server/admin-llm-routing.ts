import "server-only"

import { isDeepStrictEqual } from "node:util"
import { desc, eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { aiConfigVersion, user } from "@/db/schema"
import { AdminLlmError, requirePlatformAdmin } from "@/server/admin-llm"
import { getAiConfigStoreState, refreshAiConfigNow } from "@/server/ai-config-store"
import { getAiRuntime } from "@/server/ai"
import {
  AI_CAPABILITIES, AI_FEATURES, AI_SERVICES, AI_TASKS, AiConfigurationError,
  type AiConfig,
} from "@/server/ai/config"
import { prepareAiConfigDocument } from "@/server/ai/config-document"
import { createAiRuntime } from "@/server/ai/resolve"
import { AiPolicyError } from "@/server/ai/policy"
import {
  YANDEX_ENV, YANDEX_SERVICE_KEY_ENV, resolveYandexApiUrl,
} from "@/server/ai/yandex-connection"
import type { AiConfigStoreState } from "@/server/ai/config-store"

// Settings → «Модели» → «Маршруты ИИ» (platform admin): edit the AI routing
// document, save it as a new database version, make an older version active
// again. docs/ai/config-in-db-spec.md §7. Every save is checked like the
// `seed` script (schema + runtime build with this server's env, no network);
// nothing is ever deleted.

const HISTORY_LIMIT = 50
const COMMENT_MAX = 500

export type AiRoutingVersion = {
  id: number
  comment: string | null
  createdAt: string
  createdByName: string | null
  isActive: boolean
}

export type AiRoutingState = {
  // What this server process runs now.
  running: AiConfigStoreState | null
  activeVersionId: number | null
  // Editor start: the active database version, else the running configuration.
  document: AiConfig
  documentSource: "database" | "disabled"
  versions: AiRoutingVersion[]
  catalog: { tasks: string[]; capabilities: string[]; features: string[]; services: string[] }
  // Which env values this server has — names and presence only, no secrets.
  env: {
    apiUrl: string | null
    folderId: string | null
    keys: { name: string; present: boolean }[]
  }
}

function envInfo(): AiRoutingState["env"] {
  const has = (name: string) => Boolean(process.env[name]?.trim())
  let apiUrl: string | null
  try {
    apiUrl = resolveYandexApiUrl(process.env)
  } catch {
    apiUrl = null
  }
  return {
    apiUrl,
    // The folder ID is not a secret; the editor shows it as the URI prefix.
    folderId: process.env[YANDEX_ENV.folderId]?.trim() || null,
    keys: [YANDEX_ENV.apiKey, YANDEX_ENV.folderId, ...Object.values(YANDEX_SERVICE_KEY_ENV)]
      .map((name) => ({ name, present: has(name) })),
  }
}

export async function getAiRoutingState(): Promise<AiRoutingState> {
  await requirePlatformAdmin()
  const rows = await db
    .select({
      id: aiConfigVersion.id,
      config: aiConfigVersion.config,
      comment: aiConfigVersion.comment,
      createdAt: aiConfigVersion.createdAt,
      createdByName: user.name,
      isActive: aiConfigVersion.isActive,
    })
    .from(aiConfigVersion)
    .leftJoin(user, eq(user.id, aiConfigVersion.createdBy))
    .orderBy(desc(aiConfigVersion.id))
    .limit(HISTORY_LIMIT)
  const active = rows.find((r) => r.isActive)
    ?? (await db.select().from(aiConfigVersion).where(eq(aiConfigVersion.isActive, true)).limit(1))
      .map((r) => ({ ...r, createdByName: null }))[0]

  const running = getAiConfigStoreState()
  let document: AiConfig
  let documentSource: AiRoutingState["documentSource"]
  if (active) {
    document = active.config as AiConfig
    documentSource = "database"
  } else {
    // No version yet (or the running one is unknown): start from what runs.
    document = getAiRuntime().document()
    documentSource = "disabled"
  }

  return {
    running,
    activeVersionId: active?.id ?? null,
    document,
    documentSource,
    versions: rows.map((r) => ({
      id: r.id,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      createdByName: r.createdByName ?? null,
      isActive: r.isActive,
    })),
    catalog: {
      tasks: [...AI_TASKS],
      capabilities: [...AI_CAPABILITIES],
      features: [...AI_FEATURES],
      services: [...AI_SERVICES],
    },
    env: envInfo(),
  }
}

// Check failures become a 400 with the safe message (paths + rule texts).
function check<T>(fn: () => T): T {
  try {
    return fn()
  } catch (error) {
    if (error instanceof AiConfigurationError || error instanceof AiPolicyError) {
      throw new AdminLlmError("invalid", error.message)
    }
    throw error
  }
}

export async function saveAiRoutingVersion(input: { config: unknown; comment: unknown }): Promise<{ id: number }> {
  const session = await requirePlatformAdmin()
  if (!input.config || typeof input.config !== "object" || Array.isArray(input.config)) {
    throw new AdminLlmError("invalid", "config must be an object")
  }
  if (input.comment !== undefined && input.comment !== null && typeof input.comment !== "string") {
    throw new AdminLlmError("invalid", "comment must be a string")
  }
  const comment = (typeof input.comment === "string" ? input.comment.trim() : "").slice(0, COMMENT_MAX) || null
  const config = check(() => prepareAiConfigDocument(input.config, process.env))

  const id = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(aiConfigVersion)
      .where(eq(aiConfigVersion.isActive, true)).for("update")
    if (current && isDeepStrictEqual(current.config, config)) {
      throw new AdminLlmError("invalid", "Нет изменений: эта конфигурация уже активна")
    }
    if (current) {
      await tx.update(aiConfigVersion).set({ isActive: false }).where(eq(aiConfigVersion.id, current.id))
    }
    const [inserted] = await tx.insert(aiConfigVersion)
      .values({ config, comment, createdBy: session.user.id, isActive: true })
      .returning({ id: aiConfigVersion.id })
    return inserted.id
  })
  await refreshAiConfigNow()
  return { id }
}

export async function activateAiRoutingVersion(rawId: unknown): Promise<{ id: number }> {
  await requirePlatformAdmin()
  const id = typeof rawId === "number" ? rawId : typeof rawId === "string" ? Number(rawId) : Number.NaN
  if (!Number.isSafeInteger(id) || id <= 0) throw new AdminLlmError("invalid", "id must be a positive integer")
  const [row] = await db.select().from(aiConfigVersion).where(eq(aiConfigVersion.id, id)).limit(1)
  if (!row) throw new AdminLlmError("not_found", "Version not found")
  if (row.isActive) return { id }
  // An older version must still work with this server's env (keys, folder).
  check(() => createAiRuntime(row.config, process.env))

  await db.transaction(async (tx) => {
    await tx.update(aiConfigVersion).set({ isActive: false }).where(eq(aiConfigVersion.isActive, true))
    await tx.update(aiConfigVersion).set({ isActive: true }).where(eq(aiConfigVersion.id, id))
  })
  await refreshAiConfigNow()
  return { id }
}
