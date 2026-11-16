import test from 'node:test';
import assert from 'node:assert/strict';
import { createPressureDetector } from './resource-pressure.mjs';

const low = observed_at => ({ status: 'low', observed_at });
const first = '2026-11-17T10:00:00Z', second = '2026-11-17T10:00:01Z';
test('requires distinct increasing low samples and triggers only once', () => {
  const check = createPressureDetector();
  assert.equal(check(low(first)), false);
  assert.equal(check(low(first)), false);
  assert.equal(check(low(second)), true);
  assert.equal(check(low('2026-11-17T10:00:02Z')), false);
});
test('healthy or unavailable readings break the consecutive sequence', () => {
  for (const status of ['observed', 'stale', 'unavailable']) {
    const check = createPressureDetector();
    assert.equal(check(low(first)), false);
    assert.equal(check({ status }), false);
    assert.equal(check(low(second)), false);
  }
});
