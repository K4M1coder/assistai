// Synthetic audio only. The upstream server writes temporary WAV files during a session.
import { readFile } from 'node:fs/promises';
import WebSocket from 'ws';
import { NativeInputFramer, nativeAudioToPcm16 } from '../prototype/native-audio.mjs';
let timer; let sent = 0; let audioBytes = 0; let nonzeroSamples = 0; let text = ''; let created = false;
const chunks = [];
for (let i = 0; i < 11; i++) {
  const wav = await readFile(`.cache/omni-english/english_${String(i).padStart(4,'0')}.wav`);
  const offset = wav.indexOf('data');
  if (offset < 0) throw new Error('WAV data chunk missing');
  const pcm = wav.subarray(offset + 8, offset + 8 + wav.readUInt32LE(offset + 4));
  const framer = new NativeInputFramer();
  framer.push(pcm);
  const frame = framer.take();
  if (!frame || framer.length) throw new Error('Expected one second of PCM16');
  chunks.push(frame);
}
const socket = new WebSocket('ws://127.0.0.1:18091/backend');
const deadline = setTimeout(() => { console.error('Timed out'); socket.terminate(); process.exitCode = 1; }, 130000);
socket.on('open', () => socket.send(JSON.stringify({type:'session.init',payload:{mode:'full_duplex',use_tts:true}})));
socket.on('message', raw => {
  const ev = JSON.parse(raw);
  if (ev.type === 'session.created' && !created) {
    created = true;
    timer = setInterval(() => {
      if (sent === chunks.length) { clearInterval(timer); setTimeout(() => socket.close(), 10000); return; }
      socket.send(JSON.stringify({type:'input.append',input:{audio_base64:chunks[sent++]}}));
    }, 1000);
  }
  if (ev.type === 'response.output.delta' && ev.kind === 'audio') {
    const pcm = nativeAudioToPcm16(ev.audio);
    audioBytes += pcm.length;
    for (let i = 0; i < pcm.length; i += 2) if (pcm.readInt16LE(i) !== 0) nonzeroSamples++;
  }
  if (ev.type === 'response.output.delta' && ev.kind === 'text') text += ev.text;
  if (ev.type === 'session.closed') console.log(JSON.stringify({event:'session.closed',reason:ev.reason}));
});
socket.on('error', error => { console.error(error.message); process.exitCode = 1; });
socket.on('close', () => {
  clearTimeout(deadline); clearInterval(timer);
  console.log(JSON.stringify({created, sent, pcm16_bytes:audioBytes, nonzero_samples:nonzeroSamples, text}));
  if (!created || sent !== chunks.length || !audioBytes || !nonzeroSamples) process.exitCode = 1;
});
