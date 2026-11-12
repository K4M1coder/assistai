export function normalizeTask(task) {
  return task.trim().toLocaleLowerCase('fr').replace(/\s+/g, ' ').replace(/[.!?]+$/g, '');
}

// Rows must be restricted to one session and provided in chronological order.
export function restoreCompletedTasks(rows, limit = 100) {
  const started = new Map();
  const completed = new Map();
  for (const row of rows) {
    let payload;
    try { payload = JSON.parse(row.payload); } catch { continue; }
    if (!payload || typeof payload.task_id !== 'string' || !payload.task_id) continue;
    if (row.kind === 'task.started' && typeof payload.task === 'string' && payload.task.trim()) {
      const key = normalizeTask(payload.task);
      if (!key) continue;
      started.set(payload.task_id, key);
      completed.delete(key);
    } else if (row.kind === 'task.completed' && typeof payload.text === 'string' && payload.text.trim()) {
      const key = started.get(payload.task_id);
      if (!key) continue;
      completed.delete(key);
      completed.set(key, { task_id: payload.task_id, text: payload.text });
      if (completed.size > limit) completed.delete(completed.keys().next().value);
      started.delete(payload.task_id);
    } else if (row.kind === 'task.error') {
      started.delete(payload.task_id);
    }
  }
  return completed;
}
