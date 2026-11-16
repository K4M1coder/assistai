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
import { normalizeTask, restoreCompletedTasks } from './completed-task-cache.mjs';
import { formatTaskNotification } from './task-notification.mjs';
import { createTaskAdmission } from './task-admission.mjs';
import { buildNativeContext } from './native-context.mjs';
import { buildAgentPrompt } from './agent-context.mjs';
import { resumeSessionId } from './session-resume.mjs';
import { createResourceStatus } from './resource-status.mjs';
import { createPressureDetector } from './resource-pressure.mjs';
import { speechText, visibleAnswer } from './speech-text.mjs';
import { latestCompletedAssistant } from './agent-task-status.mjs';
import { openSharedTaskReservations } from './shared-task-reservations.mjs';
import { createTaskApproval } from './task-approval.mjs';
import { agentProgress } from './agent-progress.mjs';

function validImage(image) {
  const match = typeof image === 'string' && /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  const bytes = match ? Buffer.from(match[2], 'base64') : Buffer.alloc(0);
  return Boolean(match && bytes.length <= 1024 * 1024 && (match[1] === 'png'
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255));
}

const port = Number(process.env.ASSISTAI_GATEWAY_PORT ?? 18083);
const asrUrl = process.env.ASSISTAI_ASR_URL ?? 'ws://127.0.0.1:18082/asr';
const llmUrl = process.env.ASSISTAI_LLM_URL ?? 'http://127.0.0.1:18084/v1';
const visionUrl = process.env.ASSISTAI_VISION_URL ?? 'http://127.0.0.1:18080/v1';
const ttsUrl = process.env.ASSISTAI_TTS_URL ?? 'http://127.0.0.1:18081';
const ttsStallMs = Number(process.env.ASSISTAI_TTS_STALL_MS ?? 15000);
if (!Number.isSafeInteger(ttsStallMs) || ttsStallMs < 100 || ttsStallMs > 120000) throw Error('Invalid TTS inactivity timeout');
const opencodeUrl = process.env.ASSISTAI_OPENCODE_URL;
const workspaceLabel = (process.env.ASSISTAI_WORKSPACE_LABEL ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 300);
const lfmRealtimeUrl = process.env.ASSISTAI_LFM_REALTIME_URL;
const lfmTranscriptUrl = process.env.ASSISTAI_LFM_TRANSCRIPT_ASR_URL;
const lfmWorkspaceContext = process.env.ASSISTAI_LFM_WORKSPACE_CONTEXT ?? '';
const sessionResumeEnabled = process.env.ASSISTAI_ENABLE_SESSION_RESUME === '1';
const admissionConfig = process.env.ASSISTAI_BUDGET_SAMPLE_PATH ? {
  samplePath: process.env.ASSISTAI_BUDGET_SAMPLE_PATH,
  baselineSharedBytes: Number(process.env.ASSISTAI_BUDGET_BASELINE_SHARED_BYTES ?? NaN),
  requestedVramBytes: Number(process.env.ASSISTAI_TASK_VRAM_ESTIMATE_BYTES ?? NaN),
  requestedRamBytes: Number(process.env.ASSISTAI_TASK_RAM_ESTIMATE_BYTES ?? NaN),
} : null;
const sharedReservations = admissionConfig && process.env.ASSISTAI_SHARED_RESERVATIONS_PATH
  ? openSharedTaskReservations(resolve(process.env.ASSISTAI_SHARED_RESERVATIONS_PATH)) : undefined;
const admitTask = admissionConfig ? createTaskAdmission({ ...admissionConfig, sharedReservations }) : null;
const resourceSamplePath = process.env.ASSISTAI_RESOURCE_STATUS_PATH || process.env.ASSISTAI_BUDGET_SAMPLE_PATH;
const getResources = createResourceStatus({ samplePath: resourceSamplePath, admissionEnabled: Boolean(admitTask),
  sharedCoordination: Boolean(sharedReservations),
  taskEstimate: resourceSamplePath === admissionConfig?.samplePath ? admissionConfig : undefined });
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
const taskHistory = db.prepare("SELECT kind, payload FROM events WHERE session_id = ? AND kind IN ('task.started', 'task.progress', 'task.uncertain', 'task.status_restored', 'task.completed', 'task.error') ORDER BY rowid DESC LIMIT 20");
const completedTask = db.prepare("SELECT payload FROM events WHERE session_id = ? AND kind = 'task.completed' AND CASE WHEN json_valid(payload) THEN json_extract(payload, '$.task_id') END = ? ORDER BY rowid DESC LIMIT 1");
const taskSnapshot = db.prepare("SELECT kind, payload, created_at FROM events WHERE session_id = ? AND kind IN ('task.started', 'task.uncertain', 'task.status_restored', 'task.completed', 'task.error') ORDER BY rowid DESC LIMIT 20");
const completedTaskHistory = db.prepare("SELECT kind, payload FROM events WHERE session_id = ? AND kind IN ('task.started', 'task.completed', 'task.error') ORDER BY rowid DESC LIMIT 400");
const nativeHistory = db.prepare("SELECT kind, payload FROM events WHERE session_id = ? AND kind IN ('user.text', 'assistant.text', 'task.started', 'task.progress', 'task.uncertain', 'task.status_restored', 'task.completed', 'task.error') ORDER BY rowid DESC LIMIT 20");
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
  if (req.method === 'GET' && req.url === '/resources') return res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(await getResources()));
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
// Keep active tasks and their completed results while a resumable session reconnects.
// This is process-local and does not restore work after a gateway restart.
const activeTaskSessions = new Map();
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
    client.once('close', () => {
      activeResumeSessions.delete(resumedSession);
      const state = activeTaskSessions.get(resumedSession);
      if (state?.client === client) state.client = null;
      if (state?.running.size === 0) activeTaskSessions.delete(resumedSession);
    });
  }
  const session = resumedSession ?? randomUUID();
  const hasPreviousHistory = Boolean(resumedSession && nativeHistory.all(session).length);
  const asr = lfmRealtimeUrl ? null : new WebSocket(asrUrl);
  let active;
  let segments = [];
  let waitingForFinal = false;
  let spokenImage = null;
  let reviewSpeech = false, pendingReview = null;
  let taskState = resumedSession && activeTaskSessions.get(session);
  if (!taskState) {
    taskState = { running: new Map(), completed: resumedSession && lfmRealtimeUrl ? restoreCompletedTasks(completedTaskHistory.all(session).reverse()) : new Map() };
    if (resumedSession) activeTaskSessions.set(session, taskState);
  }
  const runningTasks = taskState.running;
  const completedTasks = taskState.completed;
  if (resumedSession) taskState.client = client;
  const cleanTaskState = () => {
    if (resumedSession && !activeResumeSessions.has(session) && runningTasks.size === 0 && activeTaskSessions.get(session) === taskState) activeTaskSessions.delete(session);
  };
  const send = (value) => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(value)); };
  const sendTask = (value) => {
    const destination = resumedSession ? taskState.client : client;
    if (destination?.readyState === WebSocket.OPEN) destination.send(JSON.stringify(value));
  };
  send({ type: 'session.capabilities', mode: lfmRealtimeUrl ? 'native-speech' : 'cascade', text_input: !lfmRealtimeUrl, image_input: !lfmRealtimeUrl, spoken_image_input: !lfmRealtimeUrl, speech_review: !lfmRealtimeUrl, task_cancel: Boolean(opencodeUrl), task_approval: Boolean(opencodeUrl), input_transcript: !lfmRealtimeUrl || Boolean(lfmTranscriptUrl), workspace_label: workspaceLabel });
  if (resumedSession) {
    const events = [];
    for (const row of taskSnapshot.all(session).reverse()) {
      try {
        const payload = JSON.parse(row.payload);
        if (!payload || typeof payload.task_id !== 'string') continue;
        const value = row.kind === 'task.started' ? payload.task : row.kind === 'task.completed' ? payload.text : payload.message;
        if (typeof value !== 'string') continue;
        events.push({ kind: row.kind, task_id: payload.task_id, text: value.slice(0, 8000), created_at: row.created_at });
      } catch { /* Ignore malformed historical events. */ }
    }
    if (events.length) send({ type: 'session.task_history', events });
  }
  const tool = { type: 'function', function: { name: 'delegate_task', description: 'Delegate a substantive coding or research task to the local OpenCode agent in the background. Do not use for ordinary conversation.', parameters: { type: 'object', properties: { task: { type: 'string', description: 'The complete task for the agent' } }, required: ['task'] } } };
  const requestJson = async (url, options = {}) => {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`OpenCode HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
  const launchTask = async (task, turnId, { reuseCompleted = false, rerun = false, originalRequest = null } = {}) => {
    if (!opencodeUrl) throw new Error('OpenCode is not configured');
    if (typeof task !== 'string' || !task.trim() || task.length > 4000) throw new Error('Invalid agent task');
    // Deduplicate by proposed task regardless of how the user phrased the request.
    const taskKey = normalizeTask(task);
    const prior = runningTasks.get(taskKey);
    if (prior?.uncertain) return { accepted: false, status: 'uncertain', error: 'A matching task may still be running; it was not submitted again.', ...(prior.id ? { task_id: prior.id } : {}) };
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
      releaseResource?.attachTask?.(agentSession.id);
      reservation.id = agentSession.id;
      promptAttempted = true;
      const agentPrompt = buildAgentPrompt(task, nativeHistory.all(session).reverse(), 1800, originalRequest);
      await requestJson(`${opencodeUrl}/session/${encodeURIComponent(agentSession.id)}/prompt_async`, { method: 'POST', headers, body: JSON.stringify({ parts: [{ type: 'text', text: agentPrompt }] }) });
    } catch (error) {
      if (!promptAttempted) releaseResource?.();
      if (!promptAttempted) runningTasks.delete(taskKey);
      else {
        reservation.uncertain = true;
        const uncertain = { task_id: agentSession.id, task, message: 'Task submission status is uncertain; it may still be running.' };
        record(session, turnId, 'task.uncertain', uncertain);
        sendTask({ type: 'task.uncertain', ...uncertain });
      }
      cleanTaskState();
      throw error;
    }
    const event = { task_id: agentSession.id, task };
    completedTasks.delete(taskKey);
    record(session, turnId, 'task.started', event);
    send({ type: 'task.started', turn_id: turnId, ...event });
    void (async () => {
      let confirmedTerminal = false, pollFailures = 0, previousProgress = JSON.stringify({ state: 'running' });
      const pressureCheck = process.env.ASSISTAI_CANCEL_ON_PRESSURE === '1' ? createPressureDetector() : null;
      try {
        for (let i = 0; i < 300; i++) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          if (pressureCheck && pressureCheck(await getResources())) {
            let accepted = false;
            try { accepted = await requestJson(`${opencodeUrl}/session/${encodeURIComponent(agentSession.id)}/abort`, { method: 'POST' }) === true; } catch { /* Outcome remains uncertain. */ }
            const kind = accepted ? 'task.cancel_requested' : 'task.cancel_rejected';
            const notice = { task_id: agentSession.id, message: accepted
              ? 'Resource pressure: cancellation requested; the task may already have made changes.'
              : 'Resource pressure: cancellation could not be confirmed; the task may still be running.' };
            record(session, turnId, kind, notice); sendTask({ type: kind, ...notice });
          }
          let status, messages;
          try {
            status = await requestJson(`${opencodeUrl}/session/status`);
            messages = await requestJson(`${opencodeUrl}/session/${encodeURIComponent(agentSession.id)}/message`);
            if (!status || typeof status !== 'object' || Array.isArray(status) || !Array.isArray(messages)) throw new Error('Invalid agent status response');
          } catch (error) {
            pollFailures++;
            if (!reservation.uncertain) {
              reservation.uncertain = true;
              const result = { task_id: agentSession.id, message: 'Agent status unavailable; retrying. The task may still be running.' };
              record(session, turnId, 'task.uncertain', result);
              sendTask({ type: 'task.uncertain', ...result });
            }
            if (pollFailures >= 3) throw error;
            continue;
          }
          pollFailures = 0;
          if (reservation.uncertain) {
            reservation.uncertain = false;
            const restored = { task_id: agentSession.id, message: 'Agent status monitoring resumed; the task outcome is not yet confirmed.' };
            record(session, turnId, 'task.status_restored', restored);
            sendTask({ type: 'task.status_restored', ...restored });
          }
          const progress = agentProgress(status[agentSession.id]);
          if (progress && JSON.stringify(progress) !== previousProgress) {
            previousProgress = JSON.stringify(progress);
            record(session, turnId, 'task.progress', { task_id: agentSession.id, ...progress,
              message: progress.state === 'retrying' ? 'The agent is retrying.' : 'The agent resumed work.' });
            sendTask({ type: 'task.progress', task_id: agentSession.id, ...progress });
          }
          const last = latestCompletedAssistant(status, agentSession.id, messages);
          if (last) {
            const text = (last.parts ?? []).filter(part => part.type === 'text' && !part.synthetic).map(part => part.text).join('\n').trim();
            if (last.info.error) { confirmedTerminal = true; throw new Error('Agent reported an error'); }
            if (last.info.finish === 'length') { confirmedTerminal = true; throw new Error('Agent response was truncated before the task could be confirmed complete'); }
            if (!text) continue;
            confirmedTerminal = true;
            const result = { task_id: agentSession.id, text: text.slice(0, 8000) };
            if (completedTasks.size >= 100) completedTasks.delete(completedTasks.keys().next().value);
            completedTasks.set(taskKey, result);
            record(session, turnId, 'task.completed', result);
            sendTask({ type: 'task.completed', ...result });
            return;
          }
        }
        throw new Error('Agent task status timed out');
      } catch (error) {
        if (!confirmedTerminal) reservation.uncertain = true;
        const result = { task_id: agentSession.id, message: confirmedTerminal ? String(error) : `Agent status remains uncertain: ${String(error)}` };
        const kind = confirmedTerminal ? 'task.error' : 'task.uncertain';
        record(session, turnId, kind, result); sendTask({ type: kind, ...result });
      } finally {
        if (confirmedTerminal) releaseResource?.();
        if (confirmedTerminal) runningTasks.delete(taskKey);
        cleanTaskState();
      }
    })();
    return { accepted: true, task_id: agentSession.id };
  };
  const approvals = createTaskApproval({ send, execute: launchTask });
  const proposeTask = async (task, turnId, options = {}) => {
    if (!opencodeUrl) throw Error('OpenCode is not configured');
    return approvals.propose(task, turnId, options);
  };
  client.once('close', () => approvals.clear());
  client.on('message', (data, binary) => {
    if (binary) return;
    let event; try { event = JSON.parse(data.toString()); } catch { return; }
    if (event.type === 'task.approval') {
      void approvals.decide(event.approval_id, event.approved);
      return;
    }
    if (event.type !== 'task.cancel') return;
    const owned = typeof event.task_id === 'string' && [...runningTasks.values()].some(task => task.id === event.task_id);
    if (!owned || !opencodeUrl) { send({ type: 'task.cancel_rejected', task_id: event.task_id, message: 'Task is not running in this session.' }); return; }
    void requestJson(`${opencodeUrl}/session/${encodeURIComponent(event.task_id)}/abort`, { method: 'POST' })
      .then(accepted => send({ type: accepted === true ? 'task.cancel_requested' : 'task.cancel_rejected', task_id: event.task_id,
        message: accepted === true ? 'Cancellation requested; the task may already have made changes.' : 'The agent did not accept cancellation.' }))
      .catch(() => send({ type: 'task.cancel_rejected', task_id: event.task_id, message: 'Could not request cancellation; task status is uncertain.' }));
  });
  if (lfmRealtimeUrl) {
    attachLfmBridge(client, { url: lfmRealtimeUrl, transcriptUrl: lfmTranscriptUrl, launchTask: proposeTask, makeTurnId: randomUUID, workspaceContext: lfmWorkspaceContext, resumed: hasPreviousHistory,
      recordEvent: event => record(session, event.turn_id, event.type, { text: event.text, source: event.source ?? 'native-model' }),
      getContext: () => buildNativeContext(nativeHistory.all(session).reverse()),
      getCompletedTask: taskId => {
      if (typeof taskId !== 'string') return null;
      const row = completedTask.get(session, taskId);
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
    form.set('text', speechText(text) || 'La réponse est affichée.');
    const stalled = new AbortController();
    let timer;
    const resetTimeout = () => { clearTimeout(timer); timer = setTimeout(() => stalled.abort(), ttsStallMs); };
    resetTimeout();
    try {
      const speech = await fetch(`${ttsUrl}/tts`, { method: 'POST', body: form, signal: AbortSignal.any([turn.controller.signal, stalled.signal]) });
      if (!speech.ok || !speech.body) throw new Error(`TTS HTTP ${speech.status}`);
      let header = Buffer.alloc(0), started = false, audioBytes = 0;
      for await (const bytes of speech.body) {
        if (active !== turn) return;
        resetTimeout();
        let chunk = Buffer.from(bytes);
        if (!started) {
          header = Buffer.concat([header, chunk]);
          if (header.length < 44) continue;
          if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE' || header.toString('ascii', 36, 40) !== 'data' || header.readUInt16LE(20) !== 1 || header.readUInt16LE(22) !== 1 || header.readUInt16LE(34) !== 16) throw new Error('Unsupported TTS WAV format');
          send({ type: 'speech.start', turn_id: turn.id, sample_rate: header.readUInt32LE(24), encoding: 'pcm_s16le' });
          chunk = header.subarray(44);
          started = true;
        }
        audioBytes += chunk.length;
        if (chunk.length && client.readyState === WebSocket.OPEN) client.send(chunk, { binary: true });
      }
      if (!started) throw new Error('TTS returned no WAV audio');
      if (!audioBytes || audioBytes % 2) throw new Error('TTS returned empty or incomplete PCM16 audio');
      if (active === turn) { active = undefined; send({ type: 'speech.end', turn_id: turn.id }); }
    } catch (error) {
      if (stalled.signal.aborted && !turn.controller.signal.aborted) throw new Error('TTS stream stalled; spoken output may be incomplete');
      throw error;
    } finally { clearTimeout(timer); }
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
      const taskSummary = [...tasks.values()].map(task => `${task.task_id}: ${task.status}${task.status === 'task.progress' && task.state ? ` (${task.state})` : ''}${task.task ? `; request: ${task.task}` : ''}${task.text ? `; result: ${task.text.slice(0, 500)}` : ''}${['task.uncertain', 'task.status_restored', 'task.error'].includes(task.status) && task.message ? `; status detail: ${task.message.slice(0, 500)}` : ''}`).join('\n');
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
        let approvalRequested = false;
        for (const call of message.tool_calls) {
          let result;
          try {
            if (call.function?.name !== 'delegate_task') throw new Error('Unknown tool');
            const args = JSON.parse(call.function.arguments);
            result = await proposeTask(args.task, turn.id, { originalRequest: text });
            approvalRequested ||= result.awaiting_approval === true;
          } catch (error) { result = { accepted: false, error: String(error) }; }
          messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
        }
        if (active !== turn) return;
        message = approvalRequested ? { content: 'La t\u00e2che n\u2019a pas encore commenc\u00e9. V\u00e9rifiez la demande affich\u00e9e, puis cliquez sur Approve task pour l\u2019autoriser, ou sur Decline task pour la refuser. La confirmation vocale ne suffit pas.' } : await complete(false);
      }
      const answer = visibleAnswer(message?.content);
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
      const answer = visibleAnswer((await response.json()).choices?.[0]?.message?.content);
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
      // A segment generated before a reset can arrive after the reset request.
      // The recognizer's acknowledgement is ordered after those stale segments.
      if (event.type === 'reset') segments = [];
      if (event.type === 'segment' && event.text) segments.push(event.text);
      if (event.type === 'final' && waitingForFinal) {
        waitingForFinal = false;
        if (event.text) segments.push(event.text);
        const text = segments.join(' ').trim();
        segments = [];
        const image = spokenImage; spokenImage = null;
        if (text && reviewSpeech) { pendingReview = { id: randomUUID(), image }; send({ type: 'speech.review', review_id: pendingReview.id, text, has_image: Boolean(image) }); }
        else if (text && image) void respondToImage(text, image);
        else if (text) void respond(text);
        else send({ type: 'asr.empty' });
      }
    } catch { send({ type: 'error', message: 'Invalid ASR response' }); }
  });
  asr.on('error', () => send({ type: 'error', message: 'ASR connection failed' }));
  asr.on('close', () => { if (client.readyState === WebSocket.OPEN) client.close(1011, 'Speech recognition disconnected'); });
  client.on('message', (data, binary) => {
    if (binary) { if (asr.readyState === WebSocket.OPEN && !waitingForFinal) asr.send(data, { binary: true }); return; }
    let event;
    try { event = JSON.parse(data.toString()); } catch { client.close(1003, 'Invalid JSON'); return; }
    if (event.type === 'interrupt') { cancel(event.reason === 'voice_activity' ? 'voice_activity' : 'manual'); return; }
    if (event.type === 'speech.review.configure' && typeof event.enabled === 'boolean') { reviewSpeech = event.enabled; if (!reviewSpeech) pendingReview = null; return; }
    if (event.type === 'speech.review.submit') {
      if (!pendingReview || event.review_id !== pendingReview.id || typeof event.text !== 'string' || !event.text.trim() || event.text.trim().length > 4000) { send({ type: 'error', message: 'Speech review is no longer available or the text is invalid.' }); return; }
      const image = pendingReview.image; pendingReview = null;
      if (image) void respondToImage(event.text.trim(), image); else void respond(event.text.trim());
      return;
    }
    if (event.type === 'notification.speak' && typeof event.task_id === 'string') {
      const row = completedTask.get(session, event.task_id);
      const completed = row ? JSON.parse(row.payload) : null;
      if (!completed || active || waitingForFinal) { send({ type: 'notification.rejected', task_id: event.task_id, reason: completed ? 'busy' : 'unavailable' }); return; }
      const turn = { id: randomUUID(), controller: new AbortController() };
      active = turn;
      send({ type: 'notification.started', task_id: event.task_id, turn_id: turn.id });
      void streamSpeech(formatTaskNotification(completed.text), turn).catch(error => {
        if (active === turn) { active = undefined; send({ type: 'error', turn_id: turn.id, message: String(error) }); }
      });
      return;
    }
    if (event.type === 'audio.reset' && !waitingForFinal && asr.readyState === WebSocket.OPEN) { segments = []; asr.send(JSON.stringify({ type: 'reset' })); return; }
    if (event.type === 'audio.end' && !waitingForFinal && asr.readyState === WebSocket.OPEN) {
      if (event.image !== undefined && !validImage(event.image)) { segments = []; asr.send(JSON.stringify({ type: 'reset' })); send({ type: 'error', message: 'Choose a valid PNG or JPEG image under 1 MiB.' }); return; }
      spokenImage = event.image ?? null; waitingForFinal = true; asr.send(JSON.stringify({ type: 'end' })); return;
    }
    if (event.type === 'image') {
      if (!validImage(event.image) || typeof event.text !== 'string' || !event.text.trim() || event.text.trim().length > 4000) { send({ type: 'error', message: 'Choose a PNG or JPEG image under 1 MiB and provide a question.' }); return; }
      void respondToImage(event.text.trim(), event.image);
      return;
    }
    if (event.type === 'text' && typeof event.text === 'string' && event.text.trim().length <= 4000 && event.text.trim()) { void respond(event.text.trim()); return; }
  });
  client.on('close', () => { cancel('disconnected'); asr.close(); });
});
server.listen(port, '127.0.0.1', () => console.log(`Experimental voice gateway: http://127.0.0.1:${port}`));
