// Read-only local inference probes. Start an OpenAI-compatible server separately.
import { performance } from 'node:perf_hooks';

const base = process.env.LOCAL_MODEL_URL ?? 'http://127.0.0.1:18080/v1';
const address = new URL(base);
if (!['http:', 'https:'].includes(address.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname) || address.username || address.password) throw new Error('Model endpoint must be local and contain no credentials');
const tools = [{ type: 'function', function: { name: 'get_weather', description: 'Get weather for a city', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } }];
const prompts = ['What is the weather in Paris? Use the provided tool.', 'Use the tool to check the weather in Lyon.', 'Call the weather tool for Nantes.'];
const cities = ['Paris', 'Lyon', 'Nantes'];
for (const [index, prompt] of prompts.entries()) {
  const start = performance.now();
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'local', messages: [{ role: 'user', content: prompt }], tools, tool_choice: 'auto', max_tokens: 160, temperature: 0, chat_template_kwargs: { enable_thinking: false } }),
      signal: AbortSignal.timeout(90_000),
    });
    const body = await response.json();
    const message = body.choices?.[0]?.message;
    const calls = message?.tool_calls;
    let validToolCall = false;
    try {
      const args = JSON.parse(calls?.[0]?.function?.arguments);
      validToolCall = calls.length === 1 && calls[0].function.name === 'get_weather' && typeof args.city === 'string' && args.city.trim().toLowerCase() === cities[index].toLowerCase();
    } catch { /* Malformed tool arguments are a failed probe, not a success. */ }
    console.log(JSON.stringify({ prompt, elapsedMs: Math.round(performance.now() - start), httpStatus: response.status, validToolCall, message, timings: body.timings, error: body.error }));
    if (!response.ok || !validToolCall) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ prompt, elapsedMs: Math.round(performance.now() - start), error: String(error) }));
    process.exitCode = 1;
    break;
  }
}
