'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getTasks, getLists, updateTask, type TaskData, type ListData } from '@/lib/firestore';

const priorityColors = {
  urgent: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', label: '긴급' },
  high: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30', label: '높음' },
  medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', label: '보통' },
  low: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', label: '낮음' },
};

export default function ImportantPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [lists, setLists] = useState<ListData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [fetchedTasks, fetchedLists] = await Promise.all([getTasks(user.uid), getLists(user.uid)]);
      setTasks(fetchedTasks.filter((t) => t.starred));
      setLists(fetchedLists);
    } catch (err) {
      console.error('Failed to load:', err);
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

  const handleUnstar = async (task: TaskData) => {
    if (!user || !task.id) return;
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    await updateTask(user.uid, task.id, { starred: false });
  };

  const getListInfo = (listId: string) => lists.find((l) => l.id === listId) || { label: 'Tasks', color: '#e94560' };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">⭐</span>
            <h2 className="text-3xl font-extrabold text-text-primary">중요</h2>
            <span className="text-sm text-text-muted ml-2">{tasks.length}개</span>
          </div>
          <p className="text-text-secondary text-sm">별표로 표시한 중요 작업 모음</p>
        </div>

        <div className="space-y-2">
          {tasks.map((task, index) => {
            const priority = priorityColors[task.priority];
            const list = getListInfo(task.listId);
            const isCompleted = task.status === 'completed';
            return (
              <div key={task.id} className={`group flex items-center gap-3 p-4 bg-background-card border rounded-xl hover:border-border-hover transition-all ${isCompleted ? 'border-border/50 opacity-60' : 'border-border'}`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: `${index * 0.05}s` }}>
                <button
                  onClick={() => handleToggleTask(task)}
                  className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0 ${isCompleted ? 'bg-gradient-to-br from-[#e94560] to-[#533483] border-transparent scale-110' : 'hover:border-[#e94560] hover:shadow-[0_0_8px_rgba(233,69,96,0.3)]'}`}
                  style={isCompleted ? undefined : { borderColor: 'var(--color-checkbox-border)' }}
                >
                  {isCompleted && <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7L6 10L11 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </button>
                <span className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: list.color }} />
                <span className={`flex-1 text-sm transition-all ${isCompleted ? 'line-through text-text-inactive' : 'text-text-primary'}`}>{task.title}</span>
                {task.dueDate && <span className="text-[10px] text-text-muted">📅 {task.dueDate.slice(5).replace('-', '/')}</span>}
                <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ color: list.color, borderColor: `${list.color}40`, backgroundColor: `${list.color}10` }}>{list.label}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${priority.bg} ${priority.text} ${priority.border}`}>{priority.label}</span>
                <button onClick={() => handleUnstar(task)} className="text-lg text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.5)] hover:text-amber-300 transition-all flex-shrink-0" title="중요 해제">★</button>
              </div>
            );
          })}
        </div>

        {tasks.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">⭐</div>
            <p className="text-text-secondary font-semibold">중요 작업이 없습니다</p>
            <p className="text-text-muted text-sm mt-1">작업에서 ☆를 클릭하여 중요 표시를 추가해보세요</p>
          </div>
        )}
      </div>
    </div>
  );
}
