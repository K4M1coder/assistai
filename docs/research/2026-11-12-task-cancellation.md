# EXP-146: Request cancellation of a background task

## Motivation and design

EXP-144 showed a spoken request being delegated with the opposite operation. The current demo uses a read-only fixture, but the requested future coding harness requires a way to request stopping a task. The [OpenCode V1 server documentation](https://opencode.ai/v1/docs/server/) specifies an abort endpoint for a running session. The gateway checks that a requested task ID belongs to its current session's active task map before calling that endpoint. The browser offers a button for the latest started task when the gateway advertises support.

## Verification and limits

A mock integration test confirmed that a different session's request was rejected without contacting the agent, while the owning session received a cancellation-requested event after the mock agent returned true. A subsequent admission remained rejected when task status was uncertain, showing that the abort acknowledgment alone did not free the estimate. Client tests cover the button and disabled state; the native mock gateway test still passed. Five targeted tests passed. No real OpenCode task was cancelled in this experiment, and the running port 18091 gateway predates the change.

An abort acknowledgment is not proof of termination and cannot reverse completed actions. Completion can race cancellation, and errors or restarts can leave task state uncertain. The browser only tracks the latest task; historical or no-longer-tracked tasks are not offered for cancellation. The session map is not authentication or OS isolation. Spoken recognition remains unreliable and this button does not make broader write permissions safe.

## Resource observation

After EXP-144, a read-only snapshot showed the agent model idle with approximately 3.97 GiB process working set and 12.87 GiB private bytes. Available system RAM was 6,784,393,216 bytes, below the ASR benchmark's 8 GiB preflight; the process figures do not identify the source or prove paging. No model was restarted or cache erased, and no new inference was run.
