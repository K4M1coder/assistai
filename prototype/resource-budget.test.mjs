import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BUDGET, evaluateBudget } from './resource-budget.mjs';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
const baseline = { dedicatedBytes: 14 * GiB, sharedBytes: 180 * MiB, baselineSharedBytes: 150 * MiB, availableRamBytes: 10 * GiB };

test('admits a measured profile with room for GPU and RAM reserves', () => {
  assert.equal(evaluateBudget(baseline, { vramBytes: 2 * GiB, ramBytes: GiB }).allowed, true);
});

test('rejects excessive shared-memory growth even when dedicated VRAM is under 24 GiB', () => {
  const decision = evaluateBudget({ ...baseline, dedicatedBytes: 20.7 * GiB, sharedBytes: 1.27 * GiB });
  assert.equal(decision.allowed, false);
  assert.match(decision.reasons.join(' '), /Shared GPU memory/);
});

test('fails closed if telemetry is missing or the next allocation would consume reserves', () => {
  assert.equal(evaluateBudget(null).allowed, false);
  assert.equal(evaluateBudget(baseline, null).allowed, false);
  assert.equal(evaluateBudget(baseline, {}, null).allowed, false);
  assert.equal(evaluateBudget({ ...baseline, availableRamBytes: undefined }).allowed, false);
  assert.equal(evaluateBudget(baseline, { vramBytes: 9 * GiB }).allowed, false);
  assert.equal(evaluateBudget(baseline, { ramBytes: 5 * GiB }).allowed, false);
  assert.equal(evaluateBudget(baseline, {}, { ...DEFAULT_BUDGET, maxDedicatedBytes: NaN }).allowed, false);
  assert.equal(evaluateBudget(baseline, {}, { ...DEFAULT_BUDGET, dedicatedReserveBytes: 25 * GiB }).allowed, false);
});
