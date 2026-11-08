import {
  UserProfile,
  UserRole,
  ExtendedFeatureKey,
  UserPermissionsMap,
  SecurityAuditLog,
} from '../types';

export const ALL_FEATURES: Array<{
  key: ExtendedFeatureKey;
  label: string;
  category: 'intelligence' | 'sandbox' | 'media' | 'devops' | 'system';
  description: string;
}> = [
  {
    key: 'web_search',
    label: 'Recherche Web',
    category: 'intelligence',
    description: 'Requêtes de recherche internet en direct et grounding de contextes.',
  },
  {
    key: 'code_execution',
    label: 'Exécution de Code',
    category: 'sandbox',
    description: 'Lancement de scripts et isolats (TypeScript, Python, Rust).',
  },
  {
    key: 'isolated_sandbox',
    label: 'Sandbox Isolée (Air-Gapped)',
    category: 'sandbox',
    description: 'Exécution locale v8 hermétique sans accès réseau ni socket sortant.',
  },
  {
    key: 'connected_sandbox',
    label: 'Sandbox Connectée',
    category: 'sandbox',
    description: 'Accès réseau autorisé, téléchargement de paquets npm/pip.',
  },
  {
    key: 'agentic_tasks',
    label: 'Tâches Agentiques (OpenHands)',
    category: 'intelligence',
    description: 'Boucles autonomes multi-étapes planification/observation/action.',
  },
  {
    key: 'image_generation',
    label: "Création d'Images",
    category: 'media',
    description: 'Génération neuronale de rendus visuels et schémas conceptuels.',
  },
  {
    key: 'music_generation',
    label: 'Création Musicale',
    category: 'media',
    description: 'Synthétiseur polyphonique 6 voix et flux audio procéduraux.',
  },
  {
    key: 'threejs_3d',
    label: 'Moteur 3D & Shaders',
    category: 'media',
    description: 'Génération de maillages Three.js WebGL, shaders PBR et particules.',
  },
  {
    key: 'enterprise_connectors',
    label: 'Connecteurs Entreprise',
    category: 'devops',
    description: 'Synchronisation Atlassian Jira, Microsoft Teams et Google Workspace.',
  },
  {
    key: 'mcp_plugins',
    label: 'MCP & Plugins Externes',
    category: 'devops',
    description: 'Appel d’outils Model Context Protocol et extensions d’agents.',
  },
  {
    key: 'hardware_override',
    label: 'Hardware Overrides (B60)',
    category: 'system',
    description: 'Réallocation mémoire VRAM 24GB et tuning de scripts GPU.',
  },
  {
    key: 'user_management',
    label: 'Gestion Utilisateurs & Rôles',
    category: 'system',
    description: 'Création d’utilisateurs, attribution de rôles et génération de clés API.',
  },
  {
    key: 'delete_project',
    label: 'Suppression Projets & Sessions',
    category: 'system',
    description: 'Suppression définitive d’archives de projets et mémoires 256K.',
  },
];

// Helper to construct all-enabled permission map (Demo default: ALL TRUE)
export function createAllAllowedPermissions(): UserPermissionsMap {
  return {
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
}

export const INITIAL_USERS: UserProfile[] = [
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
    name: 'Security Auditor (Invité)',
    email: 'guest.auditor@telemetry.local',
    role: 'viewer',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=faces',
    apiKey: 'mochi_view_12dd44a890fe884433ba',
    customOverrides: {},
    createdAt: '2026-11-07T16:00:00Z',
    lastLogin: 'Hier',
  },
];

class AuthService {
  private currentUser: UserProfile = INITIAL_USERS[0];
  private allUsers: UserProfile[] = INITIAL_USERS;
  private roleDefaults: Record<UserRole, UserPermissionsMap> = {
    // In demo mode: ALL features authorized and enabled by default
    admin: createAllAllowedPermissions(),
    ai_engineer: createAllAllowedPermissions(),
    operator: createAllAllowedPermissions(),
    viewer: createAllAllowedPermissions(),
  };
  private auditLogs: SecurityAuditLog[] = [
    {
      id: 'log-1',
      timestamp: '15:38:12',
      userId: 'usr-kamicth',
      userName: 'Hardware Lead (kamicth)',
      userRole: 'admin',
      feature: 'hardware_override',
      action: 'VRAM Allocation Inspection (Intel Arc Pro B60)',
      status: 'granted',
      details: 'Alloué 24GB VRAM avec ratio 76.3% sous mode Démo Unrestricted.',
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
      details: 'Exécution autorisée via jeton de session administrateur.',
    },
  ];
  private listeners: Array<() => void> = [];

  constructor() {
    this.fetchServerState();
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public subscribe(cb: () => void) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  public async fetchServerState() {
    try {
      const res = await fetch('/api/auth/state');
      if (res.ok) {
        const data = await res.json();
        if (data.currentUser) this.currentUser = data.currentUser;
        if (data.allUsers) this.allUsers = data.allUsers;
        if (data.roleDefaults) this.roleDefaults = data.roleDefaults;
        if (data.auditLogs) this.auditLogs = data.auditLogs;
        this.notify();
      }
    } catch (e) {
      console.warn('Could not fetch server auth state, using local memory state');
    }
  }

  public getCurrentUser(): UserProfile {
    return this.currentUser;
  }

  public getAllUsers(): UserProfile[] {
    return this.allUsers;
  }

  public getRoleDefaults(): Record<UserRole, UserPermissionsMap> {
    return this.roleDefaults;
  }

  public getAuditLogs(): SecurityAuditLog[] {
    return this.auditLogs;
  }

  // Check if a specific feature is currently allowed for the active or given user
  public isFeatureAllowed(feature: ExtendedFeatureKey, user: UserProfile = this.currentUser): boolean {
    // 1. Check custom user-level override if explicitly set
    if (user.customOverrides && typeof user.customOverrides[feature] === 'boolean') {
      return user.customOverrides[feature] as boolean;
    }
    // 2. Fallback to role baseline policy
    const rolePolicy = this.roleDefaults[user.role];
    if (rolePolicy && typeof rolePolicy[feature] === 'boolean') {
      return rolePolicy[feature];
    }
    // Default safe fallback in demo mode: true
    return true;
  }

  // Switch active user
  public async switchUser(userId: string): Promise<UserProfile> {
    const found = this.allUsers.find((u) => u.id === userId);
    if (found) {
      this.currentUser = found;
      this.logSecurityEvent(
        'user_management',
        `Changement de session active vers ${found.name} (${found.role.toUpperCase()})`,
        'granted',
        `Jeton de session basculé vers ${found.email}`
      );
      this.notify();
      try {
        await fetch('/api/auth/switch-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
      } catch (e) {}
    }
    return this.currentUser;
  }

  // Toggle role-level permission
  public async toggleRoleFeature(role: UserRole, feature: ExtendedFeatureKey, allowed: boolean) {
    if (!this.roleDefaults[role]) return;
    this.roleDefaults[role][feature] = allowed;
    this.logSecurityEvent(
      'user_management',
      `Modification rôle ${role.toUpperCase()} : ${feature} -> ${allowed ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`,
      'granted',
      `Matrice de permissions globale mise à jour`
    );
    this.notify();

    try {
      await fetch('/api/auth/roles-permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, feature, allowed }),
      });
    } catch (e) {}
  }

  // Toggle user-level individual override
  public async toggleUserOverride(userId: string, feature: ExtendedFeatureKey, allowed: boolean | null) {
    this.allUsers = this.allUsers.map((u) => {
      if (u.id === userId) {
        const nextOverrides = { ...(u.customOverrides || {}) };
        if (allowed === null) {
          delete nextOverrides[feature];
        } else {
          nextOverrides[feature] = allowed;
        }
        const updated = { ...u, customOverrides: nextOverrides };
        if (this.currentUser.id === userId) {
          this.currentUser = updated;
        }
        return updated;
      }
      return u;
    });

    this.logSecurityEvent(
      'user_management',
      `Dérogation utilisateur pour ${userId} : ${feature} -> ${allowed === null ? 'HERITÉ' : allowed ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`,
      'granted',
      `Priorité locale appliquée sur le profil utilisateur`
    );
    this.notify();

    try {
      await fetch(`/api/auth/users/${userId}/override`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature, allowed }),
      });
    } catch (e) {}
  }

  // Reset everything to Demo Defaults (All 13 features enabled)
  public async resetToDemoDefaults() {
    this.roleDefaults = {
      admin: createAllAllowedPermissions(),
      ai_engineer: createAllAllowedPermissions(),
      operator: createAllAllowedPermissions(),
      viewer: createAllAllowedPermissions(),
    };
    this.allUsers = this.allUsers.map((u) => ({
      ...u,
      customOverrides: {},
    }));
    this.currentUser = {
      ...this.currentUser,
      customOverrides: {},
    };

    this.logSecurityEvent(
      'user_management',
      'Réinitialisation configuration Démo : Toutes les fonctionnalités autorisées',
      'granted',
      'Mode démonstration sans restriction restauré'
    );
    this.notify();

    try {
      await fetch('/api/auth/reset-demo', { method: 'POST' });
    } catch (e) {}
  }

  // Create new local user
  public async createUser(name: string, email: string, role: UserRole): Promise<UserProfile> {
    const id = 'usr-' + Date.now();
    const apiKey = 'mochi_' + role.slice(0, 3) + '_' + Math.random().toString(36).substring(2, 12);
    const newUser: UserProfile = {
      id,
      name,
      email,
      role,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=faces',
      apiKey,
      customOverrides: {},
      createdAt: new Date().toISOString(),
      lastLogin: 'Nouveau compte',
    };
    this.allUsers.push(newUser);
    this.logSecurityEvent(
      'user_management',
      `Création compte utilisateur : ${name} (${role.toUpperCase()})`,
      'granted',
      `Clé API générée : ${apiKey.slice(0, 10)}...`
    );
    this.notify();

    try {
      await fetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
    } catch (e) {}
    return newUser;
  }

  // Generate new API key for user
  public async generateApiKey(userId: string): Promise<string> {
    const newKey = 'mochi_key_' + Math.random().toString(36).substring(2, 14) + Date.now().toString(36);
    this.allUsers = this.allUsers.map((u) => {
      if (u.id === userId) {
        const updated = { ...u, apiKey: newKey };
        if (this.currentUser.id === userId) this.currentUser = updated;
        return updated;
      }
      return u;
    });

    this.logSecurityEvent(
      'user_management',
      `Régénération Clé API pour ${userId}`,
      'granted',
      `Nouvelle clé MCP/CLI générée`
    );
    this.notify();

    try {
      await fetch('/api/auth/api-keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newKey }),
      });
    } catch (e) {}
    return newKey;
  }

  // Security audit log entry
  public logSecurityEvent(
    feature: ExtendedFeatureKey,
    action: string,
    status: 'granted' | 'denied',
    details: string
  ) {
    const newLog: SecurityAuditLog = {
      id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      userId: this.currentUser.id,
      userName: this.currentUser.name,
      userRole: this.currentUser.role,
      feature,
      action,
      status,
      details,
    };
    this.auditLogs = [newLog, ...this.auditLogs.slice(0, 49)];
    this.notify();
  }
}

export const authService = new AuthService();
