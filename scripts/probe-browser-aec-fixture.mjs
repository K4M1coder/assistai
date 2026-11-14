// Offline synthetic WAV replay through the browser's AEC3 dependency.
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import makeAec from '@ennuicastr/webrtcaec3.js';
import path from 'node:path';

const directory = process.argv[2];
if (!directory) throw Error('Synthetic fixture directory required');
function read(name) {
  const wav = readFileSync(path.join(directory, `${name}.wav`));
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 36, 40) !== 'data' ||
      wav.readUInt16LE(22) !== 1 || wav.readUInt32LE(24) !== 48000 || wav.readUInt16LE(34) !== 16) throw Error('Expected 48 kHz mono PCM16 WAV');
  const samples = new Float32Array((wav.length - 44) / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = wav.readInt16LE(44 + 2 * i) / 32768;
  return samples;
}
const reference = read('ref'), microphone = read('mic');
if (reference.length !== microphone.length || reference.length % 480) throw Error('Expected aligned 10 ms frames');
const output = new Float32Array(reference.length), module = await makeAec(), aec = new module.AEC3(48000, 1, 1);
const start = performance.now();
try {
  for (let i = 0; i < reference.length; i += 480) {
    const input = microphone.subarray(i, i + 480), cleaned = [new Float32Array(aec.processSize([input]))];
    aec.analyze([reference.subarray(i, i + 480)]); aec.process(cleaned, [input]); output.set(cleaned[0], i);
  }
} finally { aec.free(); }
writeFileSync(path.join(directory, 'browser.f32'), Buffer.from(output.buffer), { flag: 'wx' });
console.log(JSON.stringify({ processingMs: Math.round(performance.now() - start), outputSamples: output.length }));
