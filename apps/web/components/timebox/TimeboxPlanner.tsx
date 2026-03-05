'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useDataStore } from '@/lib/data-store';
import {
  getTimebox, saveTimebox, updateTask, addNote as addNoteDB,
  type TaskData,
} from '@/lib/firestore';

// ── Constants ────────────────────────────────────────────────────────────────
const INTERVAL_KEY = 'noah-timebox-interval';
const INTERVALS = [5, 10, 15, 30, 60] as const;

function generateSlots(interval: number): string[] {
  const result: string[] = [];
  for (let m = 4 * 60; m < 24 * 60; m += interval) {
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

async function fireNotification(title: string, body: string) {
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

// ── Props ────────────────────────────────────────────────────────────────────
interface Props {
  date: string;      // YYYY-MM-DD
  tasks: TaskData[]; // today's myDay tasks
}

// ── Component ────────────────────────────────────────────────────────────────
export default function TimeboxPlanner({ date, tasks }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const { notes } = useDataStore();

  // Settings
  const [interval, setIntervalMin] = useState<number>(getInitialInterval);
  const timeSlots = generateSlots(interval);

  // Timebox data
  const [slots, setSlots] = useState<Record<string, string>>({});
  const [slotAlarms, setSlotAlarms] = useState<Record<string, boolean>>({});
  const [brainDump, setBrainDump] = useState('');
  const [linkedNoteId, setLinkedNoteId] = useState<string | undefined>();

  // UI state
  const [loading, setLoading] = useState(true);
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [taskDone, setTaskDone] = useState<Record<string, boolean>>({});
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [showNoteMenu, setShowNoteMenu] = useState(false);

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

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getTimebox(user.uid, date).then((data) => {
      setSlots(data.slots || {});
      setSlotAlarms(data.slotAlarms || {});
      setBrainDump(data.brainDump || '');
      setLinkedNoteId(data.linkedNoteId);
      setLoading(false);
    });
  }, [user, date]);

  // ── Auto-scroll to current time ───────────────────────────────────────────
  useEffect(() => {
    if (!isToday || loading || !gridRef.current) return;
    const idx = timeSlots.indexOf(currentSlot);
    if (idx < 0) return;
    const rowH = interval <= 10 ? 26 : interval <= 15 ? 30 : 36;
    gridRef.current.scrollTop = Math.max(0, idx * rowH - 100);
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
        fireNotification('NOAH 타임박스', `⏰ ${slots[time]}`);
      }, delay);
      alarmTimers.current.push(timer);
    });

    return () => { alarmTimers.current.forEach(clearTimeout); };
  }, [slots, slotAlarms, isToday]);

  // ── Save helpers ──────────────────────────────────────────────────────────
  const debounceSave = useCallback((
    s: Record<string, string>,
    a: Record<string, boolean>,
    bd?: string,
    nid?: string,
  ) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!user) return;
      saveTimebox(user.uid, date, {
        slots: s,
        slotAlarms: a,
        ...(bd !== undefined ? { brainDump: bd } : {}),
        ...(nid !== undefined ? { linkedNoteId: nid } : {}),
      });
    }, 700);
  }, [user, date]);

  const handleSlotChange = (time: string, text: string) => {
    const next = { ...slots };
    if (text) next[time] = text; else delete next[time];
    // Remove alarm if text cleared
    const nextAlarms = text ? slotAlarms : { ...slotAlarms, [time]: false };
    setSlots(next);
    setSlotAlarms(nextAlarms);
    debounceSave(next, nextAlarms);
  };

  const toggleAlarm = (e: React.MouseEvent, time: string) => {
    e.stopPropagation();
    if (!slots[time]) return;
    const next = { ...slotAlarms, [time]: !slotAlarms[time] };
    setSlotAlarms(next);
    debounceSave(slots, next);
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

  const handleSlotDragOver = (e: React.DragEvent, time: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverSlot(time);
  };

  const handleSlotDrop = (e: React.DragEvent, time: string) => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (text) handleSlotChange(time, text);
    setDragOverSlot(null);
  };

  // ── Brain Dump → Note ─────────────────────────────────────────────────────
  const createNoteFromBrainDump = async () => {
    if (!user || !brainDump.trim()) return;
    try {
      const noteId = await addNoteDB(user.uid, {
        title: `타임박스 메모 — ${date}`,
        icon: '🧠',
        blocks: [{ id: `block-${Date.now()}`, type: 'text', content: brainDump }],
        pinned: false,
        tags: ['타임박스'],
        folderId: null,
        linkedTaskId: null,
        linkedTaskIds: [],
      });
      await saveTimebox(user.uid, date, { linkedNoteId: noteId });
      setLinkedNoteId(noteId);
      setShowNoteMenu(false);
      router.push('/notes');
    } catch (err) { console.error(err); }
  };

  const linkExistingNote = async (noteId: string) => {
    if (!user) return;
    await saveTimebox(user.uid, date, { linkedNoteId: noteId });
    setLinkedNoteId(noteId);
    setShowNoteMenu(false);
  };

  const unlinkNote = async () => {
    if (!user) return;
    await saveTimebox(user.uid, date, { linkedNoteId: '' });
    setLinkedNoteId(undefined);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const linkedNote = notes?.find(n => n.id === linkedNoteId);
  const filledCount = Object.keys(slots).length;
  const alarmCount = Object.values(slotAlarms).filter(Boolean).length;
  const doneCount = tasks.filter(t => taskDone[t.id!] ?? t.status === 'completed').length;

  // ── Sub-sections (shared between layouts) ─────────────────────────────────

  const TodoSection = (
    <div className="bg-background-card rounded-xl border border-border overflow-hidden flex flex-col">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] font-bold text-text-primary uppercase tracking-wider">To Do List</span>
        {tasks.length > 0 && (
          <span className="ml-auto text-[10px] text-text-muted">{doneCount}/{tasks.length}</span>
        )}
      </div>
      {tasks.length === 0 ? (
        <p className="px-4 py-4 text-xs text-text-muted text-center">오늘의 할일이 없어요</p>
      ) : (
        <div className="divide-y divide-border/40 overflow-y-auto" style={{ maxHeight: 280 }}>
          {tasks.map((task) => {
            const done = taskDone[task.id!] ?? task.status === 'completed';
            return (
              <div
                key={task.id}
                draggable
                onDragStart={(e) => handleTaskDragStart(e, task)}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-border/20 transition-colors group cursor-grab active:cursor-grabbing"
              >
                <button
                  onClick={() => toggleTask(task)}
                  className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${done ? 'bg-[#e94560] border-[#e94560]' : 'border-border group-hover:border-text-muted'}`}
                >
                  {done && (
                    <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                      <path d="M1 3.5L3.2 5.5L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span className={`text-xs flex-1 select-none ${done ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                  {task.title}
                </span>
                {/* Drag hint */}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-text-muted/40 group-hover:text-text-muted flex-shrink-0">
                  <circle cx="9" cy="7" r="1.5"/><circle cx="15" cy="7" r="1.5"/>
                  <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                  <circle cx="9" cy="17" r="1.5"/><circle cx="15" cy="17" r="1.5"/>
                </svg>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const BrainDumpSection = (
    <div className="bg-background-card rounded-xl border border-border overflow-hidden flex flex-col flex-1">
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] font-bold text-text-primary uppercase tracking-wider">Brain Dump</span>
        <div className="ml-auto flex items-center gap-1.5 relative">
          {linkedNote ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => router.push('/notes')}
                className="text-[10px] text-[#e94560] hover:underline flex items-center gap-1"
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                {linkedNote.icon} {linkedNote.title.slice(0, 12)}{linkedNote.title.length > 12 ? '…' : ''}
              </button>
              <button onClick={unlinkNote} className="text-text-muted hover:text-text-primary text-xs">×</button>
            </div>
          ) : (
            <button
              onClick={() => setShowNoteMenu(v => !v)}
              className="text-[10px] text-text-muted hover:text-text-primary flex items-center gap-1 transition-colors"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              노트 연결
            </button>
          )}
          {showNoteMenu && (
            <div className="absolute right-0 top-6 z-50 bg-background-card border border-border rounded-xl shadow-xl overflow-hidden w-52">
              <div className="p-1">
                <button
                  onClick={createNoteFromBrainDump}
                  className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-border/50 text-[#e94560] font-semibold"
                >
                  + 새 노트로 저장
                </button>
                {(notes || []).filter(n => !n.deleted).slice(0, 8).map(note => (
                  <button
                    key={note.id}
                    onClick={() => linkExistingNote(note.id!)}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-border/50 text-text-primary flex items-center gap-2"
                  >
                    <span>{note.icon}</span>
                    <span className="truncate">{note.title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <textarea
        value={brainDump}
        onChange={(e) => handleBrainDumpChange(e.target.value)}
        placeholder="아이디어, 메모, 생각을 자유롭게 적어보세요..."
        className="flex-1 w-full px-4 py-3 bg-transparent text-xs text-text-primary placeholder:text-text-muted/40 resize-none outline-none leading-relaxed"
        style={{ minHeight: 120 }}
      />
    </div>
  );

  const TimePlanSection = (
    <div className="bg-background-card rounded-xl border border-border overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-2 flex-shrink-0 flex-wrap gap-y-2">
        <span className="text-[10px] font-bold text-text-primary uppercase tracking-wider">Time Plan</span>
        {filledCount > 0 && (
          <span className="text-[10px] text-text-muted">{filledCount}개 배정</span>
        )}
        {alarmCount > 0 && (
          <span className="text-[10px] text-[#e94560]">🔔 {alarmCount}개 알람</span>
        )}
        {/* Interval selector */}
        <div className="ml-auto flex items-center gap-1">
          {INTERVALS.map(v => (
            <button
              key={v}
              onClick={() => changeInterval(v)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                interval === v
                  ? 'bg-[#e94560] text-white'
                  : 'bg-border/40 text-text-muted hover:bg-border hover:text-text-primary'
              }`}
            >
              {v}분
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div
        ref={gridRef}
        className="overflow-y-auto flex-1"
        style={{ maxHeight: '60vh' }}
        onClick={() => setShowNoteMenu(false)}
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          timeSlots.map((time) => {
            const isHour = time.endsWith(':00');
            const isCurrent = isToday && time === currentSlot;
            const hasTask = !!slots[time];
            const isEditing = editingSlot === time;
            const isDragOver = dragOverSlot === time;
            const alarmOn = !!slotAlarms[time];

            return (
              <div
                key={time}
                className={`flex items-center gap-0 border-b group relative transition-colors cursor-text
                  ${isHour ? 'border-border/60' : 'border-border/25'}
                  ${isDragOver ? 'bg-[#e94560]/15 border-[#e94560]/40' : isCurrent ? 'bg-[#e94560]/8' : hasTask ? 'bg-[#e94560]/[0.03]' : 'hover:bg-border/10'}
                `}
                style={{ minHeight: interval <= 10 ? 26 : interval <= 15 ? 30 : 36 }}
                onClick={() => { setShowNoteMenu(false); setEditingSlot(time); }}
                onDragOver={(e) => handleSlotDragOver(e, time)}
                onDragLeave={() => setDragOverSlot(null)}
                onDrop={(e) => handleSlotDrop(e, time)}
              >
                {/* Current time indicator */}
                {isCurrent && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#e94560] rounded-r" />}

                {/* Time label */}
                <div className="w-12 flex-shrink-0 flex items-center justify-end pr-2.5">
                  <span className={`font-mono leading-none ${interval <= 10 ? 'text-[9px]' : 'text-[11px]'} ${
                    isCurrent ? 'text-[#e94560] font-bold' :
                    isHour ? 'text-text-secondary font-semibold' : 'text-text-muted/40'
                  }`}>
                    {time}
                  </span>
                </div>

                {/* Divider */}
                <div className={`w-px self-stretch flex-shrink-0 ${isHour ? 'bg-border/50' : 'bg-border/20'}`} />

                {/* Task content */}
                <div className="flex-1 px-2.5 flex items-center min-h-full">
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
                          if (idx < timeSlots.length - 1) setTimeout(() => setEditingSlot(timeSlots[idx + 1]), 50);
                        }
                        if (e.key === 'Escape') setEditingSlot(null);
                      }}
                      placeholder={isDragOver ? '여기에 놓기' : '할 일 입력...'}
                      className="w-full bg-transparent text-xs text-text-primary placeholder:text-text-muted/30 outline-none"
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className={`text-xs leading-relaxed select-none ${
                      hasTask ? 'text-text-primary' : isDragOver ? 'text-[#e94560]' : 'text-text-muted/15 group-hover:text-text-muted/35 transition-colors'
                    }`}>
                      {isDragOver ? '여기에 놓기' : hasTask ? slots[time] : '·'}
                    </span>
                  )}
                </div>

                {/* Alarm toggle (only when has task) */}
                {hasTask && !isEditing && (
                  <button
                    onClick={(e) => toggleAlarm(e, time)}
                    title={alarmOn ? '알람 켜짐 (클릭해서 끄기)' : '알람 끄기 (클릭해서 켜기)'}
                    className={`flex-shrink-0 w-6 h-6 flex items-center justify-center transition-all ${
                      alarmOn
                        ? 'text-[#e94560] opacity-100'
                        : 'text-text-muted/30 opacity-0 group-hover:opacity-100 hover:text-text-muted'
                    }`}
                  >
                    {alarmOn ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
                        <line x1="1" y1="1" x2="23" y2="23" stroke="none"/>
                      </svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>
                      </svg>
                    )}
                  </button>
                )}

                {/* Clear button */}
                {hasTask && !isEditing && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSlotChange(time, ''); }}
                    className="flex-shrink-0 w-5 h-5 mr-1 rounded flex items-center justify-center text-text-muted/30 opacity-0 group-hover:opacity-100 hover:text-text-primary transition-all"
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="pb-10" onClick={() => setShowNoteMenu(false)}>
      {/* ── Desktop layout: 2-column ── */}
      <div className="hidden md:grid gap-4 h-full" style={{ gridTemplateColumns: '280px 1fr' }}>
        {/* Left: Todo + BrainDump */}
        <div className="flex flex-col gap-4">
          {TodoSection}
          {BrainDumpSection}
        </div>
        {/* Right: TimePlan */}
        {TimePlanSection}
      </div>

      {/* ── Mobile layout: stacked ── */}
      <div className="flex flex-col gap-4 md:hidden">
        {TodoSection}
        {TimePlanSection}
        {BrainDumpSection}
      </div>
    </div>
  );
}
