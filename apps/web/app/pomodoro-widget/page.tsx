'use client';

import { useEffect, useRef, useState } from 'react';
import { STATE_KEY, type PomodoroPhase } from '@/lib/pomodoro-context';

const COLORS: Record<PomodoroPhase, string> = {
  work: '#e94560',
  short_break: '#22c55e',
  long_break: '#06b6d4',
};

interface WidgetState {
  phase: PomodoroPhase;
  secondsLeft: number;
  isRunning: boolean;
  sessions: number;
}

export default function PomodoroWidgetPage() {
  const [state, setState] = useState<WidgetState | null>(null);
  const winRef = useRef<any>(null);

  // Pre-import Tauri webview API on mount
  useEffect(() => {
    import('@tauri-apps/api/webviewWindow')
      .then(({ getCurrentWebviewWindow }) => {
        winRef.current = getCurrentWebviewWindow();
      })
      .catch(() => {});
  }, []);

  // localStorage polling to sync timer state from main window
  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(STATE_KEY);
        if (raw) setState(JSON.parse(raw));
      } catch { /* ignore */ }
    };
    read();
    const id = setInterval(read, 500);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STATE_KEY && e.newValue) {
        try { setState(JSON.parse(e.newValue)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => { clearInterval(id); window.removeEventListener('storage', onStorage); };
  }, []);

  // Synchronous drag handler (startDragging must be called in mousedown, not async)
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-no-drag]')) return;
    try {
      winRef.current?.startDragging();
    } catch { /* ignore */ }
  };

  const closeWidget = () => {
    try {
      winRef.current?.hide();
    } catch { /* ignore */ }
  };

  if (!state) return (
    <div className="w-full h-screen bg-black/80 flex items-center justify-center">
      <span className="text-white text-sm">🍅</span>
    </div>
  );

  const { phase, secondsLeft, isRunning, sessions } = state;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const color = COLORS[phase];

  return (
    <div
      className="w-full h-screen select-none overflow-hidden"
      style={{ background: color }}
      onMouseDown={handleMouseDown}
    >
      <div className="flex items-center h-full px-3 gap-2">
        <span className="text-xl pointer-events-none">🍅</span>
        <div className="flex-1 min-w-0 pointer-events-none">
          <div className="text-white font-mono font-bold text-xl tracking-widest leading-tight">{mm}:{ss}</div>
          <div className="text-white/70 text-[10px]">
            {phase === 'work' ? '집중' : phase === 'short_break' ? '짧은 휴식' : '긴 휴식'}
            {' · '}{sessions}회
          </div>
        </div>
        {!isRunning && <span className="text-white/60 text-[10px] pointer-events-none">일시정지</span>}
        <button
          data-no-drag
          onMouseDown={(e) => e.stopPropagation()}
          onClick={closeWidget}
          className="w-6 h-6 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/40 text-white text-sm transition-colors flex-shrink-0"
        >
          ×
        </button>
      </div>
    </div>
  );
}
