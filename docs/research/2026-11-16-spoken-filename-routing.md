# Spoken filename and task routing — 2026-11-16

## Observation

The operator reported that a French request to read `fixture.txt` was transcribed with a distorted filename. The controller said it could not access the misrecognized file and asked for clarification; spelling it aloud produced another incorrect transcript. No agent task was proposed in the reported exchange. This is physical user feedback, not a controlled ASR benchmark. Previous EXP-185 independently documented identifier errors in synthetic French coding speech.

## Targeted local comparison

Hypothesis: making the tool description explicitly mention file reads may prevent the controller from saying it cannot inspect a file, without introducing unsafe filename guesses. `node scripts/probe-file-routing.mjs` sends synthetic text directly to the already loaded LFM3-1.7B Q8 llama.cpp server on loopback. It uses temperature zero and does not execute any tool calls. The first run compared the existing prompt with a file-aware version on three examples: an exact `fixture.txt` request, the observed distorted filename and a greeting. The exact request produced one `delegate_task` call with `fixture.txt` in both variants, and the greeting produced an ordinary answer in both. On the distorted filename, the existing prompt asked for clarification, while the file-aware prompt proposed reading a file with that distorted literal name.

The second run used `PROBE_VARIANT=file-aware-clarify` to add instructions to ask for an exact filename when it is unclear. It again routed the exact name and did not delegate the greeting. On the distorted filename, however, the model proposed a task that introduced possible `.txt` and `.fixed` extensions. The stronger prompt did not reliably prevent guessing in this one case. This experiment is a small synthetic routing comparison, not an ASR test, semantic benchmark or guarantee about other prompts, temperatures or conversation histories. No returned tool was executed and no new model was loaded.

## Decision and practical workaround

Do not adopt either file-aware prompt on this evidence: they can turn an uncertain transcript into a misleading task proposal. The current prototype already has **Review speech before sending**, which allows the operator to correct the transcript to `fixture.txt` before submission, or the request can be entered directly in the text field. If a task is proposed, the original and proposed requests must still be checked before clicking approval. An exact typed request elicited a file-read proposal in this isolated probe; a physical voice-to-approved-agent completion remains unverified. This workaround does not solve spoken spelling, ASR quality or general task routing.
