"use client"

import { useEffect, useRef, useState } from "react"
import { Mic, Square, LoaderCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { encodeMonoWav } from "@/lib/pcm-wav"

type Capture = { context: AudioContext; node: AudioWorkletNode; stream: MediaStream; chunks: Float32Array[]; samples: number; stopping: boolean }

// Capture PCM locally. The server receives WAV directly, without ffmpeg or
// browser SpeechRecognition and its uncontrolled upstream provider.
export function ServerSpeechInput({ onTranscriptionChange, disabled = false }: {
  onTranscriptionChange: (text: string) => void; disabled?: boolean
}) {
  const [state, setState] = useState<"idle" | "recording" | "processing">("idle")
  const capture = useRef<Capture | null>(null)
  const busy = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mounted = useRef(true)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      clearTimeout(timer.current); clearTimeout(flushTimer.current)
      const current = capture.current
      capture.current = null
      current?.node.disconnect()
      current?.stream.getTracks().forEach((track) => track.stop())
      void current?.context.close()
      abort.current?.abort()
    }
  }, [])

  function close(current: Capture) {
    clearTimeout(timer.current); clearTimeout(flushTimer.current)
    current.node.disconnect()
    current.stream.getTracks().forEach((track) => track.stop())
    void current.context.close()
    if (capture.current === current) capture.current = null
  }
  async function finish(current: Capture) {
    if (capture.current !== current) return
    close(current)
    if (!mounted.current) return
    setState("processing")
    try {
      const blob = new Blob([encodeMonoWav(current.chunks, current.context.sampleRate)], { type: "audio/wav" })
      const controller = new AbortController()
      abort.current = controller
      const response = await fetch("/api/ai/transcribe", { method: "POST", body: blob,
        headers: { "Content-Type": "audio/wav" }, signal: controller.signal })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "Не удалось распознать речь")
      if (typeof result.text !== "string" || !result.text.trim()) throw new Error("Речь не обнаружена")
      if (mounted.current) onTranscriptionChange(result.text)
    } catch (error) {
      if (mounted.current) toast.error(error instanceof Error ? error.message : "Не удалось распознать речь")
    } finally { busy.current = false; if (mounted.current) setState("idle") }
  }
  function stop(current: Capture) {
    if (current.stopping || capture.current !== current) return
    current.stopping = true
    setState("processing")
    current.node.port.postMessage({ type: "stop" })
    flushTimer.current = setTimeout(() => {
      if (capture.current !== current) return
      close(current); busy.current = false
      if (mounted.current) { toast.error("Не удалось завершить запись микрофона"); setState("idle") }
    }, 2000)
  }
  async function record() {
    const current = capture.current
    if (current && state === "recording") { stop(current); return }
    if (busy.current || state !== "idle") return
    busy.current = true
    setState("processing")
    let context: AudioContext | undefined
    let stream: MediaStream | undefined
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") throw new Error("Браузер не поддерживает запись микрофона")
      context = new AudioContext()
      if (!context.audioWorklet) throw new Error("Браузер не поддерживает AudioWorklet; откройте приложение через HTTPS")
      await context.resume()
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } })
      if (!mounted.current) { stream.getTracks().forEach((track) => track.stop()); await context.close(); return }
      await context.audioWorklet.addModule("/ai/pcm-recorder.js")
      if (!mounted.current) { stream.getTracks().forEach((track) => track.stop()); await context.close(); return }
      const node = new AudioWorkletNode(context, "crm-pcm-recorder")
      const recording: Capture = { context, node, stream, chunks: [], samples: 0, stopping: false }
      capture.current = recording
      node.port.onmessage = (event: MessageEvent) => {
        if (!mounted.current || capture.current !== recording) return
        if (event.data?.type === "chunk" && event.data.buffer instanceof ArrayBuffer) {
          const chunk = new Float32Array(event.data.buffer)
          recording.samples += chunk.length
          if (recording.samples / recording.context.sampleRate > 91) {
            close(recording); busy.current = false; toast.error("Запись превышает ограничение длительности"); setState("idle"); return
          }
          recording.chunks.push(chunk)
          if (recording.samples / recording.context.sampleRate >= 90) stop(recording)
        } else if (event.data?.type === "stopped") void finish(recording)
      }
      node.onprocessorerror = () => {
        if (capture.current !== recording) return
        close(recording); busy.current = false
        if (mounted.current) { toast.error("Ошибка записи микрофона"); setState("idle") }
      }
      context.createMediaStreamSource(stream).connect(node)
      node.connect(context.destination) // Worklet outputs silence; no feedback.
      setState("recording")
      timer.current = setTimeout(() => stop(recording), 90_000)
    } catch (error) {
      const recording = capture.current
      if (recording) close(recording)
      else { stream?.getTracks().forEach((track) => track.stop()); if (context) void context.close() }
      busy.current = false
      if (mounted.current) { toast.error(error instanceof Error ? error.message : "Не удалось записать речь"); setState("idle") }
    }
  }
  const label = state === "recording" ? "Остановить и распознать запись" : state === "processing" ? "Распознавание речи" : "Записать голосовое сообщение (до 90 секунд)"
  return <Button type="button" size="icon-sm" variant="ghost" aria-label={label} title={label}
    disabled={disabled || state === "processing"} onClick={record}>
    {state === "recording" ? <Square className="text-red-500" /> : state === "processing" ? <LoaderCircle className="animate-spin" /> : <Mic />}
  </Button>
}
