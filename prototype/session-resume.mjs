import { createHash } from 'node:crypto';

// A bearer capability scopes history; it is not user authentication or RBAC.
export function resumeSessionId(protocolHeader, enabled) {
  const protocols = String(protocolHeader ?? '').split(',').map(item => item.trim());
  const tokens = protocols.filter(item => item.startsWith('resume.'));
  if (!tokens.length) return null;
  if (!enabled || tokens.length !== 1 || !protocols.includes('assistai-v1') || !/^resume\.[a-f0-9]{64}$/.test(tokens[0])) {
    throw new Error('Invalid or disabled session resume');
  }
  return createHash('sha256').update(tokens[0], 'utf8').digest('hex');
}
