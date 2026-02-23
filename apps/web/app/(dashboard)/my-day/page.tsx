'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import {
  addTask as addTaskDB, updateTask, deleteTask as deleteTaskDB,
  type TaskData, type ListData,
} from '@/lib/firestore';
import { useTaskReminders } from '@/lib/use-reminders';
import { deleteAttachmentsFromStorage } from '@/lib/attachment-store';
import { useDataStore } from '@/lib/data-store';
import TaskDetailPanel from '@/components/task/TaskDetailPanel';

const DEFAULT_LISTS: ListData[] = [
  { id: 'my-tasks', label: 'My Tasks', color: '#e94560' },
  { id: 'work', label: '업무', color: '#8b5cf6' },
  { id: 'personal', label: '개인', color: '#06b6d4' },
];

const priorityColors = {
  urgent: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', label: '긴급' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', label: '높음' },
  medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', label: '보통' },
  low: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', label: '낮음' },
};

function parseTags(title: string): string[] {
  return [...title.matchAll(/@([\w가-힣]+)/g)].map((m) => m[1]);
}

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTodayStr() {
  return toLocalDateStr(new Date());
}

// 선택 날짜 중심으로 ±3일 (7일) 캘린더 생성
function generateCalendarDays(centerDateStr: string): { date: Date; dateStr: string; day: number; weekday: string; isToday: boolean; month: number }[] {
  const center = new Date(centerDateStr + 'T00:00:00');
  const todayStr = getTodayStr();
  const days: { date: Date; dateStr: string; day: number; weekday: string; isToday: boolean; month: number }[] = [];
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

  for (let i = -3; i <= 3; i++) {
    const d = new Date(center);
    d.setDate(center.getDate() + i);
    const ds = toLocalDateStr(d);
    days.push({
      date: d,
      dateStr: ds,
      day: d.getDate(),
      weekday: weekdays[d.getDay()],
      isToday: ds === todayStr,
      month: d.getMonth() + 1,
    });
  }
  return days;
}

// createdDate 폴백: createdDate가 없으면 createdAt Timestamp에서 추출
function getTaskCreatedDate(task: TaskData): string {
  if (task.createdDate) return task.createdDate;
  if (task.createdAt && typeof task.createdAt.toDate === 'function') {
    const d = task.createdAt.toDate();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return '1970-01-01';
}

export default function MyDayPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { tasks: storeTasks, lists: storeLists, loading } = useDataStore();
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [lists, setLists] = useState<ListData[]>(DEFAULT_LISTS);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskList, setNewTaskList] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskData['priority']>('medium');
  const [filterList, setFilterList] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [showCompleted, setShowCompleted] = useState(true);

  // Drag state
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const savingOrder = useRef(false);

  // Detail panel
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // 기록 삭제 메뉴
  const [showCleanup, setShowCleanup] = useState(false);
  const [cleanupFrom, setCleanupFrom] = useState('');
  const [cleanupTo, setCleanupTo] = useState('');
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  const datePickerRef = useRef<HTMLInputElement>(null);
  const todayStr = getTodayStr();
  const isViewingToday = selectedDate === todayStr;
  const calendarDays = generateCalendarDays(selectedDate);

  useTaskReminders(tasks);

  // 캘린더 네비게이션
  const shiftCalendar = (days: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    setSelectedDate(toLocalDateStr(d));
  };

  // 선택 날짜 기준 완료된 task ID 세트
  const [completedOnDateIds, setCompletedOnDateIds] = useState<Set<string>>(new Set());

  // 스토어 tasks → 로컬 tasks (myDay 필터 + 날짜 기반 필터 + 정렬)
  useEffect(() => {
    if (savingOrder.current) return;
    const myDayAll = storeTasks.filter((t) => t.myDay);

    // 활성 작업: 등록일 <= 선택일 && (미완료 또는 완료일 > 선택일)
    const activeDateTasks = myDayAll.filter((t) => {
      const cd = getTaskCreatedDate(t);
      if (cd > selectedDate) return false;
      if (t.status !== 'completed') return true;
      return t.completedDate != null && t.completedDate > selectedDate;
    });
    // 완료 작업: 선택일에 완료된 것만
    const completedDateTasks = myDayAll.filter((t) => t.status === 'completed' && t.completedDate === selectedDate);

    // 완료된 task ID 세트 저장 (status 대신 이것으로 활성/완료 구분)
    setCompletedOnDateIds(new Set(completedDateTasks.map((t) => t.id!)));

    const combined = [...activeDateTasks, ...completedDateTasks];
    const sorted = [...combined].sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      if (a.order !== undefined) return -1;
      if (b.order !== undefined) return 1;
      return 0;
    });
    setTasks(sorted.map((t, i) => ({ ...t, order: t.order ?? (i + 1) * 1000 })));
  }, [storeTasks, selectedDate]);

  // 스토어 lists → 로컬 lists
  useEffect(() => {
    if (storeLists.length > 0) {
      setLists(storeLists);
      if (!newTaskList) setNewTaskList(storeLists[0].id!);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeLists]);

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  const filteredTasks = tasks
    .filter((t) => !filterList || t.listId === filterList)
    .filter((t) => !filterTag || (t.tags ?? []).includes(filterTag));

  const activeTasks = filteredTasks.filter((t) => !completedOnDateIds.has(t.id!));
  const completedTasks = filteredTasks.filter((t) => completedOnDateIds.has(t.id!));

  const completedCount = completedTasks.length;
  const totalCount = filteredTasks.length;
  const allTags = [...new Set(tasks.flatMap((t) => t.tags ?? []))].filter(Boolean);
  const canDrag = !filterList && !filterTag;

  // Drag & Drop
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragSrcIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  };

  const handleDragEnd = () => { setDragSrcIdx(null); setDragOverIdx(null); };

  const handleDrop = async (e: React.DragEvent, dstIdx: number) => {
    e.preventDefault();
    const srcIdx = dragSrcIdx;
    handleDragEnd();
    if (srcIdx === null || srcIdx === dstIdx || savingOrder.current) return;

    const newTasks = [...activeTasks];
    const [moved] = newTasks.splice(srcIdx, 1);
    newTasks.splice(dstIdx, 0, moved);

    const withOrder = newTasks.map((t, i) => ({ ...t, order: (i + 1) * 1000 }));
    setTasks([...withOrder, ...completedTasks]);

    if (user) {
      savingOrder.current = true;
      try {
        await Promise.all(withOrder.map((t) => updateTask(user.uid, t.id!, { order: t.order! })));
      } finally {
        savingOrder.current = false;
      }
    }
  };

  // Task handlers
  const handleToggleTask = async (task: TaskData) => {
    if (!user || !task.id) return;
    const newStatus = task.status === 'completed' ? 'todo' : 'completed';
    const completedDate = newStatus === 'completed' ? selectedDate : null;
    await updateTask(user.uid, task.id, { status: newStatus, completedDate });
  };

  const handleToggleStar = async (task: TaskData) => {
    if (!user || !task.id) return;
    await updateTask(user.uid, task.id, { starred: !task.starred });
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !user || adding) return;
    setAdding(true);
    const title = newTaskTitle.trim();
    const tags = parseTags(title);
    const maxOrder = tasks.reduce((m, t) => Math.max(m, t.order ?? 0), 0);
    setNewTaskTitle('');
    try {
      await addTaskDB(user.uid, {
        title, status: 'todo', priority: newTaskPriority,
        starred: false, listId: newTaskList || lists[0]?.id || '',
        myDay: true, tags, order: maxOrder + 1000,
        createdDate: selectedDate,
      });
      // onSnapshot이 자동으로 리스트에 추가
    } catch {
      setError('할일 추가 실패');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteTask = async (task: TaskData) => {
    if (!user || !task.id) return;
    if (selectedTaskId === task.id) setSelectedTaskId(null);
    const atts = task.attachments ?? [];
    if (atts.length) await deleteAttachmentsFromStorage(atts);
    await deleteTaskDB(user.uid, task.id);
  };

  const handlePanelUpdate = async (updates: Partial<TaskData>) => {
    if (!user || !selectedTaskId) return;
    const finalUpdates = { ...updates };
    if (updates.title !== undefined) finalUpdates.tags = parseTags(updates.title);
    if (updates.status === 'completed') finalUpdates.completedDate = getTodayStr();
    if (updates.status && updates.status !== 'completed') finalUpdates.completedDate = null;
    await updateTask(user.uid, selectedTaskId, finalUpdates);
  };

  // 과거 기록 삭제
  const handleCleanupByDate = async (dateStr: string) => {
    if (!user || !confirm(`${dateStr} 기록을 삭제하시겠습니까?`)) return;
    const targets = storeTasks.filter((t) => t.myDay && getTaskCreatedDate(t) === dateStr);
    for (const t of targets) {
      if (t.attachments?.length) await deleteAttachmentsFromStorage(t.attachments);
      await deleteTaskDB(user.uid, t.id!);
    }
  };

  const handleCleanupByRange = async () => {
    if (!user || !cleanupFrom || !cleanupTo) return;
    if (!confirm(`${cleanupFrom} ~ ${cleanupTo} 기간의 기록을 삭제하시겠습니까?`)) return;
    const targets = storeTasks.filter((t) => {
      if (!t.myDay) return false;
      const cd = getTaskCreatedDate(t);
      return cd >= cleanupFrom && cd <= cleanupTo;
    });
    for (const t of targets) {
      if (t.attachments?.length) await deleteAttachmentsFromStorage(t.attachments);
      await deleteTaskDB(user.uid, t.id!);
    }
    setCleanupFrom(''); setCleanupTo(''); setShowCleanup(false);
  };

  const handleCleanupBeforeToday = async () => {
    if (!user) return;
    const todayDate = getTodayStr();
    const targets = storeTasks.filter((t) => {
      if (!t.myDay) return false;
      const cd = getTaskCreatedDate(t);
      return cd < todayDate && t.status === 'completed';
    });
    if (!targets.length) { alert('삭제할 완료된 과거 기록이 없습니다.'); return; }
    if (!confirm(`오늘 이전 완료된 기록 ${targets.length}개를 삭제하시겠습니까?`)) return;
    for (const t of targets) {
      if (t.attachments?.length) await deleteAttachmentsFromStorage(t.attachments);
      await deleteTaskDB(user.uid, t.id!);
    }
    setShowCleanup(false);
  };

  const handleCleanupAll = async () => {
    if (!user) return;
    const targets = storeTasks.filter((t) => t.myDay);
    if (!targets.length) { alert('삭제할 기록이 없습니다.'); return; }
    if (!confirm(`My Day 전체 기록 ${targets.length}개를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    for (const t of targets) {
      if (t.attachments?.length) await deleteAttachmentsFromStorage(t.attachments);
      await deleteTaskDB(user.uid, t.id!);
    }
    setShowCleanup(false);
  };

  const getListInfo = (listId: string) =>
    lists.find((l) => l.id === listId) || lists[0] || DEFAULT_LISTS[0];

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="max-w-md text-center p-6 bg-red-500/10 border border-red-500/30 rounded-xl">
          <p className="text-red-400 font-semibold mb-2">오류 발생</p>
          <p className="text-text-secondary text-sm">{error}</p>
          <button onClick={() => setError(null)} className="mt-4 px-4 py-2 bg-[#e94560] text-white text-sm rounded-lg hover:bg-[#ff5a7a]">닫기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">☀️</span>
            <h2 className="text-3xl font-extrabold text-text-primary">{t('myDay.title')}</h2>
            <div className="ml-auto relative">
              <button
                onClick={() => setShowCleanup(!showCleanup)}
                className="px-3 py-1.5 text-[11px] text-text-muted hover:text-[#e94560] border border-border hover:border-[#e94560]/30 rounded-lg transition-colors"
              >
                🗑️ 기록 관리
              </button>
              {showCleanup && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-background-card border border-border rounded-xl shadow-2xl z-50 p-4 space-y-3">
                  <p className="text-xs font-bold text-text-primary">과거 기록 삭제</p>

                  {/* 선택 날짜 삭제 */}
                  <button
                    onClick={() => { handleCleanupByDate(selectedDate); setShowCleanup(false); }}
                    className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:bg-[#e94560]/10 hover:text-[#e94560] rounded-lg transition-colors"
                  >
                    📅 {selectedDate} 기록 삭제
                  </button>

                  {/* 기간 설정 삭제 */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-text-muted font-semibold">기간 설정 삭제</p>
                    <div className="flex gap-1.5">
                      <input type="date" value={cleanupFrom} onChange={(e) => setCleanupFrom(e.target.value)} className="flex-1 px-2 py-1.5 bg-background border border-border rounded-lg text-[11px] text-text-primary focus:outline-none focus:border-[#e94560]" />
                      <span className="text-text-muted text-xs self-center">~</span>
                      <input type="date" value={cleanupTo} onChange={(e) => setCleanupTo(e.target.value)} className="flex-1 px-2 py-1.5 bg-background border border-border rounded-lg text-[11px] text-text-primary focus:outline-none focus:border-[#e94560]" />
                    </div>
                    <button
                      onClick={handleCleanupByRange}
                      disabled={!cleanupFrom || !cleanupTo}
                      className="w-full px-3 py-1.5 text-[11px] bg-[#e94560] text-white rounded-lg hover:bg-[#ff5a7a] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      기간 내 기록 삭제
                    </button>
                  </div>

                  {/* 오늘 이전 완료 삭제 */}
                  <button
                    onClick={handleCleanupBeforeToday}
                    className="w-full text-left px-3 py-2 text-xs text-[#e94560] hover:bg-[#e94560]/10 rounded-lg transition-colors border border-[#e94560]/20"
                  >
                    🧹 오늘 이전 완료된 기록 전체 삭제
                  </button>

                  {/* 전체 삭제 */}
                  <button
                    onClick={handleCleanupAll}
                    className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-500/10 rounded-lg transition-colors border border-red-500/20 font-semibold"
                  >
                    ⚠️ My Day 전체 기록 삭제
                  </button>

                  <button onClick={() => setShowCleanup(false)} className="w-full text-center text-[10px] text-text-muted py-1">닫기</button>
                </div>
              )}
            </div>
          </div>
          <p className="text-text-secondary text-sm">{today}</p>
        </div>

        {/* 7-Day Calendar Strip */}
        <div className="mb-6 bg-background-card border border-border rounded-xl">
          {/* 캘린더 헤더: 월 표시 + 오늘 버튼 + 날짜 피커 */}
          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <span className="text-xs font-bold text-text-primary">
              {(() => {
                const d = new Date(selectedDate + 'T00:00:00');
                return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
              })()}
            </span>
            <div className="flex items-center gap-1.5">
              {!isViewingToday && (
                <button
                  onClick={() => setSelectedDate(todayStr)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#e94560]/15 text-[#e94560] hover:bg-[#e94560]/25 transition-colors"
                >
                  오늘
                </button>
              )}
              <button
                onClick={() => datePickerRef.current?.showPicker()}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-[#e94560] hover:bg-border/50 transition-colors"
                title="날짜 선택"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </button>
              <input
                ref={datePickerRef}
                type="date"
                value={selectedDate}
                onChange={(e) => { if (e.target.value) setSelectedDate(e.target.value); }}
                className="absolute w-0 h-0 opacity-0 pointer-events-none"
                tabIndex={-1}
              />
            </div>
          </div>

          {/* 날짜 스트립: 좌우 화살표 + 7일 */}
          <div className="flex items-center gap-1 px-2 pb-3">
            <button
              onClick={() => shiftCalendar(-7)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-border/50 transition-colors flex-shrink-0"
              title="이전 7일"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>

            <div className="flex-1 grid grid-cols-7 gap-1">
              {calendarDays.map((d) => (
                <button
                  key={d.dateStr}
                  onClick={() => setSelectedDate(d.dateStr)}
                  className={`flex flex-col items-center py-2 rounded-xl transition-all ${
                    selectedDate === d.dateStr && d.isToday
                      ? 'bg-gradient-to-br from-[#e94560] to-[#533483] text-white shadow-lg shadow-[#e94560]/20'
                      : selectedDate === d.dateStr
                      ? 'bg-[#e94560]/15 text-[#e94560] border border-[#e94560]/30'
                      : d.isToday
                      ? 'text-[#e94560] font-bold hover:bg-[#e94560]/10'
                      : 'text-text-secondary hover:bg-background-hover'
                  }`}
                >
                  <span className="text-[10px] font-medium mb-0.5">{d.weekday}</span>
                  <span className={`text-lg font-bold ${selectedDate === d.dateStr && d.isToday ? 'text-white' : ''}`}>{d.day}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => shiftCalendar(7)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-border/50 transition-colors flex-shrink-0"
              title="다음 7일"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>

        {/* 선택 날짜 안내 (오늘 아닌 경우) */}
        {!isViewingToday && (
          <div className="mb-4 px-4 py-2.5 bg-[#e94560]/10 border border-[#e94560]/20 rounded-xl flex items-center gap-2 text-xs text-[#e94560]">
            <span>📅</span>
            <span className="font-semibold">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
            </span>
          </div>
        )}

        {/* Progress Bar */}
        <div className="mb-6 p-4 bg-background-card border border-border rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-secondary">{t('myDay.progress')}</span>
            <span className="text-sm font-bold text-[#e94560]">{completedCount}/{totalCount}</span>
          </div>
          <div className="w-full h-2.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#e94560] to-[#533483] rounded-full transition-all duration-500"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* List Filter Chips */}
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterList(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${!filterList ? 'bg-[#e94560]/20 text-[#e94560] border border-[#e94560]/30' : 'bg-background-card text-text-secondary border border-border hover:border-border-hover'}`}
          >
            {t('common.all')}
          </button>
          {lists.map((list) => (
            <button
              key={list.id}
              onClick={() => setFilterList(filterList === list.id! ? null : list.id!)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${filterList === list.id ? 'bg-background-card border' : 'bg-background-card text-text-secondary border border-border hover:border-border-hover'}`}
              style={filterList === list.id ? { borderColor: list.color, color: list.color } : undefined}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: list.color }} />
              {list.label}
            </button>
          ))}
        </div>

        {/* @Tag filter chips */}
        {allTags.length > 0 && (
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">@태그</span>
            {filterTag && (
              <button onClick={() => setFilterTag(null)} className="px-2.5 py-1 rounded-lg text-xs bg-background-card text-text-secondary border border-border hover:border-border-hover transition-all">{t('common.all')}</button>
            )}
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${filterTag === tag ? 'bg-[#8b5cf6]/15 text-[#8b5cf6] border-[#8b5cf6]/30' : 'text-text-secondary border-border hover:border-border-hover hover:bg-background-card'}`}
              >
                @{tag}
              </button>
            ))}
          </div>
        )}

        {/* Add Task Input */}
        <div className="mb-6 flex gap-2">
            <div className="flex-1 flex bg-background-card border border-border rounded-xl overflow-hidden focus-within:border-[#e94560] transition-colors">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                placeholder={t('myDay.addTask')}
                className="flex-1 px-4 py-3 bg-transparent text-text-primary placeholder-text-muted text-sm focus:outline-none"
              />
              <select value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value as TaskData['priority'])} className="px-2 bg-transparent text-xs border-l border-border focus:outline-none cursor-pointer text-text-secondary">
                <option value="urgent" className="bg-background-card">{t('priority.urgent')}</option>
                <option value="high" className="bg-background-card">{t('priority.high')}</option>
                <option value="medium" className="bg-background-card">{t('priority.medium')}</option>
                <option value="low" className="bg-background-card">{t('priority.low')}</option>
              </select>
              <select value={newTaskList} onChange={(e) => setNewTaskList(e.target.value)} className="px-2 bg-transparent text-text-secondary text-xs border-l border-border focus:outline-none cursor-pointer">
                {lists.map((list) => (
                  <option key={list.id} value={list.id!} className="bg-background-card">{list.label}</option>
                ))}
              </select>
            </div>
            <button onClick={handleAddTask} disabled={adding} className="px-5 py-3 bg-[#e94560] hover:bg-[#ff5a7a] text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50">
              {adding ? '...' : t('common.add')}
            </button>
          </div>

        {/* Drag hint */}
        {canDrag && filteredTasks.length > 1 && (
          <p className="text-[10px] text-text-inactive mb-2 flex items-center gap-1">
            <span>⋮⋮</span>
            <span>{t('myDay.dragHint')}</span>
          </p>
        )}

        {/* Active Task List */}
        <div className="space-y-2">
          {activeTasks.map((task, index) => {
            const priority = priorityColors[task.priority];
            const list = getListInfo(task.listId);
            const isSelected = selectedTaskId === task.id;
            const isDragging = dragSrcIdx === index;
            const isDragOver = dragOverIdx === index;
            const taskTags = task.tags ?? [];

            return (
              <div
                key={task.id}
                draggable={canDrag}
                onDragStart={canDrag ? (e) => handleDragStart(e, index) : undefined}
                onDragOver={canDrag ? (e) => handleDragOver(e, index) : undefined}
                onDrop={canDrag ? (e) => handleDrop(e, index) : undefined}
                onDragEnd={handleDragEnd}
                onClick={() => setSelectedTaskId(isSelected ? null : task.id!)}
                className={`group flex items-center gap-3 p-4 bg-background-card border rounded-xl transition-all cursor-pointer select-none ${
                  isDragging ? 'opacity-40 scale-95' :
                  isDragOver ? 'border-[#e94560] shadow-[0_0_12px_rgba(233,69,96,0.15)]' :
                  isSelected ? 'border-[#e94560]/40 shadow-[0_0_12px_rgba(233,69,96,0.08)]' :
                  'border-border hover:border-border-hover'
                }`}
                style={{ animation: isDragOver ? undefined : 'fadeUp 0.4s ease-out both', animationDelay: `${index * 0.05}s` }}
              >
                {/* Drag handle */}
                {canDrag && (
                  <span className="opacity-0 group-hover:opacity-100 text-text-inactive text-xs cursor-grab active:cursor-grabbing flex-shrink-0 select-none" title="드래그하여 순서 변경">
                    ⋮⋮
                  </span>
                )}

                {/* Checkbox */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleTask(task); }}
                  className="w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0 hover:border-[#e94560] hover:shadow-[0_0_8px_rgba(233,69,96,0.3)]"
                  style={{ borderColor: 'var(--color-checkbox-border)' }}
                />

                <span className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: list.color }} />

                {/* Title + tags */}
                <div className="flex-1 min-w-0">
                  <span className="block text-sm text-text-primary">
                    {task.title}
                  </span>
                  {taskTags.length > 0 && (
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {taskTags.map((tag) => (
                        <button
                          key={tag}
                          onClick={(e) => { e.stopPropagation(); setFilterTag(filterTag === tag ? null : tag); }}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-[#8b5cf6]/10 text-[#8b5cf6] font-semibold hover:bg-[#8b5cf6]/20 transition-colors"
                        >
                          @{tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {(task.subTasks?.length ?? 0) > 0 && (
                  <span className="text-[10px] text-text-muted flex-shrink-0">📋 {task.subTasks!.filter(s => s.completed).length}/{task.subTasks!.length}</span>
                )}
                <span className="text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0" style={{ color: list.color, borderColor: `${list.color}40`, backgroundColor: `${list.color}10` }}>{list.label}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 ${priority.bg} ${priority.text} ${priority.border}`}>{priority.label}</span>
                <button onClick={(e) => { e.stopPropagation(); handleToggleStar(task); }} className={`text-lg transition-all duration-200 flex-shrink-0 ${task.starred ? 'text-amber-400' : 'text-text-inactive hover:text-amber-400/60'}`}>
                  {task.starred ? '★' : '☆'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedTaskId(task.id!); }}
                  className="opacity-0 group-hover:opacity-100 text-text-inactive hover:text-text-secondary transition-all flex-shrink-0"
                  title="상세 보기 / 편집"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteTask(task); }} className="opacity-0 group-hover:opacity-100 text-text-inactive hover:text-[#e94560] transition-all text-lg flex-shrink-0">×</button>
              </div>
            );
          })}
        </div>

        {activeTasks.length === 0 && completedTasks.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">{tasks.length === 0 ? '☀️' : filterTag ? '🏷️' : '🎉'}</div>
            <p className="text-text-secondary font-semibold">
              {tasks.length === 0 ? t('myDay.emptyAll') : filterTag ? `@${filterTag} ${t('myDay.emptyTag')}` : filterList ? t('myDay.emptyList') : t('myDay.emptyComplete')}
            </p>
          </div>
        )}

        {/* 완료됨 Section */}
        {completedTasks.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center gap-2 text-text-muted text-sm mb-3 hover:text-text-secondary transition-colors w-full"
            >
              <span className={`transition-transform duration-200 text-xs ${showCompleted ? 'rotate-90' : ''}`}>▶</span>
              <span className="font-semibold">{t('status.completed')}</span>
              <span className="text-[10px] bg-border px-2 py-0.5 rounded-full">{completedTasks.length}</span>
            </button>
            {showCompleted && (
              <div className="space-y-2">
                {completedTasks.map((task, index) => {
                  const priority = priorityColors[task.priority];
                  const list = getListInfo(task.listId);
                  const isSelected = selectedTaskId === task.id;
                  const taskTags = task.tags ?? [];
                  return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTaskId(isSelected ? null : task.id!)}
                      className={`group flex items-center gap-3 p-4 bg-background-card border rounded-xl transition-all cursor-pointer opacity-60 ${isSelected ? 'border-[#e94560]/40' : 'border-border/50 hover:border-border-hover hover:opacity-80'}`}
                      style={{ animation: 'fadeUp 0.3s ease-out both', animationDelay: `${index * 0.03}s` }}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleTask(task); }}
                        className="w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0 bg-gradient-to-br from-[#e94560] to-[#533483] border-transparent"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7L6 10L11 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                      <span className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: list.color }} />
                      <div className="flex-1 min-w-0">
                        <span className="block text-sm line-through text-text-inactive">{task.title}</span>
                        {taskTags.length > 0 && (
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            {taskTags.map((tag) => (<span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-[#8b5cf6]/10 text-[#8b5cf6]">@{tag}</span>))}
                          </div>
                        )}
                      </div>
                      {(task.subTasks?.length ?? 0) > 0 && (
                        <span className="text-[10px] text-text-muted flex-shrink-0">📋 {task.subTasks!.filter(s => s.completed).length}/{task.subTasks!.length}</span>
                      )}
                      <span className="text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0" style={{ color: list.color, borderColor: `${list.color}40`, backgroundColor: `${list.color}10` }}>{list.label}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 ${priority.bg} ${priority.text} ${priority.border}`}>{priority.label}</span>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteTask(task); }} className="opacity-0 group-hover:opacity-100 text-text-inactive hover:text-[#e94560] transition-all text-lg flex-shrink-0">×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={handlePanelUpdate}
          onDelete={() => handleDeleteTask(selectedTask)}
        />
      )}
    </div>
  );
}
