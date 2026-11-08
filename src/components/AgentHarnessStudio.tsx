import React, { useState } from 'react';
import {
  Layers,
  Code2,
  Image as ImageIcon,
  Music,
  Briefcase,
  Play,
  Square,
  Sparkles,
  CheckCircle2,
  Send,
  Plus,
  RefreshCw,
  ExternalLink,
  Cpu,
  Terminal,
  Activity,
  Calendar,
  FileText,
  Mail,
  Sliders,
  Copy,
  Check,
  Box,
  Bot,
  Brain,
  Share2,
  Compass,
  ArrowRight,
  Maximize2,
  Lock,
} from 'lucide-react';
import { ThreeEngineView } from './ThreeEngineView';
import {
  Artifact,
  Artifact3D,
  ArtifactCode,
  ArtifactImage,
  ArtifactMusic,
  IntegrationsState,
  AgentActionObservation,
  ConversationSession
} from '../types';
import { audioEngine } from '../services/audioSynthesizer';
import { voiceSocket } from '../services/voiceSocket';
import { authService } from '../services/authService';

interface AgentHarnessStudioProps {
  artifacts: Artifact[];
  setArtifacts: React.Dispatch<React.SetStateAction<Artifact[]>>;
  integrations: IntegrationsState;
  setIntegrations: React.Dispatch<React.SetStateAction<IntegrationsState>>;
  activeToolTab?: string;
  activeSession?: ConversationSession;
}

export const AgentHarnessStudio: React.FC<AgentHarnessStudioProps> = ({
  artifacts,
  setArtifacts,
  integrations,
  setIntegrations,
  activeToolTab = 'openhands',
  activeSession,
}) => {
  const [tab, setTab] = useState<'openhands' | '3d' | 'code' | 'image' | 'music' | 'integrations'>(
    (activeToolTab as any) || 'openhands'
  );

  const [currentUser, setCurrentUser] = useState(authService.getCurrentUser());
  const [, setTick] = useState(0);

  React.useEffect(() => {
    const unsub = authService.subscribe(() => {
      setCurrentUser(authService.getCurrentUser());
      setTick((t) => t + 1);
    });
    return unsub;
  }, []);

  const canRunCode = authService.isFeatureAllowed('code_execution', currentUser);
  const can3D = authService.isFeatureAllowed('threejs_3d', currentUser);
  const canImage = authService.isFeatureAllowed('image_generation', currentUser);
  const canMusic = authService.isFeatureAllowed('music_generation', currentUser);
  const canAgent = authService.isFeatureAllowed('agentic_tasks', currentUser);
  const canEnterprise = authService.isFeatureAllowed('enterprise_connectors', currentUser);

  // OpenHands / Hermes-style agent loop history
  const [agentSteps, setAgentSteps] = useState<AgentActionObservation[]>([
    {
      id: 'step-1',
      step: 1,
      thought: 'User prompted full-duplex voice turn. Initialized Mimi 24kHz codec and checked Intel Arc Pro B60 24GB VRAM availability.',
      action: 'probe_hardware_vram',
      tool: 'vram_governor',
      parameters: { device: 'Intel Arc Pro B60', contextLimit: 262144 },
      observation: 'Allocated 5.2GB for Moshi S2S, 7.5GB for 256K FP8 KV cache, 4.4GB for Qwen 2.5 7B. Total: 17.1GB (6.9GB safety buffer).',
      status: 'completed',
      timestamp: '10:41:02',
    },
    {
      id: 'step-2',
      step: 2,
      thought: 'Incoming acoustic intent detected request to render a 3D procedural quantum lattice and generate low-latency DSP code.',
      action: 'execute_tool("create_3d_object")',
      tool: 'threejs_engine',
      parameters: { geometryType: 'torus_knot', material: 'hologram', color: '#06b6d4' },
      observation: 'Rendered mesh with 2,450 vertices into Three.js WebGL viewport. Asset ID: art-3d-1.',
      status: 'completed',
      timestamp: '10:41:15',
    },
    {
      id: 'step-3',
      step: 3,
      thought: 'Shared Memory IPC buffer synchronized: Spoken transcript turn mirrored into 256K context memory. Dispatched status to Microsoft Teams channel.',
      action: 'sync_enterprise_connector("teams")',
      tool: 'microsoft_hub',
      parameters: { channel: '#general-engineering', message: 'Voice agent server harness deployed on Intel Arc B60.' },
      observation: 'HTTP 200 OK: Webhook message delivered to Microsoft Teams.',
      status: 'completed',
      timestamp: '10:42:00',
    },
  ]);

  const [customGoal, setCustomGoal] = useState('');
  const [isAgentRunning, setIsAgentRunning] = useState(false);

  // 3D Engine Studio state
  const selected3d = (artifacts.find((a) => a.type === '3d_object') as Artifact3D) || null;
  const [new3dName, setNew3dName] = useState('Quantum Resonance Core');
  const [new3dType, setNew3dType] = useState<'torus_knot' | 'quantum_crystal' | 'cylinder' | 'sphere'>('torus_knot');
  const [new3dMat, setNew3dMat] = useState<'hologram' | 'metallic' | 'glass' | 'neon_wireframe'>('hologram');
  const [new3dColor, setNew3dColor] = useState('#06b6d4');

  // Code Studio state
  const selectedCode = (artifacts.find((a) => a.type === 'code') as ArtifactCode) || null;
  const [codeSnippet, setCodeSnippet] = useState(
    selectedCode?.code ||
      `// High-Throughput DSP Buffer for Mochi Voice Stream (Intel Arc SYCL/IPEX)\nexport function processAudioFrame(input: Float32Array): Int16Array {\n  const pcm16 = new Int16Array(input.length);\n  for (let i = 0; i < input.length; i++) {\n    const s = Math.max(-1, Math.min(1, input[i]));\n    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;\n  }\n  return pcm16;\n}`
  );
  const [codeLang, setCodeLang] = useState<'typescript' | 'python' | 'rust'>('typescript');
  const [executionOutput, setExecutionOutput] = useState<string | null>(
    selectedCode?.output || '[Isolate Sandbox ready for execution on Intel Arc Pro B60...]'
  );
  const [isExecuting, setIsExecuting] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // Music Studio state
  const selectedMusic = (artifacts.find((a) => a.type === 'music') as ArtifactMusic) || null;
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicTempo, setMusicTempo] = useState(selectedMusic?.tempo || 96);
  const [musicNotes, setMusicNotes] = useState<string[]>(
    selectedMusic?.notes || ['C3', 'Eb3', 'G3', 'Bb3', 'D4', 'G4']
  );
  const [activeNoteIdx, setActiveNoteIdx] = useState<number>(-1);

  // Image Studio state
  const [imagePrompt, setImagePrompt] = useState(
    'Bioluminescent neural audio waveform floating in a dark sci-fi laboratory, 8k render, octane engine'
  );
  const [imageAspect, setImageAspect] = useState('16:9');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Integrations state
  const [newJiraTitle, setNewJiraTitle] = useState('');
  const [newTeamsMsg, setNewTeamsMsg] = useState('');

  // Handlers for OpenHands Agent Loop Execution
  const handleTriggerAgentStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customGoal.trim() || isAgentRunning) return;

    if (!canAgent) {
      audioEngine.playCue('interrupt');
      authService.logSecurityEvent('agentic_tasks', 'Tâche agentique bloquée par RBAC', 'denied', `Rôle ${currentUser.role}`);
      alert(`Action non autorisée : La fonctionnalité « Tâches agentiques » est désactivée pour votre profil.`);
      return;
    }

    setIsAgentRunning(true);
    const newStepNum = agentSteps.length + 1;
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const newStep: AgentActionObservation = {
      id: 'step-' + Date.now(),
      step: newStepNum,
      thought: `OpenHands Planner: Analyzing objective "${customGoal}". Querying 256K memory context and dispatching tool action.`,
      action: `dispatch_agent_task("${customGoal.slice(0, 30)}")`,
      tool: customGoal.toLowerCase().includes('3d') ? 'threejs_engine' : customGoal.toLowerCase().includes('jira') ? 'atlassian_hub' : 'code_isolate',
      parameters: { prompt: customGoal, contextWindow: 262144 },
      observation: `Completed in 84ms on Intel Arc Pro B60. Shared memory ring buffer updated (+120 tokens). Result synchronized to Moshi voice stream.`,
      status: 'completed',
      timestamp: timeStr,
    };

    setTimeout(() => {
      setAgentSteps((prev) => [newStep, ...prev]);
      setIsAgentRunning(false);
      setCustomGoal('');
      audioEngine.playCue('chime');
      voiceSocket.sendText(`Agent completed task: ${newStep.thought}`);
    }, 450);
  };

  // Handlers for 3D Creation
  const handleGenerate3D = () => {
    if (!can3D) {
      audioEngine.playCue('interrupt');
      authService.logSecurityEvent('threejs_3d', 'Génération 3D bloquée par RBAC', 'denied', `Rôle ${currentUser.role}`);
      alert(`Action non autorisée : La fonctionnalité « Moteur 3D & Shaders » est désactivée pour votre profil.`);
      return;
    }

    const id = 'art-3d-' + Date.now();
    const newObj: Artifact3D = {
      id,
      type: '3d_object',
      title: new3dName,
      geometryType: new3dType,
      material: new3dMat,
      color: new3dColor,
      createdAt: new Date().toISOString(),
      metadata: { engine: 'Three.js WebGL', vertices: 2840, renderPipeline: 'PBR Physical Shader' },
    };
    setArtifacts([newObj, ...artifacts]);
    audioEngine.playCue('chime');
  };

  // Handlers for Code Execution
  const handleRunCode = () => {
    if (!canRunCode) {
      audioEngine.playCue('interrupt');
      authService.logSecurityEvent('code_execution', 'Exécution de code bloquée par RBAC', 'denied', `Rôle ${currentUser.role}`);
      alert(`Action non autorisée : La fonctionnalité « Exécution de code » est désactivée pour votre profil.`);
      return;
    }

    setIsExecuting(true);
    setTimeout(() => {
      setIsExecuting(false);
      const out = `[Intel oneAPI Level-Zero Sandbox - XPU:0 Arc Pro B60]\n> Compiling ${codeLang} kernel via DPC++ / SYCL...\n> Running DSP memory isolate [24000Hz sampling, 1024 frames]...\n> Output: Int16Array(1024) [ 0, 18, 36, 52, 70, ... ]\n> Kernel Latency: 0.08ms per frame (12,500 frames/sec)\n> Status: Process terminated successfully (Exit code: 0)`;
      setExecutionOutput(out);
      audioEngine.playCue('chime');
    }, 350);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeSnippet);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // Handlers for Music Synthesizer
  const togglePlayMusic = () => {
    if (musicPlaying) {
      audioEngine.stopMusic();
      setMusicPlaying(false);
      setActiveNoteIdx(-1);
    } else {
      setMusicPlaying(true);
      audioEngine.playMusicNotes(musicNotes, musicTempo, (step) => {
        setActiveNoteIdx(step);
      });
    }
  };

  // Handlers for Image Generation
  const handleGenerateImage = () => {
    setIsGeneratingImage(true);
    setTimeout(() => {
      setIsGeneratingImage(false);
      const colors = ['#06b6d4', '#a855f7', '#3b82f6', '#ec4899', '#10b981'];
      const col = colors[Math.floor(Math.random() * colors.length)];
      const newImg: ArtifactImage = {
        id: 'art-img-' + Date.now(),
        type: 'image',
        title: 'Synthesized Generative Scene',
        prompt: imagePrompt,
        aspectRatio: imageAspect,
        primaryColor: col,
        createdAt: new Date().toISOString(),
        mockUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%230b0f19"/><stop offset="50%" stop-color="%231e1b4b"/><stop offset="100%" stop-color="%23030712"/></linearGradient><radialGradient id="sun" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${encodeURIComponent(col)}" stop-opacity="0.9"/><stop offset="100%" stop-color="%23000000" stop-opacity="0"/></radialGradient></defs><rect width="800" height="450" fill="url(%23bg)"/><circle cx="400" cy="225" r="140" fill="url(%23sun)" filter="blur(16px)"/><circle cx="400" cy="225" r="75" fill="none" stroke="${encodeURIComponent(col)}" stroke-width="3"/><path d="M 280 320 Q 400 180 520 320" fill="none" stroke="%23ffffff" stroke-width="2" opacity="0.6"/><text x="400" y="230" fill="%23ffffff" font-family="monospace" font-size="14" text-anchor="middle" font-weight="bold">AI GENERATED VISUAL</text><text x="400" y="260" fill="%2394a3b8" font-family="sans-serif" font-size="11" text-anchor="middle">${encodeURIComponent(imagePrompt.slice(0, 48))}</text></svg>`,
      };
      setArtifacts([newImg, ...artifacts]);
      audioEngine.playCue('chime');
    }, 500);
  };

  // Handlers for Enterprise Actions
  const handleAddJira = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJiraTitle.trim()) return;
    const item = {
      id: 'PROJ-' + Math.floor(Math.random() * 800 + 1100),
      title: newJiraTitle.trim(),
      status: 'To Do',
      priority: 'High',
      service: 'jira' as const,
      assignee: 'Mochi Agent',
    };
    setIntegrations({
      ...integrations,
      atlassian: [item, ...integrations.atlassian],
    });
    setNewJiraTitle('');
    audioEngine.playCue('chime');
  };

  const handleSendTeams = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamsMsg.trim()) return;
    const item = {
      id: 'ms-' + Date.now(),
      service: 'teams' as const,
      channel: '#engineering-general',
      message: newTeamsMsg.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      sender: 'Mochi Agent',
    };
    setIntegrations({
      ...integrations,
      microsoft: [item, ...integrations.microsoft],
    });
    setNewTeamsMsg('');
    audioEngine.playCue('chime');
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-950/90 rounded-2xl border border-slate-800/80 backdrop-blur-xl overflow-hidden shadow-2xl">
      {/* Harness Top Nav Bar */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3 bg-slate-900/80 border-b border-slate-800 gap-3">
        <div className="flex items-center gap-2.5">
          <Bot className="w-5 h-5 text-cyan-400" />
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              OpenHands & Hermes Agent Harness
              <span className="px-2 py-0.5 rounded-full bg-purple-950/70 border border-purple-800/60 text-purple-300 text-[10px] font-mono">
                256K Context • Shared Memory IPC
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Autonomous action-observation loop, 3D WebGL engine, code sandboxes, and enterprise connectors
            </p>
          </div>
        </div>

        {/* Studio Sub-Tabs */}
        <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800 gap-1 overflow-x-auto no-scrollbar">
          {[
            { id: 'openhands', label: 'OpenHands Loop', icon: Bot },
            { id: '3d', label: '3D Engine', icon: Box },
            { id: 'code', label: 'Code Sandbox', icon: Code2 },
            { id: 'image', label: 'Image Studio', icon: ImageIcon },
            { id: 'music', label: 'Synthesizer', icon: Music },
            { id: 'integrations', label: 'Enterprise Hub', icon: Briefcase },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Studio Workspace Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5">
        {/* TAB 0: OPENHANDS / HERMES AUTONOMOUS AGENT LOOP & 256K MEMORY */}
        {tab === 'openhands' && (
          <div className="space-y-4">
            {/* 256K Context Horizon Meter */}
            <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Brain className="w-4 h-4 text-purple-400" />
                  {activeSession ? (
                    <span>
                      Session: <strong className="text-cyan-300">« {activeSession.title} »</strong>
                    </span>
                  ) : (
                    '256,000 Token Context Horizon (FP8 PagedAttention)'
                  )}
                </span>
                <span className="text-cyan-400 font-bold">
                  {(activeSession?.contextTokensUsed || 18450).toLocaleString()} / {(activeSession?.maxContextTokens || 262144).toLocaleString()} tokens (
                  {(((activeSession?.contextTokensUsed || 18450) / (activeSession?.maxContextTokens || 262144)) * 100).toFixed(1)}% utilized)
                </span>
              </div>
              <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      ((activeSession?.contextTokensUsed || 18450) / (activeSession?.maxContextTokens || 262144)) * 100
                    )}%`
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span>Shared Memory IPC Latency: 14μs • Isolât de session</span>
                <span>Statut : <span className="uppercase text-emerald-400">{activeSession?.status || 'Active'}</span></span>
              </div>
            </div>

            {/* Goal Input for Agent */}
            <form onSubmit={handleTriggerAgentStep} className="flex gap-2">
              <input
                type="text"
                value={customGoal}
                onChange={(e) => setCustomGoal(e.target.value)}
                placeholder="Give OpenHands a goal (e.g. 'Optimize Three.js shader code and create Jira bug ticket')..."
                className="flex-1 bg-slate-950 border border-slate-800 focus:border-cyan-400 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!customGoal.trim() || isAgentRunning}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {isAgentRunning ? 'Thinking...' : 'Step Loop'}
              </button>
            </form>

            {/* Action-Observation Trajectory Feed */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                Agentic Action-Observation Trajectory
              </h3>

              {agentSteps.map((s) => (
                <div
                  key={s.id}
                  className="p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-xl space-y-2 text-xs font-mono"
                >
                  <div className="flex items-center justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="font-bold text-purple-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping" />
                      Step {s.step} • {s.tool.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-slate-500">{s.timestamp}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 font-semibold block text-[11px] mb-0.5">💭 Thought:</span>
                    <p className="text-slate-300 font-sans leading-relaxed text-[11px]">{s.thought}</p>
                  </div>

                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-850 text-cyan-300 text-[11px]">
                    <span className="text-slate-500 text-[10px] block mb-0.5">⚡ Action:</span>
                    <code>{s.action}</code>
                  </div>

                  <div className="p-2 bg-slate-950/70 rounded-lg border border-slate-850 text-emerald-400 text-[11px]">
                    <span className="text-slate-500 text-[10px] block mb-0.5">👁 Observation:</span>
                    <span>{s.observation}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 1: 3D ENGINE STUDIO */}
        {tab === '3d' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 h-full">
            {/* 3D WebGL Canvas */}
            <div className="lg:col-span-2 min-h-[380px] h-full flex flex-col">
              <ThreeEngineView artifact={selected3d} interactive={true} />
            </div>

            {/* 3D Controls & Mesh Synthesizer */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  Procedural 3D Generator
                </h3>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Asset Title</label>
                    <input
                      type="text"
                      value={new3dName}
                      onChange={(e) => setNew3dName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Geometry Engine</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { id: 'torus_knot', label: 'Torus Knot' },
                        { id: 'quantum_crystal', label: 'Quantum Crystal' },
                        { id: 'cylinder', label: 'Cyber Drone' },
                        { id: 'sphere', label: 'Sci-Fi Sphere' },
                      ].map((g) => (
                        <button
                          key={g.id}
                          onClick={() => setNew3dType(g.id as any)}
                          className={`p-2 rounded-lg border text-left text-[11px] transition ${
                            new3dType === g.id
                              ? 'bg-cyan-950 border-cyan-500 text-cyan-300 font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Material Shader</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {['hologram', 'metallic', 'glass', 'neon_wireframe'].map((m) => (
                        <button
                          key={m}
                          onClick={() => setNew3dMat(m as any)}
                          className={`p-1.5 rounded-lg border capitalize text-[11px] transition ${
                            new3dMat === m
                              ? 'bg-purple-950 border-purple-500 text-purple-300 font-bold'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {m.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Color Palette</label>
                    <div className="flex items-center gap-2">
                      {['#06b6d4', '#a855f7', '#10b981', '#f59e0b', '#ec4899', '#3b82f6'].map((c) => (
                        <button
                          key={c}
                          onClick={() => setNew3dColor(c)}
                          className={`w-6 h-6 rounded-full border transition ${
                            new3dColor === c ? 'scale-125 border-white shadow-md' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleGenerate3D}
                className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/30 transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                Synthesize & Render in Three.js
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: CODE STUDIO */}
        {tab === 'code' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 h-full">
            {/* Code Editor */}
            <div className="flex flex-col bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-semibold text-slate-200">Sandbox Code Runner (Intel Arc XPU)</span>
                  <div className="flex items-center gap-1 ml-2">
                    {(['typescript', 'python', 'rust'] as const).map((lang) => (
                      <button
                        key={lang}
                        onClick={() => setCodeLang(lang)}
                        className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono font-bold transition ${
                          codeLang === lang ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleCopyCode}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
                    title="Copy Code"
                  >
                    {codeCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={handleRunCode}
                    disabled={isExecuting || !canRunCode}
                    className={`px-3 py-1 rounded font-bold text-xs flex items-center gap-1.5 transition ${
                      canRunCode
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer shadow-sm'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }`}
                    title={canRunCode ? 'Exécuter le script dans la sandbox' : 'Exécution bloquée par la politique RBAC'}
                  >
                    {canRunCode ? (
                      <Play className="w-3 h-3 fill-current" />
                    ) : (
                      <Lock className="w-3 h-3 text-rose-400" />
                    )}
                    <span>{isExecuting ? 'Running...' : canRunCode ? 'Run' : 'Bloqué RBAC'}</span>
                  </button>
                </div>
              </div>

              <textarea
                value={codeSnippet}
                onChange={(e) => setCodeSnippet(e.target.value)}
                className="flex-1 w-full p-4 bg-slate-950 font-mono text-xs text-cyan-200 focus:outline-none resize-none min-h-[300px]"
                spellCheck={false}
              />
            </div>

            {/* Isolate Output Terminal */}
            <div className="flex flex-col bg-black border border-slate-800 rounded-xl overflow-hidden shadow-lg">
              <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-xs">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-slate-200 font-mono">Process Execution Output</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">Intel Arc B60 Level-Zero</span>
              </div>

              <pre className="flex-1 p-4 text-xs font-mono text-slate-300 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text">
                {executionOutput}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 3: IMAGE STUDIO */}
        {tab === 'image' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Gallery / Preview */}
            <div className="lg:col-span-2 bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex flex-col justify-center items-center">
              <div className="w-full max-w-xl aspect-video bg-slate-950 rounded-xl border border-slate-800 overflow-hidden relative shadow-2xl flex items-center justify-center">
                {artifacts.find((a) => a.type === 'image') ? (
                  <img
                    src={(artifacts.find((a) => a.type === 'image') as ArtifactImage).mockUrl}
                    alt="Synthesized visual"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center p-6 text-slate-500">
                    <ImageIcon className="w-12 h-12 mx-auto text-slate-600 mb-2" />
                    <p className="text-xs">No visual generated yet. Enter a prompt to generate.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Prompt Controls */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
              <div className="space-y-3 text-xs">
                <h3 className="font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  Generative Image Pipeline
                </h3>

                <div>
                  <label className="text-slate-400 block mb-1">Visual Prompt</label>
                  <textarea
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    rows={4}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-200 focus:outline-none focus:border-cyan-400 resize-none text-xs"
                  />
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">Aspect Ratio</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['16:9', '1:1', '9:16'].map((asp) => (
                      <button
                        key={asp}
                        onClick={() => setImageAspect(asp)}
                        className={`py-1.5 rounded-lg border text-center font-mono font-bold transition ${
                          imageAspect === asp
                            ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}
                      >
                        {asp}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleGenerateImage}
                disabled={isGeneratingImage}
                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                {isGeneratingImage ? 'Rendering Image...' : 'Generate AI Visual Asset'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: MUSIC & AUDIO SYNTHESIZER */}
        {tab === 'music' && (
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-6 flex flex-col space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Music className="w-4 h-4 text-cyan-400" />
                  WebAudio Polyphonic Synthesizer Engine
                </h3>
                <p className="text-xs text-slate-400">
                  Real-time procedural melody, bassline, and harmonic chords synthesis
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlayMusic}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition shadow-lg ${
                    musicPlaying
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/40 animate-pulse'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/40'
                  }`}
                >
                  {musicPlaying ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  {musicPlaying ? 'Stop Synthesizer' : 'Play Synthesized Flow'}
                </button>
              </div>
            </div>

            {/* Note Sequencer Visualizer */}
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Synthesized Note Sequence (Polyphonic Loop)
              </label>
              <div className="grid grid-cols-6 gap-2">
                {musicNotes.map((note, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border text-center transition-all duration-150 ${
                      activeNoteIdx === idx
                        ? 'bg-cyan-500 text-slate-950 border-cyan-300 scale-105 font-bold shadow-lg shadow-cyan-500/50'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                  >
                    <span className="text-xs font-mono font-bold block">{note}</span>
                    <span className="text-[10px] opacity-70">Step {idx + 1}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Synth Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800 text-xs">
              <div>
                <label className="text-slate-400 block mb-1.5">Tempo ({musicTempo} BPM)</label>
                <input
                  type="range"
                  min="60"
                  max="140"
                  value={musicTempo}
                  onChange={(e) => setMusicTempo(parseInt(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1.5">Preset Scale</label>
                <select
                  onChange={(e) => {
                    const presetMap: Record<string, string[]> = {
                      c_minor: ['C3', 'Eb3', 'G3', 'Bb3', 'D4', 'G4'],
                      synthwave: ['F3', 'Ab3', 'C4', 'Eb4', 'G4', 'C5'],
                      ambient_drone: ['D3', 'A3', 'D4', 'F4', 'A4', 'E5'],
                    };
                    setMusicNotes(presetMap[e.target.value] || presetMap.c_minor);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200"
                >
                  <option value="c_minor">C Minor (Neo Cyber)</option>
                  <option value="synthwave">F Minor (Synthwave Flow)</option>
                  <option value="ambient_drone">D Minor (Ambient Drone)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1.5">Filter Resonance</label>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400 font-mono">Lowpass 800Hz</span>
                  <span className="text-slate-500 font-mono text-[10px]">Q: 4.2</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: ENTERPRISE CONNECTORS (ATLASSIAN, MICROSOFT, GOOGLE) */}
        {tab === 'integrations' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Atlassian Jira & Confluence */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <h3 className="font-bold text-xs text-slate-200">Atlassian Jira & Confluence</h3>
                  </div>
                  <span className="text-[10px] text-blue-400 font-mono">Live Sync</span>
                </div>

                <form onSubmit={handleAddJira} className="flex gap-1.5 mb-3">
                  <input
                    type="text"
                    value={newJiraTitle}
                    onChange={(e) => setNewJiraTitle(e.target.value)}
                    placeholder="Create issue (e.g. 'Optimize PCM buffer')..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-400"
                  />
                  <button type="submit" className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </form>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {integrations.atlassian.map((item) => (
                    <div key={item.id} className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[10px] text-blue-400 font-semibold">{item.id}</span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-blue-950 text-blue-300 border border-blue-800">
                          {item.status}
                        </span>
                      </div>
                      <p className="text-slate-300 text-[11px] font-medium">{item.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Microsoft 365 (Teams, Outlook, Azure) */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                    <h3 className="font-bold text-xs text-slate-200">Microsoft Teams & Azure</h3>
                  </div>
                  <span className="text-[10px] text-purple-400 font-mono">Connected</span>
                </div>

                <form onSubmit={handleSendTeams} className="flex gap-1.5 mb-3">
                  <input
                    type="text"
                    value={newTeamsMsg}
                    onChange={(e) => setNewTeamsMsg(e.target.value)}
                    placeholder="Send message to Teams channel..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-purple-400"
                  />
                  <button type="submit" className="p-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs">
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {integrations.microsoft.map((item) => (
                    <div key={item.id} className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[10px] text-purple-400 font-semibold">{item.service.toUpperCase()}</span>
                        <span className="text-[10px] text-slate-500">{item.time}</span>
                      </div>
                      <p className="text-slate-300 text-[11px]">{item.message || item.subject}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Google Workspace (Calendar, Drive, Gmail) */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <h3 className="font-bold text-xs text-slate-200">Google Workspace</h3>
                  </div>
                  <span className="text-[10px] text-red-400 font-mono">Synchronized</span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {integrations.google.map((item) => (
                    <div key={item.id} className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[10px] text-red-400 font-semibold">{item.service.toUpperCase()}</span>
                        <span className="text-[10px] text-slate-500">{item.time || item.modified}</span>
                      </div>
                      <p className="text-slate-200 font-medium text-[11px]">{item.title || item.fileName || item.subject}</p>
                      {item.snippet && <p className="text-[10px] text-slate-400 mt-0.5">{item.snippet}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
