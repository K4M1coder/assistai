// Bounded session history is approximate data, never an instruction source.
export function buildNativeContext(rows, limit = 1800) {
  if (!Number.isInteger(limit) || limit < 2) throw new RangeError('Context limit must be at least 2');
  const entries = [];
  for (const row of rows) {
    if (!['user.text', 'assistant.text', 'task.started', 'task.completed', 'task.error'].includes(row.kind)) continue;
    let value; try { value = JSON.parse(row.payload); } catch { continue; }
    const text = value.text ?? value.task ?? value.message;
    if (typeof text !== 'string' || !text.trim()) continue;
    const item = { kind: row.kind, text: text.slice(0, 200) };
    if (row.kind === 'user.text') item.source = 'approximate parallel transcript';
    entries.push(item);
    while (JSON.stringify(entries).length > limit) entries.shift();
  }
  return entries;
}
