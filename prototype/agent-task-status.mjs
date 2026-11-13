// An absent OpenCode status can mean idle, but is not itself proof of completion.
// Never substitute an older completed message for a newer unfinished one.
export function latestCompletedAssistant(status, sessionId, messages) {
  if (status[sessionId] || !Array.isArray(messages) || !messages.length) return null;
  const latest = messages.at(-1);
  if (latest?.info?.role !== 'assistant' || !latest.info.time?.completed) return null;
  return latest;
}
