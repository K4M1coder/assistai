import React, { useState, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Radio,
  Zap,
  Volume2,
  VolumeX,
  Sparkles,
  Layers,
  Code2,
  Music,
  Share2,
  ChevronRight,
  Battery,
  Wifi,
  Signal,
  Smartphone,
  Play,
  Square
} from 'lucide-react';
import { voiceSocket } from '../services/voiceSocket';
import { audioEngine } from '../services/audioSynthesizer';
import { VoiceState, TranscriptMessage, Artifact } from '../types';

interface SmartphoneVoiceClientProps {
  voiceState: VoiceState;
  setVoiceState: (state: VoiceState) => void;
  userRms: number;
  agentRms: number;
  transcripts: TranscriptMessage[];
  streamingText: string;
  artifacts: Artifact[];
  onSelectArtifact?: (art: Artifact) => void;
}

export const SmartphoneVoiceClient: React.FC<SmartphoneVoiceClientProps> = ({
  voiceState,
  setVoiceState,
  userRms,
  agentRms,
  transcripts,
  streamingText,
  artifacts,
  onSelectArtifact,
}) => {
  const [phoneModel, setPhoneModel] = useState<'ios' | 'android'>('ios');
  const [isPushToTalk, setIsPushToTalk] = useState(false);
  const [isHoldingMic, setIsHoldingMic] = useState(false);
  const [currentTime, setCurrentTime] = useState('9:41');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleInterrupt = () => {
    voiceSocket.sendInterrupt();
    setVoiceState('interrupted');
    setTimeout(() => setVoiceState('idle'), 1000);
  };

  const handlePushToTalkStart = async () => {
    setIsHoldingMic(true);
    await voiceSocket.startMicrophone();
    setVoiceState('listening');
  };

  const handlePushToTalkEnd = () => {
    setIsHoldingMic(false);
    voiceSocket.stopMicrophone();
    if (voiceState === 'listening') setVoiceState('idle');
  };

  const handleQuickPrompt = (prompt: string) => {
    setVoiceState('thinking');
    voiceSocket.sendText(prompt);
  };

  const effectiveRms = voiceState === 'speaking' ? agentRms : voiceState === 'listening' ? userRms : 0.04;

  return (
    <div className="flex flex-col items-center justify-center h-full w-full py-2">
      {/* Phone Switcher Control */}
      <div className="flex items-center gap-2 mb-3 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-800 text-xs text-slate-300">
        <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
        <span className="text-[11px] font-medium">Device Preview:</span>
        <button
          onClick={() => setPhoneModel('ios')}
          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition ${
            phoneModel === 'ios' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          iOS Dynamic Island
        </button>
        <button
          onClick={() => setPhoneModel('android')}
          className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition ${
            phoneModel === 'android' ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          Android Material
        </button>
      </div>

      {/* Realistic Smartphone Chassis Frame */}
      <div
        className={`w-full max-w-[340px] sm:max-w-[360px] h-[640px] sm:h-[680px] bg-slate-950 rounded-[44px] p-3 shadow-[0_0_50px_rgba(0,0,0,0.8),0_0_20px_rgba(6,182,212,0.15)] border-[8px] ${
          phoneModel === 'ios' ? 'border-slate-800' : 'border-slate-700'
        } relative flex flex-col overflow-hidden`}
      >
        {/* Dynamic Island / Notch */}
        {phoneModel === 'ios' ? (
          <div className="w-28 h-6 bg-black rounded-full mx-auto mb-1 flex items-center justify-between px-3 z-30 transition-all duration-300 shadow-md">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-900" />
            {voiceState === 'speaking' ? (
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
                <span className="text-[9px] font-mono text-purple-300">Mochi Live</span>
              </div>
            ) : voiceState === 'listening' ? (
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[9px] font-mono text-emerald-300">Rec</span>
              </div>
            ) : (
              <div className="w-2 h-2 rounded-full bg-emerald-500/80" />
            )}
          </div>
        ) : (
          <div className="flex justify-center mb-1 z-30">
            <div className="w-3.5 h-3.5 rounded-full bg-black border border-slate-800" />
          </div>
        )}

        {/* Mobile Status Bar */}
        <div className="flex items-center justify-between px-4 py-1 text-[11px] font-medium text-slate-300 select-none z-20">
          <span>{currentTime}</span>
          <div className="flex items-center gap-1.5">
            <Signal className="w-3 h-3 text-slate-300" />
            <Wifi className="w-3 h-3 text-slate-300" />
            <Battery className="w-4 h-4 text-emerald-400" />
          </div>
        </div>

        {/* Screen Interior */}
        <div className="flex-1 flex flex-col justify-between overflow-hidden px-3 pt-2 pb-3">
          {/* Top App Bar */}
          <div className="flex items-center justify-between py-1.5 px-2 bg-slate-900/60 rounded-xl border border-slate-800/80 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center shadow-sm">
                <Radio className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-100">Mochi Mobile</h3>
                <p className="text-[9px] text-cyan-400 font-mono">Full-Duplex Speech Engine</p>
              </div>
            </div>
            <button
              onClick={handleInterrupt}
              disabled={voiceState !== 'speaking'}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition ${
                voiceState === 'speaking'
                  ? 'bg-rose-600 text-white animate-pulse'
                  : 'bg-slate-800/80 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Zap className="w-3 h-3 fill-current" />
              Cut
            </button>
          </div>

          {/* Chat Stream & Tool Cards */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs">
            {transcripts.length === 0 && !streamingText && (
              <div className="text-center py-8 text-slate-500">
                <Sparkles className="w-7 h-7 mx-auto text-cyan-400 mb-2 animate-bounce" />
                <p className="font-semibold text-slate-300 text-xs">Tap or Hold to Talk</p>
                <p className="text-[10px] text-slate-500 mt-1">Supports speech interruption & agent tools</p>
              </div>
            )}

            {transcripts.map((t) => (
              <div
                key={t.id}
                className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-3 py-2 text-[11px] leading-relaxed shadow-sm ${
                    t.role === 'user'
                      ? 'bg-cyan-600 text-white rounded-br-none'
                      : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none'
                  }`}
                >
                  {t.text}
                </div>
              </div>
            ))}

            {streamingText && (
              <div className="flex flex-col items-start animate-fade-in">
                <div className="max-w-[90%] rounded-2xl rounded-bl-none px-3 py-2 text-[11px] bg-purple-950/80 border border-purple-800 text-purple-100 shadow-md">
                  {streamingText}
                  <span className="inline-block w-1 h-3 ml-1 bg-cyan-400 animate-pulse" />
                </div>
              </div>
            )}

            {/* In-app Tool Artifact Cards for Mobile */}
            {artifacts.slice(0, 2).map((art) => (
              <div
                key={art.id}
                onClick={() => onSelectArtifact?.(art)}
                className="p-2.5 rounded-xl bg-slate-900/95 border border-cyan-800/50 hover:border-cyan-500 transition cursor-pointer flex items-center justify-between gap-2 shadow-md group"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <div className="w-7 h-7 rounded-lg bg-cyan-950 flex items-center justify-center text-cyan-400 shrink-0">
                    {art.type === '3d_object' ? (
                      <Layers className="w-3.5 h-3.5" />
                    ) : art.type === 'code' ? (
                      <Code2 className="w-3.5 h-3.5" />
                    ) : (
                      <Music className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-[11px] font-semibold text-slate-200 truncate group-hover:text-cyan-300">
                      {art.title}
                    </p>
                    <p className="text-[9px] text-slate-400 font-mono capitalize">
                      {art.type.replace('_', ' ')} • Tap to inspect
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 shrink-0" />
              </div>
            ))}
          </div>

          {/* Quick Voice Prompt Cards */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-2 no-scrollbar">
            {['Hologram drone 3D', 'Python FFT script', 'Synthwave melody', 'Jira sprint task'].map((chip, idx) => (
              <button
                key={idx}
                onClick={() => handleQuickPrompt(chip)}
                className="px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] text-slate-300 whitespace-nowrap shrink-0 active:scale-95"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Smartphone Microphone & PTT Area */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-col items-center">
            {/* Pulsing Visualizer Waves */}
            <div className="flex items-center gap-1 h-5 mb-2">
              {[0.3, 0.7, 1.0, 0.5, 0.8, 0.4, 0.9, 0.6].map((v, i) => (
                <div
                  key={i}
                  className="w-1 bg-cyan-400 rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(4, Math.min(20, v * 24 * (effectiveRms * 4 + 0.2)))}px`,
                  }}
                />
              ))}
            </div>

            {/* Big Tactile Push-to-Talk / Tap-to-Talk Button */}
            <div className="flex items-center justify-center gap-4 w-full">
              <button
                onMouseDown={handlePushToTalkStart}
                onMouseUp={handlePushToTalkEnd}
                onTouchStart={handlePushToTalkStart}
                onTouchEnd={handlePushToTalkEnd}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 shadow-xl ${
                  isHoldingMic || voiceState === 'listening'
                    ? 'bg-emerald-500 text-slate-950 scale-110 ring-4 ring-emerald-500/40 shadow-emerald-500/50'
                    : voiceState === 'speaking'
                    ? 'bg-gradient-to-tr from-cyan-500 to-purple-600 text-white animate-pulse'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
              >
                <Mic className="w-6 h-6" />
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5 font-medium">
              {voiceState === 'speaking'
                ? 'Speaking (tap Cut above to interrupt)'
                : isHoldingMic
                ? 'Release to send speech'
                : 'Hold or tap to converse'}
            </p>
          </div>
        </div>

        {/* Home Bar Indicator (iOS style) */}
        {phoneModel === 'ios' && (
          <div className="w-32 h-1 bg-slate-600/70 rounded-full mx-auto mt-1" />
        )}
      </div>
    </div>
  );
};
