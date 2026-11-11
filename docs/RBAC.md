# RBAC and granular feature activation

## Actual local voice and agent boundaries

The experimental voice gateway, including its opt-in LFM realtime path, does not authenticate users or enforce the React mockup's RBAC settings. It binds to loopback and rejects non-loopback provider URLs, but local processes can still access its services. SQLite event history is local and is not an immutable security audit.

The experimental Windows native client opens the default microphone and speaker only when explicitly run; its synthetic tests and format checks do not open physical devices. A separate physical AEC probe opened them and retained aggregate levels only, without saving captured audio. A physical gateway-client test used a separate local SQLite database for transcripts; automatic cleanup was blocked by the execution environment, so that test database remains in `.cache/physical-native-probe-20261111/events.sqlite`. The client only accepts loopback gateway URLs and does not add authentication, change gateway permissions or provide an OS sandbox. Experimental AEC loads a pinned local research dependency.

An optional `ASSISTAI_DB_PATH=:memory:` setting keeps gateway SQLite events in a volatile process-local database. It is not authentication or secure erasure, and cannot rule out operating-system paging or data retained by other components. The physical probe requires a gateway that reports volatile storage before it opens devices; that unauthenticated report is a convenience check, not a security boundary.

The optional native speaker-extraction experiment reads an explicitly supplied local enrollment WAV into process memory. It does not create, copy or delete that file. Enrollment is not identity verification, authentication or access control; an incorrect enrollment can select another speaker. Normal operating-system paging and any other audio-processing services remain outside this guarantee.

When delegating, the gateway includes bounded recent events from the current connection in the OpenCode prompt. These may include private conversation excerpts and task results; they are transmitted to the configured local harness and may be retained according to that harness's settings. Labeling the excerpts untrusted is not a prompt-injection defense or a permission boundary. Reconnection creates a new session rather than granting access to earlier context.

An independent, explicitly invoked Windows enrollment command can record the default microphone to a new user-chosen local WAV. It rejects existing paths and does not delete the file; the user controls its location and retention. Capture overflow aborts before writing, but a write error may leave a partial file. This command is not a security boundary, and a voice sample is sensitive personal data.

The optional resource admission check is an operational safeguard, not an authorization control; it does not establish an identity or grant or restrict filesystem permissions. Its process-local estimates account for concurrent accepted tasks but do not control actual allocations, external processes or work still running after gateway restart.

The optional speech-activity classifier is not speaker verification or an authorization control; background speakers and television dialogue may still activate it.

The optional native-mode transcription sidecar receives the same captured audio over loopback. Final transcripts and native assistant text are stored in the local SQLite event database and may be included in bounded context when the speech session resets. The database is not an authenticated or encrypted security boundary; transcripts can be inaccurate.

Native task notifications retrieve completed results only from the current gateway session and disable tool calls for the notification response. Result text remains untrusted model input; these restrictions do not provide authentication, sandboxing or complete prompt-injection protection.

Reset context may also contain untrusted task results and approximate transcripts. Labeling them as data does not prevent prompt injection; the replacement speech session may use tools under the existing harness permissions.

Real-model synthetic reset tests repeated an already completed task. After a native reset, exact normalized requests can now reuse a session-local completed result unless the model sets a rerun flag; a single regression succeeded. Different wording, reconnection, cache eviction or an incorrect model-selected rerun flag can still repeat work. Reuse can also return stale information. This is not an authorization or idempotency guarantee; broader harness permissions could make repeated work consequential.

OpenCode applies its own configured permissions. The currently tested fixture configuration allows read, glob and grep and denies other actions; it is intended for disposable read-only research. A separate isolated fixture was used for one edit test with an explicit edit permission. These policies are application-level controls, not an OS sandbox or proof of complete filesystem or network isolation. Do not represent the mockup roles as protecting the real agent. See [architecture](ARCHITECTURE.md) for the two separate stacks.

The experimental spoken completion notification uses a completed task event and does not grant new harness permissions. Its synthetic real-model test does not establish authentication, isolation, or authorization.

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
