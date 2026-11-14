# EXP-189: Background task progress reporting

The gateway previously reported task start, uncertainty, completion and error, but did not expose an OpenCode retry while polling. The [OpenCode status schema](https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/session-status-event.ts) distinguishes `busy`, `retry` and `idle`; the installed service's behavior may differ by version.

The gateway now sends a session-scoped event when a task transitions to retrying or resumes work. Only the state and a bounded numeric retry count are sent; raw provider messages and model reasoning are omitted. The browser shows the transition without interrupting audio, and a sanitized summary is added to bounded session context for later status questions. Polling can miss transitions, status can be stale, and retry is not proof of failure or completion. The native terminal client prints the event.

Mock tests cover state mapping, omission of a provider message, retry while recovering from status failure, browser display and native context. No live model, agent task or microphone was used. Running gateways must be restarted to acquire this backend change.
