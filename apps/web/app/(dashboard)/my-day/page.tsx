'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  getMyDayTasks, addTask as addTaskDB, updateTask, deleteTask as deleteTaskDB,
  getLists, seedDefaultData,
  type TaskData, type ListData,
} from '@/lib/firestore';
import { useTaskReminders } from '@/lib/use-reminders';
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

export default function MyDayPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [lists, setLists] = useState<ListData[]>(DEFAULT_LISTS);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskList, setNewTaskList] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskData['priority']>('medium');
  const [filterList, setFilterList] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 상세 패널
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  // 알림 스케줄링
  useTaskReminders(tasks);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [fetchedTasks, fetchedLists] = await Promise.all([
        getMyDayTasks(user.uid),
        getLists(user.uid),
      ]);
      setTasks(fetchedTasks);
      if (fetchedLists.length === 0) {
        await seedDefaultData(user.uid);
        const seededLists = await getLists(user.uid);
        setLists(seededLists);
        if (seededLists.length > 0) setNewTaskList(seededLists[0].id!);
      } else {
        setLists(fetchedLists);
        if (!newTaskList) setNewTaskList(fetchedLists[0].id!);
      }
    } catch (err: unknown) {
      console.error('Failed to load data:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
        setError('Firestore 권한 오류: Firebase 콘솔에서 보안 규칙을 확인하세요.');
      } else {
        setError(`데이터 로드 실패: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  const filteredTasks = filterList ? tasks.filter((t) => t.listId === filterList) : tasks;
  const completedCount = filteredTasks.filter((t) => t.status === 'completed').length;
  const totalCount = filteredTasks.length;

  const handleToggleTask = async (task: TaskData) => {
    if (!user || !task.id) return;
    const newStatus = task.status === 'completed' ? 'todo' : 'completed';
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    await updateTask(user.uid, task.id, { status: newStatus });
  };

  const handleToggleStar = async (task: TaskData) => {
    if (!user || !task.id) return;
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, starred: !t.starred } : t)));
    await updateTask(user.uid, task.id, { starred: !task.starred });
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !user || adding) return;
    setAdding(true);
    const title = newTaskTitle.trim();
    const tags = parseTags(title);
    const tempId = `temp-${Date.now()}`;
    const newTask: Omit<TaskData, 'id' | 'createdAt' | 'updatedAt'> = {
      title,
      status: 'todo',
      priority: newTaskPriority,
      starred: false,
      listId: newTaskList || lists[0]?.id || '',
      myDay: true,
      tags,
    };
    setTasks((prev) => [{ ...newTask, id: tempId }, ...prev]);
    setNewTaskTitle('');
    try {
      const id = await addTaskDB(user.uid, newTask);
      setTasks((prev) => prev.map((t) => t.id === tempId ? { ...t, id } : t));
    } catch (err) {
      console.error('Failed to add task:', err);
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteTask = async (task: TaskData) => {
    if (!user || !task.id) return;
    if (selectedTaskId === task.id) setSelectedTaskId(null);
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    await deleteTaskDB(user.uid, task.id);
  };

  const handlePanelUpdate = async (updates: Partial<TaskData>) => {
    if (!user || !selectedTaskId) return;
    // 제목 변경 시 @태그 재파싱
    const finalUpdates = { ...updates };
    if (updates.title !== undefined) {
      finalUpdates.tags = parseTags(updates.title);
    }
    setTasks((prev) => prev.map((t) => t.id === selectedTaskId ? { ...t, ...finalUpdates } : t));
    await updateTask(user.uid, selectedTaskId, finalUpdates);
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
          <button
            onClick={() => { setError(null); setLoading(true); loadData(); }}
            className="mt-4 px-4 py-2 bg-[#e94560] text-white text-sm rounded-lg hover:bg-[#ff5a7a]"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">☀️</span>
            <h2 className="text-3xl font-extrabold text-text-primary">My Day</h2>
          </div>
          <p className="text-text-secondary text-sm">{today}</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-6 p-4 bg-background-card border border-border rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-secondary">오늘의 진행률</span>
            <span className="text-sm font-bold text-[#e94560]">
              {completedCount}/{totalCount}
            </span>
          </div>
          <div className="w-full h-2.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#e94560] to-[#533483] rounded-full transition-all duration-500"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* List Filter Chips */}
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterList(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterList === null
                ? 'bg-[#e94560]/20 text-[#e94560] border border-[#e94560]/30'
                : 'bg-background-card text-text-secondary border border-border hover:border-border-hover'
            }`}
          >
            전체
          </button>
          {lists.map((list) => (
            <button
              key={list.id}
              onClick={() => setFilterList(filterList === list.id! ? null : list.id!)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                filterList === list.id
                  ? 'bg-background-card border text-text-primary'
                  : 'bg-background-card text-text-secondary border border-border hover:border-border-hover'
              }`}
              style={filterList === list.id ? { borderColor: list.color, color: list.color } : undefined}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: list.color }} />
              {list.label}
            </button>
          ))}
        </div>

        {/* Add Task Input */}
        <div className="mb-6 flex gap-2">
          <div className="flex-1 flex bg-background-card border border-border rounded-xl overflow-hidden focus-within:border-[#e94560] transition-colors">
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
              placeholder="+ 새 작업 추가... (@태그 입력 가능)"
              className="flex-1 px-4 py-3 bg-transparent text-text-primary placeholder-text-muted text-sm focus:outline-none"
            />
            <select
              value={newTaskPriority}
              onChange={(e) => setNewTaskPriority(e.target.value as TaskData['priority'])}
              className="px-2 bg-transparent text-xs border-l border-border focus:outline-none cursor-pointer text-text-secondary"
            >
              <option value="urgent" className="bg-background-card">긴급</option>
              <option value="high" className="bg-background-card">높음</option>
              <option value="medium" className="bg-background-card">보통</option>
              <option value="low" className="bg-background-card">낮음</option>
            </select>
            <select
              value={newTaskList}
              onChange={(e) => setNewTaskList(e.target.value)}
              className="px-2 bg-transparent text-text-secondary text-xs border-l border-border focus:outline-none cursor-pointer"
            >
              {lists.map((list) => (
                <option key={list.id} value={list.id!} className="bg-background-card">
                  {list.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAddTask}
            disabled={adding}
            className="px-5 py-3 bg-[#e94560] hover:bg-[#ff5a7a] text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {adding ? '...' : '추가'}
          </button>
        </div>

        {/* Task List */}
        <div className="space-y-2">
          {filteredTasks.map((task, index) => {
            const priority = priorityColors[task.priority];
            const list = getListInfo(task.listId);
            const isCompleted = task.status === 'completed';
            const isSelected = selectedTaskId === task.id;
            const taskTags = task.tags ?? [];

            return (
              <div
                key={task.id}
                onClick={() => setSelectedTaskId(isSelected ? null : task.id!)}
                className={`group flex items-center gap-3 p-4 bg-background-card border rounded-xl transition-all cursor-pointer ${
                  isSelected
                    ? 'border-[#e94560]/40 shadow-[0_0_12px_rgba(233,69,96,0.08)]'
                    : isCompleted
                    ? 'border-border/50 opacity-70'
                    : 'border-border hover:border-border-hover'
                }`}
                style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: `${index * 0.05}s` }}
              >
                {/* 체크박스 */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleTask(task); }}
                  className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0 ${
                    isCompleted
                      ? 'bg-gradient-to-br from-[#e94560] to-[#533483] border-transparent scale-110'
                      : 'border-text-secondary/50 hover:border-[#e94560] hover:shadow-[0_0_8px_rgba(233,69,96,0.3)]'
                  }`}
                >
                  {isCompleted && (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="animate-[checkPop_0.3s_ease-out]">
                      <path d="M3 7L6 10L11 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                <span className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: list.color }} />

                {/* 제목 + @태그 — 클릭 시 패널 오픈 (인라인 편집 없음) */}
                <div className="flex-1 min-w-0">
                  <span className={`block text-sm transition-all duration-300 ${isCompleted ? 'line-through text-text-inactive' : 'text-text-primary'}`}>
                    {task.title}
                  </span>
                  {taskTags.length > 0 && (
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {taskTags.map((tag) => (
                        <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-[#8b5cf6]/10 text-[#8b5cf6] font-semibold">
                          @{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {(task.subTasks?.length ?? 0) > 0 && (
                  <span className="text-[10px] text-text-muted flex-shrink-0">
                    📋 {task.subTasks!.filter(s => s.completed).length}/{task.subTasks!.length}
                  </span>
                )}
                <span className="text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0" style={{ color: list.color, borderColor: `${list.color}40`, backgroundColor: `${list.color}10` }}>
                  {list.label}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 ${priority.bg} ${priority.text} ${priority.border}`}>
                  {priority.label}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleStar(task); }}
                  className={`text-lg transition-all duration-200 flex-shrink-0 ${
                    task.starred ? 'text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.5)]' : 'text-text-inactive hover:text-amber-400/60'
                  }`}
                >
                  {task.starred ? '★' : '☆'}
                </button>
                {/* 상세 보기 버튼 */}
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
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteTask(task); }}
                  className="opacity-0 group-hover:opacity-100 text-text-inactive hover:text-[#e94560] transition-all text-lg flex-shrink-0"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {filteredTasks.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">{tasks.length === 0 ? '☀️' : '🎉'}</div>
            <p className="text-text-secondary font-semibold">
              {tasks.length === 0 ? '오늘의 작업을 추가해보세요' : filterList ? '이 목록에 작업이 없습니다' : '모든 작업을 완료했습니다!'}
            </p>
            <p className="text-text-muted text-sm mt-1">위 입력란에서 새 작업을 추가할 수 있습니다</p>
          </div>
        )}

        {/* AI Suggestions (Mock) */}
        <div className="mt-8 p-5 bg-gradient-to-r from-background-card to-background border border-border rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">🧠</span>
            <span className="text-xs font-bold text-[#8b5cf6] uppercase tracking-wider">AI Suggestions</span>
            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-gradient-to-r from-amber-500 to-red-500 text-white">PREMIUM</span>
          </div>
          <div className="space-y-2">
            {[
              '📊 작업을 하위 작업으로 분해하시겠습니까?',
              '⏰ 집중 시간대 분석: 오전 10시-12시가 가장 생산적입니다',
              '🔄 반복 작업을 자동 설정하시겠습니까?',
            ].map((suggestion, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 bg-border/30 rounded-lg text-xs text-text-secondary">
                <span className="flex-1">{suggestion}</span>
                <button className="text-[#8b5cf6] hover:text-[#a78bfa] text-[10px] font-semibold flex-shrink-0">적용</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Task Detail Panel */}
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
