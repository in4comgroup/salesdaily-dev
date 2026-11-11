import assert from "node:assert/strict"
import { buildStage3Profile } from "./profile"
import { recognizeSpeech, parseSpeechResult } from "../../src/server/ai/speech"
import { recognizePdf, parseOcrResult } from "../../src/server/ai/ocr"
import { encodeMonoWav } from "../../src/lib/pcm-wav"
import { runInNewContext } from "node:vm"
import { transcribeMedia, speechContainer, pcmWavDuration } from "../../src/server/ai/av"
import { researchYandex, parseSearchXml } from "../../src/server/ai/search"
import { AiServiceError, readBytesBounded } from "../../src/server/ai/services"
import { prepareMediaInput, inlineImageType } from "../../src/server/ai/media"
import { readFileSync } from "node:fs"
import { constants as cryptoConstants, generateKeyPairSync, verify as verifySignature } from "node:crypto"
import {
  DEFAULT_SKU_MAP, SKU_ID, YANDEX_AI_STUDIO_SERVICE_ID, YandexBillingError, createIamJwt, createYandexBillingClient,
  groupTextGenerationSkus, parseServiceAccountKey, planModelPriceRows, readYandexBillingCredentials, skuPricePoints,
  unitFactorPer1k, type YandexSku,
} from "../../src/server/ai/billing"
import test from "node:test"
import { generateText, streamText, Output, tool, stepCountIs } from "ai"
import { z } from "zod"
import { AiConfigurationError, loadAiConfig, parseAiConfig } from "../../src/server/ai/config"
import { AiPolicyError, assertChatContentAllowed } from "../../src/server/ai/policy"
import { createAiRuntime } from "../../src/server/ai/resolve"
import { AiProviderError, AiProbeError, AiMediaError, formatAiCheckError } from "../../src/server/ai/errors"
import { redactDiagnosticBody, type AiDiagnosticEvent } from "../../src/server/ai/diagnostics"
import {
  AiBudgetError, classifyAiError, normalizeUpstreamModel, registerAiUsageSink, withAiUsageContext,
  type AiUsageEvent, type AiUsageSink,
} from "../../src/server/ai/usage"

function blocked() {
  return JSON.parse(readFileSync("config/ai/blocked.json", "utf8"))
}

const yandexEnv = {
  YANDEX_AI_API_KEY: "synthetic-yandex-key",
  YANDEX_AI_FOLDER_ID: "test-folder",
  YANDEX_AI_TEXT_MODEL_URI: "gpt://test-folder/yandexgpt-5.1",
}

test("text-only chat rejects file parts in new messages and history", () => {
  assert.doesNotThrow(() => assertChatContentAllowed([{ parts: [{ type: "text" }] }]))
  assert.throws(() => assertChatContentAllowed([
    { parts: [{ type: "file" }] }, { parts: [{ type: "text" }] },
  ]), AiPolicyError)
})
function yandex() {
  return JSON.parse(readFileSync("config/ai/yandex.json", "utf8"))
}
function completion(content: string, toolCalls?: unknown[]) {
  return {
    id: "synthetic", created: 0, model: yandexEnv.YANDEX_AI_TEXT_MODEL_URI,
    choices: [{ index: 0, message: { role: "assistant", content, ...(toolCalls ? { tool_calls: toolCalls } : {}) },
      finish_reason: toolCalls ? "tool_calls" : "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }
}

// Two selectable text models for policy tests: the canonical profile plus a
// second model with its URI in the document (not env).
function selectable() {
  const config = yandex()
  config.models["yandex-lite"] = {
    enabled: true, label: "Yandex Lite", uri: "gpt://test-folder/yandexgpt-lite",
    capabilities: ["text", "structuredOutput", "tools", "streaming"],
  }
  config.tasks.chat.allowedModels.push("yandex-lite")
  return config
}

test("missing configuration fails without any default route", () => {
  assert.throws(() => loadAiConfig(yandexEnv), AiConfigurationError)
  assert.throws(() => loadAiConfig({ AI_CONFIG_PATH: "/not-an-ai-config.json" }), AiConfigurationError)
})

test("strict schema rejects old format, provider sections, foreign URIs and fallbacks", () => {
  for (const change of [
    (c: ReturnType<typeof yandex>) => { c.version = 1 },
    (c: ReturnType<typeof yandex>) => { c.policy = { allowedConnections: ["vercel"] } },
    (c: ReturnType<typeof yandex>) => { c.connections = { vercel: { adapter: "vercel-gateway" } } },
    (c: ReturnType<typeof yandex>) => { c.models["yandex-text"].connectionId = "vercel" },
    (c: ReturnType<typeof yandex>) => { c.models["yandex-text"].uri = "https://example.com/model" },
    (c: ReturnType<typeof yandex>) => { c.models["yandex-text"].capabilities.push("googleSearch") },
    (c: ReturnType<typeof yandex>) => { c.tasks.chat.fallbackModels = ["yandex-text"] },
    (c: ReturnType<typeof yandex>) => { c.files.pdf = "native" },
  ]) {
    const config = yandex()
    change(config)
    assert.throws(() => parseAiConfig(config), AiConfigurationError)
  }
})

test("broken references and unsupported task dependencies fail configuration validation", () => {
  for (const change of [
    (c: ReturnType<typeof yandex>) => { c.tasks.chat.allowedModels.push("unknown") },
    (c: ReturnType<typeof yandex>) => { c.tasks.chat.defaultModel = "yandex-vision" },
    (c: ReturnType<typeof yandex>) => { c.models["yandex-text"].enabled = false },
    (c: ReturnType<typeof yandex>) => { c.tasks.parseVideo.enabled = true },
    (c: ReturnType<typeof yandex>) => { c.tasks.parsePdf.enabled = true },
    (c: ReturnType<typeof yandex>) => { c.tasks.parseAudio.enabled = true },
    (c: ReturnType<typeof yandex>) => { c.tasks.webSearch.enabled = true },
    (c: ReturnType<typeof yandex>) => { c.tasks.companyResearch.enabled = true },
    (c: ReturnType<typeof yandex>) => { c.features.serverSpeechRecognition = true },
  ]) {
    const config = yandex()
    change(config)
    assert.throws(() => parseAiConfig(config), AiConfigurationError)
  }
})

test("missing active credentials fail without fallback", () => {
  assert.throws(() => createAiRuntime(yandex(), {}), AiConfigurationError)
  assert.throws(() => createAiRuntime(yandex(), { ...yandexEnv, YANDEX_AI_API_KEY: "  " }), AiConfigurationError)
})

test("fully blocked profile needs no credentials and denies every operation", () => {
  const runtime = createAiRuntime(blocked(), {})
  assert.deepEqual(runtime.listModels("chat"), [])
  assert.throws(() => runtime.resolve({ task: "chat" }), AiPolicyError)
  for (const feature of ["webSearch", "websiteFetch", "browserSpeechRecognition", "serverSpeechRecognition"] as const) {
    assert.throws(() => runtime.assertFeatureAllowed(feature), AiPolicyError)
  }
  assert.equal(runtime.hasService("ocr"), false)
})

test("YANDEX_AI_API_URL: default origin, custom origin, invalid values rejected", async () => {
  const calls: string[] = []
  const fakeFetch: typeof fetch = async (input) => { calls.push(String(input)); return Response.json(completion("OK")) }
  await generateText({ model: createAiRuntime(yandex(), yandexEnv, fakeFetch).resolve({ task: "chat" }).model, prompt: "synthetic", maxRetries: 0 })
  await generateText({
    model: createAiRuntime(yandex(), { ...yandexEnv, YANDEX_AI_API_URL: "https://ai.example.test/" }, fakeFetch).resolve({ task: "chat" }).model,
    prompt: "synthetic", maxRetries: 0,
  })
  assert.deepEqual(calls, ["https://ai.api.cloud.yandex.net/v1/chat/completions", "https://ai.example.test/v1/chat/completions"])
  for (const value of ["http://ai.api.cloud.yandex.net", "https://ai.api.cloud.yandex.net/v1", "https://u:p@ai.example.test",
    "https://ai.example.test?x=1", "not a url"]) {
    assert.throws(() => createAiRuntime(yandex(), { ...yandexEnv, YANDEX_AI_API_URL: value }), AiConfigurationError)
  }
  // A fully disabled configuration does not read the address at all.
  assert.doesNotThrow(() => createAiRuntime(blocked(), { YANDEX_AI_API_URL: "not a url" }))
})

test("task enablement and feature policy are independent", () => {
  const config = selectable()
  config.tasks.chat.enabled = false
  const runtime = createAiRuntime(config, yandexEnv)
  assert.throws(() => runtime.resolve({ task: "chat", modelId: "yandex-lite" }), AiPolicyError)
  assert.throws(() => runtime.assertFeatureAllowed("webSearch"), AiPolicyError)
  assert.doesNotThrow(() => runtime.resolve({ task: "analytics" }))
})

test("unknown and unconfigured tasks/models never fall back", () => {
  const config = selectable()
  delete config.tasks.cards
  const runtime = createAiRuntime(config, yandexEnv)
  assert.throws(() => runtime.resolve({ task: "cards" }), AiPolicyError)
  assert.throws(() => runtime.resolve({ task: "chat", modelId: "gpt://test-folder/arbitrary" }), AiPolicyError)
  assert.throws(() => runtime.resolve({ task: "analytics", modelId: "yandex-lite" }), AiPolicyError)
  assert.throws(() => runtime.resolve({ task: "chat", modelId: "__proto__" }), AiPolicyError)
  assert.equal(runtime.resolve({ task: "chat", modelId: "yandex-lite" }).upstreamModelId, "gpt://test-folder/yandexgpt-lite")
})

test("disabled models are hidden and cannot be selected directly", () => {
  const config = selectable()
  config.models["yandex-lite"].enabled = false
  const runtime = createAiRuntime(config, yandexEnv)
  assert.equal(runtime.listModels("chat").some((m) => m.id === "yandex-lite"), false)
  assert.throws(() => runtime.resolve({ task: "chat", modelId: "yandex-lite" }), AiPolicyError)
})

test("required task capabilities cannot be relaxed and unavailable models are hidden", () => {
  const config = selectable()
  config.models["yandex-lite"].capabilities = ["text"]
  const runtime = createAiRuntime(config, yandexEnv)
  assert.throws(() => runtime.resolve({ task: "chat", modelId: "yandex-lite", requiredCapabilities: [] }), AiPolicyError)
  assert.equal(runtime.listModels("chat").some((m) => m.id === "yandex-lite"), false)
  assert.throws(() => runtime.resolve({ task: "chat", requiredCapabilities: ["image"] }), AiPolicyError)
  config.models["yandex-text"].capabilities = ["text"]
  assert.throws(() => createAiRuntime(config, yandexEnv), AiPolicyError)
})

test("caller mutation of config and catalogue cannot change runtime policy", () => {
  const config = selectable()
  const runtime = createAiRuntime(config, yandexEnv)
  config.tasks.chat.allowedModels.push("arbitrary")
  runtime.listModels("chat")[0].capabilities.push("image")
  assert.throws(() => runtime.resolve({ task: "chat", modelId: "arbitrary" }), AiPolicyError)
  assert.throws(() => runtime.resolve({ task: "chat", requiredCapabilities: ["image"] }), AiPolicyError)
})

test("safe catalogue contains neither infrastructure configuration nor secrets", () => {
  const runtime = createAiRuntime(selectable(), yandexEnv)
  const serialized = JSON.stringify(runtime.listModels("chat"))
  assert.equal(serialized.includes(yandexEnv.YANDEX_AI_API_KEY), false)
  assert.equal(serialized.includes("https://"), false)
  assert.equal(serialized.includes("gpt://"), false)
  assert.equal(serialized.includes(yandexEnv.YANDEX_AI_FOLDER_ID), false)
})

test("configuration errors do not disclose unexpected values", () => {
  const config = yandex()
  config.models["yandex-text"].apiKey = "do-not-print-this-secret"
  assert.throws(() => parseAiConfig(config), (error: unknown) =>
    error instanceof AiConfigurationError && !error.message.includes("do-not-print-this-secret"))
})

test("Yandex config requires its own credentials and same-folder model URI", () => {
  for (const environment of [
    {}, { ...yandexEnv, YANDEX_AI_API_KEY: "" },
    { ...yandexEnv, YANDEX_AI_FOLDER_ID: "" },
    { ...yandexEnv, YANDEX_AI_TEXT_MODEL_URI: "" },
    { ...yandexEnv, YANDEX_AI_TEXT_MODEL_URI: "gpt://other-folder/yandexgpt" },
    { ...yandexEnv, YANDEX_AI_TEXT_MODEL_URI: "https://example.com/model" },
  ]) assert.throws(() => createAiRuntime(yandex(), environment), AiConfigurationError)
})

test("base profile keeps media and search off and refuses unknown model selections", () => {
  const runtime = createAiRuntime(yandex(), yandexEnv)
  for (const task of ["parsePdf", "parseImage", "parseAudio", "parseVideo", "companyResearch", "companyExtraction", "webSearch"] as const) {
    assert.throws(() => runtime.resolve({ task }), AiPolicyError)
  }
  assert.throws(() => runtime.resolve({ task: "chat", modelId: "gpt-5-mini" }), AiPolicyError)
  const config = yandex()
  config.models["yandex-text"].capabilities.push("video")
  assert.throws(() => createAiRuntime(config, yandexEnv), AiConfigurationError)
})

test("Yandex rejects remote media before SDK download or provider fetch", async () => {
  let calls = 0
  const originalFetch = globalThis.fetch
  const forbiddenFetch: typeof fetch = async () => { calls++; throw new Error("Unexpected network request") }
  globalThis.fetch = forbiddenFetch
  try {
    const route = createAiRuntime(yandex(), yandexEnv, forbiddenFetch).resolve({ task: "analytics" })
    await assert.rejects(generateText({ model: route.model, maxRetries: 0,
      messages: [{ role: "user", content: [
        { type: "image", image: new URL("https://outside.invalid/customer.png") },
      ] }],
    }), AiPolicyError)
    assert.equal(calls, 0)
  } finally { globalThis.fetch = originalFetch }
})

test("Yandex text uses only direct endpoint, explicit auth, folder and no-logging header", async () => {
  const calls: string[] = []
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push(String(input))
    const headers = new Headers(init?.headers)
    assert.equal(headers.get("authorization"), `Api-Key ${yandexEnv.YANDEX_AI_API_KEY}`)
    assert.equal(headers.get("openai-project"), yandexEnv.YANDEX_AI_FOLDER_ID)
    assert.equal(headers.get("x-data-logging-enabled"), "false")
    assert.equal(init?.redirect, "error")
    const body = JSON.parse(String(init?.body))
    assert.equal(body.model, yandexEnv.YANDEX_AI_TEXT_MODEL_URI)
    assert.equal(body.messages[0].content, "synthetic")
    return Response.json(completion("OK"))
  }
  const runtime = createAiRuntime(yandex(), yandexEnv, fakeFetch)
  assert.equal(calls.length, 0)
  const route = runtime.resolve({ task: "chat" })
  const result = await generateText({ model: route.model, prompt: "synthetic", maxRetries: 0,
    headers: { Authorization: "overridden", "x-data-logging-enabled": "true" } })
  assert.equal(result.text, "OK")
  assert.deepEqual(calls, ["https://ai.api.cloud.yandex.net/v1/chat/completions"])
})

test("Yandex structured output sends JSON schema and validates typed results", async () => {
  const fakeFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body))
    assert.equal(body.response_format.type, "json_schema")
    assert.equal(body.response_format.json_schema.schema.properties.ok.type, "boolean")
    assert.equal(body.tools, undefined)
    return Response.json(completion('{"ok":true}'))
  }
  const route = createAiRuntime(yandex(), yandexEnv, fakeFetch).resolve({ task: "orderRequest" })
  const result = await generateText({ model: route.model, prompt: "synthetic", maxRetries: 0,
    output: Output.object({ schema: z.object({ ok: z.boolean() }) }) })
  assert.deepEqual(result.output, { ok: true })
})

test("Yandex completes a function tool loop with local tool execution", async () => {
  let requests = 0
  let executed = false
  const fakeFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body))
    assert.equal(body.tools[0].function.name, "check")
    requests++
    if (requests === 1) return Response.json(completion("", [
      { id: "call-synthetic", type: "function", function: { name: "check", arguments: '{"value":"demo"}' } },
    ]))
    assert.equal(body.messages.some((m: { role: string }) => m.role === "tool"), true)
    return Response.json(completion("OK"))
  }
  const route = createAiRuntime(yandex(), yandexEnv, fakeFetch).resolve({ task: "chat" })
  const result = await generateText({ model: route.model, prompt: "synthetic", maxRetries: 0,
    tools: { check: tool({ inputSchema: z.object({ value: z.string() }),
      execute: async ({ value }) => { executed = value === "demo"; return { ok: true } } }) },
    stopWhen: stepCountIs(3),
  })
  assert.equal(result.text, "OK")
  assert.equal(executed, true)
  assert.equal(requests, 2)
})

test("Yandex streaming decodes SSE into text without other endpoints", async () => {
  const fakeFetch: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://ai.api.cloud.yandex.net/v1/chat/completions")
    assert.equal(JSON.parse(String(init?.body)).stream, true)
    const chunks = [
      { id: "synthetic", created: 0, model: "test", choices: [{ index: 0, delta: { role: "assistant", content: "OK" }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    ]
    return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", {
      headers: { "Content-Type": "text/event-stream" },
    })
  }
  const route = createAiRuntime(yandex(), yandexEnv, fakeFetch).resolve({ task: "analytics" })
  const result = streamText({ model: route.model, prompt: "synthetic", maxRetries: 0 })
  assert.equal(await result.text, "OK")
})

test("provider failure does not expose response data or switch to Gateway", async () => {
  let requests = 0
  const fakeFetch: typeof fetch = async (input) => {
    requests++
    assert.equal(String(input), "https://ai.api.cloud.yandex.net/v1/chat/completions")
    return Response.json({ error: { message: "PRIVATE_CUSTOMER_CONTENT" } }, { status: 401 })
  }
  const route = createAiRuntime(yandex(), yandexEnv, fakeFetch).resolve({ task: "chat" })
  await assert.rejects(generateText({ model: route.model, prompt: "synthetic", maxRetries: 0 }),
    (error: unknown) => error instanceof AiProviderError && error.message === "Yandex AI request failed (HTTP 401)" &&
      formatAiCheckError(error).includes("HTTP 401") && !formatAiCheckError(error).includes("PRIVATE_CUSTOMER_CONTENT") && !("cause" in error))
  assert.equal(requests, 1)
})

test("safe diagnostics preserve known network metadata without secret messages or causes", () => {
  const source = new TypeError("SECRET_MESSAGE", { cause: { code: "ENOTFOUND", headers: { authorization: "SECRET_KEY" } } })
  const error = new AiProviderError(source)
  assert.equal(error.kind, "network")
  assert.equal(error.networkCode, "ENOTFOUND")
  const output = formatAiCheckError(error)
  assert.match(output, /category=network/)
  assert.match(output, /ENOTFOUND/)
  assert.equal(JSON.stringify(error).includes("SECRET"), false)
  assert.equal(output.includes("SECRET"), false)
  assert.equal("cause" in error, false)
})

test("SDK network failures expose only whitelisted diagnostics", async () => {
  const fakeFetch: typeof fetch = async () => {
    throw new TypeError("PRIVATE_RESPONSE", { cause: { code: "ECONNREFUSED" } })
  }
  const route = createAiRuntime(yandex(), yandexEnv, fakeFetch).resolve({ task: "chat" })
  await assert.rejects(generateText({ model: route.model, prompt: "synthetic", maxRetries: 0 }),
    (error: unknown) => formatAiCheckError(error).includes("ECONNREFUSED") &&
      !formatAiCheckError(error).includes("PRIVATE_RESPONSE"))
})

test("response validation failures are distinguishable from HTTP authorization failures", async () => {
  const fakeFetch: typeof fetch = async () => Response.json({ privateData: "SECRET_RESPONSE" })
  const route = createAiRuntime(yandex(), yandexEnv, fakeFetch).resolve({ task: "chat" })
  await assert.rejects(generateText({ model: route.model, prompt: "synthetic", maxRetries: 0 }),
    (error: unknown) => formatAiCheckError(error).includes("category=response") &&
      !formatAiCheckError(error).includes("SECRET_RESPONSE"))
})

test("timeouts and unexpected errors never print arbitrary upstream names, codes or messages", () => {
  const timeout = new AiProviderError(new DOMException("SECRET", "TimeoutError"))
  assert.match(formatAiCheckError(timeout), /category=timeout/)
  const diagnostic = formatAiCheckError({ name: "SECRET_NAME", code: "SECRET_CODE", message: "SECRET_MESSAGE" })
  assert.match(diagnostic, /category=unknown/)
  assert.equal(diagnostic.includes("SECRET"), false)
})

test("empty visible responses and tool probe failures receive safe explanations", () => {
  assert.match(formatAiCheckError(new AiProbeError("empty-response")), /no visible text/)
  assert.match(formatAiCheckError(new AiProbeError("tool-loop-incomplete")), /tool call/)
})

test("diagnostic body redacts keys, auth fields and JSON-escaped secrets", () => {
  const body = '{"api_key":"other-secret","prompt":"test","echo":"\\u0073ynthetic-yandex-key","auth":"Bearer hidden-token"}'
  const output = redactDiagnosticBody(body, yandexEnv.YANDEX_AI_API_KEY)
  assert.match(output, /test/)
  for (const secret of ["other-secret", "synthetic-yandex-key", "hidden-token"]) {
    assert.equal(output.includes(secret), false)
  }
  assert.equal(redactDiagnosticBody("failed: Api-Key synthetic-yandex-key", yandexEnv.YANDEX_AI_API_KEY).includes("synthetic-yandex-key"), false)
})

test("opt-in debug captures synthetic body and HTTP response without consuming SDK response", async () => {
  const events: AiDiagnosticEvent[] = []
  const fakeFetch: typeof fetch = async () => Response.json(completion("OK"))
  const route = createAiRuntime(yandex(), yandexEnv, fakeFetch, (event) => events.push(event)).resolve({ task: "chat" })
  const result = await generateText({ model: route.model, prompt: "synthetic", maxRetries: 0 })
  assert.equal(result.text, "OK")
  assert.equal(events.length, 2)
  assert.equal(events[0].stage, "request")
  assert.match(events[0].body, /synthetic/)
  assert.equal(events[1].stage, "response")
  if (events[1].stage === "response") assert.equal(events[1].status, 200)
  assert.equal(JSON.stringify(events).includes(yandexEnv.YANDEX_AI_API_KEY), false)
  assert.equal(JSON.stringify(events).includes("authorization"), false)
})

test("debug exposes provider error body but redacts reflected credentials", async () => {
  const events: AiDiagnosticEvent[] = []
  const fakeFetch: typeof fetch = async () => Response.json({ error: {
    message: "Model is unavailable", api_key: yandexEnv.YANDEX_AI_API_KEY,
  } }, { status: 400 })
  const route = createAiRuntime(yandex(), yandexEnv, fakeFetch, (event) => events.push(event)).resolve({ task: "chat" })
  await assert.rejects(generateText({ model: route.model, prompt: "synthetic", maxRetries: 0 }))
  assert.match(events[1].body, /Model is unavailable/)
  assert.equal(JSON.stringify(events).includes(yandexEnv.YANDEX_AI_API_KEY), false)
})

test("invalid header characters in key fail before requests without echoing the key", () => {
  for (const key of ["ключ", "key\nvalue", "key value"]) {
    assert.throws(() => createAiRuntime(yandex(), { ...yandexEnv, YANDEX_AI_API_KEY: key }),
      (error: unknown) => error instanceof AiConfigurationError && !error.message.includes(key))
  }
})

function mediaProfile() {
  const config = yandex()
  config.models["yandex-vision"].enabled = true
  config.services.ocr = true
  for (const task of ["parseImage", "parsePdf", "describeImage"]) config.tasks[task].enabled = true
  return config
}
const mediaEnv = { ...yandexEnv, YANDEX_AI_VISION_MODEL_URI: "gpt://test-folder/vision-test", YANDEX_OCR_API_KEY: "synthetic-ocr-key" }
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1kAAAAASUVORK5CYII=", "base64")

test("media profile requires an explicit vision route and preserves text-only profile defaults", () => {
  assert.throws(() => createAiRuntime(mediaProfile(), yandexEnv), AiConfigurationError)
  const config = mediaProfile()
  config.tasks.describeImage.enabled = false
  assert.throws(() => createAiRuntime(config, mediaEnv), AiConfigurationError)
  assert.equal(createAiRuntime(yandex(), yandexEnv).files().images, "vision")
  const runtime = createAiRuntime(mediaProfile(), mediaEnv)
  assert.equal(runtime.resolve({ task: "parsePdf" }).modelId, "yandex-text")
  assert.equal(runtime.resolve({ task: "describeImage" }).modelId, "yandex-vision")
  for (const task of ["parseAudio", "parseVideo", "webSearch"] as const) {
    assert.throws(() => runtime.resolve({ task }), AiPolicyError)
  }
  const copy = runtime.files()
  copy.pdfMaxPages = 20
  assert.equal(runtime.files().pdfMaxPages, 10)
})

test("image pipeline sends inline pixels only to vision, then text only to structured model", async () => {
  const bodies: Record<string, unknown>[] = []
  const runtime = createAiRuntime(mediaProfile(), mediaEnv, async (url, init) => {
    assert.equal(String(url), "https://ai.api.cloud.yandex.net/v1/chat/completions")
    const body = JSON.parse(String(init?.body))
    bodies.push(body)
    if (body.model === mediaEnv.YANDEX_AI_VISION_MODEL_URI) {
      assert.equal(body.response_format, undefined)
      assert.match(JSON.stringify(body.messages), /data:image\/png;base64,/)
      return Response.json(completion("Synthetic readable image content"))
    }
    assert.equal(body.model, mediaEnv.YANDEX_AI_TEXT_MODEL_URI)
    assert.equal(JSON.stringify(body.messages).includes("data:image/"), false)
    return Response.json(completion('{"ok":true}'))
  })
  const prepared = await prepareMediaInput("parseImage", png, "test.png", "image/png", runtime)
  const result = await generateText({
    model: runtime.resolve({ task: "parseImage" }).model,
    messages: [{ role: "user", content: prepared.content }],
    output: Output.object({ schema: z.object({ ok: z.boolean() }) }),
  })
  assert.equal(result.output.ok, true)
  assert.equal(prepared.preprocessingModel, mediaEnv.YANDEX_AI_VISION_MODEL_URI)
  assert.equal(bodies.length, 2)
})

test("vision never downloads remote files, accepts PDFs directly or falls back after failure", async () => {
  let requests = 0
  const runtime = createAiRuntime(mediaProfile(), mediaEnv, async () => { requests++; return new Response("failure", { status: 503 }) })
  for (const data of [new URL("https://example.com/secret.png"), new URL("data:image/png;base64,AA==")]) {
    await assert.rejects(generateText({
      model: runtime.resolve({ task: "describeImage" }).model, maxRetries: 0,
      messages: [{ role: "user", content: [{ type: "file", data, mediaType: "image/png" }] }],
    }), AiPolicyError)
  }
  await assert.rejects(generateText({
    model: runtime.resolve({ task: "describeImage" }).model, maxRetries: 0,
    messages: [{ role: "user", content: [{ type: "file", data: Buffer.from("pdf"), mediaType: "application/pdf" }] }],
  }), AiPolicyError)
  assert.equal(requests, 0)
  await assert.rejects(prepareMediaInput("parseImage", png, "test.png", "image/png", runtime), AiProviderError)
  assert.equal(requests, 1)
})

test("disabled media tasks reject before preprocessing or network; invalid image bytes fail locally", async () => {
  let requests = 0
  const runtime = createAiRuntime(yandex(), yandexEnv, async () => { requests++; throw new Error("unexpected") })
  await assert.rejects(prepareMediaInput("parseImage", png, "test.png", "image/png", runtime), AiPolicyError)
  assert.throws(() => inlineImageType(Buffer.from("not an image")), AiPolicyError)
  assert.throws(() => inlineImageType(Buffer.alloc(11 * 1024 * 1024)), AiPolicyError)
  assert.equal(requests, 0)
})

test("media errors provide actionable safe CLI diagnostics", () => {
  assert.match(formatAiCheckError(new AiMediaError("incomplete-vision")), /empty or truncated/)
})

const serviceEnv = { ...mediaEnv, YANDEX_SPEECH_API_KEY: "synthetic-speech-key", YANDEX_SEARCH_API_KEY: "synthetic-search-key" }
function fullProfile() { return buildStage3Profile(yandex(), ["images", "pdf", "audio", "search", "voice"]) }
const speechEvents = [
  { result: { final: { alternatives: [{ text: "raw", words: [{ startTimeMs: "100", endTimeMs: "900" }] }], channelTag: "0" }, audioCursors: { finalIndex: "0", receivedDataMs: "2000" } } },
  { result: { finalRefinement: { finalIndex: "0", normalizedText: { alternatives: [{ text: "Тестовый заказ 123", startTimeMs: "100", endTimeMs: "900" }], channelTag: "0" } } } },
  { result: { statusCode: { codeType: "CLOSED" } } },
]

test("single Yandex profile explicitly enables selected dependencies and preserves safe defaults", () => {
  const voiceOnly = buildStage3Profile(yandex(), ["voice"])
  const runtime = createAiRuntime(voiceOnly, { ...yandexEnv, YANDEX_SPEECH_API_KEY: "synthetic" })
  assert.equal(runtime.hasService("speech"), true)
  assert.equal(runtime.hasService("search"), false)
  assert.equal(runtime.isFeatureAllowed("serverSpeechRecognition"), true)
  assert.throws(() => runtime.resolve({ task: "parseAudio" }), AiPolicyError)
  const off = buildStage3Profile(fullProfile(), [])
  assert.equal(off.models["yandex-vision"].enabled, false)
  assert.doesNotThrow(() => createAiRuntime(off, yandexEnv))
  assert.throws(() => buildStage3Profile(yandex(), ["typo"]), AiConfigurationError)
  const config = fullProfile()
  config.services.speech = false
  assert.throws(() => createAiRuntime(config, serviceEnv), AiConfigurationError)
  assert.throws(() => createAiRuntime(fullProfile(), mediaEnv), AiConfigurationError)
  assert.equal(fullProfile().features.browserSpeechRecognition, false)
  assert.equal(fullProfile().features.websiteFetch, false)
})

test("SpeechKit uses fixed endpoints, dedicated auth, inline WAV, polls and deletes results", async () => {
  const calls: string[] = []
  const runtime = createAiRuntime(fullProfile(), serviceEnv, async (input, init) => {
    const url = String(input)
    calls.push(url)
    assert.equal(init?.redirect, "error")
    const headers = new Headers(init?.headers)
    assert.equal(headers.get("authorization"), `Api-Key ${serviceEnv.YANDEX_SPEECH_API_KEY}`)
    assert.equal(headers.get("x-folder-id"), "test-folder")
    if (url.endsWith("recognizeFileAsync")) {
      const body = JSON.parse(String(init?.body))
      assert.equal(body.content, Buffer.from("RIFFsynthetic").toString("base64"))
      assert.equal(body.uri, undefined)
      assert.equal(body.recognitionModel.audioFormat.containerAudio.containerAudioType, "WAV")
      return Response.json({ id: "test-operation" })
    }
    if (url.includes("operation.api.")) return Response.json({ done: calls.length > 2 })
    if (url.includes("getRecognition")) return new Response(speechEvents.map((event) => JSON.stringify(event)).join("\n"))
    assert.equal(init?.method, "DELETE")
    return new Response("")
  })
  const result = await recognizeSpeech(Buffer.from("RIFFsynthetic"), runtime.service("speech"), AbortSignal.timeout(5000), async () => {})
  assert.equal(result.durationSeconds, 2)
  assert.deepEqual(result.segments, [{ startSeconds: 0.1, durationSeconds: 0.8, transcript: "Тестовый заказ 123", speaker: "Unknown" }])
  assert.equal(calls.length, 5)
  assert.match(calls.at(-1)!, /deleteRecognition\?operationId=test-operation$/)
  assert.deepEqual(parseSpeechResult(JSON.stringify(speechEvents)), result.segments)
})

test("SpeechKit failures and cancellation still attempt cleanup; cleanup errors surface safely", async () => {
  for (const failure of ["poll", "result", "delete", "abort"]) {
    const calls: string[] = []
    const controller = new AbortController()
    const runtime = createAiRuntime(fullProfile(), serviceEnv, async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith("recognizeFileAsync")) {
        if (failure === "abort") controller.abort()
        return Response.json({ id: "test-operation" })
      }
      if (url.includes("operation.api.")) return failure === "poll" ? new Response("private raw response", { status: 403 }) : Response.json({ done: true })
      if (url.includes("getRecognition")) return failure === "result" ? new Response("private raw response", { status: 500 }) : new Response("")
      return failure === "delete" ? new Response("private raw response", { status: 403 }) : new Response("")
    })
    await assert.rejects(recognizeSpeech(Buffer.from("wav"), runtime.service("speech"), controller.signal, async () => {}), (error: unknown) => {
      assert.ok(error instanceof AiServiceError)
      assert.equal(String(error).includes("private raw response"), false)
      if (failure === "delete") assert.match(error.message, /cleanup operation ID: test-operation/)
      return true
    })
    assert.match(calls.at(-1)!, /deleteRecognition/)
  }
})

test("bounded input reader stops oversized bodies and service denies cross-service operations", async () => {
  await assert.rejects(readBytesBounded(new Response("too much data").body, 2))
  const runtime = createAiRuntime(fullProfile(), serviceEnv, async () => { throw new Error("must not send") })
  await assert.rejects(runtime.service("speech").request("search"), AiConfigurationError)
  await assert.rejects(runtime.service("speech").request("poll", { id: "../../other" }), AiConfigurationError)
  assert.throws(() => createAiRuntime(yandex(), yandexEnv).service("speech"), AiPolicyError)
})

const searchXml = '<yandexsearch><response><results><grouping><group><doc><url>https://example.org/company</url><title>Компания &amp; партнёры</title><passages><passage>Контакты <hlword>компании</hlword></passage></passages></doc></group></grouping></results></response></yandexsearch>'

test("Yandex search parses XML without fetching URLs and summarizes only real returned sources", async () => {
  const calls: string[] = []
  const runtime = createAiRuntime(fullProfile(), serviceEnv, async (input, init) => {
    const url = String(input)
    calls.push(url)
    const headers = new Headers(init?.headers)
    if (url.includes("searchapi.")) {
      assert.equal(headers.get("authorization"), `Api-Key ${serviceEnv.YANDEX_SEARCH_API_KEY}`)
      const body = JSON.parse(String(init?.body))
      assert.equal(body.folderId, "test-folder")
      assert.equal(body.query.queryText, "Тестовая компания")
      return Response.json({ rawData: Buffer.from(searchXml).toString("base64") })
    }
    assert.equal(url, "https://ai.api.cloud.yandex.net/v1/chat/completions")
    const body = JSON.parse(String(init?.body))
    assert.equal(body.tools, undefined)
    assert.match(JSON.stringify(body.messages), /Контакты компании/)
    return Response.json(completion("Подтверждённые сведения"))
  })
  const result = await researchYandex("Тестовая компания", "companyResearch", "", runtime)
  assert.equal(result.grounded, true)
  assert.deepEqual(result.sources, [{ sourceType: "url", url: "https://example.org/company", title: "Компания & партнёры" }])
  assert.equal(calls.length, 2)
})

test("search rejects XML entities and malformed responses; empty results never trigger model research", async () => {
  assert.throws(() => parseSearchXml('<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><x/>'), AiServiceError)
  assert.throws(() => parseSearchXml('<yandexsearch><error code="15">fail</error></yandexsearch>'), AiServiceError)
  for (const response of [searchXml.replace(/<doc>[\s\S]*?<\/doc>/, ""), "invalid-base64"]) {
    let calls = 0
    const runtime = createAiRuntime(fullProfile(), serviceEnv, async () => {
      calls++
      return Response.json({ rawData: response === "invalid-base64" ? response : Buffer.from(response).toString("base64") })
    })
    if (response === "invalid-base64") await assert.rejects(researchYandex("тест", "webSearch", "", runtime), AiServiceError)
    else assert.equal((await researchYandex("тест", "webSearch", "", runtime)).grounded, false)
    assert.equal(calls, 1)
  }
  const disabled = createAiRuntime(yandex(), yandexEnv, async () => { throw new Error("must not send") })
  await assert.rejects(researchYandex("тест", "webSearch", "", disabled), AiPolicyError)
})

test("normalized speech preserves original timing when refinement omits timestamps", () => {
  const refined = { result: { finalRefinement: { finalIndex: "0", normalizedText: { alternatives: [{ text: "Уточнённый текст" }], channelTag: "0" } } } }
  const result = parseSpeechResult(JSON.stringify([speechEvents[0], refined]))
  assert.deepEqual(result, [{ startSeconds: 0.1, durationSeconds: 0.8, speaker: "Unknown", transcript: "Уточнённый текст" }])
  assert.throws(() => parseSpeechResult(JSON.stringify(refined)), AiServiceError)
})

const ocrPages = [
  { result: { page: "0", textAnnotation: { fullText: "Первая страница 123" } } },
  { result: { page: "1", textAnnotation: { fullText: "Вторая страница 456" } } },
]

test("PDF goes directly to Yandex OCR without vision, temporary files or native tools", async () => {
  const profile = buildStage3Profile(yandex(), ["pdf"])
  assert.equal(profile.models["yandex-vision"].enabled, false)
  const calls: string[] = []
  const runtime = createAiRuntime(profile, { ...yandexEnv, YANDEX_OCR_API_KEY: "synthetic-ocr" }, async (input, init) => {
    const url = String(input)
    calls.push(url)
    assert.equal(new Headers(init?.headers).get("authorization"), "Api-Key synthetic-ocr")
    assert.equal(init?.redirect, "error")
    if (url.endsWith("recognizeTextAsync")) {
      assert.deepEqual(JSON.parse(String(init?.body)), { mimeType: "application/pdf", languageCodes: ["*"], model: "page", content: Buffer.from("%PDF-synthetic").toString("base64") })
      assert.equal(new Headers(init?.headers).get("x-data-logging-enabled"), "false")
      return Response.json({ id: "ocr-operation" })
    }
    if (url.includes("operation.api.")) return Response.json({ done: true })
    assert.equal(url, "https://ai.api.cloud.yandex.net/ocr/v1/getRecognition?operationId=ocr-operation")
    return new Response(ocrPages.map((page) => JSON.stringify(page)).join("\n"))
  })
  const prepared = await prepareMediaInput("parsePdf", Buffer.from("%PDF-synthetic"), "file.pdf", "application/pdf", runtime)
  assert.equal(prepared.preprocessingModel, "vision-ocr/page")
  assert.match(JSON.stringify(prepared.content), /Первая страница 123[\s\S]*Вторая страница 456/)
  assert.equal(calls.length, 3)
})

test("OCR rejects page gaps, duplicates, over-limit and empty results instead of accepting partial documents", () => {
  assert.throws(() => parseOcrResult(JSON.stringify(ocrPages), 1), AiPolicyError)
  for (const pages of [[ocrPages[1]], [ocrPages[0], ocrPages[0]], [{ result: { page: "0", textAnnotation: { fullText: "" } } }]]) {
    assert.throws(() => parseOcrResult(JSON.stringify(pages), 10))
  }
  assert.match(parseOcrResult(JSON.stringify([ocrPages[1], ocrPages[0]]), 10), /Page 1[\s\S]*Page 2/)
})

test("OCR rejects invalid inputs before network and propagates safe errors without a decoder fallback", async () => {
  let requests = 0
  const runtime = createAiRuntime(fullProfile(), serviceEnv, async () => { requests++; return new Response("private details", { status: 403 }) })
  await assert.rejects(recognizePdf(Buffer.alloc(10_000_001), runtime), AiPolicyError)
  await assert.rejects(recognizePdf(Buffer.from("not a PDF"), runtime), AiPolicyError)
  assert.equal(requests, 0)
  await assert.rejects(recognizePdf(Buffer.from("%PDF-synthetic"), runtime), (error: unknown) => {
    assert.ok(error instanceof AiServiceError)
    assert.equal(error.service, "ocr")
    assert.equal(error.message.includes("private details"), false)
    return true
  })
  assert.equal(requests, 1)
})

test("WAV microphone encoding produces bounded mono PCM with correct duration and clipping", () => {
  const wav = new Uint8Array(encodeMonoWav([new Float32Array(48000).fill(2), new Float32Array(48000).fill(-2)], 48000))
  assert.equal(speechContainer(wav), "WAV")
  assert.equal(pcmWavDuration(wav), 2)
  assert.equal(wav.length, 44 + 2 * 16000 * 2)
  const view = new DataView(wav.buffer)
  assert.equal(view.getInt16(44, true), 32767)
  assert.equal(view.getInt16(44 + 16000 * 2, true), -32768)
  assert.throws(() => encodeMonoWav([], 48000))
  assert.throws(() => encodeMonoWav([new Float32Array(16000 * 92)], 16000))
  assert.throws(() => pcmWavDuration(wav.subarray(0, 50)), AiPolicyError)
})

test("MP3, PCM WAV and OGG Opus reach SpeechKit unchanged with explicit container types", async () => {
  const fixtures = [
    { type: "MP3", bytes: Buffer.from([255, 251, 144, 0, 0, 0]) },
    { type: "OGG_OPUS", bytes: Buffer.from("OggS synthetic header OpusHead") },
    { type: "WAV", bytes: Buffer.from(encodeMonoWav([new Float32Array(32000)], 16000)) },
  ]
  for (const fixture of fixtures) {
    const runtime = createAiRuntime(fullProfile(), serviceEnv, async (input, init) => {
      const url = String(input)
      if (url.endsWith("recognizeFileAsync")) {
        const body = JSON.parse(String(init?.body))
        assert.equal(body.content, fixture.bytes.toString("base64"))
        assert.equal(body.recognitionModel.audioFormat.containerAudio.containerAudioType, fixture.type)
        assert.equal(body.uri, undefined)
        return Response.json({ id: "speech-operation" })
      }
      if (url.includes("operation.api.")) return Response.json({ done: true })
      if (url.includes("getRecognition")) return new Response(JSON.stringify(speechEvents))
      assert.match(url, /deleteRecognition/)
      return new Response("")
    })
    const result = await transcribeMedia(fixture.bytes, "audio", runtime)
    assert.equal(result.durationSeconds, 2)
    assert.equal(result.segments[0].transcript, "Тестовый заказ 123")
  }
})

test("unsupported audio and video never trigger hidden conversion or external calls", async () => {
  let requests = 0
  const runtime = createAiRuntime(fullProfile(), serviceEnv, async () => { requests++; throw new Error("must not send") })
  for (const bytes of [Buffer.from("ftypM4A"), Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from("OggS vorbis")]) {
    await assert.rejects(transcribeMedia(bytes, "audio", runtime), AiPolicyError)
  }
  await assert.rejects(transcribeMedia(Buffer.from("video"), "video", runtime), AiPolicyError)
  assert.throws(() => buildStage3Profile(yandex(), ["video"]), AiConfigurationError)
  assert.equal(requests, 0)
})

test("compressed recording duration comes from full received audio, not its final utterance", async () => {
  const runtime = createAiRuntime(fullProfile(), serviceEnv, async (input) => {
    const url = String(input)
    if (url.endsWith("recognizeFileAsync")) return Response.json({ id: "speech-operation" })
    if (url.includes("operation.api.")) return Response.json({ done: true })
    if (url.includes("getRecognition")) return Response.json({ result: { ...speechEvents[0].result, audioCursors: { finalIndex: "0", receivedDataMs: "181000" } } })
    return new Response("")
  })
  await assert.rejects(transcribeMedia(Buffer.from([255, 251, 144, 0]), "audio", runtime), AiPolicyError)
})

test("audio worklet flushes its final partial buffer and mixes channels locally", () => {
  const messages: { type: string; buffer?: ArrayBuffer }[] = []
  type Processor = { port: { onmessage: (event: { data: { type: string } }) => void }; process: (inputs: Float32Array[][]) => boolean }
  let ProcessorClass: new () => Processor
  runInNewContext(readFileSync("public/ai/pcm-recorder.js", "utf8"), {
    AudioWorkletProcessor: class { port = { postMessage: (message: { type: string; buffer?: ArrayBuffer }) => messages.push(message) } },
    registerProcessor: (_: string, implementation: new () => Processor) => { ProcessorClass = implementation },
  })
  const processor = new ProcessorClass!()
  assert.equal(processor.process([[new Float32Array([1, 0]), new Float32Array([0, -1])]]), true)
  processor.port.onmessage({ data: { type: "stop" } })
  assert.equal(messages[0].type, "chunk")
  assert.deepEqual(Array.from(new Float32Array(messages[0].buffer!)), [0.5, -0.5])
  assert.equal(messages[1].type, "stopped")
  assert.equal(processor.process([]), false)
})

// ── LLM usage metering + daily cap (src/server/ai/usage.ts) ───────────────
function fakeSink(options: { refuse?: boolean } = {}) {
  const events: AiUsageEvent[] = []
  const checks: string[] = []
  const sink: AiUsageSink = {
    async assertWithinBudget(event) {
      checks.push(`${event.organizationId}:${event.task}:${event.operation}`)
      if (options.refuse && event.organizationId) throw new AiBudgetError()
    },
    async record(event) { events.push(event) },
  }
  return { sink, events, checks }
}
const flush = () => new Promise((resolve) => setImmediate(resolve))

test("without a registered sink models are not metered", async () => {
  registerAiUsageSink(undefined)
  const fakeFetch: typeof fetch = async () => Response.json(completion("OK"))
  const route = createAiRuntime(yandex(), yandexEnv, fakeFetch).resolve({ task: "chat", organizationId: "org-1" })
  assert.equal((await generateText({ model: route.model, prompt: "synthetic", maxRetries: 0 })).text, "OK")
})

test("metering records org, item, task, folder-free model and tokens; never prompt text", async () => {
  const { sink, events, checks } = fakeSink()
  registerAiUsageSink(sink)
  try {
    const fakeFetch: typeof fetch = async () => Response.json({ ...completion("OK"),
      usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } })
    const runtime = createAiRuntime(yandex(), yandexEnv, fakeFetch)
    // Context from withAiUsageContext; explicit organizationId wins.
    const fromContext = withAiUsageContext({ organizationId: "org-ctx", sourceItemId: "item-1" },
      () => runtime.resolve({ task: "cards" }))
    const explicit = withAiUsageContext({ organizationId: "org-ctx" },
      () => runtime.resolve({ task: "deals", organizationId: "org-explicit" }))
    await generateText({ model: fromContext.model, prompt: "secret prompt", maxRetries: 0 })
    await generateText({ model: explicit.model, prompt: "secret prompt", maxRetries: 0 })
    await flush()
    assert.deepEqual(checks, ["org-ctx:cards:generate", "org-explicit:deals:generate"])
    assert.equal(events.length, 2)
    assert.deepEqual({ ...events[0], latencyMs: 0 }, {
      organizationId: "org-ctx", sourceItemId: "item-1", task: "cards", modelId: "yandex-text",
      model: "yandexgpt-5.1", operation: "generate", inputTokens: 11, outputTokens: 7,
      latencyMs: 0, ok: true, errorClass: null,
    })
    assert.equal(events[1].organizationId, "org-explicit")
    assert.equal(events[1].sourceItemId, null)
    assert.ok(!JSON.stringify(events).includes("secret prompt"))
  } finally {
    registerAiUsageSink(undefined)
  }
})

test("daily cap refusal happens before any provider request", async () => {
  const { sink } = fakeSink({ refuse: true })
  registerAiUsageSink(sink)
  try {
    let calls = 0
    const fakeFetch: typeof fetch = async () => { calls++; return Response.json(completion("OK")) }
    const route = createAiRuntime(yandex(), yandexEnv, fakeFetch).resolve({ task: "chat", organizationId: "org-1" })
    await assert.rejects(generateText({ model: route.model, prompt: "synthetic", maxRetries: 0 }), AiBudgetError)
    assert.equal(calls, 0)
    assert.ok(new AiBudgetError() instanceof AiPolicyError)
  } finally {
    registerAiUsageSink(undefined)
  }
})

test("provider failures are recorded with a safe error class and rethrown", async () => {
  const { sink, events } = fakeSink()
  registerAiUsageSink(sink)
  try {
    const fakeFetch: typeof fetch = async () => new Response("{}", { status: 429 })
    const route = createAiRuntime(yandex(), yandexEnv, fakeFetch).resolve({ task: "chat", organizationId: "org-1" })
    await assert.rejects(generateText({ model: route.model, prompt: "synthetic", maxRetries: 0 }))
    await flush()
    assert.equal(events.length, 1)
    assert.equal(events[0].ok, false)
    assert.equal(events[0].errorClass, "http_429")
    assert.equal(events[0].inputTokens, null)
  } finally {
    registerAiUsageSink(undefined)
  }
})

test("streams are recorded once with final usage", async () => {
  const { sink, events, checks } = fakeSink()
  registerAiUsageSink(sink)
  try {
    const fakeFetch: typeof fetch = async () => {
      const chunks = [
        { id: "synthetic", created: 0, model: "test", choices: [{ index: 0, delta: { role: "assistant", content: "OK" }, finish_reason: null }] },
        { choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } },
      ]
      return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", {
        headers: { "Content-Type": "text/event-stream" },
      })
    }
    const route = createAiRuntime(yandex(), yandexEnv, fakeFetch).resolve({ task: "analytics", organizationId: "org-1" })
    const result = streamText({ model: route.model, prompt: "synthetic", maxRetries: 0 })
    assert.equal(await result.text, "OK")
    await flush()
    assert.deepEqual(checks, ["org-1:analytics:stream"])
    assert.equal(events.length, 1)
    assert.equal(events[0].operation, "stream")
    assert.equal(events[0].ok, true)
    assert.equal(events[0].inputTokens, 5)
    assert.equal(events[0].outputTokens, 2)
  } finally {
    registerAiUsageSink(undefined)
  }
})

test("model names drop the Yandex folder; error classes never carry free text", () => {
  assert.equal(normalizeUpstreamModel("gpt://b1gfolder/yandexgpt/latest"), "yandexgpt/latest")
  assert.equal(normalizeUpstreamModel("google/gemini-3.1-flash-lite"), "google/gemini-3.1-flash-lite")
  assert.equal(classifyAiError(new AiBudgetError()), "budget_exceeded")
  assert.equal(classifyAiError(new AiPolicyError("x")), "policy")
  assert.equal(classifyAiError({ name: "AbortError" }), "aborted")
  assert.equal(classifyAiError({ name: "contains spaces: secret" }), "unknown")
})

// ── Yandex Billing price sync (src/server/ai/billing.ts) ──────────────────
function testSaKey() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
  const json = JSON.stringify({
    id: "ajekeyid000000000001", service_account_id: "ajesa000000000000001",
    private_key: `PLEASE DO NOT REMOVE THIS LINE! Yandex.Cloud SA Key ID <ajekeyid000000000001>\n${pem}`,
  })
  return { json, publicKey }
}

function sku(id: string, name: string, versions: { at: string; price: string; type?: string }[], unit = "1k*token"): YandexSku {
  return {
    id, name, pricingUnit: unit,
    pricingVersions: versions.map((v) => ({
      type: v.type ?? "STREET_PRICE", effectiveTime: v.at,
      pricingExpressions: [{ rates: [{ startPricingQuantity: "0", unitPrice: v.price, currency: "RUB" }] }],
    })),
  }
}

test("billing: service account key is read raw or base64, never echoed in errors", () => {
  const { json } = testSaKey()
  const raw = parseServiceAccountKey(json)
  const b64 = parseServiceAccountKey(Buffer.from(json).toString("base64"))
  assert.equal(raw.id, "ajekeyid000000000001")
  assert.equal(b64.serviceAccountId, "ajesa000000000000001")
  assert.ok(raw.privateKey.startsWith("-----BEGIN PRIVATE KEY-----"))
  assert.throws(() => parseServiceAccountKey("secret-not-json"), (e: Error) => e instanceof YandexBillingError && !e.message.includes("secret"))
  assert.equal(readYandexBillingCredentials({}), null)
  assert.throws(() => readYandexBillingCredentials({ YANDEX_BILLING_SA_KEY: json }), YandexBillingError)
  assert.throws(() => readYandexBillingCredentials({ YANDEX_BILLING_SA_KEY: json, YANDEX_BILLING_ACCOUNT_ID: "bad id" }), YandexBillingError)
  assert.equal(readYandexBillingCredentials({ YANDEX_BILLING_SA_KEY: json, YANDEX_BILLING_ACCOUNT_ID: "dn2abcdefghij0123456" })?.billingAccountId, "dn2abcdefghij0123456")
})

test("billing: IAM JWT is PS256 with the key id and a verifiable signature", () => {
  const { json, publicKey } = testSaKey()
  const key = parseServiceAccountKey(json)
  const jwt = createIamJwt(key, 1_700_000_000)
  const [head, body, sig] = jwt.split(".")
  assert.deepEqual(JSON.parse(Buffer.from(head, "base64url").toString()), { typ: "JWT", alg: "PS256", kid: key.id })
  const payload = JSON.parse(Buffer.from(body, "base64url").toString())
  assert.equal(payload.iss, key.serviceAccountId)
  assert.equal(payload.exp - payload.iat, 3600)
  assert.equal(payload.aud, "https://iam.api.cloud.yandex.net/iam/v1/tokens")
  assert.ok(verifySignature("sha256", Buffer.from(`${head}.${body}`), {
    key: publicKey, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: 32,
  }, Buffer.from(sig, "base64url")))
})

test("billing: SKU prices convert units, prefer contract prices and use the base tier", () => {
  assert.equal(unitFactorPer1k("1k*token"), 1)
  assert.equal(unitFactorPer1k("token"), 1000)
  assert.equal(unitFactorPer1k("1m*token"), 0.001)
  assert.equal(unitFactorPer1k("request"), null)
  const s = sku("a", "x", [
    { at: "2026-01-01T00:00:00Z", price: "0.8" },
    { at: "2026-02-01T00:00:00Z", price: "0.6", type: "CONTRACT_PRICE" },
  ])
  assert.deepEqual(skuPricePoints(s), [{ at: Date.parse("2026-02-01T00:00:00Z"), per1k: 0.6 }])
  const tiered: YandexSku = {
    id: "t", name: "t", pricingUnit: "token",
    pricingVersions: [{ effectiveTime: "2026-01-01T00:00:00Z", pricingExpressions: [{ rates: [
      { startPricingQuantity: "1000000", unitPrice: "0.0001", currency: "RUB" },
      { startPricingQuantity: "0", unitPrice: "0.0002", currency: "RUB" },
    ] }] }],
  }
  assert.equal(skuPricePoints(tiered)[0]?.per1k, 0.2)
  assert.throws(() => skuPricePoints(sku("r", "r", [{ at: "2026-01-01T00:00:00Z", price: "1" }], "request")), YandexBillingError)
})

test("billing: price plan adds a row only when the price changes, plus announced future prices", () => {
  const now = new Date("2026-11-11T12:00:00Z")
  const skusById = new Map([
    ["in00000000000000000a", sku("in00000000000000000a", "in", [{ at: "2026-03-02T21:00:00Z", price: "0.8" }])],
    ["out0000000000000000a", sku("out0000000000000000a", "out", [
      { at: "2026-03-02T21:00:00Z", price: "0.8" }, { at: "2026-12-01T00:00:00Z", price: "1.0" },
    ])],
  ])
  const link = { inputSkuId: "in00000000000000000a", outputSkuId: "out0000000000000000a" }
  const first = planModelPriceRows({ link, skusById, existing: [], now })
  assert.deepEqual(first.map((r) => [r.validFrom.toISOString(), r.inputRubPer1k, r.outputRubPer1k]), [
    [now.toISOString(), 0.8, 0.8],
    ["2026-12-01T00:00:00.000Z", 0.8, 1],
  ])
  // Second run: nothing changed → nothing to add.
  assert.deepEqual(planModelPriceRows({ link, skusById, existing: first, now: new Date(now.getTime() + 86_400_000) }), [])
  // A manual price that differs → the Yandex price is added from now.
  const manual = [{ validFrom: new Date("2026-10-01T00:00:00Z"), inputRubPer1k: 0.5, outputRubPer1k: 0.5 }]
  const fix = planModelPriceRows({ link, skusById, existing: manual, now })
  assert.equal(fix.length, 2)
  assert.equal(fix[0].inputRubPer1k, 0.8)
  assert.throws(() => planModelPriceRows({ link: { ...link, inputSkuId: "missing0000000000000" }, skusById, existing: [], now }), YandexBillingError)
})

test("billing: text generation SKUs group into model + mode with input and output", () => {
  const groups = groupTextGenerationSkus([
    sku("i1", "Text generation, YandexGPT Pro 5.1 model, input tokens, synchronous mode", []),
    sku("o1", "Text generation, YandexGPT Pro 5.1 model, output tokens, synchronous mode", []),
    sku("c1", "Text generation, YandexGPT Pro 5.1 model, cached tokens, synchronous mode", []),
    sku("i2", "Text generation, Qwen3-14B model, input tokens, batch mode", []),
    sku("x", "Speech synthesis, standard voices", []),
  ])
  assert.deepEqual(groups, [{ key: "YandexGPT Pro 5.1|synchronous", modelName: "YandexGPT Pro 5.1", mode: "synchronous", inputSkuId: "i1", outputSkuId: "o1" }])
  for (const link of Object.values(DEFAULT_SKU_MAP)) {
    assert.match(link.inputSkuId, SKU_ID)
    assert.match(link.outputSkuId, SKU_ID)
  }
})

test("billing: client exchanges a JWT once, sends the IAM token and pages through SKUs", async () => {
  const { json } = testSaKey()
  const calls: { url: string; auth: string | null }[] = []
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url)
    calls.push({ url: u, auth: new Headers(init?.headers).get("authorization") })
    if (u.startsWith("https://iam.api.cloud.yandex.net")) {
      return new Response(JSON.stringify({ iamToken: "t0k3n", expiresAt: new Date(Date.now() + 43_200_000).toISOString() }))
    }
    const page = new URL(u).searchParams.get("pageToken")
    return new Response(JSON.stringify(page
      ? { skus: [{ id: "s2", name: "b" }] }
      : { skus: [{ id: "s1", name: "a" }], nextPageToken: "p2" }))
  }) as typeof fetch
  const client = createYandexBillingClient(
    { key: parseServiceAccountKey(json), billingAccountId: "dn2abcdefghij0123456" }, fakeFetch)
  const skus = await client.listSkus()
  assert.deepEqual(skus.map((s) => s.id), ["s1", "s2"])
  await client.listSkus()
  assert.equal(calls.filter((c) => c.url.includes("iam.api")).length, 1)
  const billing = calls.filter((c) => c.url.includes("billing.api"))
  assert.ok(billing.every((c) => c.auth === "Bearer t0k3n"))
  const q = new URL(billing[0].url).searchParams
  assert.equal(q.get("currency"), "RUB")
  assert.equal(q.get("billingAccountId"), "dn2abcdefghij0123456")
  assert.equal(q.get("filter"), `serviceId="${YANDEX_AI_STUDIO_SERVICE_ID}"`)

  const denied = createYandexBillingClient({ key: parseServiceAccountKey(json), billingAccountId: "dn2abcdefghij0123456" },
    (async () => new Response(JSON.stringify({ message: "invalid authorization metadata" }), { status: 401 })) as typeof fetch)
  await assert.rejects(denied.listSkus(), /IAM token exchange failed: HTTP 401: invalid authorization metadata/)
})
