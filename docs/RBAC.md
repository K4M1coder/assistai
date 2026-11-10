# RBAC and granular feature activation

## Actual local voice and agent boundaries

The experimental voice gateway, including its opt-in LFM realtime path, does not authenticate users or enforce the React mockup's RBAC settings. It binds to loopback and rejects non-loopback provider URLs, but local processes can still access its services. SQLite event history is local and is not an immutable security audit.

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
