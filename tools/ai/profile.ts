import { parseArgs } from "node:util"
import { readFileSync, writeFileSync } from "node:fs"
import { parseAiConfig, AiConfigurationError } from "../../src/server/ai/config"

// Render a deployment copy from the single canonical Yandex config. No env
// files or credentials are read. This is explicit generation, not config merging.
export function buildStage3Profile(input: unknown, enable: readonly string[]) {
  const config = parseAiConfig(input)
  const allowed = ["images", "pdf", "audio", "video", "search", "voice"]
  if (enable.some((name) => !allowed.includes(name))) throw new AiConfigurationError("Unknown stage-3 feature")
  if (enable.includes("video")) throw new AiConfigurationError("Video is unavailable without local decoding; do not enable it in the Yandex profile")
  const vision = enable.includes("images")
  const ocr = enable.includes("pdf")
  const speech = enable.some((name) => ["audio", "voice"].includes(name))
  const search = enable.includes("search")
  if (!config.models["yandex-vision"]) throw new AiConfigurationError("Use the canonical Yandex config as input")
  config.models["yandex-vision"].enabled = vision
  const tasks = { describeImage: vision, parseImage: enable.includes("images"), parsePdf: enable.includes("pdf"),
    parseAudio: enable.includes("audio"), parseVideo: false, webSearch: search, companyResearch: search, companyExtraction: search }
  for (const [task, enabled] of Object.entries(tasks)) {
    const definition = config.tasks[task as keyof typeof config.tasks]
    if (!definition) throw new AiConfigurationError("Missing stage-3 task")
    definition.enabled = enabled
  }
  config.services.ocr = ocr
  config.services.speech = speech
  config.services.search = search
  config.features.webSearch = search
  config.features.serverSpeechRecognition = enable.includes("voice")
  config.features.browserSpeechRecognition = false
  config.features.websiteFetch = false
  return parseAiConfig(config)
}

if (require.main === module) {
  try {
    const { values } = parseArgs({ options: { input: { type: "string", default: "config/ai/yandex.json" }, output: { type: "string" }, enable: { type: "string", default: "" } } })
    if (!values.output?.endsWith(".json")) throw new AiConfigurationError("--output must explicitly name a JSON file")
    const config = buildStage3Profile(JSON.parse(readFileSync(values.input!, "utf8")), values.enable!.split(",").filter(Boolean))
    writeFileSync(values.output, JSON.stringify(config, null, 2) + "\n")
    console.log("AI deployment configuration written; validate required environment values with check before starting the app.")
  } catch {
    console.error("Cannot prepare AI profile. Check --input, --output and --enable images,pdf,audio,search,voice. Video is unavailable.")
    process.exitCode = 1
  }
}
