# EXP-190: Guarded Q8 controller baseline preparation

The existing Q8 controller reported an idle slot, but live loopback connections were present on demo ports 18094 and 18095. Starting a six-request model comparison could compete with an active conversation, so no inference was run.

`scripts/run-controller-baseline.ps1` samples the configured B60 adapter and system RAM, checks for established connections on ports 18093–18095, and confirms that the existing controller's sole slot is idle before starting the synthetic read-only probe from EXP-175. During a run it stops only its own probe if a monitored demo connection appears, available RAM falls below 8 GiB, dedicated use exceeds 22 GiB, shared GPU use exceeds 256 MiB, telemetry fails, or the timeout expires. It does not start, stop or replace a model. The preflight requires 10 GiB available RAM.

On this machine, `-PreflightOnly` correctly refused to run because a monitored demo had active connections. PowerShell parsing passed. This does not establish that every client or gateway is detected: the port list is local configuration, loopback checks race with new connections, and a sampled watchdog cannot prevent transient overshoot. Killing the client does not prove that the model server immediately stops inference. The probe checks response structure only; semantic review is mandatory. The Q4 model has still not been compared or loaded.

## Port discovery correction

After the 18096 demonstration was started, the original fixed list above would not have monitored it. The guard now reads owned demo port records on every sample in addition to the original fixed ports, and rejects malformed or mismatched records. A Windows test verifies discovery of a new port and failure on a mismatch. On this machine the discovered list included 18096; a fresh preflight still refused because other demo connections were active. Independently started gateways without ownership records can still be missed, filesystem and connection observations can race, and this is not hard resource enforcement. No inference was run for this correction.
