import { NextRequest, NextResponse } from "next/server"
import { getLlmUsageStats } from "@/server/admin-llm"
import { adminLlmErrorResponse } from "../_errors"

// GET ?from=ISO&to=ISO → { rows } grouped by (Moscow day, org, task, model).
export async function GET(request: NextRequest) {
  const from = new Date(request.nextUrl.searchParams.get("from") ?? "")
  const to = new Date(request.nextUrl.searchParams.get("to") ?? "")
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "from and to are required (ISO timestamps)" }, { status: 400 })
  }
  try {
    return NextResponse.json({ rows: await getLlmUsageStats(from, to) })
  } catch (error) {
    return adminLlmErrorResponse("stats", error)
  }
}
