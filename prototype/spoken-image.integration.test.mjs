import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import WebSocket, { WebSocketServer } from 'ws';

async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }
async function close(server) { await new Promise(resolve => server.close(resolve)); }

test('reviewed spoken image waits for edited transcript before sending to vision', { timeout: 15000 }, async t => {
  let visionRequest;
  const vision = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    visionRequest = JSON.parse(Buffer.concat(chunks));
    res.end(JSON.stringify({ choices: [{ message: { content: 'Rouge' } }] }));
  });
  const visionPort = await listen(vision);
  const wav = Buffer.alloc(48); wav.write('RIFF', 0); wav.write('WAVE', 8); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(24000, 24); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  const tts = http.createServer((req, res) => { req.resume(); res.end(wav); }); const ttsPort = await listen(tts);
  const asr = http.createServer(); const asrSockets = new WebSocketServer({ server: asr });
  asrSockets.on('connection', socket => { socket.send(JSON.stringify({ type: 'ready' })); socket.on('message', data => {
    const type = JSON.parse(data.toString()).type;
    if (type === 'reset') { socket.send(JSON.stringify({ type: 'segment', text: 'OLD CANCELLED SPEECH' })); socket.send(JSON.stringify({ type: 'reset' })); }
    if (type === 'end') socket.send(JSON.stringify({ type: 'final', text: 'Quelle couleur ?' }));
  }); });
  const asrPort = await listen(asr);
  const reservation = http.createServer(); const port = await listen(reservation); await close(reservation);
  const child = spawn(process.execPath, ['prototype/gateway.mjs'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ASSISTAI_GATEWAY_PORT: String(port), ASSISTAI_DB_PATH: ':memory:', ASSISTAI_LFM_REALTIME_URL: '',
      ASSISTAI_VISION_URL: `http://127.0.0.1:${visionPort}/v1`, ASSISTAI_TTS_URL: `http://127.0.0.1:${ttsPort}`,
      ASSISTAI_ASR_URL: `ws://127.0.0.1:${asrPort}/asr`, ASSISTAI_BUDGET_SAMPLE_PATH: '' } });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } for (const socket of asrSockets.clients) socket.terminate(); await close(asr); await close(vision); await close(tts); });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Gateway startup timeout')), 5000);
    child.once('exit', code => reject(Error(`Gateway exited ${code}`)));
    child.stdout.on('data', data => { if (data.toString().includes('Experimental voice gateway')) { clearTimeout(timer); resolve(); } }); });
  const socket = new WebSocket(`ws://127.0.0.1:${port}/voice`); t.after(() => socket.terminate());
  const image = `data:image/png;base64,${Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')}`;
  let capability = false, pendingReview;
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('Spoken image timeout')), 5000);
    socket.on('error', reject); socket.on('message', (data, binary) => { if (binary) return;
      const event = JSON.parse(data.toString());
      if (event.type === 'session.capabilities') capability = event.spoken_image_input;
      if (event.type === 'asr.ready') { socket.send(JSON.stringify({ type: 'speech.review.configure', enabled: true })); socket.send(JSON.stringify({ type: 'audio.reset' })); socket.send(JSON.stringify({ type: 'audio.end', image })); }
      if (event.type === 'speech.review') { assert.equal(visionRequest, undefined); assert.equal(event.has_image, true); assert.equal(event.text, 'Quelle couleur ?'); pendingReview = event.review_id; socket.send(JSON.stringify({ type:'speech.review.submit', review_id:'wrong-id', text:'Wrong request' })); }
      if (event.type === 'error' && pendingReview) { assert.match(event.message, /review/); assert.equal(visionRequest, undefined); socket.send(JSON.stringify({ type:'speech.review.submit', review_id:pendingReview, text:'Quelle couleur exactement ?' })); pendingReview = null; }
      else if (event.type === 'error') { clearTimeout(timer); reject(Error(event.message)); }
      if (event.type === 'speech.end') { clearTimeout(timer); resolve(); }
    }); });
  assert.equal(capability, true);
  assert.deepEqual(visionRequest.messages[1].content, [{ type: 'text', text: 'Quelle couleur exactement ?' }, { type: 'image_url', image_url: { url: image } }]);
});
