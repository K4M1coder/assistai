// Test the controller's proposal only; always decline and never execute it.
import WebSocket from 'ws';

const url = new URL(process.env.ASSISTAI_TEST_VOICE_URL ?? 'ws://127.0.0.1:18111/voice');
if (url.protocol !== 'ws:' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.username || url.password) throw Error('Expected loopback gateway');
const text = 'Dans calculator.py, corrige add pour faire une addition au lieu d’une soustraction, sans changer d’autre fichier.';
const socket = new WebSocket(url);
let proposed, original, declined = false, ended = false, audioBytes = 0;
const timer = setTimeout(() => { console.error('Timed out'); process.exitCode = 1; socket.close(); }, 60000);
socket.on('message', (raw, binary) => {
  if (binary) { audioBytes += raw.length; return; }
  const event = JSON.parse(raw);
  if (event.type === 'asr.ready') socket.send(JSON.stringify({type:'text',text}));
  else if (event.type === 'task.approval_requested') {
    proposed = event.task; original = event.original_request;
    socket.send(JSON.stringify({type:'task.approval',approval_id:event.approval_id,approved:false}));
  } else if (event.type === 'task.approval_declined') declined = true;
  else if (event.type === 'speech.end') { ended = true; socket.close(); }
  else if (['task.started','error','task.error'].includes(event.type)) { console.error(JSON.stringify(event)); process.exitCode = 1; socket.close(); }
});
socket.on('error', error => { console.error(error.message); process.exitCode = 1; });
socket.on('close', () => {
  clearTimeout(timer);
  console.log(JSON.stringify({original,proposed,declined,ended,audio_bytes:audioBytes,semantic_review_required:true}));
  if (!proposed || original !== text || !declined || !ended || !audioBytes) process.exitCode = 1;
});
