// Task results are data; this does not summarize or interpret them.
export function formatTaskNotification(text, limit = 300) {
  const clean = typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (!clean) return 'La tâche en arrière-plan est terminée. Le résultat est affiché.';
  const characters = Array.from(clean);
  const excerpt = characters.slice(0, limit).join('');
  const truncated = characters.length > limit ? '…' : '';
  return `La tâche en arrière-plan est terminée. Extrait du résultat : ${excerpt}${truncated}`;
}
