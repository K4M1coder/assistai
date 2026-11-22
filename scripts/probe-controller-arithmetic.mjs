// Text-only control for the voice loopback; no tools or tasks are executed.
const base = 'http://127.0.0.1:18084/v1';
const system = 'You are a concise local voice assistant. Reply in French. Delegate substantive work using the available tool. Never claim an action was performed unless its result is available. Answer the most recent user message; do not repeat or re-delegate tasks already listed below. Task state:\nNo tasks.';
const question = 'combien font deux plus trois réponds en un mot';
for (const temperature of [0.3, 0.3, 0.3, 0]) {
  const started = performance.now();
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(90000),
    body: JSON.stringify({ model:'local', messages:[{role:'system',content:system},{role:'user',content:question}],
      max_tokens:256, temperature, chat_template_kwargs:{enable_thinking:false} }),
  });
  if (!response.ok) throw Error(`Controller HTTP ${response.status}`);
  const message = (await response.json()).choices?.[0]?.message;
  if (typeof message?.content !== 'string' || !message.content.trim()) throw Error('Missing response text');
  console.log(JSON.stringify({temperature, question, answer:message.content, elapsedMs:Math.round(performance.now()-started),
    semanticReview:'required', taskExecuted:false}));
}
