// Synthetic microphone through a real browser, native gateway and read-only fixture harness.
// Requires the guarded Omni trial, Vosk, agent model and fixture harness to be running.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import WebSocket from 'ws';

const notificationPath = '.cache/native-browser-notification.wav';
const notificationMetadataPath = '.cache/native-browser-notification.json';
for (const output of [notificationPath, notificationMetadataPath]) {
  try { await access(output); throw Error('Preserve or move the existing browser notification before this probe'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const fixture = await readFile('.cache/lfm3-fixture-french.wav');
const dataOffset = fixture.indexOf('data');
if (dataOffset < 0 || fixture.readUInt16LE(22) !== 1 || fixture.readUInt32LE(24) !== 16000 || fixture.readUInt16LE(34) !== 16) throw Error('Expected mono 16 kHz PCM16 fixture');
const pcm = fixture.subarray(dataOffset + 8, dataOffset + 8 + fixture.readUInt32LE(dataOffset + 4));
const silence = Buffer.alloc(16000 * 2 * 3);
const audio = Buffer.concat([silence, pcm, silence]);
const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(36 + audio.length, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(audio.length, 40);
const profile = await mkdtemp(path.join(tmpdir(), 'assistai-native-browser-'));
const fakeWav = path.join(profile, 'synthetic.wav'); await writeFile(fakeWav, Buffer.concat([header, audio]), { flag: 'wx' });
const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const env = { ...process.env, ASSISTAI_GATEWAY_PORT: String(port), ASSISTAI_DB_PATH: ':memory:',
  ASSISTAI_LFM_REALTIME_URL: 'ws://127.0.0.1:18210/v1/realtime', ASSISTAI_LFM_TRANSCRIPT_ASR_URL: 'ws://127.0.0.1:18082/asr',
  ASSISTAI_OPENCODE_URL: 'http://127.0.0.1:18085', ASSISTAI_LFM_WORKSPACE_CONTEXT: 'The read-only fixture contains fixture.txt.',
  ASSISTAI_BUDGET_SAMPLE_PATH: '.cache/assistant/demo-18131-resource.json', ASSISTAI_RESOURCE_STATUS_PATH: '.cache/assistant/demo-18131-resource.json',
  ASSISTAI_SHARED_RESERVATIONS_PATH: '.cache/assistant/task-reservations.sqlite', ASSISTAI_BUDGET_BASELINE_SHARED_BYTES: '0',
  ASSISTAI_TASK_VRAM_ESTIMATE_BYTES: String(512 * 1024 ** 2), ASSISTAI_TASK_RAM_ESTIMATE_BYTES: String(3 * 1024 ** 3) };
const gateway = spawn(process.execPath, ['prototype/gateway.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let stderr = ''; gateway.stderr.on('data', chunk => stderr += chunk);
let browser, socket;
try {
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error(`Gateway startup timeout: ${stderr}`)), 10000);
    gateway.once('exit', code => { clearTimeout(timer); reject(Error(`Gateway exited ${code}: ${stderr}`)); });
    gateway.stdout.on('data', chunk => { if (chunk.toString().includes('Experimental voice gateway')) { clearTimeout(timer); resolve(); } }); });
  const chrome = process.env.ASSISTAI_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  browser = spawn(chrome, ['--headless', '--disable-gpu', '--mute-audio', '--disable-background-networking', '--no-first-run',
    '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${fakeWav}%noloop`,
    `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let debugPort;
  for (let i = 0; i < 100; i++) { try { debugPort = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); } }
  if (!debugPort) throw Error('Browser startup timeout');
  const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`http://127.0.0.1:${port}/`)}`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let id = 0; const pending = new Map();
  socket.on('message', raw => { const response = JSON.parse(raw); if (!pending.has(response.id)) return; const { resolve, reject } = pending.get(response.id); pending.delete(response.id); if (response.error) reject(Error(response.error.message)); else resolve(response.result); });
  const evaluate = expression => new Promise((resolve, reject) => { const request = ++id; pending.set(request, { resolve, reject }); socket.send(JSON.stringify({ id: request, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })); }).then(result => { if (result.exceptionDetails) throw Error(result.exceptionDetails.text); return result.result.value; });
  let ready = false;
  for (let i = 0; i < 100; i++) { ready = await evaluate("document.querySelector('#mode')?.textContent.includes('native speech') && document.querySelector('#status')?.textContent.includes('Ready.')"); if (ready) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  if (!ready) throw Error('Native browser client not ready');
  await evaluate(`window.__audioBytes=0; window.__notificationSamples=[]; window.__notificationOverflow=false;
    const originalBuffer=AudioContext.prototype.createBuffer;
    AudioContext.prototype.createBuffer=function(channels, length, rate){ if(channels===1 && rate===24000) window.__audioBytes+=length*2; return originalBuffer.call(this, channels, length, rate); };
    const originalStart=AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start=function(...args){
      if(this.buffer?.sampleRate===24000 && this.buffer.numberOfChannels===1 && document.querySelector('#log').textContent.includes('Speaking agent result.')){
        const samples=this.buffer.getChannelData(0);
        if(window.__notificationSamples.length+samples.length>2000000) window.__notificationOverflow=true;
        else for(const sample of samples) window.__notificationSamples.push(Math.max(-32768,Math.min(32767,Math.round(sample*32768))));
      }
      return originalStart.apply(this,args);
    };
    document.querySelector('#start').click(); true`);
  let state = {}; let stopped = false, completionObserved = false, audioAtCompletion = 0, notificationObserved = false;
  for (let i = 0; i < 650; i++) {
    state = await evaluate("({status:document.querySelector('#status').textContent, log:document.querySelector('#log').textContent, activity:document.querySelector('#agent-activity').textContent, audioBytes:window.__audioBytes, microphoneStopped:document.querySelector('#stop').disabled})");
    if (state.status.includes('Microphone unavailable')) throw Error(state.status);
    if (!stopped && state.log.includes('You:')) { stopped = true; await evaluate("document.querySelector('#stop').click(); true"); }
    const completedAt = state.log.indexOf('Agent completed:');
    if (completedAt >= 0 && !completionObserved) { completionObserved = true; audioAtCompletion = state.audioBytes; }
    if (completionObserved && state.audioBytes > audioAtCompletion && state.log.slice(completedAt).includes('Speaking agent result.') && state.log.slice(completedAt).includes('Assistant:')) { notificationObserved = true; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  let notificationFile = null, notificationText = null;
  if (notificationObserved) {
    notificationText = state.log.split('Speaking agent result.').at(-1).match(/(?:^|\n)Assistant: ([^\n]+)/)?.[1]?.trim();
    if (!notificationText || notificationText.length > 1000) throw Error('Notification text missing or excessive');
    const captured = await evaluate(`(() => { if(window.__notificationOverflow) throw Error('Notification audio exceeds limit');
      const pcm=new Uint8Array(window.__notificationSamples.length*2), view=new DataView(pcm.buffer);
      window.__notificationSamples.forEach((value,index)=>view.setInt16(index*2,value,true));
      let binary=''; for(let i=0;i<pcm.length;i+=16384) binary+=String.fromCharCode(...pcm.subarray(i,i+16384));
      return btoa(binary); })()`);
    const pcm = Buffer.from(captured, 'base64');
    if (!pcm.length) throw Error('Notification was observed but no scheduled audio was captured');
    const wav = Buffer.alloc(44); wav.write('RIFF'); wav.writeUInt32LE(36+pcm.length,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(24000,24); wav.writeUInt32LE(48000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(pcm.length,40);
    await writeFile(notificationPath, Buffer.concat([wav,pcm]), { flag:'wx' });
    await writeFile(notificationMetadataPath, JSON.stringify({ notification_text: notificationText })+'\n', { flag:'wx' }); notificationFile=notificationPath;
  }
  console.log(JSON.stringify({ ...state, microphoneStoppedAfterTranscript: stopped, audioAtCompletion, notificationObserved, notificationFile, notificationText, microphoneSource: 'Chromium fake WAV device', browserAudioMuted: true, profile }, null, 2));
  if (!state.log.includes('Agent started:') || !/Agent completed:.*BLUEBIRD/i.test(state.log) || !notificationObserved || !stopped) process.exitCode = 1;
} finally {
  socket?.close(); if (browser) browser.kill(); gateway.kill();
  await Promise.race([once(gateway, 'exit').catch(() => {}), new Promise(resolve => setTimeout(resolve, 3000))]);
}
