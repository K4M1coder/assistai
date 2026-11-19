// Conservative checks for the two fixed synthetic barge-in prompts.
export function followupAnswer(log){
 const marker='Playback interrupted: microphone detected speech.';const offset=log.indexOf(marker);
 if(offset<0)return null;
 const answers=[...log.slice(offset).matchAll(/(?:^|\n)Assistant: ([^\n]+)/g)];
 return answers.at(-1)?.[1]?.trim()??null;
}
export function followupTranscript(log){
 const marker='Playback interrupted: microphone detected speech.';const offset=log.indexOf(marker);
 if(offset<0)return null;
 const entries=[...log.slice(offset).matchAll(/(?:^|\n)You: ([^\n]+)/g)];
 return entries.at(-1)?.[1]?.trim()??null;
}
export function plausibleFollowupTranscript(text,different){
 if(typeof text!=='string')return false;
 const normalized=text.toLowerCase();
 return different ? /\bcombien\b/.test(normalized)&&/\btrois\b/.test(normalized)
                  : /\bcapitale\b/.test(normalized)&&/\bfrance\b/.test(normalized);
}
export function correctFollowup(text,different){
 if(typeof text!=='string')return false;
 return different
  ? /^(?:(?:cinq|5)|la réponse est (?:cinq|5)|(?:deux|2) plus (?:trois|3) (?:font|fait|égale|égalent) (?:cinq|5))[.!]?$/i.test(text)
  : /^(?:paris|la capitale de la france est paris)[.!]?$/i.test(text);
}
