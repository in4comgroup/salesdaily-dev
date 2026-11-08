import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { generateText, streamText, Output, tool, stepCountIs } from "ai"
import { z } from "zod"
import { AiConfigurationError, loadAiConfig, parseAiConfig } from "../../src/server/ai/config"
import { AiPolicyError, assertChatContentAllowed } from "../../src/server/ai/policy"
import { createAiRuntime } from "../../src/server/ai/resolve"
import { AiProviderError, AiProbeError, formatAiCheckError } from "../../src/server/ai/errors"
import { redactDiagnosticBody, type AiDiagnosticEvent } from "../../src/server/ai/diagnostics"

function legacy() {
  return JSON.parse(readFileSync("config/ai/legacy.json", "utf8"))
}
function blocked() {
  return JSON.parse(readFileSync("config/ai/blocked.json", "utf8"))
}
const env = { AI_GATEWAY_API_KEY: "synthetic-test-key" }

test("missing configuration fails even when a Gateway key exists", () => {
  assert.throws(() => loadAiConfig(env), AiConfigurationError)
  assert.throws(() => loadAiConfig({ AI_CONFIG_PATH: "/not-an-ai-config.json" }), AiConfigurationError)
})

test("strict schema rejects typos, unsupported adapters, foreign URLs and fallbacks", () => {
  for (const change of [
    (c: ReturnType<typeof legacy>) => { c.policy.allowAll = true },
    (c: ReturnType<typeof legacy>) => { c.connections.vercel.adapter = "unknown" },
    (c: ReturnType<typeof legacy>) => { c.connections.vercel.baseUrl = "https://example.com" },
    (c: ReturnType<typeof legacy>) => { c.tasks.chat.fallbackModels = ["gpt-5-mini"] },
  ]) {
    const config = legacy()
    change(config)
    assert.throws(() => parseAiConfig(config), AiConfigurationError)
  }
})

test("broken references and forbidden defaults fail configuration validation", () => {
  for (const change of [
    (c: ReturnType<typeof legacy>) => { c.policy.allowedConnections = ["unknown"] },
    (c: ReturnType<typeof legacy>) => { c.models["gpt-5-mini"].connectionId = "unknown" },
    (c: ReturnType<typeof legacy>) => { c.tasks.chat.allowedModels.push("unknown") },
    (c: ReturnType<typeof legacy>) => { c.policy.allowedConnections = [] },
    (c: ReturnType<typeof legacy>) => { c.connections.vercel.enabled = false },
    (c: ReturnType<typeof legacy>) => { c.models["gemini-3.1-flash-lite"].enabled = false },
  ]) {
    const config = legacy()
    change(config)
    assert.throws(() => parseAiConfig(config), AiConfigurationError)
  }
})

test("missing active credentials fail without SDK auth fallback", () => {
  assert.throws(() => createAiRuntime(legacy(), {}), AiConfigurationError)
  assert.throws(() => createAiRuntime(legacy(), { AI_GATEWAY_API_KEY: "  " }), AiConfigurationError)
})

test("fully blocked profile needs no credentials and denies every operation", () => {
  const runtime = createAiRuntime(blocked(), {})
  assert.deepEqual(runtime.listModels("chat"), [])
  assert.throws(() => runtime.resolve({ task: "chat" }), AiPolicyError)
  for (const feature of ["webSearch", "websiteFetch", "browserSpeechRecognition"] as const) {
    assert.throws(() => runtime.assertFeatureAllowed(feature), AiPolicyError)
  }
})

test("task enablement and feature policy are independent", () => {
  const config = legacy()
  config.tasks.chat.enabled = false
  config.policy.features.webSearch = false
  const runtime = createAiRuntime(config, env)
  assert.throws(() => runtime.resolve({ task: "chat", modelId: "gpt-5-mini" }), AiPolicyError)
  assert.throws(() => runtime.assertFeatureAllowed("webSearch"), AiPolicyError)
  assert.doesNotThrow(() => runtime.resolve({ task: "analytics" }))
})

test("unknown and unconfigured tasks/models never fall back", () => {
  const config = legacy()
  delete config.tasks.cards
  const runtime = createAiRuntime(config, env)
  assert.throws(() => runtime.resolve({ task: "cards" }), AiPolicyError)
  assert.throws(() => runtime.resolve({ task: "chat", modelId: "google/arbitrary-model" }), AiPolicyError)
  assert.throws(() => runtime.resolve({ task: "analytics", modelId: "gpt-5-mini" }), AiPolicyError)
  assert.throws(() => runtime.resolve({ task: "chat", modelId: "__proto__" }), AiPolicyError)
})

test("disabled models are hidden and cannot be selected directly", () => {
  const config = legacy()
  config.models["gpt-5-mini"].enabled = false
  const runtime = createAiRuntime(config, env)
  assert.equal(runtime.listModels("chat").some((m) => m.id === "gpt-5-mini"), false)
  assert.throws(() => runtime.resolve({ task: "chat", modelId: "gpt-5-mini" }), AiPolicyError)
})

test("model-level enabled cannot bypass a disabled or forbidden connection", () => {
  for (const disabled of [true, false]) {
    const config = legacy()
    config.connections.other = { ...config.connections.vercel, enabled: !disabled }
    config.models["gpt-5-mini"].connectionId = "other"
    if (disabled) config.policy.allowedConnections.push("other")
    const runtime = createAiRuntime(config, env)
    assert.throws(() => runtime.resolve({ task: "chat", modelId: "gpt-5-mini" }), AiPolicyError)
    assert.equal(runtime.listModels("chat").some((m) => m.id === "gpt-5-mini"), false)
  }
})

test("required task capabilities cannot be relaxed and unavailable models are hidden", () => {
  const config = legacy()
  config.models["gpt-5-mini"].capabilities = ["text"]
  const runtime = createAiRuntime(config, env)
  assert.throws(() => runtime.resolve({ task: "chat", modelId: "gpt-5-mini", requiredCapabilities: [] }), AiPolicyError)
  assert.equal(runtime.listModels("chat").some((m) => m.id === "gpt-5-mini"), false)
  assert.throws(() => runtime.resolve({ task: "chat", requiredCapabilities: ["video"] }), AiPolicyError)
  config.models["gemini-3.1-flash-lite"].capabilities = ["text"]
  assert.throws(() => createAiRuntime(config, env), AiPolicyError)
})

test("caller mutation of config and catalogue cannot change runtime policy", () => {
  const config = legacy()
  const runtime = createAiRuntime(config, env)
  config.tasks.chat.allowedModels.push("arbitrary")
  runtime.listModels("chat")[0].capabilities.push("video")
  assert.throws(() => runtime.resolve({ task: "chat", modelId: "arbitrary" }), AiPolicyError)
  assert.throws(() => runtime.resolve({ task: "chat", requiredCapabilities: ["video"] }), AiPolicyError)
})

test("safe catalogue contains neither infrastructure configuration nor secrets", () => {
  const runtime = createAiRuntime(legacy(), env)
  const serialized = JSON.stringify(runtime.listModels("chat"))
  assert.equal(serialized.includes(env.AI_GATEWAY_API_KEY), false)
  assert.equal(serialized.includes("https://"), false)
  assert.equal(serialized.includes("credentialsEnv"), false)
  assert.equal(runtime.resolve({ task: "parseAudio" }).model.modelId, "google/gemini-2.5-flash")
})

test("explicit adapter sends only to configured Gateway and policy denials do not send requests", async () => {
  const calls: { url: string; authorization: string | null }[] = []
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") })
    return Response.json({
      content: [{ type: "text", text: "OK" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
    })
  }
  const config = legacy()
  config.models["gpt-5-mini"].enabled = false
  const runtime = createAiRuntime(config, env, fakeFetch)
  assert.throws(() => runtime.resolve({ task: "chat", modelId: "gpt-5-mini" }), AiPolicyError)
  assert.equal(calls.length, 0)
  const route = runtime.resolve({ task: "chat" })
  const result = await generateText({ model: route.model, prompt: "synthetic", maxRetries: 0 })
  assert.equal(result.text, "OK")
  assert.deepEqual(calls, [{
    url: "https://ai-gateway.vercel.sh/v3/ai/language-model",
    authorization: `Bearer ${env.AI_GATEWAY_API_KEY}`,
  }])
})

test("configuration errors do not disclose unexpected values", () => {
  const config = legacy()
  config.connections.vercel.apiKey = "do-not-print-this-secret"
  assert.throws(() => parseAiConfig(config), (error: unknown) =>
    error instanceof AiConfigurationError && !error.message.includes("do-not-print-this-secret"))
})

const yandexEnv = {
  YANDEX_AI_API_KEY: "synthetic-yandex-key",
  YANDEX_AI_FOLDER_ID: "test-folder",
  YANDEX_AI_TEXT_MODEL_URI: "gpt://test-folder/yandexgpt-5.1",
}

test("text-only chat rejects file parts in new messages and history", () => {
  assert.doesNotThrow(() => assertChatContentAllowed([{ parts: [{ type: "text" }] }], "yandex-openai-compatible"))
  assert.throws(() => assertChatContentAllowed([
    { parts: [{ type: "file" }] }, { parts: [{ type: "text" }] },
  ], "yandex-openai-compatible"), AiPolicyError)
  assert.doesNotThrow(() => assertChatContentAllowed([{ parts: [{ type: "file" }] }], "vercel-gateway"))
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

test("Yandex config requires its own credentials and same-folder model URI", () => {
  for (const environment of [
    {}, { ...yandexEnv, YANDEX_AI_API_KEY: "" },
    { ...yandexEnv, YANDEX_AI_FOLDER_ID: "" },
    { ...yandexEnv, YANDEX_AI_TEXT_MODEL_URI: "" },
    { ...yandexEnv, YANDEX_AI_TEXT_MODEL_URI: "gpt://other-folder/yandexgpt" },
    { ...yandexEnv, YANDEX_AI_TEXT_MODEL_URI: "https://example.com/model" },
  ]) assert.throws(() => createAiRuntime(yandex(), environment), AiConfigurationError)
})

test("regional profile forbids media, Google search and legacy model selections", () => {
  const runtime = createAiRuntime(yandex(), yandexEnv)
  for (const task of ["parsePdf", "parseImage", "parseAudio", "parseVideo", "companyResearch", "companyExtraction", "webSearch"] as const) {
    assert.throws(() => runtime.resolve({ task }), AiPolicyError)
  }
  assert.throws(() => runtime.resolve({ task: "chat", modelId: "gpt-5-mini" }), AiPolicyError)
  assert.throws(() => runtime.resolveGoogleSearch("webSearch"), AiPolicyError)
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
