// Stateful low-pass FIR followed by decimation, for the experimental 48 -> 16 kHz path.
export class Decimate48k {
  constructor() {
    const taps = 63, cutoff = 7000 / 48000, midpoint = (taps - 1) / 2;
    this.coefficients = new Float64Array(taps);
    this.history = new Float64Array(taps);
    let sum = 0;
    for (let i = 0; i < taps; i++) {
      const x = i - midpoint;
      const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x);
      this.coefficients[i] = sinc * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (taps - 1)));
      sum += this.coefficients[i];
    }
    for (let i = 0; i < taps; i++) this.coefficients[i] /= sum;
    this.position = 0;
    this.phase = 0;
  }
  process(input) {
    const result = [];
    for (const sample of input) {
      this.history[this.position] = sample;
      this.position = (this.position + 1) % this.history.length;
      if (this.phase++ === 0) {
        let value = 0;
        for (let i = 0; i < this.coefficients.length; i++) value += this.coefficients[i] * this.history[(this.position - 1 - i + this.history.length) % this.history.length];
        result.push(Math.max(-32768, Math.min(32767, Math.round(value * 32767))));
      }
      this.phase %= 3;
    }
    return Int16Array.from(result);
  }
}
