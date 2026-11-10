// Synthetic audio only. The native server writes temporary WAV files.
import { readFile } from 'node:fs/promises';
import WebSocket from 'ws';
import { NativeSession } from '../prototype/native-session.mjs';
const chunks = [];
for (let i = 0; i < 11; i++) {
  const wav = await readFile(`.cache/omni-english/english_${String(i).padStart(4,'0')}.wav`);
  const offset = wav.indexOf('data');
  if (offset < 0) throw new Error('WAV data chunk missing');
  const pcm = wav.subarray(offset + 8, offset + 8 + wav.readUInt32LE(offset + 4));
  if (pcm.length !== 32000) throw new Error('Expected one second of PCM16');
  chunks.push(pcm);
}
const socket = new WebSocket('ws://127.0.0.1:18091/backend');
const session = new NativeSession(socket);
let timer; let sent = 0; let pcmBytes = 0; let nonzeroSamples = 0; let text = ''; let created = false; let responses = 0; let fault = null;
const deadline = setTimeout(() => { fault = 'Timed out'; session.close(); }, 130000);
session.on('ready', () => {
  created = true;
  timer = setInterval(() => {
    if (sent === chunks.length) { clearInterval(timer); setTimeout(() => session.close(),10000); return; }
    if (session.push(chunks[sent]) && session.tick()) sent++;
  },1000);
});
session.on('audio', pcm => { pcmBytes += pcm.length; for(let i=0;i<pcm.length;i+=2) if(pcm.readInt16LE(i)!==0) nonzeroSamples++; });
session.on('text', value => { text += value; });
session.on('responseDone', () => responses++);
session.on('fault', reason => { fault=reason; });
session.on('closed', () => {
  clearTimeout(deadline); clearInterval(timer);
  console.log(JSON.stringify({created,sent,pcm16_bytes:pcmBytes,nonzero_samples:nonzeroSamples,responses,text,fault}));
  if (!created || sent !== chunks.length || !pcmBytes || !nonzeroSamples || fault) process.exitCode=1;
});
