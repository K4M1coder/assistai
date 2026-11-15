// Synthetic read-only proposal: decline it and verify spoken approval guidance.
import WebSocket from 'ws';

const target = new URL(process.env.ASSISTAI_TEST_VOICE_URL ?? 'ws://127.0.0.1:18098/voice');
if (target.protocol !== 'ws:' || !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || target.username || target.password) throw Error('Expected local gateway');
const socket = new WebSocket(target);
let proposal = false, declined = false, answer = '', bytes = 0, done = false;
const timer = setTimeout(() => { console.error('Approval probe timed out'); process.exitCode = 1; socket.close(); }, 60000);
socket.on('message', (raw, binary) => {
  if (binary) { bytes += raw.length; return; }
  const event = JSON.parse(raw);
  if (event.type === 'asr.ready') socket.send(JSON.stringify({ type:'text', text:'Délègue à ton agent la lecture de fixture.txt et demande le mot secret.' }));
  else if (event.type === 'task.approval_requested') {
    proposal = typeof event.task === 'string' && typeof event.approval_id === 'string';
    socket.send(JSON.stringify({ type:'task.approval', approval_id:event.approval_id, approved:false }));
  } else if (event.type === 'task.approval_declined') declined = true;
  else if (event.type === 'assistant.text') answer = event.text ?? '';
  else if (event.type === 'speech.end') { done = true; socket.close(); }
  else if (['task.started', 'error', 'task.error'].includes(event.type)) { console.error(JSON.stringify(event)); process.exitCode = 1; socket.close(); }
});
socket.on('error', error => { console.error(error.message); process.exitCode = 1; });
socket.on('close', () => {
  clearTimeout(timer);
  const guidance = /Approve task/.test(answer) && /Decline task/.test(answer);
  console.log(JSON.stringify({ proposal, declined, guidance, audio_bytes:bytes, done, physical_devices_opened:false }));
  if (!proposal || !declined || !guidance || !bytes || !done) process.exitCode = 1;
});
