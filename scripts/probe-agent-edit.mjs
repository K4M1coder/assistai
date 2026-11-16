// Probe an isolated local OpenCode server; fixture and configuration are prepared separately.
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { spawnSync } from 'node:child_process';
import { askProbeApproval } from './interactive-probe-approval.mjs';

const workspace = process.env.ASSISTAI_PROBE_WORKSPACE ?? '.cache/agent-coding-probe';
const base = process.env.ASSISTAI_OPENCODE_URL ?? 'http://127.0.0.1:18089';
const request = async (path, options = {}) => {
  const response = await fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error(`OpenCode HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
};
const headers = { 'content-type': 'application/json' };
const task = 'In calculator.py, fix add(a, b) so that it returns the sum instead of the difference. Do not change other files. Explain what you changed.';
console.error(`Direct OpenCode server: ${base}. Verify its workspace and permissions before approving. Verification target: ${workspace}.`);
if (!await askProbeApproval({ approval_id: 'direct-fixture', original_request: task, task })) throw Error('Task declined or no interactive terminal; no agent session was created');
const start = performance.now();
const session = await request('/session', { method: 'POST', headers, body: JSON.stringify({ title: 'Isolated calculator edit probe' }) });
await request(`/session/${session.id}/prompt_async`, { method: 'POST', headers, body: JSON.stringify({ parts: [{ type: 'text', text: task }] }) });
for (let i = 0; i < 90; i++) {
  await delay(2000);
  const status = await request('/session/status');
  const messages = await request(`/session/${session.id}/message`);
  const last = [...messages].reverse().find(item => item.info?.role === 'assistant' && item.info?.time?.completed);
  if (!status[session.id] && last) {
    const python = process.env.ASSISTAI_PYTHON ?? '.venv-voice/Scripts/python.exe';
    const check = spawnSync(python, ['-I', 'scripts/verify-add-fixture.py', `${workspace}/calculator.py`], { encoding: 'utf8' });
    console.log(JSON.stringify({ elapsed_ms: Math.round(performance.now() - start), error: last.info.error ?? null, parts: last.parts, file: await readFile(`${workspace}/calculator.py`, 'utf8'), validation_exit: check.status, validation_error: check.stderr }));
    if (last.info.error || check.status !== 0) process.exitCode = 1;
    process.exit();
  }
}
throw Error('Agent did not finish within 180 seconds');
