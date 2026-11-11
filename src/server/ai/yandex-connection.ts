import "server-only"

import { AiConfigurationError, type AiEnvironment } from "./config"
import type { ServiceName } from "./services"

// The only AI connection: Yandex AI Studio API. Defined in code, not in the
// configuration document, so no admin setting can send data to another
// provider. Only the API origin comes from env (YANDEX_AI_API_URL).

export const YANDEX_AI_DEFAULT_API_URL = "https://ai.api.cloud.yandex.net"

export const YANDEX_ENV = {
  apiUrl: "YANDEX_AI_API_URL",
  apiKey: "YANDEX_AI_API_KEY",
  folderId: "YANDEX_AI_FOLDER_ID",
} as const

export const YANDEX_SERVICE_KEY_ENV: Record<ServiceName, string> = {
  ocr: "YANDEX_OCR_API_KEY",
  speech: "YANDEX_SPEECH_API_KEY",
  search: "YANDEX_SEARCH_API_KEY",
}

// Origin of the Yandex AI Studio API. Chat Completions are at `<origin>/v1`,
// Vision OCR at `<origin>/ocr/v1`. Unset → the public default.
export function resolveYandexApiUrl(env: AiEnvironment): string {
  const raw = env[YANDEX_ENV.apiUrl]?.trim()
  if (!raw) return YANDEX_AI_DEFAULT_API_URL
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new AiConfigurationError(`${YANDEX_ENV.apiUrl} must be an https origin`)
  }
  const originOnly = (url.pathname === "/" || url.pathname === "") && !url.search && !url.hash &&
    !url.username && !url.password
  if (url.protocol !== "https:" || !originOnly) {
    throw new AiConfigurationError(`${YANDEX_ENV.apiUrl} must be an https origin without path, query or credentials`)
  }
  return url.origin
}

export function readYandexFolderId(env: AiEnvironment): string {
  const folderId = env[YANDEX_ENV.folderId]?.trim()
  if (!folderId) throw new AiConfigurationError("Yandex AI folder ID is required")
  if (!/^[a-zA-Z0-9_-]+$/.test(folderId)) throw new AiConfigurationError("Invalid Yandex AI folder ID")
  return folderId
}

export function readYandexApiKey(env: AiEnvironment, name: string): string {
  const key = env[name]?.trim()
  if (!key) throw new AiConfigurationError(`Missing Yandex API key environment variable: ${name}`)
  if (!/^[\x21-\x7e]+$/.test(key)) {
    throw new AiConfigurationError("Yandex API key must contain only printable ASCII characters without spaces")
  }
  return key
}
