# EXP-144: Guarded synthetic spoken coding trial

## Protocol

After stopping superseded owned demo instances on ports 18089 and 18090, while retaining the current demo on 18091, a new disposable subtraction fixture was prepared. The combined spoken-input and notification trial used separate ports 18092 and 18093, existing local models, a 10 GiB RAM preflight, a 6 GiB stop reserve, 22 GiB dedicated GPU and 256 MiB absolute shared thresholds. No physical audio device was opened. OpenCode permissions are not an OS sandbox.

## Observation

Preflight measured 10,741,264,384 bytes available RAM, only slightly above the threshold. The synthetic question requested correcting `calculator.py` from subtraction to addition. Vosk instead returned a transcript resembling `dans le fichier calculateur point corrige la fonction a pour faire une addition soustraction ne change rien d'autre`; it lost the filename and operation distinction. The controller delegated a request to change addition into subtraction in `calculateur point`, reversing the intended operation. A separate synthetic follow-up received a greeting while the task was running.

After 56 samples the watchdog stopped the trial for available RAM below the 6 GiB reserve. The lowest sample was 6,302,416,896 bytes; maximum dedicated GPU use was 16,159,920,128 bytes and maximum shared use 264,257,536 bytes. The probe reported a fetch error during teardown. The fixture remained `return a - b`; no successful completion or notification was observed. Trial listeners were gone afterward and the port 18091 demo remained active. The samples cannot establish actual peak allocations or absence of paging.

## Interpretation and next step

This is a failed end-to-end spoken coding trial, not proof that general French speech always fails. It demonstrates that the existing ASR and controller can alter a consequential request before delegation, and that the current model combination can exhaust its RAM reserve even after the provisional preflight. Do not broaden the demo harness permissions on this evidence.

The [Vosk model list](https://alphacephei.com/vosk/models) reports lower benchmark word error rates for its large French model than the small French model, but also warns that large models can require substantial RAM. The [adaptation documentation](https://alphacephei.com/vosk/adaptation) describes dynamic vocabulary on compatible graphs. Neither establishes that either approach fits the present machine or avoids semantic inversion. Compare recognition on a small, fixed set of spoken coding requests, including filenames, negation and operation direction, with guarded memory and latency measurements before selecting an alternative. The existing real-user Nantes-news example also demonstrates that the current read-only agent has no live browsing tool.
