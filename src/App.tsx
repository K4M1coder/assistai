import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { WebVoiceClient } from './components/WebVoiceClient';
import { TerminalVoiceClient } from './components/TerminalVoiceClient';
import { SmartphoneVoiceClient } from './components/SmartphoneVoiceClient';
import { AgentHarnessStudio } from './components/AgentHarnessStudio';
import { voiceSocket } from './services/voiceSocket';
import { audioEngine } from './services/audioSynthesizer';
import { HardwareTelemetryHUD } from './components/HardwareTelemetryHUD';
import { ProjectSidebar } from './components/ProjectSidebar';
import { RBACSecurityStudio } from './components/RBACSecurityStudio';
import {
  VoiceState,
  ClientType,
  TranscriptMessage,
  Artifact,
  IntegrationsState,
  VramStatus,
  Project,
  ConversationSession,
} from './types';

export default function App() {
  const [currentView, setCurrentView] = useState<ClientType | 'split'>('split');
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [userRms, setUserRms] = useState<number>(0);
  const [agentRms, setAgentRms] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [serverMode, setServerMode] = useState<string>('Intel Arc B60 (24GB) • Moshi S2S • 256K Context');
  const [streamingText, setStreamingText] = useState<string>('');
  const [activeToolTab, setActiveToolTab] = useState<string>('openhands');
  const [vramStatus, setVramStatus] = useState<VramStatus | null>(null);

  // Multi-project and isolated 256K session management
  const [projects, setProjects] = useState<Project[]>([
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
  ]);

  const [activeProjectId, setActiveProjectId] = useState<string>('proj-audio-dsp');
  const [activeSessionId, setActiveSessionId] = useState<string>('sess-dsp-noise-gate');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);

  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([
    {
      id: 'welcome-1',
      role: 'agent',
      text: "Hello! I'm running on the Mochi full-duplex conversational voice architecture. You can talk freely, interrupt me mid-sentence, ask me to search or switch sessions (e.g. 'Find the 3D drone session'), or command the agent harness to generate 3D models, execute code, and sync enterprise tools.",
      timestamp: Date.now() - 4000,
    },
  ]);

  const [artifacts, setArtifacts] = useState<Artifact[]>([
    {
      id: 'art-3d-init',
      type: '3d_object',
      title: 'Quantum Resonance Core',
      geometryType: 'torus_knot',
      material: 'hologram',
      color: '#06b6d4',
      createdAt: new Date().toISOString(),
      metadata: { engine: 'Three.js WebGL', vertices: 2450, renderPipeline: 'PBR Physical Shader' },
    },
    {
      id: 'art-code-init',
      type: 'code',
      title: 'Fast Fourier Transform Audio Stream Filter',
      language: 'typescript',
      code: `// Real-time FFT Audio Buffer Filter for Mochi Engine\nexport function applyNoiseGate(pcm16: Int16Array, threshold = 450): Int16Array {\n  const clean = new Int16Array(pcm16.length);\n  for (let i = 0; i < pcm16.length; i++) {\n    const sample = pcm16[i];\n    clean[i] = Math.abs(sample) < threshold ? 0 : sample;\n  }\n  return clean;\n}`,
      output: `> Running FFT isolate...\n> Noise floor attenuated by 24dB.\n> Ready for 24kHz stream.`,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'art-music-init',
      type: 'music',
      title: 'Neo-Tokyo Midnight Ambient Drone',
      genre: 'ambient-synth',
      key: 'D Minor',
      tempo: 92,
      notes: ['D3', 'F3', 'A3', 'C4', 'E4', 'A4'],
      createdAt: new Date().toISOString(),
    },
  ]);

  const [integrations, setIntegrations] = useState<IntegrationsState>({
    atlassian: [
      { id: 'PROJ-1042', title: 'Implement full-duplex PCM speech buffer', status: 'In Progress', priority: 'High', service: 'jira', assignee: 'Alex Chen' },
      { id: 'PROJ-1043', title: 'Connect Gemini Live WebSocket gateway', status: 'Done', priority: 'Critical', service: 'jira', assignee: 'Sarah Vance' },
      { id: 'CONF-88', title: 'Mochi Architecture Whitepaper & Low-latency Specs', status: 'Published', priority: 'Medium', service: 'confluence', space: 'ARCH' },
    ],
    microsoft: [
      { id: 'ms-1', service: 'teams', channel: '#general-engineering', message: 'Voice agent server harness deployed with Three.js 3D renderer and Atlassian sync.', time: '10:42 AM', sender: 'Mochi Agent' },
      { id: 'ms-2', service: 'outlook', subject: 'Sprint Review: Real-time Audio Interruption Performance', attendees: ['kamicth@gmail.com', 'engineering@team.ai'], time: 'Tomorrow, 2:00 PM' },
      { id: 'ms-3', service: 'azure_devops', pipeline: 'CI/CD Multiplatform Build (Linux/Win/Mobile)', status: 'Success', duration: '1m 45s' },
    ],
    google: [
      { id: 'g-1', service: 'calendar', title: 'Architecture Sync: Cross-Platform Voice Clients', time: 'Today, 4:30 PM', attendees: ['kamicth@gmail.com'] },
      { id: 'g-2', service: 'drive', fileName: 'Mochi_Neural_Speech_Tokens_v2.gdoc', modified: '2 hours ago', owner: 'Engineering AI' },
      { id: 'g-3', service: 'gmail', subject: 'Integration Hook: WebRTC & WebSocket Voice Pipeline', snippet: 'Automated notification: All tools initialized without latency spikes.', unread: false },
    ],
  });

  // Initialize voice socket & state synchronization
  useEffect(() => {
    voiceSocket.setCallbacks({
      onStatusChange: (connected, mode) => {
        setIsConnected(connected);
        setServerMode(mode);
      },
      onTranscript: (msg) => {
        setTranscripts((prev) => [...prev, msg]);
      },
      onAgentChunk: (text, isFinal) => {
        setStreamingText(text);
        setVoiceState('speaking');
        if (isFinal) {
          setTimeout(() => {
            setStreamingText('');
            setTranscripts((prev) => [
              ...prev,
              {
                id: 'agent-' + Date.now(),
                role: 'agent',
                text,
                timestamp: Date.now(),
              },
            ]);
            setVoiceState('idle');
          }, 400);
        }
      },
      onInterrupted: () => {
        setVoiceState('interrupted');
        setStreamingText('');
        setTimeout(() => setVoiceState('idle'), 1000);
      },
      onToolExecution: (tool, params, result, newArtifacts, newIntegrations) => {
        if (newArtifacts) setArtifacts(newArtifacts);
        if (newIntegrations) setIntegrations(newIntegrations);

        if (tool.includes('3d')) setActiveToolTab('3d');
        else if (tool.includes('code')) setActiveToolTab('code');
        else if (tool.includes('music')) setActiveToolTab('music');
        else if (tool.includes('image')) setActiveToolTab('image');
        else if (tool.includes('atlassian') || tool.includes('microsoft') || tool.includes('google')) {
          setActiveToolTab('integrations');
        }
      },
      onSwitchSession: (projectId: string, sessionId: string, session?: any, spokenSummary?: string) => {
        setActiveProjectId(projectId);
        setActiveSessionId(sessionId);
        setVoiceNotice(
          `Voice switch complete: session “${session?.title || sessionId}” activated (256K context synchronized)`
        );
        setTimeout(() => setVoiceNotice(null), 6000);
        // Switch to split view so user sees both the voice interaction and the updated harness
        setCurrentView('split');
      },
      onAudioMeter: (rms, source) => {
        if (source === 'user') setUserRms(rms);
        if (source === 'agent') setAgentRms(rms);
      },
    });

    voiceSocket.connect();

    // Fetch initial projects & sessions
    fetch('/api/projects')
      .then((res) => res.json())
      .then((data) => {
        if (data.projects && data.projects.length > 0) {
          setProjects(data.projects);
          setActiveProjectId(data.projects[0].id);
          if (data.projects[0].sessions && data.projects[0].sessions.length > 0) {
            setActiveSessionId(data.projects[0].sessions[0].id);
          }
        }
      })
      .catch((err) => console.warn('Could not fetch projects:', err));

    // Fetch initial server state & VRAM telemetry
    fetch('/api/agent/state')
      .then((res) => res.json())
      .then((data) => {
        if (data.artifacts?.length) setArtifacts(data.artifacts);
        if (data.integrations) setIntegrations(data.integrations);
      })
      .catch((err) => console.warn('Could not fetch initial agent state:', err));

    fetch('/api/vram/status')
      .then((res) => res.json())
      .then((data) => setVramStatus(data))
      .catch((err) => console.warn('Could not fetch initial vram status:', err));
  }, []);

  const fetchVram = () => {
    fetch('/api/vram/status')
      .then((res) => res.json())
      .then((data) => setVramStatus(data))
      .catch((err) => console.warn('VRAM refresh error:', err));
  };

  const handleSelectSession = (projectId: string, sessionId: string) => {
    setActiveProjectId(projectId);
    setActiveSessionId(sessionId);
    const selectedProj = projects.find((p) => p.id === projectId);
    const selectedSess = selectedProj?.sessions.find((s) => s.id === sessionId);
    if (selectedSess) {
      setVoiceNotice(`Session selected: “${selectedSess.title}” (isolated 256K context)`);
      setTimeout(() => setVoiceNotice(null), 4000);
    }
  };

  const handleCreateProject = (name: string, description: string) => {
    fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.project) {
          setProjects((prev) => [data.project, ...prev]);
          setActiveProjectId(data.project.id);
          if (data.project.sessions?.[0]) {
            setActiveSessionId(data.project.sessions[0].id);
          }
        }
      })
      .catch((err) => console.warn('Create project failed:', err));
  };

  const handleCreateSession = (projectId: string, title: string) => {
    fetch(`/api/projects/${projectId}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.session) {
          setProjects((prev) =>
            prev.map((p) =>
              p.id === projectId ? { ...p, sessions: [data.session, ...p.sessions] } : p
            )
          );
          setActiveSessionId(data.session.id);
        }
      })
      .catch((err) => console.warn('Create session failed:', err));
  };

  const handleVoiceSearch = (query: string) => {
    voiceSocket.sendText(`find session ${query}`);
  };

  const handleToolSelect = (toolName: string) => {
    if (toolName.includes('3d')) setActiveToolTab('3d');
    else if (toolName.includes('code')) setActiveToolTab('code');
    else if (toolName.includes('music')) setActiveToolTab('music');
    else if (toolName.includes('image')) setActiveToolTab('image');
    else setActiveToolTab('openhands');

    if (currentView !== 'split') {
      setCurrentView('harness');
    }
  };

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const activeSession = activeProject?.sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Navigation */}
      <Navbar
        currentView={currentView}
        setCurrentView={setCurrentView}
        voiceState={voiceState}
        isConnected={isConnected}
        serverMode={serverMode}
      />

      {/* Main Workspace Area */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto p-3 sm:p-5 flex flex-col space-y-4">
        {/* Hardware VRAM & Shared Memory Telemetry HUD */}
        <HardwareTelemetryHUD vramStatus={vramStatus} onRefresh={fetchVram} />

        {/* Voice Auto-Switch Notification Banner */}
        {voiceNotice && (
          <div className="bg-gradient-to-r from-cyan-950/90 via-slate-900 to-indigo-950/90 border border-cyan-500/60 text-cyan-200 px-4 py-2.5 rounded-xl flex items-center justify-between shadow-lg shadow-cyan-950/40">
            <div className="flex items-center space-x-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
              <span className="text-xs font-mono font-medium">{voiceNotice}</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] uppercase font-mono bg-cyan-900/60 border border-cyan-700/50 px-2 py-0.5 rounded text-cyan-300">
                Shared Memory IPC • 14μs Latency
              </span>
              <button
                onClick={() => setVoiceNotice(null)}
                className="text-slate-400 hover:text-slate-200 text-xs px-1"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* VIEW 1: SPLIT STUDIO (SIDEBAR + VOICE CLIENT + AGENT HARNESS) */}
        {currentView === 'split' && (
          <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-[660px]">
            {/* Collapsible Projects & Sessions Sidebar */}
            <div className="h-[620px] lg:h-auto flex-shrink-0">
              <ProjectSidebar
                projects={projects}
                activeProjectId={activeProjectId}
                activeSessionId={activeSessionId}
                onSelectSession={handleSelectSession}
                onCreateProject={handleCreateProject}
                onCreateSession={handleCreateSession}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                onVoiceSearchRequest={handleVoiceSearch}
              />
            </div>

            {/* Main Stage: Voice + Harness Side-by-Side */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-[640px]">
              {/* Left Column: Web Voice Client & Real-time Conversational Core */}
              <div className="lg:col-span-5 h-[620px] lg:h-full flex flex-col">
                <WebVoiceClient
                  voiceState={voiceState}
                  setVoiceState={setVoiceState}
                  userRms={userRms}
                  agentRms={agentRms}
                  transcripts={transcripts}
                  streamingText={streamingText}
                  onToolSelect={handleToolSelect}
                />
              </div>

              {/* Right Column: Agent Server Harness Workspace */}
              <div className="lg:col-span-7 h-[620px] lg:h-full flex flex-col">
                <AgentHarnessStudio
                  artifacts={artifacts}
                  setArtifacts={setArtifacts}
                  integrations={integrations}
                  setIntegrations={setIntegrations}
                  activeToolTab={activeToolTab}
                  activeSession={activeSession}
                />
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: DEDICATED WEB VOICE CLIENT */}
        {currentView === 'web' && (
          <div className="w-full max-w-3xl mx-auto flex-1 min-h-[600px] flex flex-col">
            <WebVoiceClient
              voiceState={voiceState}
              setVoiceState={setVoiceState}
              userRms={userRms}
              agentRms={agentRms}
              transcripts={transcripts}
              streamingText={streamingText}
              onToolSelect={handleToolSelect}
            />
          </div>
        )}

        {/* VIEW 3: DEDICATED TERMINAL VOICE CLIENT (LINUX & WINDOWS CLI) */}
        {currentView === 'terminal' && (
          <div className="w-full max-w-4xl mx-auto flex-1 min-h-[620px] flex flex-col">
            <TerminalVoiceClient
              voiceState={voiceState}
              userRms={userRms}
              agentRms={agentRms}
              transcripts={transcripts}
              streamingText={streamingText}
            />
          </div>
        )}

        {/* VIEW 4: SMARTPHONE GUI APP */}
        {currentView === 'smartphone' && (
          <div className="w-full flex-1 flex items-center justify-center min-h-[640px]">
            <SmartphoneVoiceClient
              voiceState={voiceState}
              setVoiceState={setVoiceState}
              userRms={userRms}
              agentRms={agentRms}
              transcripts={transcripts}
              streamingText={streamingText}
              artifacts={artifacts}
              onSelectArtifact={() => setCurrentView('harness')}
            />
          </div>
        )}

        {/* VIEW 5: AGENT SERVER HARNESS FULL VIEW */}
        {currentView === 'harness' && (
          <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-[660px]">
            <div className="h-[620px] lg:h-auto flex-shrink-0">
              <ProjectSidebar
                projects={projects}
                activeProjectId={activeProjectId}
                activeSessionId={activeSessionId}
                onSelectSession={handleSelectSession}
                onCreateProject={handleCreateProject}
                onCreateSession={handleCreateSession}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                onVoiceSearchRequest={handleVoiceSearch}
              />
            </div>
            <div className="flex-1 min-h-[640px] flex flex-col">
              <AgentHarnessStudio
                artifacts={artifacts}
                setArtifacts={setArtifacts}
                integrations={integrations}
                setIntegrations={setIntegrations}
                activeToolTab={activeToolTab}
                activeSession={activeSession}
              />
            </div>
          </div>
        )}

        {/* VIEW 6: EXTENDED RBAC & SECURITY STUDIO */}
        {currentView === 'rbac' && (
          <div className="w-full flex-1 min-h-[660px] flex flex-col">
            <RBACSecurityStudio onClose={() => setCurrentView('split')} />
          </div>
        )}
      </main>
    </div>
  );
}
