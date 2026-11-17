import { randomUUID } from 'node:crypto';

export function createTaskApproval({ send, execute, audit = () => {}, now = Date.now, timeoutMs = 300000 }) {
  let pending = null;
  return {
    propose(task, turnId, options = {}) {
      if (typeof task !== 'string' || !task.trim() || task.length > 4000) throw Error('Invalid agent task');
      if (pending && now() >= pending.expiresAt) {
        audit('task.approval_expired', pending.turnId, pending.id);
        send({ type: 'task.approval_expired', approval_id: pending.id });
        pending = null;
      }
      if (pending) return { accepted: false, error: 'Another task is awaiting approval.' };
      const id = randomUUID();
      pending = { id, task, turnId, options, expiresAt: now() + timeoutMs };
      try { audit('task.approval_requested', turnId, id); } catch (error) { pending = null; throw error; }
      send({ type: 'task.approval_requested', approval_id: id, task, original_request: options.originalRequest ?? null, expires_at: new Date(pending.expiresAt).toISOString() });
      return { accepted: false, awaiting_approval: true, message: 'Task has not started; explicit user approval is required.' };
    },
    async decide(id, approved) {
      if (typeof id !== 'string' || typeof approved !== 'boolean' || !pending || pending.id !== id) {
        send({ type: 'task.approval_rejected', message: 'Approval is unavailable or no longer valid.' });
        return;
      }
      const request = pending;
      pending = null;
      if (now() >= request.expiresAt) {
        audit('task.approval_expired', request.turnId, id);
        send({ type: 'task.approval_expired', approval_id: id });
        return;
      }
      if (!approved) {
        audit('task.approval_declined', request.turnId, id);
        send({ type: 'task.approval_declined', approval_id: id });
        return;
      }
      try {
        audit('task.approval_submitted', request.turnId, id);
        send({ type: 'task.approval_submitted', approval_id: id });
        const result = await execute(request.task, request.turnId, { ...request.options, approvalId: id });
        if (!result.accepted) send({ type: 'task.approval_rejected', approval_id: id, message: result.error ?? 'Task was not accepted.' });
        else if (result.already_running) send({ type: 'task.approval_result', approval_id: id, message: 'A matching task is already running.' });
      } catch (error) {
        send({ type: 'task.approval_rejected', approval_id: id, message: `Task submission failed: ${String(error)}` });
      }
    },
    clear() { pending = null; },
  };
}
