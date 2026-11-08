import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Download, Copy, Check, Play, Square, Zap, Shield, HelpCircle } from 'lucide-react';
import { voiceSocket } from '../services/voiceSocket';
import { TranscriptMessage, VoiceState } from '../types';

interface TerminalVoiceClientProps {
  voiceState: VoiceState;
  userRms: number;
  agentRms: number;
  transcripts: TranscriptMessage[];
  streamingText: string;
}

export const TerminalVoiceClient: React.FC<TerminalVoiceClientProps> = ({
  voiceState,
  userRms,
  agentRms,
  transcripts,
  streamingText,
}) => {
  const [osMode, setOsMode] = useState<'linux' | 'windows'>('linux');
  const [commandInput, setCommandInput] = useState('');
  const [terminalLogs, setTerminalLogs] = useState<Array<{ type: string; text: string; time: string }>>([
    { type: 'sys', text: 'Mochi Real-Time Voice Gateway initialized on ws://127.0.0.1:3000/api/live-ws', time: '00:00:01' },
    { type: 'sys', text: 'Audio Codec: 16kHz Little-Endian PCM In -> 24kHz PCM Out', time: '00:00:01' },
    { type: 'sys', text: 'Full-duplex bidirectional stream ready. Type "help" for CLI commands.', time: '00:00:02' },
  ]);
  const [copied, setCopied] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Sync incoming speech or transcripts to terminal stdout
  useEffect(() => {
    if (transcripts.length > 0) {
      const last = transcripts[transcripts.length - 1];
      const timeStr = new Date(last.timestamp).toTimeString().split(' ')[0];
      setTerminalLogs((prev) => {
        // avoid exact duplicate log entry
        if (prev.length > 0 && prev[prev.length - 1].text.includes(last.text.slice(0, 20))) {
          return prev;
        }
        return [
          ...prev,
          {
            type: last.role,
            text: `[${last.role.toUpperCase()}] ${last.text}`,
            time: timeStr,
          },
        ];
      });
    }
  }, [transcripts]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLogs, streamingText]);

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = commandInput.trim();
    if (!cmd) return;

    const timeStr = new Date().toTimeString().split(' ')[0];
    const newLogs = [...terminalLogs, { type: 'cmd', text: `${osMode === 'linux' ? '$' : 'PS>'} ${cmd}`, time: timeStr }];

    const lower = cmd.toLowerCase();

    if (lower === 'clear' || lower === 'cls') {
      setTerminalLogs([]);
      setCommandInput('');
      return;
    }

    if (lower === 'help') {
      newLogs.push(
        { type: 'info', text: 'AVAILABLE CLI COMMANDS:', time: timeStr },
        { type: 'info', text: '  talk <message>     - Send a voice turn to the Mochi agent', time: timeStr },
        { type: 'info', text: '  interrupt / cut   - Cut in and cancel assistant speech immediately', time: timeStr },
        { type: 'info', text: '  tool 3d            - Generate procedural 3D model in Three.js', time: timeStr },
        { type: 'info', text: '  tool code          - Run Python or TypeScript DSP isolate', time: timeStr },
        { type: 'info', text: '  tool music         - Synthesize audio melody', time: timeStr },
        { type: 'info', text: '  tool jira          - Synchronize Atlassian Jira issue', time: timeStr },
        { type: 'info', text: '  tool teams         - Trigger Microsoft 365 / Teams message', time: timeStr },
        { type: 'info', text: '  tool google        - Schedule Google Workspace event', time: timeStr },
        { type: 'info', text: '  status             - Show audio duplex buffers & latency stats', time: timeStr },
        { type: 'info', text: '  clear / cls        - Clear the terminal console', time: timeStr }
      );
    } else if (lower.startsWith('talk ')) {
      const msg = cmd.slice(5);
      voiceSocket.sendText(msg);
      newLogs.push({ type: 'sys', text: `>> Dispatched speech packet: "${msg}"`, time: timeStr });
    } else if (lower === 'interrupt' || lower === 'cut') {
      voiceSocket.sendInterrupt();
      newLogs.push({ type: 'warn', text: '⚡ INTERRUPT SIGNAL TRANSMITTED (SIGINT / 0x03)', time: timeStr });
    } else if (lower.startsWith('tool ')) {
      const t = lower.split(' ')[1];
      voiceSocket.sendText(`Run ${t} tool`);
      newLogs.push({ type: 'sys', text: `>> Triggered agent harness tool [${t}]`, time: timeStr });
    } else if (lower === 'status') {
      newLogs.push({
        type: 'info',
        text: `STATUS: Connected | SampleRate: 24000Hz | In: 16000Hz | Duplex Latency: 18ms | State: ${voiceState.toUpperCase()}`,
        time: timeStr,
      });
    } else {
      voiceSocket.sendText(cmd);
      newLogs.push({ type: 'sys', text: `>> Sent input to agent: "${cmd}"`, time: timeStr });
    }

    setTerminalLogs(newLogs);
    setCommandInput('');
  };

  // Render ASCII VU meter
  const renderAsciiMeter = (rms: number, totalChars = 14) => {
    const active = Math.min(totalChars, Math.floor(rms * totalChars * 2.5));
    const bars = '#'.repeat(active) + '.'.repeat(totalChars - active);
    const db = rms > 0.01 ? Math.floor(20 * Math.log10(rms)) : -60;
    return `[${bars}] ${db.toString().padStart(3, ' ')}dB`;
  };

  const copyCurl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const cmd = osMode === 'linux'
      ? `curl -s "${window.location.protocol}//${window.location.host}/api/clients/cli/linux" | bash`
      : `irm "${window.location.protocol}//${window.location.host}/api/clients/cli/windows" | iex`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full w-full bg-black/95 rounded-2xl border border-slate-800 font-mono text-xs overflow-hidden shadow-2xl relative">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-slate-300">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
          </div>
          <span className="font-semibold text-slate-200 flex items-center gap-1.5">
            <TerminalIcon className="w-3.5 h-3.5 text-cyan-400" />
            {osMode === 'linux' ? 'bash - mochi@linux-workstation:~' : 'PowerShell 7.4 - Mochi Voice Client (Windows)'}
          </span>
        </div>

        {/* OS Selector & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800">
            <button
              onClick={() => setOsMode('linux')}
              className={`px-2 py-0.5 rounded text-[10px] transition ${
                osMode === 'linux' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Linux / macOS
            </button>
            <button
              onClick={() => setOsMode('windows')}
              className={`px-2 py-0.5 rounded text-[10px] transition ${
                osMode === 'windows' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Windows CLI
            </button>
          </div>

          <a
            href={osMode === 'linux' ? '/api/clients/cli/linux' : '/api/clients/cli/windows'}
            download={osMode === 'linux' ? 'mochi-linux.sh' : 'mochi-windows.ps1'}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 transition flex items-center gap-1"
            title="Download native standalone client script"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[10px]">Download</span>
          </a>

          <button
            onClick={copyCurl}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1"
            title="Copy 1-line launch command"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline text-[10px]">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Real-time ASCII Audio Meter HUD */}
      <div className="px-4 py-2 bg-slate-950 border-b border-slate-850 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-cyan-400 font-bold">MIC IN (16k):</span>
            <span className="text-emerald-400 font-mono">{renderAsciiMeter(userRms)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-purple-400 font-bold">AGENT OUT (24k):</span>
            <span className="text-violet-400 font-mono">{renderAsciiMeter(agentRms)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-500">STATE:</span>
          <span
            className={`px-1.5 py-0.5 rounded font-mono uppercase text-[10px] font-bold ${
              voiceState === 'speaking'
                ? 'bg-purple-950 text-purple-300 border border-purple-800'
                : voiceState === 'listening'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : voiceState === 'interrupted'
                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                : 'bg-slate-900 text-slate-400'
            }`}
          >
            {voiceState}
          </span>
          <button
            onClick={() => voiceSocket.sendInterrupt()}
            className="px-2 py-0.5 rounded bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80 transition flex items-center gap-1 text-[10px]"
          >
            <Zap className="w-2.5 h-2.5 fill-current" />
            Interrupt
          </button>
        </div>
      </div>

      {/* Terminal Output Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1.5 text-slate-200 select-text font-mono">
        <div className="text-slate-500 mb-2 leading-relaxed">
          {osMode === 'linux' ? (
            <>
              Linux 6.8.0-45-generic x86_64 GNU/Linux - Mochi Duplex Daemon<br />
              Type &apos;help&apos; to view voice commands, &apos;talk &lt;query&gt;&apos; to speak, or click Interrupt.
            </>
          ) : (
            <>
              Windows PowerShell v7.4.2 [Core Engine - NT Kernel]<br />
              Connected to Mochi Live Audio Gateway via WebSocket.
            </>
          )}
        </div>

        {terminalLogs.map((log, idx) => (
          <div key={idx} className="flex items-start gap-2 leading-relaxed">
            <span className="text-slate-600 select-none text-[10px] pt-0.5">{log.time}</span>
            {log.type === 'cmd' ? (
              <span className="text-yellow-400 font-bold">{log.text}</span>
            ) : log.type === 'user' ? (
              <span className="text-cyan-400">{log.text}</span>
            ) : log.type === 'agent' ? (
              <span className="text-purple-300">{log.text}</span>
            ) : log.type === 'warn' ? (
              <span className="text-rose-400 font-bold">{log.text}</span>
            ) : log.type === 'info' ? (
              <span className="text-sky-300">{log.text}</span>
            ) : (
              <span className="text-emerald-400">{log.text}</span>
            )}
          </div>
        ))}

        {streamingText && (
          <div className="flex items-start gap-2 leading-relaxed text-purple-300 animate-pulse">
            <span className="text-slate-600 select-none text-[10px] pt-0.5">STREAM</span>
            <span>
              [AGENT STREAMING] {streamingText}
              <span className="inline-block w-2 h-3 ml-1 bg-cyan-400 animate-bounce" />
            </span>
          </div>
        )}

        <div ref={terminalEndRef} />
      </div>

      {/* Terminal Command Input Prompt */}
      <form onSubmit={handleCommand} className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
        <span className="text-cyan-400 font-bold select-none pl-1">
          {osMode === 'linux' ? 'mochi@linux:~$ ' : 'PS C:\\Mochi> '}
        </span>
        <input
          type="text"
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          placeholder="talk Create 3D torus knot | interrupt | tool code | help"
          className="flex-1 bg-transparent text-slate-100 focus:outline-none font-mono text-xs placeholder-slate-600"
          autoFocus
        />
        <button
          type="submit"
          className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
        >
          Execute
        </button>
      </form>
    </div>
  );
};
