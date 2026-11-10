// Compare OpenAI-compatible tool-call output with and without SSE streaming.
const endpoint = process.env.LOCAL_MODEL_URL ?? 'http://127.0.0.1:18080/v1';
const tools = [{ type: 'function', function: { name: 'read', description: 'Read a file from the workspace', parameters: { type: 'object', properties: { filePath: { type: 'string' } }, required: ['filePath'] } } }];
const messages = [{ role: 'system', content: 'You are a coding assistant. Use the available tools to inspect files.' }, { role: 'user', content: 'Use the read tool to read calculator.py before making changes.' }];
for (const stream of [false, true]) {
  const start = performance.now();
  const response = await fetch(`${endpoint}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(90000), body: JSON.stringify({ model: 'local', messages, tools, tool_choice: 'auto', temperature: 0, max_tokens: 256, stream }) });
  const body = stream ? await response.text() : await response.json();
  const chunks = stream ? body.split('\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6))).flatMap(value => value.choices ?? []) : [];
  const output = stream
    ? { content: chunks.map(choice => choice.delta?.content ?? '').join(''), tool_deltas: chunks.flatMap(choice => choice.delta?.tool_calls ?? []), finish: chunks.map(choice => choice.finish_reason).filter(Boolean) }
    : body.choices?.[0];
  console.log(JSON.stringify({ stream, status: response.status, elapsed_ms: Math.round(performance.now() - start), output }));
  if (!response.ok) process.exitCode = 1;
}
