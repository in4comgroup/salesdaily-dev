import { parseArgs, isDeepStrictEqual } from "node:util"
import { readFileSync } from "node:fs"
import { Client } from "pg"
import { AiConfigurationError, type AiConfig } from "../../src/server/ai/config"
import { prepareAiConfigDocument } from "../../src/server/ai/config-document"
import { LEGACY_MODEL_URI_ENV } from "../../src/server/ai/yandex-connection"

// Load an AI configuration document into the database (docs/ai/config-in-db-spec.md):
//
//   node --env-file=<env file> tools/ai/run.mjs seed [--input file] [--comment text] [--replace] [--dry-run]
//
// 1. Reads the JSON (default: deploy/k8s/app/ai-config.json) and checks the schema.
// 2. Copies model URIs that the document does not have from
//    YANDEX_AI_TEXT_MODEL_URI / YANDEX_AI_VISION_MODEL_URI.
// 3. Builds the runtime with the current env, without network requests: keys,
//    folder and URIs of everything enabled must be present and valid.
// 4. Inserts the document as the active `ai_config_version` row (DATABASE_URL).
//    An active version already there → stops, unless --replace (then the new
//    row becomes active and the old one stays as history). Same document as
//    the active one → nothing to do.
//
// Running pods pick up the new active version within 30 seconds. Prints no
// secrets, URIs or connection strings.

// Same check as the admin save (src/server/ai/config-document.ts).
export const prepareSeedDocument = prepareAiConfigDocument

function summary(config: AiConfig, filledUris: string[]) {
  const on = (value: boolean) => (value ? "on" : "off")
  console.log("Models:")
  for (const [id, model] of Object.entries(config.models)) {
    const uri = model.uri ? (filledUris.includes(id) ? `URI from ${LEGACY_MODEL_URI_ENV[id]}` : "URI in document") : "no URI"
    console.log(`  ${id}: ${on(model.enabled)}, ${uri}`)
  }
  const tasks = Object.entries(config.tasks)
  console.log(`Tasks on: ${tasks.filter(([, t]) => t.enabled).map(([id]) => id).join(", ") || "none"}`)
  console.log(`Tasks off: ${tasks.filter(([, t]) => !t.enabled).map(([id]) => id).join(", ") || "none"}`)
  console.log(`Services: ocr=${on(config.services.ocr)}, speech=${on(config.services.speech)}, search=${on(config.services.search)}`)
  console.log(`Features: ${Object.entries(config.features).map(([k, v]) => `${k}=${on(v)}`).join(", ")}`)
}

async function main() {
  const { values } = parseArgs({ options: {
    input: { type: "string", default: "deploy/k8s/app/ai-config.json" },
    comment: { type: "string" },
    replace: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
  } })
  let input: unknown
  try {
    input = JSON.parse(readFileSync(values.input!, "utf8"))
  } catch {
    throw new AiConfigurationError(`Cannot read ${values.input} as JSON`)
  }
  const { config, filledUris } = prepareSeedDocument(input, process.env)
  console.log(`Configuration ${values.input}: valid; keys, folder and URIs present (not verified with Yandex).`)
  summary(config, filledUris)
  if (values["dry-run"]) {
    console.log("Dry run: nothing written.")
    return
  }

  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) throw new AiConfigurationError("DATABASE_URL is required (or use --dry-run)")
  const client = new Client({ connectionString, connectionTimeoutMillis: 15_000 })
  await client.connect()
  try {
    await client.query("BEGIN")
    const active = await client.query<{ id: string; config: unknown }>(
      "SELECT id, config FROM public.ai_config_version WHERE is_active FOR UPDATE",
    )
    const current = active.rows[0]
    if (current && isDeepStrictEqual(current.config, config)) {
      await client.query("ROLLBACK")
      console.log(`Version ${current.id} is already active with this document. Nothing to do.`)
      return
    }
    if (current && !values.replace) {
      await client.query("ROLLBACK")
      throw new AiConfigurationError(`Version ${current.id} is already active. Run with --replace to add this document as a new active version.`)
    }
    if (current) await client.query("UPDATE public.ai_config_version SET is_active = false WHERE id = $1", [current.id])
    const inserted = await client.query<{ id: string }>(
      "INSERT INTO public.ai_config_version (config, comment, is_active) VALUES ($1::jsonb, $2, true) RETURNING id",
      [JSON.stringify(config), values.comment ?? `Загружено из ${values.input} (tools/ai/run.mjs seed)`],
    )
    await client.query("COMMIT")
    console.log(`Version ${inserted.rows[0].id} is active${current ? ` (was ${current.id})` : ""}. Running pods use it within 30 seconds.`)
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    await client.end()
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const code = (error as { code?: string })?.code
    if (code === "42P01") {
      console.error("Table public.ai_config_version not found: deploy migration 0004 first.")
    } else if (error instanceof AiConfigurationError) {
      console.error(error.message)
    } else {
      // pg errors carry no connection string; keep only code + message.
      console.error(`Seed failed${code ? ` (${code})` : ""}: ${error instanceof Error ? error.message.slice(0, 300) : "unknown error"}`)
    }
    process.exitCode = 1
  })
}
