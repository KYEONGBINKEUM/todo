'use client';

import { useEffect, useState } from 'react';
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
  const [dragging, setDragging] = useState(false);

  // localStorage 폴링으로 메인 창 타이머 상태 동기화
  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(STATE_KEY);
        if (raw) setState(JSON.parse(raw));
      } catch { /* ignore */ }
    };
    read();
    const id = setInterval(read, 500);
    // storage 이벤트 (다른 탭에서 업데이트 시)
    const onStorage = (e: StorageEvent) => {
      if (e.key === STATE_KEY && e.newValue) {
        try { setState(JSON.parse(e.newValue)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => { clearInterval(id); window.removeEventListener('storage', onStorage); };
  }, []);

  // 드래그로 창 이동 (Tauri)
  const startDrag = async () => {
    try {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const win = getCurrentWebviewWindow();
      await win.startDragging();
    } catch { /* ignore */ }
  };

  if (!state) return (
    <div className="w-full h-screen bg-black/80 flex items-center justify-center rounded-xl">
      <span className="text-white text-sm">🍅</span>
    </div>
  );

  const { phase, secondsLeft, isRunning, sessions } = state;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const color = COLORS[phase];

  const closeWidget = async () => {
    try {
      const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      await getCurrentWebviewWindow().hide();
    } catch { /* ignore */ }
  };

  return (
    <div
      className="w-full h-screen select-none overflow-hidden rounded-xl"
      style={{ background: `${color}ee` }}
      onMouseDown={startDrag}
    >
      <div className="flex items-center h-full px-4 gap-3">
        <span className="text-2xl">🍅</span>
        <div className="flex-1">
          <div className="text-white font-mono font-bold text-2xl tracking-widest">{mm}:{ss}</div>
          <div className="text-white/70 text-xs">
            {phase === 'work' ? '집중' : phase === 'short_break' ? '짧은 휴식' : '긴 휴식'}
            {' · '}{sessions}회 완료
          </div>
        </div>
        {!isRunning && (
          <div className="text-white/60 text-xs">일시정지</div>
        )}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={closeWidget}
          className="text-white/60 hover:text-white text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
