// Wire-format helpers for the experimental native duplex backend.
// The caller controls timing and must supply silence when muted.
export class NativeInputFramer {
  constructor({ samplesPerFrame = 16000, maxFrames = 2 } = {}) {
    if (!Number.isInteger(samplesPerFrame) || samplesPerFrame <= 0 ||
        !Number.isInteger(maxFrames) || maxFrames < 1) throw new RangeError('Invalid frame limits');
    this.samplesPerFrame = samplesPerFrame;
    this.capacity = samplesPerFrame * maxFrames;
    this.samples = new Int16Array(this.capacity);
    this.length = 0;
  }
  push(pcm16le) {
    if (!Buffer.isBuffer(pcm16le) || pcm16le.length % 2) throw new TypeError('Expected whole PCM16LE samples');
    const count = pcm16le.length / 2;
    if (count + this.length > this.capacity) throw new RangeError('Native input buffer full');
    for (let i = 0; i < count; i++) this.samples[this.length + i] = pcm16le.readInt16LE(i * 2);
    this.length += count;
  }
  take() {
    if (this.length < this.samplesPerFrame) return null;
    const out = Buffer.allocUnsafe(this.samplesPerFrame * 4);
    for (let i = 0; i < this.samplesPerFrame; i++) out.writeFloatLE(this.samples[i] / 32768, i * 4);
    this.samples.copyWithin(0, this.samplesPerFrame, this.length);
    this.length -= this.samplesPerFrame;
    return out.toString('base64');
  }
  reset() { this.samples.fill(0); this.length = 0; }
}

export function nativeAudioToPcm16(audioBase64) {
  if (typeof audioBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(audioBase64)) {
    throw new TypeError('Invalid base64 audio');
  }
  const audio = Buffer.from(audioBase64, 'base64');
  if (audio.length % 4) throw new TypeError('Incomplete float32 audio');
  const pcm = Buffer.allocUnsafe(audio.length / 2);
  for (let i = 0; i < audio.length / 4; i++) {
    const value = audio.readFloatLE(i * 4);
    if (!Number.isFinite(value)) throw new TypeError('Non-finite audio sample');
    const clamped = Math.max(-1, Math.min(1, value));
    pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(clamped * 32768))), i * 2);
  }
  return pcm;
}
