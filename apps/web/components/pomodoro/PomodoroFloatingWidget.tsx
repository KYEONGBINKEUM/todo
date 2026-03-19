'use client';

import { usePathname, useRouter } from 'next/navigation';
import { usePomodoroContext, PHASE_COLORS, PHASE_LABELS } from '@/lib/pomodoro-context';

export default function PomodoroFloatingWidget() {
  const { phase, secondsLeft, isRunning, sessions, settings, toggle } = usePomodoroContext();
  const pathname = usePathname();
  const router = useRouter();

  // 타이머가 활성 상태 (실행 중이거나, 시작된 적 있거나, 세션 완료 후 다음 대기 중)일 때 표시
  const total = phase === 'work' ? settings.workMinutes * 60
    : phase === 'short_break' ? settings.shortBreakMinutes * 60
    : settings.longBreakMinutes * 60;
  const hasStarted = isRunning || secondsLeft < total || sessions > 0;
  if (!hasStarted || pathname === '/pomodoro') return null;

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const color = PHASE_COLORS[phase];

  return (
    <div
      className="fixed bottom-24 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-xl cursor-pointer select-none transition-all hover:scale-105"
      style={{ backgroundColor: color, opacity: isRunning ? 1 : 0.8 }}
      onClick={() => router.push('/pomodoro')}
      title={`포모도로 — ${PHASE_LABELS[phase]}`}
    >
      <span className="text-base">🍅</span>
      <span className="text-white font-mono font-bold text-sm tracking-widest">{mm}:{ss}</span>
      <button
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        className="text-white/80 hover:text-white text-xs w-5 h-5 flex items-center justify-center rounded-full hover:bg-black/20"
        title={isRunning ? '일시정지' : '재개'}
      >
        {isRunning ? '⏸' : '▶'}
      </button>
    </div>
  );
}
