# EXP-175: Controller comparison protocol

`scripts/probe-controller-delegation.mjs` sends six fixed synthetic French text requests to a credential-free loopback OpenAI-compatible endpoint. Cases include opposing operation directions, a prohibition on deletion, a sourced research request and two ordinary conversational requests. It uses the cascade's tool schema and system instruction, requests deterministic sampling, and records elapsed time, returned tool arguments, answer and structural validity. It does not execute a tool call or create an agent task.

Passing the structural check only means the expected kind of response and tool-call format were returned. Every result is explicitly marked `semanticReview: required`: a human must check operation direction, filename, negation, scope, city, recency, sources and unsupported completion claims. A mock test deliberately returns a structurally valid but semantically wrong task and confirms it is not automatically declared semantically correct. This small text-only set does not test ASR, acoustics, long conversations, model safety or general task capability.

For a future Q8 versus Q4 run, use the same backend version, GPU, context, KV type, server options, prompts and sampling; record exact model hashes, cold/warm conditions, request order, wall latency and system-wide resource samples. Run variants in an isolated guarded setup with sufficient headroom rather than loading both into the active demo. Review every output before comparing results. Model nondeterminism and a small case set limit conclusions. No real model was run for this preparation.

```powershell
$env:LOCAL_MODEL_URL='http://127.0.0.1:PORT/v1'
node scripts/probe-controller-delegation.mjs
```

Replace `PORT` with an explicitly prepared local server. The command can increase model and system memory use; it does not itself enforce resource limits.
