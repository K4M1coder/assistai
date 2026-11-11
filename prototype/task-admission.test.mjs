import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskAdmission } from './task-admission.mjs';

const GiB = 1024 ** 3;
const sample = { observedAt: '2026-01-01T00:00:00Z', dedicatedBytes: 14 * GiB, sharedBytes: 0, availableRamBytes: 10 * GiB };
const options = { samplePath: 'sample', baselineSharedBytes: 0, requestedVramBytes: GiB, requestedRamBytes: GiB, now: () => Date.parse(sample.observedAt), read: async () => JSON.stringify(sample) };

test('task admission accepts a fresh snapshot with estimated headroom', async () => {
  await createTaskAdmission(options)();
});
test('task admission fails closed for stale, missing, malformed or over-budget telemetry', async () => {
  await assert.rejects(createTaskAdmission({ ...options, now: () => options.now() + 5001 })(), /stale/);
  await assert.rejects(createTaskAdmission({ ...options, read: async () => { throw Error('missing'); } })(), /missing/);
  await assert.rejects(createTaskAdmission({ ...options, read: async () => '{' })(), /rejected/);
  await assert.rejects(createTaskAdmission({ ...options, read: async () => JSON.stringify({ ...sample, dedicatedBytes: 23 * GiB }) })(), /budget/);
  assert.throws(() => createTaskAdmission({ ...options, requestedVramBytes: 0 }), /positive/);
});
