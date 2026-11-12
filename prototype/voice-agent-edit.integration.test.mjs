import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, realpath, rmdir, unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { WebSocketServer } from 'ws';

test('coding probe checks delegated fixture and concurrent response using mock gateway', { timeout: 15000 }, async t => {
  const cache = await realpath('.cache');
  const directory = await mkdtemp(path.join(cache, 'voice-agent-mock-'));
  const fixture = path.join(directory, 'calculator.py');
  await writeFile(fixture, 'def add(a, b):\n    return a - b\n');
  const server = http.createServer();
  const sockets = new WebSocketServer({ server });
  sockets.on('connection', socket => {
    socket.send(JSON.stringify({ type: 'asr.ready' }));
    let first = true;
    socket.on('message', async (data, binary) => {
      if (binary) return;
      const event = JSON.parse(data.toString());
      if (event.type !== 'text') return;
      if (first) {
        first = false;
        socket.send(JSON.stringify({ type: 'task.started', turn_id: 'task-turn', task: 'Fix calculator.py' }));
        socket.send(JSON.stringify({ type: 'assistant.text', turn_id: 'task-turn', text: 'Starting task' }));
      } else {
        socket.send(JSON.stringify({ type: 'assistant.text', turn_id: 'followup-turn', text: 'Bonjour' }));
        socket.send(Buffer.from([1, 0, 2, 0]), { binary: true });
        await new Promise(resolve => setTimeout(resolve, 20));
        await writeFile(fixture, 'def add(a, b):\n    return a + b\n');
        socket.send(JSON.stringify({ type: 'task.completed', text: 'Updated' }));
      }
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    for (const socket of sockets.clients) socket.terminate();
    await new Promise(resolve => sockets.close(resolve));
    await new Promise(resolve => server.close(resolve));
    await unlink(fixture); await rmdir(directory);
  });
  const child = spawn(process.execPath, ['scripts/probe-voice-agent-edit.mjs'], {
    env: { ...process.env, ASSISTAI_PROBE_WORKSPACE: directory,
      ASSISTAI_TEST_VOICE_URL: `ws://127.0.0.1:${server.address().port}/voice` },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '', error = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { error += data; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, error);
  const result = JSON.parse(output.trim());
  assert.equal(result.followup_before_completion, true);
  assert.equal(result.static_fixture_check_exit, 0);
  assert.equal(result.task_count, 1);
  assert.match(error, /"event":"task.started"/);
});
