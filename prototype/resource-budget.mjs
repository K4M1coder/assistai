// Admission policy only; callers must obtain reliable, current measurements.
const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
export const DEFAULT_BUDGET = Object.freeze({
  maxDedicatedBytes: 24 * GiB,
  dedicatedReserveBytes: 2 * GiB,
  minAvailableRamBytes: 6 * GiB,
  maxSharedGrowthBytes: 256 * MiB,
});

export function evaluateBudget(measurement, requested = {}, budget = DEFAULT_BUDGET) {
  const fields = ['dedicatedBytes', 'sharedBytes', 'baselineSharedBytes', 'availableRamBytes'];
  for (const key of fields) {
    if (!Number.isFinite(measurement[key]) || measurement[key] < 0) {
      return { allowed: false, reasons: [`Missing or invalid measurement: ${key}`] };
    }
  }
  const vram = requested.vramBytes ?? 0;
  const ram = requested.ramBytes ?? 0;
  if (![vram, ram].every(value => Number.isFinite(value) && value >= 0)) {
    return { allowed: false, reasons: ['Invalid requested allocation estimate'] };
  }
  const reasons = [];
  if (measurement.dedicatedBytes + vram > budget.maxDedicatedBytes - budget.dedicatedReserveBytes) {
    reasons.push('Dedicated GPU budget or safety reserve exceeded');
  }
  if (measurement.sharedBytes - measurement.baselineSharedBytes > budget.maxSharedGrowthBytes) {
    reasons.push('Shared GPU memory growth exceeds the configured limit');
  }
  if (measurement.availableRamBytes - ram < budget.minAvailableRamBytes) {
    reasons.push('Available system RAM would fall below the configured reserve');
  }
  return { allowed: reasons.length === 0, reasons };
}
