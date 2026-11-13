// An absent OpenCode status can mean idle, but is not itself proof of completion.
// Never substitute an older completed message for a newer unfinished one.
export function latestCompletedAssistant(status, sessionId, messages) {
  if (status[sessionId] || !Array.isArray(messages) || !messages.length) return null;
  const latest = messages.at(-1);
  if (latest?.info?.role !== 'assistant' || !latest.info.time?.completed) return null;
  // A completed model step that calls tools is not a completed agent task.
  // Unknown or missing finish reasons are not sufficient evidence either.
  if (!latest.info.error && !['stop', 'length'].includes(latest.info.finish)) return null;
  return latest;
}
