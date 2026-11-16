// Synthetic public research request. Always decline; never perform a search.
import WebSocket from 'ws';

const url = new URL(process.env.ASSISTAI_TEST_VOICE_URL ?? 'ws://127.0.0.1:18121/voice');
if (url.protocol !== 'ws:' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.username || url.password) throw Error('Expected loopback gateway');
const text = 'Délègue à ton agent une recherche sur le site officiel de la ville de Nantes et demande les sources.';
const socket = new WebSocket(url);
let label = '', proposal, declined = false, ended = false, bytes = 0;
const timer = setTimeout(() => { console.error('Timed out'); process.exitCode = 1; socket.close(); }, 60000);
socket.on('message', (raw, binary) => {
  if (binary) { bytes += raw.length; return; }
  const event = JSON.parse(raw);
  if (event.type === 'session.capabilities') label = event.workspace_label ?? '';
  else if (event.type === 'asr.ready') socket.send(JSON.stringify({type:'text',text}));
  else if (event.type === 'task.approval_requested') {
    proposal = event.task;
    socket.send(JSON.stringify({type:'task.approval',approval_id:event.approval_id,approved:false}));
  } else if (event.type === 'task.approval_declined') declined = true;
  else if (event.type === 'speech.end') { ended = true; socket.close(); }
  else if (['task.started','error','task.error'].includes(event.type)) { console.error(JSON.stringify(event)); process.exitCode = 1; socket.close(); }
});
socket.on('error', error => { console.error(error.message); process.exitCode = 1; });
socket.on('close', () => {
  clearTimeout(timer);
  console.log(JSON.stringify({label,proposal,declined,ended,audio_bytes:bytes,search_executed:false,semantic_review_required:true}));
  if (!label.includes('hosted Exa') || !proposal || !declined || !ended || !bytes) process.exitCode = 1;
});
