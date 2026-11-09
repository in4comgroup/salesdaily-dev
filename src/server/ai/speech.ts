import "server-only"
import { setTimeout as delay } from "node:timers/promises"
import { z } from "zod"
import type { YandexService } from "./services"
import { AiServiceError } from "./services"
import { AiPolicyError } from "./policy"

const alternative = z.object({
  text: z.string(), startTimeMs: z.coerce.number().nonnegative().optional(), endTimeMs: z.coerce.number().nonnegative().optional(),
  words: z.array(z.object({ startTimeMs: z.coerce.number().nonnegative(), endTimeMs: z.coerce.number().nonnegative() })).optional(),
})
const update = z.object({ alternatives: z.array(alternative), channelTag: z.string().optional() })
const eventSchema = z.object({
  final: update.optional(),
  finalRefinement: z.object({ finalIndex: z.string(), normalizedText: update.optional() }).optional(),
  audioCursors: z.object({ finalIndex: z.string().optional(), receivedDataMs: z.coerce.number().finite().nonnegative().optional() }).optional(),
  channelTag: z.string().optional(),
  statusCode: z.object({ codeType: z.string() }).optional(),
})
export type SpeechSegment = { startSeconds: number; durationSeconds: number; speaker: string; transcript: string }

function speechRecords(body: string): unknown[] {
  let records: unknown[] = []
  if (body.trim()) {
    try { const decoded = JSON.parse(body); records = Array.isArray(decoded) ? decoded : [decoded] }
    catch { records = body.trim().split(/\r?\n/).map((line) => JSON.parse(line)) }
  }
  return records
}

export function parseSpeechResult(body: string): SpeechSegment[] {
  const records = speechRecords(body)
  const segments = new Map<string, SpeechSegment>()
  let fallbackIndex = 0
  for (const record of records) {
    const wrapped = z.object({ result: z.unknown().optional() }).parse(record)
    const event = eventSchema.parse(wrapped.result ?? record)
    if (event.statusCode && !["STATUS_CODE_UNSPECIFIED", "OK", "WORKING", "CLOSED"].includes(event.statusCode.codeType)) {
      throw new AiServiceError("speech", "result")
    }
    const content = event.finalRefinement?.normalizedText ?? event.final
    const item = content?.alternatives[0]
    if (!item?.text.trim()) continue
    const index = event.finalRefinement?.finalIndex ?? event.audioCursors?.finalIndex ?? String(fallbackIndex++)
    const channel = content?.channelTag ?? event.channelTag ?? "0"
    const previous = segments.get(`${channel}:${index}`)
    const start = item.startTimeMs ?? item.words?.[0]?.startTimeMs ?? (previous ? previous.startSeconds * 1000 : undefined)
    const end = item.endTimeMs ?? item.words?.at(-1)?.endTimeMs ?? (previous ? (previous.startSeconds + previous.durationSeconds) * 1000 : undefined)
    if (start === undefined || end === undefined || end < start) throw new AiServiceError("speech", "result")
    // Mono channels are not speaker identities. Until diarization is verified,
    // do not turn channelTag into a speaker name or ask the LLM to invent one.
    segments.set(`${channel}:${index}`, { startSeconds: start / 1000, durationSeconds: (end - start) / 1000,
      speaker: "Unknown", transcript: item.text.trim() })
  }
  return [...segments.values()].sort((a, b) => a.startSeconds - b.startSeconds)
}

export function parseSpeechFileResult(body: string) {
  const segments = parseSpeechResult(body)
  let durationMs = 0
  for (const record of speechRecords(body)) {
    const wrapped = z.object({ result: z.unknown().optional() }).parse(record)
    const event = eventSchema.parse(wrapped.result ?? record)
    durationMs = Math.max(durationMs, event.audioCursors?.receivedDataMs ?? 0)
  }
  if (durationMs <= 0 || segments.some((segment) => (segment.startSeconds + segment.durationSeconds) * 1000 > durationMs + 1)) {
    throw new AiServiceError("speech", "result")
  }
  return { segments, durationSeconds: durationMs / 1000 }
}

export async function recognizeSpeech(
  bytes: Uint8Array, service: YandexService,
  signal: AbortSignal = AbortSignal.timeout(120_000),
  pause: (signal: AbortSignal) => Promise<void> = (s) => delay(1500, undefined, { signal: s }),
  format: "WAV" | "MP3" | "OGG_OPUS" = "WAV",
) {
  if (bytes.byteLength === 0 || bytes.byteLength > 20 * 1024 * 1024) throw new AiPolicyError("SpeechKit input exceeds application size limit")
  let id: string | undefined
  try {
    const start = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]+$/) }).parse(JSON.parse(await service.request("start", {
      signal, body: { content: Buffer.from(bytes).toString("base64"), recognitionModel: {
        model: "general", audioFormat: { containerAudio: { containerAudioType: format } },
        languageRestriction: { restrictionType: "WHITELIST", languageCode: ["ru-RU", "en-US"] },
        textNormalization: { textNormalization: "TEXT_NORMALIZATION_ENABLED" },
      } },
    })))
    id = start.id
    while (true) {
      signal.throwIfAborted()
      const status = z.object({ done: z.boolean().optional(), error: z.unknown().optional() }).parse(
        JSON.parse(await service.request("poll", { id, signal })))
      if (status.error) throw new AiServiceError("speech", "poll")
      if (status.done) break
      await pause(signal)
    }
    return parseSpeechFileResult(await service.request("result", { id, signal }))
  } catch (error) {
    if (error instanceof AiPolicyError || error instanceof AiServiceError) throw error
    throw new AiServiceError("speech", "result")
  } finally {
    // A fresh timeout allows deletion even when the processing deadline expired.
    // Cleanup failure is an error, never silently reported as success.
    if (id) await service.request("delete", { id, signal: AbortSignal.timeout(10_000) })
  }
}
