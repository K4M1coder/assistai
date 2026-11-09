// Read-only local inference probes. Start an OpenAI-compatible server separately.
import { performance } from 'node:perf_hooks';

const base = process.env.LOCAL_MODEL_URL ?? 'http://127.0.0.1:18080/v1';
const tools = [{ type: 'function', function: { name: 'get_weather', description: 'Get weather for a city', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } }];
const prompts = ['What is the weather in Paris? Use the provided tool.', 'Use the tool to check the weather in Lyon.', 'Call the weather tool for Nantes.'];
for (const prompt of prompts) {
  const start = performance.now();
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'local', messages: [{ role: 'user', content: prompt }], tools, tool_choice: 'auto', max_tokens: 160, temperature: 0, chat_template_kwargs: { enable_thinking: false } }),
      signal: AbortSignal.timeout(90_000),
    });
    const body = await response.json();
    console.log(JSON.stringify({ prompt, elapsedMs: Math.round(performance.now() - start), httpStatus: response.status, message: body.choices?.[0]?.message, timings: body.timings, error: body.error }));
    if (!response.ok) process.exitCode = 1;
  } catch (error) {
    console.log(JSON.stringify({ prompt, elapsedMs: Math.round(performance.now() - start), error: String(error) }));
    process.exitCode = 1;
    break;
  }
}
