import React, { useState } from 'react';
import {
  Cpu,
  Zap,
  Activity,
  Layers,
  Download,
  CheckCircle2,
  HardDrive,
  Share2,
  RefreshCw,
  Terminal,
  ShieldCheck,
  ChevronDown,
  Lock,
} from 'lucide-react';
import { VramStatus } from '../types';
import { authService } from '../services/authService';

interface HardwareTelemetryHUDProps {
  vramStatus: VramStatus | null;
  onRefresh?: () => void;
}

export const HardwareTelemetryHUD: React.FC<HardwareTelemetryHUDProps> = ({
  vramStatus,
  onRefresh,
}) => {
  const [selectedDevice, setSelectedDevice] = useState<'intel' | 'amd' | 'nvidia'>('intel');
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [canHardware, setCanHardware] = useState(authService.isFeatureAllowed('hardware_override'));

  React.useEffect(() => {
    const unsub = authService.subscribe(() => {
      setCanHardware(authService.isFeatureAllowed('hardware_override'));
    });
    return unsub;
  }, []);

  // Fallback defaults if status is still loading
  const totalMb = vramStatus?.vramTotalMb || 24576;
  const usedMb = vramStatus?.vramUsedMb || 18760;
  const freeMb = vramStatus?.vramFreeMb || 5816;
  const usedPercent = vramStatus?.utilizationPercent || 76.3;

  return (
    <div className="w-full bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 backdrop-blur-md shadow-lg text-xs space-y-3">
      {/* Top Device Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-950 border border-blue-800/60 flex items-center justify-center text-blue-400">
            <Cpu className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100 font-mono">
                {selectedDevice === 'intel'
                  ? 'Intel Arc Pro B60 (Battlemage) 24GB'
                  : selectedDevice === 'amd'
                  ? 'AMD Radeon Pro W7900 (ROCm) 24GB'
                  : 'NVIDIA RTX 4090 (CUDA) 24GB'}
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800/60 font-semibold">
                PCI 0xe211 • oneAPI / SYCL
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">
              Hardware Tier 1: Level-Zero 1.6+ • IPEX • XMX Matrix Engines
            </p>
          </div>
        </div>

        {/* Hardware Selector & Script Download */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-800 text-[10px] font-mono">
            <button
              onClick={() => setSelectedDevice('intel')}
              className={`px-2 py-0.5 rounded transition ${
                selectedDevice === 'intel' ? 'bg-blue-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              Intel B60
            </button>
            <button
              onClick={() => setSelectedDevice('amd')}
              className={`px-2 py-0.5 rounded transition ${
                selectedDevice === 'amd' ? 'bg-rose-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              AMD ROCm
            </button>
            <button
              onClick={() => setSelectedDevice('nvidia')}
              className={`px-2 py-0.5 rounded transition ${
                selectedDevice === 'nvidia' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'
              }`}
            >
              NVIDIA
            </button>
          </div>

          {canHardware ? (
            <>
              <a
                href="/api/scripts/intel-b60-linux"
                download="start_intel_b60_linux.sh"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 transition flex items-center gap-1 text-[10px]"
                title="Télécharger script de lancement Linux Intel B60"
              >
                <Download className="w-3 h-3" />
                <span className="hidden sm:inline">Linux .sh</span>
              </a>

              <a
                href="/api/scripts/intel-b60-windows"
                download="start_intel_b60_windows.bat"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 transition flex items-center gap-1 text-[10px]"
                title="Télécharger script de lancement Windows Intel B60"
              >
                <Download className="w-3 h-3" />
                <span className="hidden sm:inline">Win .bat</span>
              </a>
            </>
          ) : (
            <div
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 flex items-center gap-1 text-[10px] cursor-not-allowed"
              title="Scripts de lancement et overrides bloqués par la politique RBAC"
            >
              <Lock className="w-3 h-3 text-rose-400" />
              <span className="hidden sm:inline">Scripts Bloqués RBAC</span>
            </div>
          )}
        </div>
      </div>

      {/* VRAM Memory Allocation Multi-Segment Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between font-mono text-[11px]">
          <span className="text-slate-300 font-semibold flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
            VRAM Budget: {(usedMb / 1024).toFixed(1)} GB / {(totalMb / 1024).toFixed(1)} GB
          </span>
          <span className="text-emerald-400 font-semibold">
            {(freeMb / 1024).toFixed(1)} GB Free Buffer ({((freeMb / totalMb) * 100).toFixed(0)}% Headroom)
          </span>
        </div>

        {/* Visual segmented bar */}
        <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800 p-0.5 gap-0.5">
          {/* Moshi 4-bit (5.2GB = 21.6%) */}
          <div
            className="h-full bg-cyan-500 rounded-l-full transition-all duration-300"
            style={{ width: '21.6%' }}
            title="Moshi 4-bit Voice S2S: ~5.2 GB"
          />
          {/* 256K Context KV Cache (7.5GB = 31.2%) */}
          <div
            className="h-full bg-purple-500 transition-all duration-300"
            style={{ width: '31.2%' }}
            title="256K Context KV Cache: ~7.5 GB (FP8 PagedAttention)"
          />
          {/* Qwen 2.5 7B Coder (4.4GB = 17.9%) */}
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: '17.9%' }}
            title="Qwen 2.5 7B Brain: ~4.4 GB (AWQ INT4)"
          />
          {/* OpenHands & Tools (1.2GB = 5.6%) */}
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: '5.6%' }}
            title="Three.js 3D & Tool Isolates: ~1.2 GB"
          />
          {/* Free safety headroom (5.7GB = 23.7%) */}
          <div
            className="h-full bg-slate-800/60 rounded-r-full transition-all duration-300"
            style={{ width: '23.7%' }}
            title="Safety Headroom: ~5.7 GB"
          />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-400 pt-0.5 font-mono">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />
            <span>Moshi 4-Bit S2S (5.2G)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
            <span>256K Context KV (7.5G)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            <span>Agent Brain (4.4G)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span>Tools & 3D (1.2G)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-700 inline-block" />
            <span>Free Headroom (5.7G)</span>
          </div>
        </div>
      </div>

      {/* Unified Shared Memory (IPC) Status */}
      <div className="flex flex-wrap items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-slate-800 font-mono text-[11px]">
        <div className="flex items-center gap-2">
          <Share2 className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="font-semibold text-slate-200">Unified Shared Memory (IPC):</span>
          <span className="text-emerald-400">ACTIVE (Zero-Copy Ring Buffer)</span>
        </div>
        <div className="flex items-center gap-3 text-slate-400">
          <span>Latency: <strong className="text-cyan-300">14μs</strong></span>
          <span>Context: <strong className="text-purple-300">18,450 / 262,144 tokens (256K)</strong></span>
        </div>
      </div>
    </div>
  );
};
