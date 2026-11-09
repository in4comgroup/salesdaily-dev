import "server-only"
import { getAiRuntime } from "./resolve"
import { transcribeMedia, speechContainer, pcmWavDuration } from "./av"
import { AiPolicyError } from "./policy"

const active = new Set<string>()
export async function transcribeVoice(bytes: Uint8Array, userId: string) {
  const runtime = getAiRuntime()
  runtime.assertFeatureAllowed("serverSpeechRecognition")
  if (speechContainer(bytes) !== "WAV" || pcmWavDuration(bytes) > 91) throw new AiPolicyError("Microphone input requires PCM WAV up to 91 seconds")
  if (active.has(userId)) throw new AiPolicyError("A speech request is already running for this user")
  active.add(userId)
  try {
    const result = await transcribeMedia(bytes, "audio", runtime)
    return { text: result.segments.map((segment) => segment.transcript).join(" ") }
  } finally { active.delete(userId) }
}
