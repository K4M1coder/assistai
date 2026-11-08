import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Monitor, CheckCircle2, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running in standalone desktop window, show status badge or hide
  if (isInstalled) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-emerald-300 text-xs font-medium">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        <span className="hidden sm:inline">Installed PWA</span>
      </div>
    );
  }

  // Chromium / Edge / Windows / Linux Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs shadow-md shadow-cyan-600/30 transition cursor-pointer active:scale-95"
        title="Install as native desktop app on Windows or Linux"
      >
        <Monitor className="w-3.5 h-3.5" />
        <span>Install Desktop App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>Install App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-5 shadow-2xl text-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-cyan-400" />
                  Install on iOS / Safari
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                1. Tap the <strong className="text-white">Share</strong> button at the bottom of Safari.<br />
                2. Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold transition"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback indicator when desktop browser is ready but has not dispatched prompt yet
  return (
    <button
      onClick={() => {
        alert("To install on Windows or Linux desktop:\nClick the Install icon (⊞ or ⬇) in your browser address bar.");
      }}
      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:border-slate-700 text-xs transition"
      title="Install to Desktop Taskbar"
    >
      <Monitor className="w-3.5 h-3.5 text-cyan-400" />
      <span className="text-[11px]">Desktop PWA</span>
    </button>
  );
};
