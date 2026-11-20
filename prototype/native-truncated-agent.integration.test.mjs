import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import WebSocket, { WebSocketServer } from 'ws';

async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }

test('native gateway reports a truncated agent response as failure', { timeout: 12000 }, async t => {
  const agent = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && req.url === '/session') return res.end(JSON.stringify({ id: 'fixture-task' }));
    if (req.method === 'POST' && req.url === '/session/fixture-task/prompt_async') { res.statusCode = 204; return res.end(); }
    if (req.url === '/session/status') return res.end('{}');
    if (req.url === '/session/fixture-task/message') return res.end(JSON.stringify([
      { info: { role: 'assistant', finish: 'length', time: { completed: 1 } }, parts: [{ type: 'reasoning', text: 'incomplete' }] },
    ]));
    res.statusCode = 404; return res.end('{}');
  });
  const agentPort = await listen(agent);
  const backend = http.createServer(); const wss = new WebSocketServer({ server: backend });
  wss.on('connection', socket => {
    let requests = 0;
    socket.send(JSON.stringify({ type: 'session.created', session: { audio: { input: { format: { rate: 16000 } }, output: { format: { rate: 24000 } } } } }));
    socket.on('message', raw => {
      const event = JSON.parse(raw);
      if (event.type === 'session.update') return socket.send(JSON.stringify({ type: 'session.updated' }));
      if (event.type !== 'response.create') return;
      const id = `r${++requests}`; socket.send(JSON.stringify({ type: 'response.created', response: { id } }));
      const output = requests === 1 ? [{ type: 'function_call', name: 'delegate_task', call_id: 'c1', arguments: JSON.stringify({ task: 'Read fixture.txt' }) }] : [];
      socket.send(JSON.stringify({ type: 'response.done', response: { id, status: 'completed', output } }));
    });
  });
  const backendPort = await listen(backend); const reserve = http.createServer(); const port = await listen(reserve); await new Promise(resolve => reserve.close(resolve));
  const env = { ...process.env, ASSISTAI_GATEWAY_PORT: String(port), ASSISTAI_DB_PATH: ':memory:',
    ASSISTAI_LFM_REALTIME_URL: `ws://127.0.0.1:${backendPort}/v1/realtime`, ASSISTAI_LFM_TRANSCRIPT_ASR_URL: '',
    ASSISTAI_LFM_NOTIFICATION_TTS: '', ASSISTAI_OPENCODE_URL: `http://127.0.0.1:${agentPort}`,
    ASSISTAI_BUDGET_SAMPLE_PATH: '', ASSISTAI_RESOURCE_STATUS_PATH: '', ASSISTAI_SHARED_RESERVATIONS_PATH: '' };
  const child = spawn(process.execPath, ['prototype/gateway.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let stderr = '', client; child.stderr.on('data', chunk => stderr += chunk);
  t.after(async () => { client?.terminate(); child.kill(); for (const c of wss.clients) c.terminate(); await Promise.all([new Promise(r => wss.close(r)), new Promise(r => backend.close(r)), new Promise(r => agent.close(r))]); });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error(`Startup timeout: ${stderr}`)), 4000); child.once('exit', code => { clearTimeout(timer); reject(Error(`Gateway exited ${code}: ${stderr}`)); }); child.stdout.on('data', b => { if (b.toString().includes('Experimental voice gateway')) { clearTimeout(timer); resolve(); } }); });
  client = new WebSocket(`ws://127.0.0.1:${port}/voice`); const events = [];
  const error = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Missing truncated-task error')), 7000); client.on('error', reject);
    client.on('message', (data, binary) => { if (binary) return; const event = JSON.parse(data); events.push(event);
      if (event.type === 'asr.ready') { client.send(JSON.stringify({ type: 'audio.start' })); client.send(Buffer.alloc(2)); client.send(JSON.stringify({ type: 'audio.end' })); }
      else if (event.type === 'task.error') { clearTimeout(timer); resolve(event); }
    });
  });
  assert.match(error.message, /truncated/i);
  assert.ok(events.some(event => event.type === 'task.started'));
  assert.ok(!events.some(event => event.type === 'task.completed'));
});
