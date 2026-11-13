// Exercise synthetic microphone input in an isolated headless Chrome profile.
// The WAV must be synthetic PCM; this probe does not capture a physical microphone.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const audio = path.resolve(process.argv[2] ?? '.cache/assistant/browser-audio-test.wav');
const chrome = process.env.ASSISTAI_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = await mkdtemp(path.join(tmpdir(), 'assistai-audio-'));
const processHandle = spawn(chrome, ['--headless', '--disable-gpu', '--disable-background-networking', '--no-first-run',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${audio}`,
  `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!port) throw Error('Browser startup timeout');
  const url = `http://127.0.0.1:${port}/json/new?${encodeURIComponent('http://127.0.0.1:18092/')}`;
  const target = await (await fetch(url, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  let id = 0;
  const pending = new Map();
  socket.on('message', data => {
    const result = JSON.parse(data);
    if (!pending.has(result.id)) return;
    const { resolve, reject } = pending.get(result.id); pending.delete(result.id);
    if (result.error) reject(Error(result.error.message)); else resolve(result.result);
  });
  const evaluate = expression => new Promise((resolve, reject) => {
    const request = ++id; pending.set(request, { resolve, reject });
    socket.send(JSON.stringify({ id: request, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  }).then(result => result.result.value);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    ready = await evaluate("document.querySelector('#status')?.textContent.includes('Ready.') && !document.querySelector('#speech-review').disabled");
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw Error('Client not ready');
  await evaluate("document.querySelector('#speech-review').click(); document.querySelector('#start').click(); true");
  let state;
  for (let i = 0; i < 200; i++) {
    state = await evaluate("({status:document.querySelector('#status').textContent,text:document.querySelector('#text').value,log:document.querySelector('#log').textContent})");
    if (state.status.includes('Review the transcript')) break;
    if (state.status.includes('Microphone unavailable')) throw Error(state.status);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const result = { reviewReached: state.status.includes('Review the transcript'), transcript: state.text, submitted: state.log.includes('You:') };
  console.log(JSON.stringify(result));
  if (!result.reviewReached || !result.transcript || result.submitted) process.exitCode = 1;
} finally {
  socket?.close();
  processHandle.kill();
  await new Promise(resolve => processHandle.once('exit', resolve));
  console.error(`Temporary browser profile: ${profile}`);
}
