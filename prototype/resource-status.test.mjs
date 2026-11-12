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
  assert.equal(status.hard_limit_enforced, false);
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
