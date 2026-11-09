import "server-only"
import { AiConfigurationError, type AiEnvironment } from "./config"

export type ServiceName = "speech" | "search" | "ocr"
export type ServiceOperation = "start" | "poll" | "result" | "delete" | "search" | "ocrStart" | "ocrResult"
export class AiServiceError extends Error {
  constructor(public service: ServiceName, public operation: ServiceOperation, public status?: number, public operationId?: string) {
    super(`Yandex ${service} ${operation} failed${status ? ` (HTTP ${status})` : ""}; check service access, quota and connectivity${operation === "delete" && operationId ? `; cleanup operation ID: ${operationId}` : ""}`)
    this.name = "AiServiceError"
  }
}

export async function readBytesBounded(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Buffer> {
  const reader = body?.getReader()
  if (!reader) return Buffer.alloc(0)
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw new Error("Service response exceeds application limit")
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

export async function readBounded(response: Response, maxBytes = 8 * 1024 * 1024): Promise<string> {
  return (await readBytesBounded(response.body, maxBytes)).toString("utf8")
}

export function createYandexService(
  name: ServiceName, credentialsEnv: string, folderIdEnv: string,
  env: AiEnvironment, transport: typeof fetch = fetch,
) {
  const key = env[credentialsEnv]?.trim()
  const folder = env[folderIdEnv]?.trim()
  if (!key || !/^[\x21-\x7e]+$/.test(key) || !folder || !/^[a-zA-Z0-9_-]+$/.test(folder)) {
    throw new AiConfigurationError(`Missing or invalid Yandex ${name} credentials/folder`)
  }
  return {
    folderId: folder,
    async request(operation: ServiceOperation, options: { id?: string; body?: unknown; signal?: AbortSignal } = {}) {
      const permitted: Record<ServiceName, readonly ServiceOperation[]> = {
        speech: ["start", "poll", "result", "delete"], search: ["search"], ocr: ["ocrStart", "poll", "ocrResult"],
      }
      if (!permitted[name].includes(operation)) throw new AiConfigurationError("Service operation is not permitted")
      if (["poll", "result", "delete", "ocrResult"].includes(operation) && !/^[a-zA-Z0-9_-]+$/.test(options.id ?? "")) {
        throw new AiConfigurationError("Invalid SpeechKit operation ID")
      }
      const endpoints = {
        start: "https://stt.api.cloud.yandex.net/stt/v3/recognizeFileAsync",
        poll: `https://operation.api.cloud.yandex.net/operations/${options.id}`,
        result: `https://stt.api.cloud.yandex.net/stt/v3/getRecognition?operationId=${options.id}`,
        delete: `https://stt.api.cloud.yandex.net/stt/v3/deleteRecognition?operationId=${options.id}`,
        ocrStart: "https://ai.api.cloud.yandex.net/ocr/v1/recognizeTextAsync",
        ocrResult: `https://ai.api.cloud.yandex.net/ocr/v1/getRecognition?operationId=${options.id}`,
        search: "https://searchapi.api.cloud.yandex.net/v2/web/search",
      }
      try {
        const response = await transport(endpoints[operation], {
          method: operation === "delete" ? "DELETE" : ["start", "search", "ocrStart"].includes(operation) ? "POST" : "GET",
          headers: { Authorization: `Api-Key ${key}`, "x-folder-id": folder, "Content-Type": "application/json", "x-data-logging-enabled": "false" },
          ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
          redirect: "error", signal: options.signal ?? AbortSignal.timeout(30_000),
        })
        if (!response.ok) { await response.body?.cancel(); throw new AiServiceError(name, operation, response.status, options.id) }
        return await readBounded(response)
      } catch (error) {
        if (error instanceof AiServiceError) throw error
        throw new AiServiceError(name, operation, undefined, options.id)
      }
    },
  }
}
export type YandexService = ReturnType<typeof createYandexService>
