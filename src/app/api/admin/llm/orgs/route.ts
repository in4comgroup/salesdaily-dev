import { NextResponse } from "next/server"
import { listAdminLlmOrgs, updateAdminLlmOrg } from "@/server/admin-llm"
import { adminLlmErrorResponse, readJson } from "../_errors"

// GET → { orgs }: Topics mode, daily cap, today's spend per org.
export async function GET() {
  try {
    return NextResponse.json({ orgs: await listAdminLlmOrgs() })
  } catch (error) {
    return adminLlmErrorResponse("orgs", error)
  }
}

// PUT { organizationId, topicsMode?: "off"|"shadow"|"on", llmDailyCapRub?: number|null }
export async function PUT(request: Request) {
  const body = await readJson(request)
  if (!body || typeof body.organizationId !== "string") {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 })
  }
  try {
    await updateAdminLlmOrg({
      organizationId: body.organizationId,
      topicsMode: body.topicsMode,
      llmDailyCapRub: body.llmDailyCapRub,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return adminLlmErrorResponse("orgs", error)
  }
}
