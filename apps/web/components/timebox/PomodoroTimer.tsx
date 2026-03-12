'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

type Phase = 'work' | 'short_break' | 'long_break';

const PHASE_LABELS: Record<Phase, string> = {
  work: '집중',
  short_break: '짧은 휴식',
  long_break: '긴 휴식',
};
const PHASE_DURATIONS: Record<Phase, number> = {
  work: 25 * 60,
  short_break: 5 * 60,
  long_break: 15 * 60,
};
const PHASE_COLORS: Record<Phase, string> = {
  work: '#e94560',
  short_break: '#22c55e',
  long_break: '#06b6d4',
};

interface Props {
  onSessionComplete?: (phase: Phase, durationMinutes: number) => void;
}

export default function PomodoroTimer({ onSessionComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('work');
  const [secondsLeft, setSecondsLeft] = useState(PHASE_DURATIONS.work);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0); // completed work sessions today
  const [expanded, setExpanded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playBeep = useCallback(() => {
    try {
      const ctx = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = phase === 'work' ? 880 : 523;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.8);
    } catch { /* ignore */ }
  }, [phase]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            // 완료
            clearInterval(intervalRef.current!);
            playBeep();
            const completed = phase;
            if (completed === 'work') {
              const newSessions = sessions + 1;
              setSessions(newSessions);
              onSessionComplete?.('work', 25);
              const nextPhase: Phase = newSessions % 4 === 0 ? 'long_break' : 'short_break';
              setPhase(nextPhase);
              setSecondsLeft(PHASE_DURATIONS[nextPhase]);
            } else {
              onSessionComplete?.(completed, completed === 'short_break' ? 5 : 15);
              setPhase('work');
              setSecondsLeft(PHASE_DURATIONS.work);
            }
            setRunning(false);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, phase, sessions, playBeep, onSessionComplete]);

  const reset = () => {
    setRunning(false);
    setSecondsLeft(PHASE_DURATIONS[phase]);
  };

  const switchPhase = (p: Phase) => {
    setRunning(false);
    setPhase(p);
    setSecondsLeft(PHASE_DURATIONS[p]);
  };

  const total = PHASE_DURATIONS[phase];
  const pct = ((total - secondsLeft) / total) * 100;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const color = PHASE_COLORS[phase];
  const r = 36;
  const circ = 2 * Math.PI * r;

  return (
    <div className="bg-background-card border border-border rounded-xl overflow-hidden">
      {/* 헤더 (항상 보임) */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-border/20 transition-colors"
      >
        <span className="text-base">🍅</span>
        <span className="text-xs font-bold text-text-primary tracking-wide">포모도로</span>
        {/* 미니 상태 */}
        <div className="ml-auto flex items-center gap-2">
          {running && (
            <span className="text-xs font-mono text-[#e94560] font-bold">{mm}:{ss}</span>
          )}
          <span className="text-[10px] text-text-muted bg-border/50 px-1.5 py-0.5 rounded-full">{sessions}회</span>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* 페이즈 선택 */}
          <div className="flex gap-1">
            {(['work', 'short_break', 'long_break'] as Phase[]).map((p) => (
              <button
                key={p}
                onClick={() => switchPhase(p)}
                className={`flex-1 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                  phase === p
                    ? 'text-white'
                    : 'bg-border/30 text-text-muted hover:text-text-primary'
                }`}
                style={phase === p ? { backgroundColor: PHASE_COLORS[p] } : {}}
              >
                {PHASE_LABELS[p]}
              </button>
            ))}
          </div>

          {/* 원형 타이머 */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-border)" strokeWidth="6" />
                <circle
                  cx="50" cy="50" r={r} fill="none"
                  stroke={color} strokeWidth="6"
                  strokeDasharray={circ}
                  strokeDashoffset={circ - (pct / 100) * circ}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-mono font-bold text-text-primary">{mm}:{ss}</span>
                <span className="text-[9px] text-text-muted">{PHASE_LABELS[phase]}</span>
              </div>
            </div>

            {/* 컨트롤 */}
            <div className="flex gap-2">
              <button
                onClick={() => setRunning((v) => !v)}
                className="px-4 py-2 rounded-xl text-white text-xs font-bold transition-all"
                style={{ backgroundColor: color }}
              >
                {running ? '일시정지' : (secondsLeft === PHASE_DURATIONS[phase] ? '시작' : '재개')}
              </button>
              <button
                onClick={reset}
                className="px-3 py-2 rounded-xl border border-border text-text-muted hover:text-text-primary text-xs transition-colors"
              >
                초기화
              </button>
            </div>
          </div>

          {/* 세션 기록 */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-text-muted mr-1">오늘</span>
            {Array.from({ length: Math.max(4, sessions + 1) }).map((_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full ${i < sessions ? '' : 'bg-border/50'}`}
                style={i < sessions ? { backgroundColor: color } : {}}
              />
            ))}
            <span className="text-[10px] text-text-muted ml-1">{sessions}회 완료</span>
          </div>
        </div>
      )}
    </div>
  );
}
