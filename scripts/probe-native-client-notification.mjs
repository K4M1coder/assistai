// Simulated gateway and devices; does not run inference or open a microphone.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';

const server = http.createServer();
const sockets = new WebSocketServer({ server });
let notifications = 0;
sockets.on('connection', socket => {
  const send = value => socket.send(JSON.stringify(value));
  const pcm = Buffer.alloc(24000 * 2);
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(2000, i);
  send({ type: 'session.capabilities', mode: 'cascade' });
  send({ type: 'asr.ready' });
  socket.on('message', (data, binary) => {
    if (binary) return;
    const event = JSON.parse(data.toString());
    if (event.type === 'audio.end') {
      send({ type: 'user.text', text: 'quel est le mot secret' });
      send({ type: 'speech.start', sample_rate: 24000 });
      socket.send(pcm, { binary: true });
      send({ type: 'speech.end' });
      send({ type: 'task.completed', task_id: 'fixture', text: 'BLUEBIRD' });
    } else if (event.type === 'notification.speak') {
      assert.equal(event.task_id, 'fixture');
      notifications++;
      send({ type: 'notification.started', task_id: 'fixture' });
      send({ type: 'speech.start', sample_rate: 24000 });
      socket.send(pcm, { binary: true });
      send({ type: 'speech.end' });
    }
  });
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const port = server.address().port;
try {
  const child = spawn(path.resolve('.venv-voice/Scripts/python.exe'), ['scripts/probe-native-client-fake.py'], {
    env: { ...process.env, PYTHONPATH: process.cwd(), ASSISTAI_TEST_VOICE_URL: `ws://127.0.0.1:${port}/voice`, ASSISTAI_TEST_NOTIFICATION: '1' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let output = '', error = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { error += data; });
  const timeout = setTimeout(() => child.kill(), 30000);
  const [code] = await once(child, 'exit');
  clearTimeout(timeout);
  assert.equal(code, 0, error);
  const result = JSON.parse(output.trim().split(/\r?\n/).at(-1));
  assert.equal(notifications, 1);
  assert.ok(result.notification_output_nonzero_samples > 1000);
  assert.equal(result.physical_devices_opened, false);
  console.log(JSON.stringify({ ...result, notification_requests: notifications, inference: 'mock' }));
} finally {
  for (const client of sockets.clients) client.terminate();
  await new Promise(resolve => sockets.close(resolve));
  await new Promise(resolve => server.close(resolve));
}
