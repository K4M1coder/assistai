# EXP-184: Guarded spoken coding trial and measurement regression

## Hypothesis and protocol

With the memory margin restored, the existing cascade and coding agent might
complete a synthetic French coding request and speak a completion
notification while answering a follow-up. The fixture is disposable, and
OpenCode permissions are not an OS sandbox. The requested operation was to
change subtraction to addition in `calculator.py` without other changes.

On Windows 11 build 26200 with Intel Arc Pro B60 driver 32.0.101.8805, Node
v24.14.1, Python 3.11.14, Vosk 0.3.45, Pocket TTS 4.0.1 and websockets
17.4, commit `9464e01` plus the pre-existing uncommitted gateway and
agent-context changes, the trial reused the LFM3-1.7B Q8 controller, French
Vosk model and Gemma 4 Q4 agent. The controller's previously checked SHA-256
is recorded in [EXP-174](2026-11-13-controller-q4-candidate.md).

```powershell
$env:ASSISTAI_PROBE_WORKSPACE='.cache\agent-edit-exp184'
.\.venv-voice\Scripts\python.exe scripts\setup-agent-edit-probe.py
.\scripts\run-voice-agent-edit-trial.ps1 -Workspace '.cache\agent-edit-exp184' -AgentPort 18110 -GatewayPort 18111 -SpokenInput -Notification -PreflightOnly
.\scripts\run-voice-agent-edit-trial.ps1 -Workspace '.cache\agent-edit-exp184' -AgentPort 18110 -GatewayPort 18111 -SpokenInput -Notification -TimeoutSeconds 150
```

The setup refuses to overwrite an existing workspace. The trial's own
preflight and sampled reserves remained enabled. It synthesized speech
locally, not through physical devices. Temporary trial listeners were
confirmed stopped; the existing demonstration remained available.

## Results

The trial exited with `probe failed: 1`. Vosk rendered the filename and
function as `calculateur point pis` and `ader`; the controller delegated
`calculateur.py` and `ader` rather than the requested identifiers, although
it preserved addition instead of subtraction and the scope restriction. The
agent nevertheless changed the isolated `calculator.py` fixture from
subtraction to addition, and the static fixture check returned zero. This
does not validate the erroneous delegated task or establish why the agent
selected that file. No other workspace files were independently audited.

One task started at 11,937 ms, a text follow-up produced a French answer at
12,828 ms, and task completion was reported at 70,359 ms from probe start.
The notification started and produced 305,280 bytes of audio, not listened
to; total returned audio was 414,720 bytes. These timings include synthesis
and input streaming and are not end-of-speech latency. The probe failed its
required exact delegated filename assertion. The 70 sampled resource
measurements recorded minimum available RAM 13,542,977,536 bytes, maximum
dedicated GPU use 11,341,742,080 bytes, and maximum shared use 202,039,296
bytes. Sampling cannot establish peaks or prove the absence of spill.

The result JSON's `transcript` was incorrectly overwritten by the synthetic
text follow-up. The stderr event trace retained the original synthetic
transcript quoted above. A regression test reproduces this overwrite and the
probe now retains the first user transcript; six targeted fixture/probe tests
passed. This test fix does not improve ASR or validate a further live trial.
Raw synthetic logs and fixture remain under `.cache` and are excluded from
Git.

## Decision

Do not treat the coding path as reliable or enable broader permissions on
the basis of this result. The user-reviewed transcript mode can correct ASR
errors before submission, but the controller can still misstate a task;
compare the delegated task to the reviewed original request and obtain
clarification when identifiers, direction or scope differ. This one trial
does not prove that the agent's prompt check provides such a guarantee.
