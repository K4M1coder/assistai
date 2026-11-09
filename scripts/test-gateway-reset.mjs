import WebSocket from 'ws';

const socket = new WebSocket('ws://127.0.0.1:18083/voice');
const timeout = setTimeout(() => { console.error('ASR reset timed out'); process.exitCode = 1; socket.close(); }, 10_000);
socket.on('message', (data, binary) => {
  if (binary) return;
  const event = JSON.parse(data.toString());
  if (event.type === 'asr.ready') socket.send(JSON.stringify({ type: 'audio.reset' }));
  if (event.type === 'asr.reset') { clearTimeout(timeout); console.log('ASR reset acknowledged'); socket.close(); }
  if (event.type === 'error') { clearTimeout(timeout); console.error(event.message); process.exitCode = 1; socket.close(); }
});
socket.on('error', error => { clearTimeout(timeout); console.error(error); process.exitCode = 1; });
