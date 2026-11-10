import { NextRequest, NextResponse } from "next/server"
import {
  getClientResponsibleState,
  setClientResponsible,
} from "@/server/clients"

export {
  type ClientResponsibleState,
  type ClientResponsibleOption,
} from "@/server/clients"

// «Ответственный» for one client.
//   GET → { responsibleUserId, responsibleName, canAssignAny, options }
//   PUT { userId } → { responsibleUserId, responsibleName }
// Permission rules live in setClientResponsible (src/server/clients.ts):
// org owner / admin → any member; plain member → org owners only.

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error"
  switch (message) {
    case "Unauthorized":
    case "No active organization":
      return NextResponse.json({ error: message }, { status: 403 })
    case "Forbidden":
      return NextResponse.json(
        {
          error:
            "Передать компанию можно только владельцу организации. Назначить любого сотрудника может только владелец или администратор.",
        },
        { status: 403 },
      )
    case "Client not found":
      return NextResponse.json({ error: "Компания не найдена" }, { status: 404 })
    case "Not a member":
      return NextResponse.json(
        { error: "Пользователь не состоит в организации" },
        { status: 400 },
      )
    default:
      return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    return NextResponse.json(await getClientResponsibleState(id))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const userId = typeof body?.userId === "string" ? body.userId.trim() : ""
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }
    return NextResponse.json(await setClientResponsible(id, userId))
  } catch (error) {
    return errorResponse(error)
  }
}
