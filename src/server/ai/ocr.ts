import "server-only"
import { setTimeout as delay } from "node:timers/promises"
import { z } from "zod"
import type { AiRuntime } from "./media"
import { getAiRuntime } from "./resolve"
import { AiPolicyError } from "./policy"
import { AiServiceError } from "./services"

const pageSchema = z.object({
  page: z.coerce.number().int().nonnegative(),
  textAnnotation: z.object({ fullText: z.string() }),
})

export function parseOcrResult(body: string, maxPages: number) {
  let records: unknown[]
  try { const decoded = JSON.parse(body); records = Array.isArray(decoded) ? decoded : [decoded] }
  catch { records = body.trim().split(/\r?\n/).map((line) => JSON.parse(line)) }
  if (!records.length || records.length > maxPages) throw new AiPolicyError("OCR page count is empty or exceeds files.pdfMaxPages")
  const pages = records.map((record) => {
    const wrapped = z.object({ result: z.unknown().optional() }).parse(record)
    return pageSchema.parse(wrapped.result ?? record)
  }).sort((a, b) => a.page - b.page)
  if (pages.some((page, index) => page.page !== index)) throw new AiServiceError("ocr", "ocrResult")
  if (pages.reduce((size, page) => size + page.textAnnotation.fullText.length, 0) > 120_000) {
    throw new AiPolicyError("PDF extracted text exceeds 120000 characters")
  }
  if (pages.every((page) => !page.textAnnotation.fullText.trim())) throw new AiPolicyError("OCR found no readable text in the PDF")
  return pages.map((page) => `## Page ${page.page + 1}\n\n${page.textAnnotation.fullText.trim() || "[No readable text on this page]"}`).join("\n\n")
}

export async function recognizePdf(bytes: Uint8Array, runtime: AiRuntime = getAiRuntime(),
  pause: (signal: AbortSignal) => Promise<void> = (signal) => delay(1500, undefined, { signal })) {
  const service = runtime.service("ocr")
  if (bytes.byteLength > 10_000_000 || Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") {
    throw new AiPolicyError("OCR requires a PDF file up to 10000000 bytes")
  }
  const signal = AbortSignal.timeout(120_000)
  try {
    const operation = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]+$/) }).parse(JSON.parse(await service.request("ocrStart", {
      signal, body: { mimeType: "application/pdf", languageCodes: ["*"], model: "page", content: Buffer.from(bytes).toString("base64") },
    })))
    while (true) {
      signal.throwIfAborted()
      const status = z.object({ done: z.boolean().optional(), error: z.unknown().optional() }).parse(
        JSON.parse(await service.request("poll", { id: operation.id, signal })))
      if (status.error) throw new AiServiceError("ocr", "poll")
      if (status.done) break
      await pause(signal)
    }
    const text = parseOcrResult(await service.request("ocrResult", { id: operation.id, signal }), runtime.files().pdfMaxPages)
    return { text, modelId: "vision-ocr/page" }
  } catch (error) {
    if (error instanceof AiPolicyError || error instanceof AiServiceError) throw error
    throw new AiServiceError("ocr", "ocrResult")
  }
}
