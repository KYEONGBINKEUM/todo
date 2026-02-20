'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { getTasks, getLists, addTask as addTaskDB, updateTask, type TaskData, type ListData } from '@/lib/firestore';

function priorityStyle(p: string) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    urgent: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
    high: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
    medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
    low: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  };
  return map[p] || map.medium;
}

export default function ImportantPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [lists, setLists] = useState<ListData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskData['priority']>('medium');
  const [newTaskList, setNewTaskList] = useState('');
  const [adding, setAdding] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [fetchedTasks, fetchedLists] = await Promise.all([getTasks(user.uid), getLists(user.uid)]);
      setTasks(fetchedTasks.filter((t) => t.starred));
      setLists(fetchedLists);
      if (fetchedLists.length > 0 && !newTaskList) setNewTaskList(fetchedLists[0].id!);
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !user || adding) return;
    setAdding(true);
    const title = newTaskTitle.trim();
    const tempId = `temp-${Date.now()}`;
    const newTask: Omit<TaskData, 'id' | 'createdAt' | 'updatedAt'> = {
      title, status: 'todo', priority: newTaskPriority,
      starred: true, listId: newTaskList || lists[0]?.id || '',
      myDay: false, tags: [],
    };
    setTasks((prev) => [{ ...newTask, id: tempId }, ...prev]);
    setNewTaskTitle('');
    try {
      const id = await addTaskDB(user.uid, newTask);
      setTasks((prev) => prev.map((t) => t.id === tempId ? { ...t, id } : t));
    } catch {
      setTasks((prev) => prev.filter((t) => t.id !== tempId));
    } finally {
      setAdding(false);
    }
  };

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
            <h2 className="text-3xl font-extrabold text-text-primary">{t('important.title')}</h2>
            <span className="text-sm text-text-muted ml-2">{tasks.length}</span>
          </div>
          <p className="text-text-secondary text-sm">{t('important.desc')}</p>
        </div>

        {/* Add Task */}
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

        {/* Active Tasks */}
        <div className="space-y-2">
          {tasks.filter((t) => t.status !== 'completed').map((task, index) => {
            const ps = priorityStyle(task.priority);
            const list = getListInfo(task.listId);
            return (
              <div key={task.id} className="group flex items-center gap-3 p-4 bg-background-card border border-border rounded-xl hover:border-border-hover transition-all" style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: `${index * 0.05}s` }}>
                <button
                  onClick={() => handleToggleTask(task)}
                  className="w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0 hover:border-[#e94560] hover:shadow-[0_0_8px_rgba(233,69,96,0.3)]"
                  style={{ borderColor: 'var(--color-checkbox-border)' }}
                />
                <span className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: list.color }} />
                <span className="flex-1 text-sm text-text-primary">{task.title}</span>
                {task.dueDate && <span className="text-[10px] text-text-muted">📅 {task.dueDate.slice(5).replace('-', '/')}</span>}
                <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ color: list.color, borderColor: `${list.color}40`, backgroundColor: `${list.color}10` }}>{list.label}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${ps.bg} ${ps.text} ${ps.border}`}>{t(`priority.${task.priority}`)}</span>
                <button onClick={() => handleUnstar(task)} className="text-lg text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.5)] hover:text-amber-300 transition-all flex-shrink-0" title={t('important.unstar')}>★</button>
              </div>
            );
          })}
        </div>

        {tasks.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">⭐</div>
            <p className="text-text-secondary font-semibold">{t('important.empty')}</p>
            <p className="text-text-muted text-sm mt-1">{t('important.emptyHint')}</p>
          </div>
        )}

        {/* 완료됨 Section */}
        {tasks.filter((t) => t.status === 'completed').length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center gap-2 text-text-muted text-sm mb-3 hover:text-text-secondary transition-colors w-full"
            >
              <span className={`transition-transform duration-200 text-xs ${showCompleted ? 'rotate-90' : ''}`}>▶</span>
              <span className="font-semibold">{t('status.completed')}</span>
              <span className="text-[10px] bg-border px-2 py-0.5 rounded-full">{tasks.filter((t) => t.status === 'completed').length}</span>
            </button>
            {showCompleted && (
              <div className="space-y-2">
                {tasks.filter((t) => t.status === 'completed').map((task, index) => {
                  const ps = priorityStyle(task.priority);
                  const list = getListInfo(task.listId);
                  return (
                    <div key={task.id} className="group flex items-center gap-3 p-4 bg-background-card border border-border/50 rounded-xl opacity-60 hover:opacity-80 transition-all" style={{ animation: 'fadeUp 0.3s ease-out both', animationDelay: `${index * 0.03}s` }}>
                      <button
                        onClick={() => handleToggleTask(task)}
                        className="w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0 bg-gradient-to-br from-[#e94560] to-[#533483] border-transparent"
                      >
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7L6 10L11 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                      <span className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: list.color }} />
                      <span className="flex-1 text-sm line-through text-text-inactive">{task.title}</span>
                      {task.dueDate && <span className="text-[10px] text-text-muted">📅 {task.dueDate.slice(5).replace('-', '/')}</span>}
                      <span className="text-[10px] px-2 py-0.5 rounded-full border" style={{ color: list.color, borderColor: `${list.color}40`, backgroundColor: `${list.color}10` }}>{list.label}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${ps.bg} ${ps.text} ${ps.border}`}>{t(`priority.${task.priority}`)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
