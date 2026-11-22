// Render the local mockup in isolated headless Chrome without opening audio devices.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const profile = await mkdtemp(path.join(tmpdir(), 'assistai-render-'));
const chrome = process.env.ASSISTAI_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browser = spawn(chrome, ['--headless', '--disable-gpu', '--disable-background-networking', '--no-first-run',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { windowsHide:true, stdio:'ignore' });
let socket;
try {
  let port;
  for (let i=0; i<100; i++) {
    try { port=(await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
    catch { await new Promise(resolve=>setTimeout(resolve,100)); }
  }
  if (!port) throw Error('Browser startup timeout');
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('http://127.0.0.1:3000/')}`, {method:'PUT'});
  if (!response.ok) throw Error('Browser target creation failed');
  const target = await response.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  let id=0; const pending=new Map();
  socket.on('message',raw=>{const message=JSON.parse(raw); const request=pending.get(message.id); if(!request)return;
    pending.delete(message.id); if(message.error)request.reject(Error(message.error.message)); else request.resolve(message.result);});
  const evaluate=expression=>new Promise((resolve,reject)=>{const request=++id;pending.set(request,{resolve,reject});
    socket.send(JSON.stringify({id:request,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));
  }).then(result=>{if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;});
  let result;
  for(let i=0;i<100;i++) {
    result=await evaluate(`({title:document.title, text:document.body?.innerText ?? '', buttons:document.querySelectorAll('button').length})`);
    if(result.text.includes('Mochi') && result.buttons>0)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  const rendered=result.text.includes('Mochi') && result.buttons>0;
  console.log(JSON.stringify({rendered,title:result.title,buttons:result.buttons,headless:true,physicalDevicesOpened:false}));
  if(!rendered)process.exitCode=1;
} finally {
  socket?.close();
  if (browser.exitCode === null && browser.signalCode === null) {
    const exited = new Promise(resolve=>browser.once('exit',resolve));
    browser.kill(); await exited;
  }
  const relative=path.relative(path.resolve(tmpdir()),path.resolve(profile));
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw Error('Browser profile escaped temporary directory');
  try {await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});}
  catch {console.error(`Could not remove temporary browser profile: ${profile}`);}
}
