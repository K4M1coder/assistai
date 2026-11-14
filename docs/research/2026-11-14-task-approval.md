# EXP-186: Explicit approval before agent submission

## Hypothesis and implementation

Showing the request and proposed task before submission can let an operator
decline a controller's incorrect proposal. It does not prove that the
operator will detect every mistake, authenticate the speaker, sandbox the
agent or restrict what an approved task can do.

The current gateway creates at most one pending proposal per connection.
Only a matching, explicit `approved: true` message initiates agent
submission. A proposal expires after five minutes, is single-use, and is
discarded when the connection closes. A decline starts no task. Admission
checks still run after approval. The browser displays the original text
request and the controller's proposed task; the native bridge does not
reliably associate the parallel transcript with its tool call, so its
original request is explicitly shown as unavailable. The native terminal
client prints the proposal and accepts `Y` or `N`. A missing original request
is a reason for caution, not evidence that the proposal is correct.

Both cascade and native bridge use the same gateway approval path. Earlier
gateway processes must be restarted to acquire it. The browser warns if a
gateway does not advertise approval support. Existing synthetic editing
probes decline proposals and report that interactive approval is required;
they no longer automatically exercise agent execution through this gateway.
Other older probes that assumed automatic delegation may need adaptation.

## Verification

On Windows 11 build 26200, Intel Arc Pro B60 driver 32.0.101.8805, Node
v24.14.1 and Python 3.11.14, the source included pre-existing uncommitted
changes to `gateway.mjs` and `agent-context.mjs`, plus the approval work.
With existing services and a new volatile gateway on port 18095, a fixed
synthetic text request through the real LFM3 controller produced a proposal
in 609 ms from WebSocket connection. An automated explicit decline produced
the expected decline event and 174,720 bytes of French TTS. The displayed
answer said the task awaited confirmation; no physical audio device was
opened. A separate integrated-browser test displayed both original and
proposed text, then clicked Decline. This is not a human approval or a live
successful agent execution.

Mock-based gateway integration verifies no agent session before approval and
only one session after a duplicate approval. Unit tests cover rejection,
expiry, malformed approval and disconnect. Native gateway lifecycle and
resource-admission integration tests were updated to approve explicitly.
The full JavaScript prototype suite passed 82 tests before the last small
client-status and probe updates; a subsequent targeted run passed 10
JavaScript and 7 Python tests. Mock results do not prove physical voice,
real-agent completion or robustness against malicious local clients.

The gateway on 18095 was restarted after the test to load the latest approval
code. Its restart sample showed 11,338,194,944 bytes dedicated GPU memory,
203,087,872 bytes shared GPU memory, and 10,449,575,936 bytes available RAM.
These are advisory samples, not hard reservations or no-spill proof. The
older 18094 process has no approval enforcement; it remains separate to
preserve its volatile session. Do not use it for consequential delegation.

## Next step

Use the port 18095 browser and explicitly approve a harmless read-only
fixture request after inspecting both texts. Confirm task completion and its
notification, without storing personal conversation or approving a
misstated proposal. Test physical audio with the new gateway and repeat
manual interruption. The current approval changes must be integrated with
the pre-existing uncommitted work before a coherent commit can be made.
