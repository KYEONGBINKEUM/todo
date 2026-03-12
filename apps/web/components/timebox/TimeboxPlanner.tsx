'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import {
  getTimebox, saveTimebox, updateTask, addNote as addNoteDB,
  getUserSettings,
  type TaskData,
} from '@/lib/firestore';

// ── Constants ────────────────────────────────────────────────────────────────
const INTERVAL_KEY = 'noah-timebox-interval';
const INTERVALS = [5, 10, 15, 30, 60] as const;

function generateSlots(interval: number): string[] {
  const result: string[] = [];
  for (let m = 0; m < 24 * 60; m += interval) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    result.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
  }
  return result;
}

function getInitialInterval(): number {
  if (typeof window === 'undefined') return 30;
  const v = Number(localStorage.getItem(INTERVAL_KEY));
  return INTERVALS.includes(v as any) ? v : 30;
}

async function trySystemNotification(title: string, body: string) {
  try {
    const mod = await import('@tauri-apps/plugin-notification');
    if (await mod.isPermissionGranted()) {
      await mod.sendNotification({ title, body });
      return;
    }
  } catch {}
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const mod = await import('@tauri-apps/plugin-notification');
    if (await mod.isPermissionGranted()) return true;
    const perm = await mod.requestPermission();
    return perm === 'granted';
  } catch {}
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const result = await Notification.requestPermission();
    return result === 'granted';
  }
  return false;
}

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  date: string;      // YYYY-MM-DD
  tasks: TaskData[]; // today's myDay tasks
}

interface Toast { id: number; title: string; body: string; }

// ── Component ────────────────────────────────────────────────────────────────
export default function TimeboxPlanner({ date, tasks }: Props) {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  // Settings
  const [interval, setIntervalMin] = useState<number>(getInitialInterval);
  const timeSlots = generateSlots(interval);

  // Timebox data
  const [slots, setSlots] = useState<Record<string, string>>({});
  const [slotAlarms, setSlotAlarms] = useState<Record<string, boolean>>({});
  const [brainDump, setBrainDump] = useState('');

  // UI state
  const [loading, setLoading] = useState(true);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [taskDone, setTaskDone] = useState<Record<string, boolean>>({});
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [globalAlarm, setGlobalAlarm] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dragSrcSlot, setDragSrcSlot] = useState<string | null>(null);
  const [alarmDefault, setAlarmDefault] = useState(true);

  // Refs
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const alarmTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);

  // Today detection
  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = date === todayStr;

  // Current slot
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const currentSlot = (() => {
    let last = timeSlots[0];
    for (const t of timeSlots) {
      const [h, m] = t.split(':').map(Number);
      if (h * 60 + m <= nowMin) last = t;
    }
    return last;
  })();

  // ── In-app toast ──────────────────────────────────────────────────────────
  const showToast = useCallback((title: string, body: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, body }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
  }, []);

  const dismissToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getTimebox(user.uid, date).then((data) => {
      setSlots(data.slots || {});
      setSlotAlarms(data.slotAlarms || {});
      setBrainDump(data.brainDump || '');
      setLoading(false);
    });
    getUserSettings(user.uid).then((s) => {
      setAlarmDefault(s.timeboxAlarmDefault ?? true);
    });
  }, [user, date]);

  // ── Auto-scroll to current time ───────────────────────────────────────────
  useEffect(() => {
    if (!isToday || loading || !gridRef.current) return;
    const idx = timeSlots.indexOf(currentSlot);
    if (idx < 0) return;
    const rowH = interval <= 10 ? 28 : interval <= 15 ? 32 : 40;
    gridRef.current.scrollTop = Math.max(0, idx * rowH - 120);
  }, [loading, isToday, currentSlot, interval]);

  // ── Schedule alarms ───────────────────────────────────────────────────────
  useEffect(() => {
    alarmTimers.current.forEach(clearTimeout);
    alarmTimers.current = [];
    if (!isToday) return;

    const now = new Date();
    Object.entries(slotAlarms).forEach(([time, enabled]) => {
      if (!enabled || !slots[time]) return;
      const [h, m] = time.split(':').map(Number);
      const fireAt = new Date(now);
      fireAt.setHours(h, m, 0, 0);
      const delay = fireAt.getTime() - now.getTime();
      if (delay <= 0 || delay > 86_400_000) return;
      const timer = setTimeout(() => {
        showToast(`⏰ ${t('timebox.alarm')}`, `${time} — ${slots[time]}`);
        trySystemNotification(t('timebox.notification'), `⏰ ${time} — ${slots[time]}`);
      }, delay);
      alarmTimers.current.push(timer);
    });

    return () => { alarmTimers.current.forEach(clearTimeout); };
  }, [slots, slotAlarms, isToday, showToast]);

  // ── Save helpers ──────────────────────────────────────────────────────────
  const debounceSave = useCallback((
    s: Record<string, string>,
    a: Record<string, boolean>,
    bd?: string,
  ) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!user) return;
      saveTimebox(user.uid, date, {
        slots: s,
        slotAlarms: a,
        ...(bd !== undefined ? { brainDump: bd } : {}),
      });
    }, 700);
  }, [user, date]);

  // ── AI 스마트 일정 적용 ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const schedule = (e as CustomEvent<Array<{ time: string; task: string }>>).detail;
      if (!Array.isArray(schedule)) return;
      const nextSlots = { ...slots };
      schedule.forEach(({ time, task }) => {
        if (/^\d{2}:\d{2}$/.test(time)) nextSlots[time] = task;
      });
      setSlots(nextSlots);
      debounceSave(nextSlots, slotAlarms);
    };
    window.addEventListener('noah-ai-apply-schedule', handler);
    return () => window.removeEventListener('noah-ai-apply-schedule', handler);
  }, [slots, slotAlarms, debounceSave]);

  const handleSlotChange = (time: string, text: string) => {
    const next = { ...slots };
    if (text) next[time] = text; else delete next[time];
    const nextAlarms = text
      ? { ...slotAlarms, [time]: slotAlarms[time] ?? alarmDefault }
      : { ...slotAlarms, [time]: false };
    setSlots(next);
    setSlotAlarms(nextAlarms);
    debounceSave(next, nextAlarms);
  };

  const toggleAlarm = async (e: React.MouseEvent, time: string) => {
    e.stopPropagation();
    if (!slots[time]) return;
    const turning = !slotAlarms[time];
    if (turning) await requestNotificationPermission();
    const next = { ...slotAlarms, [time]: turning };
    setSlotAlarms(next);
    debounceSave(slots, next);
  };

  const toggleGlobalAlarm = async () => {
    const next = !globalAlarm;
    setGlobalAlarm(next);
    if (next) await requestNotificationPermission();
    const nextAlarms: Record<string, boolean> = {};
    Object.keys(slots).forEach((time) => { nextAlarms[time] = next; });
    setSlotAlarms(nextAlarms);
    debounceSave(slots, nextAlarms);
  };

  const handleBrainDumpChange = (text: string) => {
    setBrainDump(text);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (user) saveTimebox(user.uid, date, { slots, slotAlarms, brainDump: text });
    }, 700);
  };

  const changeInterval = (val: number) => {
    setIntervalMin(val);
    localStorage.setItem(INTERVAL_KEY, String(val));
  };

  const toggleTask = async (task: TaskData) => {
    if (!user || !task.id) return;
    const isDone = taskDone[task.id] ?? task.status === 'completed';
    const next = !isDone;
    setTaskDone(prev => ({ ...prev, [task.id!]: next }));
    await updateTask(user.uid, task.id, {
      status: next ? 'completed' : 'todo',
      completedDate: next ? todayStr : null,
    });
  };

  // ── Drag: tasks → slots ───────────────────────────────────────────────────
  const handleTaskDragStart = (e: React.DragEvent, task: TaskData) => {
    e.dataTransfer.setData('text/plain', task.title);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // ── Drag: slot → slot ─────────────────────────────────────────────────────
  const handleSlotDragStart = (e: React.DragEvent, time: string) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/x-slot', time);
    e.dataTransfer.setData('text/plain', slots[time]);
    e.dataTransfer.effectAllowed = 'move';
    setDragSrcSlot(time);
  };

  const handleSlotDragOver = (e: React.DragEvent, time: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragSrcSlot ? 'move' : 'copy';
    setDragOverSlot(time);
  };

  const handleSlotDrop = (e: React.DragEvent, time: string) => {
    e.preventDefault();
    const srcSlotTime = e.dataTransfer.getData('application/x-slot');
    if (srcSlotTime && srcSlotTime !== time) {
      // Slot-to-slot move
      const content = slots[srcSlotTime];
      const nextSlots = { ...slots };
      delete nextSlots[srcSlotTime];
      nextSlots[time] = content;
      const nextAlarms = { ...slotAlarms };
      const srcAlarm = nextAlarms[srcSlotTime];
      delete nextAlarms[srcSlotTime];
      nextAlarms[time] = srcAlarm ?? false;
      setSlots(nextSlots);
      setSlotAlarms(nextAlarms);
      debounceSave(nextSlots, nextAlarms);
    } else {
      const text = e.dataTransfer.getData('text/plain');
      if (text) handleSlotChange(time, text);
    }
    setDragOverSlot(null);
    setDragSrcSlot(null);
  };

  // ── Brain Dump → Note ─────────────────────────────────────────────────────
  const createNoteFromBrainDump = async () => {
    if (!user || !brainDump.trim()) return;
    try {
      await addNoteDB(user.uid, {
        title: `${t('timebox.brainDumpTitle')} — ${date}`,
        icon: '🧠',
        blocks: [{ id: `block-${Date.now()}`, type: 'text', content: brainDump }],
        pinned: false,
        tags: [t('timebox.tag')],
        folderId: null,
        linkedTaskId: null,
        linkedTaskIds: [],
      });
      router.push('/notes');
    } catch (err) { console.error(err); }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const filledCount = Object.keys(slots).length;
  const alarmOnCount = Object.values(slotAlarms).filter(Boolean).length;
  const activeTasks = tasks.filter(t => !(taskDone[t.id!] ?? t.status === 'completed'));

  // ── Render ────────────────────────────────────────────────────────────────

  const TodoSection = (
    <div className="bg-background-card rounded-2xl border border-border flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <span className="text-xs font-bold text-text-primary tracking-wide">{t('timebox.todoList')}</span>
        {activeTasks.length > 0 && (
          <span className="ml-auto text-[10px] text-text-muted bg-border/60 px-1.5 py-0.5 rounded-full">{activeTasks.length}{t('timebox.items')}</span>
        )}
      </div>
      {activeTasks.length === 0 ? (
        <p className="px-4 py-6 text-xs text-text-muted text-center">{t('timebox.allDone')}</p>
      ) : (
        <div className="divide-y divide-border/30 overflow-y-auto" style={{ maxHeight: 260 }}>
          {activeTasks.map((task) => (
            <div
              key={task.id}
              draggable
              onDragStart={(e) => handleTaskDragStart(e, task)}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-border/10 transition-colors group cursor-grab active:cursor-grabbing"
            >
              <button
                onClick={() => toggleTask(task)}
                className="w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all border-text-muted/50 group-hover:border-[#e94560]/70 hover:border-[#e94560]"
              />
              <span className="text-xs flex-1 select-none text-text-primary leading-relaxed truncate">{task.title}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-text-muted/30 group-hover:text-text-muted/60 flex-shrink-0">
                <circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="7" r="1.5"/>
                <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                <circle cx="9" cy="17" r="1.5"/><circle cx="15" cy="17" r="1.5"/>
              </svg>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const BrainDumpSection = (
    <div className="bg-background-card rounded-2xl border border-border flex flex-col flex-1 overflow-hidden min-h-0">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-shrink-0">
        <span className="text-xs font-bold text-text-primary tracking-wide">{t('timebox.brainDump')}</span>
        <button
          onClick={createNoteFromBrainDump}
          disabled={!brainDump.trim()}
          className="ml-auto text-[10px] text-text-muted hover:text-[#e94560] flex items-center gap-1 transition-colors py-1 px-2 rounded-lg hover:bg-[#e94560]/10 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          {t('timebox.addToNote')}
        </button>
      </div>
      <textarea
        value={brainDump}
        onChange={(e) => handleBrainDumpChange(e.target.value)}
        placeholder={t('timebox.brainDumpPlaceholder')}
        className="flex-1 w-full px-4 py-3 bg-transparent text-xs text-text-primary placeholder:text-text-muted/40 resize-none outline-none leading-relaxed"
        style={{ minHeight: 100 }}
      />
    </div>
  );

  const TimePlanSection = (
    <div className="bg-background-card rounded-2xl border border-border flex flex-col overflow-hidden flex-1">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2 flex-shrink-0 flex-wrap gap-y-1.5">
        <span className="text-xs font-bold text-text-primary tracking-wide">{t('timebox.title')}</span>
        {filledCount > 0 && (
          <span className="text-[10px] text-text-muted bg-border/50 px-1.5 py-0.5 rounded-full">{filledCount}{t('timebox.items')}</span>
        )}

        {/* Global alarm toggle */}
        <button
          onClick={toggleGlobalAlarm}
          title={globalAlarm ? t('timebox.globalAlarmOff') : t('timebox.globalAlarmOn')}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${
            globalAlarm
              ? 'bg-[#e94560]/15 text-[#e94560] border border-[#e94560]/30'
              : 'border border-border text-text-muted hover:text-text-primary hover:bg-border/50'
          }`}
        >
          {globalAlarm ? '🔔' : '🔕'} {t('timebox.globalAlarm')}{alarmOnCount > 0 && ` (${alarmOnCount})`}
        </button>

        {/* Interval selector */}
        <div className="ml-auto flex items-center gap-1">
          {INTERVALS.map(v => (
            <button
              key={v}
              onClick={() => changeInterval(v)}
              className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all ${
                interval === v
                  ? 'bg-[#e94560] text-white shadow-sm'
                  : 'text-text-muted hover:bg-border/60 hover:text-text-primary'
              }`}
            >
              {v}{t('timebox.min')}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div
        ref={gridRef}
        className="overflow-y-auto flex-1"
        style={{ maxHeight: '70vh' }}

      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-5 h-5 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="py-1">
            {timeSlots.map((time) => {
              const isHour = time.endsWith(':00');
              const isCurrent = isToday && time === currentSlot;
              const hasTask = !!slots[time];
              const isEditing = editingSlot === time;
              const isDragOver = dragOverSlot === time;
              const isDragSrc = dragSrcSlot === time;
              const alarmOn = !!slotAlarms[time];
              const rowH = interval <= 10 ? 28 : interval <= 15 ? 32 : 40;

              return (
                <div
                  key={time}
                  className={`flex items-center gap-0 relative group transition-colors cursor-text select-none
                    ${isHour ? 'border-t border-border/70' : 'border-t border-border/20'}
                    ${isDragOver ? 'bg-[#e94560]/10' : isCurrent ? 'bg-[#e94560]/5' : hasTask ? 'bg-border/5' : 'hover:bg-border/5'}
                    ${isDragSrc ? 'opacity-40' : ''}
                  `}
                  style={{ minHeight: rowH }}
                  onClick={() => { setEditingSlot(time); }}
                  onDragOver={(e) => handleSlotDragOver(e, time)}
                  onDragLeave={() => { setDragOverSlot(null); }}
                  onDrop={(e) => handleSlotDrop(e, time)}
                  onDragEnd={() => setDragSrcSlot(null)}
                >
                  {/* Current time bar */}
                  {isCurrent && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#e94560] rounded-r" />}

                  {/* Time label */}
                  <div className="w-14 flex-shrink-0 flex items-center justify-end pr-3">
                    <span className={`font-mono leading-none select-none text-[11px] ${
                      isCurrent ? 'text-[#e94560] font-bold' :
                      isHour ? 'text-text-secondary' : 'text-text-muted/35'
                    }`}>
                      {time}
                    </span>
                  </div>

                  {/* Divider line */}
                  <div className={`w-px self-stretch flex-shrink-0 ${isHour ? 'bg-border/80' : 'bg-border/35'}`} />

                  {/* Content area */}
                  <div className="flex-1 px-3 flex items-center min-h-full">
                    {isEditing ? (
                      <input
                        autoFocus
                        type="text"
                        value={slots[time] || ''}
                        onChange={(e) => handleSlotChange(time, e.target.value)}
                        onBlur={() => setEditingSlot(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setEditingSlot(null);
                            const idx = timeSlots.indexOf(time);
                            if (idx < timeSlots.length - 1) setTimeout(() => setEditingSlot(timeSlots[idx + 1]), 30);
                          }
                          if (e.key === 'Escape') setEditingSlot(null);
                        }}
                        placeholder={isDragOver ? t('timebox.dropHere') : t('timebox.inputPlaceholder')}
                        className="w-full bg-transparent text-xs text-text-primary placeholder:text-text-muted/40 outline-none py-1"
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        draggable={hasTask}
                        onDragStart={hasTask ? (e) => handleSlotDragStart(e, time) : undefined}
                        className={`text-xs leading-relaxed flex-1 ${
                          hasTask
                            ? 'text-text-primary cursor-grab active:cursor-grabbing'
                            : isDragOver
                            ? 'text-[#e94560]/60 italic'
                            : 'text-text-muted/20 group-hover:text-text-muted/40 transition-colors'
                        }`}
                      >
                        {isDragOver ? `${t('timebox.dropHere')} ↓` : hasTask ? slots[time] : isHour ? '—' : ''}
                      </span>
                    )}
                  </div>

                  {/* Alarm toggle */}
                  {hasTask && !isEditing && (
                    <button
                      onClick={(e) => toggleAlarm(e, time)}
                      title={alarmOn ? t('timebox.alarmOff') : t('timebox.alarmOn')}
                      className={`flex-shrink-0 w-7 h-full flex items-center justify-center transition-all ${
                        alarmOn
                          ? 'text-[#e94560] opacity-100'
                          : 'text-text-muted/0 group-hover:text-text-muted/40 hover:!text-text-muted'
                      }`}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill={alarmOn ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                      </svg>
                    </button>
                  )}

                  {/* Clear button */}
                  {hasTask && !isEditing && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSlotChange(time, ''); }}
                      className="flex-shrink-0 w-6 h-full flex items-center justify-center text-text-muted/0 group-hover:text-text-muted/40 hover:!text-[#e94560] transition-all mr-1"
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="pb-10">
      {/* Desktop: 2-column */}
      <div className="hidden md:flex gap-4" style={{ minHeight: '70vh' }}>
        {/* Left column */}
        <div className="flex flex-col gap-4 w-72 flex-shrink-0">
          {TodoSection}
          {BrainDumpSection}
        </div>
        {/* Right column */}
        {TimePlanSection}
      </div>

      {/* Mobile: stacked */}
      <div className="flex flex-col gap-4 md:hidden">
        {TodoSection}
        {TimePlanSection}
        {BrainDumpSection}
      </div>

      {/* In-app toast notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 max-w-xs">
          {toasts.map(toast => (
            <div
              key={toast.id}
              className="bg-background-card border border-[#e94560]/40 rounded-2xl shadow-2xl px-4 py-3 flex items-start gap-3 animate-in slide-in-from-right"
            >
              <span className="text-xl flex-shrink-0">⏰</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[#e94560]">{toast.title}</p>
                <p className="text-xs text-text-secondary mt-0.5 truncate">{toast.body}</p>
              </div>
              <button
                onClick={() => dismissToast(toast.id)}
                className="text-text-muted hover:text-text-primary text-sm flex-shrink-0 ml-1"
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
