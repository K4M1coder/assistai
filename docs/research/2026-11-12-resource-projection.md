# EXP-135: Task headroom projection

## Hypothesis

A resource snapshot can be above the base RAM reserve while the configured estimate for an additional task would violate that reserve. Showing a separate projection should make that distinction visible before submission.

## Method and results

The status calculation uses the same budget function, sample and configured one-task estimates as admission. A deterministic test supplied 8.9 GiB available RAM, a 3 GiB task estimate and a 6 GiB reserve: the base status was `observed`, while the task projection was `insufficient`. At 10 GiB the same projection showed estimated headroom. A separate 257 MiB shared-memory sample with a zero baseline exceeded the 256 MiB threshold. An isolated gateway returned the expected insufficient projection with the configured admission sample. The resource-status, gateway status, admission and client-mode test suites passed (13 tests).

## Interpretation and next experiment

The projection is advisory and excludes active task reservations; it cannot predict future allocation, guarantee admission or enforce the hardware budget. Reporting and admission must use the same configured sample path for it to appear. The running gateway must be restarted to load the endpoint change. Compare the projection with real admission decisions and concurrent workloads; physical voice and sustained no-spill behavior remain separate unverified requirements.
