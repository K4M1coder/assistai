// Exercise the native browser probe's output-capture hook with a synthetic buffer in Chrome.
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import WebSocket from 'ws';

const savedNotification = process.argv.includes('--saved-notification');
const outputPath = '.cache/native-browser-capture-roundtrip.wav';
let originalPcm;
if (savedNotification) {
  try { await access(outputPath); throw Error('Preserve or move the existing roundtrip WAV before this probe'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const input = await readFile('.cache/native-agent-notification-20261118-previous.wav');
  if (createHash('sha256').update(input).digest('hex') !== 'be3eb7a347403de160f6b2b2697e42064d2fe4d0892b79baa4d6d3a855bb256e') throw Error('Unexpected saved notification');
  const offset = input.indexOf('data');
  if (offset < 0 || input.readUInt16LE(22) !== 1 || input.readUInt32LE(24) !== 24000 || input.readUInt16LE(34) !== 16) throw Error('Unexpected WAV format');
  originalPcm = input.subarray(offset + 8, offset + 8 + input.readUInt32LE(offset + 4));
  if (!originalPcm.length || originalPcm.length > 4000000 || originalPcm.length % 2) throw Error('Unexpected PCM length');
}
const source = await readFile('scripts/probe-native-browser.mjs', 'utf8');
const setup = source.match(/await evaluate\(`(window\.__audioBytes=0;[\s\S]+?)`\);/);
if (!setup) throw Error('Browser capture setup is missing');
const profile = await mkdtemp(path.join(tmpdir(), 'assistai-capture-check-'));
const chrome = process.env.ASSISTAI_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = spawn(chrome, ['--headless', '--disable-gpu', '--mute-audio', '--disable-background-networking', '--no-first-run',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  let port;
  for (let i=0;i<100;i++) { try { port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]; break; } catch { await new Promise(resolve=>setTimeout(resolve,100)); } }
  if (!port) throw Error('Browser startup timeout');
  const target=await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  let id=0; const pending=new Map();
  socket.on('message',raw=>{const result=JSON.parse(raw);if(!pending.has(result.id))return;const {resolve,reject}=pending.get(result.id);pending.delete(result.id);if(result.error)reject(Error(result.error.message));else resolve(result.result);});
  const evaluate=expression=>new Promise((resolve,reject)=>{const request=++id;pending.set(request,{resolve,reject});socket.send(JSON.stringify({id:request,method:'Runtime.evaluate',params:{expression,returnByValue:true,userGesture:true}}));}).then(result=>{if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;});
  await evaluate("document.body.innerHTML='<div id=log></div><button id=start></button>'; true");
  await evaluate(setup[1]);
  const result=await evaluate(`(() => {
    const audio=new AudioContext(); const buffer=audio.createBuffer(1,4,24000);
    buffer.getChannelData(0).set([-1,0,0.5,1]);
    const initial=audio.createBufferSource(); initial.buffer=buffer; initial.connect(audio.destination); initial.start();
    const before=window.__notificationSamples.length;
    document.querySelector('#log').textContent='Speaking agent result.';
    const notification=audio.createBufferSource(); notification.buffer=buffer; notification.connect(audio.destination); notification.start();
    return {before,samples:window.__notificationSamples,bytes:window.__audioBytes,overflow:window.__notificationOverflow};
  })()`);
  console.log(JSON.stringify({...result,chromeMuted:true,syntheticBuffer:true,profile}));
  if(result.before!==0||result.bytes!==8||result.overflow||JSON.stringify(result.samples)!==JSON.stringify([-32768,0,16384,32767]))process.exitCode=1;
  if (savedNotification && !process.exitCode) {
    const data = await evaluate(`(() => {
      window.__notificationSamples=[]; document.querySelector('#log').textContent='Speaking agent result.';
      const bytes=Uint8Array.from(atob('${originalPcm.toString('base64')}'),c=>c.charCodeAt(0)); const view=new DataView(bytes.buffer);
      const audio=new AudioContext(), buffer=audio.createBuffer(1,bytes.length/2,24000), samples=buffer.getChannelData(0);
      for(let i=0;i<samples.length;i++) samples[i]=view.getInt16(i*2,true)/32768;
      const node=audio.createBufferSource(); node.buffer=buffer; node.connect(audio.destination); node.start();
      if(window.__notificationOverflow) throw Error('Notification audio exceeds limit');
      const captured=new Uint8Array(window.__notificationSamples.length*2), output=new DataView(captured.buffer);
      window.__notificationSamples.forEach((value,index)=>output.setInt16(index*2,value,true));
      let binary=''; for(let i=0;i<captured.length;i+=16384) binary+=String.fromCharCode(...captured.subarray(i,i+16384));
      return btoa(binary);
    })()`);
    const captured=Buffer.from(data,'base64');
    if(!captured.equals(originalPcm))throw Error('Browser-captured PCM differs from the input notification');
    const wav=Buffer.alloc(44);wav.write('RIFF');wav.writeUInt32LE(36+captured.length,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(captured.length,40);
    await writeFile(outputPath,Buffer.concat([wav,captured]),{flag:'wx'});
    console.log(JSON.stringify({roundtrip:true,pcmBytes:captured.length,pcmSha256:createHash('sha256').update(captured).digest('hex'),output:outputPath,syntheticFixture:true,chromeMuted:true}));
  }
} finally { socket?.close();browser.kill(); }
