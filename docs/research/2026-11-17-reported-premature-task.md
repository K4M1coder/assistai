# Reported task start before approval — 2026-11-17

## Operator report and immediate state

During a requested French speech-review test on the editable fixture, the operator reported that a background task started before they approved it. Treat this as an unresolved report: the exact displayed events and actions have been requested, and no further real delegation was started for this investigation. At inspection the OpenCode `/session/status` response was empty, indicating no busy session was reported then; this does not prove that an earlier task did not run.

The harness session list contained two recent `calculator.py` read tasks, created at 00:34:12 and 00:37:58 local time. The operator had explicitly approved one earlier typed read, and later confirmed hearing an understandable result. The timing and the session titles alone do not establish which approval, browser interaction or request caused either task. The gateway's active history is volatile and does not record the approval decision as a durable auditable event. Its loopback services are not authenticated, so code-path inspection cannot exclude another local caller. No telemetry screenshots or exact event excerpt were available in this investigation.

Browser inspection through the available computer-use interface failed because the browser access host and native pipe were unavailable. Consequently the visual state, any old task history or notification, and whether the approval panel was displayed cannot be independently assessed. The active browser and gateway were left running. Do not approve or execute consequential tasks in this fixture until the report is clarified.

## Targeted simulated check

The current gateway source routes a tool proposal through a per-connection approval object before calling `launchTask`; the approval ID is single-use. An integration test was expanded to emulate recognized speech, enable review, verify that neither the model nor the agent was called before submission of the corrected transcript, reject a wrong approval ID, wait without creating an agent session, and accept one correct decision only once. `node --test prototype/task-approval-gateway.integration.test.mjs prototype/task-approval.test.mjs prototype/client-mode.test.mjs` passed seven tests.

These tests use simulated ASR, model and OpenCode servers. They do not reproduce the reported UI sequence, verify the source loaded in an already running process, prove the absence of a different code path or local caller, or invalidate the operator's report. Next obtain the exact event sequence and determine whether the reported start is a new agent session, an earlier event or an announcement; reproduce safely with an explicitly declined, disposable request before deciding on a fix.
