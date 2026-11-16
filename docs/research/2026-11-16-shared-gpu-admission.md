# Shared GPU admission rejection — 2026-11-16

## Observation and hypothesis

The operator reported that approval reached submission, but requests were rejected with `Shared GPU memory growth exceeds the configured limit`. The demo uses an absolute 256 MiB shared-GPU threshold because no clean pre-model shared baseline was established. With its configured baseline of zero, the previous wording incorrectly suggested a measured increase from a real baseline. Approval is separate from resource admission: it does not override the memory guard.

## Diagnosis and intervention

The running gateway reported 6,241,857,536 bytes dedicated GPU, 5,507,411,968 bytes shared GPU, 13,604,343,808 bytes available physical RAM and 2,165,309,440 bytes system pagefile use. Windows per-process counters attributed 5,336,219,648 bytes of shared GPU allocations and 2,626,994,176 bytes of dedicated allocations to the owned Gemma llama-server process. Counter values are snapshots and cannot identify specific tensors or prove why those allocations moved; system-wide pagefile usage is not process attribution. The total was far above the configured guard and is consistent with the rejection. The OpenCode status endpoint returned no busy sessions and the model slot reported idle.

The owned idle Gemma server was stopped using its recorded PID, start time and command line. A later adapter sample reported 170,143,744 bytes shared GPU usage. The guarded launcher started the same Q4 model and BF16 projector again. Its preflight showed 156,446,720 shared bytes; across eight startup samples the maximum shared value was 179,400,704 bytes, maximum dedicated value 11,382,046,720 bytes and minimum available RAM 17,659,834,368 bytes. A subsequent per-process sample reported 22,953,984 shared bytes and 7,832,543,232 dedicated bytes for the restarted server. The gateway then reported estimated headroom for one task. These observations support the restart as a temporary recovery, not a hard memory limit, no-spill proof or guarantee against recurrence. No unrelated process was stopped; the gateway and conversation were retained.

## Messaging and remaining work

When the configured baseline is zero, admission now describes the observed **total** shared memory and its limit in MiB. With a nonzero baseline it still describes growth. The threshold and admission behavior are unchanged. Sixteen focused unit and mock-gateway tests passed after updating an existing case-sensitive assertion. Running gateways must restart to use this wording; the operator's active gateway was left intact. A real task still requires the operator to approve a matching proposal. The existing fixture allows only read, glob and grep: web research and file editing remain unavailable, independently of the GPU guard. Continuous monitoring and a measured explanation or prevention of the shared-memory rise remain open; current startup checks and task admission do not stop later residency changes.
