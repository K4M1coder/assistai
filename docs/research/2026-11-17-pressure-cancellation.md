# Reactive resource-pressure cancellation — 2026-11-17

## Hypothesis and protocol

Admission uses a snapshot, so a task admitted with headroom may later run while GPU or RAM pressure rises. A best-effort cancellation request may reduce the duration of an overload, but cannot prevent an allocation spike or prove that the task stopped. OpenCode's [server documentation](https://opencode.ai/docs/server/) describes `POST /session/:id/abort` as aborting a session and returning a boolean. The installed OpenCode version is 1.19.5; the documentation is not a measurement of its behavior in this experiment.

Added an opt-in detector to the gateway and `-CancelOnPressure` to the Windows demo launcher. The detector requires two distinct fresh low-resource readings, sends one abort request per task, informs the client, and preserves resource accounting until a confirmed terminal outcome. A healthy, stale or missing reading breaks the sequence. No model process is killed. The detector runs during task polling and stops if polling terminates, including after repeated provider failures. Cancellation can race with completion and cannot undo writes.

## Test and results

On the Windows B60 development machine, Node v24.14.1 ran `node --test prototype/resource-pressure.test.mjs prototype/task-admission-gateway.integration.test.mjs`. Three tests passed. The integration test used a simulated OpenCode server, synthetic resource samples and a simulated realtime backend: it confirmed that two low samples triggered one request, a client event was emitted, and the reservation was still present until the mock reported completion. Unit tests checked duplicate timestamps and missing, stale or healthy observations. These are not real-pressure, real-harness, end-to-end audio, or physical memory-limit tests.

The currently running demonstration gateways were not restarted and do not include the option. A live hardware experiment requires an explicitly approved disposable task and careful observation; it must not intentionally exhaust memory. Existing sampled thresholds remain advisory. Neither the detector nor the launcher reserves memory, controls other processes, guarantees an abort, or proves that inference remains within 24 GB dedicated VRAM without RAM or disk spill.
