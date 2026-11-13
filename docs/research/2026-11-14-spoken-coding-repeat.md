# EXP-185: Repeat spoken coding with corrected transcript reporting

## Protocol

The EXP-184 synthetic coding and notification trial was repeated with a fresh
fixture, the corrected measurement code at commit `dc7aaf9`, and the same
pre-existing uncommitted gateway and agent-context changes. Hardware, runtime,
models and resource safeguards were as described in EXP-184. The setup and
trial commands were:

```powershell
$env:ASSISTAI_PROBE_WORKSPACE='.cache\agent-edit-exp185'
.\.venv-voice\Scripts\python.exe scripts\setup-agent-edit-probe.py
.\scripts\run-voice-agent-edit-trial.ps1 -Workspace '.cache\agent-edit-exp185' -AgentPort 18110 -GatewayPort 18111 -SpokenInput -Notification -TimeoutSeconds 150
```

The trial preflight measured 13,754,802,176 bytes available RAM,
11,258,621,952 bytes dedicated GPU and 202,039,296 bytes shared GPU. These
are samples, not reservations or a no-spill guarantee.

## Results

The JSON result now retained the first synthetic ASR transcript rather than
the later text follow-up, agreeing with the event trace. It again rendered
`calculator.py` and `add` incorrectly, as `calculateur point pis` and `ad`;
the delegated task preserved those incorrect identifiers. The disposable
fixture was nevertheless changed to addition and passed the static check.
The trial correctly exited with a failure because the delegated task omitted
the exact filename.

The follow-up answer appeared at 13,047 ms and completion at 100,500 ms from
probe start. Notification speech began and 401,280 bytes of audio were
received, but not listened to. Across 92 samples, minimum available RAM was
10,597,859,328 bytes, maximum dedicated GPU use 11,293,814,784 bytes and
maximum shared GPU use 202,039,296 bytes. Synthetic input was used; no
physical audio device was opened. Sampling is not a complete peak measurement.

## Conclusion

The measurement fix was verified in this real-model run, not merely by its
mock test. The repeated identifier errors and successful fixture edit do not
make delegation safe: the agent selected a file despite being given wrong
identifiers. Additional confirmation of the controller's proposed task is
needed before relying on consequential coding actions. This experiment does
not prove that any particular confirmation design prevents all errors.

The operator subsequently chose explicit approval before every delegated
task. This is a requested behavior, not an implemented safeguard: the
running gateway can still automatically submit tasks. A future implementation
must cover both cascade and native paths, present the proposed task and the
available original request, reject stale or duplicate approvals, handle
disconnects and cancellation, and verify that no agent submission occurs
without approval. The existing gateway should not be used for consequential
delegation until this has been implemented and validated.
