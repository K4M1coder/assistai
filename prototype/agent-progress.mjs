// Expose only stable lifecycle states, never raw provider messages or reasoning.
export function agentProgress(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.type === 'busy') return { state: 'running' };
  if (value.type === 'retry') {
    return Number.isSafeInteger(value.attempt) && value.attempt >= 0 && value.attempt <= 100000
      ? { state: 'retrying', attempt: value.attempt } : { state: 'retrying' };
  }
  return null;
}
