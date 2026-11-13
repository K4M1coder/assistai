# EXP-163: Older trial guard audit

Four earlier Windows research scripts used 256 MiB of shared GPU growth relative to their starting baseline. With a nonzero baseline, that allowed total adapter shared usage above the current conservative 256 MiB absolute threshold. Their preflight and sampling conditions now use the absolute threshold. PowerShell parsing passed for all four scripts; no trial or GPU model was launched. Historical experiment results retain their original limits and are not retroactively reclassified.

An independent read-only check of the latest messages in 30 existing local OpenCode sessions found 28 idle `stop` candidates and two `length` candidates. The new classifier identifies the latter for the gateway's error path. This inspects session metadata without running inference; it does not validate task outcomes or the live gateway's version.

The shared-GPU reading before inspection was 265,142,272 bytes against the 268,435,456-byte guard. Sampling can miss a spike, total shared use may include unrelated processes, and terminating a probe does not necessarily abort an already submitted agent task. The guard is advisory and does not establish that model allocations never spill to host memory or storage.
