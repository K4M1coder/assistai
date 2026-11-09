// Run against a locally started Pocket TTS server; no recordings leave the machine.
import { performance } from 'node:perf_hooks';

const base = process.env.POCKET_TTS_URL ?? 'http://127.0.0.1:18081';
const text = 'Bonjour, je suis votre assistant vocal local.';

async function synthesize(cancelAfterAudio) {
  const controller = new AbortController();
  const body = new FormData();
  body.set('text', text);
  const start = performance.now();
  const response = await fetch(`${base}/tts`, { method: 'POST', body, signal: controller.signal });
  if (!response.ok || !response.body) throw new Error(`TTS HTTP ${response.status}`);
  const reader = response.body.getReader();
  let bytes = 0;
  let firstByteMs;
  let audioByteMs;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      firstByteMs ??= performance.now() - start;
      bytes += value.length;
      // The response is a streamed WAV. Bytes beyond the header are audio payload.
      if (bytes > 44 && audioByteMs === undefined) {
        audioByteMs = performance.now() - start;
        if (cancelAfterAudio) {
          controller.abort();
          break;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { cancelled: cancelAfterAudio, firstByteMs, audioByteMs, totalMs: performance.now() - start, bytes };
}

const health = await fetch(`${base}/health`);
if (!health.ok) throw new Error(`TTS health HTTP ${health.status}`);
console.log(JSON.stringify({ cancellationProbe: await synthesize(true), subsequentRequest: await synthesize(false) }, null, 2));
