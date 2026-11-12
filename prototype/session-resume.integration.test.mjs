import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { resumeSessionId } from './session-resume.mjs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { tmpdir } from 'node:os';
import WebSocket, { WebSocketServer } from 'ws';

async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }
async function close(server) { await new Promise(resolve => server.close(resolve)); }
async function startGateway(port, db, llm, tts, asr) {
  const child = spawn(process.execPath, ['prototype/gateway.mjs'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ASSISTAI_GATEWAY_PORT: String(port), ASSISTAI_DB_PATH: db, ASSISTAI_ENABLE_SESSION_RESUME: '1',
      ASSISTAI_LLM_URL: `http://127.0.0.1:${llm}/v1`, ASSISTAI_TTS_URL: `http://127.0.0.1:${tts}`,
      ASSISTAI_ASR_URL: `ws://127.0.0.1:${asr}/asr`, ASSISTAI_OPENCODE_URL: '', ASSISTAI_LFM_REALTIME_URL: '' } });
  let error = '';
  child.stderr.on('data', data => { error += data; });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`Gateway startup timeout: ${error}`)), 8000);
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Gateway exited ${code}: ${error}`)); });
    child.stdout.on('data', data => { if (data.toString().includes('Experimental voice gateway')) { clearTimeout(timer); resolve(); } });
  });
  return child;
}
async function connect(port, token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/voice`, ['assistai-v1', `resume.${token}`]);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Ready timed out')), 5000);
    socket.on('error', reject);
    socket.on('message', (data, binary) => {
      if (binary) return;
      const event = JSON.parse(data.toString());
      if (event.type === 'session.task_history') socket.taskHistory = event.events;
      if (event.type === 'asr.ready') { clearTimeout(timer); resolve(); }
    });
  });
  return socket;
}
async function turn(socket, text) {
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Turn timed out')), 5000);
    const handler = (data, binary) => {
      if (binary) return;
      const event = JSON.parse(data.toString());
      if (event.type === 'speech.end') { clearTimeout(timer); socket.off('message', handler); resolve(); }
      if (event.type === 'error') { clearTimeout(timer); reject(Error(event.message)); }
    };
    socket.on('message', handler);
  });
  socket.send(JSON.stringify({ type: 'text', text }));
  await done;
}

test('opt-in session resume isolates clients and restores bounded history after restart', { timeout: 30000 }, async t => {
  const prompts = [];
  const llm = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    prompts.push(JSON.parse(Buffer.concat(chunks).toString()).messages);
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'OK' } }] }));
  });
  const llmPort = await listen(llm);
  const wav = Buffer.alloc(48); wav.write('RIFF', 0); wav.write('WAVE', 8); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  let ttsBytes = wav.length, lastTtsText = '';
  const tts = http.createServer(async (req, res) => {
    const parts = []; for await (const part of req) parts.push(part);
    const form = await new Response(Buffer.concat(parts), { headers: { 'content-type': req.headers['content-type'] } }).formData();
    lastTtsText = form.get('text');
    res.end(wav.subarray(0, ttsBytes));
  });
  const ttsPort = await listen(tts);
  const asr = http.createServer(); const sockets = new WebSocketServer({ server: asr });
  sockets.on('connection', socket => socket.send(JSON.stringify({ type: 'ready' })));
  const asrPort = await listen(asr);
  const reservation = http.createServer(); const port = await listen(reservation); await close(reservation);
  const dir = await mkdtemp(path.join(tmpdir(), 'assistai-session-test-'));
  const db = path.join(dir, 'events.sqlite');
  let gateway = await startGateway(port, db, llmPort, ttsPort, asrPort);
  t.after(async () => {
    if (gateway.exitCode === null) { gateway.kill(); await once(gateway, 'exit'); }
    for (const client of sockets.clients) client.terminate();
    await new Promise(resolve => sockets.close(resolve));
    await Promise.all([close(asr), close(tts), close(llm)]);
    await unlink(db); await rmdir(dir);
  });
  const tokenA = randomBytes(32).toString('hex'), tokenB = randomBytes(32).toString('hex');
  const marker = `MARKER${randomBytes(5).toString('hex')}`;
  const a = await connect(port, tokenA);
  for (const length of [44, 45]) {
    ttsBytes = length;
    await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Empty speech error timed out')), 5000);
    const handler = (data, binary) => {
      if (binary) return;
      const event = JSON.parse(data.toString());
      if (event.type === 'speech.end') { clearTimeout(timer); reject(Error('Empty audio was reported as complete')); }
      if (event.type === 'error') { clearTimeout(timer); a.off('message', handler); assert.match(event.message, /empty or incomplete PCM16/); resolve(); }
    };
    a.on('message', handler);
    a.send(JSON.stringify({type:'text',text:'empty audio test'}));
    });
  }
  ttsBytes = wav.length;
  await turn(a, marker);
  const duplicate = new WebSocket(`ws://127.0.0.1:${port}/voice`, ['assistai-v1', `resume.${tokenA}`]);
  const [duplicateCode] = await once(duplicate, 'close');
  assert.equal(duplicateCode, 1008);
  a.close(); await once(a, 'close');
  // Record a completion while the client is disconnected, scoped to token A.
  const writer = new DatabaseSync(db);
  writer.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)').run('offline-event', resumeSessionId(`assistai-v1, resume.${tokenA}`, true), 'offline-turn', 'task.completed', JSON.stringify({task_id:'offline-task',text:'OFFLINE RESULT'}), new Date().toISOString());
  writer.close();
  const resumed = await connect(port, tokenA);
  assert.ok(resumed.taskHistory.some(event => event.kind === 'task.completed' && event.text === 'OFFLINE RESULT'));
  await new Promise((resolve, reject) => {
    let started = false;
    const timer = setTimeout(() => reject(Error('Notification timed out')), 5000);
    const handler = (data, binary) => {
      if (binary) return; const event = JSON.parse(data.toString());
      if (event.type === 'notification.started') started = true;
      if (event.type === 'speech.end' && started) { clearTimeout(timer); resumed.off('message', handler); resolve(); }
      if (event.type === 'notification.rejected' || event.type === 'error') { clearTimeout(timer); reject(Error(JSON.stringify(event))); }
    };
    resumed.on('message', handler);
    resumed.send(JSON.stringify({type:'notification.speak',task_id:'offline-task'}));
  });
  assert.match(lastTtsText, /OFFLINE RESULT/);
  await turn(resumed, 'follow-up');
  assert.ok(prompts.at(-1).some(message => message.content === marker));
  resumed.close(); await once(resumed, 'close');
  const b = await connect(port, tokenB);
  assert.equal(b.taskHistory, undefined);
  const rejected = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Cross-session notification was not rejected')), 5000);
    b.on('message',(data,binary)=>{if(!binary && JSON.parse(data.toString()).type === 'notification.rejected'){clearTimeout(timer);resolve();}});
  });
  b.send(JSON.stringify({type:'notification.speak',task_id:'offline-task'})); await rejected;
  await turn(b, 'different session');
  assert.ok(!prompts.at(-1).some(message => message.content === marker));
  b.close(); await once(b, 'close');
  gateway.kill(); await once(gateway, 'exit');
  gateway = await startGateway(port, db, llmPort, ttsPort, asrPort);
  const restarted = await connect(port, tokenA);
  assert.ok(restarted.taskHistory.some(event => event.text === 'OFFLINE RESULT'));
  await turn(restarted, 'after restart');
  assert.ok(prompts.at(-1).some(message => message.content === marker));
  const asrSocket = [...sockets.clients].find(socket => socket.readyState === WebSocket.OPEN);
  const gatewayClosed = once(restarted, 'close');
  asrSocket.close();
  const [closeCode] = await gatewayClosed;
  assert.equal(closeCode, 1011);
  const recovered = await connect(port, tokenA);
  await turn(recovered, 'after speech recognition reconnect');
  recovered.close(); await once(recovered, 'close');
});
