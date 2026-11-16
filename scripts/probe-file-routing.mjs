// Synthetic routing comparison. This never executes returned tool calls.
const base = process.env.LOCAL_MODEL_URL ?? 'http://127.0.0.1:18084/v1';
const url = new URL(base);
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw Error('Expected credential-free loopback URL');
const prompts = [
  { id:'exact', text:'Quel est le mot écrit dans le fichier fixture.txt ?' },
  { id:'asr-error', text:'Quel est le mot écrit dans le fichier fixe tur pointer liste ?' },
  { id:'greeting', text:'Bonjour, comment vas-tu ?' },
];
const variants = [
  { id:'existing', tool:'Delegate a substantive coding or research task to the local OpenCode agent in the background. Do not use for ordinary conversation.', extra:'' },
  { id:'file-aware', tool:'Delegate tasks to the local OpenCode agent, including reading or inspecting a named local file, coding and research. Do not use for ordinary conversation.', extra:' The agent can inspect files in its configured workspace after explicit user approval. Preserve the user’s exact filenames; never guess or silently correct an unclear filename.' },
  { id:'file-aware-clarify', tool:'Delegate tasks to the local OpenCode agent, including reading or inspecting a named local file, coding and research. Do not use for ordinary conversation.', extra:' The agent can inspect files in its configured workspace after explicit user approval. If the filename is ambiguous or is not spelled as a filename with an extension, ask the user to type the exact filename instead of delegating. Never guess or silently correct a filename.' },
];
for (const variant of variants.filter(item => !process.env.PROBE_VARIANT || item.id === process.env.PROBE_VARIANT)) for (const prompt of prompts) {
  const tool = { type:'function', function:{name:'delegate_task',description:variant.tool,parameters:{type:'object',properties:{task:{type:'string',description:'The complete task for the agent'}},required:['task']}} };
  const system = `You are a concise local voice assistant. Reply in French. Delegate substantive work using the available tool. Never claim an action was performed unless its result is available. Answer the most recent user message; do not repeat or re-delegate tasks already listed below.${variant.extra} Task state:\nNo tasks.`;
  const response = await fetch(`${base}/chat/completions`, {method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({model:'local',messages:[{role:'system',content:system},{role:'user',content:prompt.text}],tools:[tool],tool_choice:'auto',max_tokens:256,temperature:0,chat_template_kwargs:{enable_thinking:false}})});
  if (!response.ok) throw Error(`Controller HTTP ${response.status}`);
  const message = (await response.json()).choices?.[0]?.message;
  console.log(JSON.stringify({variant:variant.id,case:prompt.id,answer:message?.content ?? null,calls:message?.tool_calls ?? [],tool_executed:false}));
}
