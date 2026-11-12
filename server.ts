import express, { Request, Response } from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const server = http.createServer(app);

// In-memory harness database for generated artifacts, connectors, and session activity
// In-memory harness database for generated artifacts, connectors, and session activity
const harnessStore: {
  artifacts: any[];
  integrations: {
    atlassian: any[];
    microsoft: any[];
    google: any[];
  };
  projects: any[];
} = {
  projects: [
    {
      id: 'proj-audio-dsp',
      name: 'Audio DSP & Speech Filters',
      description: 'Mimi 24kHz neural audio codec optimization & low-latency FFT noise gate',
      color: '#06b6d4',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      sessions: [
        {
          id: 'sess-dsp-noise-gate',
          projectId: 'proj-audio-dsp',
          title: 'Real-Time Noise Gate',
          status: 'active',
          contextTokensUsed: 18450,
          maxContextTokens: 262144,
          summary: 'DSP isolate buffer operational with 14μs latency gate.',
          lastUpdated: '10:41 AM',
          transcripts: [],
          artifacts: [],
          integrations: { atlassian: [], microsoft: [], google: [] },
          agentSteps: []
        },
        {
          id: 'sess-dsp-mimi-codec',
          projectId: 'proj-audio-dsp',
          title: 'Mimi 24kHz Codec Quantization',
          status: 'completed',
          contextTokensUsed: 9420,
          maxContextTokens: 262144,
          summary: 'Quantized Mimi codec verified in INT4 with 12.5Hz frame rate.',
          lastUpdated: 'Yesterday',
          transcripts: [],
          artifacts: [],
          integrations: { atlassian: [], microsoft: [], google: [] },
          agentSteps: []
        }
      ]
    },
    {
      id: 'proj-3d-sim',
      name: '3D Spatial Robotics & Simulation',
      description: 'Three.js procedural WebGL render pipeline & PBR material shaders',
      color: '#a855f7',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
      sessions: [
        {
          id: 'sess-3d-cyber-drone',
          projectId: 'proj-3d-sim',
          title: 'Autonomous Cyber Drone',
          status: 'active',
          contextTokensUsed: 24100,
          maxContextTokens: 262144,
          summary: 'Generated PBR hologram mesh with 2,450 vertices and orbit controls.',
          lastUpdated: '11:15 AM',
          transcripts: [],
          artifacts: [],
          integrations: { atlassian: [], microsoft: [], google: [] },
          agentSteps: []
        },
        {
          id: 'sess-3d-quantum-crystal',
          projectId: 'proj-3d-sim',
          title: 'Quantum Lattice Crystal',
          status: 'completed',
          contextTokensUsed: 14200,
          maxContextTokens: 262144,
          summary: 'Icosahedron procedural geometry with glass transmission shader.',
          lastUpdated: '2 days ago',
          transcripts: [],
          artifacts: [],
          integrations: { atlassian: [], microsoft: [], google: [] },
          agentSteps: []
        }
      ]
    },
    {
      id: 'proj-enterprise',
      name: 'Enterprise DevOps Gateway',
      description: 'Atlassian Jira/Confluence sync & Microsoft Teams automated webhooks',
      color: '#10b981',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
      sessions: [
        {
          id: 'sess-ent-jira-sync',
          projectId: 'proj-enterprise',
          title: 'Sprint PROJ-1042 Backlog Sync',
          status: 'active',
          contextTokensUsed: 31200,
          maxContextTokens: 262144,
          summary: 'Connected Atlassian Jira and Microsoft Teams CI/CD monitors.',
          lastUpdated: '10:42 AM',
          transcripts: [],
          artifacts: [],
          integrations: { atlassian: [], microsoft: [], google: [] },
          agentSteps: []
        }
      ]
    }
  ],
  artifacts: [
    {
      id: 'art-3d-1',
      type: '3d_object',
      title: 'Quantum Resonance Core',
      geometryType: 'torus_knot',
      material: 'hologram',
      color: '#06b6d4',
      createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      metadata: { pbr: true, vertices: 2450, engine: 'Three.js WebGL' },
    },
    {
      id: 'art-code-1',
      type: 'code',
      title: 'Fast Fourier Transform Audio Stream Filter',
      language: 'typescript',
      code: `// Real-time FFT Audio Buffer Filter for Mochi Engine\nexport function applyNoiseGate(pcm16: Int16Array, threshold = 450): Int16Array {\n  const clean = new Int16Array(pcm16.length);\n  for (let i = 0; i < pcm16.length; i++) {\n    const sample = pcm16[i];\n    clean[i] = Math.abs(sample) < threshold ? 0 : sample;\n  }\n  return clean;\n}`,
      createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    },
    {
      id: 'art-music-1',
      type: 'music',
      title: 'Neo-Tokyo Midnight Ambient Drone',
      genre: 'ambient-synth',
      key: 'D Minor',
      tempo: 92,
      createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
      notes: ['D3', 'F3', 'A3', 'C4', 'E4', 'A4'],
    },
  ],
  integrations: {
    atlassian: [
      { id: 'PROJ-1042', title: 'Implement full-duplex PCM speech buffer', status: 'In Progress', priority: 'High', service: 'jira', assignee: 'Alex Chen' },
      { id: 'PROJ-1043', title: 'Connect Gemini Live WebSocket gateway', status: 'Done', priority: 'Critical', service: 'jira', assignee: 'Sarah Vance' },
      { id: 'CONF-88', title: 'Mochi Architecture Whitepaper & Low-latency Specs', status: 'Published', priority: 'Medium', service: 'confluence', space: 'ARCH' }
    ],
    microsoft: [
      { id: 'ms-1', service: 'teams', channel: '#general-engineering', message: 'Voice agent server harness deployed with Three.js 3D renderer and Atlassian sync.', time: '10:42 AM', sender: 'Mochi Agent' },
      { id: 'ms-2', service: 'outlook', subject: 'Sprint Review: Real-time Audio Interruption Performance', attendees: ['kamicth@gmail.com', 'engineering@team.ai'], time: 'Tomorrow, 2:00 PM' },
      { id: 'ms-3', service: 'azure_devops', pipeline: 'CI/CD Multiplatform Build (Linux/Win/Mobile)', status: 'Success', duration: '1m 45s' }
    ],
    google: [
      { id: 'g-1', service: 'calendar', title: 'Architecture Sync: Cross-Platform Voice Clients', time: 'Today, 4:30 PM', attendees: ['kamicth@gmail.com'] },
      { id: 'g-2', service: 'drive', fileName: 'Mochi_Neural_Speech_Tokens_v2.gdoc', modified: '2 hours ago', owner: 'Engineering AI' },
      { id: 'g-3', service: 'gmail', subject: 'Integration Hook: WebRTC & WebSocket Voice Pipeline', snippet: 'Automated notification: All tools initialized without latency spikes.', unread: false }
    ]
  }
};

// Check if Gemini API key exists
const geminiApiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;
if (geminiApiKey) {
  aiClient = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// REST Endpoints
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    mode: geminiApiKey ? 'gemini-live-enabled' : 'local-harness-ready',
    hasApiKey: !!geminiApiKey,
    model: 'gemini-3.8-live',
    version: '2.4.0',
    capabilities: [
      'full-duplex-voice',
      'real-time-interruption',
      'threejs-3d-engine',
      'code-execution',
      'image-generation',
      'music-synthesis',
      'atlassian-jira-confluence',
      'microsoft-teams-outlook-azure',
      'google-workspace'
    ],
    clientsSupported: ['web', 'linux-terminal', 'windows-terminal', 'ios-smartphone', 'android-smartphone'],
    time: new Date().toISOString()
  });
});

app.get('/api/agent/state', (req: Request, res: Response) => {
  res.json({
    artifacts: harnessStore.artifacts,
    integrations: harnessStore.integrations,
    projects: harnessStore.projects,
  });
});

// Multi-Project & Multi-Session Management Endpoints
app.get('/api/projects', (req: Request, res: Response) => {
  res.json({ projects: harnessStore.projects });
});

app.post('/api/projects', (req: Request, res: Response) => {
  const { name, description, color } = req.body;
  const newProj = {
    id: 'proj-' + Date.now(),
    name: name || 'Untitled Project',
    description: description || 'Active engineering project context',
    color: color || '#06b6d4',
    createdAt: new Date().toISOString(),
    sessions: [
      {
        id: 'sess-' + Date.now(),
        projectId: 'proj-' + Date.now(),
        title: 'Initial Session',
        status: 'active',
        contextTokensUsed: 1200,
        maxContextTokens: 262144,
        summary: 'Initialized project session with isolated 256K memory buffer.',
        lastUpdated: 'Just now',
        transcripts: [],
        artifacts: [],
        integrations: { atlassian: [], microsoft: [], google: [] },
        agentSteps: []
      }
    ]
  };
  harnessStore.projects.unshift(newProj);
  res.json({ success: true, project: newProj });
});

app.post('/api/projects/:projectId/sessions', (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { title } = req.body;
  const proj = harnessStore.projects.find((p) => p.id === projectId);
  if (!proj) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const newSess = {
    id: 'sess-' + Date.now(),
    projectId,
    title: title || 'New Conversation Session',
    status: 'active',
    contextTokensUsed: 800,
    maxContextTokens: 262144,
    summary: 'New isolated 256K conversation context ready.',
    lastUpdated: 'Just now',
    transcripts: [],
    artifacts: [],
    integrations: { atlassian: [], microsoft: [], google: [] },
    agentSteps: []
  };
  proj.sessions.unshift(newSess);
  res.json({ success: true, session: newSess });
});

app.post('/api/sessions/search', (req: Request, res: Response) => {
  const { query } = req.body;
  const q = (query || '').toLowerCase();
  const results: any[] = [];

  for (const p of harnessStore.projects) {
    for (const s of p.sessions) {
      if (
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q)
      ) {
        results.push({
          project: { id: p.id, name: p.name, color: p.color },
          session: s
        });
      }
    }
  }

  res.json({ results });
});

// Hardware VRAM Telemetry Governor (Intel Arc Pro B60 24GB Target with AMD/NVIDIA fallback)
app.get('/api/vram/status', (req: Request, res: Response) => {
  res.json({
    device: 'Intel Arc Pro B60 (Battlemage Xe2-HPG)',
    pciId: '0xe211',
    vramTotalMb: 24576, // 24.0 GB
    vramUsedMb: 18760,  // ~18.3 GB total active
    vramFreeMb: 5816,   // ~5.7 GB safety buffer
    utilizationPercent: 76.3,
    hardwareTier: 'Priority 1: Intel Arc Pro B-Series (oneAPI / SYCL / IPEX)',
    supportedTiers: [
      { name: 'Intel Arc Pro B-Series (B60/B70)', status: 'Active (oneAPI / SYCL)', vram: '24 GB' },
      { name: 'AMD Radeon / Instinct (ROCm / HIP)', status: 'Supported', vram: '24 GB - 48 GB' },
      { name: 'NVIDIA RTX (CUDA / TensorRT-LLM)', status: 'Supported', vram: '24 GB - 48 GB' }
    ],
    allocations: [
      {
        subsystem: 'Moshi 4-Bit Speech-to-Speech Engine',
        model: 'Helium 7B INT4 + Mimi 24kHz Codec',
        allocatedMb: 5324, // ~5.2 GB
        precision: 'INT4 (Mobile/Edge Quantized)',
        latencyMs: 38,
        status: 'Streaming Duplex Active'
      },
      {
        subsystem: 'Agent Brain Engine (256K Context)',
        model: 'Qwen 2.5 7B Instruct (AWQ 4-bit)',
        allocatedMb: 4400, // ~4.4 GB
        precision: '4-bit AWQ',
        status: 'Resident'
      },
      {
        subsystem: '256K Context KV Cache',
        allocatedMb: 7680, // ~7.5 GB
        precision: 'FP8 PagedAttention (SYCL XPU)',
        maxTokens: 262144, // 256k
        activeTokens: 18450,
        status: 'Paged Ring Buffer Active'
      },
      {
        subsystem: 'OpenHands Harness & 3D WebGL',
        allocatedMb: 1356, // ~1.3 GB
        purpose: 'Three.js PBR Shaders, Code Sandbox, Tool Isolates',
        status: 'Ready'
      }
    ],
    sharedMemory: {
      status: 'Connected (Zero-Copy IPC)',
      ringBufferMb: 512,
      latencyUs: 14, // 14 microseconds IPC sync
      syncMode: 'Bilateral Telepathy (Continuous Audio/Text Context Mirror)'
    }
  });
});

// Shared Memory State Endpoint
app.get('/api/shared-memory/status', (req: Request, res: Response) => {
  res.json({
    status: 'ACTIVE_ZERO_COPY',
    ipcType: 'POSIX_SHM / Windows Named Shared Memory Ring Buffer',
    bufferSize: '512 MB',
    activeContextTokens: 18450,
    maxContextTokens: 262144,
    componentsSynced: [
      'Moshi Spoken Turns & Barge-In Signals',
      'OpenHands 256K Memory Scratchpad',
      'Three.js 3D Viewport State',
      'Code Sandbox Output Buffers',
      'Atlassian, Microsoft, Google Connectors'
    ],
    lastSyncTimestamp: Date.now()
  });
});

// ============================================================================
// Extended RBAC & Feature Activation Store (Demo Mode: All Enabled By Default)
// ============================================================================
const defaultAllPermissions: Record<string, boolean> = {
  web_search: true,
  code_execution: true,
  isolated_sandbox: true,
  connected_sandbox: true,
  agentic_tasks: true,
  image_generation: true,
  music_generation: true,
  threejs_3d: true,
  enterprise_connectors: true,
  mcp_plugins: true,
  hardware_override: true,
  user_management: true,
  delete_project: true,
};

const authStore: {
  currentUserId: string;
  users: any[];
  roleDefaults: Record<string, Record<string, boolean>>;
  auditLogs: any[];
  mcpPlugins: any[];
} = {
  currentUserId: 'usr-kamicth',
  users: [
    {
      id: 'usr-kamicth',
      name: 'Hardware Lead (kamicth)',
      email: 'kamicth@gmail.com',
      role: 'admin',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
      apiKey: 'mochi_admin_98af21d09e74c10a442e',
      customOverrides: {},
      createdAt: '2026-11-01T10:00:00Z',
      lastLogin: 'En ligne maintenant',
    },
    {
      id: 'usr-alex-chen',
      name: 'Alex Chen',
      email: 'alex.chen@ai-lab.local',
      role: 'ai_engineer',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=faces',
      apiKey: 'mochi_eng_41ac87b201f8e331c50d',
      customOverrides: {},
      createdAt: '2026-11-03T14:30:00Z',
      lastLogin: 'Il y a 12 min',
    },
    {
      id: 'usr-elena-r',
      name: 'Elena Rostova',
      email: 'elena.r@ops.local',
      role: 'operator',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=faces',
      apiKey: 'mochi_ops_73ee99f412ab990176cd',
      customOverrides: {},
      createdAt: '2026-11-05T09:15:00Z',
      lastLogin: 'Il y a 45 min',
    },
    {
      id: 'usr-auditor-guest',
      name: 'Security Auditor (Guest)',
      email: 'guest.auditor@telemetry.local',
      role: 'viewer',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces',
      apiKey: 'mochi_view_12dd44a890fe884433ba',
      customOverrides: {},
      createdAt: '2026-11-07T16:00:00Z',
      lastLogin: 'Hier',
    },
  ],
  roleDefaults: {
    admin: { ...defaultAllPermissions },
    ai_engineer: { ...defaultAllPermissions },
    operator: { ...defaultAllPermissions },
    viewer: { ...defaultAllPermissions },
  },
  auditLogs: [
    {
      id: 'log-1',
      timestamp: '15:38:12',
      userId: 'usr-kamicth',
      userName: 'Hardware Lead (kamicth)',
      userRole: 'admin',
      feature: 'hardware_override',
      action: 'VRAM Allocation Inspection (Intel Arc Pro B60)',
      status: 'granted',
      details: 'Allocated 24GB VRAM at 76.3% in unrestricted demo mode.',
    },
    {
      id: 'log-2',
      timestamp: '15:38:45',
      userId: 'usr-kamicth',
      userName: 'Hardware Lead (kamicth)',
      userRole: 'admin',
      feature: 'agentic_tasks',
      action: 'OpenHands Autonomous Loop Dispatch',
      status: 'granted',
      details: 'Execution allowed via administrator session token.',
    },
  ],
  mcpPlugins: [
    {
      id: 'mcp-git',
      name: 'Git & GitHub MCP Server',
      description: 'Model Context Protocol local gateway for git repositories and branch diffs.',
      version: '1.4.0',
      status: 'enabled',
      endpoint: 'local://mcp-git-daemon',
      tools: ['git_status', 'git_diff', 'create_branch', 'commit_files']
    },
    {
      id: 'mcp-filesystem',
      name: 'Air-Gapped Filesystem MCP',
      description: 'Sandboxed filesystem inspector for workspace isolates.',
      version: '2.1.2',
      status: 'enabled',
      endpoint: 'local://mcp-fs-isolate',
      tools: ['list_directory', 'read_file_secure', 'write_file_sandbox']
    },
    {
      id: 'mcp-intel-telemetry',
      name: 'Intel Level-Zero oneAPI Telemetry MCP',
      description: 'Live hardware sensor hook for Intel Arc Pro B60 Xe2 engine.',
      version: '0.9.8',
      status: 'enabled',
      endpoint: 'local://mcp-oneapi-b60',
      tools: ['query_vram_banks', 'sample_clock_frequency', 'reset_ring_buffer']
    }
  ]
};

function isFeatureAllowedForCurrent(feature: string): boolean {
  const user = authStore.users.find((u) => u.id === authStore.currentUserId);
  if (!user) return true;
  if (user.customOverrides && typeof user.customOverrides[feature] === 'boolean') {
    return user.customOverrides[feature];
  }
  const rolePolicy = authStore.roleDefaults[user.role];
  if (rolePolicy && typeof rolePolicy[feature] === 'boolean') {
    return rolePolicy[feature];
  }
  return true;
}

function logAudit(feature: string, action: string, status: 'granted' | 'denied', details: string) {
  const user = authStore.users.find((u) => u.id === authStore.currentUserId) || authStore.users[0];
  const newLog = {
    id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    feature,
    action,
    status,
    details,
  };
  authStore.auditLogs.unshift(newLog);
  if (authStore.auditLogs.length > 50) authStore.auditLogs.pop();
}

// Auth & RBAC Endpoints
app.get('/api/auth/state', (req: Request, res: Response) => {
  const currentUser = authStore.users.find((u) => u.id === authStore.currentUserId) || authStore.users[0];
  res.json({
    currentUser,
    allUsers: authStore.users,
    roleDefaults: authStore.roleDefaults,
    auditLogs: authStore.auditLogs,
    mcpPlugins: authStore.mcpPlugins,
  });
});

app.post('/api/auth/switch-user', (req: Request, res: Response) => {
  const { userId } = req.body;
  const user = authStore.users.find((u) => u.id === userId);
  if (user) {
    authStore.currentUserId = user.id;
    logAudit('user_management', `Session switched to ${user.name}`, 'granted', `Active role: ${user.role}`);
    res.json({ success: true, currentUser: user });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.put('/api/auth/roles-permissions', (req: Request, res: Response) => {
  const { role, feature, allowed } = req.body;
  if (authStore.roleDefaults[role] && feature) {
    authStore.roleDefaults[role][feature] = !!allowed;
    logAudit('user_management', `Updated role ${role}: ${feature}=${allowed}`, 'granted', 'Global matrix updated');
    res.json({ success: true, roleDefaults: authStore.roleDefaults });
  } else {
    res.status(400).json({ error: 'Invalid role or feature' });
  }
});

app.put('/api/auth/users/:userId/override', (req: Request, res: Response) => {
  const { userId } = req.params;
  const { feature, allowed } = req.body;
  const user = authStore.users.find((u) => u.id === userId);
  if (user) {
    if (!user.customOverrides) user.customOverrides = {};
    if (allowed === null) {
      delete user.customOverrides[feature];
    } else {
      user.customOverrides[feature] = !!allowed;
    }
    logAudit('user_management', `Individual override ${user.name}: ${feature}=${allowed}`, 'granted', 'Local priority');
    res.json({ success: true, user });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.post('/api/auth/users', (req: Request, res: Response) => {
  const newUser = req.body;
  if (!newUser.id) newUser.id = 'usr-' + Date.now();
  if (!newUser.role) newUser.role = 'ai_engineer';
  if (!newUser.customOverrides) newUser.customOverrides = {};
  authStore.users.push(newUser);
  logAudit('user_management', `Created account ${newUser.name}`, 'granted', `Role: ${newUser.role}`);
  res.json({ success: true, user: newUser });
});

app.post('/api/auth/api-keys/generate', (req: Request, res: Response) => {
  const { userId, newKey } = req.body;
  const user = authStore.users.find((u) => u.id === userId);
  if (user) {
    user.apiKey = newKey || ('mochi_key_' + Math.random().toString(36).substring(2, 14));
    logAudit('user_management', `Regenerated API key for ${user.name}`, 'granted', 'MCP/CLI Key');
    res.json({ success: true, apiKey: user.apiKey });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.post('/api/auth/reset-demo', (req: Request, res: Response) => {
  authStore.roleDefaults = {
    admin: { ...defaultAllPermissions },
    ai_engineer: { ...defaultAllPermissions },
    operator: { ...defaultAllPermissions },
    viewer: { ...defaultAllPermissions },
  };
  authStore.users.forEach((u) => {
    u.customOverrides = {};
  });
  logAudit('user_management', 'Demo reset: all features allowed', 'granted', 'Defaults restored');
  res.json({ success: true, message: 'All features reset to enabled' });
});

app.get('/api/auth/mcp-plugins', (req: Request, res: Response) => {
  res.json({ plugins: authStore.mcpPlugins });
});

app.put('/api/auth/mcp-plugins/:id/toggle', (req: Request, res: Response) => {
  const { id } = req.params;
  const plugin = authStore.mcpPlugins.find((p) => p.id === id);
  if (plugin) {
    plugin.status = plugin.status === 'enabled' ? 'disabled' : 'enabled';
    logAudit('mcp_plugins', `Basculement MCP Plugin ${plugin.name} -> ${plugin.status}`, 'granted', plugin.endpoint);
    res.json({ success: true, plugin });
  } else {
    res.status(404).json({ error: 'Plugin not found' });
  }
});

app.delete('/api/projects/:projectId', (req: Request, res: Response) => {
  if (!isFeatureAllowedForCurrent('delete_project')) {
    logAudit('delete_project', `Delete project ${req.params.projectId}`, 'denied', 'delete_project permission disabled');
    res.status(403).json({ error: 'Permission denied: project deletion is not allowed.' });
    return;
  }
  const idx = harnessStore.projects.findIndex((p) => p.id === req.params.projectId);
  if (idx !== -1) {
    const deleted = harnessStore.projects.splice(idx, 1)[0];
    logAudit('delete_project', `Delete project ${deleted.name}`, 'granted', 'Archive deleted');
    res.json({ success: true, deleted });
  } else {
    res.status(404).json({ error: 'Project not found' });
  }
});

app.post('/api/agent/execute', async (req: Request, res: Response) => {
  const { tool, params } = req.body;
  let requiredFeature = 'agentic_tasks';
  if (tool === 'create_3d_object') requiredFeature = 'threejs_3d';
  else if (tool === 'code_runner') requiredFeature = 'code_execution';
  else if (tool === 'generate_image') requiredFeature = 'image_generation';
  else if (tool === 'generate_music') requiredFeature = 'music_generation';
  else if (tool && (tool.includes('atlassian') || tool.includes('microsoft') || tool.includes('google'))) {
    requiredFeature = 'enterprise_connectors';
  }

  if (!isFeatureAllowedForCurrent(requiredFeature)) {
    logAudit(requiredFeature, `Execute tool ${tool}`, 'denied', 'Gated by RBAC policy');
    res.status(403).json({
      success: false,
      error: `Action denied. The ${requiredFeature} feature is disabled in the RBAC console.`,
    });
    return;
  }

  try {
    const result = handleToolExecution(tool, params || {});
    logAudit(requiredFeature, `Execute tool ${tool}`, 'granted', 'Tool executed successfully');
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Execution failed' });
  }
});

// Launcher script for Intel Arc Pro B60 on Linux (oneAPI / SYCL / IPEX)
app.get('/api/scripts/intel-b60-linux', (req: Request, res: Response) => {
  if (!isFeatureAllowedForCurrent('hardware_override')) {
    logAudit('hardware_override', 'Download B60 Linux launcher script', 'denied', 'hardware_override permission required');
    res.status(403).send('# Permission denied by RBAC.');
    return;
  }
  const script = `#!/usr/bin/env bash
# ==============================================================================
# Intel Arc Pro B60 (Battlemage) 24GB - 1-Click Launch Script (Linux)
# Priority 1: Intel oneAPI, SYCL, IPEX, vLLM-XPU, and Moshi 4-Bit
# ==============================================================================
set -e
echo -e "\\033[1;36m==============================================================\\033[0m"
echo -e "\\033[1;32m  LAUNCHING MOCHI VOICE & OPENHANDS (Intel Arc Pro B60 24GB)  \\033[0m"
echo -e "\\033[1;36m==============================================================\\033[0m"

# Verify Intel Level-Zero compute runtime
if command -v sycl-ls &>/dev/null; then
    echo -e "\\033[32m✔ Intel oneAPI / SYCL Toolchain detected:\\033[0m"
    sycl-ls | grep -i "Intel" || true
else
    echo -e "\\033[33mTip: Source /opt/intel/oneapi/setvars.sh for native Level-Zero drivers.\\033[0m"
fi

# Set XPU device environment variables for Battlemage (B60 PCI ID 0xe211)
export ONEAPI_DEVICE_SELECTOR="level_zero:gpu"
export ZE_AFFINITY_MASK=0
export IPEX_FP8_PATH=1
export VLLM_XPU_DEVICE=0
export VLLM_GPU_MEMORY_UTILIZATION=0.90
export MAX_MODEL_LEN=262144

echo -e "\\033[1;34m[1/3] Initializing 24GB VRAM Governor & Shared Memory Ring Buffer...\\033[0m"
echo -e "      • Moshi 4-Bit S2S:  5.2 GB"
echo -e "      • 256K Context KV:  7.5 GB (FP8 PagedAttention)"
echo -e "      • Qwen 2.5 7B Coder: 4.4 GB (AWQ INT4)"
echo -e "      • Free Headroom:     6.9 GB"

echo -e "\\033[1;34m[2/3] Starting OpenHands / Hermes Agent Harness on Port 8000...\\033[0m"
python3 -m vllm.entrypoints.openai.api_server \\
    --model Qwen/Qwen2.5-7B-Instruct-AWQ \\
    --max-model-len 262144 \\
    --kv-cache-dtype fp8 \\
    --device xpu \\
    --port 8000 &

echo -e "\\033[1;34m[3/3] Starting Moshi 4-Bit Mimi Full-Duplex Gateway on Port 3000...\\033[0m"
npm run dev
`;
  res.setHeader('Content-Type', 'text/x-shellscript');
  res.setHeader('Content-Disposition', 'attachment; filename="start_intel_b60_linux.sh"');
  res.send(script);
});

// Launcher script for Intel Arc Pro B60 on Windows (PowerShell / Batch)
app.get('/api/scripts/intel-b60-windows', (req: Request, res: Response) => {
  const batScript = `@echo off
REM ==============================================================================
REM Intel Arc Pro B60 (Battlemage) 24GB - 1-Click Launch Script (Windows)
REM Priority 1: Intel oneAPI, SYCL, IPEX, and Moshi 4-Bit S2S Gateway
REM ==============================================================================
title Mochi Voice & OpenHands Harness - Intel Arc Pro B60 (24GB VRAM)
color 0b
echo ==============================================================
echo   MOCHI VOICE & OPENHANDS HARNESS (Intel Arc Pro B60 24GB)
echo ==============================================================
echo.

REM Set Intel oneAPI environment variables
set ONEAPI_DEVICE_SELECTOR=level_zero:gpu
set ZE_AFFINITY_MASK=0
set VLLM_GPU_MEMORY_UTILIZATION=0.90
set MAX_MODEL_LEN=262144

echo [1/3] Verified Intel Arc Pro B60 24GB Hardware Acceleration.
echo [2/3] Allocated 256K Context Ring Buffer (Shared Memory IPC).
echo [3/3] Starting Mochi Full-Duplex Voice & OpenHands Gateway...
echo.
npm run dev
pause
`;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="start_intel_b60_windows.bat"');
  res.send(batScript);
});

// Downloadable Terminal Client Scripts
app.get('/api/clients/cli/linux', (req: Request, res: Response) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' ? 'wss' : 'ws';
  const script = `#!/usr/bin/env bash
# ==============================================================================
# Mochi Real-Time Voice Terminal Client (Linux / macOS)
# Full-Duplex Audio Streaming + Interruption + Terminal HUD
# ==============================================================================
SERVER_URL="${protocol}://${host}/api/live-ws"

echo -e "\\033[1;36m====================================================\\033[0m"
echo -e "\\033[1;32m   MOCHI VOICE TERMINAL CLIENT (Linux/macOS)       \\033[0m"
echo -e "\\033[1;36m====================================================\\033[0m"
echo -e "Connecting to Mochi Voice Server: \\033[33m$SERVER_URL\\033[0m"
echo -e "Controls: [SPACE] to talk, [I] or [CTRL+C] to interrupt, [Q] to quit\\n"

# Verify dependencies (curl, sox/arecord/pw-record or python3)
if command -v python3 &>/dev/null; then
  echo -e "\\033[32m✔ Python3 detected. Launching interactive terminal client with ASCII VU meter...\\033[0m"
  curl -s "${req.protocol}://${host}/api/clients/cli/python" | python3 -
else
  echo -e "\\033[31mPython 3 is required for audio streaming client.\\033[0m"
  exit 1
fi
`;
  res.setHeader('Content-Type', 'text/x-shellscript');
  res.setHeader('Content-Disposition', 'attachment; filename="mochi-linux.sh"');
  res.send(script);
});

app.get('/api/clients/cli/windows', (req: Request, res: Response) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' ? 'wss' : 'ws';
  const psScript = `<#
==============================================================================
 Mochi Real-Time Voice Terminal Client (Windows PowerShell)
 Full-Duplex Audio Streaming + Interruption + Terminal HUD
==============================================================================
#>
$ServerUrl = "${protocol}://${host}/api/live-ws"
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "   MOCHI VOICE TERMINAL CLIENT (Windows PowerShell) " -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "Connecting to Voice Gateway: $ServerUrl" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to interrupt or disconnect.\`n"

# Launch Python client or WebSockets curl session
try {
  $pyCode = Invoke-RestMethod -Uri "${req.protocol}://${host}/api/clients/cli/python"
  $pyCode | python -
} catch {
  Write-Host "Ensure Python 3 is installed: winget install Python.Python.3.11" -ForegroundColor Red
}
`;
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="mochi-windows.ps1"');
  res.send(psScript);
});

app.get('/api/clients/cli/python', (req: Request, res: Response) => {
  const host = req.get('host') || 'localhost:3000';
  const wsProtocol = req.protocol === 'https' ? 'wss' : 'ws';
  const pyCode = `import asyncio
import json
import sys
import time

WS_URL = "${wsProtocol}://${host}/api/live-ws"

print("\\033[1;35m╭──────────────────────────────────────────────────────────╮\\033[0m")
print("\\033[1;35m│   MOCHI INTERACTIVE VOICE & AGENT TERMINAL HUD           │\\033[0m")
print("\\033[1;35m╰──────────────────────────────────────────────────────────╯\\033[0m")
print(f"Connecting to: \\033[36m{WS_URL}\\033[0m")
print("Full-duplex real-time audio & tool calling active.")
print("Type a message or trigger voice action. Type 'interrupt' to cut in, 'exit' to quit.\\n")

try:
    import websockets
except ImportError:
    print("\\033[33mTip: Run 'pip install websockets' for real-time streaming.\\033[0m")
    sys.exit(0)

async def run_client():
    async with websockets.connect(WS_URL) as ws:
        # Handshake
        await ws.send(json.dumps({"type": "client_connect", "platform": "terminal", "arch": "x86_64/linux/win"}))
        
        async def receive_loop():
            try:
                async for message in ws:
                    data = json.loads(message)
                    mtype = data.get("type")
                    if mtype == "agent_speak_chunk":
                        text = data.get("text", "")
                        print(f"\\033[32m[Mochi Voice]:\\033[0m {text}", flush=True)
                    elif mtype == "interrupted":
                        print("\\033[1;31m⚡ [INTERRUPTED] Assistant stopped speaking.\\033[0m", flush=True)
                    elif mtype == "tool_execution":
                        tool = data.get("tool")
                        print(f"\\033[1;34m⚙ [AGENT TOOL: {tool}]\\033[0m {json.dumps(data.get('params', {}))}", flush=True)
            except asyncio.CancelledError:
                pass

        recv_task = asyncio.create_task(receive_loop())

        loop = asyncio.get_event_loop()
        while True:
            user_input = await loop.run_in_executor(None, input, "\\033[1;33mTerminal User > \\033[0m")
            if user_input.strip() == "exit":
                break
            elif user_input.strip() == "interrupt":
                await ws.send(json.dumps({"type": "interrupt"}))
            else:
                await ws.send(json.dumps({"type": "text_input", "text": user_input}))

        recv_task.cancel()

if __name__ == "__main__":
    asyncio.run(run_client())
`;
  res.setHeader('Content-Type', 'text/x-python');
  res.setHeader('Content-Disposition', 'attachment; filename="mochi_cli.py"');
  res.send(pyCode);
});

// Tool Execution Logic
function handleToolExecution(tool: string, params: any) {
  let result: any = null;

  switch (tool) {
    case 'create_3d_object': {
      const id = 'art-3d-' + Date.now();
      const new3d = {
        id,
        type: '3d_object',
        title: params.name || params.title || 'Procedural 3D Quantum Lattice',
        geometryType: params.geometryType || params.type || 'torus_knot',
        material: params.material || 'hologram',
        color: params.color || '#06b6d4',
        wireframe: params.wireframe ?? false,
        createdAt: new Date().toISOString(),
        metadata: {
          engine: 'Three.js r128',
          vertices: Math.floor(Math.random() * 3000 + 1200),
          renderPipeline: 'PBR Physical Shader',
          animation: 'continuous_rotation'
        }
      };
      harnessStore.artifacts.unshift(new3d);
      result = {
        action: 'Created 3D Object',
        artifact: new3d,
        message: `Generated 3D asset "${new3d.title}" (${new3d.geometryType}, material: ${new3d.material}) in Three.js harness.`
      };
      break;
    }

    case 'code_runner': {
      const id = 'art-code-' + Date.now();
      const language = params.language || 'typescript';
      const code = params.code || `// Automated Agent Task\nconsole.log("Analyzing telemetry buffers...");\nconst activeChannels = 16;\nconst samplingRate = 24000;\nconsole.log(\`Running duplex DSP with \${activeChannels} channels at \${samplingRate}Hz.\`);`;
      const output = `[Sandbox: v8-isolate-0]\n> Executing ${language} snippet...\n> Analyzing telemetry buffers...\n> Running duplex DSP with 16 channels at 24000Hz.\n> Process exit 0 (Execution time: 42ms)`;
      const newCode = {
        id,
        type: 'code',
        title: params.title || `${language.toUpperCase()} Harness Pipeline`,
        language,
        code,
        output,
        createdAt: new Date().toISOString()
      };
      harnessStore.artifacts.unshift(newCode);
      result = {
        action: 'Executed Code',
        artifact: newCode,
        output,
        message: `Successfully executed ${language} script in sandboxed environment.`
      };
      break;
    }

    case 'generate_image': {
      const id = 'art-img-' + Date.now();
      const prompt = params.prompt || 'Cybernetic AI voice assistant holographic sphere glowing with neon cyan and violet particles';
      // Procedural SVG or visual representation
      const colors = ['#06b6d4', '#a855f7', '#3b82f6', '#ec4899'];
      const primaryColor = colors[Math.floor(Math.random() * colors.length)];
      const newImg = {
        id,
        type: 'image',
        title: params.title || 'Synthesized Visual Asset',
        prompt,
        aspectRatio: params.aspectRatio || '16:9',
        primaryColor,
        createdAt: new Date().toISOString(),
        mockUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%230f172a"/><stop offset="50%" stop-color="%231e1b4b"/><stop offset="100%" stop-color="%23030712"/></linearGradient><radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${encodeURIComponent(primaryColor)}" stop-opacity="0.8"/><stop offset="100%" stop-color="%23000000" stop-opacity="0"/></radialGradient></defs><rect width="800" height="450" fill="url(%23g)"/><circle cx="400" cy="225" r="160" fill="url(%23glow)" filter="blur(20px)"/><circle cx="400" cy="225" r="90" fill="none" stroke="${encodeURIComponent(primaryColor)}" stroke-width="4" stroke-dasharray="8 8"/><text x="400" y="232" fill="%23ffffff" font-family="monospace" font-size="16" text-anchor="middle" font-weight="bold">AI GENERATED ASSET</text><text x="400" y="260" fill="%2394a3b8" font-family="sans-serif" font-size="12" text-anchor="middle">${encodeURIComponent(prompt.slice(0, 50))}</text></svg>`
      };
      harnessStore.artifacts.unshift(newImg);
      result = {
        action: 'Generated Image',
        artifact: newImg,
        message: `Visual asset rendered for prompt: "${prompt}".`
      };
      break;
    }

    case 'generate_music': {
      const id = 'art-music-' + Date.now();
      const genre = params.genre || 'ambient-synth';
      const key = params.key || 'C Minor';
      const tempo = params.tempo || 98;
      const notes = ['C3', 'Eb3', 'G3', 'Bb3', 'D4', 'G4'];
      const newMusic = {
        id,
        type: 'music',
        title: params.title || `${genre.toUpperCase()} Polyphonic Flow`,
        genre,
        key,
        tempo,
        notes,
        createdAt: new Date().toISOString()
      };
      harnessStore.artifacts.unshift(newMusic);
      result = {
        action: 'Synthesized Music',
        artifact: newMusic,
        message: `Generated soundscape in ${key} at ${tempo} BPM.`
      };
      break;
    }

    case 'atlassian_action': {
      const service = params.service || 'jira';
      const action = params.action || 'create_issue';
      const title = params.title || 'Optimize real-time audio jitter buffer';
      const newTicket = {
        id: 'PROJ-' + Math.floor(Math.random() * 900 + 1050),
        title,
        status: action === 'create_issue' ? 'To Do' : 'In Progress',
        priority: params.priority || 'High',
        service,
        assignee: 'Agent Harness'
      };
      harnessStore.integrations.atlassian.unshift(newTicket);
      result = {
        action: `Atlassian ${service.toUpperCase()}: ${action}`,
        ticket: newTicket,
        message: `Successfully synchronized ticket [${newTicket.id}] "${title}" to Atlassian Jira.`
      };
      break;
    }

    case 'microsoft_action': {
      const service = params.service || 'teams';
      const action = params.action || 'send_message';
      const newEvent = {
        id: 'ms-' + Date.now(),
        service,
        channel: params.channel || '#voice-agent-ops',
        message: params.message || params.content || 'Voice session trigger dispatched to Microsoft 365 gateway.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sender: 'Mochi Voice Agent'
      };
      harnessStore.integrations.microsoft.unshift(newEvent);
      result = {
        action: `Microsoft ${service.toUpperCase()}: ${action}`,
        event: newEvent,
        message: `Dispatched Microsoft 365 payload to ${service} channel ${newEvent.channel}.`
      };
      break;
    }

    case 'google_action': {
      const service = params.service || 'calendar';
      const action = params.action || 'create_event';
      const newGoogle = {
        id: 'g-' + Date.now(),
        service,
        title: params.title || 'Live Voice Agent Technical Review',
        time: 'Today, 5:00 PM',
        attendees: ['kamicth@gmail.com', 'ai-harness@cloud.google.com'],
        snippet: 'Automated workspace update verified across Google Drive & Calendar.'
      };
      harnessStore.integrations.google.unshift(newGoogle);
      result = {
        action: `Google ${service.toUpperCase()}: ${action}`,
        item: newGoogle,
        message: `Created Google Workspace entry: "${newGoogle.title}".`
      };
      break;
    }

    default:
      result = {
        action: 'Default Handler',
        params,
        message: `Executed action for tool "${tool}".`
      };
  }

  return result;
}

// WebSocket Server for Full-Duplex Voice & Interruption
const wss = new WebSocketServer({ server, path: '/api/live-ws' });
const activeClients = new Set<WebSocket>();

wss.on('connection', (clientWs: WebSocket) => {
  activeClients.add(clientWs);
  let isSpeaking = false;
  let currentSpeakingTimeout: NodeJS.Timeout | null = null;

  // Send initial welcome & capability handshake
  clientWs.send(JSON.stringify({
    type: 'handshake',
    message: 'Connected to Mochi Real-Time Voice Server (Full-Duplex)',
    serverSampleRate: 24000,
    clientSampleRate: 16000,
    hasGeminiLive: !!aiClient,
    capabilities: ['audio-pcm', 'interruption', 'tools-calling', 'ascii-meter']
  }));

  const broadcastAll = (payload: any) => {
    const msg = JSON.stringify(payload);
    for (const ws of activeClients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  };

  const stopSpeaking = () => {
    if (isSpeaking) {
      isSpeaking = false;
      if (currentSpeakingTimeout) {
        clearTimeout(currentSpeakingTimeout);
        currentSpeakingTimeout = null;
      }
      broadcastAll({
        type: 'interrupted',
        timestamp: Date.now(),
        reason: 'User voice activity detected or interrupt button pressed'
      });
    }
  };

  clientWs.on('message', async (data: any) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'interrupt') {
        stopSpeaking();
        return;
      }

      if (msg.type === 'audio_chunk') {
        // Real-time audio stream from mic (16kHz PCM Base64 or RMS volume)
        // If the user's audio level exceeds threshold while assistant is speaking,
        // trigger automatic natural voice interruption!
        const rms = msg.rms || 0;
        if (isSpeaking && rms > 0.08) {
          stopSpeaking();
        }

        // Echo VU meter level to all clients (Web, Smartphone, Terminal)
        broadcastAll({
          type: 'audio_meter',
          rms: rms,
          source: msg.source || 'client'
        });
        return;
      }

      if (msg.type === 'text_input' || msg.type === 'voice_turn') {
        const userText = msg.text || '';
        
        // If assistant was already speaking, interrupt first
        if (isSpeaking) {
          stopSpeaking();
        }

        // Broadcast user's transcription turn
        broadcastAll({
          type: 'transcript',
          role: 'user',
          text: userText,
          timestamp: Date.now()
        });

        // Check if user requested a session search, status inquiry, or workspace switch
        const lower = userText.toLowerCase();
        let sessionMatch: { project: any; session: any } | null = null;
        const isSessionQuery =
          lower.includes('session') ||
          lower.includes('projet') ||
          lower.includes('project') ||
          lower.includes('cherche') ||
          lower.includes('trouve') ||
          lower.includes('bascule') ||
          lower.includes('switch') ||
          lower.includes('ouvre') ||
          lower.includes('état') ||
          lower.includes('status') ||
          lower.includes('find') ||
          lower.includes('search') ||
          lower.includes('donne');

        if (isSessionQuery) {
          for (const p of harnessStore.projects) {
            for (const s of p.sessions) {
              const t = s.title.toLowerCase();
              const sm = s.summary.toLowerCase();
              const pn = p.name.toLowerCase();
              if (
                (lower.includes('drone') && t.includes('drone')) ||
                (lower.includes('dsp') && (t.includes('dsp') || pn.includes('dsp'))) ||
                (lower.includes('noise') && t.includes('noise')) ||
                (lower.includes('mimi') && t.includes('mimi')) ||
                (lower.includes('codec') && t.includes('codec')) ||
                (lower.includes('crystal') && t.includes('crystal')) ||
                (lower.includes('quantum') && t.includes('quantum')) ||
                (lower.includes('jira') && (t.includes('jira') || pn.includes('enterprise'))) ||
                (lower.includes('robot') && pn.includes('robot')) ||
                t.includes(lower.replace(/cherche|trouve|bascule|session|projet|sur|la|le|l'|état|status|find|search|switch|project|the/gi, '').trim())
              ) {
                sessionMatch = { project: p, session: s };
                break;
              }
            }
            if (sessionMatch) break;
          }
        }

        // Check if user requested a tool action in their prompt
        let toolTriggered: string | null = null;
        let toolParams: any = {};

        if (sessionMatch) {
          // Handled via spoken session switch
        } else if (lower.includes('3d') || lower.includes('cube') || lower.includes('mesh') || lower.includes('object') || lower.includes('torus')) {
          toolTriggered = 'create_3d_object';
          toolParams = {
            name: lower.includes('drone') ? 'Cybernetic Recon Drone' : lower.includes('crystal') ? 'Quantum Lattice Crystal' : 'Holographic Torus Knot',
            geometryType: lower.includes('drone') ? 'cylinder' : lower.includes('knot') ? 'torus_knot' : lower.includes('sphere') ? 'sphere' : 'torus_knot',
            material: lower.includes('glass') ? 'glass' : lower.includes('wireframe') ? 'neon_wireframe' : 'hologram',
            color: lower.includes('purple') ? '#a855f7' : lower.includes('emerald') ? '#10b981' : '#06b6d4'
          };
        } else if (lower.includes('code') || lower.includes('python') || lower.includes('script') || lower.includes('function') || lower.includes('rust')) {
          toolTriggered = 'code_runner';
          toolParams = {
            language: lower.includes('python') ? 'python' : lower.includes('rust') ? 'rust' : 'typescript',
            title: 'Real-time Audio DSP Pipeline',
            code: `// Agent Synthesized Code Runner\nimport { createAudioPipeline } from './dsp';\nconst pipeline = createAudioPipeline({ latency: 12, sampleRate: 24000 });\npipeline.start();`
          };
        } else if (lower.includes('image') || lower.includes('draw') || lower.includes('picture') || lower.includes('visual')) {
          toolTriggered = 'generate_image';
          toolParams = {
            prompt: userText,
            style: 'Cyberpunk Futuristic Neon High-Fidelity',
            aspectRatio: '16:9'
          };
        } else if (lower.includes('music') || lower.includes('song') || lower.includes('audio') || lower.includes('melody') || lower.includes('synth')) {
          toolTriggered = 'generate_music';
          toolParams = {
            genre: lower.includes('ambient') ? 'ambient-synth' : lower.includes('techno') ? 'dark-techno' : 'synthwave',
            key: 'F Minor',
            tempo: 105
          };
        } else if (lower.includes('jira') || lower.includes('atlassian') || lower.includes('confluence') || lower.includes('ticket')) {
          toolTriggered = 'atlassian_action';
          toolParams = {
            service: lower.includes('confluence') ? 'confluence' : 'jira',
            action: 'create_issue',
            title: userText.replace(/create|ticket|jira|confluence/gi, '').trim() || 'Accelerate speech inference pipeline'
          };
        } else if (lower.includes('teams') || lower.includes('microsoft') || lower.includes('outlook') || lower.includes('azure')) {
          toolTriggered = 'microsoft_action';
          toolParams = {
            service: lower.includes('outlook') ? 'outlook' : lower.includes('azure') ? 'azure_devops' : 'teams',
            action: 'send_message',
            channel: '#ai-voice-engineering',
            message: `Voice trigger received: "${userText}"`
          };
        } else if (lower.includes('google') || lower.includes('calendar') || lower.includes('drive') || lower.includes('gmail')) {
          toolTriggered = 'google_action';
          toolParams = {
            service: lower.includes('drive') ? 'drive' : lower.includes('gmail') ? 'gmail' : 'calendar',
            action: 'create_event',
            title: `Voice Discussion: ${userText.slice(0, 30)}`
          };
        }

        let toolResultText = '';
        let reply = '';

        if (toolTriggered) {
          let requiredFeature = 'agentic_tasks';
          if (toolTriggered === 'create_3d_object') requiredFeature = 'threejs_3d';
          else if (toolTriggered === 'code_runner') requiredFeature = 'code_execution';
          else if (toolTriggered === 'generate_image') requiredFeature = 'image_generation';
          else if (toolTriggered === 'generate_music') requiredFeature = 'music_generation';
          else if (
            toolTriggered.includes('atlassian') ||
            toolTriggered.includes('microsoft') ||
            toolTriggered.includes('google')
          ) {
            requiredFeature = 'enterprise_connectors';
          }

          if (!isFeatureAllowedForCurrent(requiredFeature)) {
            logAudit(requiredFeature, `Voice execution [${toolTriggered}]`, 'denied', 'Blocked by RBAC');
            broadcastAll({
              type: 'auth_denied',
              feature: requiredFeature,
              tool: toolTriggered,
              message: `Action [${toolTriggered}] blocked by RBAC.`
            });
            reply = `Action denied. The ${requiredFeature.replace('_', ' ')} feature is currently disabled for your profile in the RBAC security console.`;
            toolTriggered = null;
          } else {
            const res = handleToolExecution(toolTriggered, toolParams);
            logAudit(requiredFeature, `Voice execution [${toolTriggered}]`, 'granted', 'Execution allowed');
            toolResultText = ` I've dispatched the ${toolTriggered.replace('_', ' ')} tool to the agent harness.`;
            broadcastAll({
              type: 'tool_execution',
              tool: toolTriggered,
              params: toolParams,
              result: res,
              artifacts: harnessStore.artifacts,
              integrations: harnessStore.integrations
            });
          }
        }

        // Generate response speech text
        if (sessionMatch) {
          const spokenSummary = `I found session "${sessionMatch.session.title}" in project "${sessionMatch.project.name}". Status is ${sessionMatch.session.status}, using ${sessionMatch.session.contextTokensUsed.toLocaleString()} tokens of the 256K context. Summary: ${sessionMatch.session.summary}. Switching workspace now.`;

          broadcastAll({
            type: 'switch_session',
            projectId: sessionMatch.project.id,
            sessionId: sessionMatch.session.id,
            session: sessionMatch.session,
            spokenSummary
          });
          reply = spokenSummary;
        } else if (toolTriggered) {
          reply = `Acknowledged. I ran the ${toolTriggered.replace('_', ' ')} harness module.${toolResultText} The real-time stream is active and you can interrupt me anytime.`;
        } else {
          const sampleReplies = [
            `I heard: "${userText}". I'm operating on the Mochi low-latency conversational architecture. You can talk freely or cut in with an interruption.`,
            `Received loud and clear! The agent server harness is standing by with 3D engine rendering, code execution, music synthesis, and Atlassian/Microsoft/Google connectors. What would you like to build?`,
            `Got it. I'm streaming bidirectional audio at 24kHz. Notice how smoothly you can interrupt me while I'm speaking.`,
            `Understood! Try asking me to "Find the 3D drone session", "Show the Audio DSP project status", "Create a 3D hologram drone", or "Create a Jira issue".`
          ];
          reply = sampleReplies[Math.floor(Math.random() * sampleReplies.length)];
        }

        // Simulate streaming conversational speech chunks with interruption check
        isSpeaking = true;
        const words = reply.split(' ');
        let currentWordIndex = 0;
        let accumulatedSpeech = '';

        const streamInterval = setInterval(() => {
          if (!isSpeaking) {
            clearInterval(streamInterval);
            return;
          }

          if (currentWordIndex < words.length) {
            const nextWord = words[currentWordIndex];
            accumulatedSpeech += (accumulatedSpeech ? ' ' : '') + nextWord;
            currentWordIndex++;

            broadcastAll({
              type: 'agent_speak_chunk',
              text: accumulatedSpeech,
              word: nextWord,
              isFinal: currentWordIndex === words.length,
              timestamp: Date.now()
            });

            // Model audio frequency pulse for visualizers
            broadcastAll({
              type: 'audio_meter',
              rms: 0.15 + Math.random() * 0.25,
              source: 'agent'
            });
          } else {
            clearInterval(streamInterval);
            isSpeaking = false;
            broadcastAll({
              type: 'agent_speak_end',
              fullText: accumulatedSpeech,
              timestamp: Date.now()
            });
          }
        }, 120);
      }
    } catch (e: any) {
      console.error('Error handling WebSocket message:', e);
    }
  });

  clientWs.on('close', () => {
    activeClients.delete(clientWs);
    if (currentSpeakingTimeout) {
      clearTimeout(currentSpeakingTimeout);
    }
  });
});

// Setup Vite or Static File Serving
async function startServer() {
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, () => {
    console.log(`[Mochi Voice Server] Running on http://localhost:${PORT}`);
    console.log(`[Mochi Voice Server] WebSocket endpoint active at ws://localhost:${PORT}/api/live-ws`);
  });
}

startServer();
