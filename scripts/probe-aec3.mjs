// Synthetic echo-path sanity check; this does not access speakers or a microphone.
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import makeAec from '@ennuicastr/webrtcaec3.js';

const wav = readFileSync('.cache/french-test.wav');
if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.readUInt16LE(22) !== 1 || wav.readUInt32LE(24) !== 24000 || wav.readUInt16LE(34) !== 16 || wav.toString('ascii', 36, 40) !== 'data') throw Error('Expected 24 kHz mono PCM16 WAV');
const samples = new Float32Array((wav.length - 44) / 2);
for (let i = 0; i < samples.length; i++) samples[i] = wav.readInt16LE(44 + 2 * i) / 32768;
const total = 48000 * 12, delay = 2400, render = new Float32Array(total), near = new Float32Array(total);
for (let i = 0; i < total; i++) {
  render[i] = samples[Math.floor(i / 2) % samples.length];
  // A different delayed synthetic phrase approximates near-end speech; it is not a human recording.
  near[i] = i > 8 * 48000 ? 0.35 * samples[(Math.floor(i / 2) + Math.floor(samples.length / 3)) % samples.length] : 0;
}
const module = await makeAec();
const aec = new module.AEC3(48000, 1, 1);
let inputEnergy = 0, outputEnergy = 0, nearEnergy = 0, doubleTalkOutputEnergy = 0;
const start = performance.now();
for (let i = 0; i < total; i += 480) {
  const frame = render.subarray(i, i + 480), capture = new Float32Array(480);
  for (let j = 0; j < 480; j++) capture[j] = (i + j >= delay ? 0.4 * render[i + j - delay] : 0) + near[i + j];
  aec.analyze([frame]);
  const output = [new Float32Array(aec.processSize([capture]))];
  aec.process(output, [capture]);
  for (let j = 0; j < output[0].length; j++) {
    if (i >= 4 * 48000 && i < 8 * 48000) { inputEnergy += capture[j] ** 2; outputEnergy += output[0][j] ** 2; }
    if (i >= 9 * 48000) { nearEnergy += near[i + j] ** 2; doubleTalkOutputEnergy += output[0][j] ** 2; }
  }
}
aec.free();
console.log(JSON.stringify({ seconds: 12, wallMs: Math.round(performance.now() - start), echoOnlyReductionDb: 10 * Math.log10(inputEnergy / outputEnergy), doubleTalkOutputToNearDb: 10 * Math.log10(doubleTalkOutputEnergy / nearEnergy), note: 'synthetic fixed-delay mixture; double-talk energy is not speech intelligibility' }));
