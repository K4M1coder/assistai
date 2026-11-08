import React, { useState, useEffect } from 'react';
import {
  Radio,
  Terminal,
  Smartphone,
  Cpu,
  Columns,
  Zap,
  Shield,
  User,
  ChevronDown,
  Check,
  Key,
} from 'lucide-react';
import { ClientType, VoiceState, UserProfile } from '../types';
import { voiceSocket } from '../services/voiceSocket';
import { PWAInstallButton } from './PWAInstallButton';
import { authService } from '../services/authService';

interface NavbarProps {
  currentView: ClientType | 'split';
  setCurrentView: (view: ClientType | 'split') => void;
  voiceState: VoiceState;
  isConnected: boolean;
  serverMode: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  setCurrentView,
  voiceState,
  isConnected,
  serverMode,
}) => {
  const [currentUser, setCurrentUser] = useState<UserProfile>(authService.getCurrentUser());
  const [allUsers, setAllUsers] = useState<UserProfile[]>(authService.getAllUsers());
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  useEffect(() => {
    const unsub = authService.subscribe(() => {
      setCurrentUser(authService.getCurrentUser());
      setAllUsers([...authService.getAllUsers()]);
    });
    return unsub;
  }, []);

  return (
    <header className="w-full bg-slate-950/90 border-b border-slate-800/80 px-4 py-2.5 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-[1700px] mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Architecture Badge */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Radio className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-extrabold text-slate-100 tracking-tight">
                MOCHI <span className="text-cyan-400 font-light">VOICE & AGENT</span>
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800/80 text-[10px] text-cyan-300 font-mono font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                Full-Duplex Interruption
              </span>
            </div>
            <p className="text-[10px] text-slate-400 flex items-center gap-1.5 font-mono">
              <span className="text-emerald-400">●</span> {isConnected ? serverMode : 'Connecting to Voice Gateway...'}
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <nav className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs">
          {[
            { id: 'split', label: 'Split Studio', icon: Columns },
            { id: 'web', label: 'Web Voice', icon: Radio },
            { id: 'terminal', label: 'Terminal (CLI)', icon: Terminal },
            { id: 'smartphone', label: 'Smartphone App', icon: Smartphone },
            { id: 'harness', label: 'Agent Harness', icon: Cpu },
            { id: 'rbac', label: 'Sécurité & RBAC', icon: Shield },
          ].map((item) => {
            const Icon = item.icon;
            const active = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id as any)}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  active
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Switcher Dropdown & Master Actions */}
        <div className="flex items-center gap-2">
          {/* Active User Switcher Pill */}
          <div className="relative">
            <button
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-900 border border-slate-800 hover:border-cyan-600/70 transition text-xs font-mono cursor-pointer"
            >
              <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-5 h-5 rounded-full object-cover border border-slate-700"
              />
              <span className="font-semibold text-slate-200 hidden sm:inline max-w-[110px] truncate">
                {currentUser.name.split(' ')[0]}
              </span>
              <span
                className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-semibold border ${
                  currentUser.role === 'admin'
                    ? 'bg-rose-950/70 text-rose-300 border-rose-800/70'
                    : currentUser.role === 'ai_engineer'
                    ? 'bg-cyan-950/70 text-cyan-300 border-cyan-800/70'
                    : currentUser.role === 'operator'
                    ? 'bg-amber-950/70 text-amber-300 border-amber-800/70'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                {currentUser.role === 'ai_engineer' ? 'AI ENG' : currentUser.role.toUpperCase()}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Dropdown Menu */}
            {showUserDropdown && (
              <div className="absolute right-0 mt-1.5 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 z-50 text-xs font-sans">
                <div className="px-2 py-1.5 border-b border-slate-800 text-[10px] uppercase font-mono text-slate-400 font-semibold">
                  Changer d'utilisateur (Test RBAC)
                </div>
                <div className="py-1 space-y-1">
                  {allUsers.map((u) => {
                    const isSelected = u.id === currentUser.id;
                    return (
                      <button
                        key={u.id}
                        onClick={() => {
                          authService.switchUser(u.id);
                          setShowUserDropdown(false);
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition cursor-pointer ${
                          isSelected
                            ? 'bg-cyan-950/60 border border-cyan-800/60 text-cyan-200'
                            : 'hover:bg-slate-800/60 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <img
                            src={u.avatar}
                            alt={u.name}
                            className="w-6 h-6 rounded-full object-cover border border-slate-700"
                          />
                          <div>
                            <div className="font-semibold text-xs leading-tight">{u.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{u.role.toUpperCase()}</div>
                          </div>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-1.5 border-t border-slate-800 flex items-center justify-between">
                  <button
                    onClick={() => {
                      setCurrentView('rbac');
                      setShowUserDropdown(false);
                    }}
                    className="w-full text-center py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 font-mono text-[11px] font-semibold transition"
                  >
                    Ouvrir Console Sécurité & RBAC
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* PWA Install Button */}
          <PWAInstallButton />

          {/* Master Interrupt Button */}
          <button
            onClick={() => voiceSocket.sendInterrupt()}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer ${
              voiceState === 'speaking'
                ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse shadow-lg shadow-rose-600/40 ring-2 ring-rose-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
            }`}
            title="Master Interruption: cut assistant speech turn immediately"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span className="hidden sm:inline">Cut (Interrupt)</span>
          </button>
        </div>
      </div>
    </header>
  );
};
