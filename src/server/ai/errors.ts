import { AiServiceError } from "./services"
import "server-only"

import { AiConfigurationError } from "./config"
import { AiPolicyError } from "./policy"

type FailureKind = "http" | "network" | "timeout" | "response" | "unknown"
const networkCodes = new Set([
  "ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT",
  "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "ERR_TLS_CERT_ALTNAME_INVALID",
  "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "UNABLE_TO_GET_ISSUER_CERT", "CERT_UNTRUSTED",
])

// Extract only known metadata. Never retain messages, bodies, headers, URLs,
// original errors or their cause chains: they may contain customer data.
function failureMetadata(error: unknown) {
  let statusCode: number | undefined
  let networkCode: string | undefined
  let kind: FailureKind = "unknown"
  const seen = new Set<unknown>()
  for (let current = error, depth = 0; depth < 6 && current && typeof current === "object" && !seen.has(current); depth++) {
    seen.add(current)
    const record = current as Record<string, unknown>
    if (typeof record.statusCode === "number" && Number.isInteger(record.statusCode) &&
        record.statusCode >= 100 && record.statusCode <= 599) statusCode ??= record.statusCode
    if (typeof record.code === "string" && networkCodes.has(record.code)) networkCode ??= record.code
    if (record.name === "TimeoutError" || record.name === "AbortError") kind = "timeout"
    if (typeof record.name === "string" &&
        ["AI_TypeValidationError", "AI_JSONParseError", "AI_NoObjectGeneratedError"].includes(record.name)) {
      if (kind !== "timeout") kind = "response"
    }
    current = record.cause
  }
  if (networkCode) kind = networkCode.includes("TIMEOUT") || networkCode === "ETIMEDOUT" ? "timeout" : "network"
  if (statusCode && statusCode >= 300) kind = "http"
  return { statusCode, networkCode, kind }
}

export class AiProviderError extends Error {
  readonly kind: FailureKind
  readonly statusCode?: number
  readonly networkCode?: string

  constructor(error: unknown, stream = false) {
    const metadata = failureMetadata(error)
    const status = metadata.statusCode ? ` (HTTP ${metadata.statusCode})` : ""
    super(`Yandex AI ${stream ? "stream" : "request"} failed${status}`)
    this.name = "AiProviderError"
    this.kind = metadata.kind
    this.statusCode = metadata.statusCode
    this.networkCode = metadata.networkCode
  }
}

export class AiMediaError extends Error {
  constructor(reason: "incomplete-vision") {
    super(reason === "incomplete-vision"
      ? "Vision returned empty or truncated content; document was not accepted. Check image density and model output limits."
      : "Media processing failed.")
    this.name = "AiMediaError"
  }
}

export class AiProbeError extends Error {
  constructor(reason: "empty-response" | "unexpected-structured-response" | "tool-loop-incomplete") {
    const messages = {
      "empty-response": "Probe failed: model returned no visible text. The output budget may have been consumed by reasoning.",
      "unexpected-structured-response": "Probe failed: structured output did not match the expected value.",
      "tool-loop-incomplete": "Probe failed: the model did not complete the requested tool call and final answer.",
    }
    super(messages[reason])
    this.name = "AiProbeError"
  }
}

export function formatAiCheckError(error: unknown): string {
  if (error instanceof AiConfigurationError || error instanceof AiPolicyError || error instanceof AiProbeError || error instanceof AiMediaError || error instanceof AiServiceError) {
    return error.message
  }
  const metadata = error instanceof AiProviderError ? error : failureMetadata(error)
  const detail = [
    `category=${metadata.kind}`,
    metadata.statusCode ? `HTTP ${metadata.statusCode}` : undefined,
    metadata.networkCode,
  ].filter(Boolean).join(", ")
  let hint = "Check connectivity and model/API compatibility."
  if (metadata.statusCode === 401) hint = "Check the secret API-key value and its expiration."
  else if (metadata.statusCode === 403) hint = "Check service-account roles, API-key scope and folder access."
  else if (metadata.statusCode === 429) hint = "Check model quotas and request rate."
  else if (metadata.statusCode === 400 || metadata.statusCode === 404) hint = "Check model URI, availability and supported request parameters."
  else if (metadata.kind === "timeout") hint = "The request timed out or was cancelled. Check network access and model latency."
  else if (metadata.kind === "response") hint = "The response did not match the expected API format/schema."
  return `AI check failed (${detail}). ${hint} Raw provider details suppressed.`
}
