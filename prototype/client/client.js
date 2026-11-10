const $ = id => document.getElementById(id);
const status = text => { $('status').textContent = text; };
const log = text => { $('log').textContent += `${text}\n`; };
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
const ws = new WebSocket(`ws://${location.host}/voice`);
ws.binaryType = 'arraybuffer';
let captureContext, playbackContext, stream, captureNode, echoBridge, referenceNode;
let speechOpen = false, speaking = false, voiceFrames = 0, silenceFrames = 0;
let playbackTime = 0, playbackSources = new Set(), carry = null;
let asrReady = false;
let pushToTalkActive = false;
let responsePending = false, notificationPending = false, currentNotification = null;
const pendingNotifications = [];
let detectionThreshold = Number($('noise-threshold').value) / 100;
$('noise-threshold').oninput = event => {
  detectionThreshold = Number(event.target.value) / 100;
  $('noise-threshold-value').textContent = `${Number(event.target.value).toFixed(1)}%`;
};
const send = data => { if (ws.readyState === WebSocket.OPEN) ws.send(data); };
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
  send(JSON.stringify({ type: 'audio.end' }));
}
function stopPlayback() {
  speechOpen = false;
  for (const source of playbackSources) { try { source.stop(); } catch {} }
  playbackSources.clear();
  playbackTime = 0;
  carry = null;
}
function interrupt(reason = 'manual') {
  const wasPlaying = speechOpen || playbackSources.size > 0;
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
  playbackTime = Math.max(playbackTime, playbackContext.currentTime + 0.04);
  source.start(playbackTime); playbackTime += buffer.duration;
  playbackSources.add(source); source.onended = () => { playbackSources.delete(source); announceWhenIdle(); };
}
let outputRate = 24000;
ws.onopen = () => status('Connected. Waiting for speech recognition.');
ws.onclose = () => { asrReady = false; status('Disconnected. Reload after starting the local services.'); stopPlayback(); };
ws.onerror = () => status('Gateway connection failed.');
ws.onmessage = ({ data }) => {
  if (data instanceof ArrayBuffer) { play(data, outputRate); return; }
  const event = JSON.parse(data);
  if (event.type === 'asr.ready') { asrReady = true; status('Ready. Start the microphone to speak French.'); }
  else if (event.type === 'asr.empty') { responsePending = false; announceWhenIdle(); }
  else if (event.type === 'asr.partial') $('partial').textContent = event.text ?? '';
  else if (event.type === 'user.text') { $('partial').textContent = ''; log(`You: ${event.text}`); }
  else if (event.type === 'assistant.text') log(`Assistant: ${event.text}`);
  else if (event.type === 'task.started') log(`Agent started: ${event.task}`);
  else if (event.type === 'task.completed') { log(`Agent completed: ${event.text}`); pendingNotifications.push(event.task_id); announceWhenIdle(); }
  else if (event.type === 'notification.started') { if (pendingNotifications[0] === event.task_id) pendingNotifications.shift(); currentNotification = event.task_id; notificationPending = false; responsePending = true; }
  else if (event.type === 'notification.rejected') { notificationPending = false; }
  else if (event.type === 'task.error' || event.type === 'error') { responsePending = false; notificationPending = false; status(event.message); log(`Error: ${event.message}`); announceWhenIdle(); }
  else if (event.type === 'speech.start') { outputRate = event.sample_rate; speechOpen = true; if ($('speaker-safe').checked) send(JSON.stringify({ type: 'audio.reset' })); }
  else if (event.type === 'speech.end') { speechOpen = false; currentNotification = null; responsePending = false; announceWhenIdle(); }
  else if (event.type === 'speech.cancelled') { if (currentNotification) pendingNotifications.unshift(currentNotification); currentNotification = null; stopPlayback(); }
};
$('interrupt').onclick = () => interrupt('manual');
function changeMicrophoneMode() {
  finishPushToTalk();
  speaking = false; voiceFrames = 0; silenceFrames = 0;
  send(JSON.stringify({ type: 'audio.reset' }));
  $('talk').disabled = !$('push-to-talk').checked || !stream?.active;
}
$('push-to-talk').onchange = changeMicrophoneMode;
$('speaker-safe').onchange = changeMicrophoneMode;
function beginPushToTalk() {
  if (pushToTalkActive) return;
  if (!$('push-to-talk').checked || !stream?.active) return;
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
  const text = $('text').value.trim(), file = $('image').files?.[0];
  if (!text) return;
  if (file && (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 1024 * 1024)) { status('Choose a PNG or JPEG image under 1 MiB.'); return; }
  let image;
  if (file) {
    try { image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); }); }
    catch { status('Could not read the selected image.'); return; }
  }
  playbackContext ??= new AudioContext(); await playbackContext.resume(); interrupt(); responsePending = true;
  send(JSON.stringify(file ? { type: 'image', text, image } : { type: 'text', text }));
  $('text').value = ''; $('image').value = '';
};
$('start').onclick = async () => {
  if (!asrReady) { status('Speech recognition is not ready.'); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: !$('experimental-aec').checked, noiseSuppression: true, autoGainControl: true } });
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
    const handleAudio = data => {
      if ($('push-to-talk').checked) {
        if (pushToTalkActive) send(data);
        return;
      }
      // Avoid feeding loudspeaker echo to ASR. Manual interruption immediately reopens the microphone.
      if ($('speaker-safe').checked && (speechOpen || playbackSources.size)) {
        speaking = false; voiceFrames = 0; silenceFrames = 0;
        return;
      }
      const frame = new Int16Array(data);
      let power = 0; for (const value of frame) power += (value / 32768) ** 2;
      const voice = Math.sqrt(power / frame.length) > detectionThreshold;
      voiceFrames = voice ? voiceFrames + 1 : 0;
      if (!speaking && voiceFrames >= 3) { speaking = true; silenceFrames = 0; if (speechOpen || playbackSources.size) interrupt('voice_activity'); send(JSON.stringify({ type: 'audio.start' })); }
      if (speaking) {
        silenceFrames = voice ? 0 : silenceFrames + 1;
        if (silenceFrames >= 35) { speaking = false; silenceFrames = 0; responsePending = true; send(JSON.stringify({ type: 'audio.end' })); }
      }
      send(data);
    };
    if ($('experimental-aec').checked) {
      const { createEchoBridge } = await import('/echo-bridge.js');
      const { Decimate48k } = await import('/decimate-48k.js');
      const decimator = new Decimate48k();
      await captureContext.audioWorklet.addModule('/echo-reference-worklet.js');
      const worker = new Worker('/echo-canceller-worker.js');
      let pending = null;
      echoBridge = await new Promise((resolve, reject) => {
        let bridge;
        const timeout = setTimeout(() => { bridge?.close(); reject(new Error('Echo filter initialization timed out')); }, 10000);
        bridge = createEchoBridge(worker, {
          onReady: () => { clearTimeout(timeout); resolve(bridge); },
          onError: message => { clearTimeout(timeout); $('speaker-safe').checked = true; status(`Echo filter stopped: ${message}. Restart the microphone.`); stream?.getTracks().forEach(track => track.stop()); captureNode?.disconnect(); reject(new Error(message)); },
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
  if (speaking) send(JSON.stringify({ type: 'audio.end' }));
  speaking = false; voiceFrames = 0; silenceFrames = 0;
  captureNode?.disconnect(); stream?.getTracks().forEach(track => track.stop());
  echoBridge?.close(); echoBridge = undefined; referenceNode = undefined;
  $('echo-status').textContent = 'Echo cancellation: microphone stopped.';
  if (captureContext && captureContext !== playbackContext) await captureContext.close(); captureContext = undefined;
  $('experimental-aec').disabled = false;
  $('start').disabled = false; $('stop').disabled = true; $('talk').disabled = true; status('Microphone stopped.');
};
