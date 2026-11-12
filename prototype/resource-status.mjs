import { readFile } from 'node:fs/promises';
import { DEFAULT_BUDGET } from './resource-budget.mjs';

// Snapshot reporting only. It cannot enforce limits or attribute allocations.
export function createResourceStatus({ samplePath, admissionEnabled = false, maxAgeMs = 5000, read = readFile, now = Date.now } = {}) {
  return async () => {
    const base = { admission: admissionEnabled ? 'advisory' : 'disabled', hard_limit_enforced: false };
    if (!samplePath) return { ...base, status: 'unavailable', reason: 'Resource sampling is not configured' };
    try {
      const sample = JSON.parse(await read(samplePath, 'utf8'));
      const age = now() - Date.parse(sample.observedAt);
      if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) return { ...base, status: 'stale', reason: 'Resource sample is stale or invalid' };
      for (const field of ['dedicatedBytes', 'sharedBytes', 'availableRamBytes']) {
        if (!Number.isFinite(sample[field]) || sample[field] < 0) throw Error('Invalid resource sample');
      }
      const reasons = [];
      if (sample.availableRamBytes < DEFAULT_BUDGET.minAvailableRamBytes) reasons.push('Available system RAM is below the 6 GiB reserve');
      if (sample.dedicatedBytes > DEFAULT_BUDGET.maxDedicatedBytes - DEFAULT_BUDGET.dedicatedReserveBytes) reasons.push('Dedicated GPU use exceeds the 22 GiB planning threshold');
      return { ...base, status: reasons.length ? 'low' : 'observed', observed_at: sample.observedAt,
        dedicated_bytes: sample.dedicatedBytes, shared_bytes: sample.sharedBytes,
        available_ram_bytes: sample.availableRamBytes, reasons };
    } catch { return { ...base, status: 'unavailable', reason: 'Resource sample is missing or invalid' }; }
  };
}
