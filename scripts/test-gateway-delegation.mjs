// Read-only end-to-end probe against a gateway configured with OpenCode.
import WebSocket from 'ws';

const socket = new WebSocket(process.env.ASSISTAI_TEST_VOICE_URL ?? 'ws://127.0.0.1:18083/voice');
const start = performance.now();
const events = [];
let audioBytes = 0;
let taskCompleted, notificationStarted = false, notificationAudioBytes = 0;
const timeout = setTimeout(() => { console.error('Timed out waiting for agent task'); process.exitCode = 1; socket.close(); }, 120_000);
socket.on('open', () => socket.send(JSON.stringify({ type: 'text', text: 'Délègue à ton agent la tâche suivante : lire fixture.txt et donner le mot secret.' })));
socket.on('message', (data, binary) => {
  if (binary) { audioBytes += data.length; if (notificationStarted) notificationAudioBytes += data.length; return; }
  const event = JSON.parse(data.toString());
  events.push({ elapsedMs: Math.round(performance.now() - start), ...event });
  if (event.type === 'task.started') {
    // The follow-up must be answered without waiting for the agent task.
    socket.send(JSON.stringify({ type: 'text', text: 'Dis-moi bonjour en français.' }));
  }
  if (event.type === 'error' || event.type === 'task.error') { console.error(JSON.stringify(event)); process.exitCode = 1; }
  if (event.type === 'notification.started') notificationStarted = true;
  if (event.type === 'task.completed' && process.env.ASSISTAI_TEST_NOTIFICATION === '1') {
    taskCompleted = event;
    socket.send(JSON.stringify({ type: 'notification.speak', task_id: event.task_id }));
    return;
  }
  if ((notificationStarted && event.type === 'speech.end') || event.type === 'task.error' || (event.type === 'task.completed' && process.env.ASSISTAI_TEST_NOTIFICATION !== '1')) {
    clearTimeout(timeout);
    console.log(JSON.stringify({ events, audioBytes }));
    const tasksStarted = events.filter(item => item.type === 'task.started');
    const reply = events.find(item => item.type === 'assistant.text');
    const completion = events.find(item => item.type === 'task.completed') ?? event;
    if (!completion.text?.includes('BLUEBIRD') || tasksStarted.length !== 1 || !reply || reply.elapsedMs >= completion.elapsedMs || audioBytes === 0 || (taskCompleted && notificationAudioBytes === 0)) process.exitCode = 1;
    socket.close();
  }
});
socket.on('error', error => { clearTimeout(timeout); console.error(error); process.exitCode = 1; });
