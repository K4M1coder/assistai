# Reported task start before approval — 2026-11-17

## Operator report and immediate state

During a requested French speech-review test on the editable fixture, the operator reported that a background task started before they approved it. Treat this as an unresolved report: the exact displayed events and actions have been requested, and no further real delegation was started for this investigation. At inspection the OpenCode `/session/status` response was empty, indicating no busy session was reported then; this does not prove that an earlier task did not run.

The harness session list contained two recent `calculator.py` read tasks, created at 00:34:12 and 00:37:58 local time. The operator had explicitly approved one earlier typed read, and later confirmed hearing an understandable result. The timing and the session titles alone do not establish which approval, browser interaction or request caused either task. The gateway's active history is volatile and does not record the approval decision as a durable auditable event. Its loopback services are not authenticated, so code-path inspection cannot exclude another local caller. No telemetry screenshots or exact event excerpt were available in this investigation.

Browser inspection through the available computer-use interface failed because the browser access host and native pipe were unavailable. Consequently the visual state, any old task history or notification, and whether the approval panel was displayed cannot be independently assessed. The active browser and gateway were left running. Do not approve or execute consequential tasks in this fixture until the report is clarified.

## Targeted simulated check

The current gateway source routes a tool proposal through a per-connection approval object before calling `launchTask`; the approval ID is single-use. An integration test was expanded to emulate recognized speech, enable review, verify that neither the model nor the agent was called before submission of the corrected transcript, reject a wrong approval ID, wait without creating an agent session, and accept one correct decision only once. `node --test prototype/task-approval-gateway.integration.test.mjs prototype/task-approval.test.mjs prototype/client-mode.test.mjs` passed seven tests.

These tests use simulated ASR, model and OpenCode servers. They do not reproduce the reported UI sequence, verify the source loaded in an already running process, prove the absence of a different code path or local caller, or invalidate the operator's report. Next obtain the exact event sequence and determine whether the reported start is a new agent session, an earlier event or an announcement; reproduce safely with an explicitly declined, disposable request before deciding on a fix.

## Operator excerpt and improved traceability

The operator later supplied the visible exchange: a request to read `calculator.py`, followed by the assistant saying the task had not started and asking for an Approve or Decline button. The excerpt contains no `Agent started` event and does not establish a new task launch; it also does not identify whether an earlier event or announcement led to the report. It is therefore not a complete explanation of the original concern.

The current gateway source now records `task.approval_requested` and the accepted, declined or expired decision using an opaque approval ID and the original turn ID. A `task.started` event records the same approval ID; no task content is added to the approval records. A valid approval is recorded before submission, and an audit-write error prevents execution. These local events are not a tamper-proof audit, do not authenticate the person or local caller, and do not cover direct access to OpenCode. With the Windows demo's in-memory database they disappear on restart. The running gateway has not been restarted and has no new records retroactively.

Mock tests checked that reviewed speech produces no model call before review, no agent session before approval, a wrong ID is rejected, the correct ID is single-use, and the saved request, decision and start share the ID in order. A failure to record approval prevented mock submission. Seven unit and mock-integration tests passed, including native-gateway and resumed-session tests. The native integration's older expected capability object was updated to include the existing workspace label. This does not demonstrate a fix for the user's original report; no new real task was approved or started in this investigation.
