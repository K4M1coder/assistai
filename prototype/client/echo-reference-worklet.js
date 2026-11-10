// Pairs render and microphone samples from the same audio graph in 10 ms blocks.
// This experimental transport does not itself cancel echo or send audio anywhere.
class EchoReferenceProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frameLength = Math.round(sampleRate / 100);
    this.position = 0;
    this.sequence = 0;
    this.render = new Float32Array(this.frameLength);
    this.capture = new Float32Array(this.frameLength);
  }
  process(inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) return true;
    const microphone = inputs[0]?.[0];
    const playback = inputs[1]?.[0];
    for (let i = 0; i < output.length; i++) {
      this.capture[this.position] = microphone?.[i] ?? 0;
      this.render[this.position] = playback?.[i] ?? 0;
      if (++this.position === this.frameLength) {
        const render = this.render, capture = this.capture;
        this.port.postMessage({ type: 'audio', sequence: this.sequence++, sampleRate, render, capture }, [render.buffer, capture.buffer]);
        this.render = new Float32Array(this.frameLength);
        this.capture = new Float32Array(this.frameLength);
        this.position = 0;
      }
    }
    // The output is intentionally silent: captured microphone audio must not be played.
    return true;
  }
}
registerProcessor('echo-reference-processor', EchoReferenceProcessor);
