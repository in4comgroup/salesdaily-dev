import { prepareMediaInput } from "../../src/server/ai/media"
import { syntheticPng, syntheticPdf } from "./synthetic-media"
import { parseArgs } from "node:util"
import { generateText, streamText, Output, tool, stepCountIs } from "ai"
import { z } from "zod"
import { readFileSync } from "node:fs"
import { AI_TASKS, AiConfigurationError, parseAiConfig, type AiTask } from "../../src/server/ai/config"
import { createAiRuntime } from "../../src/server/ai/resolve"
import { AiProbeError, formatAiCheckError } from "../../src/server/ai/errors"

async function main() {
  const { values } = parseArgs({ options: {
    config: { type: "string" }, probe: { type: "string" }, model: { type: "string" },
    mode: { type: "string", default: "text" },
    debug: { type: "boolean", default: false },
  } })
  // A configuration document saved as JSON (for example exported from the
  // database). The app itself reads only the database.
  if (!values.config) throw new AiConfigurationError("--config <file> is required")
  let input: unknown
  try {
    input = JSON.parse(readFileSync(values.config, "utf8"))
  } catch {
    throw new AiConfigurationError("Cannot read --config as JSON")
  }
  const config = parseAiConfig(input)
  let httpRequests = 0
  const runtime = createAiRuntime(config, process.env, undefined, values.debug ? (event) => {
    if (event.stage === "request") {
      httpRequests++
      console.error(`AI DEBUG request ${httpRequests} body (authorization omitted):\n${event.body}`)
    } else {
      console.error(`AI DEBUG response HTTP ${event.status}:\n${event.body}`)
    }
  } : undefined)
  if (values.debug) console.error("AI DEBUG enabled for synthetic Yandex probes; headers and API key are redacted.")
  console.log("AI configuration and required environment values: OK (credentials not verified; no network request yet)")
  console.log("AI configuration controls application calls. Availability is not a regional compliance certificate.")
  for (const task of AI_TASKS) {
    const models = runtime.listModels(task)
    console.log(`${task}: ${models.length ? models.map((m) => `${m.id}${m.isDefault ? " (default)" : ""}`).join(", ") : "disabled"}`)
  }
  console.log(`Services: speech=${runtime.hasService("speech")}, search=${runtime.hasService("search")}, ocr=${runtime.hasService("ocr")}`)
  if (values.model && !values.probe) throw new AiConfigurationError("--model requires --probe")
  if (!values.probe) return
  if (!AI_TASKS.includes(values.probe as AiTask)) throw new AiConfigurationError("Unknown --probe task")
  const mode = values.mode
  if (!["text", "structured", "tools", "stream", "image", "pdf"].includes(mode!)) throw new AiConfigurationError("Unknown --mode")
  const route = runtime.resolve({
    task: values.probe as AiTask, modelId: values.model,
    requiredCapabilities: mode === "structured" ? ["structuredOutput"] : mode === "tools" ? ["tools"] : mode === "stream" ? ["streaming"] : ["text"],
  })
  console.log(`Synthetic ${mode} probe: ${route.task} → yandex / ${route.modelId}`)
  if (mode === "image" || mode === "pdf") {
    const task = mode === "image" ? "parseImage" : "parsePdf"
    if (values.probe !== task || values.model) throw new AiConfigurationError("Media probe requires its matching parse task and configured default models")
    const prepared = await prepareMediaInput(task, mode === "image" ? syntheticPng() : syntheticPdf(),
      mode === "image" ? "synthetic.png" : "synthetic.pdf", mode === "image" ? "image/png" : "application/pdf", runtime)
    const result = await generateText({
      model: route.model, maxRetries: 0, maxOutputTokens: 512,
      abortSignal: AbortSignal.timeout(30_000),
      system: "Return a short summary of the synthetic source content in the supplied schema.",
      messages: [{ role: "user", content: prepared.content }],
      output: Output.object({ schema: z.object({ summary: z.string().min(1) }) }),
    })
    if (!result.output.summary.trim() || result.finishReason === "length") throw new AiProbeError("empty-response")
    console.log(`Probe succeeded (${mode}; preprocessing and structured summary).`)
    return
  }
  // This is an opt-in billable text connectivity test, not a quality or
  // multimodal acceptance test. Never read CRM data or files here.
  const common = {
    model: route.model, maxOutputTokens: 512, maxRetries: 0,
    abortSignal: AbortSignal.timeout(30_000),
  }
  if (mode === "structured") {
    const result = await generateText({ ...common,
      prompt: "Return an object with the field ok equal to true.",
      output: Output.object({ schema: z.object({ ok: z.boolean() }) }),
    })
    if (result.output.ok !== true) throw new AiProbeError("unexpected-structured-response")
  } else if (mode === "tools") {
    let called = false
    const result = await generateText({ ...common,
      prompt: "Call the connectivityCheck tool, then reply OK. This is a synthetic test.",
      tools: { connectivityCheck: tool({
        description: "Run a synthetic connectivity check without accessing any data.",
        inputSchema: z.object({}),
        execute: async () => { called = true; return { ok: true } },
      }) },
      stopWhen: stepCountIs(3),
    })
    if (!called || !result.text.trim()) throw new AiProbeError("tool-loop-incomplete")
  } else if (mode === "stream") {
    let streamError: unknown
    const result = streamText({ ...common, prompt: "Reply with the word OK. Synthetic test.",
      onError: ({ error }) => { streamError = error } })
    const text = await result.text
    if (streamError) throw streamError
    if (!text.trim()) throw new AiProbeError("empty-response")
  } else {
    const result = await generateText({ ...common, prompt: "Reply with the word OK. Synthetic test." })
    if (!result.text.trim()) throw new AiProbeError("empty-response")
  }
  console.log(`Probe succeeded (${mode}).`)

}

main().catch((error: unknown) => {
  // Provider error messages may contain request bodies, headers or URLs.
  console.error(formatAiCheckError(error))
  process.exitCode = 1
})
