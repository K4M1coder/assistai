const $ = id => document.getElementById(id);
const status = text => { $('status').textContent = text; };
const log = text => { $('log').textContent += `${text}\n`; };
async function refreshMicrophones() {
  if (!globalThis.navigator?.mediaDevices?.enumerateDevices) return;
  try {
    const selected = $('microphone-device').value;
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput' && device.deviceId && device.deviceId !== 'default');
    const defaultOption = document.createElement('option'); defaultOption.value = ''; defaultOption.textContent = 'System default';
    const options = devices.map((device, index) => { const option = document.createElement('option'); option.value = device.deviceId; option.textContent = device.label || `Microphone ${index + 1}`; return option; });
    $('microphone-device').replaceChildren(defaultOption, ...options);
    $('microphone-device').value = devices.some(device => device.deviceId === selected) ? selected : '';
  } catch { status('Could not list microphones; the system default remains available.'); }
}
$('refresh-microphones').onclick = refreshMicrophones;
void refreshMicrophones();
async function refreshServices() {
  const list = $('services');
  try {
    const response = await fetch('/services', { cache: 'no-store' });
    if (!response.ok) throw Error('Status endpoint unavailable');
    const { services } = await response.json();
    list.replaceChildren(...services.map(service => {
      const item = document.createElement('li');
      const names = service.models?.map(model => `${model.engine ?? 'Unknown engine'}: ${model.name}${model.context ? ` (${model.context} context)` : ''}`).join(', ');
      const engine = service.engine ? ` — ${service.engine}` : '';
      item.textContent = `${service.role}: ${service.available ? 'online' : 'unavailable'}${service.server ? ` — ${service.server}` : ''}${engine}${service.model ? ` — ${service.model}` : ''}${names ? ` — ${names}` : ''}${service.harness ? ` — OpenCode: ${service.harness}` : ''}${service.message ? ` — ${service.message}` : ''}`;
      return item;
    }));
  } catch { list.textContent = 'Service status unavailable. Restart the gateway to update it.'; }
}
$('refresh-services').onclick = refreshServices;
void refreshServices();
async function refreshResources() {
  try {
    const response = await fetch('/resources', { cache: 'no-store' });
    if (!response.ok) throw Error('Resource status unavailable');
    const data = await response.json();
    if (data.status === 'observed' || data.status === 'low') {
      const gib = bytes => (bytes / 1024 ** 3).toFixed(2);
      const estimate = data.single_task_estimate;
      const projection = estimate?.status === 'insufficient' ? ` Current sample: insufficient estimated headroom for one task. ${(estimate.reasons ?? []).join(' ')}` :
        estimate?.status === 'headroom_observed' ? ' Current sample: estimated headroom for one task; active tasks and later changes may still cause rejection.' : '';
      const pagefile = Number.isFinite(data.system_pagefile_used_bytes) ? `, system pagefile use ${gib(data.system_pagefile_used_bytes)} GiB (all processes)` : '';
      const coordination = data.coordination ? ` Coordination: ${data.coordination}.` : '';
      $('resources').textContent = `Resources: ${data.status}; GPU dedicated ${gib(data.dedicated_bytes)} GiB, GPU shared ${gib(data.shared_bytes)} GiB, available RAM ${gib(data.available_ram_bytes)} GiB${pagefile}. ${(data.reasons ?? []).join(' ')} Task admission: ${data.admission}.${coordination}${projection} No hard limit is enforced.`;
    } else $('resources').textContent = `Resource status: ${data.status}. ${data.reason ?? ''} Task admission: ${data.admission}. No hard limit is enforced.`;
  } catch { $('resources').textContent = 'Resource status unavailable. No hard limit is enforced.'; }
}
void refreshResources();
setInterval(refreshResources, 5000);
const memoryKey = 'assistai.session-resume.v1';
let memoryToken = null;
try { memoryToken = localStorage.getItem(memoryKey); } catch {}
const memoryButton = $('session-memory');
const memoryStatus = $('session-memory-status');
async function configureMemory() {
  try {
    const response = await fetch('/health', { cache: 'no-store' });
    const health = await response.json();
    if (!response.ok || !health.session_resume_enabled) {
      memoryButton.disabled = !memoryToken;
      memoryButton.textContent = memoryToken ? 'Stop resuming this conversation' : 'Session resume unavailable';
      memoryStatus.textContent = memoryToken ? 'The gateway does not support resume. Stop resuming to reconnect; gateway history is not erased.' : 'Enable session resume on the gateway to use this option.';
      return;
    }
    memoryButton.disabled = false;
    memoryButton.textContent = memoryToken ? 'Stop resuming this conversation' : 'Start a resumable conversation';
    memoryStatus.textContent = memoryToken ? 'This browser keeps a local session key. Stopping resume does not erase gateway history.' : 'Off. Enabling starts a new conversation, saves a local session key and reloads this page.';
  } catch { memoryStatus.textContent = 'Session resume status unavailable.'; }
}
memoryButton.onclick = () => {
  try {
    if (memoryToken) localStorage.removeItem(memoryKey);
    else {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      localStorage.setItem(memoryKey, Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''));
    }
    location.reload();
  } catch { memoryStatus.textContent = 'Could not update the local session key.'; }
};
void configureMemory();
let ws, reconnectAttempts = 0;
let captureContext, playbackContext, stream, captureNode, echoBridge, referenceNode;
let speechOpen = false, activeSpeechTurn = null, speaking = false, voiceFrames = 0, silenceFrames = 0;
let playbackTime = 0, playbackSources = new Set(), carry = null;
let speechHasAudio = false, playbackGapCount = 0, playbackGapMaxMs = 0;
let asrReady = false;
let textInputAvailable = true;
let speechReviewAvailable = false, pendingReviewId = null;
let spokenImageAvailable = false, preparedImage = null, imageVersion = 0, spokenImageSent = false;
$('image').onchange = () => {
  const file = $('image').files?.[0], version = ++imageVersion;
  preparedImage = null;
  if (!file) return;
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 1024 * 1024) { status('Choose a PNG or JPEG image under 1 MiB.'); return; }
  const reader = new FileReader();
  reader.onload = () => { if (version === imageVersion) { preparedImage = reader.result; status(spokenImageAvailable ? 'Image ready for your next text or spoken question.' : 'Image ready for a text question.'); } };
  reader.onerror = () => { if (version === imageVersion) status('Could not read the selected image.'); };
  reader.readAsDataURL(file);
};
function finishAudio() {
  const selected = $('image').files?.[0];
  const image = spokenImageAvailable && selected && preparedImage ? preparedImage : undefined;
  if (selected && !image) status('The selected image was not sent with this spoken question.');
  spokenImageSent = Boolean(image);
  if (image) { $('image').value = ''; preparedImage = null; imageVersion++; }
  send(JSON.stringify(image ? { type: 'audio.end', image } : { type: 'audio.end' }));
}
let pushToTalkActive = false;
let responsePending = false, notificationPending = false, currentNotification = null, currentNotificationTurn = null;
let taskCancelAvailable = false;
let pendingApproval = null;
function clearApproval() {
  pendingApproval = null;
  $('task-approval').hidden = true;
}
function decideApproval(approved) {
  if (!pendingApproval || ws.readyState !== WebSocket.OPEN) return;
  send(JSON.stringify({ type: 'task.approval', approval_id: pendingApproval, approved }));
  clearApproval();
}
$('approve-task').onclick = () => decideApproval(true);
$('decline-task').onclick = () => decideApproval(false);
const activeTaskIds = new Set(), cancellationRequested = new Set();
function latestCancellableTask() { return [...activeTaskIds].reverse().find(id => !cancellationRequested.has(id)); }
function refreshTaskButton() { $('stop-task').disabled = !taskCancelAvailable || !latestCancellableTask(); }
$('stop-task').onclick = () => {
  const taskId = latestCancellableTask();
  if (!taskId || ws.readyState !== WebSocket.OPEN) return;
  cancellationRequested.add(taskId); refreshTaskButton();
  send(JSON.stringify({ type: 'task.cancel', task_id: taskId }));
};
const pendingNotifications = [];
let latestCompletedTask = null;
$('replay-task').onclick = async () => {
  const task = latestCompletedTask, socket = ws;
  if (!task || socket.readyState !== WebSocket.OPEN) return;
  try { playbackContext ??= new AudioContext(); await playbackContext.resume(); }
  catch { status('Could not start audio playback.'); return; }
  if (socket !== ws || socket.readyState !== WebSocket.OPEN || task !== latestCompletedTask) return;
  if (!pendingNotifications.includes(task) && currentNotification !== task) pendingNotifications.push(task);
  announceWhenIdle();
};
let notificationRetries = 0;
let detectionThreshold = Number($('noise-threshold').value) / 100;
let endSilenceFrames = Math.round(Number($('end-silence').value) * 50);
$('end-silence').oninput = event => {
  const seconds = Number(event.target.value);
  endSilenceFrames = Math.round(seconds * 50);
  $('end-silence-value').textContent = `${seconds.toFixed(1)} s`;
};
$('noise-threshold').oninput = event => {
  detectionThreshold = Number(event.target.value) / 100;
  $('noise-threshold-value').textContent = `${Number(event.target.value).toFixed(1)}%`;
};
const send = data => { if (ws.readyState === WebSocket.OPEN) ws.send(data); };
$('speech-review').onchange = () => {
  pendingReviewId = null;
  if (speechReviewAvailable) send(JSON.stringify({ type: 'speech.review.configure', enabled: $('speech-review').checked }));
};
function announceWhenIdle() {
  if (!pendingNotifications.length || notificationPending || responsePending || speaking || pushToTalkActive || speechOpen || playbackSources.size || !playbackContext || ws.readyState !== WebSocket.OPEN) return;
  notificationPending = true;
  send(JSON.stringify({ type: 'notification.speak', task_id: pendingNotifications[0] }));
}
function finishPushToTalk() {
  if (!pushToTalkActive) return;
  pushToTalkActive = false;
  $('talk').textContent = 'Hold to talk';
  responsePending = true;
  finishAudio();
}
function echoFilterFailed(message) {
  $('speaker-safe').checked = true;
  pushToTalkActive = false; speaking = false; voiceFrames = 0; silenceFrames = 0;
  $('talk').textContent = 'Hold to talk';
  captureNode?.disconnect(); stream?.getTracks().forEach(track => track.stop());
  stream = undefined; captureNode = undefined; captureContext = undefined;
  echoBridge?.close(); echoBridge = undefined; referenceNode = undefined;
  send(JSON.stringify({ type: 'audio.reset' }));
  $('experimental-aec').disabled = false;
  $('start').disabled = false; $('stop').disabled = true; $('talk').disabled = true;
  $('echo-status').textContent = 'Echo cancellation: filter stopped; microphone stopped.';
  status(`Echo filter stopped: ${message}. Restart the microphone.`);
}
function stopPlayback() {
  speechOpen = false;
  activeSpeechTurn = null;
  for (const source of playbackSources) { try { source.stop(); } catch {} }
  playbackSources.clear();
  playbackTime = 0;
  carry = null;
}
function deferCurrentNotification() {
  if (currentNotification) pendingNotifications.unshift(currentNotification);
  currentNotification = null;
  currentNotificationTurn = null;
}
function interrupt(reason = 'manual') {
  const wasPlaying = speechOpen || playbackSources.size > 0;
  deferCurrentNotification();
  stopPlayback();
  responsePending = false;
  if (reason === 'voice_activity' && wasPlaying) log('Playback interrupted: microphone detected speech.');
  send(JSON.stringify({ type: 'interrupt', reason }));
}
function play(data, rate) {
  if (!speechOpen || !playbackContext) return;
  let bytes = new Uint8Array(data);
  if (carry !== null) { const joined = new Uint8Array(bytes.length + 1); joined[0] = carry; joined.set(bytes, 1); bytes = joined; carry = null; }
  if (bytes.length % 2) { carry = bytes[bytes.length - 1]; bytes = bytes.subarray(0, bytes.length - 1); }
  if (!bytes.length) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const buffer = playbackContext.createBuffer(1, bytes.length / 2, rate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i++) channel[i] = view.getInt16(i * 2, true) / 32768;
  const source = playbackContext.createBufferSource();
  source.buffer = buffer; source.connect(playbackContext.destination);
  if (referenceNode && captureContext === playbackContext) source.connect(referenceNode, 0, 1);
  const continuingSpeech = speechHasAudio;
  if (continuingSpeech && playbackContext.currentTime - playbackTime > 0.03) {
    playbackGapCount++;
    playbackGapMaxMs = Math.max(playbackGapMaxMs, (playbackContext.currentTime - playbackTime) * 1000);
  }
  speechHasAudio = true;
  // Preserve a continuous queue. Add startup lead only for the first chunk or after an underrun.
  playbackTime = continuingSpeech && playbackTime >= playbackContext.currentTime
    ? playbackTime : Math.max(playbackTime, playbackContext.currentTime + 0.04);
  source.start(playbackTime); playbackTime += buffer.duration;
  playbackSources.add(source); source.onended = () => {
    if (!playbackSources.delete(source)) return;
    if (!speechOpen && !playbackSources.size) { currentNotification = null; currentNotificationTurn = null; }
    announceWhenIdle();
  };
}
let outputRate = 24000;
function handleSocketMessage({ data }) {
  if (data instanceof ArrayBuffer) { play(data, outputRate); return; }
  const event = JSON.parse(data);
  if (event.type === 'session.capabilities') {
    $('workspace-label').textContent = event.workspace_label || 'Agent workspace and permissions were not reported; inspect the harness configuration.';
    $('approval-workspace').textContent = $('workspace-label').textContent;
    $('approval-safety').textContent = event.task_approval === true
      ? 'Agent tasks require explicit approval before submission.'
      : 'Warning: this gateway does not confirm agent tasks before submission. Do not delegate consequential work.';
    textInputAvailable = event.text_input === true;
    speechReviewAvailable = event.speech_review === true;
    $('speech-review').disabled = !speechReviewAvailable;
    spokenImageAvailable = event.spoken_image_input === true;
    taskCancelAvailable = event.task_cancel === true;
    refreshTaskButton();
    $('text').disabled = !textInputAvailable;
    $('send').disabled = !textInputAvailable;
    $('image').disabled = event.image_input !== true;
    $('mode').textContent = event.mode === 'native-speech' ? `Experimental native speech mode: speech input and output. ${event.input_transcript ? 'Parallel transcription is enabled.' : 'Input transcription is unavailable.'} Text and image input are unavailable.` : 'Cascade mode: speech recognition, text controller and speech synthesis.';
  }
  else if (event.type === 'asr.reconnecting') { asrReady = false; $('talk').disabled = true; status('Reconnecting the voice session.'); }
  else if (event.type === 'asr.ready') { asrReady = true; reconnectAttempts = 0; if (speechReviewAvailable) send(JSON.stringify({type:'speech.review.configure',enabled:$('speech-review').checked})); $('talk').disabled = !$('push-to-talk').checked || !stream?.active; status(stream?.active ? 'Listening in French.' : 'Ready. Start the microphone to speak French.'); }
  else if (event.type === 'speech.review') { pendingReviewId = event.review_id; $('text').value = event.text; responsePending = false; status(event.has_image ? 'Review the transcript, then press Send. The spoken image is attached.' : 'Review the transcript, then press Send.'); }
  else if (event.type === 'asr.empty') { if (spokenImageSent) log('No speech was recognized. Select the image again to retry.'); spokenImageSent = false; responsePending = false; announceWhenIdle(); }
  else if (event.type === 'transcript.empty') $('partial').textContent = '';
  else if (event.type === 'transcript.unavailable') { $('partial').textContent = ''; log('Parallel transcription unavailable for this turn.'); }
  else if (event.type === 'asr.partial') $('partial').textContent = event.text ?? '';
  else if (event.type === 'user.text') { spokenImageSent = false; $('partial').textContent = ''; log(`You: ${event.text}`); }
  else if (event.type === 'assistant.text') log(`Assistant: ${event.text}`);
  else if (event.type === 'task.approval_requested') {
    pendingApproval = event.approval_id;
    $('approval-original').textContent = event.original_request ?? 'Unavailable in native speech mode.';
    $('approval-task').textContent = event.task;
    $('task-approval').hidden = false;
    status('Review the task and click Approve task or Decline task. Spoken confirmation does not approve it.');
  }
  else if (event.type === 'task.approval_submitted' || event.type === 'task.approval_declined' || event.type === 'task.approval_expired' || event.type === 'task.approval_rejected' || event.type === 'task.approval_result') {
    if (event.approval_id === pendingApproval) clearApproval();
    status(event.message ?? (event.type === 'task.approval_submitted' ? 'Approval received; submitting the task.' : 'Task was not approved or approval expired.'));
  }
  else if (event.type === 'session.task_history' && Array.isArray(event.events)) {
    log('Recent task history (past events; started does not confirm current status):');
    for (const item of event.events) {
      if (item.kind === 'task.started') log(`Previous task started: ${item.text}`);
      else if (item.kind === 'task.completed') { log(`Previous task completed: ${item.text}`); if (typeof item.task_id === 'string' && item.task_id) { latestCompletedTask = item.task_id; $('replay-task').disabled = false; } }
      else if (item.kind === 'task.error') log(`Previous task error: ${item.text}`);
      else if (item.kind === 'task.uncertain') log(`Previous task status uncertain: ${item.text}`);
      else if (item.kind === 'task.status_restored') log(`Previous monitoring update: ${item.text}`);
    }
  }
  else if (event.type === 'task.started') { if (event.task_id) activeTaskIds.add(event.task_id); refreshTaskButton(); log(`Agent started: ${event.task}`); }
  else if (event.type === 'task.progress') { if (event.state === 'retrying') log(`Agent is retrying${Number.isSafeInteger(event.attempt) ? ` (attempt ${event.attempt})` : ''}.`); else if (event.state === 'running') log('Agent resumed work.'); }
  else if (event.type === 'task.reused') log(`Agent result reused: ${event.task}`);
  else if (event.type === 'task.rejected') { status(event.message); log(`Agent task rejected: ${event.message}`); }
  else if (event.type === 'task.uncertain') { if (event.task_id) { activeTaskIds.add(event.task_id); cancellationRequested.delete(event.task_id); } refreshTaskButton(); log(`Agent task status uncertain: ${event.message}`); }
  else if (event.type === 'task.status_restored') log(event.message);
  else if (event.type === 'task.completed') { activeTaskIds.delete(event.task_id); cancellationRequested.delete(event.task_id); refreshTaskButton(); log(`Agent completed: ${event.text}`); if (typeof event.task_id === 'string' && event.task_id) { latestCompletedTask = event.task_id; $('replay-task').disabled = false; pendingNotifications.push(event.task_id); announceWhenIdle(); } }
  else if (event.type === 'task.cancel_requested' || event.type === 'task.cancel_rejected') { log(event.message); if (event.type === 'task.cancel_rejected') cancellationRequested.delete(event.task_id); refreshTaskButton(); }
  else if (event.type === 'notification.started') { if (pendingNotifications[0] === event.task_id) pendingNotifications.shift(); notificationRetries = 0; currentNotification = event.task_id; currentNotificationTurn = event.turn_id ?? null; notificationPending = false; responsePending = true; }
  else if (event.type === 'notification.rejected') {
    if (!notificationPending || pendingNotifications[0] !== event.task_id) return;
    notificationPending = false;
    if (event.reason === 'busy' && notificationRetries < 3) {
      notificationRetries++;
      setTimeout(() => { if (pendingNotifications[0] === event.task_id) announceWhenIdle(); }, 500);
    } else {
      pendingNotifications.shift(); notificationRetries = 0;
      log('Could not speak the completed task notification; its result remains in the conversation.');
      announceWhenIdle();
    }
  }
  else if (event.type === 'task.error' || event.type === 'error') { if (event.type === 'task.error') { activeTaskIds.delete(event.task_id); cancellationRequested.delete(event.task_id); refreshTaskButton(); } if (event.type === 'error' && event.turn_id && event.turn_id === activeSpeechTurn) stopPlayback(); responsePending = false; notificationPending = false; status(event.message); log(`Error: ${event.message}`); announceWhenIdle(); }
  else if (event.type === 'speech.start') { outputRate = event.sample_rate; speechOpen = true; speechHasAudio = false; playbackGapCount = 0; playbackGapMaxMs = 0; activeSpeechTurn = event.turn_id ?? null; if ($('speaker-safe').checked) send(JSON.stringify({ type: 'audio.reset' })); }
  else if (event.type === 'speech.end') { if (playbackGapCount) log(`Playback detected ${playbackGapCount} gap(s) over 30 ms; longest approximately ${Math.round(playbackGapMaxMs)} ms.`); speechOpen = false; activeSpeechTurn = null; if (!playbackSources.size) { currentNotification = null; currentNotificationTurn = null; } responsePending = false; announceWhenIdle(); }
  else if (event.type === 'speech.cancelled') {
    if (event.turn_id && event.turn_id !== activeSpeechTurn && event.turn_id !== currentNotificationTurn) return;
    deferCurrentNotification(); stopPlayback();
  }
}
function connectGateway() {
  const socket = memoryToken ? new WebSocket(`ws://${location.host}/voice`, ['assistai-v1', `resume.${memoryToken}`]) : new WebSocket(`ws://${location.host}/voice`);
  ws = socket;
  socket.binaryType = 'arraybuffer';
  socket.onopen = () => { if (socket !== ws) return; status('Connected. Waiting for speech recognition.'); };
  socket.onerror = () => { if (socket === ws) status('Gateway connection failed.'); };
  socket.onmessage = event => { if (socket === ws) handleSocketMessage(event); };
  socket.onclose = event => {
    if (socket !== ws) return;
    asrReady = false; spokenImageAvailable = false; speechReviewAvailable = false; pendingReviewId = null; $('speech-review').disabled = true; taskCancelAvailable = false; activeTaskIds.clear(); cancellationRequested.clear(); clearApproval(); $('approval-safety').textContent = 'Disconnected; task approval protection is unavailable.'; refreshTaskButton(); stopPlayback();
    speaking = false; voiceFrames = 0; silenceFrames = 0; pushToTalkActive = false;
    $('talk').textContent = 'Hold to talk'; $('talk').disabled = true;
    responsePending = false; notificationPending = false; currentNotification = null; currentNotificationTurn = null; pendingNotifications.length = 0;
    latestCompletedTask = null; $('replay-task').disabled = true;
    if (event?.code === 1008) { status('Connection rejected. Check session settings and reload.'); return; }
    const delay = Math.min(1000 * 2 ** Math.min(reconnectAttempts++, 4), 15000);
    status(`Disconnected. Reconnecting in ${delay / 1000} seconds.`);
    setTimeout(() => { if (socket === ws) connectGateway(); }, delay);
  };
}
connectGateway();
$('interrupt').onclick = () => interrupt('manual');
function changeMicrophoneMode() {
  finishPushToTalk();
  speaking = false; voiceFrames = 0; silenceFrames = 0;
  send(JSON.stringify({ type: 'audio.reset' }));
  $('talk').disabled = !$('push-to-talk').checked || !stream?.active || !asrReady;
}
$('push-to-talk').onchange = changeMicrophoneMode;
$('speaker-safe').onchange = changeMicrophoneMode;
function beginPushToTalk() {
  if (pushToTalkActive) return;
  if (pendingReviewId) { status('Send the reviewed transcript or turn off speech review before recording again.'); return; }
  if (!$('push-to-talk').checked || !stream?.active || !asrReady || ws.readyState !== WebSocket.OPEN) return;
  if (speechOpen || playbackSources.size) interrupt('manual');
  send(JSON.stringify({ type: 'audio.reset' }));
  pushToTalkActive = true;
  send(JSON.stringify({ type: 'audio.start' }));
  $('talk').textContent = 'Release to send';
}
$('talk').onpointerdown = event => {
  if (event.button !== 0) return;
  event.preventDefault();
  $('talk').setPointerCapture(event.pointerId);
  beginPushToTalk();
};
$('talk').onpointerup = finishPushToTalk;
$('talk').onpointercancel = finishPushToTalk;
$('talk').onlostpointercapture = finishPushToTalk;
$('talk').onkeydown = event => {
  if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); beginPushToTalk(); }
};
$('talk').onkeyup = event => {
  if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); finishPushToTalk(); }
};
$('talk').onblur = finishPushToTalk;
window.addEventListener('blur', finishPushToTalk);
$('form').onsubmit = async event => {
  event.preventDefault();
  if (ws.readyState !== WebSocket.OPEN) { status('Disconnected. Your message has not been sent.'); return; }
  if (!textInputAvailable) { status('Text and image input are unavailable in native speech mode.'); return; }
  const text = $('text').value.trim(), file = $('image').files?.[0];
  if (!text) return;
  if (pendingReviewId && file) { status('Remove the newly selected image before sending the reviewed transcript.'); return; }
  if (file && (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 1024 * 1024)) { status('Choose a PNG or JPEG image under 1 MiB.'); return; }
  let image;
  if (file) {
    try { image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
    catch { status('Could not read the selected image.'); return; }
  }
  playbackContext ??= new AudioContext(); await playbackContext.resume();
  if (ws.readyState !== WebSocket.OPEN) { status('Disconnected. Your message has not been sent.'); return; }
  interrupt(); responsePending = true;
  send(JSON.stringify(pendingReviewId ? { type: 'speech.review.submit', review_id: pendingReviewId, text } : file ? { type: 'image', text, image } : { type: 'text', text }));
  pendingReviewId = null;
  $('text').value = ''; $('image').value = ''; preparedImage = null; imageVersion++;
};
$('start').onclick = async () => {
  if (!asrReady) { status('Speech recognition is not ready.'); return; }
  try {
    const deviceId = $('microphone-device').value;
    stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: !$('experimental-aec').checked, noiseSuppression: true, autoGainControl: true } });
    void refreshMicrophones();
    const echoSetting = stream.getAudioTracks()[0]?.getSettings().echoCancellation;
    $('echo-status').textContent = echoSetting === undefined
      ? 'Echo cancellation: requested; browser did not report its status.'
      : echoSetting === false
        ? 'Echo cancellation: unavailable or disabled on this microphone.'
        : 'Echo cancellation: enabled by browser (effectiveness depends on your setup).';
    if ($('experimental-aec').checked) {
      playbackContext ??= new AudioContext({ sampleRate: 48000 });
      captureContext = playbackContext;
      if (captureContext.sampleRate !== 48000) throw new Error('Experimental echo filter requires a 48 kHz audio context. Reload and try again.');
    } else { captureContext = new AudioContext(); playbackContext ??= new AudioContext(); }
    await playbackContext.resume();
    await captureContext.audioWorklet.addModule('/capture-worklet.js');
    const lowpass = captureContext.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 7200;
    const microphone = captureContext.createMediaStreamSource(stream);
    // Preserve the start of speech without streaming unbounded idle background audio to ASR.
    let preRoll = [];
    const handleAudio = data => {
      if (!asrReady || ws.readyState !== WebSocket.OPEN || pendingReviewId) { preRoll = []; return; }
      if ($('push-to-talk').checked) {
        preRoll = [];
        if (pushToTalkActive) send(data);
        return;
      }
      // Avoid feeding loudspeaker echo to ASR. Manual interruption immediately reopens the microphone.
      if ($('speaker-safe').checked && (speechOpen || playbackSources.size)) {
        preRoll = []; speaking = false; voiceFrames = 0; silenceFrames = 0;
        return;
      }
      const frame = new Int16Array(data);
      let power = 0; for (const value of frame) power += (value / 32768) ** 2;
      const voice = Math.sqrt(power / frame.length) > detectionThreshold;
      voiceFrames = voice ? voiceFrames + 1 : 0;
      if (!speaking) {
        preRoll.push(data);
        if (preRoll.length > 10) preRoll.shift();
        if (voiceFrames >= 3) {
          speaking = true; silenceFrames = 0;
          if (speechOpen || playbackSources.size) interrupt('voice_activity');
          send(JSON.stringify({ type: 'audio.start' }));
          for (const frame of preRoll) send(frame);
          preRoll = [];
        }
        return;
      }
      send(data);
      silenceFrames = voice ? 0 : silenceFrames + 1;
      if (silenceFrames >= endSilenceFrames) { speaking = false; silenceFrames = 0; responsePending = true; finishAudio(); }
    };
    if ($('experimental-aec').checked) {
      const { createEchoBridge } = await import('/echo-bridge.js');
      const { Decimate48k } = await import('/decimate-48k.js');
      const decimator = new Decimate48k();
      await captureContext.audioWorklet.addModule('/echo-reference-worklet.js');
      const worker = new Worker('/echo-canceller-worker.js');
      let pending = null;
      let filterStarted = false;
      echoBridge = await new Promise((resolve, reject) => {
        let bridge;
        const timeout = setTimeout(() => { bridge?.close(); reject(new Error('Echo filter initialization timed out')); }, 10000);
        bridge = createEchoBridge(worker, {
          onReady: () => { clearTimeout(timeout); resolve(bridge); },
          onError: message => { clearTimeout(timeout); $('speaker-safe').checked = true; if (filterStarted) echoFilterFailed(message); else reject(new Error(message)); },
          onAudio: ({ capture }) => {
            const reduced = decimator.process(capture);
            if (!pending) pending = reduced;
            else { const frame = new Int16Array(320); frame.set(pending); frame.set(reduced, 160); pending = null; handleAudio(frame.buffer); }
          }
        });
      });
      referenceNode = captureNode = new AudioWorkletNode(captureContext, 'echo-reference-processor', { numberOfInputs: 2 });
      captureNode.port.onmessage = ({ data }) => echoBridge?.send(data);
      microphone.connect(lowpass).connect(captureNode, 0, 0);
      filterStarted = true;
      $('echo-status').textContent += ' Experimental playback-reference filter active.';
    } else {
      captureNode = new AudioWorkletNode(captureContext, 'capture-processor');
      microphone.connect(lowpass).connect(captureNode);
      captureNode.port.onmessage = ({ data }) => handleAudio(data);
    }
    // Keep the worklet active without routing the microphone to the speakers.
    const muted = captureContext.createGain(); muted.gain.value = 0; captureNode.connect(muted).connect(captureContext.destination);
    $('experimental-aec').disabled = true;
    $('start').disabled = true; $('stop').disabled = false; $('talk').disabled = !$('push-to-talk').checked; status('Listening in French.');
  } catch (error) { echoBridge?.close(); echoBridge = undefined; referenceNode = undefined; stream?.getTracks().forEach(track => track.stop()); if (captureContext && captureContext !== playbackContext) await captureContext.close(); captureContext = undefined; $('echo-status').textContent = 'Echo cancellation: microphone unavailable.'; status(`Microphone unavailable: ${error.message}`); }
};
$('stop').onclick = async () => {
  finishPushToTalk();
  if (speaking) finishAudio();
  speaking = false; voiceFrames = 0; silenceFrames = 0;
  captureNode?.disconnect(); stream?.getTracks().forEach(track => track.stop());
  echoBridge?.close(); echoBridge = undefined; referenceNode = undefined;
  $('echo-status').textContent = 'Echo cancellation: microphone stopped.';
  if (captureContext && captureContext !== playbackContext) await captureContext.close(); captureContext = undefined;
  $('experimental-aec').disabled = false;
  $('start').disabled = false; $('stop').disabled = true; $('talk').disabled = true; status('Microphone stopped.');
};
