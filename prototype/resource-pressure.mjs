// React only to consecutive fresh, distinct low-resource samples.
// This is a delayed cancellation request, not a memory limit.
export function createPressureDetector() {
  let previous = null, triggered = false;
  return sample => {
    if (triggered) return false;
    if (sample?.status !== 'low' || !sample.observed_at) { previous = null; return false; }
    const timestamp = Date.parse(sample.observed_at);
    if (!Number.isFinite(timestamp)) { previous = null; return false; }
    if (previous === null) { previous = timestamp; return false; }
    if (timestamp <= previous) return false;
    triggered = true;
    return true;
  };
}
