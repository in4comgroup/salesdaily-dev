import "server-only"

import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { wrapLanguageModel } from "ai"
import { AiConfigurationError, type AiConnection, type AiEnvironment } from "../config"
import { AiPolicyError } from "../policy"
import { AiProviderError } from "../errors"
import { redactDiagnosticBody, type AiDiagnostics } from "../diagnostics"

export function createYandexAdapter(
  connection: Extract<AiConnection, { adapter: "yandex-openai-compatible" }>,
  env: AiEnvironment,
  fetchImplementation: typeof fetch = fetch,
  diagnostics?: AiDiagnostics,
) {
  const apiKey = env[connection.credentialsEnv]?.trim()
  const folderId = env[connection.folderIdEnv]?.trim()
  if (!apiKey || !folderId) throw new AiConfigurationError("Yandex AI credentials and folder ID are required")
  if (!/^[\x21-\x7e]+$/.test(apiKey)) {
    throw new AiConfigurationError("Yandex API key must contain only printable ASCII characters without spaces")
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(folderId)) throw new AiConfigurationError("Invalid Yandex AI folder ID")

  const provider = createOpenAICompatible({
    name: "yandex",
    baseURL: connection.baseUrl,
    supportsStructuredOutputs: true,
    // No apiKey option: explicitly use Yandex's API-key authorization scheme.
    headers: {
      Authorization: `Api-Key ${apiKey}`,
      "OpenAI-Project": folderId,
      "x-data-logging-enabled": "false",
    },
    fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.href !== `${connection.baseUrl}/chat/completions`) {
        throw new AiConfigurationError("Unexpected Yandex AI request destination")
      }
      // Prevent request-level overrides and cross-host redirects. Keep model
      // requests stateless; no provider persistence or external tools.
      const headers = new Headers(init?.headers)
      headers.set("Authorization", `Api-Key ${apiKey}`)
      headers.set("OpenAI-Project", folderId)
      headers.set("x-data-logging-enabled", "false")
      if (diagnostics) diagnostics({ stage: "request", body: redactDiagnosticBody(String(init?.body ?? ""), apiKey) })
      const response = await fetchImplementation(input, { ...init, headers, redirect: "error" })
      if (diagnostics) {
        // Streaming is left unconsumed; debug text/structured/tool responses
        // are cloned so logging cannot consume the SDK's response body.
        const body = response.headers.get("content-type")?.includes("text/event-stream")
          ? "[Streaming body omitted; use --mode text for response inspection]"
          : redactDiagnosticBody(await response.clone().text(), apiKey)
        diagnostics({ stage: "response", status: response.status, body })
      }
      return response
    },
  })

  return (modelId: string, allowImages = false) => {
    if (!modelId.startsWith(`gpt://${folderId}/`) || !/^gpt:\/\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9._/-]+$/.test(modelId)) {
      throw new AiConfigurationError("Yandex model URI must belong to the configured folder")
    }
    return wrapLanguageModel({
      model: provider.chatModel(modelId),
      middleware: {
        specificationVersion: "v3",
        // Prevent SDK fetching arbitrary remote file URLs before validation.
        overrideSupportedUrls: () => ({ "*/*": [/.*/] }),
        transformParams: async ({ params }) => {
          for (const message of params.prompt) {
            if (!Array.isArray(message.content)) continue
            for (const part of message.content) {
              if (part.type !== "file") continue
              if (!allowImages || !(part.data instanceof Uint8Array) ||
                  !["image/png", "image/jpeg"].includes(part.mediaType) ||
                  part.data.byteLength > 10 * 1024 * 1024) {
                throw new AiPolicyError("Yandex accepts only explicitly enabled inline PNG/JPEG images up to 10 MiB")
              }
            }
          }
          return params
        },
        wrapGenerate: async ({ doGenerate }) => {
          try { return await doGenerate() } catch (error) {
            if (error instanceof AiConfigurationError || error instanceof AiPolicyError) throw error
            throw new AiProviderError(error)
          }
        },
        wrapStream: async ({ doStream }) => {
          try {
            const result = await doStream()
            return {
              ...result,
              stream: result.stream.pipeThrough(new TransformStream({
                transform(chunk, controller) {
                  controller.enqueue(chunk.type === "error"
                    ? { type: "error", error: new AiProviderError(chunk.error, true) } : chunk)
                },
              })),
            }
          } catch (error) {
            if (error instanceof AiConfigurationError || error instanceof AiPolicyError) throw error
            throw new AiProviderError(error, true)
          }
        },
      },
    })
  }
}
