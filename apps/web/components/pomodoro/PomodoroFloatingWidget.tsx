'use client';

import { usePathname, useRouter } from 'next/navigation';
import { usePomodoroContext, PHASE_COLORS, PHASE_LABELS } from '@/lib/pomodoro-context';

export default function PomodoroFloatingWidget() {
  const { phase, secondsLeft, isRunning, toggle } = usePomodoroContext();
  const pathname = usePathname();
  const router = useRouter();

  // 타이머가 실행 중이고 포모도로 페이지가 아닐 때만 표시
  if (!isRunning || pathname === '/pomodoro') return null;

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const color = PHASE_COLORS[phase];

  return (
    <div
      className="fixed bottom-24 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-xl cursor-pointer select-none transition-all hover:scale-105"
      style={{ backgroundColor: color }}
      onClick={() => router.push('/pomodoro')}
      title={`포모도로 — ${PHASE_LABELS[phase]}`}
    >
      <span className="text-base">🍅</span>
      <span className="text-white font-mono font-bold text-sm tracking-widest">{mm}:{ss}</span>
      <button
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        className="text-white/80 hover:text-white text-xs w-5 h-5 flex items-center justify-center rounded-full hover:bg-black/20"
        title="일시정지"
      >
        ⏸
      </button>
    </div>
  );
}
