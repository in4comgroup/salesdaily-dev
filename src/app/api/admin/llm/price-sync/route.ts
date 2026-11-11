import { NextResponse } from "next/server"
import { getPriceSyncState, runPriceSyncNow } from "@/server/admin-llm"
import { adminLlmErrorResponse } from "../_errors"

export const maxDuration = 60

// GET → { configured, configError, lastRun, links, unlinkedModels }
export async function GET() {
  try {
    return NextResponse.json(await getPriceSyncState())
  } catch (error) {
    return adminLlmErrorResponse("price-sync", error)
  }
}

// POST → run the Yandex price sync now → { run }
export async function POST() {
  try {
    return NextResponse.json({ run: await runPriceSyncNow() })
  } catch (error) {
    return adminLlmErrorResponse("price-sync", error)
  }
}
