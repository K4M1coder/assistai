import React, { useState, useEffect } from 'react';
import {
  Shield,
  Key,
  Users,
  Terminal,
  Activity,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Plus,
  Copy,
  Check,
  Search,
  Filter,
  Sliders,
  Lock,
  Unlock,
  AlertTriangle,
  Server,
  Zap,
} from 'lucide-react';
import {
  UserProfile,
  UserRole,
  ExtendedFeatureKey,
  SecurityAuditLog,
  MCPPluginConfig,
} from '../types';
import { authService, ALL_FEATURES } from '../services/authService';

interface RBACSecurityStudioProps {
  onClose?: () => void;
}

export const RBACSecurityStudio: React.FC<RBACSecurityStudioProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'users' | 'mcp' | 'logs'>('matrix');
  const [currentUser, setCurrentUser] = useState<UserProfile>(authService.getCurrentUser());
  const [allUsers, setAllUsers] = useState<UserProfile[]>(authService.getAllUsers());
  const [roleDefaults, setRoleDefaults] = useState(authService.getRoleDefaults());
  const [auditLogs, setAuditLogs] = useState<SecurityAuditLog[]>(authService.getAuditLogs());
  const [copiedKeyUserId, setCopiedKeyUserId] = useState<string | null>(null);

  // New user modal state
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('ai_engineer');

  // User override editing state
  const [expandedUserOverrides, setExpandedUserOverrides] = useState<string | null>('usr-kamicth');

  // MCP plugins state
  const [mcpPlugins, setMcpPlugins] = useState<MCPPluginConfig[]>([
    {
      id: 'mcp-git',
      name: 'Git & GitHub MCP Server',
      description: 'Model Context Protocol local gateway for git repositories and branch diffs.',
      version: '1.4.0',
      status: 'enabled',
      endpoint: 'local://mcp-git-daemon',
      tools: ['git_status', 'git_diff', 'create_branch', 'commit_files'],
    },
    {
      id: 'mcp-filesystem',
      name: 'Air-Gapped Filesystem MCP',
      description: 'Sandboxed filesystem inspector for workspace isolates.',
      version: '2.1.2',
      status: 'enabled',
      endpoint: 'local://mcp-fs-isolate',
      tools: ['list_directory', 'read_file_secure', 'write_file_sandbox'],
    },
    {
      id: 'mcp-intel-telemetry',
      name: 'Intel Level-Zero oneAPI Telemetry MCP',
      description: 'Live hardware sensor hook for Intel Arc Pro B60 Xe2 engine.',
      version: '0.9.8',
      status: 'enabled',
      endpoint: 'local://mcp-oneapi-b60',
      tools: ['query_vram_banks', 'sample_clock_frequency', 'reset_ring_buffer'],
    },
  ]);

  // Logs filter
  const [logFilter, setLogFilter] = useState<'all' | 'granted' | 'denied'>('all');
  const [searchLogQuery, setSearchLogQuery] = useState('');

  useEffect(() => {
    const unsub = authService.subscribe(() => {
      setCurrentUser(authService.getCurrentUser());
      setAllUsers([...authService.getAllUsers()]);
      setRoleDefaults({ ...authService.getRoleDefaults() });
      setAuditLogs([...authService.getAuditLogs()]);
    });
    return unsub;
  }, []);

  const handleCopyApiKey = (userId: string, key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKeyUserId(userId);
    setTimeout(() => setCopiedKeyUserId(null), 2000);
  };

  const handleToggleRolePermission = (role: UserRole, feature: ExtendedFeatureKey) => {
    const current = roleDefaults[role]?.[feature] ?? true;
    authService.toggleRoleFeature(role, feature, !current);
  };

  const handleToggleUserOverride = (userId: string, feature: ExtendedFeatureKey, allowed: boolean | null) => {
    authService.toggleUserOverride(userId, feature, allowed);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    await authService.createUser(newUserName.trim(), newUserEmail.trim(), newUserRole);
    setNewUserName('');
    setNewUserEmail('');
    setIsAddingUser(false);
  };

  const handleToggleMcpPlugin = (pluginId: string) => {
    setMcpPlugins((prev) =>
      prev.map((p) => {
        if (p.id === pluginId) {
          const nextStatus = p.status === 'enabled' ? 'disabled' : 'enabled';
          authService.logSecurityEvent(
            'mcp_plugins',
            `Basculement MCP Plugin ${p.name} -> ${nextStatus}`,
            'granted',
            `Endpoint: ${p.endpoint}`
          );
          return { ...p, status: nextStatus };
        }
        return p;
      })
    );
  };

  const filteredLogs = auditLogs.filter((log) => {
    const matchesFilter = logFilter === 'all' || log.status === logFilter;
    const matchesQuery =
      searchLogQuery === '' ||
      log.action.toLowerCase().includes(searchLogQuery.toLowerCase()) ||
      log.userName.toLowerCase().includes(searchLogQuery.toLowerCase()) ||
      log.feature.toLowerCase().includes(searchLogQuery.toLowerCase());
    return matchesFilter && matchesQuery;
  });

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl flex flex-col h-full overflow-hidden shadow-2xl backdrop-blur-md">
      {/* Header Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-950/70">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-800/80 flex items-center justify-center text-cyan-400 shadow-md">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-slate-100 font-mono tracking-tight">
                Console de Sécurité & RBAC Étendu
              </h2>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-semibold">
                Mode Démo 100% Unrestricted
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Activation / Désactivation granulaire par rôle et par utilisateur • Jetons locaux & API Keys
            </p>
          </div>
        </div>

        {/* Global Controls & User Indicator */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => authService.resetToDemoDefaults()}
            className="px-3 py-1.5 rounded-lg text-xs font-mono bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 transition flex items-center space-x-1.5 cursor-pointer shadow-sm"
            title="Rétablir 100% des fonctions activées par défaut"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Réinitialiser Tout Démo</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Active User Switcher Bar */}
      <div className="px-4 py-2.5 bg-slate-950/40 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-400 font-mono text-[11px] uppercase">Utilisateur Actif :</span>
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1">
            <img
              src={currentUser.avatar}
              alt={currentUser.name}
              className="w-5 h-5 rounded-full object-cover border border-slate-700"
            />
            <span className="font-semibold text-slate-200">{currentUser.name}</span>
            <span
              className={`text-[9px] uppercase font-mono px-1.5 py-0.2 rounded font-semibold border ${
                currentUser.role === 'admin'
                  ? 'bg-rose-950/60 text-rose-300 border-rose-800/60'
                  : currentUser.role === 'ai_engineer'
                  ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60'
                  : currentUser.role === 'operator'
                  ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              {currentUser.role.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Quick Switch Dropdown */}
        <div className="flex items-center space-x-1 text-xs">
          <span className="text-slate-400 text-[11px]">Simuler un rôle :</span>
          {allUsers.map((u) => (
            <button
              key={u.id}
              onClick={() => authService.switchUser(u.id)}
              className={`px-2 py-0.8 rounded text-[11px] font-mono transition cursor-pointer ${
                u.id === currentUser.id
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {u.role.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-800 bg-slate-950/60 px-4">
        {[
          { id: 'matrix', label: '1. Matrice des 13 Fonctions', icon: Sliders },
          { id: 'users', label: '2. Utilisateurs & Dérogations', icon: Users },
          { id: 'mcp', label: '3. Sandbox & MCP Plugins', icon: Server },
          { id: 'logs', label: "4. Journal d'Audit", icon: Activity },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`px-4 py-2.5 text-xs font-semibold font-mono flex items-center space-x-2 border-b-2 transition ${
                isActive
                  ? 'border-cyan-400 text-cyan-300 bg-slate-900/50'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/20'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Workspace Content */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar">
        {/* TAB 1: FEATURE MATRIX */}
        {activeTab === 'matrix' && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  <strong>Configuration Démo Active :</strong> Toutes les fonctionnalités sont autorisées par défaut.
                  Basculez n'importe quel commutateur pour tester les restrictions en temps réel.
                </span>
              </div>
              <span className="font-mono text-cyan-400 text-[11px]">13 / 13 Fonctions Activées</span>
            </div>

            {/* Matrix Table */}
            <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/40">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-mono text-slate-400 uppercase">
                    <th className="py-3 px-4">Fonctionnalité Système</th>
                    <th className="py-3 px-3 text-center">Admin</th>
                    <th className="py-3 px-3 text-center">AI Engineer</th>
                    <th className="py-3 px-3 text-center">Operator</th>
                    <th className="py-3 px-3 text-center">Viewer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {ALL_FEATURES.map((feat) => {
                    return (
                      <tr key={feat.key} className="hover:bg-slate-900/40 transition">
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-slate-200 flex items-center space-x-2">
                            <span>{feat.label}</span>
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.2 rounded">
                              {feat.key}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{feat.description}</p>
                        </td>

                        {/* Admin Toggle */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => handleToggleRolePermission('admin', feat.key)}
                            className={`w-9 h-5 rounded-full transition-colors relative inline-flex items-center cursor-pointer ${
                              roleDefaults.admin[feat.key] ? 'bg-cyan-500' : 'bg-slate-700'
                            }`}
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                                roleDefaults.admin[feat.key] ? 'translate-x-4.5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </td>

                        {/* AI Engineer Toggle */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => handleToggleRolePermission('ai_engineer', feat.key)}
                            className={`w-9 h-5 rounded-full transition-colors relative inline-flex items-center cursor-pointer ${
                              roleDefaults.ai_engineer[feat.key] ? 'bg-cyan-500' : 'bg-slate-700'
                            }`}
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                                roleDefaults.ai_engineer[feat.key] ? 'translate-x-4.5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </td>

                        {/* Operator Toggle */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => handleToggleRolePermission('operator', feat.key)}
                            className={`w-9 h-5 rounded-full transition-colors relative inline-flex items-center cursor-pointer ${
                              roleDefaults.operator[feat.key] ? 'bg-cyan-500' : 'bg-slate-700'
                            }`}
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                                roleDefaults.operator[feat.key] ? 'translate-x-4.5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </td>

                        {/* Viewer Toggle */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={() => handleToggleRolePermission('viewer', feat.key)}
                            className={`w-9 h-5 rounded-full transition-colors relative inline-flex items-center cursor-pointer ${
                              roleDefaults.viewer[feat.key] ? 'bg-cyan-500' : 'bg-slate-700'
                            }`}
                          >
                            <span
                              className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                                roleDefaults.viewer[feat.key] ? 'translate-x-4.5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: USERS & CUSTOM OVERRIDES */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 font-mono">
                  Comptes Collaborateurs & Dérogations Individuelles
                </h3>
                <p className="text-xs text-slate-400">
                  Attribuez des rôles et personnalisez des permissions au niveau de chaque compte utilisateur.
                </p>
              </div>
              <button
                onClick={() => setIsAddingUser(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white transition flex items-center space-x-1.5 cursor-pointer shadow-md shadow-cyan-950/40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nouveau Collaborateur</span>
              </button>
            </div>

            {/* Add User Modal */}
            {isAddingUser && (
              <form
                onSubmit={handleCreateUser}
                className="p-4 bg-slate-950/90 border border-slate-700 rounded-xl space-y-3"
              >
                <div className="text-xs font-semibold text-cyan-400 font-mono uppercase">
                  Ajouter un Collaborateur Local
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Nom complet (ex: Sarah Vance)"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                  <input
                    type="email"
                    required
                    placeholder="Email (ex: sarah.vance@ai-lab.local)"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value="admin">Admin (Hardware Lead)</option>
                    <option value="ai_engineer">AI Engineer</option>
                    <option value="operator">Operator (Voice Lead)</option>
                    <option value="viewer">Viewer (Read-Only)</option>
                  </select>
                </div>
                <div className="flex justify-end space-x-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingUser(false)}
                    className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-medium px-4 py-1 rounded"
                  >
                    Créer Compte
                  </button>
                </div>
              </form>
            )}

            {/* Users Cards */}
            <div className="space-y-3">
              {allUsers.map((user) => {
                const isExpanded = expandedUserOverrides === user.id;
                const overridesCount = Object.keys(user.customOverrides || {}).length;

                return (
                  <div
                    key={user.id}
                    className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-col space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <img
                          src={user.avatar}
                          alt={user.name}
                          className="w-10 h-10 rounded-full object-cover border border-slate-700"
                        />
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-semibold text-slate-100 text-sm">{user.name}</span>
                            <span
                              className={`text-[10px] uppercase font-mono px-2 py-0.2 rounded font-semibold border ${
                                user.role === 'admin'
                                  ? 'bg-rose-950/60 text-rose-300 border-rose-800/60'
                                  : user.role === 'ai_engineer'
                                  ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800/60'
                                  : user.role === 'operator'
                                  ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                                  : 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              {user.role.replace('_', ' ')}
                            </span>
                            {user.id === currentUser.id && (
                              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-1.5 py-0.2 rounded">
                                Connecté
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">{user.email}</div>
                        </div>
                      </div>

                      {/* API Key Box */}
                      <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1">
                        <Key className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-xs font-mono text-slate-300">
                          {user.apiKey.slice(0, 16)}...
                        </span>
                        <button
                          onClick={() => handleCopyApiKey(user.id, user.apiKey)}
                          className="p-1 text-slate-400 hover:text-cyan-300 rounded"
                          title="Copier la clé API pour CLI / MCP"
                        >
                          {copiedKeyUserId === user.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => authService.generateApiKey(user.id)}
                          className="text-[11px] font-mono text-slate-400 hover:text-slate-200 border border-slate-800 bg-slate-900 px-2 py-1 rounded"
                        >
                          Régénérer Clé
                        </button>
                        <button
                          onClick={() =>
                            setExpandedUserOverrides(isExpanded ? null : user.id)
                          }
                          className="text-[11px] font-mono bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 px-2.5 py-1 rounded hover:bg-cyan-900 transition flex items-center space-x-1"
                        >
                          <Sliders className="w-3 h-3" />
                          <span>
                            {isExpanded
                              ? 'Fermer Dérogations'
                              : `Dérogations (${overridesCount})`}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Expandable Per-User Feature Overrides */}
                    {isExpanded && (
                      <div className="pt-3 border-t border-slate-800/80">
                        <div className="text-xs font-mono text-slate-300 mb-2 font-semibold">
                          Dérogations Individuelles pour {user.name} :
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {ALL_FEATURES.map((feat) => {
                            const overrideVal = user.customOverrides?.[feat.key];
                            const isInherited = typeof overrideVal !== 'boolean';
                            const effectiveVal = authService.isFeatureAllowed(feat.key, user);

                            return (
                              <div
                                key={feat.key}
                                className="p-2 rounded bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs"
                              >
                                <div>
                                  <div className="text-slate-200 font-medium">{feat.label}</div>
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {isInherited ? '(Hérité rôle)' : '(Dérogé)'}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <button
                                    onClick={() =>
                                      handleToggleUserOverride(
                                        user.id,
                                        feat.key,
                                        isInherited ? !effectiveVal : overrideVal ? false : null
                                      )
                                    }
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold transition ${
                                      effectiveVal
                                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                                    }`}
                                  >
                                    {effectiveVal ? 'ACTIF' : 'BLOQUÉ'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: SANDBOX & MCP PLUGINS */}
        {activeTab === 'mcp' && (
          <div className="space-y-5">
            {/* Sandbox Isolation Policy */}
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
                    Mode d'Exécution Sandbox
                  </h3>
                </div>
                <span className="text-xs font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60 font-semibold">
                  Isolat v8 Hermétique Actif (0 Fuite)
                </span>
              </div>
              <p className="text-xs text-slate-400">
                La sandbox locale prend en charge deux modes de confinement. L'isolat strict bloque tout socket externe,
                tandis que la sandbox connectée autorise les téléchargements de bibliothèques pip/npm contrôlés.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-lg border border-cyan-800/60 bg-cyan-950/20 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-cyan-300">Sandbox Isolée (Air-Gapped)</div>
                    <div className="text-[11px] text-slate-400">RAM/CPU isolés, aucun accès réseau sortant</div>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 font-bold">ACTIF</span>
                </div>
                <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/40 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-200">Sandbox Connectée (Réseau)</div>
                    <div className="text-[11px] text-slate-400">Accès internet autorisé pour npm / pip / git</div>
                  </div>
                  <span className="text-xs font-mono text-cyan-400 font-bold">AUTORISÉ DÉMO</span>
                </div>
              </div>
            </div>

            {/* Model Context Protocol (MCP) Registry */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono flex items-center space-x-2">
                    <Server className="w-4 h-4 text-purple-400" />
                    <span>Registre Serveurs MCP (Model Context Protocol)</span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Connecteurs standardisés permettant aux agents d'interroger le système de fichiers, git et les capteurs GPU Intel.
                  </p>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  {mcpPlugins.filter((p) => p.status === 'enabled').length} / {mcpPlugins.length} Actifs
                </span>
              </div>

              <div className="space-y-2">
                {mcpPlugins.map((plugin) => (
                  <div
                    key={plugin.id}
                    className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-100 font-mono">
                          {plugin.name}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.2 rounded border border-slate-800">
                          v{plugin.version}
                        </span>
                        <span className="text-[10px] font-mono text-purple-400 bg-purple-950/40 border border-purple-800/40 px-1.5 py-0.2 rounded">
                          {plugin.endpoint}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">{plugin.description}</p>
                      <div className="flex items-center space-x-1.5 mt-2">
                        <span className="text-[10px] text-slate-400 font-mono uppercase">Outils:</span>
                        {plugin.tools.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800/40"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleMcpPlugin(plugin.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
                        plugin.status === 'enabled'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/80 hover:bg-emerald-900'
                          : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {plugin.status === 'enabled' ? 'ACTIVÉ' : 'DÉSACTIVÉ'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SECURITY AUDIT LOGS */}
        {activeTab === 'logs' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
                  Journal d'Audit de Sécurité en Temps Réel
                </h3>
                <p className="text-xs text-slate-400">
                  Traçabilité des vérifications de permissions RBAC et exécutions d'outils.
                </p>
              </div>

              {/* Filters */}
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Rechercher dans les logs..."
                  value={searchLogQuery}
                  onChange={(e) => setSearchLogQuery(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-48"
                />
                <select
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value as any)}
                  className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="granted">Autorisés uniquement</option>
                  <option value="denied">Refusés uniquement</option>
                </select>
              </div>
            </div>

            {/* Logs Table */}
            <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/60">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/80 text-[10px] font-mono text-slate-400 uppercase">
                    <th className="py-2.5 px-3">Horodatage</th>
                    <th className="py-2.5 px-3">Collaborateur</th>
                    <th className="py-2.5 px-3">Fonction</th>
                    <th className="py-2.5 px-3">Action Exécutée</th>
                    <th className="py-2.5 px-3">Statut</th>
                    <th className="py-2.5 px-3">Détails</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 font-mono text-[11px]">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-2 px-3 text-slate-400">{log.timestamp}</td>
                      <td className="py-2 px-3 text-slate-200">
                        <span>{log.userName}</span>
                        <span className="text-[9px] uppercase ml-1.5 text-slate-400 bg-slate-800 px-1 py-0.2 rounded">
                          {log.userRole}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-cyan-400">{log.feature}</td>
                      <td className="py-2 px-3 text-slate-200">{log.action}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                            log.status === 'granted'
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
                              : 'bg-rose-950/80 text-rose-300 border-rose-800/80'
                          }`}
                        >
                          {log.status === 'granted' ? 'AUTORISÉ' : 'REFUSÉ'}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-400 text-[10px] truncate max-w-xs">
                        {log.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Matrice de permissions synchronisée en temps réel (REST + WebSocket)</span>
        </div>
        <span className="text-slate-500">Self-Hosted Workstation (Local Bearer Tokens)</span>
      </div>
    </div>
  );
};
