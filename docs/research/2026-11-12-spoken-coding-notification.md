# EXP-136: Spoken coding and completion notification

## Hypothesis and protocol

The guarded disposable-fixture trial can exercise synthetic French input, a concurrent follow-up, a real coding task and completion speech in one run. The probe now waits for both task completion and follow-up speech end before requesting notification, and checks for notification audio. This is synthetic audio, not a physical microphone or an audible-quality test.

## Evidence

Two Python mock tests passed, including the case where the task completes before the follow-up speech ends. On 2026-11-12, the real trial preflight measured 9,881,362,432 bytes available RAM, below its provisional 10 GiB spoken-input threshold; dedicated GPU usage was 16,066,027,520 bytes and shared usage was 200,167,424 bytes. No trial processes or model inference were started. The combined scenario therefore has not passed a real-model test.

The installed OpenCode reports version 1.19.5. The current [OpenCode migration guide](https://opencode.ai/docs/migrate-v1/) describes incompatible V2 permission names and server APIs; the existing fixture uses the [V1 permissions format](https://opencode.ai/v1/docs/permissions/). Current V2 documentation must not be assumed to describe this installed binary. Permissions are application controls, not a sandbox.

## Next step

When preflight meets the existing threshold, run the combined guarded trial with a fresh disposable fixture. Inspect the transcript, task outcome, notification audio and resource samples independently. Passing that synthetic run would still not prove physical microphone behavior, audible intelligibility or a hard VRAM limit.
