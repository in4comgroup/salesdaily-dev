import "server-only"
import { AiConfigurationError } from "./config"

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

// Fixed Yandex REST operations. Vision OCR shares the AI Studio origin
// (YANDEX_AI_API_URL); SpeechKit, operations and Search API hosts are fixed.
export function createYandexService(
  name: ServiceName,
  access: { apiUrl: string; apiKey: string; folderId: string },
  transport: typeof fetch = fetch,
) {
  const key = access.apiKey
  const folder = access.folderId
  const apiUrl = access.apiUrl
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
        ocrStart: `${apiUrl}/ocr/v1/recognizeTextAsync`,
        ocrResult: `${apiUrl}/ocr/v1/getRecognition?operationId=${options.id}`,
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
