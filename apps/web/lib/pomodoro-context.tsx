'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';

export type PomodoroPhase = 'work' | 'short_break' | 'long_break';

export interface PomodoroSettings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  sessionsBeforeLong: number;
  autoStart: boolean;
  soundEnabled: boolean;
}

const DEFAULT_SETTINGS: PomodoroSettings = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsBeforeLong: 4,
  autoStart: false,
  soundEnabled: true,
};

export const PHASE_COLORS: Record<PomodoroPhase, string> = {
  work: '#e94560',
  short_break: '#22c55e',
  long_break: '#06b6d4',
};

export const PHASE_LABELS: Record<PomodoroPhase, string> = {
  work: '집중',
  short_break: '짧은 휴식',
  long_break: '긴 휴식',
};

interface PomodoroContextValue {
  phase: PomodoroPhase;
  secondsLeft: number;
  isRunning: boolean;
  sessions: number;
  settings: PomodoroSettings;
  toggle: () => void;
  reset: () => void;
  skip: () => void;
  switchPhase: (p: PomodoroPhase) => void;
  updateSettings: (s: Partial<PomodoroSettings>) => void;
}

const PomodoroContext = createContext<PomodoroContextValue | null>(null);

export function usePomodoroContext() {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error('usePomodoroContext must be used within PomodoroProvider');
  return ctx;
}

const SETTINGS_KEY = 'noah_pomodoro_settings';
export const STATE_KEY = 'noah_pomodoro_state';

function loadSettings(): PomodoroSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

export function PomodoroProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PomodoroSettings>(DEFAULT_SETTINGS);
  const [phase, setPhase] = useState<PomodoroPhase>('work');
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_SETTINGS.workMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessions, setSessions] = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const phaseRef = useRef(phase);
  const sessionsRef = useRef(sessions);
  const settingsRef = useRef(settings);

  phaseRef.current = phase;
  sessionsRef.current = sessions;
  settingsRef.current = settings;

  // 설정 로드
  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setSecondsLeft(s.workMinutes * 60);
  }, []);

  const playBeep = useCallback((forPhase: PomodoroPhase) => {
    if (!settingsRef.current.soundEnabled) return;
    try {
      const ctx = audioCtxRef.current ?? new AudioContext();
      audioCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = forPhase === 'work' ? 880 : 523;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.8);
    } catch { /* ignore */ }
  }, []);

  const getPhaseSeconds = useCallback((p: PomodoroPhase, s: PomodoroSettings) => {
    if (p === 'work') return s.workMinutes * 60;
    if (p === 'short_break') return s.shortBreakMinutes * 60;
    return s.longBreakMinutes * 60;
  }, []);

  // 위젯 창과 상태 공유 (localStorage)
  useEffect(() => {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        phase, secondsLeft, isRunning, sessions,
        workMinutes: settings.workMinutes,
      }));
    } catch { /* ignore */ }
  }, [phase, secondsLeft, isRunning, sessions, settings.workMinutes]);

  // 타이머 인터벌
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            clearInterval(intervalRef.current!);
            const currentPhase = phaseRef.current;
            const currentSessions = sessionsRef.current;
            const currentSettings = settingsRef.current;
            playBeep(currentPhase);
            let nextPhase: PomodoroPhase;
            let nextSessions = currentSessions;
            if (currentPhase === 'work') {
              nextSessions = currentSessions + 1;
              setSessions(nextSessions);
              nextPhase = nextSessions % currentSettings.sessionsBeforeLong === 0
                ? 'long_break' : 'short_break';
            } else {
              nextPhase = 'work';
            }
            setPhase(nextPhase);
            const nextSecs = getPhaseSeconds(nextPhase, currentSettings);
            if (currentSettings.autoStart) setIsRunning(true);
            return nextSecs;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning, playBeep, getPhaseSeconds]);

  const toggle = useCallback(() => setIsRunning((v) => !v), []);

  const reset = useCallback(() => {
    setIsRunning(false);
    setSecondsLeft(getPhaseSeconds(phaseRef.current, settingsRef.current));
  }, [getPhaseSeconds]);

  const skip = useCallback(() => {
    setIsRunning(false);
    const cur = phaseRef.current;
    const curSessions = sessionsRef.current;
    const curSettings = settingsRef.current;
    let next: PomodoroPhase;
    if (cur === 'work') {
      const ns = curSessions + 1;
      setSessions(ns);
      next = ns % curSettings.sessionsBeforeLong === 0 ? 'long_break' : 'short_break';
    } else {
      next = 'work';
    }
    setPhase(next);
    setSecondsLeft(getPhaseSeconds(next, curSettings));
  }, [getPhaseSeconds]);

  const switchPhase = useCallback((p: PomodoroPhase) => {
    setIsRunning(false);
    setPhase(p);
    setSecondsLeft(getPhaseSeconds(p, settingsRef.current));
  }, [getPhaseSeconds]);

  const updateSettings = useCallback((updates: Partial<PomodoroSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      setIsRunning(false);
      setSecondsLeft(getPhaseSeconds(phaseRef.current, next));
      return next;
    });
  }, [getPhaseSeconds]);

  return (
    <PomodoroContext.Provider value={{
      phase, secondsLeft, isRunning, sessions, settings,
      toggle, reset, skip, switchPhase, updateSettings,
    }}>
      {children}
    </PomodoroContext.Provider>
  );
}
