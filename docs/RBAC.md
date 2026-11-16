# RBAC and granular feature activation

## Actual local voice and agent boundaries

The experimental voice gateway, including its opt-in LFM realtime path, does not authenticate users or enforce the React mockup's RBAC settings. It binds to loopback and rejects non-loopback provider URLs, but local processes can still access its services. SQLite event history is local and is not an immutable security audit.

Service discovery strips URL userinfo, query strings and fragments from displayed endpoint addresses. This does not sanitize arbitrary provider-supplied model metadata or secrets embedded in URL paths, authenticate local callers, or protect other service endpoints. Existing gateways require a restart to load this change.

When configured, the read-only resource endpoint exposes aggregate memory telemetry to clients that can reach the local gateway; it does not expose the sampler file path or apply a permission check. Resource reporting and advisory admission are not access-control or hard resource-isolation boundaries.

The optional one-task headroom projection is also unauthenticated telemetry, not an allocation or permission to execute a task.

The optional shared task-reservation database is a local coordination mechanism, not an authorization boundary. Any process able to alter it can invalidate its estimates; it stores resource estimates, process IDs, timestamps, OpenCode session IDs and random reservation identifiers, not task content.

The browser's task-result replay uses the existing same-session completion lookup. A resumed session is selected by possession of its browser-held capability; replay is not identity verification or RBAC. Spoken results may be overheard, and the user explicitly initiates replay of a historical result.

The experimental Windows native client opens the default microphone and speaker only when explicitly run; its synthetic tests and format checks do not open physical devices. A separate physical AEC probe opened them and retained aggregate levels only, without saving captured audio. A physical gateway-client test used a separate local SQLite database for transcripts; automatic cleanup was blocked by the execution environment, so that test database remains in `.cache/physical-native-probe-20261111/events.sqlite`. The client only accepts loopback gateway URLs and does not add authentication, change gateway permissions or provide an OS sandbox. Experimental AEC loads a pinned local research dependency.

An optional `ASSISTAI_DB_PATH=:memory:` setting keeps gateway SQLite events in a volatile process-local database. It is not authentication or secure erasure, and cannot rule out operating-system paging or data retained by other components. The physical probe requires a gateway that reports volatile storage before it opens devices; that unauthenticated report is a convenience check, not a security boundary.

The optional native speaker-extraction experiment reads an explicitly supplied local enrollment WAV into process memory. It does not create, copy or delete that file. Enrollment is not identity verification, authentication or access control; an incorrect enrollment can select another speaker. Normal operating-system paging and any other audio-processing services remain outside this guarantee.

When delegating, the gateway includes bounded recent session events in the OpenCode prompt. These may include private conversation excerpts and task results; they are transmitted to the configured local harness and may be retained according to that harness's settings. Labeling the excerpts untrusted is not a prompt-injection defense or a permission boundary. Reconnection normally creates a new session. An optional resume mode uses a browser-held bearer key to select prior events; possession of that key permits reuse and does not identify a user or implement RBAC.

A user-selected image can be sent with a spoken question in the cascade path. The gateway sends it to the configured loopback vision service; gateway event history records the question, not the image bytes. This does not constrain what the vision service itself retains, and the gateway remains unauthenticated.

The synthetic spoken-image probe sends a generated red image and synthetic French audio to a separate session on the running loopback demo. The probe saves timing and resource observations, not image or audio files; the demo keeps its own volatile text events for the session.

Playback-gap diagnostics stay in the local browser's conversation log; they do not record audio or create an authorization boundary.

The local synthetic TTS pacing probe sends fixed, non-personal phrases to a loopback service and keeps only timing and aggregate resource logs under `.cache`; it does not open a microphone or speaker.

Filtering explicit reasoning markers from cascade output is a presentation safeguard, not a confidentiality or prompt-injection boundary. Untagged content and formats not recognized by the filter can still be displayed or spoken; stored task results may retain their original content.

The resume key is stored in browser local storage and sent to the loopback gateway as a WebSocket subprotocol. The gateway stores a derived session identifier alongside unencrypted events, not the key itself, and rejects two concurrent connections using the same identifier. A task completion or error is sent to the currently connected holder of the same session key, if present. Scripts able to read that browser origin's local storage, local processes, and anyone with access to the SQLite database remain outside this protection. Stopping resume removes the browser key but leaves stored history; the prototype has no per-session deletion or key-recovery UI. Running-task tracking survives same-process reconnects only; notification queues are not restored and the bounded duplicate safeguards cannot guarantee idempotency.

The same bearer capability also exposes a bounded snapshot of recent task events, including task text and results, to a reconnecting client. The browser renders the snapshot as text. This increases the importance of protecting the key and the local history; it is not a user identity check.

The browser automatically reconnects after ordinary disconnections. If the user previously enabled the microphone, capture remains enabled locally and transmission resumes once the new connection is ready; audio is not sent while disconnected. A policy rejection stops automatic retries.

An independent, explicitly invoked Windows enrollment command can record the default microphone to a new user-chosen local WAV. It rejects existing paths and does not delete the file; the user controls its location and retention. Capture overflow aborts before writing, but a write error may leave a partial file. This command is not a security boundary, and a voice sample is sensitive personal data.

The separate LocalVQE physical research probe opens default audio devices, retains captured audio in process memory for offline processing, and prints aggregate measurements. It does not intentionally write captured audio to a file; operating-system paging and unrelated processes are outside that claim.

The optional resource admission check is an operational safeguard, not an authorization control; it does not establish an identity or grant or restrict filesystem permissions. Its process-local estimates account for concurrent accepted tasks but do not control actual allocations, external processes or work still running after gateway restart.

The optional speech-activity classifier is not speaker verification or an authorization control; background speakers and television dialogue may still activate it.

The optional native-mode transcription sidecar receives the same captured audio over loopback. Final transcripts and native assistant text are stored in the local SQLite event database and may be included in bounded context when the speech session resets. The database is not an authenticated or encrypted security boundary; transcripts can be inaccurate.

Native task notifications retrieve completed results only from the current gateway session and disable tool calls for the notification response. Result text remains untrusted model input; these restrictions do not provide authentication, sandboxing or complete prompt-injection protection.

Cascade notifications can speak a bounded excerpt of a completed result from the same gateway session. That sends task-result text to the configured local TTS service and makes it audible on the selected output device. Same-session scoping is not user authentication, and output may contain sensitive task data.

The port 18089 Windows demo launcher uses the existing read-only OpenCode fixture and volatile gateway history; enabling session resume in the browser does not make that memory durable across gateway restarts. The local gateway and OpenCode server remain unauthenticated local services. Advisory resource admission and session capabilities are not RBAC or a sandbox.

Reset context may also contain untrusted task results and approximate transcripts. Labeling them as data does not prevent prompt injection; the replacement speech session may use tools under the existing harness permissions.

Real-model synthetic reset tests repeated an already completed task. After a native reset, exact normalized requests can now reuse a session-local completed result unless the model sets a rerun flag; a single regression succeeded. A mock-service test covers reconstruction after reconnect from bounded same-session history. Different wording, in-flight work, incomplete history, cache eviction or an incorrect model-selected rerun flag can still repeat work. Reuse can also return stale information. This is not an authorization or idempotency guarantee; broader harness permissions could make repeated work consequential.

OpenCode applies its own configured permissions. The currently tested fixture configuration allows read, glob and grep and denies other actions; it is intended for disposable read-only research. A separate isolated fixture was used for one edit test with an explicit edit permission. These policies are application-level controls, not an OS sandbox or proof of complete filesystem or network isolation. Do not represent the mockup roles as protecting the real agent. See [architecture](ARCHITECTURE.md) for the two separate stacks.

An opt-in `-EditFixture` harness and gateway use the disposable `.cache/agent-edit-demo` workspace with OpenCode edit permission, `external_directory` denied and other unspecified actions denied. The gateway displays an operator-provided workspace label and requires task approval. The label is informational, not independent verification of permissions or a security boundary; other local clients may access the unauthenticated services, and application rules do not sandbox the process. Do not use this fixture to modify unrelated or valuable files.

The prepared voice-to-agent coding probe requires an explicitly selected `.cache` workspace and a separately configured gateway and harness. Its static arithmetic checker avoids executing the generated fixture but does not confine the harness. One synthetic text-driven real-agent edit passed; a synthetic spoken-input attempt stopped below the RAM reserve before completion. The current demo's read-only fixture remains unchanged.

Selecting separate trial ports does not change OpenCode's authority, authenticate either service, or isolate the workspace at the operating-system level.

In a later spoken coding trial, recognition and controller interpretation changed the requested operation before delegation. Any harness with write or command permissions could act on a similarly incorrect task. The current demo uses a read-only fixture; that observed failure does not validate broader permissions.

Optional speech review allows a user to correct the recognized text before the cascade calls the controller or vision service. It is a user-interface feature, not authentication, authorization or proof of intent; it is disabled by default. Pending review text and an optional image are held in the connection's process memory until submission, disabling review or disconnection.

The synthetic ASR coding probe sends fixed phrases only to loopback speech services and does not delegate tasks. Its word and token metrics are diagnostic, not a permission check or proof that an operation is safe to execute.

The Kyutai STT inventory reads explicitly selected local model metadata and file sizes without loading weights or accessing the network. It rejects configured asset paths outside the selected model directory; this inspection does not validate model provenance or trustworthiness.

The research-only CrispASR setup downloads a pinned public release archive, verifies its size and SHA-256, checks archive members and extracts to a new `.cache` directory. A later guarded comparison loaded a local model using synthetic audio, without opening a microphone. The checksum verifies the pinned bytes, not their safety or model provenance.

The optional ASR comparison writes only generated synthetic speech to a temporary `.cache` WAV for the file-oriented CLI and removes it on normal exit. A forced termination can leave that synthetic temporary file behind. It runs the candidate with an explicit local model path, CPU and French language flags and non-interactive input. Two earlier attempts stalled at an optional language-model download prompt; the corrected run completed, but network isolation was not independently measured.

The transcribe.cpp research setup downloads a pinned public runtime archive, checks its expected length, SHA-256 and archive entries, and extracts to a new local cache directory. The CPU-only discovery probe loads the native library but no model or audio device; it is not an assessment of binary trust or a sandbox.

The research ABI probe checks the pinned library's version and selected structure sizes and alignments before invoking initializers. It does not load untrusted model files or establish resource isolation.

The Voxtral cache estimator reads only bounded GGUF metadata from an explicitly selected file. It does not initialize the model or enforce any resource limit; its output must not be treated as authorization to allocate GPU memory.

The cancellation request checks membership in the gateway's current session task map before calling OpenCode. That is task scoping, not authentication or an RBAC boundary. Cancellation is best effort, can race completion and cannot undo actions. The gateway does not release an advisory memory estimate solely on an abort acknowledgment.

The browser's concurrent-task list is a local view of events received on its current connection, not authoritative task status or an access-control mechanism.

Retaining an uncertain task ID permits a same-session abort request and reduces duplicate submission of exactly matching requests. It does not authenticate the user, prevent differently worded duplicates, guarantee cancellation or survive a gateway restart.

Bounded status retries do not change task permissions or prove that cancellation took effect. The resource estimate remains held until the gateway observes a terminal result.

The rejected idle-cache experiment attempted to clear model inference cache, not gateway conversation history or OpenCode task data. The installed server refused the operation, and no cache-clearing or restart permission is implied for other processes.

Adding notification verification to the spoken probe does not alter the fixture permissions or give the gateway additional authority. The combined path has mock coverage only; its first real-run preflight did not meet the RAM threshold.

The experimental spoken completion notification uses a completed task event and does not grant new harness permissions. Its synthetic real-model test does not establish authentication, isolation, or authorization.

Notification rejection reasons expose whether a requested task result is available in the current session or the voice path is busy; they do not authenticate clients or authorize task execution.

## React mockup permissions

The prototype implements role-based permissions with per-user overrides. The demo enables every capability for every role by default, which is incompatible with least privilege and must not be reused as a production default.

| Key | Intended use |
| --- | --- |
| `web_search` | External search and grounding |
| `code_execution` | Script execution |
| `isolated_sandbox` | Network-free execution |
| `connected_sandbox` | Network and package access |
| `agentic_tasks` | Plan/action/observation loops |
| `image_generation` | Visual artifacts |
| `music_generation` | Music synthesis and artifacts |
| `threejs_3d` | Three.js meshes and rendering |
| `enterprise_connectors` | Atlassian, Microsoft, and Google integrations |
| `mcp_plugins` | External tools and extensions |
| `hardware_override` | Hardware scripts and settings |
| `user_management` | Accounts, roles, and API keys |
| `delete_project` | Project and session deletion |

An explicit `true` or `false` user override takes precedence over the role setting; removing it restores inheritance. The four demo roles all start with the same 13 permissions. The server evaluates permissions in `isFeatureAllowedForCurrent`, including tool execution and project deletion; the React console updates demo settings and displays audit entries.

Switching users selects a global in-memory demo profile. Displayed API keys are demo values and are neither validated nor hashed. RBAC configuration routes do not require proof of identity, and logs are mutable and ephemeral. This is a demonstration mechanism, not an effective security boundary. Real use requires per-request authentication, identity derived from verified tokens, isolation, append-only auditing, and default-deny permissions.
