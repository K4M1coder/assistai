// Exercise the Windows native client with synthetic devices and a mock realtime server.
// This does not load a speech model or open physical audio devices.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
async function close(server) { await new Promise(resolve => server.close(resolve)); }

const backend = http.createServer();
const sockets = new WebSocketServer({ server: backend });
let audioBytes = 0;
sockets.on('connection', socket => {
  socket.send(JSON.stringify({ type: 'session.created', session: { audio: { input: { format: { rate: 16000 } }, output: { format: { rate: 24000 } } } } }));
  socket.on('message', raw => {
    const event = JSON.parse(raw);
    if (event.type === 'session.update') socket.send(JSON.stringify({ type: 'session.updated' }));
    if (event.type === 'input_audio_buffer.append') audioBytes += Buffer.from(event.audio, 'base64').length;
    if (event.type === 'response.create') {
      const id = 'synthetic-response';
      const pcm = Buffer.alloc(24000 * 2);
      for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(2000, i);
      socket.send(JSON.stringify({ type: 'response.created', response: { id } }));
      socket.send(JSON.stringify({ type: 'response.output_audio.delta', response_id: id, delta: pcm.toString('base64') }));
      socket.send(JSON.stringify({ type: 'response.done', response: { id, status: 'completed', output: [] } }));
    }
  });
});
const backendPort = await listen(backend);
const reservation = http.createServer();
const gatewayPort = await listen(reservation);
await close(reservation);
const gateway = spawn(process.execPath, ['prototype/gateway.mjs'], {
  env: { ...process.env, ASSISTAI_GATEWAY_PORT: String(gatewayPort), ASSISTAI_DB_PATH: ':memory:',
    ASSISTAI_LFM_REALTIME_URL: `ws://127.0.0.1:${backendPort}/v1/realtime`,
    ASSISTAI_LFM_TRANSCRIPT_ASR_URL: 'ws://127.0.0.1:18082/asr' },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let stderr = '';
gateway.stderr.on('data', data => { stderr += data; });
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error(`Gateway startup timed out: ${stderr}`)), 8000);
    gateway.once('exit', code => { clearTimeout(timeout); reject(Error(`Gateway exited ${code}: ${stderr}`)); });
    gateway.stdout.on('data', data => {
      if (data.toString().includes('Experimental voice gateway')) { clearTimeout(timeout); resolve(); }
    });
  });
  const python = path.resolve('.venv-voice/Scripts/python.exe');
  const child = spawn(python, ['scripts/probe-native-client-fake.py'], {
    env: { ...process.env, PYTHONPATH: process.cwd(), ASSISTAI_TEST_VOICE_URL: `ws://127.0.0.1:${gatewayPort}/voice` },
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
  assert.deepEqual(result.modes, ['native-speech']);
  assert.ok(audioBytes > 0, 'mock native model received no audio');
  assert.ok(result.output_nonzero_samples > 1000);
  assert.equal(result.physical_devices_opened, false);
  console.log(JSON.stringify({ ...result, mock_model_received_audio_bytes: audioBytes, inference: 'mock' }));
} finally {
  gateway.kill();
  for (const client of sockets.clients) client.terminate();
  await new Promise(resolve => sockets.close(resolve));
  await close(backend);
}
