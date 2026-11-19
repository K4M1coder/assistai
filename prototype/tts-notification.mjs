// Optional local TTS for bounded task notifications. The caller controls cancellation.
export async function streamTtsNotification({ url, text, signal, onFormat, onAudio, timeoutMs = 15000, fetcher = fetch }) {
  const form = new FormData(); form.set('text', text);
  const stalled = new AbortController(); let timer;
  const resetTimeout = () => { clearTimeout(timer); timer = setTimeout(() => stalled.abort(), timeoutMs); };
  resetTimeout();
  try {
    const response = await fetcher(`${url.replace(/\/$/, '')}/tts`, { method: 'POST', body: form, signal: AbortSignal.any([signal, stalled.signal]) });
    if (!response.ok || !response.body) throw Error(`TTS HTTP ${response.status}`);
    let header = Buffer.alloc(0), started = false, audioBytes = 0;
    for await (const bytes of response.body) {
      if (signal.aborted) throw Error('TTS cancelled');
      resetTimeout(); let chunk = Buffer.from(bytes);
      if (!started) {
        header = Buffer.concat([header, chunk]);
        if (header.length < 44) continue;
        const rate = header.readUInt32LE(24);
        if (header.toString('ascii',0,4) !== 'RIFF' || header.toString('ascii',8,12) !== 'WAVE' ||
            header.toString('ascii',36,40) !== 'data' || header.readUInt16LE(20) !== 1 ||
            header.readUInt16LE(22) !== 1 || header.readUInt16LE(34) !== 16 || rate < 8000 || rate > 96000) throw Error('Unsupported TTS WAV format');
        onFormat(rate); chunk = header.subarray(44); started = true;
      }
      audioBytes += chunk.length;
      if (audioBytes > 4 * 1024 * 1024) throw Error('TTS audio exceeds limit');
      if (chunk.length) onAudio(chunk);
    }
    if (signal.aborted) throw Error('TTS cancelled');
    if (!started || !audioBytes || audioBytes % 2) throw Error('TTS returned empty or incomplete PCM16 audio');
  } catch (error) {
    if (stalled.signal.aborted && !signal.aborted) throw Error('TTS stream stalled');
    throw error;
  } finally { clearTimeout(timer); }
}
