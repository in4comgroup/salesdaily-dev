import { getServerSession } from "@/lib/get-session"
import { getAiRuntime, AiPolicyError } from "@/server/ai"
import { AiServiceError, readBytesBounded } from "@/server/ai/services"
import { transcribeVoice } from "@/server/ai/voice"

export const runtime = "nodejs"
export const maxDuration = 240
export async function POST(request: Request) {
  const session = await getServerSession()
  if (!session?.user) return Response.json({ error: "Требуется вход в приложение" }, { status: 401 })
  const origin = request.headers.get("origin")
  // Same-origin browser recording only; no cross-origin authenticated uploads.
  const expectedOrigin = new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin
  if (!origin || origin !== expectedOrigin) return Response.json({ error: "Недопустимый источник запроса" }, { status: 403 })
  const mime = request.headers.get("content-type")?.split(";")[0]
  if (!mime || !["audio/wav"].includes(mime)) {
    return Response.json({ error: "Неподдерживаемый формат записи" }, { status: 415 })
  }
  try {
    getAiRuntime().assertFeatureAllowed("serverSpeechRecognition")
    const limit = 8 * 1024 * 1024
    if (Number(request.headers.get("content-length")) > limit) return Response.json({ error: "Запись слишком большая" }, { status: 413 })
    let bytes: Buffer
    try { bytes = await readBytesBounded(request.body, limit) } catch {
      return Response.json({ error: "Не удалось прочитать запись в пределах 8 MiB" }, { status: 413 })
    }
    return Response.json(await transcribeVoice(bytes, session.user.id), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof AiServiceError) console.error("[ai/transcribe]", error.message)
    return Response.json({ error: error instanceof AiPolicyError ? "Голосовой ввод отключён, занят или запись превышает ограничения" : "Не удалось распознать речь. Проверьте настройку SpeechKit и формат записи." },
      { status: error instanceof AiPolicyError ? 403 : 502 })
  }
}
