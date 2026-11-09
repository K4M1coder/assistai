class CaptureProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.phase = 0; this.buffer = []; }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const sample of input) {
      this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        this.buffer.push(Math.max(-32768, Math.min(32767, Math.round(sample * 32767))));
      }
    }
    while (this.buffer.length >= 320) {
      const frame = Int16Array.from(this.buffer.splice(0, 320));
      this.port.postMessage(frame.buffer, [frame.buffer]);
    }
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
