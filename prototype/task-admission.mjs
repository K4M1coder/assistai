import { readFile } from 'node:fs/promises';
import { DEFAULT_BUDGET, evaluateBudget } from './resource-budget.mjs';

// Advisory admission: a current snapshot and estimates cannot reserve memory.
export function createTaskAdmission({ samplePath, baselineSharedBytes, requestedVramBytes, requestedRamBytes, maxAgeMs = 5000, read = readFile, now = Date.now } = {}) {
  if (!samplePath || ![baselineSharedBytes, requestedVramBytes, requestedRamBytes, maxAgeMs].every(Number.isFinite) ||
      baselineSharedBytes < 0 || requestedVramBytes <= 0 || requestedRamBytes <= 0 || maxAgeMs <= 0) {
    throw new Error('Task admission requires a sample path, baseline and positive allocation estimates');
  }
  return async () => {
    try {
      const sample = JSON.parse(await read(samplePath, 'utf8'));
      const age = now() - Date.parse(sample.observedAt);
      if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) throw new Error('Resource sample is stale or invalid');
      const decision = evaluateBudget({ ...sample, baselineSharedBytes }, { vramBytes: requestedVramBytes, ramBytes: requestedRamBytes }, DEFAULT_BUDGET);
      if (!decision.allowed) throw new Error(decision.reasons.join('; '));
    } catch (error) {
      throw new Error(`Task rejected by resource admission: ${error.message}`);
    }
  };
}
