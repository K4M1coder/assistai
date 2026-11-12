// Synthetic text only; measure network delivery, not audible device output.
import { performance } from 'node:perf_hooks';

const base = new URL(process.env.POCKET_TTS_URL ?? 'http://127.0.0.1:18081');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || base.protocol !== 'http:') throw Error('Expected loopback HTTP TTS');
const phrases = [
  'Bonjour, je suis votre assistant vocal local.',
  'La tâche en arrière-plan est terminée. Le fichier a été corrigé et le résultat est disponible dans la conversation.',
  'Nous allons vérifier les résultats, puis préparer une réponse claire. Si vous avez une autre question, je peux continuer pendant que le travail avance.',
];
for (const text of phrases) {
  const form = new FormData(); form.set('text', text);
  const started = performance.now();
  const response = await fetch(new URL('/tts', base), { method: 'POST', body: form, signal: AbortSignal.timeout(45000) });
  if (!response.ok || !response.body) throw Error(`TTS HTTP ${response.status}`);
  let header = Buffer.alloc(0), ready = false, bytes = 0, firstAudioMs, scheduledEnd = 0, gaps = 0, maxGapMs = 0, rate;
  for await (const value of response.body) {
    let chunk = Buffer.from(value); const arrivalMs = performance.now() - started;
    if (!ready) {
      header = Buffer.concat([header, chunk]);
      if (header.length < 44) continue;
      if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE' ||
          header.toString('ascii', 36, 40) !== 'data' || header.readUInt16LE(20) !== 1 ||
          header.readUInt16LE(22) !== 1 || header.readUInt16LE(34) !== 16) throw Error('Unsupported WAV');
      rate = header.readUInt32LE(24); if (rate < 8000 || rate > 48000) throw Error('Unexpected sample rate');
      chunk = header.subarray(44); ready = true;
    }
    if (!chunk.length) continue;
    const continuing = firstAudioMs !== undefined;
    if (!continuing) firstAudioMs = arrivalMs;
    else if (arrivalMs - scheduledEnd > 30) { gaps++; maxGapMs = Math.max(maxGapMs, arrivalMs - scheduledEnd); }
    // Match the browser's 40 ms scheduling lead; chunks are measured in bytes, including odd boundaries.
    const nextStart = continuing && scheduledEnd >= arrivalMs ? scheduledEnd : Math.max(scheduledEnd, arrivalMs + 40);
    scheduledEnd = nextStart + chunk.length / (rate * 2) * 1000;
    bytes += chunk.length;
  }
  if (!ready || !bytes || bytes % 2) throw Error('Invalid PCM audio');
  console.log(JSON.stringify({ text, first_audio_ms: Math.round(firstAudioMs), total_ms: Math.round(performance.now() - started),
    audio_ms: Math.round(bytes / (rate * 2) * 1000), bytes, sample_rate: rate, delivery_gaps_over_30ms: gaps,
    max_delivery_gap_ms: Math.round(maxGapMs), physical_devices_opened: false }));
}
