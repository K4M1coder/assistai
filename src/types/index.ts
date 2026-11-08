export type ClientType = 'web' | 'terminal' | 'smartphone' | 'harness' | 'rbac';

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'interrupted';

export interface TranscriptMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  text: string;
  timestamp: number;
  interrupted?: boolean;
  toolCall?: {
    tool: string;
    params: any;
    result?: any;
  };
}

export interface Artifact3D {
  id: string;
  type: '3d_object';
  title: string;
  geometryType: 'torus_knot' | 'sphere' | 'quantum_crystal' | 'cylinder' | 'icosahedron';
  material: 'hologram' | 'metallic' | 'glass' | 'neon_wireframe';
  color: string;
  wireframe?: boolean;
  createdAt: string;
  metadata?: {
    engine?: string;
    vertices?: number;
    renderPipeline?: string;
  };
}

export interface ArtifactCode {
  id: string;
  type: 'code';
  title: string;
  language: 'typescript' | 'python' | 'rust' | 'shell';
  code: string;
  output?: string;
  createdAt: string;
}

export interface ArtifactImage {
  id: string;
  type: 'image';
  title: string;
  prompt: string;
  aspectRatio: string;
  primaryColor?: string;
  mockUrl?: string;
  createdAt: string;
}

export interface ArtifactMusic {
  id: string;
  type: 'music';
  title: string;
  genre: string;
  key: string;
  tempo: number;
  notes: string[];
  createdAt: string;
}

export type Artifact = Artifact3D | ArtifactCode | ArtifactImage | ArtifactMusic;

export interface AtlassianItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  service: 'jira' | 'confluence';
  assignee?: string;
  space?: string;
}

export interface MicrosoftItem {
  id: string;
  service: 'teams' | 'outlook' | 'azure_devops';
  channel?: string;
  message?: string;
  subject?: string;
  attendees?: string[];
  pipeline?: string;
  status?: string;
  duration?: string;
  time?: string;
  sender?: string;
}

export interface GoogleItem {
  id: string;
  service: 'calendar' | 'drive' | 'gmail';
  title?: string;
  fileName?: string;
  subject?: string;
  time?: string;
  modified?: string;
  owner?: string;
  attendees?: string[];
  snippet?: string;
  unread?: boolean;
}

export interface IntegrationsState {
  atlassian: AtlassianItem[];
  microsoft: MicrosoftItem[];
  google: GoogleItem[];
}

export interface VramAllocation {
  subsystem: string;
  model?: string;
  allocatedMb: number;
  precision?: string;
  latencyMs?: number;
  maxTokens?: number;
  activeTokens?: number;
  purpose?: string;
  status: string;
}

export interface VramStatus {
  device: string;
  pciId: string;
  vramTotalMb: number;
  vramUsedMb: number;
  vramFreeMb: number;
  utilizationPercent: number;
  hardwareTier: string;
  supportedTiers: Array<{ name: string; status: string; vram: string }>;
  allocations: VramAllocation[];
  sharedMemory: {
    status: string;
    ringBufferMb: number;
    latencyUs: number;
    syncMode: string;
  };
}

export interface SharedMemoryState {
  status: string;
  ipcType: string;
  bufferSize: string;
  activeContextTokens: number;
  maxContextTokens: number;
  componentsSynced: string[];
  lastSyncTimestamp: number;
}

export interface AgentActionObservation {
  id: string;
  step: number;
  thought: string;
  action: string;
  tool: string;
  parameters: any;
  observation: string;
  status: 'executing' | 'completed' | 'failed';
  timestamp: string;
}

export interface ConversationSession {
  id: string;
  projectId: string;
  title: string;
  status: 'active' | 'completed' | 'paused' | 'running';
  contextTokensUsed: number;
  maxContextTokens: number;
  summary: string;
  lastUpdated: string;
  transcripts: TranscriptMessage[];
  artifacts: Artifact[];
  integrations: IntegrationsState;
  agentSteps: AgentActionObservation[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  sessions: ConversationSession[];
}

export type ExtendedFeatureKey =
  | 'web_search'
  | 'code_execution'
  | 'isolated_sandbox'
  | 'connected_sandbox'
  | 'agentic_tasks'
  | 'image_generation'
  | 'music_generation'
  | 'threejs_3d'
  | 'enterprise_connectors'
  | 'mcp_plugins'
  | 'hardware_override'
  | 'user_management'
  | 'delete_project';

export type UserRole = 'admin' | 'ai_engineer' | 'operator' | 'viewer';

export type UserPermissionsMap = Record<ExtendedFeatureKey, boolean>;

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
  apiKey: string;
  customOverrides?: Partial<UserPermissionsMap>;
  createdAt: string;
  lastLogin: string;
}

export interface SecurityAuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  feature: ExtendedFeatureKey;
  action: string;
  status: 'granted' | 'denied';
  details: string;
}

export interface MCPPluginConfig {
  id: string;
  name: string;
  description: string;
  version: string;
  status: 'enabled' | 'disabled';
  endpoint: string;
  tools: string[];
}


