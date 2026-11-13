// Strip explicit reasoning blocks, including an unfinished block, before showing or voicing model output.
export function visibleAnswer(input) {
  if (typeof input !== 'string') return '';
  let text = input.replace(/<(think|analysis)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi, ' ');
  // Some backends omit the opening marker when a prompt already contains it.
  text = text.replace(/^[\s\S]*?<\/(?:think|analysis)\s*>/i, ' ');
  // A truncated closing marker can follow reasoning when generation hits a limit.
  // Do not speak the text before it; there is no confirmed answer after it.
  text = text.replace(/^[\s\S]*?<\/(?:think|analysis)\s*$/i, ' ');
  text = text.replace(/<(?:think|analysis)(?:\s[^>]*)?(?:>|$)[\s\S]*$/i, ' ');
  return text.trim();
}

// Produce a speech-friendly projection; the original visible answer remains in the UI.
export function speechText(input) {
  return visibleAnswer(input)
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
