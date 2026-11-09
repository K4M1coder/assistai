// Read-only integration probe: OpenCode runs a task while the small model answers.
const harness = process.env.OPENCODE_URL ?? 'http://127.0.0.1:18085';
const controller = process.env.LOCAL_MODEL_URL ?? 'http://127.0.0.1:18084/v1';
async function json(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}
const headers = { 'content-type': 'application/json' };
const session = await json(`${harness}/session`, { method: 'POST', headers, body: JSON.stringify({ title: 'Read-only parallel probe' }) });
const start = performance.now();
try {
  await json(`${harness}/session/${session.id}/prompt_async`, { method: 'POST', headers, body: JSON.stringify({ parts: [{ type: 'text', text: 'Read fixture.txt and report only the secret word.' }] }) });
  await new Promise(resolve => setTimeout(resolve, 1000));
  const before = await json(`${harness}/session/status`);
  const controllerStart = performance.now();
  const response = await json(`${controller}/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model: 'local', messages: [{ role: 'user', content: 'Réponds en français : dis bonjour en une courte phrase.' }], max_tokens: 48, temperature: 0, chat_template_kwargs: { enable_thinking: false } }) });
  const controllerMs = Math.round(performance.now() - controllerStart);
  let result = [];
  for (let i = 0; i < 100; i++) {
    const status = await json(`${harness}/session/status`);
    result = await json(`${harness}/session/${session.id}/message`);
    const last = [...result].reverse().find(item => item.info?.role === 'assistant' && item.info?.time?.completed);
    if (!status[session.id] && last) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log(JSON.stringify({ agentStatusBeforeController: before[session.id] ?? 'idle-or-not-yet-started', controllerMs, controllerText: response.choices?.[0]?.message?.content, elapsedMs: Math.round(performance.now() - start), agentMessages: result.filter(item => item.info?.role === 'assistant').map(item => ({ completed: item.info.time?.completed, error: item.info.error, parts: item.parts?.filter(part => part.type === 'text' || part.type === 'tool').map(part => ({ type: part.type, text: part.text, tool: part.tool, status: part.state?.status })) })) }));
} finally {
  // Abort a still-running probe; preserve the session for inspection.
  await fetch(`${harness}/session/${session.id}/abort`, { method: 'POST' }).catch(() => {});
}
