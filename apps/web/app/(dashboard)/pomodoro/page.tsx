'use client';

import { useState, useEffect } from 'react';
import { usePomodoroContext, PHASE_COLORS, PHASE_LABELS, type PomodoroPhase } from '@/lib/pomodoro-context';

const PRESET_PRESETS = [
  { label: '기본 (25/5/15)', work: 25, short: 5, long: 15 },
  { label: '짧은 집중 (15/3/10)', work: 15, short: 3, long: 10 },
  { label: '긴 집중 (50/10/30)', work: 50, short: 10, long: 30 },
  { label: '울트라 (90/20/30)', work: 90, short: 20, long: 30 },
];

export default function PomodoroPage() {
  const {
    phase, secondsLeft, isRunning, sessions, settings,
    toggle, reset, skip, switchPhase, updateSettings,
  } = usePomodoroContext();

  const [showSettings, setShowSettings] = useState(false);
  const [isTauri, setIsTauri] = useState(false);

  useEffect(() => {
    setIsTauri(typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window));
  }, []);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const color = PHASE_COLORS[phase];
  const total = phase === 'work' ? settings.workMinutes * 60
    : phase === 'short_break' ? settings.shortBreakMinutes * 60
    : settings.longBreakMinutes * 60;
  const pct = ((total - secondsLeft) / total) * 100;
  const r = 90;
  const circ = 2 * Math.PI * r;

  const openTauriWidget = async () => {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const existing = await WebviewWindow.getByLabel('pomodoro-widget');
      if (existing) {
        await existing.show();
        await existing.setFocus();
        return;
      }
      new WebviewWindow('pomodoro-widget', {
        url: '/pomodoro-widget',
        title: '🍅 포모도로',
        width: 280,
        height: 80,
        alwaysOnTop: true,
        decorations: false,
        resizable: false,
        skipTaskbar: true,
        x: 40,
        y: 40,
      });
    } catch { /* Tauri not available */ }
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-background px-4 py-8">
      <div className="w-full max-w-md">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-text-primary">🍅 포모도로</h1>
          <div className="flex gap-2">
            {isTauri && (
              <button
                onClick={openTauriWidget}
                className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-border/20 transition-colors"
                title="항상 위에 표시되는 작은 위젯 창으로 열기"
              >
                위젯으로 열기
              </button>
            )}
            <button
              onClick={() => setShowSettings((v) => !v)}
              className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-border/20 transition-colors"
            >
              ⚙️ 설정
            </button>
          </div>
        </div>

        {/* 설정 패널 */}
        {showSettings && (
          <div className="mb-6 bg-background-card border border-border rounded-2xl p-5 space-y-5">
            <h2 className="font-semibold text-text-primary">타이머 설정</h2>

            {/* 프리셋 */}
            <div>
              <p className="text-xs text-text-muted mb-2">빠른 설정</p>
              <div className="grid grid-cols-2 gap-2">
                {PRESET_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => updateSettings({ workMinutes: p.work, shortBreakMinutes: p.short, longBreakMinutes: p.long })}
                    className="py-2 px-3 text-xs rounded-xl border border-border hover:border-[#e94560] hover:text-[#e94560] transition-colors text-text-secondary"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 시간 조절 */}
            <div className="space-y-3">
              {[
                { label: '집중 시간', key: 'workMinutes' as const, value: settings.workMinutes, min: 1, max: 120 },
                { label: '짧은 휴식', key: 'shortBreakMinutes' as const, value: settings.shortBreakMinutes, min: 1, max: 60 },
                { label: '긴 휴식', key: 'longBreakMinutes' as const, value: settings.longBreakMinutes, min: 1, max: 60 },
                { label: '긴 휴식까지 세션', key: 'sessionsBeforeLong' as const, value: settings.sessionsBeforeLong, min: 1, max: 10 },
              ].map(({ label, key, value, min, max }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">{label}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateSettings({ [key]: Math.max(min, value - 1) })}
                      className="w-7 h-7 rounded-lg border border-border hover:bg-border/30 text-text-secondary text-sm"
                    >−</button>
                    <span className="text-sm font-mono w-8 text-center text-text-primary">{value}</span>
                    <button
                      onClick={() => updateSettings({ [key]: Math.min(max, value + 1) })}
                      className="w-7 h-7 rounded-lg border border-border hover:bg-border/30 text-text-secondary text-sm"
                    >+</button>
                    {key !== 'sessionsBeforeLong' && <span className="text-xs text-text-muted">분</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* 토글 옵션 */}
            <div className="space-y-2">
              {[
                { label: '페이즈 종료 시 자동 시작', key: 'autoStart' as const, value: settings.autoStart },
                { label: '완료 소리', key: 'soundEnabled' as const, value: settings.soundEnabled },
              ].map(({ label, key, value }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">{label}</span>
                  <button
                    onClick={() => updateSettings({ [key]: !value })}
                    className={`w-10 h-5 rounded-full transition-colors ${value ? 'bg-[#e94560]' : 'bg-border'}`}
                  >
                    <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${value ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 페이즈 탭 */}
        <div className="flex gap-1 mb-8 bg-background-card border border-border rounded-xl p-1">
          {(['work', 'short_break', 'long_break'] as PomodoroPhase[]).map((p) => (
            <button
              key={p}
              onClick={() => switchPhase(p)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                phase === p ? 'text-white shadow-sm' : 'text-text-muted hover:text-text-primary'
              }`}
              style={phase === p ? { backgroundColor: PHASE_COLORS[p] } : {}}
            >
              {PHASE_LABELS[p]}
            </button>
          ))}
        </div>

        {/* 원형 타이머 */}
        <div className="flex flex-col items-center gap-8 mb-8">
          <div className="relative w-56 h-56">
            <svg className="w-56 h-56 -rotate-90" viewBox="0 0 220 220">
              <circle cx="110" cy="110" r={r} fill="none" stroke="var(--color-border)" strokeWidth="10" />
              <circle
                cx="110" cy="110" r={r} fill="none"
                stroke={color} strokeWidth="10"
                strokeDasharray={circ}
                strokeDashoffset={circ - (pct / 100) * circ}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s linear' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-mono font-bold text-text-primary tracking-widest">{mm}:{ss}</span>
              <span className="text-sm text-text-muted mt-1">{PHASE_LABELS[phase]}</span>
            </div>
          </div>

          {/* 컨트롤 */}
          <div className="flex gap-3 items-center">
            <button
              onClick={reset}
              className="w-11 h-11 rounded-full border border-border text-text-muted hover:text-text-primary hover:bg-border/30 flex items-center justify-center transition-colors"
              title="초기화"
            >
              ↩
            </button>
            <button
              onClick={toggle}
              className="w-16 h-16 rounded-full text-white text-xl font-bold flex items-center justify-center shadow-lg transition-all hover:scale-105 active:scale-95"
              style={{ backgroundColor: color }}
            >
              {isRunning ? '⏸' : '▶'}
            </button>
            <button
              onClick={skip}
              className="w-11 h-11 rounded-full border border-border text-text-muted hover:text-text-primary hover:bg-border/30 flex items-center justify-center transition-colors"
              title="건너뛰기"
            >
              ⏭
            </button>
          </div>
        </div>

        {/* 세션 기록 */}
        <div className="bg-background-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-text-primary">오늘의 세션</span>
            <span className="text-xs text-text-muted">{sessions}회 완료</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {Array.from({ length: Math.max(settings.sessionsBeforeLong * 2, sessions + 1) }).map((_, i) => {
              const isLongBreak = (i + 1) % settings.sessionsBeforeLong === 0;
              return (
                <div
                  key={i}
                  className={`rounded-full transition-all ${isLongBreak ? 'w-3 h-3' : 'w-2.5 h-2.5'}`}
                  style={{
                    backgroundColor: i < sessions ? PHASE_COLORS.work : 'var(--color-border)',
                    opacity: i < sessions ? 1 : 0.4,
                  }}
                />
              );
            })}
          </div>
          {sessions >= settings.sessionsBeforeLong && (
            <p className="text-xs text-text-muted mt-2">
              🎉 {Math.floor(sessions / settings.sessionsBeforeLong)}번의 사이클 완료!
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
