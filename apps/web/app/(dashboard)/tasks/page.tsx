'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import { addTask as addTaskDB, updateTask, deleteTask as deleteTaskDB, type TaskData, type ListData } from '@/lib/firestore';
import { useTaskReminders } from '@/lib/use-reminders';
import { deleteAttachmentsFromStorage } from '@/lib/attachment-store';
import { useDataStore } from '@/lib/data-store';
import NoahAIPageActions from '@/components/ai/NoahAIPageActions';
import type { NoahAIAction } from '@/lib/noah-ai-context';
import TaskDetailPanel from '@/components/task/TaskDetailPanel';

const DEFAULT_LISTS: ListData[] = [
  { id: 'my-tasks', label: 'My Tasks', color: '#e94560' },
];

function priorityStyle(p: string) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    urgent: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' },
    high: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
    medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' },
    low: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' },
  };
  return map[p] || map.medium;
}

function parseTags(title: string): string[] {
  return [...title.matchAll(/@([\w가-힣]+)/g)].map((m) => m[1]);
}

function TasksContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const { tasks: storeTasks, lists: storeLists, notes: storeNotes, loading } = useDataStore();
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [lists, setLists] = useState<ListData[]>(DEFAULT_LISTS);
  const [filterList, setFilterList] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskData['priority']>('medium');
  const [newTaskList, setNewTaskList] = useState('');
  const [adding, setAdding] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);

  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const savingOrder = useRef(false);
  const touchDragSrcRef = useRef<number | null>(null);
  const touchDragOverRef = useRef<number | null>(null);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  useTaskReminders(tasks);

  const statusLabels: Record<string, { label: string; color: string }> = {
    todo: { label: t('status.todo'), color: '#94a3b8' },
    in_progress: { label: t('status.inProgress'), color: '#8b5cf6' },
    completed: { label: t('status.completed'), color: '#22c55e' },
  };

  useEffect(() => {
    const listParam = searchParams.get('list');
    if (listParam) setFilterList(listParam);
  }, [searchParams]);

  // 스토어 → 로컬 tasks (정렬 유지)
  useEffect(() => {
    if (savingOrder.current) return;
    const sorted = [...storeTasks].sort((a, b) => {
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      if (a.order !== undefined) return -1;
      if (b.order !== undefined) return 1;
      return 0;
    });
    setTasks(sorted.map((t, i) => ({ ...t, order: t.order ?? (i + 1) * 1000 })));
  }, [storeTasks]);

  // 스토어 → 로컬 lists
  useEffect(() => {
    if (storeLists.length > 0) {
      setLists(storeLists);
      if (!newTaskList) setNewTaskList(storeLists[0].id!);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeLists]);

  const filtered = tasks
    .filter((t) => !filterList || t.listId === filterList)
    .filter((t) => !filterStatus || t.status === filterStatus)
    .filter((t) => !filterTag || (t.tags ?? []).includes(filterTag))
    .filter((t) => !searchQuery || t.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const activeTasks = filtered.filter((t) => t.status !== 'completed');
  const completedTasks = filtered.filter((t) => t.status === 'completed');

  const allTags = [...new Set(tasks.flatMap((t) => t.tags ?? []))].filter(Boolean);
  const canDrag = !filterList && !filterStatus && !filterTag && !searchQuery;

  const relatedNotes = storeNotes.map((n) => ({ id: n.id!, title: n.title, icon: n.icon, tags: n.tags }));
  const tagRelatedNotes = filterTag
    ? relatedNotes.filter((n) => n.tags.includes(filterTag) || n.title.toLowerCase().includes(filterTag.toLowerCase()))
    : [];

  const getListInfo = (listId: string) => lists.find((l) => l.id === listId) || lists[0];

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

  // 터치 드래그 (모바일)
  const handleTouchDragStart = (idx: number) => {
    if (!canDrag) return;
    touchDragSrcRef.current = idx;
    setDragSrcIdx(idx);
  };

  const handleTouchDragMove = (e: React.TouchEvent, listEl: HTMLElement) => {
    if (touchDragSrcRef.current === null) return;
    e.preventDefault();
    const touch = e.touches[0];
    const items = listEl.querySelectorAll('[data-task-index]');
    let targetIdx: number | null = null;
    items.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        targetIdx = parseInt((el as HTMLElement).dataset.taskIndex ?? '-1');
      }
    });
    if (targetIdx !== null && targetIdx !== touchDragSrcRef.current) {
      touchDragOverRef.current = targetIdx;
      setDragOverIdx(targetIdx);
    }
  };

  const handleTouchDragEnd = async () => {
    const src = touchDragSrcRef.current;
    const dst = touchDragOverRef.current;
    touchDragSrcRef.current = null;
    touchDragOverRef.current = null;
    setDragSrcIdx(null);
    setDragOverIdx(null);
    if (src === null || dst === null || src === dst || savingOrder.current) return;
    const newTasks = [...filtered];
    const [moved] = newTasks.splice(src, 1);
    newTasks.splice(dst, 0, moved);
    const withOrder = newTasks.map((t, i) => ({ ...t, order: (i + 1) * 1000 }));
    setTasks(withOrder);
    if (user) {
      savingOrder.current = true;
      try {
        await Promise.all(withOrder.map((t) => updateTask(user.uid, t.id!, { order: t.order! })));
      } finally {
        savingOrder.current = false;
      }
    }
  };

  const handleDrop = async (e: React.DragEvent, dstIdx: number) => {
    e.preventDefault();
    const srcIdx = dragSrcIdx;
    handleDragEnd();
    if (srcIdx === null || srcIdx === dstIdx || savingOrder.current) return;

    const newTasks = [...filtered];
    const [moved] = newTasks.splice(srcIdx, 1);
    newTasks.splice(dstIdx, 0, moved);

    const withOrder = newTasks.map((t, i) => ({ ...t, order: (i + 1) * 1000 }));
    setTasks(withOrder);

    if (user) {
      savingOrder.current = true;
      try {
        await Promise.all(withOrder.map((t) => updateTask(user.uid, t.id!, { order: t.order! })));
      } finally {
        savingOrder.current = false;
      }
    }
  };

  const handleToggleTask = async (task: TaskData) => {
    if (!user || !task.id) return;
    const newStatus = task.status === 'completed' ? 'todo' : 'completed';
    await updateTask(user.uid, task.id, { status: newStatus });
  };

  const handleToggleStar = async (task: TaskData) => {
    if (!user || !task.id) return;
    await updateTask(user.uid, task.id, { starred: !task.starred });
  };

  const handleDeleteTask = async (task: TaskData) => {
    if (!user || !task.id) return;
    if (selectedTaskId === task.id) setSelectedTaskId(null);
    await deleteAttachmentsFromStorage(task.attachments ?? []);
    await deleteTaskDB(user.uid, task.id);
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
        myDay: false, tags, order: maxOrder + 1000,
        createdDate: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(),
      });
    } catch { /* ignore */ } finally {
      setAdding(false);
    }
  };

  const handlePanelUpdate = async (updates: Partial<TaskData>) => {
    if (!user || !selectedTaskId) return;
    const finalUpdates = { ...updates };
    if (updates.title !== undefined) finalUpdates.tags = parseTags(updates.title);
    await updateTask(user.uid, selectedTaskId, finalUpdates);
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">📋</span>
            <h2 className="text-3xl font-extrabold text-text-primary">{t('tasks.title')}</h2>
            <span className="text-sm text-text-muted ml-2">{filtered.length}</span>
            <div className="ml-auto">
              <NoahAIPageActions
                actions={[
                  { id: 'prioritize', label: '우선순위 분석', icon: '🎯', action: 'prioritize' as NoahAIAction, description: '작업 우선순위 AI 분석' },
                  { id: 'suggest', label: '작업 제안', icon: '💡', action: 'suggest_tasks' as NoahAIAction, description: '새로운 작업 추천' },
                  { id: 'schedule', label: '일정 최적화', icon: '📅', action: 'schedule' as NoahAIAction, description: '작업 일정 자동 배분' },
                  { id: 'breakdown', label: '작업 분해', icon: '📋', action: 'breakdown' as NoahAIAction, description: '작업을 세부 단위로 분해' },
                ]}
                getContext={(action) => {
                  const taskSummaries = tasks.slice(0, 20).map((t) => ({
                    id: t.id, title: t.title, status: t.status,
                    priority: t.priority, dueDate: t.dueDate || null,
                  }));
                  if (action === 'breakdown') {
                    const target = tasks.find((t) => t.starred && t.status !== 'completed')
                      || tasks.find((t) => t.status !== 'completed');
                    return { task: target ? { title: target.title, memo: target.memo } : {} };
                  }
                  return { tasks: taskSummaries };
                }}
              />
            </div>
          </div>
          <p className="text-text-secondary text-sm">{t('tasks.desc')}</p>
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

        {/* Search */}
        <div className="mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('tasks.search')}
            className="w-full px-4 py-3 bg-background-card border border-border rounded-xl text-text-primary placeholder-text-muted text-sm focus:outline-none focus:border-[#e94560] transition-colors"
          />
        </div>

        {/* Filters */}
        <div className="mb-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">{t('tasks.list')}</span>
            <button onClick={() => setFilterList(null)} className={`px-2.5 py-1 rounded-lg text-xs transition-all ${!filterList ? 'bg-[#e94560]/20 text-[#e94560]' : 'text-text-secondary hover:bg-background-card'}`}>{t('common.all')}</button>
            {lists.map((list) => (
              <button key={list.id} onClick={() => setFilterList(filterList === list.id! ? null : list.id!)} className={`px-2.5 py-1 rounded-lg text-xs transition-all flex items-center gap-1.5 ${filterList === list.id ? '' : 'text-text-secondary hover:bg-background-card'}`} style={filterList === list.id ? { color: list.color } : undefined}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: list.color }} />{list.label}
              </button>
            ))}
          </div>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">{t('tasks.status')}</span>
            {Object.entries(statusLabels).map(([key, val]) => (
              <button key={key} onClick={() => setFilterStatus(filterStatus === key ? null : key)} className={`px-2.5 py-1 rounded-lg text-xs transition-all ${filterStatus === key ? '' : 'text-text-secondary hover:bg-background-card'}`} style={filterStatus === key ? { color: val.color } : undefined}>{val.label}</button>
            ))}
          </div>
        </div>

        {/* @Tags */}
        {allTags.length > 0 && (
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-text-muted uppercase tracking-wider">{t('tasks.tags')}</span>
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

        {/* Drag hint */}
        {canDrag && filtered.length > 1 && (
          <p className="text-[10px] text-text-inactive mb-2 flex items-center gap-1">
            <span>⋮⋮</span>
            <span>{t('tasks.dragHint')}</span>
          </p>
        )}

        {/* Active Task List */}
        <div
          className="space-y-2"
          onTouchMove={canDrag ? (e) => handleTouchDragMove(e, e.currentTarget) : undefined}
          onTouchEnd={canDrag ? handleTouchDragEnd : undefined}
        >
          {activeTasks.map((task, index) => {
            const ps = priorityStyle(task.priority);
            const list = getListInfo(task.listId);
            const isSelected = selectedTaskId === task.id;
            const isDragging = dragSrcIdx === index;
            const isDragOver = dragOverIdx === index;
            const taskTags = task.tags ?? [];

            return (
              <div
                key={task.id}
                data-task-index={index}
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
                style={{ animation: isDragOver ? undefined : 'fadeUp 0.4s ease-out both', animationDelay: `${index * 0.03}s` }}
              >
                {canDrag && (
                  <span
                    className="opacity-60 md:opacity-0 group-hover:opacity-100 text-text-inactive text-xs cursor-grab active:cursor-grabbing flex-shrink-0 select-none touch-none"
                    title={t('tasks.dragReorder')}
                    onTouchStart={(e) => { e.stopPropagation(); handleTouchDragStart(index); }}
                  >
                    ⋮⋮
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleToggleTask(task); }}
                  className="w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-300 flex-shrink-0 hover:border-[#e94560] hover:shadow-[0_0_8px_rgba(233,69,96,0.3)]"
                  style={{ borderColor: 'var(--color-checkbox-border)' }}
                />
                <span className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: list.color }} />
                <div className="flex-1 min-w-0">
                  <span className="block text-sm text-text-primary">{task.title}</span>
                  {taskTags.length > 0 && (
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      {taskTags.map((tag) => (
                        <button key={tag} onClick={(e) => { e.stopPropagation(); setFilterTag(filterTag === tag ? null : tag); }} className="text-[9px] px-1.5 py-0.5 rounded bg-[#8b5cf6]/10 text-[#8b5cf6] font-semibold hover:bg-[#8b5cf6]/20 transition-colors">@{tag}</button>
                      ))}
                    </div>
                  )}
                </div>
                {(task.subTasks?.length ?? 0) > 0 && (
                  <span className="text-[10px] text-text-muted flex-shrink-0">📋 {task.subTasks!.filter(s => s.completed).length}/{task.subTasks!.length}</span>
                )}
                {task.dueDate && <span className="text-[10px] text-text-muted flex-shrink-0">📅 {task.dueDate.slice(5)}</span>}
                <span className="text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0" style={{ color: list.color, borderColor: `${list.color}40`, backgroundColor: `${list.color}10` }}>{list.label}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 ${ps.bg} ${ps.text} ${ps.border}`}>{t(`priority.${task.priority}`)}</span>
                <button onClick={(e) => { e.stopPropagation(); handleToggleStar(task); }} className={`text-lg transition-all flex-shrink-0 ${task.starred ? 'text-amber-400' : 'text-text-inactive hover:text-amber-400/60'}`}>{task.starred ? '★' : '☆'}</button>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteTask(task); }} className="opacity-0 group-hover:opacity-100 text-text-inactive hover:text-[#e94560] transition-all text-lg flex-shrink-0" title={t('common.delete')}>×</button>
              </div>
            );
          })}
        </div>

        {activeTasks.length === 0 && completedTasks.length === 0 && (
          <div className="text-center py-16">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-text-secondary font-semibold">{filterTag ? `@${filterTag} ${t('tasks.emptyTag')}` : t('tasks.empty')}</p>
            <p className="text-text-muted text-sm mt-1">{t('tasks.emptyHint')}</p>
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
                  const ps = priorityStyle(task.priority);
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
                      {task.dueDate && <span className="text-[10px] text-text-muted flex-shrink-0">📅 {task.dueDate.slice(5)}</span>}
                      <span className="text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0" style={{ color: list.color, borderColor: `${list.color}40`, backgroundColor: `${list.color}10` }}>{list.label}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex-shrink-0 ${ps.bg} ${ps.text} ${ps.border}`}>{t(`priority.${task.priority}`)}</span>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteTask(task); }} className="opacity-0 group-hover:opacity-100 text-text-inactive hover:text-[#e94560] transition-all text-lg flex-shrink-0" title={t('common.delete')}>×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tag related notes */}
        {filterTag && tagRelatedNotes.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">📝</span>
              <span className="text-xs font-bold text-text-primary">@{filterTag} {t('tasks.relatedNotes')}</span>
              <span className="text-[10px] text-text-muted">{tagRelatedNotes.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {tagRelatedNotes.map((note) => (
                <div key={note.id} className="p-3 bg-background-card border border-border rounded-xl hover:border-[#8b5cf6]/40 transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{note.icon}</span>
                    <span className="text-xs font-semibold text-text-primary truncate">{note.title}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {note.tags.map((t) => (<span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-[#8b5cf6]/10 text-[#8b5cf6]">@{t}</span>))}
                  </div>
                </div>
              ))}
            </div>
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

export default function AllTasksPage() {
  return (
    <Suspense fallback={
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <TasksContent />
    </Suspense>
  );
}
