// Experimental local voice gateway: Vosk ASR + local chat completion + Pocket TTS.
// The optional OpenCode adapter delegates work in the background.
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';
import { getServiceStatus } from './service-status.mjs';
import { attachLfmBridge } from './lfm-bridge.mjs';
import { createTaskAdmission } from './task-admission.mjs';
import { buildNativeContext } from './native-context.mjs';
import { buildAgentPrompt } from './agent-context.mjs';
import { resumeSessionId } from './session-resume.mjs';

const port = Number(process.env.ASSISTAI_GATEWAY_PORT ?? 18083);
const asrUrl = process.env.ASSISTAI_ASR_URL ?? 'ws://127.0.0.1:18082/asr';
const llmUrl = process.env.ASSISTAI_LLM_URL ?? 'http://127.0.0.1:18084/v1';
const visionUrl = process.env.ASSISTAI_VISION_URL ?? 'http://127.0.0.1:18080/v1';
const ttsUrl = process.env.ASSISTAI_TTS_URL ?? 'http://127.0.0.1:18081';
const opencodeUrl = process.env.ASSISTAI_OPENCODE_URL;
const lfmRealtimeUrl = process.env.ASSISTAI_LFM_REALTIME_URL;
const lfmTranscriptUrl = process.env.ASSISTAI_LFM_TRANSCRIPT_ASR_URL;
const lfmWorkspaceContext = process.env.ASSISTAI_LFM_WORKSPACE_CONTEXT ?? '';
const sessionResumeEnabled = process.env.ASSISTAI_ENABLE_SESSION_RESUME === '1';
const admitTask = process.env.ASSISTAI_BUDGET_SAMPLE_PATH ? createTaskAdmission({
  samplePath: process.env.ASSISTAI_BUDGET_SAMPLE_PATH,
  baselineSharedBytes: Number(process.env.ASSISTAI_BUDGET_BASELINE_SHARED_BYTES ?? NaN),
  requestedVramBytes: Number(process.env.ASSISTAI_TASK_VRAM_ESTIMATE_BYTES ?? NaN),
  requestedRamBytes: Number(process.env.ASSISTAI_TASK_RAM_ESTIMATE_BYTES ?? NaN),
}) : null;
if (lfmWorkspaceContext.length > 2000) throw new Error('Workspace context is too long');
if (lfmRealtimeUrl && !['ws:', 'wss:'].includes(new URL(lfmRealtimeUrl).protocol)) throw new Error('Realtime URL must use WebSocket');
if (lfmTranscriptUrl && !['ws:', 'wss:'].includes(new URL(lfmTranscriptUrl).protocol)) throw new Error('Transcript URL must use WebSocket');
const configuredDbPath = process.env.ASSISTAI_DB_PATH ?? '.cache/assistant/events.sqlite';
const dbPath = configuredDbPath === ':memory:' ? ':memory:' : resolve(configuredDbPath);
for (const address of [asrUrl, llmUrl, visionUrl, ttsUrl, ...(opencodeUrl ? [opencodeUrl] : []), ...(lfmRealtimeUrl ? [lfmRealtimeUrl] : []), ...(lfmTranscriptUrl ? [lfmTranscriptUrl] : [])]) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(address).hostname)) {
    throw new Error('Prototype providers must bind to a loopback address');
  }
}
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, turn_id TEXT NOT NULL, kind TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)');
const insert = db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?, ?)');
const history = db.prepare("SELECT kind, payload FROM events WHERE session_id = ? AND kind IN ('user.text', 'assistant.text') ORDER BY rowid DESC LIMIT 20");
const taskHistory = db.prepare("SELECT kind, payload FROM events WHERE session_id = ? AND kind IN ('task.started', 'task.completed', 'task.error') ORDER BY rowid DESC LIMIT 20");
const nativeHistory = db.prepare("SELECT kind, payload FROM events WHERE session_id = ? AND kind IN ('user.text', 'assistant.text', 'task.started', 'task.completed', 'task.error') ORDER BY rowid DESC LIMIT 20");
const record = (session, turn, kind, payload) => insert.run(randomUUID(), session, turn, kind, JSON.stringify(payload), new Date().toISOString());
const clientRoot = fileURLToPath(new URL('./client/', import.meta.url));
const aecRoot = fileURLToPath(new URL('../node_modules/@ennuicastr/webrtcaec3.js/dist/', import.meta.url));
const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/client.js', ['client.js', 'text/javascript; charset=utf-8']],
  ['/capture-worklet.js', ['capture-worklet.js', 'text/javascript; charset=utf-8']],
  ['/echo-reference-worklet.js', ['echo-reference-worklet.js', 'text/javascript; charset=utf-8']],
  ['/echo-canceller-worker.js', ['echo-canceller-worker.js', 'text/javascript; charset=utf-8']],
  ['/echo-bridge.js', ['echo-bridge.js', 'text/javascript; charset=utf-8']],
  ['/decimate-48k.js', ['decimate-48k.js', 'text/javascript; charset=utf-8']],
]);
const aecFiles = new Map([
  ['/aec3/webrtcaec3-0.3.0.js', ['webrtcaec3-0.3.0.js', 'text/javascript; charset=utf-8']],
  ['/aec3/webrtcaec3-0.3.0.wasm', ['webrtcaec3-0.3.0.wasm', 'application/wasm']],
]);
const server = http.createServer(async (req, res) => {
  if (req.url === '/health') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ status: 'running', mode: 'experimental', history_storage: dbPath === ':memory:' ? 'volatile' : 'file', session_resume_enabled: sessionResumeEnabled }));
  if (req.method === 'GET' && req.url === '/services') {
    const services = await getServiceStatus({ voiceUrl: lfmRealtimeUrl ? `${new URL(lfmRealtimeUrl).protocol === 'wss:' ? 'https:' : 'http:'}//${new URL(lfmRealtimeUrl).host}/v1` : llmUrl, asrUrl, ttsUrl, opencodeUrl, nativeSpeech: Boolean(lfmRealtimeUrl), nativeTranscriptUrl: lfmTranscriptUrl });
    return res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ services }));
  }
  const file = staticFiles.get(req.url) ?? aecFiles.get(req.url);
  if (req.method === 'GET' && file) {
    try { return res.writeHead(200, { 'content-type': file[1], 'cache-control': 'no-store' }).end(await readFile(resolve(aecFiles.has(req.url) ? aecRoot : clientRoot, file[0]))); }
    catch { return res.writeHead(500).end('Client unavailable'); }
  }
  res.writeHead(404).end();
});
const wss = new WebSocketServer({ server, path: '/voice', maxPayload: 1500 * 1024 });
const activeResumeSessions = new Set();
wss.on('connection', (client, req) => {
  if (req.headers.origin) {
    try {
      const origin = new URL(req.headers.origin);
      if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname) || Number(origin.port) !== port) throw new Error();
    } catch { client.close(1008, 'Origin not allowed'); return; }
  }
  let resumedSession;
  try { resumedSession = resumeSessionId(req.headers['sec-websocket-protocol'], sessionResumeEnabled); }
  catch { client.close(1008, 'Session resume unavailable'); return; }
  if (resumedSession && activeResumeSessions.has(resumedSession)) { client.close(1008, 'Session already connected'); return; }
  if (resumedSession) {
    activeResumeSessions.add(resumedSession);
    client.once('close', () => activeResumeSessions.delete(resumedSession));
  }
  const session = resumedSession ?? randomUUID();
  const asr = lfmRealtimeUrl ? null : new WebSocket(asrUrl);
  let active;
  let segments = [];
  let waitingForFinal = false;
  const runningTasks = new Map();
  const completedTasks = new Map();
  const send = (value) => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(value)); };
  send({ type: 'session.capabilities', mode: lfmRealtimeUrl ? 'native-speech' : 'cascade', text_input: !lfmRealtimeUrl, image_input: !lfmRealtimeUrl, input_transcript: !lfmRealtimeUrl || Boolean(lfmTranscriptUrl) });
  const tool = { type: 'function', function: { name: 'delegate_task', description: 'Delegate a substantive coding or research task to the local OpenCode agent in the background. Do not use for ordinary conversation.', parameters: { type: 'object', properties: { task: { type: 'string', description: 'The complete task for the agent' } }, required: ['task'] } } };
  const requestJson = async (url, options = {}) => {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`OpenCode HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
  const launchTask = async (task, turnId, { reuseCompleted = false, rerun = false } = {}) => {
    if (!opencodeUrl) throw new Error('OpenCode is not configured');
    if (typeof task !== 'string' || !task.trim() || task.length > 4000) throw new Error('Invalid agent task');
    const taskKey = task.trim().toLocaleLowerCase('fr').replace(/\s+/g, ' ').replace(/[.!?]+$/g, '');
    const prior = runningTasks.get(taskKey);
    if (prior) return { accepted: true, already_running: true, ...(prior.id ? { task_id: prior.id } : {}) };
    const completed = completedTasks.get(taskKey);
    if (reuseCompleted && !rerun && completed) {
      const event = { task_id: completed.task_id, task };
      record(session, turnId, 'task.reused', event);
      send({ type: 'task.reused', turn_id: turnId, ...event });
      return { accepted: true, already_completed: true, result: completed.text.slice(0, 1000) };
    }
    const reservation = {};
    runningTasks.set(taskKey, reservation);
    const headers = { 'content-type': 'application/json' };
    let agentSession;
    let releaseResource;
    let promptAttempted = false;
    try {
      if (admitTask) {
        try { releaseResource = await admitTask(); }
        catch (error) {
          const event = { task, message: String(error) };
          record(session, turnId, 'task.rejected', event);
          send({ type: 'task.rejected', turn_id: turnId, ...event });
          throw error;
        }
      }
      agentSession = await requestJson(`${opencodeUrl}/session`, { method: 'POST', headers, body: JSON.stringify({ title: task.slice(0, 100) }) });
      promptAttempted = true;
      const agentPrompt = buildAgentPrompt(task, nativeHistory.all(session).reverse());
      await requestJson(`${opencodeUrl}/session/${encodeURIComponent(agentSession.id)}/prompt_async`, { method: 'POST', headers, body: JSON.stringify({ parts: [{ type: 'text', text: agentPrompt }] }) });
      reservation.id = agentSession.id;
    } catch (error) {
      if (!promptAttempted) releaseResource?.();
      runningTasks.delete(taskKey);
      throw error;
    }
    const event = { task_id: agentSession.id, task };
    record(session, turnId, 'task.started', event);
    send({ type: 'task.started', turn_id: turnId, ...event });
    void (async () => {
      let confirmedTerminal = false;
      try {
        for (let i = 0; i < 300; i++) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          const status = await requestJson(`${opencodeUrl}/session/status`);
          const messages = await requestJson(`${opencodeUrl}/session/${encodeURIComponent(agentSession.id)}/message`);
          const last = [...messages].reverse().find(item => item.info?.role === 'assistant' && item.info?.time?.completed);
          if (!status[agentSession.id] && last) {
            const text = (last.parts ?? []).filter(part => part.type === 'text' && !part.synthetic).map(part => part.text).join('\n').trim();
            if (last.info.error) { confirmedTerminal = true; throw new Error('Agent reported an error'); }
            if (!text) continue;
            confirmedTerminal = true;
            const result = { task_id: agentSession.id, text: text.slice(0, 8000) };
            if (completedTasks.size >= 100) completedTasks.delete(completedTasks.keys().next().value);
            completedTasks.set(taskKey, result);
            record(session, turnId, 'task.completed', result);
            send({ type: 'task.completed', ...result });
            return;
          }
        }
        throw new Error('Agent task status timed out');
      } catch (error) {
        const result = { task_id: agentSession.id, message: String(error) };
        record(session, turnId, 'task.error', result);
        send({ type: 'task.error', ...result });
      } finally {
        if (confirmedTerminal) releaseResource?.();
        runningTasks.delete(taskKey);
      }
    })();
    return { accepted: true, task_id: agentSession.id };
  };
  if (lfmRealtimeUrl) {
    attachLfmBridge(client, { url: lfmRealtimeUrl, transcriptUrl: lfmTranscriptUrl, launchTask, makeTurnId: randomUUID, workspaceContext: lfmWorkspaceContext,
      recordEvent: event => record(session, event.turn_id, event.type, { text: event.text, source: event.source ?? 'native-model' }),
      getContext: () => buildNativeContext(nativeHistory.all(session).reverse()),
      getCompletedTask: taskId => {
      if (typeof taskId !== 'string') return null;
      const row = taskHistory.all(session).find(item => item.kind === 'task.completed' && JSON.parse(item.payload).task_id === taskId);
      return row ? JSON.parse(row.payload).text : null;
    } });
    return;
  }
  const cancel = (reason = 'new_turn') => {
    if (!active) return;
    const previous = active;
    active = undefined;
    previous.controller.abort();
    record(session, previous.id, 'speech.cancelled', { reason });
    send({ type: 'speech.cancelled', turn_id: previous.id, reason });
  };
  const streamSpeech = async (text, turn) => {
    const form = new FormData();
    form.set('text', text);
    const speech = await fetch(`${ttsUrl}/tts`, { method: 'POST', body: form, signal: turn.controller.signal });
    if (!speech.ok || !speech.body) throw new Error(`TTS HTTP ${speech.status}`);
    let header = Buffer.alloc(0), started = false;
    for await (const bytes of speech.body) {
      if (active !== turn) return;
      let chunk = Buffer.from(bytes);
      if (!started) {
        header = Buffer.concat([header, chunk]);
        if (header.length < 44) continue;
        if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE' || header.toString('ascii', 36, 40) !== 'data' || header.readUInt16LE(20) !== 1 || header.readUInt16LE(22) !== 1 || header.readUInt16LE(34) !== 16) throw new Error('Unsupported TTS WAV format');
        send({ type: 'speech.start', turn_id: turn.id, sample_rate: header.readUInt32LE(24), encoding: 'pcm_s16le' });
        chunk = header.subarray(44);
        started = true;
      }
      if (chunk.length && client.readyState === WebSocket.OPEN) client.send(chunk, { binary: true });
    }
    if (!started) throw new Error('TTS returned no WAV audio');
    if (active === turn) { active = undefined; send({ type: 'speech.end', turn_id: turn.id }); }
  };
  const respond = async (text) => {
    cancel();
    const turn = { id: randomUUID(), controller: new AbortController() };
    active = turn;
    record(session, turn.id, 'user.text', { text });
    send({ type: 'user.text', turn_id: turn.id, text });
    try {
      const messages = [];
      for (const row of history.all(session).reverse()) {
        const message = { role: row.kind === 'user.text' ? 'user' : 'assistant', content: JSON.parse(row.payload).text };
        if (message.role === 'user' && messages.at(-1)?.role === 'user') messages[messages.length - 1] = message;
        else if (message.role === 'user' || messages.at(-1)?.role === 'user') messages.push(message);
      }
      const tasks = new Map();
      for (const row of taskHistory.all(session).reverse()) {
        const payload = JSON.parse(row.payload);
        tasks.set(payload.task_id, { ...tasks.get(payload.task_id), ...payload, status: row.kind });
      }
      const taskSummary = [...tasks.values()].map(task => `${task.task_id}: ${task.status}${task.task ? `; request: ${task.task}` : ''}${task.text ? `; result: ${task.text.slice(0, 500)}` : ''}`).join('\n');
      messages.unshift({ role: 'system', content: `You are a concise local voice assistant. Reply in French. Delegate substantive work using the available tool. Never claim an action was performed unless its result is available. Answer the most recent user message; do not repeat or re-delegate tasks already listed below. Task state:\n${taskSummary || 'No tasks.'}` });
      const complete = async (withTools) => {
        const response = await fetch(`${llmUrl}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: turn.controller.signal, body: JSON.stringify({ model: 'local', messages, ...(withTools ? { tools: [tool], tool_choice: 'auto' } : {}), max_tokens: 256, temperature: 0.3, chat_template_kwargs: { enable_thinking: false } }) });
        if (!response.ok) throw new Error(`LLM HTTP ${response.status}`);
        return (await response.json()).choices?.[0]?.message;
      };
      let message = await complete(Boolean(opencodeUrl));
      if (active !== turn) return;
      if (message?.tool_calls?.length) {
        messages.push(message);
        let resourceRejected = false;
        for (const call of message.tool_calls) {
          let result;
          try {
            if (call.function?.name !== 'delegate_task') throw new Error('Unknown tool');
            const args = JSON.parse(call.function.arguments);
            result = await launchTask(args.task, turn.id);
          } catch (error) { if (error.code === 'RESOURCE_ADMISSION_REJECTED') resourceRejected = true; result = { accepted: false, error: String(error) }; }
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
        }
        if (active !== turn) return;
        message = resourceRejected ? { content: 'La t\u00e2che a \u00e9t\u00e9 refus\u00e9e car les ressources disponibles ne peuvent pas \u00eatre v\u00e9rifi\u00e9es ou sont insuffisantes.' } : await complete(false);
      }
      const answer = message?.content?.trim();
      if (!answer) throw new Error('LLM returned no spoken text');
      if (active !== turn) return;
      record(session, turn.id, 'assistant.text', { text: answer });
      send({ type: 'assistant.text', turn_id: turn.id, text: answer });
      await streamSpeech(answer, turn);
    } catch (error) {
      if (active === turn) { active = undefined; send({ type: 'error', turn_id: turn.id, message: String(error) }); }
    }
  };
  const respondToImage = async (text, image) => {
    cancel();
    const turn = { id: randomUUID(), controller: new AbortController() };
    active = turn;
    record(session, turn.id, 'user.text', { text: `[Image] ${text}` });
    send({ type: 'user.text', turn_id: turn.id, text: `[Image] ${text}` });
    try {
      const response = await fetch(`${visionUrl}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: turn.controller.signal, body: JSON.stringify({ model: 'local', messages: [{ role: 'system', content: 'Answer the user in concise French. Describe only what you can see.' }, { role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: image } }] }], max_tokens: 160, temperature: 0.2, chat_template_kwargs: { enable_thinking: false } }) });
      if (!response.ok) throw Error(`Vision model HTTP ${response.status}`);
      const answer = (await response.json()).choices?.[0]?.message?.content?.trim();
      if (!answer) throw Error('Vision model returned no answer');
      if (active !== turn) return;
      record(session, turn.id, 'assistant.text', { text: answer });
      send({ type: 'assistant.text', turn_id: turn.id, text: answer });
      await streamSpeech(answer, turn);
    } catch (error) { if (active === turn) { active = undefined; send({ type: 'error', turn_id: turn.id, message: String(error) }); } }
  };
  asr.on('open', () => send({ type: 'asr.connected', session_id: session }));
  asr.on('message', data => {
    try {
      const event = JSON.parse(data.toString());
      send({ type: `asr.${event.type}`, text: event.text });
      if (event.type === 'segment' && event.text) segments.push(event.text);
      if (event.type === 'final' && waitingForFinal) {
        waitingForFinal = false;
        if (event.text) segments.push(event.text);
        const text = segments.join(' ').trim();
        segments = [];
        if (text) void respond(text);
        else send({ type: 'asr.empty' });
      }
    } catch { send({ type: 'error', message: 'Invalid ASR response' }); }
  });
  asr.on('error', () => send({ type: 'error', message: 'ASR connection failed' }));
  client.on('message', (data, binary) => {
    if (binary) { if (asr.readyState === WebSocket.OPEN && !waitingForFinal) asr.send(data, { binary: true }); return; }
    let event;
    try { event = JSON.parse(data.toString()); } catch { client.close(1003, 'Invalid JSON'); return; }
    if (event.type === 'interrupt') { cancel(event.reason === 'voice_activity' ? 'voice_activity' : 'manual'); return; }
    if (event.type === 'notification.speak' && typeof event.task_id === 'string') {
      const exists = taskHistory.all(session).some(row => row.kind === 'task.completed' && JSON.parse(row.payload).task_id === event.task_id);
      if (!exists || active || waitingForFinal) { send({ type: 'notification.rejected', task_id: event.task_id }); return; }
      const turn = { id: randomUUID(), controller: new AbortController() };
      active = turn;
      send({ type: 'notification.started', task_id: event.task_id, turn_id: turn.id });
      void streamSpeech('La tâche en arrière-plan est terminée. Le résultat est affiché.', turn).catch(error => {
        if (active === turn) { active = undefined; send({ type: 'error', turn_id: turn.id, message: String(error) }); }
      });
      return;
    }
    if (event.type === 'audio.reset' && !waitingForFinal && asr.readyState === WebSocket.OPEN) { segments = []; asr.send(JSON.stringify({ type: 'reset' })); return; }
    if (event.type === 'audio.end' && !waitingForFinal && asr.readyState === WebSocket.OPEN) { waitingForFinal = true; asr.send(JSON.stringify({ type: 'end' })); return; }
    if (event.type === 'image') {
      const match = typeof event.image === 'string' && /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(event.image);
      const bytes = match ? Buffer.from(match[2], 'base64') : Buffer.alloc(0);
      const signature = match && (match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255);
      if (!signature || bytes.length > 1024 * 1024 || typeof event.text !== 'string' || !event.text.trim() || event.text.trim().length > 4000) { send({ type: 'error', message: 'Choose a PNG or JPEG image under 1 MiB and provide a question.' }); return; }
      void respondToImage(event.text.trim(), event.image);
      return;
    }
    if (event.type === 'text' && typeof event.text === 'string' && event.text.trim().length <= 4000 && event.text.trim()) { void respond(event.text.trim()); return; }
  });
  client.on('close', () => { cancel('disconnected'); asr.close(); });
});
server.listen(port, '127.0.0.1', () => console.log(`Experimental voice gateway: http://127.0.0.1:${port}`));
