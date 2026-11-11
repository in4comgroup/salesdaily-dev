import "server-only"

import { sql } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { loadAiConfig } from "@/server/ai/config"
import { createAiConfigStore, type AiConfigStoreState } from "@/server/ai/config-store"
import { setAiRuntime } from "@/server/ai/resolve"

// Database side of the AI configuration (docs/ai/config-in-db-spec.md). The
// only reader of `ai_config_version`. Rules: src/server/ai/config-store.ts.
//
// Started once per Node.js process from src/instrumentation.ts: loads the
// active version before requests are served, then checks every 30 s and
// swaps the runtime when another version becomes active. Never throws — a
// configuration problem turns AI off, it does not stop the app.

const CHECK_INTERVAL_MS = 30_000

type Store = ReturnType<typeof createAiConfigStore>
const STORE_KEY = Symbol.for("crm.ai.configStore")
function globalStore(): { store?: Store } {
  const g = globalThis as unknown as Record<symbol, { store?: Store } | undefined>
  return (g[STORE_KEY] ??= {})
}

function createDbStore(): Store {
  return createAiConfigStore({
    env: process.env,
    apply: setAiRuntime,
    // The ConfigMap file is the fallback until stage 4 removes it.
    readFile: () => (process.env.AI_CONFIG_PATH?.trim() ? loadAiConfig(process.env) : null),
    source: {
      async readActiveId() {
        const result = await db.execute<{ id: string }>(sql`
          SELECT id FROM public.ai_config_version WHERE is_active LIMIT 1
        `)
        return result.rows[0] ? Number(result.rows[0].id) : null
      },
      async readActive() {
        const result = await db.execute<{ id: string; config: unknown }>(sql`
          SELECT id, config FROM public.ai_config_version WHERE is_active LIMIT 1
        `)
        const row = result.rows[0]
        return row ? { id: Number(row.id), config: row.config } : null
      },
    },
  })
}

export async function startAiConfigStore(): Promise<void> {
  const holder = globalStore()
  if (holder.store) return
  const store = createDbStore()
  holder.store = store
  await store.load()
  setInterval(() => {
    store.check().catch((error) => {
      console.error("[ai-config] check failed:", error instanceof Error ? error.message : "unknown")
    })
  }, CHECK_INTERVAL_MS).unref()
}

// After an admin save / activation: apply it on this pod at once (other pods
// follow within CHECK_INTERVAL_MS).
export async function refreshAiConfigNow(): Promise<void> {
  await globalStore().store?.check()
}

// For the admin UI and diagnostics: what this process runs now.
export function getAiConfigStoreState(): AiConfigStoreState | null {
  return globalStore().store?.state() ?? null
}
