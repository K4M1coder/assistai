// Direct protocol check using an existing synthetic mono 16 kHz PCM16 WAV.
// Does not open a microphone or print the transcript.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import WebSocket from 'ws';

const url = new URL(process.env.ASSISTAI_ASR_PROBE_URL ?? 'ws://127.0.0.1:18082/asr');
if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw Error('ASR probe must use loopback');
const wav = await readFile(process.argv[2] ?? '.cache/omni-french/utterance.wav');
assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
let format, audio;
for (let offset = 12; offset + 8 <= wav.length;) {
  const type = wav.toString('ascii', offset, offset + 4), size = wav.readUInt32LE(offset + 4), start = offset + 8;
  if (start + size > wav.length) throw Error('Truncated WAV');
  if (type === 'fmt ') format = wav.subarray(start, start + size);
  if (type === 'data') audio = wav.subarray(start, start + size);
  offset = start + size + (size % 2);
}
assert.ok(format?.length >= 16 && audio?.length && audio.length <= 16000 * 2 * 30 && audio.length % 2 === 0);
assert.equal(format.readUInt16LE(0), 1); assert.equal(format.readUInt16LE(2), 1);
assert.equal(format.readUInt32LE(4), 16000); assert.equal(format.readUInt16LE(14), 16);

async function recognize(reset) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url); let segments = [], ack = !reset, acknowledgements = 0, sent = false;
    const timer = setTimeout(() => { ws.terminate(); reject(Error('Recognizer timed out')); }, 30000);
    const frames = () => { for (let i = 0; i < audio.length; i += 3200) ws.send(audio.subarray(i, i + 3200)); };
    ws.on('error', error => { clearTimeout(timer); reject(error); });
    ws.on('close', () => { if (!sent) { clearTimeout(timer); reject(Error('Recognizer closed before final')); } });
    ws.on('message', raw => {
      const event = JSON.parse(raw);
      if (event.type === 'ready') {
        if (reset) { frames(); ws.send(JSON.stringify({type:'reset'})); }
        frames(); ws.send(JSON.stringify({type:'end'}));
      } else if (event.type === 'reset') { ack = true; acknowledgements++; segments = []; }
      else if (event.type === 'segment') segments.push(event.text);
      else if (event.type === 'final') {
        sent = true; clearTimeout(timer); ws.close();
        resolve({ack, acknowledgements, text: [...segments, event.text].filter(Boolean).join(' ').trim()});
      }
    });
  });
}
const baseline = await recognize(false), reset = await recognize(true);
assert.ok(reset.ack && reset.acknowledgements === 1, 'Expected one reset acknowledgement before final');
assert.ok(baseline.text, 'Synthetic reference produced no transcription');
assert.equal(reset.text, baseline.text, 'Post-reset transcription differs from clean baseline');
console.log(JSON.stringify({ resetAcknowledgements: reset.acknowledgements, transcriptCharacters: baseline.text.length,
  transcriptSha256: createHash('sha256').update(baseline.text).digest('hex'),
  note: 'Synthetic file and existing ASR only; no physical microphone, gateway race injection, or GPU inference.' }));
