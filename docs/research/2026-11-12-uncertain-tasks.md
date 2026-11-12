# EXP-148: Retain uncertain tasks for cancellation

## Hypothesis and change

The gateway previously retained an advisory resource estimate after a polling failure but removed the corresponding task ID. As a result the user could no longer request cancellation, and an identical request could be submitted again despite uncertain external state. The gateway now retains the session-local entry and emits `task.uncertain` if status polling fails or prompt submission may have reached the harness. It refuses an identical normalized request while the entry is uncertain. The native bridge now passes a refusal reason back in its tool result. The browser keeps the task available for cancellation when it receives the uncertainty event.

## Verification and limits

Twelve targeted mock tests passed. The gateway integration forced a status polling failure, observed `task.uncertain`, successfully requested a same-session abort afterward, rejected a different session's abort, and retained the admission estimate. The bridge test checked that an uncertain-task refusal reason reaches the tool result. Ambiguous prompt submission, duplicate requests and real OpenCode behavior were not exercised end to end in this run.

The gateway does not resume polling after an error and does not release the estimate when an abort is acknowledged. An uncertain task can remain retained until process exit; a restart loses the map and cannot prove an external task stopped. Different wording can evade the exact-match check, and cancellation cannot undo changes. This is not an authorization boundary or a substitute for reliable transcription.

The demo resource snapshot before the work showed 7,058,239,488 bytes available RAM and 249,970,688 bytes shared GPU usage; the guarded ASR benchmark was not run. The running gateway on port 18091 predates this change.
