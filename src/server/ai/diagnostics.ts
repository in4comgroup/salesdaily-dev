import "server-only"

export type AiDiagnosticEvent =
  | { stage: "request"; body: string }
  | { stage: "response"; status: number; body: string }

export type AiDiagnostics = (event: AiDiagnosticEvent) => void

// Used only by opt-in CLI probes, never by normal application requests.
// No request/response headers are passed to the callback.
export function redactDiagnosticBody(body: string, apiKey: string): string {
  const redact = (value: unknown): unknown => {
    if (typeof value === "string") return value.replaceAll(apiKey, "[REDACTED]")
      .replace(/\b(?:Api-Key|Bearer)\s+[a-zA-Z0-9._~+\/-]+/gi, "[REDACTED AUTH]")
    if (Array.isArray(value)) return value.map(redact)
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
        /^(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)$/i.test(key)
          ? "[REDACTED]" : redact(item),
      ]))
    }
    return value
  }
  let output: string
  try { output = JSON.stringify(redact(JSON.parse(body)), null, 2) }
  catch { output = String(redact(body)) }
  return output.length > 65_536 ? output.slice(0, 65_536) + "\n[TRUNCATED]" : output
}
