// Run only against an isolated gateway configured with a deliberately missing budget sample.
import WebSocket from 'ws';
const url = process.env.ASSISTAI_TEST_VOICE_URL;
if (!url) throw Error('Set ASSISTAI_TEST_VOICE_URL to the isolated gateway');
const socket = new WebSocket(url);
const events = [];
let audioBytes = 0;
const timeout = setTimeout(() => { console.error('Timed out'); process.exitCode = 1; socket.close(); }, 30000);
socket.on('open', () => socket.send(JSON.stringify({ type: 'text', text: 'D\u00e9l\u00e8gue \u00e0 ton agent la t\u00e2che suivante : lire fixture.txt et donner le mot secret.' })));
socket.on('message', (data, binary) => {
  if (binary) { audioBytes += data.length; return; }
  const event = JSON.parse(data.toString());
  events.push(event);
  if (event.type === 'error') { clearTimeout(timeout); console.error(JSON.stringify(event)); process.exitCode = 1; socket.close(); }
  if (event.type === 'speech.end') {
    clearTimeout(timeout);
    const rejected = events.find(e => e.type === 'task.rejected');
    const started = events.some(e => e.type === 'task.started');
    const answer = events.find(e => e.type === 'assistant.text');
    console.log(JSON.stringify({ rejected: rejected?.message, started, answer: answer?.text, audioBytes }));
    if (!rejected || started || !answer?.text.includes('ressources disponibles') || !audioBytes) process.exitCode = 1;
    socket.close();
  }
});
socket.on('error', error => { clearTimeout(timeout); console.error(error); process.exitCode = 1; });
