import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskAdmission } from './task-admission.mjs';

const GiB = 1024 ** 3;
const sample = { observedAt: '2026-01-01T00:00:00Z', dedicatedBytes: 14 * GiB, sharedBytes: 0, availableRamBytes: 10 * GiB };
const options = { samplePath: 'sample', baselineSharedBytes: 0, requestedVramBytes: GiB, requestedRamBytes: GiB, now: () => Date.parse(sample.observedAt), read: async () => JSON.stringify(sample) };

test('task admission accepts a fresh snapshot with estimated headroom', async () => {
  const release = await createTaskAdmission(options)();
  assert.equal(typeof release, 'function'); release();
});
test('task admission fails closed for stale, missing, malformed or over-budget telemetry', async () => {
  await assert.rejects(createTaskAdmission({ ...options, now: () => options.now() + 5001 })(), /stale/);
  await assert.rejects(createTaskAdmission({ ...options, read: async () => { throw Error('missing'); } })(), /missing/);
  await assert.rejects(createTaskAdmission({ ...options, read: async () => '{' })(), /rejected/);
  await assert.rejects(createTaskAdmission({ ...options, read: async () => JSON.stringify({ ...sample, dedicatedBytes: 23 * GiB }) })(), /budget/);
  assert.throws(() => createTaskAdmission({ ...options, requestedVramBytes: 0 }), /positive/);
});

test('serializes simultaneous admissions and accounts for active estimates', async () => {
  const admit = createTaskAdmission({ ...options, requestedVramBytes: 1.5 * GiB, requestedRamBytes: 0.25 * GiB,
    read: async () => { await new Promise(resolve => setTimeout(resolve, 5)); return JSON.stringify({ ...sample, dedicatedBytes: 20 * GiB }); } });
  const results = await Promise.allSettled([admit(), admit()]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  const release = results.find(result => result.status === 'fulfilled').value;
  release(); release();
  const next = await admit();
  await assert.rejects(admit(), /budget/);
  next();
});
