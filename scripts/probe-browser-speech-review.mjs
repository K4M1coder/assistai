// Exercise synthetic microphone input in an isolated headless Chrome profile.
// The WAV must be synthetic PCM; this probe does not capture a physical microphone.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const audio = path.resolve(process.argv[2] ?? '.cache/assistant/browser-audio-test.wav');
const chrome = process.env.ASSISTAI_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const gateway = new URL(process.env.ASSISTAI_TEST_BROWSER_URL ?? 'http://127.0.0.1:18092/');
if (gateway.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(gateway.hostname) || gateway.username || gateway.password || gateway.pathname !== '/' || gateway.search || gateway.hash) throw Error('Browser probe requires a credential-free loopback gateway root');
const health = await (await fetch(new URL('/health', gateway))).json();
if (health.history_storage !== 'volatile') throw Error('Browser probe requires a gateway with volatile history');
if (process.env.ASSISTAI_PROBE_REVIEW_TASK === '1') {
  const resources = await (await fetch(new URL('/resources', gateway))).json();
  if (resources.status !== 'observed' || resources.single_task_estimate?.status !== 'headroom_observed') throw Error('Insufficient observed resource headroom for the controller probe');
}
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
  const url = `http://127.0.0.1:${port}/json/new?${encodeURIComponent(gateway.href)}`;
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
  if (process.env.ASSISTAI_PROBE_REVIEW_TASK === '1' && !(await evaluate("document.querySelector('#approval-safety').textContent.includes('requires task approval')"))) throw Error('Legacy task proposal probe requires an approval-enabled gateway');
  await evaluate("document.querySelector('#speech-review').click(); document.querySelector('#start').click(); true");
  let state;
  for (let i = 0; i < 200; i++) {
    state = await evaluate("({status:document.querySelector('#status').textContent,text:document.querySelector('#text').value,log:document.querySelector('#log').textContent,inputCount:document.querySelector('#microphone-device')?.options.length ?? 0})");
    if (state.status.includes('Review the transcript')) break;
    if (state.status.includes('Microphone unavailable')) throw Error(state.status);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const result = { reviewReached: state.status.includes('Review the transcript'), transcript: state.text, submitted: state.log.includes('You:'), inputOptions: state.inputCount };
  if (process.env.ASSISTAI_PROBE_REVIEW_TASK === '1' && result.reviewReached && result.transcript && !result.submitted) {
    const fixture = process.env.ASSISTAI_PROBE_FIXTURE === 'calculator' ? 'calculator.py' : 'fixture.txt';
    const corrected = fixture === 'calculator.py' ? 'Lis le fichier calculator.py et explique ce qu’il fait.' : 'Quel est le mot écrit dans le fichier fixture.txt ?';
    await evaluate(`document.querySelector('#stop').click(); document.querySelector('#text').value = ${JSON.stringify(corrected)}; document.querySelector('#form').requestSubmit(); true`);
    let proposal;
    for (let i = 0; i < 400; i++) {
      proposal = await evaluate("({visible:!document.querySelector('#task-approval').hidden, original:document.querySelector('#approval-original').textContent, task:document.querySelector('#approval-task').textContent, log:document.querySelector('#log').textContent})");
      if (proposal.visible) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (proposal.visible) await evaluate("document.querySelector('#decline-task').click(); true");
    let after = {};
    for (let i = 0; i < 50 && !after.declined; i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      after = await evaluate("({declined:document.querySelector('#status').textContent === 'Task was not approved or approval expired.', log:document.querySelector('#log').textContent})");
    }
    result.reviewedRequest = corrected;
    result.proposalVisible = proposal.visible;
    result.original = proposal.original;
    result.proposedTask = proposal.task;
    result.approvalNotice = proposal.log.includes('Approval requested: the agent task has not started.');
    result.declined = after.declined;
    result.declineNotice = after.log.includes('Task declined; no task was submitted.');
    result.agentStarted = after.log.includes('Agent started:');
    if (!proposal.visible || proposal.original !== corrected || !proposal.task.includes(fixture) || !result.approvalNotice || !result.declined || !result.declineNotice || result.agentStarted) process.exitCode = 1;
  }
  if (process.env.ASSISTAI_PROBE_RESELECT === '1') {
    await evaluate("window.__captureRequest = null; const originalCapture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = options => { window.__captureRequest = options.audio.deviceId?.exact ?? ''; return originalCapture(options); }; document.querySelector('#stop').click(); true");
    for (let i = 0; i < 50; i++) {
      if (await evaluate("!document.querySelector('#start').disabled")) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const selected = await evaluate("(() => { const select = document.querySelector('#microphone-device'); const option = [...select.options].find(item => item.value); if (!option) return ''; select.value = option.value; document.querySelector('#start').click(); return option.value; })()");
    for (let i = 0; i < 50; i++) {
      if (await evaluate("!document.querySelector('#stop').disabled")) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    result.selectedInputRequested = Boolean(selected) && await evaluate('window.__captureRequest') === selected;
    result.captureRestarted = await evaluate("!document.querySelector('#stop').disabled");
    await evaluate("document.querySelector('#stop').click(); true");
    if (!result.selectedInputRequested || !result.captureRestarted) process.exitCode = 1;
  }
  console.log(JSON.stringify(result));
  if (!result.reviewReached || !result.transcript || result.submitted) process.exitCode = 1;
} finally {
  socket?.close();
  processHandle.kill();
  await new Promise(resolve => processHandle.once('exit', resolve));
  try { await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); }
  catch { console.error(`Could not remove temporary browser profile: ${profile}`); }
}
