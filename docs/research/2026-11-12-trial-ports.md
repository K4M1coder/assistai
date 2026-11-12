# EXP-142: Separate ports for the guarded spoken-coding trial

## Hypothesis and change

The user-facing demos now occupy ports 18090 and 18091, which were hard-coded in the guarded trial. Parameterizing its agent and gateway ports should permit a future isolated test without stopping the active demos, provided the original resource guards pass. Both port numbers must be distinct, in range and unoccupied. The trial continues to use loopback and its own process handles.

## Verification

The script rejected identical ports and refused an occupied demo port without starting a trial. With free ports 18092 and 18093, a spoken-input preflight reached the resource checks and measured 9,803,358,208 bytes available RAM, below the existing 10 GiB requirement; shared GPU memory was 264,257,536 bytes against a conservative absolute 256 MiB threshold, and dedicated use was 16,114,352,128 bytes. No trial process or inference was started. Existing gateways were left running. Four JavaScript and two Python tests covering related speech and notification behavior passed.

The port configuration has not yet been exercised through a complete real trial. Port selection does not reserve a listener against races, isolate the workspace or enforce a hard memory ceiling. Retry only when the same preflight conditions are met; do not lower them based on this result.
