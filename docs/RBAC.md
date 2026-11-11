# RBAC and granular feature activation

## Actual local voice and agent boundaries

The experimental voice gateway, including its opt-in LFM realtime path, does not authenticate users or enforce the React mockup's RBAC settings. It binds to loopback and rejects non-loopback provider URLs, but local processes can still access its services. SQLite event history is local and is not an immutable security audit.

The optional resource admission check is an operational safeguard, not an authorization control; it does not establish an identity or grant or restrict filesystem permissions.

The optional native-mode transcription sidecar receives the same captured audio over loopback. Final transcripts and native assistant text are stored in the local SQLite event database and may be included in bounded context when the speech session resets. The database is not an authenticated or encrypted security boundary; transcripts can be inaccurate.

Native task notifications retrieve completed results only from the current gateway session and disable tool calls for the notification response. Result text remains untrusted model input; these restrictions do not provide authentication, sandboxing or complete prompt-injection protection.

Reset context may also contain untrusted task results and approximate transcripts. Labeling them as data does not prevent prompt injection; the replacement speech session may use tools under the existing harness permissions.

Real-model synthetic reset tests repeated an already completed task. Duplicate execution is not prevented after completion; the read-only fixture made the observed repeats low impact, but other harness permissions could make repeats consequential.

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
