import "server-only"

import { DISABLED_AI_CONFIG, type AiEnvironment } from "./config"
import { createAiRuntime, type AiRuntime } from "./resolve"

// Which AI configuration the process runs (docs/ai/config-in-db-spec.md).
// No database import here: the DB access is injected (src/server/ai-config-store.ts),
// so the rules below are tested with a stub in tools/ai/runtime.test.ts.
//
//   1. The active row of `ai_config_version` wins.
//   2. No active row (the seed script has not run yet) or the database is
//      unreachable before anything was loaded → the JSON file (AI_CONFIG_PATH,
//      ConfigMap crm-ai-config) while it still exists.
//   3. Otherwise → everything off (the rest of the CRM keeps working).
//
// An invalid active version (bad document, missing env key, wrong folder)
// never falls back to the file: AI stays off and the error is visible.
// A later check that fails keeps the last working configuration.

export type AiConfigSource = {
  readActiveId(): Promise<number | null>
  readActive(): Promise<{ id: number; config: unknown } | null>
}

export type AiConfigStoreState = {
  source: "database" | "file" | "disabled"
  versionId: number | null
  lastError: string | null
  checkedAt: string | null
}

export function createAiConfigStore(options: {
  source: AiConfigSource
  env: AiEnvironment
  // Returns the parsed file, null when no file is configured; throws when the
  // file is unreadable.
  readFile: () => unknown | null
  apply: (runtime: AiRuntime) => void
  build?: (input: unknown, env: AiEnvironment) => AiRuntime
  log?: (message: string) => void
}) {
  const build = options.build ?? ((input, env) => createAiRuntime(input, env))
  const log = options.log ?? ((message) => console.log(`[ai-config] ${message}`))
  const state: AiConfigStoreState = { source: "disabled", versionId: null, lastError: null, checkedAt: null }
  let applied = false
  // Saved versions never change, so a version that failed to build fails
  // again; it is not retried every check.
  let failedVersionId: number | null = null

  const activate = (runtime: AiRuntime, source: AiConfigStoreState["source"], versionId: number | null) => {
    options.apply(runtime)
    applied = true
    const changed = state.source !== source || state.versionId !== versionId
    state.source = source
    state.versionId = versionId
    if (changed) log(source === "database" ? `using database version ${versionId}` : `using ${source} configuration`)
  }

  const fail = (message: string) => {
    state.lastError = message.slice(0, 300)
    console.error(`[ai-config] ${state.lastError}`)
  }

  const applyFileOrDisabled = (reason: string) => {
    try {
      const file = options.readFile()
      if (file !== null) {
        activate(build(file, options.env), "file", null)
        return
      }
    } catch (error) {
      fail(`${reason}; file configuration failed: ${message(error)}`)
      activate(build(DISABLED_AI_CONFIG, {}), "disabled", null)
      return
    }
    activate(build(DISABLED_AI_CONFIG, {}), "disabled", null)
  }

  async function load(): Promise<void> {
    state.checkedAt = new Date().toISOString()
    let row: { id: number; config: unknown } | null
    try {
      row = await options.source.readActive()
    } catch (error) {
      fail(`database read failed: ${message(error)}`)
      // Keep what runs; only the very first load falls back.
      if (!applied) applyFileOrDisabled("database unreachable")
      return
    }
    if (!row) {
      if (state.source !== "file" || !applied) applyFileOrDisabled("no active database version")
      if (state.source === "file") state.lastError = null
      return
    }
    try {
      const runtime = build(row.config, options.env)
      activate(runtime, "database", row.id)
      state.lastError = null
      failedVersionId = null
    } catch (error) {
      failedVersionId = row.id
      fail(`database version ${row.id} is invalid: ${message(error)}`)
      // A broken new version keeps the last working configuration; a broken
      // version at startup turns AI off (never the stale file).
      if (!applied) activate(build(DISABLED_AI_CONFIG, {}), "disabled", null)
    }
  }

  async function check(): Promise<void> {
    if (!applied) return load()
    let id: number | null
    try {
      id = await options.source.readActiveId()
    } catch (error) {
      state.checkedAt = new Date().toISOString()
      fail(`database check failed: ${message(error)}`)
      return
    }
    state.checkedAt = new Date().toISOString()
    if (id !== null && state.source === "database" && id === state.versionId) return
    if (id !== null && id === failedVersionId) return
    if (id === null && state.source === "file") return
    return load()
  }

  return { load, check, state: (): AiConfigStoreState => ({ ...state }) }
}

// Drizzle wraps driver errors as "Failed query: <sql>"; the reason is in
// `cause` (for example: relation "public.ai_config_version" does not exist).
function message(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error"
  const cause = (error as { cause?: unknown }).cause
  return cause instanceof Error ? cause.message : error.message.split("\n")[0]
}
