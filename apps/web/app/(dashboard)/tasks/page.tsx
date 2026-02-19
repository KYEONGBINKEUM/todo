'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getTasks, getLists, updateTask, type TaskData, type ListData } from '@/lib/firestore';

const DEFAULT_LISTS: ListData[] = [
  { id: 'my-tasks', label: 'My Tasks', color: '#e94560' },
];

const priorityColors = {
  urgent: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', label: '긴급' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', label: '높음' },
  medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', label: '보통' },
  low: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', label: '낮음' },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  todo: { label: '할 일', color: '#94a3b8' },
  in_progress: { label: '진행 중', color: '#8b5cf6' },
  completed: { label: '완료', color: '#22c55e' },
};

export default function AllTasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [lists, setLists] = useState<ListData[]>(DEFAULT_LISTS);
  const [filterList, setFilterList] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [fetchedTasks, fetchedLists] = await Promise.all([getTasks(user.uid), getLists(user.uid)]);
      setTasks(fetchedTasks);
      if (fetchedLists.length > 0) setLists(fetchedLists);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

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

  const filtered = tasks
    .filter((t) => !filterList || t.listId === filterList)
    .filter((t) => !filterStatus || t.status === filterStatus)
    .filter((t) => !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const getListInfo = (listId: string) => lists.find((l) => l.id === listId) || lists[0];

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">📋</span>
            <h2 className="text-3xl font-extrabold text-text-primary">모든 작업</h2>
            <span className="text-sm text-text-muted ml-2">{filtered.length}개</span>
          </div>
          <p className="text-text-secondary text-sm">모든 목록의 작업을 한 곳에서 관리하세요</p>
        </div>

        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="작업 검색..."
            className="w-full px-4 py-3 bg-background-card border border-border rounded-xl text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-[#e94560] transition-colors"
          />
        </div>

        <div className="mb-6 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">목록</span>
            <button onClick={() => setFilterList(null)} className={`px-2.5 py-1 rounded-lg text-xs transition-all ${!filterList ? 'bg-[#e94560]/20 text-[#e94560]' : 'text-text-secondary hover:bg-background-card'}`}>전체</button>
            {lists.map((list) => (
              <button key={list.id} onClick={() => setFilterList(filterList === list.id! ? null : list.id!)} className={`px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1.5 ${filterList === list.id ? '' : 'text-text-secondary hover:bg-background-card'}`} style={filterList === list.id ? { color: list.color } : undefined}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: list.color }} />
                {list.label}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">상태</span>
            {Object.entries(statusLabels).map(([key, val]) => (
              <button key={key} onClick={() => setFilterStatus(filterStatus === key ? null : key)} className={`px-2.5 py-1 rounded-lg text-xs transition-all ${filterStatus === key ? '' : 'text-text-secondary hover:bg-background-card'}`} style={filterStatus === key ? { color: val.color } : undefined}>{val.label}</button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {filtered.map((task, index) => {
            const priority = priorityColors[task.priority];
            const list = getListInfo(task.listId);
            const isCompleted = task.status === 'completed';
            return (
              <div key={task.id} className={`group flex items-center gap-3 p-4 bg-background-card border rounded-xl hover:border-border-hover transition-all ${isCompleted ? 'border-border/50 opacity-60' : 'border-border'}`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: `${index * 0.03}s` }}>
                <button onClick={() => handleToggleTask(task)} className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0 ${isCompleted ? 'bg-gradient-to-br from-[#e94560] to-[#533483] border-transparent' : 'border-text-secondary/50 hover:border-[#e94560] hover:shadow-[0_0_8px_rgba(233,69,96,0.3)]'}`}>
                  {isCompleted && <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7L6 10L11 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </button>
                <span className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: list.color }} />
                <span className={`flex-1 text-sm transition-all ${isCompleted ? 'line-through text-text-inactive' : 'text-text-primary'}`}>{task.title}</span>
                {task.dueDate && <span className="text-[10px] text-text-muted">📅 {task.dueDate.slice(5)}</span>}
                <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ color: list.color, borderColor: `${list.color}40`, backgroundColor: `${list.color}10` }}>{list.label}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${priority.bg} ${priority.text} ${priority.border}`}>{priority.label}</span>
                <button onClick={() => handleToggleStar(task)} className={`text-lg transition-all flex-shrink-0 ${task.starred ? 'text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.5)]' : 'text-text-inactive hover:text-amber-400/60'}`}>{task.starred ? '★' : '☆'}</button>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-text-secondary font-semibold">작업이 없습니다</p>
            <p className="text-text-muted text-sm mt-1">My Day에서 작업을 추가해보세요</p>
          </div>
        )}
      </div>
    </div>
  );
}
