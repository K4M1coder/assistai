// Real local agent + harness, mock voice controller, synthetic text and volatile gateway history.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import WebSocket from 'ws';

const marker = `CODE${randomBytes(5).toString('hex').toUpperCase()}`;
const task = 'Find the user project code in the recent session context. Return only that code. Do not read files.';
const controller = http.createServer(async (req, res) => {
  const body = [];
  for await (const chunk of req) body.push(chunk);
  const request = JSON.parse(Buffer.concat(body).toString());
  const last = request.messages.at(-1);
  let message;
  if (last.role === 'tool') message = { role: 'assistant', content: 'The agent is working.' };
  else if (last.content === 'Delegate the code lookup to the agent.') {
    message = { role: 'assistant', content: null, tool_calls: [{ id: 'lookup', type: 'function', function: { name: 'delegate_task', arguments: JSON.stringify({ task }) } }] };
  } else message = { role: 'assistant', content: 'I will remember that.' };
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ choices: [{ message }] }));
});
controller.listen(0, '127.0.0.1');
await once(controller, 'listening');
const controllerPort = controller.address().port;
const reservation = http.createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const gatewayPort = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const gateway = spawn(process.execPath, ['prototype/gateway.mjs'], {
  env: { ...process.env, ASSISTAI_GATEWAY_PORT: String(gatewayPort), ASSISTAI_DB_PATH: ':memory:',
    ASSISTAI_LLM_URL: `http://127.0.0.1:${controllerPort}/v1`, ASSISTAI_OPENCODE_URL: 'http://127.0.0.1:18085' },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let stderr = '';
gateway.stderr.on('data', data => { stderr += data; });
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error(`Gateway startup timeout: ${stderr}`)), 8000);
    gateway.once('exit', code => { clearTimeout(timeout); reject(Error(`Gateway exited: ${code}`)); });
    gateway.stdout.on('data', data => { if (data.toString().includes('Experimental voice gateway')) { clearTimeout(timeout); resolve(); } });
  });
  const socket = new WebSocket(`ws://127.0.0.1:${gatewayPort}/voice`);
  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.terminate(); reject(Error('Agent task timed out')); }, 120000);
    let phase = 0, startedTask = null;
    socket.on('error', reject);
    socket.on('message', (data, binary) => {
      if (binary) return;
      const event = JSON.parse(data.toString());
      if (event.type === 'asr.ready' && phase === 0) {
        phase = 1;
        socket.send(JSON.stringify({ type: 'text', text: `The project code is ${marker}.` }));
      } else if (event.type === 'speech.end' && phase === 1) {
        phase = 2;
        socket.send(JSON.stringify({ type: 'text', text: 'Delegate the code lookup to the agent.' }));
      } else if (event.type === 'task.started') startedTask = event.task;
      else if (event.type === 'task.completed') {
        clearTimeout(timeout); socket.close(); resolve({ startedTask, text: event.text });
      } else if (event.type === 'error' || event.type === 'task.error') {
        clearTimeout(timeout); socket.terminate(); reject(Error(event.message));
      }
    });
  });
  assert.equal(result.startedTask, task);
  assert.ok(!result.startedTask.includes(marker), 'The task itself leaked the marker');
  assert.ok(result.text.toUpperCase().includes(marker), 'Agent did not report the session marker');
  console.log(JSON.stringify({ task_contains_marker: false, agent_result_contains_marker: true, mock_voice_controller: true,
    real_agent_harness: true, gateway_history: 'volatile', physical_audio_devices_opened: false }));
} finally {
  gateway.kill();
  await new Promise(resolve => controller.close(resolve));
}
