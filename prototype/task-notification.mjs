import { speechText } from './speech-text.mjs';
// Task results are data; this does not summarize or interpret them.
export function formatTaskNotification(text, limit = 300) {
  const clean = speechText(text);
  if (!clean) return 'La tâche en arrière-plan est terminée. Le résultat est affiché.';
  const characters = Array.from(clean);
  let excerpt = characters.slice(0, limit).join('');
  if (characters.length > limit && /\S/u.test(characters[limit] ?? '') && /\S/u.test(characters[limit - 1] ?? '')) {
    const boundary = excerpt.lastIndexOf(' ');
    if (boundary > limit / 2) excerpt = excerpt.slice(0, boundary);
  }
  excerpt = excerpt.trimEnd();
  const truncated = characters.length > limit ? '…' : '';
  return `La tâche en arrière-plan est terminée. Extrait du résultat : ${excerpt}${truncated}`;
}
