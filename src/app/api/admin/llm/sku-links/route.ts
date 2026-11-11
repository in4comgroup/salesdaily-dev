import { NextResponse } from "next/server"
import { getYandexSkuGroups, setModelSkuLink } from "@/server/admin-llm"
import { adminLlmErrorResponse, readJson } from "../_errors"

export const maxDuration = 60

// GET → { groups: YandexSkuGroup[] | null } (null = Billing API not configured)
export async function GET() {
  try {
    return NextResponse.json({ groups: await getYandexSkuGroups() })
  } catch (error) {
    return adminLlmErrorResponse("sku-links", error)
  }
}

// PUT { model, inputSkuId, outputSkuId } — both SKU ids null = stop syncing the model
export async function PUT(request: Request) {
  const body = await readJson(request)
  if (!body) return NextResponse.json({ error: "JSON body is required" }, { status: 400 })
  try {
    await setModelSkuLink({ model: body.model, inputSkuId: body.inputSkuId, outputSkuId: body.outputSkuId })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return adminLlmErrorResponse("sku-links", error)
  }
}
