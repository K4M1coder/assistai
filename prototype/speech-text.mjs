// Produce a speech-friendly projection; the original answer remains visible in the UI.
export function speechText(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/```[\s\S]*?(?:```|$)/g, ' Code affiché. ')
    .replace(/`[^`\n]+`/g, ' code affiché ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/[^\s<>]+/gi, ' lien affiché ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/(?:^|\n)\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+)/g, ' ')
    .replace(/[*_~|\\]/g, ' ')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
