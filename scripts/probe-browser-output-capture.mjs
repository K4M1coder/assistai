// Exercise the native browser probe's output-capture hook with a synthetic buffer in Chrome.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

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
} finally { socket?.close();browser.kill(); }
