// Passive session probe: no session configuration, audio, or inference request.
import WebSocket from 'ws';

const socket = new WebSocket('ws://127.0.0.1:18084/v1/realtime');
const timer = setTimeout(() => { console.error('WebSocket session event timed out'); socket.terminate(); process.exitCode = 1; }, 3000);
socket.on('open', () => { console.log('WebSocket handshake accepted'); });
socket.on('message', data => {
  try {
    const event = JSON.parse(data.toString());
    if (event.type !== 'session.created') { console.error(`Unexpected event: ${event.type}; code: ${event.error?.code ?? 'unavailable'}`); process.exitCode = 1; socket.close(); return; }
    const inputRate = event.session?.audio?.input?.format?.rate ?? null;
    const outputRate = event.session?.audio?.output?.format?.rate ?? null;
    console.log(JSON.stringify({ event: event.type, inputRate, outputRate }));
    socket.close();
  } catch { console.error('Invalid session event'); process.exitCode = 1; socket.close(); }
});
socket.on('unexpected-response', (_request, response) => {
  console.error(`Unexpected HTTP status: ${response.statusCode}`);
  response.resume(); clearTimeout(timer); process.exitCode = 1;
});
socket.on('close', code => { clearTimeout(timer); console.log(`WebSocket close code: ${code}`); });
socket.on('error', error => { clearTimeout(timer); console.error(error.message); process.exitCode = 1; });
