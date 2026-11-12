# Extended RBAC & Granular Feature Activation Interface (24GB VRAM)

An architectural plan for an **Extended Role-Based Access Control (RBAC)** and **granular user feature-flagging engine**, enabling administrators to toggle specific capabilities on/off both per role and per individual user. In accordance with requirements, the **demo interface comes with all capabilities authorized and enabled by default**, with an interactive control console to toggle any permission on demand.

---

## User Review & Confirmed Specifications

> [!IMPORTANT]
> **Key Directives:**
> - **Extended Granular Capabilities**: Includes fine-grained toggles for:
>   1. **Web Search** (Live web grounding & internet search)
>   2. **Code Execution** (General code runner)
>   3. **Isolated Sandbox** (Air-gapped local V8 isolate)
>   4. **Connected Sandbox** (Outbound network access, npm/pip package installation)
>   5. **Agentic Tasks** (Autonomous OpenHands / Hermes multi-step action-observation loops)
>   6. **Image Generation** (Visual asset synthesis)
>   7. **Music Generation** (Polyphonic sound synthesizer)
>   8. **3D Engine & Shaders** (Three.js WebGL scene generation)
>   9. **Enterprise Connectors** (Atlassian Jira, Microsoft Teams, Google Workspace)
>   10. **MCP & Plugins** (Model Context Protocol tool extensions)
>   11. **Hardware Overrides** (VRAM reallocation, Intel Arc Pro B60 level-zero tuners)
>   12. **User & Role Management** (User creation, role assignment, API keys)
>   13. **Project Deletion** (Destructive project & session deletion)
> - **Demo Default Configuration**: **ALL functions are authorized and activated by default** out-of-the-box so the user can test the full power of the workstation immediately without friction.
> - **User-Level Overrides**: In addition to role baseline templates, individual user accounts can have custom feature overrides enabled/disabled.

---

## 1. Extended Capabilities Matrix & Default Demo State

All capabilities are set to **ENABLED (true)** by default in demo mode:

| Feature Key | Display Name | Category | Demo Default | Description |
| :--- | :--- | :--- | :---: | :--- |
| `web_search` | Web Search | Intelligence | **Active** | Live external search grounding & web queries |
| `code_execution` | Code Execution | Sandbox | **Active** | Execute scripts in local sandbox isolates |
| `isolated_sandbox` | Isolated Sandbox | Security | **Active** | Strict air-gapped CPU/RAM sandbox with zero network |
| `connected_sandbox` | Connected Sandbox | Network | **Active** | Network-enabled sandbox with external package installs |
| `agentic_tasks` | Agentic Tasks | Autonomous | **Active** | OpenHands / Hermes multi-step goal execution loops |
| `image_generation` | Image Generation | Media | **Active** | Generative neural visual rendering |
| `music_generation` | Music Generation | Audio | **Active** | Polyphonic 6-voice synthesizer and MIDI generator |
| `threejs_3d` | 3D Engine & Shaders | 3D WebGL | **Active** | Three.js procedural meshes, PBR shaders, particle systems |
| `enterprise_connectors`| Enterprise Connectors | DevOps | **Active** | Atlassian Jira, Microsoft Teams, Google Workspace |
| `mcp_plugins` | MCP & Plugins | Extensibility | **Active** | Model Context Protocol tool calling and external endpoints |
| `hardware_override` | Hardware Overrides | System | **Active** | Intel Arc B60 24GB VRAM reallocation & launch scripts |
| `user_management` | User Management | Security | **Active** | Create accounts, assign roles, generate/revoke API keys |
| `delete_project` | Project Deletion | Storage | **Active** | Permanently delete projects and conversation sessions |

---

## 2. Multi-Tier RBAC & User Override Hierarchy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ROLE BASELINE TEMPLATES                         │
│                                                                        │
│  [Admin]           [AI Engineer]        [Operator]         [Viewer]    │
│  • 13/13 Allowed   • 10/13 Allowed      • 7/13 Allowed     • 3/13 Allw │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   INDIVIDUAL USER CUSTOM OVERRIDES                     │
│                                                                        │
│  User: kamicth@gmail.com (Admin)         -> All 13 Allowed (Default)   │
│  User: alex.chen@ai-lab.local (AI Eng)   -> Custom: +Hardware Tuning   │
│  User: elena.r@ops.local (Operator)      -> Custom: +Web Search        │
│  User: guest.auditor@telemetry (Viewer)  -> Custom: Read-Only Baseline │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   RUNTIME ACCESS ENFORCEMENT ENGINE                    │
│                                                                        │
│  • Effective Permission = UserCustomOverride ?? RoleDefaultPolicy      │
│  • REST API: Blocks unauthorized requests (HTTP 403 Forbidden)         │
│  • WebSockets: Rejects unauthorized tool calls with spoken refusal     │
│  • Frontend: Real-time interactive toggle switches & visual lock cues  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. UI/UX Design for Extended RBAC Studio

Following `frontend-design` principles:
- **Clean Unboxed Architecture**: Monospace capability keys, high-contrast toggle switches, and no decorative pill clutter.
- **Top Bar User Profile & Role Switcher**:
  - Direct switcher in `Navbar.tsx` displaying current user, role badge, active token status, and quick-toggle to test different user profiles instantly.
- **Interactive RBAC Management Console (`RBACSecurityStudio.tsx`)**:
  1. **Tab 1: Feature Matrix & Toggles**:
     - Visual grid listing all 13 features with individual toggle switches for each role.
     - "Reset to Demo Defaults (Enable All)" 1-click button.
  2. **Tab 2: User Profiles & Overrides**:
     - User accounts list with avatar, email, assigned role, and individual custom feature override switches.
     - API Key generator for CLI, background daemons, or Model Context Protocol (MCP) clients.
     - "Add user" modal with instant role and permission customization.
  3. **Tab 3: Sandbox & MCP Configuration**:
     - Status of Isolated vs Connected Sandbox (network access, package repository whitelist).
     - MCP servers and external tool gateway allowance status.
  4. **Tab 4: Security Audit Logs**:
     - Live stream of all attempted actions, user identity, permission evaluated, and outcome (`GRANTED` vs `DENIED`).

---

## 4. Technical Implementation Sequence

### Step 1: Types & Extended Schema (`src/types/index.ts`)
- Define `ExtendedFeatureKey` covering all 13 capabilities.
- Define `UserPermissionsMap = Record<ExtendedFeatureKey, boolean>`.
- Extend `UserProfile` with `customOverrides?: Partial<UserPermissionsMap>`.
- Define `RolePolicyTemplate = Record<UserRole, UserPermissionsMap>`.

### Step 2: Server-Side State & Middleware (`server.ts`)
- In-memory RBAC store with default demo policies where **every feature is set to `true`**.
- Endpoints:
  - `GET /api/auth/current-user`: Returns current active session user and effective permissions.
  - `POST /api/auth/switch-user`: Switches active demo user.
  - `GET /api/auth/roles-permissions`: Returns the full feature matrix.
  - `PUT /api/auth/roles-permissions`: Updates role baseline toggles.
  - `PUT /api/auth/users/:id/overrides`: Updates an individual user's feature toggles.
  - `POST /api/auth/users`: Adds a new local user.
  - `GET /api/auth/audit-logs`: Returns authorization history.
- Gated endpoints:
  - Code sandbox (`code_execution`, `isolated_sandbox`, `connected_sandbox`).
  - Web search (`web_search`).
  - Agentic tasks (`agentic_tasks`).
  - Hardware overrides (`hardware_override`).
  - Project deletion (`delete_project`).
  - MCP & plugin triggers (`mcp_plugins`).
- WebSocket voice tool execution gate: verifies the active user's permissions before running the tool, verbalizing a polite spoken refusal if disabled.

### Step 3: Client Auth & Permission Service (`src/services/authService.ts`)
- Reactive singleton managing active user, token, and effective permission calculation:
  ```typescript
  isFeatureAllowed(feature: ExtendedFeatureKey): boolean
  ```
- Instant notification listeners so that changing a toggle in the RBAC studio updates the entire UI immediately.

### Step 4: Component Implementation (`src/components/RBACSecurityStudio.tsx`)
- Build the comprehensive management console with:
  - Interactive feature matrix with toggle switches.
  - Individual user overrides editor.
  - Sandbox & MCP configuration panel.
  - Live audit log stream.

### Step 5: Integration & Visual Gating (`Navbar.tsx`, `App.tsx`, `AgentHarnessStudio.tsx`)
- Add user switcher dropdown and "Security & RBAC" button in `Navbar.tsx`.
- Connect UI elements (Code runner, Web search chips, 3D generator, Music synth, Project delete button) to `isFeatureAllowed()`.
- If a feature is toggled off, show a locked state with an inline toggle shortcut for admins.

### Step 6: Verification
- Co-execute `compile_applet` and `lint_applet` to verify zero errors across the entire application.
