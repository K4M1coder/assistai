# Benchmark protocol

## Preconditions

Run on mains power with stable GPU clocks and no other GPU load. Record hardware, OS, driver, runtime, Git commit, model hash, quantization, context settings, and command. Run five cold and 20 warm repetitions.

## Metrics

- `e2e_first_audio_ms`: end of user speech to first audible sample.
- `barge_in_stop_ms`: detected interruption onset to last audible assistant sample.
- `stt_partial_ms` and WER on an explicitly authorized French/English corpus.
- `llm_ttft_ms`, tokens/s, and tool-call JSON validity.
- `tool_e2e_ms`, task success rate, and correctly denied actions.
- Peak/P95 VRAM, RAM, power, temperature, errors, and OOMs.

## Minimal corpus v0

50 short French conversational requests; 30 interruptions during responses; 20 coding requests in a toy repository; 10 descriptions of locally supplied images; 10 slow tools; and 10 forbidden tools. Audio must be generated or collected with consent; no personal recordings are committed.

## Log format

Each line in `experiments.jsonl` is a standalone JSON object with `id`, `date`, `hypotheses`, `status`, `environment`, `command`, `metrics`, `artifacts`, `conclusion`, and `next`. Status is `planned`, `running`, `passed`, `failed`, or `inconclusive`.
