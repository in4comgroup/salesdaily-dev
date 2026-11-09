/* global AudioWorkletProcessor, registerProcessor */
// Runs locally in the browser's audio rendering thread. This module never
// makes network requests; PCM is transferred only to our page's main thread.
class CrmPcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(4096)
    this.used = 0
    this.stopped = false
    this.port.onmessage = (event) => {
      if (event.data?.type === "stop") {
        this.stopped = true
        this.flush()
        this.port.postMessage({ type: "stopped" })
      }
    }
  }
  flush() {
    if (!this.used) return
    const buffer = this.buffer.slice(0, this.used)
    this.port.postMessage({ type: "chunk", buffer: buffer.buffer }, [buffer.buffer])
    this.used = 0
  }
  process(inputs) {
    if (this.stopped) return false
    const channels = inputs[0]
    if (!channels?.length) return true
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0
      for (const channel of channels) sample += channel[i] ?? 0
      this.buffer[this.used++] = sample / channels.length
      if (this.used === this.buffer.length) this.flush()
    }
    return true
  }
}
registerProcessor("crm-pcm-recorder", CrmPcmRecorder)
