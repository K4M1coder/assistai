import React, { useState } from 'react';
import { Project, ConversationSession } from '../types';

interface ProjectSidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  activeSessionId: string | null;
  onSelectSession: (projectId: string, sessionId: string) => void;
  onCreateProject: (name: string, description: string) => void;
  onCreateSession: (projectId: string, title: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onVoiceSearchRequest?: (query: string) => void;
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  activeSessionId,
  onSelectSession,
  onCreateProject,
  onCreateSession,
  isCollapsed = false,
  onToggleCollapse,
  onVoiceSearchRequest,
}: ProjectSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({
    'proj-audio-dsp': true,
    'proj-3d-sim': true,
    'proj-enterprise': true,
  });
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [addingSessionToProjId, setAddingSessionToProjId] = useState<string | null>(null);
  const [newSessionTitle, setNewSessionTitle] = useState('');

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  // Filtered projects and sessions based on global search
  const filteredProjects = projects.map((p) => {
    const matchesProject =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchingSessions = p.sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.summary.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return {
      ...p,
      matchingSessions: searchQuery ? matchingSessions : p.sessions,
      isVisible: searchQuery ? matchesProject || matchingSessions.length > 0 : true,
    };
  }).filter((p) => p.isVisible);

  const handleCreateProjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    onCreateProject(newProjectName.trim(), newProjectDesc.trim());
    setNewProjectName('');
    setNewProjectDesc('');
    setIsCreatingProject(false);
  };

  const handleCreateSessionSubmit = (e: React.FormEvent, projectId: string) => {
    e.preventDefault();
    if (!newSessionTitle.trim()) return;
    onCreateSession(projectId, newSessionTitle.trim());
    setNewSessionTitle('');
    setAddingSessionToProjId(null);
  };

  if (isCollapsed) {
    return (
      <aside aria-label="Projects navigation" className="w-12 bg-slate-900/80 border-r border-slate-800 flex flex-col items-center py-3 select-none transition-all">
        <button
          onClick={onToggleCollapse}
          className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-slate-800/80 rounded transition"
          title="Open projects and sessions sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <div className="mt-4 flex flex-col space-y-3">
          {projects.map((p) => {
            const isActive = p.id === activeProjectId;
            return (
              <button
                key={p.id}
                onClick={() => {
                  onToggleCollapse?.();
                  if (p.sessions.length > 0) {
                    onSelectSession(p.id, p.sessions[0].id);
                  }
                }}
                className={`w-7 h-7 rounded flex items-center justify-center text-xs font-mono font-bold transition ${
                  isActive ? 'ring-2 ring-cyan-400 text-white' : 'text-slate-400 hover:text-white'
                }`}
                style={{ backgroundColor: p.color + '33', borderColor: p.color }}
                title={`${p.name} (${p.sessions.length} sessions)`}
              >
                {p.name.slice(0, 2).toUpperCase()}
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  return (
    <aside aria-label="Projects and sessions" className="w-72 bg-slate-900/90 border-r border-slate-800 flex flex-col h-full select-none text-slate-200">
      {/* Top Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
            Projects & Sessions (256K)
          </h2>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsCreatingProject(!isCreatingProject)}
            className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition"
            title="New Project"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition"
              title="Collapse panel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Global Search Bar */}
      <div className="p-2.5 border-b border-slate-800 bg-slate-950/40">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions or projects..."
            className="w-full bg-slate-900 text-xs text-slate-100 placeholder-slate-500 pl-7 pr-7 py-1.5 rounded border border-slate-700/80 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          <svg
            className="w-3.5 h-3.5 absolute left-2 top-2 text-slate-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-slate-500 hover:text-slate-300"
            >
              ✕
            </button>
          )}
        </div>

        {/* Voice Search Hint */}
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
          <span className="flex items-center space-x-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Voice search active</span>
          </span>
          {onVoiceSearchRequest && (
            <button
              onClick={() => onVoiceSearchRequest(searchQuery || 'session status')}
              className="text-cyan-400 hover:text-cyan-300 hover:underline flex items-center space-x-0.5"
            >
              <span>Speak</span>
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* New Project Form Modal/Inline */}
      {isCreatingProject && (
        <form onSubmit={handleCreateProjectSubmit} className="p-3 bg-slate-800/80 border-b border-slate-700 space-y-2">
          <div className="text-xs font-semibold text-cyan-400">New Harness Project</div>
          <input
            type="text"
            required
            autoFocus
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Project name (e.g. 3D Space Robotics)"
            className="w-full bg-slate-900 text-xs px-2 py-1 rounded border border-slate-700 text-slate-100"
          />
          <input
            type="text"
            value={newProjectDesc}
            onChange={(e) => setNewProjectDesc(e.target.value)}
            placeholder="Short description..."
            className="w-full bg-slate-900 text-xs px-2 py-1 rounded border border-slate-700 text-slate-100"
          />
          <div className="flex space-x-2 justify-end pt-1">
            <button
              type="button"
              onClick={() => setIsCreatingProject(false)}
              className="text-[11px] text-slate-400 hover:text-slate-200 px-2 py-0.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-[11px] bg-cyan-600 hover:bg-cyan-500 text-white font-medium px-2.5 py-0.5 rounded"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {/* Projects & Nested Sessions List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3 custom-scrollbar">
        {filteredProjects.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No project or session matches “{searchQuery}”
          </div>
        ) : (
          filteredProjects.map((project) => {
            const isExpanded = expandedProjects[project.id] !== false;
            const isProjectActive = project.id === activeProjectId;
            const sessionsToRender = project.matchingSessions || project.sessions;

            return (
              <div
                key={project.id}
                className="rounded border border-slate-800/80 bg-slate-900/50 overflow-hidden"
              >
                {/* Project Header Row */}
                <div
                  className={`flex items-center justify-between px-2.5 py-2 cursor-pointer transition ${
                    isProjectActive ? 'bg-slate-800/70' : 'hover:bg-slate-800/40'
                  }`}
                  onClick={() => toggleProject(project.id)}
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: project.color }}
                    />
                    <span className="text-xs font-semibold text-slate-200 truncate">
                      {project.name}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded">
                      {project.sessions.length}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAddingSessionToProjId(
                          addingSessionToProjId === project.id ? null : project.id
                        );
                      }}
                      className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-700/60 rounded"
                      title="Add a conversation session"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                    <svg
                      className={`w-3.5 h-3.5 text-slate-400 transform transition-transform ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                {/* Inline Add Session Form */}
                {addingSessionToProjId === project.id && (
                  <form
                    onSubmit={(e) => handleCreateSessionSubmit(e, project.id)}
                    className="p-2 bg-slate-800/90 border-t border-slate-700 flex flex-col space-y-1.5"
                  >
                    <div className="text-[11px] text-cyan-400 font-medium">New isolated 256K session</div>
                    <input
                      type="text"
                      required
                      autoFocus
                      value={newSessionTitle}
                      onChange={(e) => setNewSessionTitle(e.target.value)}
                      placeholder="Session title..."
                      className="bg-slate-900 text-xs px-2 py-1 rounded border border-slate-700 text-slate-100"
                    />
                    <div className="flex justify-end space-x-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setAddingSessionToProjId(null)}
                        className="text-[10px] text-slate-400 hover:text-slate-200"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="text-[10px] bg-cyan-600 hover:bg-cyan-500 text-white px-2 py-0.5 rounded"
                      >
                        Create session
                      </button>
                    </div>
                  </form>
                )}

                {/* Nested Sessions */}
                {isExpanded && (
                  <div className="px-1.5 py-1 space-y-1 border-t border-slate-800/60 bg-slate-950/20">
                    {sessionsToRender.length === 0 ? (
                      <div className="text-[11px] text-slate-500 py-1.5 px-2 italic">
                        No sessions
                      </div>
                    ) : (
                      sessionsToRender.map((session) => {
                        const isSessionActive = session.id === activeSessionId;
                        const tokenPct = Math.round(
                          (session.contextTokensUsed / (session.maxContextTokens || 262144)) * 100
                        );

                        return (
                          <div
                            key={session.id}
                            onClick={() => onSelectSession(project.id, session.id)}
                            className={`p-2 rounded cursor-pointer transition text-left relative group ${
                              isSessionActive
                                ? 'bg-cyan-950/40 border border-cyan-500/50 text-cyan-100 shadow-sm'
                                : 'hover:bg-slate-800/50 text-slate-300 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium truncate pr-1">
                                {session.title}
                              </span>
                              <span
                                className={`text-[9px] font-mono uppercase px-1 py-0.2 rounded border ${
                                  session.status === 'active'
                                    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-950/30'
                                    : session.status === 'completed'
                                    ? 'text-blue-400 border-blue-500/30 bg-blue-950/30'
                                    : 'text-amber-400 border-amber-500/30 bg-amber-950/30'
                                }`}
                              >
                                {session.status}
                              </span>
                            </div>

                            {/* Session Summary snippet */}
                            {session.summary && (
                              <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                                {session.summary}
                              </p>
                            )}

                            {/* 256K Token Horizon Gauge */}
                            <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-slate-400">
                              <span>
                                {session.contextTokensUsed.toLocaleString()} / 256K
                              </span>
                              <span className={tokenPct > 70 ? 'text-amber-400' : 'text-slate-400'}>
                                {tokenPct}%
                              </span>
                            </div>
                            <div className="w-full bg-slate-800 h-1 rounded-full mt-0.5 overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  tokenPct > 70 ? 'bg-amber-400' : 'bg-cyan-400'
                                }`}
                                style={{ width: `${Math.min(tokenPct, 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Memory Status */}
      <div className="p-2.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-[10px] text-slate-400 font-mono">
        <div className="flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          <span>Shared Memory IPC</span>
        </div>
        <span className="text-slate-300">14μs Latency</span>
      </div>
    </aside>
  );
}
