# EXP-141: Explicit reasoning in spoken responses

## User observation and hypothesis

After the speech normalization change, the user reported some improvement but said the model still vocalized its reasoning. The specific excerpt was not present in the received message and has been requested. Inspection showed that the prior speech projection removed HTML-like tags while retaining their enclosed contents: `<think>reasoning</think>` would therefore be spoken.

## Change and verification

Cascade text and vision answers now remove explicit `<think>` and `<analysis>` blocks before display, event history and speech. Notification speech uses the same removal on completed task results, while the full task result remains visible in the task event. An unfinished opening block is discarded to the end, and a leading orphan closing marker discards the preceding text; these conservative choices can omit useful output. If nothing remains, the gateway reports an empty-answer error rather than speaking the block.

Eight targeted tests passed, including a mock gateway test in which the model returned `<think>PRIVATE REASONING</think>OK`: the displayed assistant event and the TTS request contained only `OK`. A new instance was started on port 18091 for user testing with the existing services and volatile history. No user voice or physical playback was tested by the experiment.

## Limits and next step

The filter handles only the specified markers and is not a general reasoning detector, security boundary or guarantee against unmarked analysis. The native speech bridge produces audio directly and is not filtered by this mechanism. Check the user's actual excerpt when available and verify speech in the updated instance; adapt the parser to an observed format without discarding ordinary answer text unnecessarily.
