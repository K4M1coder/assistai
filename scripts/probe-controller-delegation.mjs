// Evaluate synthetic text requests without executing any returned tool calls.
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

export const cases = Object.freeze([
  { id: 'addition', prompt: 'Dans calculator.py, corrige la fonction pour faire une addition au lieu d’une soustraction. Ne change rien d’autre.', expected: 'delegate', review: 'Preserve filename, addition instead of subtraction, and scope restriction.' },
  { id: 'subtraction', prompt: 'Dans calculator.py, corrige la fonction pour faire une soustraction au lieu d’une addition. Ne change rien d’autre.', expected: 'delegate', review: 'Preserve filename, subtraction instead of addition, and scope restriction.' },
  { id: 'negation', prompt: 'Lis le fichier notes.txt, mais ne le supprime pas.', expected: 'delegate', review: 'Preserve reading notes.txt and the prohibition on deleting it.' },
  { id: 'research', prompt: 'Recherche les dernières nouvelles à Nantes et indique tes sources.', expected: 'delegate', review: 'Preserve Nantes, recency, sources and the research request.' },
  { id: 'greeting', prompt: 'Bonjour, comment vas-tu ?', expected: 'conversation', review: 'Answer conversationally without claiming a task was performed.' },
  { id: 'simple_question', prompt: 'Combien font deux plus deux ?', expected: 'conversation', review: 'Answer the arithmetic question without delegating.' },
]);

const tool = { type: 'function', function: { name: 'delegate_task', description: 'Delegate a substantive coding or research task to the local OpenCode agent in the background. Do not use for ordinary conversation.', parameters: { type: 'object', properties: { task: { type: 'string', description: 'The complete task for the agent' } }, required: ['task'] } } };
const system = 'You are a concise local voice assistant. Reply in French. Delegate substantive work using the available tool. Never claim an action was performed unless its result is available. Answer the most recent user message; do not repeat or re-delegate tasks already listed below. Task state:\nNo tasks.';

export function inspect(message, expected) {
  const calls = message?.tool_calls ?? [];
  if (!Array.isArray(calls)) return { structureOk: false, task: null };
  if (expected === 'conversation') return { structureOk: calls.length === 0 && typeof message?.content === 'string' && Boolean(message.content.trim()), task: null };
  try {
    if (calls.length !== 1 || calls[0].function?.name !== 'delegate_task') throw Error('Unexpected tool call');
    const args = JSON.parse(calls[0].function.arguments);
    if (typeof args.task !== 'string' || !args.task.trim()) throw Error('Missing task');
    return { structureOk: true, task: args.task };
  } catch { return { structureOk: false, task: null }; }
}

export async function run(base, fetcher = fetch) {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw Error('Only credential-free loopback endpoints are allowed');
  const results = [];
  for (const item of cases) {
    const started = performance.now();
    const response = await fetcher(`${base.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(90000),
      body: JSON.stringify({ model: 'local', messages: [{ role: 'system', content: system }, { role: 'user', content: item.prompt }],
        tools: [tool], tool_choice: 'auto', max_tokens: 256, temperature: 0, chat_template_kwargs: { enable_thinking: false } }),
    });
    if (!response.ok) throw Error(`Model returned HTTP ${response.status} for ${item.id}`);
    const body = await response.json();
    const message = body.choices?.[0]?.message;
    results.push({ id: item.id, expected: item.expected, review: item.review, ...inspect(message, item.expected),
      answer: typeof message?.content === 'string' ? message.content : null, elapsedMs: Math.round(performance.now() - started),
      semanticReview: 'required' });
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await run(process.env.LOCAL_MODEL_URL ?? 'http://127.0.0.1:18084/v1');
  for (const item of result) console.log(JSON.stringify(item));
  if (result.some(item => !item.structureOk)) process.exitCode = 1;
}
