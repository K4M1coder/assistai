// Read-only protocol probe: no session configuration, audio, or inference request.
import WebSocket from 'ws';

const socket = new WebSocket('ws://127.0.0.1:18084/v1/realtime');
const timer = setTimeout(() => { console.error('WebSocket handshake timed out'); socket.terminate(); process.exitCode = 1; }, 3000);
socket.on('open', () => { console.log('WebSocket handshake accepted'); socket.close(); });
socket.on('unexpected-response', (_request, response) => {
  console.error(`Unexpected HTTP status: ${response.statusCode}`);
  response.resume(); clearTimeout(timer); process.exitCode = 1;
});
socket.on('close', code => { clearTimeout(timer); console.log(`WebSocket close code: ${code}`); });
socket.on('error', error => { clearTimeout(timer); console.error(error.message); process.exitCode = 1; });
