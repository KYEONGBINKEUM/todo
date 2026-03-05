'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getTimebox, saveTimebox, updateTask, type TaskData } from '@/lib/firestore';

// 4:00 ~ 23:30 (30분 단위)
const TIME_SLOTS: string[] = [];
for (let h = 4; h < 24; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
}

interface TimeboxPlannerProps {
  date: string;       // YYYY-MM-DD
  tasks: TaskData[];  // 오늘의 할일 목록 (참조용)
}

export default function TimeboxPlanner({ date, tasks }: TimeboxPlannerProps) {
  const { user } = useAuth();
  const [slots, setSlots] = useState<Record<string, string>>({});
  const [brainDump, setBrainDump] = useState('');
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [taskDone, setTaskDone] = useState<Record<string, boolean>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const gridRef = useRef<HTMLDivElement>(null);

  // 현재 시간 슬롯
  const now = new Date();
  const nowHour = now.getHours();
  const nowMinute = now.getMinutes();
  const currentSlot = `${String(nowHour).padStart(2, '0')}:${nowMinute < 30 ? '00' : '30'}`;
  const isToday = date === (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  // 타임박스 데이터 로드
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getTimebox(user.uid, date).then((data) => {
      setSlots(data.slots || {});
      setBrainDump(data.brainDump || '');
      setLoading(false);
    });
  }, [user, date]);

  // 오늘 날짜면 현재 시간 슬롯으로 스크롤
  useEffect(() => {
    if (!isToday || loading || !gridRef.current) return;
    const idx = TIME_SLOTS.indexOf(currentSlot);
    if (idx < 0) return;
    const rowH = 36;
    const offset = Math.max(0, idx * rowH - 120);
    gridRef.current.scrollTop = offset;
  }, [loading, isToday, currentSlot]);

  const debouncedSave = useCallback((newSlots: Record<string, string>, newBrainDump?: string) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!user) return;
      const payload: Parameters<typeof saveTimebox>[2] = { slots: newSlots };
      if (newBrainDump !== undefined) payload.brainDump = newBrainDump;
      saveTimebox(user.uid, date, payload);
    }, 700);
  }, [user, date]);

  const handleSlotChange = (time: string, text: string) => {
    const next = { ...slots };
    if (text) next[time] = text;
    else delete next[time];
    setSlots(next);
    debouncedSave(next);
  };

  const handleBrainDumpChange = (text: string) => {
    setBrainDump(text);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (user) saveTimebox(user.uid, date, { slots, brainDump: text });
    }, 700);
  };

  const toggleTask = async (task: TaskData) => {
    if (!user || !task.id) return;
    const next = !taskDone[task.id];
    setTaskDone(prev => ({ ...prev, [task.id!]: next }));
    await updateTask(user.uid, task.id, {
      status: next ? 'completed' : 'todo',
      completedDate: next ? new Date().toISOString().split('T')[0] : null,
    });
  };

  const filledCount = Object.keys(slots).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-10">

      {/* ── TO DO LIST (오늘의 할일 체크리스트) ── */}
      {tasks.length > 0 && (
        <div className="bg-background-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider">To Do List</span>
            <span className="ml-auto text-[10px] text-text-muted">
              {tasks.filter(t => (taskDone[t.id!] ?? t.status === 'completed')).length}/{tasks.length}
            </span>
          </div>
          <div className="divide-y divide-border/40">
            {tasks.map((task) => {
              const done = taskDone[task.id!] ?? task.status === 'completed';
              return (
                <button
                  key={task.id}
                  onClick={() => toggleTask(task)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-border/20 transition-colors text-left"
                >
                  <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${done ? 'bg-[#e94560] border-[#e94560]' : 'border-border'}`}>
                    {done && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className={`text-sm flex-1 ${done ? 'line-through text-text-muted' : 'text-text-primary'}`}>
                    {task.title}
                  </span>
                  {task.priority === 'urgent' && <span className="text-red-400 text-[10px] font-bold">긴급</span>}
                  {task.priority === 'high' && <span className="text-orange-400 text-[10px] font-bold">높음</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TIME PLAN ── */}
      <div className="bg-background-card rounded-xl border border-border overflow-hidden">
        {/* 헤더 */}
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-3">
          <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Time Plan</span>
          <div className="flex gap-1 ml-1">
            <span className="w-2 h-2 rounded-full bg-[#e94560]" />
            <span className="text-[10px] text-text-muted">30분 단위</span>
          </div>
          {filledCount > 0 && (
            <span className="ml-auto text-[10px] text-text-muted">{filledCount}개 배정됨</span>
          )}
        </div>

        {/* 그리드 */}
        <div ref={gridRef} className="overflow-y-auto" style={{ maxHeight: '55vh' }}>
          {TIME_SLOTS.map((time) => {
            const isHour = time.endsWith(':00');
            const isCurrent = isToday && time === currentSlot;
            const hasTask = !!slots[time];
            const isEditing = editingSlot === time;

            return (
              <div
                key={time}
                className={`flex items-center gap-0 border-b group relative cursor-text transition-colors
                  ${isHour ? 'border-border/70' : 'border-border/30'}
                  ${isCurrent ? 'bg-[#e94560]/8' : hasTask ? 'bg-[#e94560]/[0.04]' : 'hover:bg-border/10'}
                `}
                onClick={() => setEditingSlot(time)}
              >
                {/* 현재 시간 바 */}
                {isCurrent && (
                  <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#e94560] rounded-r" />
                )}

                {/* 시간 레이블 */}
                <div className={`w-14 flex-shrink-0 flex items-center justify-end pr-3 ${isHour ? 'py-2' : 'py-1.5'}`}>
                  <span className={`font-mono text-[11px] ${
                    isCurrent ? 'text-[#e94560] font-bold' :
                    isHour ? 'text-text-secondary font-semibold' :
                    'text-text-muted/50'
                  }`}>
                    {time}
                  </span>
                </div>

                {/* 구분선 */}
                <div className={`w-px self-stretch flex-shrink-0 ${isHour ? 'bg-border/60' : 'bg-border/25'}`} />

                {/* 태스크 입력 영역 */}
                <div className={`flex-1 px-3 ${isHour ? 'py-2' : 'py-1.5'} min-h-[32px] flex items-center`}>
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
                          // 다음 슬롯으로 이동
                          const idx = TIME_SLOTS.indexOf(time);
                          if (idx < TIME_SLOTS.length - 1) setEditingSlot(TIME_SLOTS[idx + 1]);
                        }
                        if (e.key === 'Escape') setEditingSlot(null);
                      }}
                      placeholder="할 일 입력..."
                      className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-muted/30 outline-none"
                    />
                  ) : (
                    <span className={`text-sm leading-relaxed ${
                      hasTask ? 'text-text-primary' : 'text-text-muted/20 group-hover:text-text-muted/40 transition-colors'
                    }`}>
                      {hasTask ? slots[time] : '·'}
                    </span>
                  )}
                </div>

                {/* 삭제 버튼 */}
                {hasTask && !isEditing && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSlotChange(time, ''); }}
                    className="opacity-0 group-hover:opacity-100 w-6 h-6 mr-2 rounded flex items-center justify-center text-text-muted hover:text-text-primary transition-all flex-shrink-0"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── BRAIN DUMP ── */}
      <div className="bg-background-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border">
          <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Brain Dump</span>
        </div>
        <textarea
          value={brainDump}
          onChange={(e) => handleBrainDumpChange(e.target.value)}
          placeholder="아이디어, 메모, 생각을 자유롭게 적어보세요..."
          rows={5}
          className="w-full px-4 py-3 bg-transparent text-sm text-text-primary placeholder:text-text-muted/50 resize-none outline-none leading-relaxed"
        />
      </div>

    </div>
  );
}
