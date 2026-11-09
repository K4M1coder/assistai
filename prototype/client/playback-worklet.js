// Continuous PCM16 playback: one resampler and a bounded jitter buffer per stream.
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = 24_000 * 30;
    this.samples = new Float32Array(this.capacity);
    this.read = 0; this.count = 0; this.phase = 0;
    this.rate = 24000; this.started = false; this.ended = false; this.carry = -1;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'start') {
        this.reset(); this.rate = data.sampleRate;
      } else if (data.type === 'clear') {
        this.reset();
      } else if (data.type === 'end') {
        this.ended = true;
      } else if (data.type === 'audio') {
        const bytes = new Uint8Array(data.buffer);
        let i = 0;
        if (this.carry !== -1 && bytes.length) { this.push(this.carry | bytes[0] << 8); this.carry = -1; i = 1; }
        for (; i + 1 < bytes.length; i += 2) this.push(bytes[i] | bytes[i + 1] << 8);
        if (i < bytes.length) this.carry = bytes[i];
      }
    };
  }
  reset() { this.read = 0; this.count = 0; this.phase = 0; this.started = false; this.ended = false; this.carry = -1; }
  push(value) {
    if (this.count === this.capacity) { this.reset(); this.port.postMessage({ type: 'overflow' }); return; }
    this.samples[(this.read + this.count) % this.capacity] = (value >= 32768 ? value - 65536 : value) / 32768;
    this.count++;
  }
  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) return true;
    if (!this.started && (this.count >= this.rate * 0.12 || (this.ended && this.count))) this.started = true;
    for (let i = 0; i < output.length; i++) {
      if (!this.started) break;
      if (this.count < 2) {
        if (this.ended) {
          if (this.count) output[i] = this.samples[this.read];
          this.reset(); this.port.postMessage({ type: 'drained' });
        } else {
          this.started = false; this.port.postMessage({ type: 'underrun' });
        }
        break;
      }
      const first = this.samples[this.read], second = this.samples[(this.read + 1) % this.capacity];
      output[i] = first + (second - first) * this.phase;
      this.phase += this.rate / sampleRate;
      while (this.phase >= 1 && this.count > 1) {
        this.read = (this.read + 1) % this.capacity; this.count--; this.phase--;
      }
    }
    return true;
  }
}
registerProcessor('playback-processor', PlaybackProcessor);
