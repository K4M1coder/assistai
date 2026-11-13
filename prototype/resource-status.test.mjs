import test from 'node:test';
import assert from 'node:assert/strict';
import { createResourceStatus } from './resource-status.mjs';

const GiB = 1024 ** 3;
const sample = { observedAt: '2026-11-12T12:00:00Z', dedicatedBytes: 15 * GiB, sharedBytes: 100,
  availableRamBytes: 4 * GiB };
const clock = () => Date.parse('2026-11-12T12:00:01Z');

test('reports low RAM without claiming hard enforcement', async () => {
  const status = await createResourceStatus({ samplePath: 'not-exposed', read: async () => JSON.stringify(sample), now: clock })();
  assert.equal(status.status, 'low');
  assert.equal(status.available_ram_bytes, 4 * GiB);
  assert.match(status.reasons[0], /6 GiB/);
  assert.equal(status.admission, 'disabled');
  assert.equal(status.hard_limit_enforced, false);
  assert.ok(!JSON.stringify(status).includes('not-exposed'));
});

test('reports fresh snapshot as observed without promising future headroom', async () => {
  const current = { ...sample, availableRamBytes: 9 * GiB };
  const status = await createResourceStatus({ samplePath: 'sample', admissionEnabled: true, read: async () => JSON.stringify(current), now: clock })();
  assert.equal(status.status, 'observed');
  assert.equal(status.admission, 'advisory');
  assert.equal(status.coordination, 'process-local');
  assert.equal(status.hard_limit_enforced, false);
});

test('labels shared coordination as limited to participating gateways', async () => {
  const status = await createResourceStatus({ samplePath: 'sample', admissionEnabled: true, sharedCoordination: true,
    read: async () => JSON.stringify({ ...sample, availableRamBytes: 9 * GiB }), now: clock })();
  assert.equal(status.coordination, 'participating-gateways');
});

test('projects one task using the admission budget without counting active reservations', async () => {
  const taskEstimate = { baselineSharedBytes: 0, requestedVramBytes: 0.5 * GiB, requestedRamBytes: 3 * GiB };
  const make = current => createResourceStatus({ samplePath: 'sample', admissionEnabled: true, taskEstimate,
    read: async () => JSON.stringify(current), now: clock })();
  const tight = await make({ ...sample, availableRamBytes: 8.9 * GiB });
  assert.equal(tight.status, 'observed');
  assert.equal(tight.single_task_estimate.status, 'insufficient');
  assert.match(tight.single_task_estimate.reasons.join(' '), /RAM/);
  const room = await make({ ...sample, availableRamBytes: 10 * GiB });
  assert.equal(room.single_task_estimate.status, 'headroom_observed');
  const shared = await make({ ...sample, availableRamBytes: 10 * GiB, sharedBytes: 257 * 1024 ** 2 });
  assert.equal(shared.status, 'low');
  assert.equal(shared.single_task_estimate.status, 'insufficient');
  assert.match(shared.single_task_estimate.reasons.join(' '), /Shared GPU/);
});

test('reports optional system-wide pagefile usage without attributing it to the model', async () => {
  const current = { ...sample, availableRamBytes: 9 * GiB, systemPagefileUsedBytes: 4 * GiB };
  const make = value => createResourceStatus({ samplePath: 'sample', read: async () => JSON.stringify(value), now: clock })();
  assert.equal((await make(current)).system_pagefile_used_bytes, 4 * GiB);
  assert.equal((await make({ ...current, systemPagefileUsedBytes: -1 })).status, 'unavailable');
  assert.equal((await make({ ...sample, availableRamBytes: 9 * GiB })).system_pagefile_used_bytes, undefined);
});

test('rejects stale, missing and malformed samples', async () => {
  assert.equal((await createResourceStatus({ samplePath: 'sample', read: async () => JSON.stringify(sample), now: () => clock() + 6000 })()).status, 'stale');
  assert.equal((await createResourceStatus({ samplePath: 'sample', read: async () => '{' })()).status, 'unavailable');
  assert.equal((await createResourceStatus({ samplePath: 'sample', read: async () => JSON.stringify({ ...sample, dedicatedBytes: -1 }), now: clock })()).status, 'unavailable');
  assert.equal((await createResourceStatus()()).status, 'unavailable');
});

test('uses reserve boundaries and reports dedicated GPU pressure', async () => {
  const make = current => createResourceStatus({ samplePath: 'sample', read: async () => JSON.stringify(current), now: clock })();
  const boundary = await make({ ...sample, dedicatedBytes: 22 * GiB, availableRamBytes: 6 * GiB });
  assert.equal(boundary.status, 'observed');
  const over = await make({ ...sample, dedicatedBytes: 22 * GiB + 1, availableRamBytes: 6 * GiB });
  assert.equal(over.status, 'low');
  assert.match(over.reasons[0], /22 GiB/);
});
