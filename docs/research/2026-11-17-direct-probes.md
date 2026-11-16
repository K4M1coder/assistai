# Historical direct agent probes — 2026-11-17

## Finding and changes

While examining native speech experiments EXP-049, EXP-050 and EXP-053, four older scripts were found to submit tasks directly to an OpenCode server without using the later gateway approval panel. The coding probe also executed the resulting Python fixture as part of verification. These scripts are experimental tools and their earlier recorded results remain historical observations, but rerunning them without review would bypass the current human-approval workflow.

The four direct probes now require an interactive terminal and explicitly ask the operator to approve the task before creating an OpenCode session. The native probes show the actual generated task; the fixed-task probes show their request. They identify the server and ask the operator to verify its workspace and permissions. The direct edit probe now uses `scripts/verify-add-fixture.py`, a restrictive AST-based arithmetic check, rather than executing model-generated Python. These changes do not add gateway resource admission or isolation to direct calls and do not prevent another local process from accessing the unauthenticated harness.

## Validation and remaining work

On Windows with Node v24.14.1, `node --test prototype/direct-probe-approval.integration.test.mjs prototype/interactive-probe-approval.test.mjs` passed two tests. The first launched all four scripts without an interactive terminal and verified that a mock harness received no requests. The second used in-memory terminal streams to exercise an explicit affirmative response. `python -m unittest prototype.test_verify_add_fixture` passed two static-verifier tests. No actual harness session, physical audio, GPU load, or attended direct-probe run was performed. A terminal prompt does not prove that the human reviewed the correct workspace or that OpenCode will respect its configured permissions.
