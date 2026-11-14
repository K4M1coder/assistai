# EXP-183: Human voice check and isolated ASR connection failure

## Physical conversation

The operator used the EXP-182 browser procedure on the physical machine. They
reported that the French question was transcribed correctly or corrected
before submission, and that the spoken answer was audible and relevant in
French. Their initial report marked interruption as failed. In a separate
repeat, explicitly clicking Interrupt while a longer answer was audible, they
reported that the speech stopped. The initial failure is unexplained; neither
report establishes reliability across runs or automatic voice barge-in. No
independent recording, transcript, latency measurement or audible-quality
score was retained. The gateway used volatile session storage; this is not a
claim about storage by the browser, providers or operating system.

The operator subsequently confirmed that interruption works. This is
additional user-reported confirmation, not a measured interruption latency
or evidence of automatic barge-in.

## ASR connection failure

Hypothesis: with the speech recognizer unreachable, the gateway should report
the failure rather than pretend that the microphone is ready. An isolated
current-source gateway used an unused loopback ASR port and in-memory history.
No existing provider was stopped and no inference or physical device was
used. The real TCP connection was refused: the WebSocket client received
`ASR connection failed`, then close code `1011` with reason `Speech recognition
disconnected`; `/services` reported speech recognition unavailable. The
temporary gateway was stopped afterward. This is one connection failure,
not a test of disconnect during capture, audio-device failure or recovery.

The gateway was started with the following environment and the same runtime
and hardware as EXP-182:

```powershell
$env:ASSISTAI_GATEWAY_PORT='19095'
$env:ASSISTAI_DB_PATH=':memory:'
$env:ASSISTAI_ASR_URL='ws://127.0.0.1:19082/asr'
$env:ASSISTAI_LFM_REALTIME_URL=''
$env:ASSISTAI_BUDGET_SAMPLE_PATH=''
node prototype\gateway.mjs
```

Ports 19082 and 19095 were checked for existing listeners first. The client
connected to `ws://127.0.0.1:19095/voice` using the installed `ws` package,
asserted the error event and close code, and queried
`http://127.0.0.1:19095/services`. Stop the temporary gateway explicitly
afterward; do not apply this configuration to the running demo.

## Next steps

Repeat interruption and test an isolated provider disconnect during a turn.
Test a guarded, disposable coding fixture with the real local models, while
reviewing the synthetic transcript and delegated task for direction,
negation and filenames. The previous spoken coding trial reversed an
operation; a successful conversational question does not resolve that risk.
