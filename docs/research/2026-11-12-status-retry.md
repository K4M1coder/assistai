# EXP-149: Bounded task status recovery

## Hypothesis and design

A single transient OpenCode polling error should not make a task permanently uncertain. For a successfully submitted task, the gateway now emits `task.uncertain` on a status or message polling failure and retries at the existing two-second interval. Three consecutive failures stop polling and leave the task and advisory estimate retained. A successful status and message read resets the failure count and emits a monitoring-resumed event. Only an observed terminal result releases the estimate.

## Verification and limits

An isolated mock integration forced the first status request to fail. While the task was uncertain, it rejected another task under the configured budget and allowed a same-session cancellation request. The mock then recovered and returned a completed assistant message; the gateway emitted completion and accepted a new task after a fresh resource sample. Eleven targeted client, bridge and gateway tests passed.

This test covers one transient failure, not three consecutive failures or real OpenCode behavior. Ambiguous prompt submission is retained without starting this retry loop. Status polling and cancellation can race, cancellation does not undo work, and a restart loses the task map. The current port 18091 gateway predates this code. An idle snapshot before the work showed 7,332,999,168 bytes available RAM, below the separate ASR benchmark preflight; no model inference was started.
