// Synthetic text test of opt-in reconnect memory with the real local cascade.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import WebSocket from 'ws';

async function open(port, token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/voice`, ['assistai-v1', `resume.${token}`]);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Gateway readiness timed out')), 12000);
    socket.on('error', reject);
    socket.on('message', (data, binary) => {
      if (!binary && JSON.parse(data.toString()).type === 'asr.ready') { clearTimeout(timer); resolve(); }
    });
  });
  return socket;
}

async function turn(socket, text) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Voice response timed out')), 60000);
    let answer = '', audioBytes = 0;
    const handler = (data, binary) => {
      if (binary) { audioBytes += data.length; return; }
      const event = JSON.parse(data.toString());
      if (event.type === 'assistant.text') answer = event.text;
      if (event.type === 'speech.end') { clearTimeout(timer); socket.off('message', handler); resolve({ answer, audioBytes }); }
      if (event.type === 'error') { clearTimeout(timer); socket.off('message', handler); reject(Error(event.message)); }
    };
    socket.on('message', handler);
    socket.send(JSON.stringify({ type: 'text', text }));
  });
}

const reservation = http.createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const gateway = spawn(process.execPath, ['prototype/gateway.mjs'], {
  env: { ...process.env, ASSISTAI_GATEWAY_PORT: String(port), ASSISTAI_DB_PATH: ':memory:',
    ASSISTAI_ENABLE_SESSION_RESUME: '1', ASSISTAI_OPENCODE_URL: '', ASSISTAI_LFM_REALTIME_URL: '',
    ASSISTAI_LLM_URL: 'http://127.0.0.1:18084/v1', ASSISTAI_TTS_URL: 'http://127.0.0.1:18081',
    ASSISTAI_ASR_URL: 'ws://127.0.0.1:18082/asr' },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let stderr = '';
gateway.stderr.on('data', data => { stderr += data; });
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`Gateway startup timed out: ${stderr}`)), 8000);
    gateway.once('exit', code => { clearTimeout(timer); reject(Error(`Gateway exited ${code}`)); });
    gateway.stdout.on('data', data => { if (data.toString().includes('Experimental voice gateway')) { clearTimeout(timer); resolve(); } });
  });
  const code = String(100000 + randomBytes(4).readUInt32BE(0) % 900000);
  const token = randomBytes(32).toString('hex');
  let socket = await open(port, token);
  const introduction = await turn(socket, `Le code secret du projet est ${code}. Mémorise-le.`);
  socket.close(); await once(socket, 'close');
  socket = await open(port, token);
  const recalled = await turn(socket, 'Quel était le code secret du projet ? Réponds seulement avec le code.');
  socket.close(); await once(socket, 'close');
  socket = await open(port, randomBytes(32).toString('hex'));
  const separate = await turn(socket, 'Quel était le code secret du projet ? Réponds seulement avec le code.');
  socket.close(); await once(socket, 'close');
  const digits = text => text.replace(/\D/g, '');
  const result = { same_session_code_recalled: /^\s*\d{6}\s*[.!]?\s*$/.test(recalled.answer) && digits(recalled.answer) === code,
    separate_session_leaked_code: digits(separate.answer).includes(code),
    synthetic_recalled_answer: recalled.answer,
    introduction_audio_bytes: introduction.audioBytes, recalled_audio_bytes: recalled.audioBytes,
    separate_audio_bytes: separate.audioBytes, gateway_history: 'volatile', physical_audio_devices_opened: false,
    note: 'Synthetic text, real local cascade; no physical audio playback or human listening.' };
  console.log(JSON.stringify(result));
  assert.ok(result.same_session_code_recalled, 'Model did not repeat the synthetic code');
  assert.equal(result.separate_session_leaked_code, false, 'Other session repeated the synthetic code');
  assert.ok(introduction.audioBytes && recalled.audioBytes && separate.audioBytes, 'Missing generated audio');
} finally {
  gateway.kill();
}
