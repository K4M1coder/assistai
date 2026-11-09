// Analyze streamed PCM arrival without playing or recording microphone audio.
import { performance } from 'node:perf_hooks';

const text = 'Bonjour, je suis votre assistant vocal local. Je peux vous aider à organiser vos idées, suivre une tâche en arrière-plan, puis vous informer lorsque le résultat est prêt. Je vais parler un peu plus longtemps pour vérifier si le son reste fluide.';
const form = new FormData();
form.set('text', text);
const start = performance.now();
const response = await fetch('http://127.0.0.1:18081/tts', { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) });
if (!response.ok || !response.body) throw Error(`TTS HTTP ${response.status}`);
const chunks = [];
let header = Buffer.alloc(0), rate = 0, totalBytes = 0;
for await (const data of response.body) {
  let bytes = Buffer.from(data);
  if (!rate) {
    header = Buffer.concat([header, bytes]);
    if (header.length < 44) continue;
    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 36, 40) !== 'data') throw Error('Unexpected WAV header');
    rate = header.readUInt32LE(24);
    bytes = header.subarray(44);
  }
  if (bytes.length) { chunks.push({ atMs: performance.now() - start, bytes: bytes.length }); totalBytes += bytes.length; }
}
function schedule(startBufferMs, minimumLeadMs) {
  let end = 0, gapMs = 0;
  for (const chunk of chunks) {
    const begin = end ? Math.max(end, chunk.atMs + minimumLeadMs) : chunk.atMs + startBufferMs;
    if (end) gapMs += begin - end;
    end = begin + chunk.bytes / 2 / rate * 1000;
  }
  return { startBufferMs, minimumLeadMs, gapMs: Math.round(gapMs), playbackEndMs: Math.round(end) };
}
console.log(JSON.stringify({ rate, chunks: chunks.length, firstAudioMs: Math.round(chunks[0]?.atMs), totalAudioMs: Math.round(totalBytes / 2 / rate * 1000), transferMs: Math.round(performance.now() - start), existingScheduler: schedule(40, 40), bufferedScheduler: schedule(200, 0) }));
