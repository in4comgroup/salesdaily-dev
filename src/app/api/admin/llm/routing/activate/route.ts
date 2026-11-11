import { NextResponse } from "next/server"
import { activateAiRoutingVersion } from "@/server/admin-llm-routing"
import { adminLlmErrorResponse, readJson } from "../../_errors"

// POST { id } → { id } — makes a saved version active again (rollback)
export async function POST(request: Request) {
  const body = await readJson(request)
  if (!body) return NextResponse.json({ error: "JSON body is required" }, { status: 400 })
  try {
    return NextResponse.json(await activateAiRoutingVersion(body.id))
  } catch (error) {
    return adminLlmErrorResponse("routing", error)
  }
}
