'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { getTasks, getLists, updateTask, type TaskData, type ListData } from '@/lib/firestore';

type DateGroup = 'overdue' | 'today' | 'tomorrow' | 'thisWeek' | 'thisMonth' | 'later';

function groupByDate(tasks: TaskData[]): Record<DateGroup, TaskData[]> {
  const groups: Record<string, TaskData[]> = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const task of tasks) {
    if (!task.dueDate) continue;
    const due = new Date(task.dueDate);
    due.setHours(0, 0, 0, 0);
    const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    let key: DateGroup;
    if (diff < 0) key = 'overdue';
    else if (diff === 0) key = 'today';
    else if (diff === 1) key = 'tomorrow';
    else if (diff <= 7) key = 'thisWeek';
    else if (diff <= 30) key = 'thisMonth';
    else key = 'later';

    if (!groups[key]) groups[key] = [];
    groups[key].push(task);
  }
  return groups as Record<DateGroup, TaskData[]>;
}

const sectionOrder: { key: DateGroup; icon: string; i18nKey: string }[] = [
  { key: 'overdue', icon: '⚠️', i18nKey: 'upcoming.overdue' },
  { key: 'today', icon: '📌', i18nKey: 'upcoming.today' },
  { key: 'tomorrow', icon: '🔜', i18nKey: 'upcoming.tomorrow' },
  { key: 'thisWeek', icon: '📅', i18nKey: 'upcoming.thisWeek' },
  { key: 'thisMonth', icon: '📆', i18nKey: 'upcoming.thisMonth' },
  { key: 'later', icon: '🗓️', i18nKey: 'upcoming.later' },
];

export default function UpcomingPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [lists, setLists] = useState<ListData[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const [fetchedTasks, fetchedLists] = await Promise.all([getTasks(user.uid), getLists(user.uid)]);
      setTasks(fetchedTasks.filter((t) => t.dueDate));
      setLists(fetchedLists);
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const grouped = groupByDate(tasks);

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
            <span className="text-3xl">📅</span>
            <h2 className="text-3xl font-extrabold text-text-primary">{t('upcoming.title')}</h2>
          </div>
          <p className="text-text-secondary text-sm">{t('upcoming.desc')}</p>
        </div>

        {sectionOrder.map((section) => {
          const sectionTasks = grouped[section.key];
          if (!sectionTasks || sectionTasks.length === 0) return null;
          const isOverdue = section.key === 'overdue';

          return (
            <div key={section.key} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <h3 className={`text-sm font-bold ${isOverdue ? 'text-red-400' : 'text-text-secondary'}`}>{section.icon} {t(section.i18nKey)}</h3>
                <span className="text-[10px] text-text-muted bg-border px-2 py-0.5 rounded-full">{sectionTasks.length}</span>
              </div>
              <div className="space-y-2">
                {sectionTasks.map((task, index) => {
                  const priority = task.priority;
                  const list = getListInfo(task.listId);
                  const isCompleted = task.status === 'completed';
                  return (
                    <div key={task.id} className={`group flex items-center gap-3 p-4 bg-background-card border rounded-xl hover:border-border-hover transition-all ${isOverdue && !isCompleted ? 'border-red-500/20' : isCompleted ? 'border-border/50 opacity-60' : 'border-border'}`} style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: `${index * 0.03}s` }}>
                      <button
                        onClick={() => handleToggleTask(task)}
                        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0 ${isCompleted ? 'bg-gradient-to-br from-[#e94560] to-[#533483] border-transparent scale-110' : 'hover:border-[#e94560] hover:shadow-[0_0_8px_rgba(233,69,96,0.3)]'}`}
                        style={isCompleted ? undefined : { borderColor: 'var(--color-checkbox-border)' }}
                      >
                        {isCompleted && <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7L6 10L11 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                      </button>
                      <span className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: list.color }} />
                      <span className={`flex-1 text-sm transition-all ${isCompleted ? 'line-through text-text-inactive' : 'text-text-primary'}`}>{task.title}</span>
                      <span className={`text-[10px] ${isOverdue ? 'text-red-400' : 'text-text-muted'}`}>{task.dueDate!.slice(5).replace('-', '/')}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${priorityStyle(priority).bg} ${priorityStyle(priority).text} ${priorityStyle(priority).border}`}>{t(`priority.${priority}`)}</span>
                      <button onClick={() => handleToggleStar(task)} className={`text-lg transition-all flex-shrink-0 ${task.starred ? 'text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.5)]' : 'text-text-inactive hover:text-amber-400/60'}`}>{task.starred ? '★' : '☆'}</button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {tasks.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-text-secondary font-semibold">{t('upcoming.empty')}</p>
            <p className="text-text-muted text-sm mt-1">{t('upcoming.emptyHint')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function priorityStyle(p: string) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    urgent: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
    high: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
    medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
    low: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  };
  return map[p] || map.medium;
}
