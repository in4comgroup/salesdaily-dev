import { NextRequest, NextResponse } from "next/server"
import { addLlmPrice, deleteLlmPrice, listLlmPrices } from "@/server/admin-llm"
import { adminLlmErrorResponse, readJson } from "../_errors"

// GET → { prices, knownModels }
export async function GET() {
  try {
    return NextResponse.json(await listLlmPrices())
  } catch (error) {
    return adminLlmErrorResponse("prices", error)
  }
}

// POST { model, inputRubPer1k, outputRubPer1k, validFrom? }
export async function POST(request: Request) {
  const body = await readJson(request)
  if (!body) return NextResponse.json({ error: "JSON body is required" }, { status: 400 })
  try {
    await addLlmPrice({
      model: body.model,
      inputRubPer1k: body.inputRubPer1k,
      outputRubPer1k: body.outputRubPer1k,
      validFrom: body.validFrom,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return adminLlmErrorResponse("prices", error)
  }
}

// DELETE ?id=
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })
  try {
    await deleteLlmPrice(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return adminLlmErrorResponse("prices", error)
  }
}
