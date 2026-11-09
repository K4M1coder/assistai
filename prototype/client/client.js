const $ = id => document.getElementById(id);
const status = text => { $('status').textContent = text; };
const log = text => { $('log').textContent += `${text}\n`; };
const ws = new WebSocket(`ws://${location.host}/voice`);
ws.binaryType = 'arraybuffer';
let captureContext, playbackContext, stream, captureNode;
let speechOpen = false, speaking = false, voiceFrames = 0, silenceFrames = 0;
let playbackTime = 0, playbackSources = new Set(), carry = null;
let asrReady = false;
const send = data => { if (ws.readyState === WebSocket.OPEN) ws.send(data); };
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
  playbackTime = Math.max(playbackTime, playbackContext.currentTime + 0.04);
  source.start(playbackTime); playbackTime += buffer.duration;
  playbackSources.add(source); source.onended = () => playbackSources.delete(source);
}
let outputRate = 24000;
ws.onopen = () => status('Connected. Waiting for speech recognition.');
ws.onclose = () => { asrReady = false; status('Disconnected. Reload after starting the local services.'); stopPlayback(); };
ws.onerror = () => status('Gateway connection failed.');
ws.onmessage = ({ data }) => {
  if (data instanceof ArrayBuffer) { play(data, outputRate); return; }
  const event = JSON.parse(data);
  if (event.type === 'asr.ready') { asrReady = true; status('Ready. Start the microphone to speak French.'); }
  else if (event.type === 'asr.partial') $('partial').textContent = event.text ?? '';
  else if (event.type === 'user.text') { $('partial').textContent = ''; log(`You: ${event.text}`); }
  else if (event.type === 'assistant.text') log(`Assistant: ${event.text}`);
  else if (event.type === 'task.started') log(`Agent started: ${event.task}`);
  else if (event.type === 'task.completed') log(`Agent completed: ${event.text}`);
  else if (event.type === 'task.error' || event.type === 'error') { status(event.message); log(`Error: ${event.message}`); }
  else if (event.type === 'speech.start') { outputRate = event.sample_rate; speechOpen = true; }
  else if (event.type === 'speech.end') { speechOpen = false; }
  else if (event.type === 'speech.cancelled') stopPlayback();
};
$('interrupt').onclick = () => interrupt('manual');
$('form').onsubmit = async event => { event.preventDefault(); const text = $('text').value.trim(); if (text) { playbackContext ??= new AudioContext(); await playbackContext.resume(); interrupt(); send(JSON.stringify({ type: 'text', text })); $('text').value = ''; } };
$('start').onclick = async () => {
  if (!asrReady) { status('Speech recognition is not ready.'); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    captureContext = new AudioContext(); playbackContext ??= new AudioContext();
    await playbackContext.resume();
    await captureContext.audioWorklet.addModule('/capture-worklet.js');
    captureNode = new AudioWorkletNode(captureContext, 'capture-processor');
    const lowpass = captureContext.createBiquadFilter(); lowpass.type = 'lowpass'; lowpass.frequency.value = 7200;
    captureContext.createMediaStreamSource(stream).connect(lowpass).connect(captureNode);
    // Keep the worklet active without routing the microphone to the speakers.
    const muted = captureContext.createGain(); muted.gain.value = 0; captureNode.connect(muted).connect(captureContext.destination);
    captureNode.port.onmessage = ({ data }) => {
      const frame = new Int16Array(data);
      let power = 0; for (const value of frame) power += (value / 32768) ** 2;
      const voice = Math.sqrt(power / frame.length) > 0.025;
      voiceFrames = voice ? voiceFrames + 1 : 0;
      if (!speaking && voiceFrames >= 3) { speaking = true; silenceFrames = 0; if (speechOpen || playbackSources.size) interrupt('voice_activity'); }
      if (speaking) {
        silenceFrames = voice ? 0 : silenceFrames + 1;
        if (silenceFrames >= 35) { speaking = false; silenceFrames = 0; send(JSON.stringify({ type: 'audio.end' })); }
      }
      send(data);
    };
    $('start').disabled = true; $('stop').disabled = false; status('Listening in French.');
  } catch (error) { stream?.getTracks().forEach(track => track.stop()); await captureContext?.close(); captureContext = undefined; status(`Microphone unavailable: ${error.message}`); }
};
$('stop').onclick = async () => {
  if (speaking) send(JSON.stringify({ type: 'audio.end' }));
  speaking = false; voiceFrames = 0; silenceFrames = 0;
  captureNode?.disconnect(); stream?.getTracks().forEach(track => track.stop());
  await captureContext?.close(); captureContext = undefined;
  $('start').disabled = false; $('stop').disabled = true; status('Microphone stopped.');
};
