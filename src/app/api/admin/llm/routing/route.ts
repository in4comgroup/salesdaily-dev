import { NextResponse } from "next/server"
import { getAiRoutingState, saveAiRoutingVersion } from "@/server/admin-llm-routing"
import { adminLlmErrorResponse, readJson } from "../_errors"

// GET → AiRoutingState (active document, version history, this pod's state, env presence)
export async function GET() {
  try {
    return NextResponse.json(await getAiRoutingState())
  } catch (error) {
    return adminLlmErrorResponse("routing", error)
  }
}

// POST { config, comment? } → { id } — saves a new version and makes it active
export async function POST(request: Request) {
  const body = await readJson(request)
  if (!body) return NextResponse.json({ error: "JSON body is required" }, { status: 400 })
  try {
    return NextResponse.json(await saveAiRoutingVersion({ config: body.config, comment: body.comment }))
  } catch (error) {
    return adminLlmErrorResponse("routing", error)
  }
}
