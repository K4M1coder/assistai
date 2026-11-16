// Operator-attended public research probe. No task is approved automatically.
import WebSocket from 'ws';
import { askProbeApproval } from './interactive-probe-approval.mjs';

const address = new URL(process.env.ASSISTAI_TEST_VOICE_URL ?? 'ws://127.0.0.1:18121/voice');
if (address.protocol !== 'ws:' || !['127.0.0.1','localhost','[::1]'].includes(address.hostname) || address.username || address.password) throw Error('Expected credential-free loopback gateway');
const request = 'Recherche le site officiel de la ville de Nantes et donne son adresse avec une source.';
const socket = new WebSocket(address);
const started = performance.now();
let sent = false, proposal = null, approved = false, startedTask = false, complete = null, label = '';
let audioBytes = 0, notificationBytes = 0, notification = false, pendingResponse = false, notificationRequested = false;
const timer = setTimeout(() => { console.error('Timed out; task status may be uncertain.'); process.exitCode = 1; socket.terminate(); }, 180000);
function fail(message) { console.error(message); process.exitCode = 1; clearTimeout(timer); socket.close(); }
function notifyWhenReady() {
  if (!complete || pendingResponse || notificationRequested) return;
  notificationRequested = true;
  socket.send(JSON.stringify({type:'notification.speak',task_id:complete.task_id}));
}
socket.on('message', async (raw, binary) => {
  if (binary) { audioBytes += raw.length; if (notification) notificationBytes += raw.length; return; }
  let event;
  try { event = JSON.parse(raw); } catch { fail('Invalid gateway event'); return; }
  if (event.type === 'session.capabilities') label = event.workspace_label ?? '';
  else if (event.type === 'asr.ready' && !sent) {
    if (!label.includes('hosted Exa')) { fail('Expected an explicitly labeled hosted web-search fixture'); return; }
    sent = true; pendingResponse = true; socket.send(JSON.stringify({type:'text',text:request}));
  } else if (event.type === 'task.approval_requested') {
    proposal = event.task;
    if (event.original_request !== request) { fail('Original request did not match'); return; }
    console.error('This task may send its search query to hosted Exa and request external websites.');
    approved = await askProbeApproval(event);
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({type:'task.approval',approval_id:event.approval_id,approved}));
    if (!approved) fail('Declined or interactive approval unavailable; no task was approved.');
  } else if (event.type === 'task.started') startedTask = true;
  else if (event.type === 'task.completed') { complete = event; notifyWhenReady(); }
  else if (event.type === 'notification.started') notification = true;
  else if (event.type === 'speech.end') {
    if (notification) {
      clearTimeout(timer);
      const links = [...new Set((complete?.text ?? '').match(/https?:\/\/[^\s<>)\]]+/g) ?? [])];
      console.log(JSON.stringify({proposal,approved,started:startedTask,completed:Boolean(complete),
        elapsed_ms:Math.round(performance.now()-started),source_links:links,audio_bytes:audioBytes,
        notification_audio_bytes:notificationBytes, note:'Links are not independently validated; speech was not listened to.'}));
      if (!startedTask || !complete || !links.length || !notificationBytes) process.exitCode = 1;
      socket.close();
    } else { pendingResponse = false; notifyWhenReady(); }
  } else if (['task.error','task.rejected','task.uncertain','notification.rejected','error'].includes(event.type)) fail(`Probe stopped: ${event.type}: ${event.message ?? ''}`);
});
socket.on('error', error => fail(error.message));
socket.on('close', () => clearTimeout(timer));
