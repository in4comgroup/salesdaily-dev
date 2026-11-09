// Browser-side PCM capture -> mono, 16 kHz, signed 16-bit little-endian WAV.
// No codecs, external libraries or remote services are used here.
export function encodeMonoWav(chunks: readonly Float32Array[], sampleRate: number): ArrayBuffer {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error("Invalid microphone sample rate")
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  if (!length || length / sampleRate > 91) throw new Error("Recording is empty or exceeds the microphone duration limit")
  const input = new Float32Array(length)
  let offset = 0
  for (const chunk of chunks) { input.set(chunk, offset); offset += chunk.length }
  const targetRate = 16000
  const outputLength = Math.floor(length * targetRate / sampleRate)
  if (!outputLength) throw new Error("Recording is too short")
  const result = new ArrayBuffer(44 + outputLength * 2)
  const view = new DataView(result)
  const tag = (position: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(position + i, text.charCodeAt(i)) }
  tag(0, "RIFF"); view.setUint32(4, 36 + outputLength * 2, true); tag(8, "WAVE")
  tag(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  tag(36, "data"); view.setUint32(40, outputLength * 2, true)
  for (let i = 0; i < outputLength; i++) {
    // Average source samples for downsampling, preserving spoken audio while
    // avoiding a native codec dependency. Upsampling uses nearest sample.
    const from = Math.floor(i * sampleRate / targetRate)
    const to = Math.min(length, Math.max(from + 1, Math.floor((i + 1) * sampleRate / targetRate)))
    let sum = 0
    for (let j = from; j < to; j++) sum += Number.isFinite(input[j]) ? input[j] : 0
    const value = Math.max(-1, Math.min(1, sum / (to - from)))
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true)
  }
  return result
}
