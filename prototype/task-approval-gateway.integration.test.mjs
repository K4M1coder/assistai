import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket, { WebSocketServer } from 'ws';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

test('reviewed speech delegates directly without an approval gate', { timeout: 15000 }, async t => {
  let sessions = 0, prompt, modelCalls = 0;
  const agent = http.createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && req.url === '/session') { sessions++; return res.end(JSON.stringify({ id: 'test-task' })); }
    if (req.method === 'POST' && req.url === '/session/test-task/prompt_async') {
      let body = ''; for await (const chunk of req) body += chunk;
      prompt = JSON.parse(body).parts[0].text;
      res.statusCode = 204; return res.end();
    }
    if (req.url === '/session/status') return res.end('{}');
    if (req.url === '/session/test-task/message') return res.end('[]');
    res.statusCode = 404; res.end('{}');
  });
  const model = http.createServer((req, res) => {
    modelCalls++;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { tool_calls: [{ id: 'call', function: { name: 'delegate_task', arguments: JSON.stringify({ task: 'Read fixture.txt' }) } }] } }] }));
  });
  const asr = http.createServer();
  const asrSockets = new WebSocketServer({ server: asr });
  asrSockets.on('connection', socket => {
    socket.send(JSON.stringify({ type: 'ready' }));
    socket.on('message', raw => { if (JSON.parse(raw).type === 'end') socket.send(JSON.stringify({type:'final',text:'Read fixture dot text'})); });
  });
  const [agentPort, modelPort, asrPort] = await Promise.all([listen(agent), listen(model), listen(asr)]);
  const reservation = http.createServer(); const port = await listen(reservation); await new Promise(resolve => reservation.close(resolve));
  const database = path.join(tmpdir(), `assistai-approval-${randomUUID()}.sqlite`);
  const child = spawn(process.execPath, ['prototype/gateway.mjs'], {
    env: { ...process.env, ASSISTAI_GATEWAY_PORT: String(port), ASSISTAI_DB_PATH: database,
      ASSISTAI_LFM_REALTIME_URL: '', ASSISTAI_BUDGET_SAMPLE_PATH: '', ASSISTAI_OPENCODE_URL: `http://127.0.0.1:${agentPort}`,
      ASSISTAI_LLM_URL: `http://127.0.0.1:${modelPort}/v1`, ASSISTAI_TTS_URL: `http://127.0.0.1:${modelPort}`, ASSISTAI_ASR_URL: `ws://127.0.0.1:${asrPort}/asr`, ASSISTAI_WORKSPACE_LABEL:'Disposable edit fixture' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const clients = [];
  t.after(async () => {
    for (const client of clients) client.terminate();
    for (const socket of asrSockets.clients) socket.terminate();
    child.kill(); await once(child, 'exit');
    for (const suffix of ['', '-wal', '-shm']) await unlink(database + suffix).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await Promise.all([new Promise(resolve => asrSockets.close(resolve)), new Promise(resolve => asr.close(resolve)),
      new Promise(resolve => agent.close(resolve)), new Promise(resolve => model.close(resolve))]);
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`Gateway startup timeout: ${stderr}`)), 5000);
    child.once('exit', code => { clearTimeout(timer); reject(Error(`Gateway exited ${code}: ${stderr}`)); });
    child.stdout.on('data', chunk => { if (chunk.toString().includes('Experimental voice gateway')) { clearTimeout(timer); resolve(); } });
  });
  const client = new WebSocket(`ws://127.0.0.1:${port}/voice`); clients.push(client);
  let sawApproval = false;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Direct delegation timed out')), 8000);
    client.on('error', reject);
    client.on('message', function handler(data, binary) {
      if (binary) return;
      const event = JSON.parse(data);
      if (event.type === 'session.capabilities') { assert.equal(event.workspace_label, 'Disposable edit fixture'); assert.equal(event.task_approval, false); }
      if (event.type === 'asr.ready') {
        client.send(JSON.stringify({ type: 'speech.review.configure', enabled: true }));
        client.send(JSON.stringify({ type: 'audio.end' }));
      }
      if (event.type === 'speech.review') {
        assert.equal(event.text, 'Read fixture dot text');
        assert.equal(modelCalls, 0); assert.equal(sessions, 0);
        client.send(JSON.stringify({ type: 'speech.review.submit', review_id: event.review_id, text: 'Read fixture.txt only' }));
      }
      if (event.type === 'task.approval_requested') sawApproval = true;
      if (event.type === 'task.started') { clearTimeout(timer); client.off('message', handler); resolve(); }
    });
  });
  assert.equal(sawApproval, false);
  assert.equal(sessions, 1);
  assert.match(prompt, /Read fixture\.txt only/);
  const db = new DatabaseSync(database, { readOnly: true });
  const starts = db.prepare("SELECT kind FROM events WHERE kind='task.started'").all();
  db.close();
  assert.equal(starts.length, 1);
});
