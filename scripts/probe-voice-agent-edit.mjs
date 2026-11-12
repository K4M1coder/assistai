// Disposable, explicit-workspace coding probe. OpenCode permissions are not an OS sandbox.
import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import WebSocket from 'ws';

const configuredWorkspace = process.env.ASSISTAI_PROBE_WORKSPACE;
const gatewayUrl = process.env.ASSISTAI_TEST_VOICE_URL;
if (!configuredWorkspace || !gatewayUrl) throw Error('Set explicit ASSISTAI_PROBE_WORKSPACE and ASSISTAI_TEST_VOICE_URL');
const address = new URL(gatewayUrl);
if (address.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname)) throw Error('Gateway must use loopback WebSocket');
const cache = await realpath('.cache');
const workspace = await realpath(configuredWorkspace);
const relative = path.relative(cache, workspace);
if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Probe workspace must be inside .cache');
const file = await realpath(path.join(workspace, 'calculator.py'));
if (path.dirname(file) !== workspace) throw Error('Fixture must be inside the selected workspace');
assert.match(await readFile(file, 'utf8'), /return\s+a\s*-\s*b/, 'Fixture must start with the known subtraction bug');

const socket = new WebSocket(gatewayUrl);
const startedAt = performance.now();
const timer = setTimeout(() => { console.error('Timed out waiting for edit task'); process.exitCode = 1; socket.terminate(); }, 120000);
let sent = false, taskCount = 0, taskStart = null, taskEnd = null, followup = null, audioBytes = 0, task = '', taskTurn = null;
socket.on('message', async (data, binary) => {
  if (binary) { audioBytes += data.length; return; }
  const event = JSON.parse(data.toString());
  if (['asr.ready', 'task.started', 'task.completed', 'task.error', 'task.rejected', 'assistant.text', 'error'].includes(event.type)) {
    console.error(JSON.stringify({ event: event.type, elapsed_ms: Math.round(performance.now() - startedAt), turn_id: event.turn_id ?? null }));
  }
  if (event.type === 'asr.ready' && !sent) {
    sent = true;
    socket.send(JSON.stringify({ type: 'text', text: 'Délègue à ton agent la tâche suivante : dans calculator.py, corrige la fonction add pour retourner la somme de a et b au lieu de leur différence. Ne modifie aucun autre fichier.' }));
  } else if (event.type === 'task.started') {
    taskCount++; task = event.task; taskTurn = event.turn_id; taskStart = Math.round(performance.now() - startedAt);
    socket.send(JSON.stringify({ type: 'text', text: 'Dis-moi bonjour en français.' }));
  } else if (event.type === 'assistant.text' && taskStart !== null && taskTurn && event.turn_id && event.turn_id !== taskTurn && followup === null) {
    followup = Math.round(performance.now() - startedAt);
  } else if (event.type === 'task.completed') {
    taskEnd = Math.round(performance.now() - startedAt);
    clearTimeout(timer);
    socket.close();
    const check = spawnSync(process.env.ASSISTAI_PYTHON ?? '.venv-voice/Scripts/python.exe',
      ['-I', 'scripts/verify-add-fixture.py', file], { encoding: 'utf8', timeout: 5000 });
    const result = { task_count: taskCount, task_start_ms: taskStart, task_end_ms: taskEnd,
      followup_ms: followup, followup_before_completion: followup !== null && followup < taskEnd,
      task_mentions_fixture: /calculator\.py/i.test(task), audio_bytes: audioBytes,
      static_fixture_check_exit: check.status, static_fixture_check_error: check.stderr.trim(),
      note: 'Synthetic text and a disposable fixture; static arithmetic check is not an OS sandbox or a general coding benchmark.' };
    console.log(JSON.stringify(result));
    if (taskCount !== 1 || !result.task_mentions_fixture || !result.followup_before_completion || audioBytes === 0 || check.status !== 0) process.exitCode = 1;
  } else if (event.type === 'error' || event.type === 'task.error') {
    clearTimeout(timer); console.error(JSON.stringify({ type: event.type, message: event.message }));
    process.exitCode = 1; socket.close();
  }
});
socket.on('error', error => { clearTimeout(timer); console.error(error.message); process.exitCode = 1; });
