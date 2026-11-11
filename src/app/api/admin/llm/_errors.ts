import { NextResponse } from "next/server"
import { AdminLlmError } from "@/server/admin-llm"

export function adminLlmErrorResponse(scope: string, error: unknown) {
  if (error instanceof AdminLlmError) {
    const status = { unauthorized: 401, forbidden: 403, not_found: 404, invalid: 400 }[error.reason]
    return NextResponse.json({ error: error.message }, { status })
  }
  console.error(`[admin/llm/${scope}] Error:`, error instanceof Error ? error.message : error)
  return NextResponse.json({ error: "Request failed" }, { status: 500 })
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}
