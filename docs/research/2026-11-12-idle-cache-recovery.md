# EXP-150: Idle agent prompt-cache recovery

## Hypothesis

After EXP-144, the agent model was idle but its working set remained approximately 4 GiB, leaving insufficient available RAM for the guarded ASR benchmark. Its single exposed slot showed 5,034 prompt tokens. Clearing an idle prompt cache might reduce host memory without restarting the model or discarding gateway conversation history. The [llama.cpp server documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) describes an erase-slot action, but support and memory effects depend on the installed build and configuration.

## Observation

Immediately before the request, the only agent slot reported `is_processing: false`. The running LM Studio llama.cpp Vulkan server used `--no-host --cache-ram 0` and did not include `--slot-save-path`. A POST to `/slots/0?action=erase` returned HTTP 501, explicitly stating that slot actions require `--slot-save-path`. No cache was erased. The slot remained idle with 5,034 prompt tokens. The process working set remained 4,265,299,968 bytes and private bytes remained 13,822,300,160 in the immediate before/after observations. System available RAM changed from 7,351,316,480 to 7,378,120,704 bytes; these global snapshots fluctuate and do not demonstrate a causal memory change. The current demo health endpoint remained available.

## Interpretation and next step

The server refused the proposed recovery; this is not evidence that erasing a cache would have reclaimed memory. No conversation history, OpenCode session, model service or process was restarted. Adding a slot-save path would require a different server startup and could enable disk-based slot operations; its memory and SSD behavior must be tested in an isolated controlled run before adoption. The ASR benchmark remains below its 8 GiB preflight. Investigate host memory allocation and model lifecycle using the existing guarded A/B harness when resources and an isolated model instance permit it.
