import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
  Zap,
  Send,
  Sparkles,
  Layers,
  Code2,
  Music,
  CheckCircle2,
  Clock,
  ArrowRight
} from 'lucide-react';
import { VoiceState, TranscriptMessage, Artifact, IntegrationsState } from '../types';
import { voiceSocket } from '../services/voiceSocket';
import { audioEngine } from '../services/audioSynthesizer';

interface WebVoiceClientProps {
  voiceState: VoiceState;
  setVoiceState: (state: VoiceState) => void;
  userRms: number;
  agentRms: number;
  transcripts: TranscriptMessage[];
  streamingText: string;
  onToolSelect?: (tool: string) => void;
}

export const WebVoiceClient: React.FC<WebVoiceClientProps> = ({
  voiceState,
  setVoiceState,
  userRms,
  agentRms,
  transcripts,
  streamingText,
  onToolSelect
}) => {
  const [inputText, setInputText] = useState('');
  const [isMicOn, setIsMicOn] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [interruptionCount, setInterruptionCount] = useState(0);
  const [lastInterruptionReason, setLastInterruptionReason] = useState<string | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts, streamingText]);

  // Spacebar shortcut to interrupt if agent is speaking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        if (voiceState === 'speaking') {
          e.preventDefault();
          handleInterrupt();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [voiceState]);

  const toggleMic = async () => {
    if (isMicOn) {
      voiceSocket.stopMicrophone();
      setIsMicOn(false);
      if (voiceState === 'listening') setVoiceState('idle');
    } else {
      const ok = await voiceSocket.startMicrophone();
      setIsMicOn(true);
      setVoiceState('listening');
    }
  };

  const handleInterrupt = () => {
    voiceSocket.sendInterrupt();
    setVoiceState('interrupted');
    setInterruptionCount((prev) => prev + 1);
    setLastInterruptionReason('Interrupted in real time via user action');
    setTimeout(() => {
      setVoiceState('idle');
    }, 1200);
  };

  const handleSendText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    setVoiceState('thinking');
    voiceSocket.sendText(inputText.trim());
    setInputText('');
  };

  const handlePromptClick = (prompt: string) => {
    setVoiceState('thinking');
    voiceSocket.sendText(prompt);
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    audioEngine.setMuted(next);
  };

  // Determine orb visual parameters based on voice state and audio RMS
  const effectiveRms = voiceState === 'speaking' ? agentRms : voiceState === 'listening' ? userRms : 0.05;
  const scaleValue = 1 + Math.min(effectiveRms * 1.8, 0.45);

  let orbColorClass = 'from-cyan-500 via-blue-600 to-indigo-700 shadow-cyan-500/40';
  let orbStatusLabel = 'Ready to converse';

  if (voiceState === 'listening') {
    orbColorClass = 'from-emerald-400 via-teal-500 to-cyan-600 shadow-emerald-500/50';
    orbStatusLabel = 'Listening to your microphone...';
  } else if (voiceState === 'thinking') {
    orbColorClass = 'from-amber-400 via-orange-500 to-purple-600 shadow-amber-500/50 animate-spin';
    orbStatusLabel = 'Reasoning & dispatching tools...';
  } else if (voiceState === 'speaking') {
    orbColorClass = 'from-cyan-400 via-violet-500 to-pink-500 shadow-violet-500/60';
    orbStatusLabel = 'Speaking in real-time (Tap orb or Space to interrupt)';
  } else if (voiceState === 'interrupted') {
    orbColorClass = 'from-red-500 via-rose-600 to-amber-600 shadow-red-500/80 scale-95';
    orbStatusLabel = '⚡ Turn interrupted instantly!';
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-950/80 rounded-2xl border border-slate-800/80 backdrop-blur-xl overflow-hidden shadow-2xl">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900/60 border-b border-slate-800/70">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping absolute" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Mochi Web Voice Client
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                Full-Duplex 24kHz
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">Natural voice conversation with zero-latency interruption</p>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          {interruptionCount > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-950/70 border border-rose-800/70 text-rose-300 text-xs font-mono">
              <Zap className="w-3 h-3 text-rose-400 fill-rose-400" />
              <span>{interruptionCount} Cuts</span>
            </div>
          )}

          <button
            onClick={toggleMute}
            className={`p-2 rounded-lg border text-xs transition flex items-center gap-1.5 ${
              isMuted
                ? 'bg-rose-950/80 border-rose-800 text-rose-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title={isMuted ? 'Unmute Voice Output' : 'Mute Voice Output'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
          </button>
        </div>
      </div>

      {/* Main Interactive Stage: The Mochi Orb & Visualizer */}
      <div className="flex flex-col items-center justify-center pt-8 pb-6 px-6 bg-radial from-slate-900/90 via-slate-950 to-slate-950 relative overflow-hidden border-b border-slate-800/60">
        {/* Background glow effects */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* The Animated Mochi Voice Orb */}
        <div className="relative flex items-center justify-center my-4 group cursor-pointer" onClick={voiceState === 'speaking' ? handleInterrupt : toggleMic}>
          {/* Outer Pulsing Aura Ring */}
          <div
            className={`absolute rounded-full transition-all duration-300 pointer-events-none ${
              voiceState === 'speaking' || voiceState === 'listening' ? 'opacity-80' : 'opacity-30'
            }`}
            style={{
              width: `${160 * scaleValue}px`,
              height: `${160 * scaleValue}px`,
              background: `radial-gradient(circle, rgba(6,182,212,0.25) 0%, rgba(168,85,247,0.1) 70%, transparent 100%)`,
              filter: 'blur(12px)',
            }}
          />

          {/* Secondary rotating geometric ring */}
          <div
            className={`w-36 h-36 rounded-full border-2 border-dashed transition-all duration-700 ${
              voiceState === 'speaking'
                ? 'border-cyan-400/60 animate-spin'
                : voiceState === 'listening'
                ? 'border-emerald-400/60 animate-pulse'
                : 'border-slate-700/60'
            }`}
            style={{ animationDuration: '8s' }}
          />

          {/* Central Core Orb */}
          <div
            className={`absolute w-28 h-28 rounded-full bg-gradient-to-tr ${orbColorClass} shadow-2xl flex items-center justify-center transition-transform duration-150 transform hover:scale-105 active:scale-95`}
            style={{
              transform: `scale(${scaleValue})`,
            }}
          >
            {voiceState === 'speaking' ? (
              <Radio className="w-10 h-10 text-white animate-pulse" />
            ) : voiceState === 'listening' ? (
              <Mic className="w-10 h-10 text-white animate-bounce" />
            ) : voiceState === 'interrupted' ? (
              <Zap className="w-10 h-10 text-white animate-ping" />
            ) : (
              <Sparkles className="w-10 h-10 text-white/90" />
            )}
          </div>
        </div>

        {/* Dynamic Voice State Label */}
        <div className="text-center mt-2 z-10">
          <p className="text-xs font-semibold tracking-wide uppercase font-mono text-cyan-400 flex items-center justify-center gap-1.5">
            {orbStatusLabel}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Mochi speech architecture • Full-duplex conversational turn-taking
          </p>
        </div>

        {/* Real-time Frequency Spectrum Waveform */}
        <div className="flex items-center gap-1.5 h-10 mt-4 px-4 py-2 bg-slate-900/60 rounded-full border border-slate-800/80">
          {[0.2, 0.5, 0.9, 0.4, 0.8, 1.0, 0.6, 0.7, 0.3, 0.85, 0.6, 0.4, 0.9, 0.3, 0.1].map((bar, idx) => {
            const h = voiceState === 'speaking' || voiceState === 'listening'
              ? Math.max(6, Math.min(36, bar * 40 * (effectiveRms * 3 + 0.3)))
              : 5;
            return (
              <div
                key={idx}
                className={`w-1 rounded-full transition-all duration-75 ${
                  voiceState === 'speaking'
                    ? 'bg-gradient-to-t from-cyan-500 to-purple-400'
                    : voiceState === 'listening'
                    ? 'bg-emerald-400'
                    : 'bg-slate-700'
                }`}
                style={{ height: `${h}px` }}
              />
            );
          })}
        </div>

        {/* Real-time Interruption Trigger Button */}
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleInterrupt}
            disabled={voiceState !== 'speaking'}
            className={`px-4 py-2 rounded-xl font-medium text-xs flex items-center gap-2 transition shadow-lg ${
              voiceState === 'speaking'
                ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse cursor-pointer shadow-rose-600/40 ring-2 ring-rose-400'
                : 'bg-slate-800/60 text-slate-500 cursor-not-allowed border border-slate-800'
            }`}
            title="Interrupt current agent speech immediately"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            Interrupt Agent (Space)
          </button>

          <button
            onClick={toggleMic}
            className={`px-4 py-2 rounded-xl font-medium text-xs flex items-center gap-2 transition ${
              isMicOn
                ? 'bg-emerald-500 text-slate-950 font-bold shadow-emerald-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            {isMicOn ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            {isMicOn ? 'Microphone Active' : 'Enable Real Mic'}
          </button>
        </div>
      </div>

      {/* Transcript & Subtitle Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[180px]">
        {transcripts.length === 0 && !streamingText && (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-slate-500">
            <Radio className="w-8 h-8 text-slate-600 mb-2 animate-pulse" />
            <p className="text-xs font-medium text-slate-400">Ready for conversational speech or harness requests.</p>
            <p className="text-[11px] text-slate-600 mt-1 max-w-sm">
              Speak using your mic or click any of the prompt templates below to trigger 3D rendering, code execution, music, or enterprise actions.
            </p>
          </div>
        )}

        {transcripts.map((t) => (
          <div
            key={t.id}
            className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div className="flex items-center gap-1.5 mb-1 px-1">
              <span className={`text-[10px] font-mono uppercase ${t.role === 'user' ? 'text-cyan-400' : 'text-purple-400'}`}>
                {t.role === 'user' ? 'You' : 'Mochi Agent'}
              </span>
              <span className="text-[10px] text-slate-600">
                {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                t.role === 'user'
                  ? 'bg-cyan-600/90 text-white rounded-br-none shadow-md shadow-cyan-600/20'
                  : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'
              }`}
            >
              {t.text}

              {t.toolCall && (
                <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-cyan-300">
                  <span className="flex items-center gap-1 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Tool: {t.toolCall.tool}
                  </span>
                  {onToolSelect && (
                    <button
                      onClick={() => onToolSelect(t.toolCall!.tool)}
                      className="hover:underline text-[10px] text-cyan-400 flex items-center gap-0.5"
                    >
                      View in Harness <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Ongoing Live Streaming Speech Bubble */}
        {streamingText && (
          <div className="flex flex-col items-start animate-fade-in">
            <div className="flex items-center gap-1.5 mb-1 px-1">
              <span className="text-[10px] font-mono uppercase text-purple-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
                Mochi Agent (Streaming)
              </span>
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-bl-none px-4 py-2.5 text-xs bg-slate-900 border border-purple-800/60 text-slate-100 shadow-lg shadow-purple-900/20">
              {streamingText}
              <span className="inline-block w-1.5 h-3 ml-1 bg-cyan-400 animate-pulse" />
            </div>
          </div>
        )}

        <div ref={transcriptEndRef} />
      </div>

      {/* Suggested Voice Prompt Chips */}
      <div className="px-4 py-2 bg-slate-900/40 border-t border-slate-800/60">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] no-scrollbar">
          <span className="text-slate-500 font-medium text-[10px] uppercase shrink-0">Try:</span>
          {[
            'Cherche la session drone 3D',
            "Donne l'état du projet Audio DSP",
            'Bascule sur la session Jira',
            'Create a 3D hologram drone',
            'Write Python FFT filter script',
            'Synthesize ambient synth music',
            'Post update to Microsoft Teams',
          ].map((prompt, i) => (
            <button
              key={i}
              onClick={() => handlePromptClick(prompt)}
              className="px-2.5 py-1 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700/60 transition shrink-0 whitespace-nowrap cursor-pointer active:scale-95"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Text fallback input bar */}
      <form onSubmit={handleSendText} className="p-3 bg-slate-900/80 border-t border-slate-800 flex items-center gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type or speak a request (e.g. 'Create a 3D torus knot', 'Write code')..."
          className="flex-1 bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-xl px-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="p-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:hover:bg-cyan-600 text-white transition cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};
