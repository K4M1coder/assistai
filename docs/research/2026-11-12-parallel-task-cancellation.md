# EXP-147: Cancellation with concurrent task events

## Hypothesis and change

The first browser cancellation button stored only the latest task ID. When two tasks started and the newest finished first, it became disabled although the earlier task was still active. The client now tracks task IDs received on the current connection and chooses the most recent active task without an outstanding cancellation request. Completion or error removes that task; a rejected request can be retried.

## Verification and limits

A mock browser test started multiple tasks, completed the newest, and verified that cancellation targeted the prior task. It also verified retry after rejection. The existing gateway mock test continued to reject cross-session aborts and retain resource accounting when status was uncertain. Four targeted tests passed.

The button is not a task picker. Cancellation remains a best-effort request with no rollback or confirmed-stop guarantee. The client clears its view on disconnect and does not treat historical task records as proof of active work. This does not resolve ASR errors, memory pressure, authentication or OS isolation. The running gateway must be updated to support the cancellation endpoint; its live behavior remains untested.

An idle resource snapshot before the work showed 7,110,397,952 bytes available RAM and 249,970,688 bytes shared GPU use, so the guarded ASR benchmark was not run.
