# EXP-182: Current cascade gateway after resource cleanup

## Hypothesis and protocol

After the operator freed memory, the current gateway might start with its
existing services and the shared admission configuration without loading
another model. This is a startup check, not a physical conversation test.

On Windows 11 build 26200, Intel Arc Pro B60 driver 32.0.101.8805, Node.js
v24.14.1 and Python 3.11.14, the source was commit `2d1b3de` plus the
pre-existing uncommitted changes to `prototype/gateway.mjs` and
`prototype/agent-context.mjs`. The command below started an isolated gateway
and sampler, reusing the existing local services:

```powershell
.\scripts\start-windows-demo.ps1 -Port 18094
Invoke-RestMethod http://127.0.0.1:18094/health
Invoke-RestMethod http://127.0.0.1:18094/services
Invoke-RestMethod http://127.0.0.1:18094/resources
```

The startup sample reported 11,412,971,520 bytes dedicated GPU memory,
209,973,248 bytes shared GPU memory, and 14,985,109,504 bytes available
system RAM. The gateway reported volatile history, participating-gateway
coordination and a single-task estimate of `headroom_observed`; these are
advisory snapshots, not reservations of physical memory or hard limits.
Health and service discovery reported the configured French Vosk, Pocket
TTS, LFM3 controller and Gemma/OpenCode services available. Service discovery
does not validate inference or audio devices.

## Next physical test

Open `http://127.0.0.1:18094/` on the same machine, leave Speaker-safe
enabled, enable Push-to-talk and Review speech before sending, then start the
microphone and grant browser permission. Hold the talk button while saying a
short French question, release it, review the transcript, and press Send.
Check the relevance and audibility of the answer and try Interrupt during
speech. Stop the microphone afterward. Do not retain personal audio or
transcripts as evidence; volatile gateway history does not guarantee that
other components or the operating system retain nothing. Background speech
can still be captured while the button is held.

The physical test and failure scenarios have not yet been performed in this
experiment. The older port 18093 gateway remains separate. To stop only the
new gateway and sampler, after verifying their ownership record:

```powershell
.\scripts\stop-windows-demo.ps1 -Port 18094
```

Stopping it discards its volatile session history. The script does not stop
the reused model services. Session resume is opt-in and does not provide
persistent history when this gateway uses an in-memory database.
