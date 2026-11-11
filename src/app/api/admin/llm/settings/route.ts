import { NextResponse } from "next/server"
import { getAdminLlmSettings, setMarkupPercent, setPlatformDailyCapRub } from "@/server/admin-llm"
import { adminLlmErrorResponse, readJson } from "../_errors"

// GET → { dailyCapRubDefault, builtInDailyCapRub, dayTimeZone, markupPercent, builtInMarkupPercent }
export async function GET() {
  try {
    return NextResponse.json(await getAdminLlmSettings())
  } catch (error) {
    return adminLlmErrorResponse("settings", error)
  }
}

// PUT { dailyCapRubDefault?: number, markupPercent?: number } (at least one)
export async function PUT(request: Request) {
  const body = await readJson(request)
  const cap = body?.dailyCapRubDefault
  const markup = body?.markupPercent
  if (!body || (cap === undefined && markup === undefined) ||
      (cap !== undefined && typeof cap !== "number") || (markup !== undefined && typeof markup !== "number")) {
    return NextResponse.json({ error: "dailyCapRubDefault and/or markupPercent (number) is required" }, { status: 400 })
  }
  try {
    if (typeof cap === "number") await setPlatformDailyCapRub(cap)
    if (typeof markup === "number") await setMarkupPercent(markup)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return adminLlmErrorResponse("settings", error)
  }
}
