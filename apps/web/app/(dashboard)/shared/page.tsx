'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n-context';
import {
  getSharedLists, createSharedList, deleteSharedList, updateSharedList,
  getSharedTasks, addSharedTask, updateSharedTask, deleteSharedTask,
  type SharedListData, type TaskData,
} from '@/lib/firestore';

const LIST_COLORS = ['#e94560', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899'];
const LIST_ICONS = ['📋', '🎨', '🛒', '📚', '💼', '🏠', '🎯', '🔬'];

const permissionLabels: Record<string, { label: string; color: string }> = {
  view: { label: '보기', color: '#64748b' },
  edit: { label: '편집', color: '#8b5cf6' },
  admin: { label: '관리자', color: '#e94560' },
};

export default function SharedPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [sharedLists, setSharedLists] = useState<SharedListData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [listTasks, setListTasks] = useState<TaskData[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showInviteForm, setShowInviteForm] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermission, setInvitePermission] = useState<'view' | 'edit'>('edit');

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      const lists = await getSharedLists(user.uid);
      setSharedLists(lists);
    } catch (err) {
      console.error('Failed to load shared lists:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadListTasks = useCallback(async (listId: string) => {
    try {
      const tasks = await getSharedTasks(listId);
      setListTasks(tasks);
    } catch (err) {
      console.error('Failed to load shared tasks:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedListId) loadListTasks(selectedListId);
  }, [selectedListId, loadListTasks]);

  const handleCreateList = async () => {
    if (!user || !newListName.trim()) return;
    const color = LIST_COLORS[sharedLists.length % LIST_COLORS.length];
    const icon = LIST_ICONS[sharedLists.length % LIST_ICONS.length];
    try {
      await createSharedList(user.uid, {
        name: newListName.trim(),
        color,
        icon,
        ownerName: user.displayName || '사용자',
        ownerEmail: user.email || '',
      });
      setNewListName('');
      setShowCreateForm(false);
      loadData();
    } catch (err) {
      console.error('Failed to create shared list:', err);
    }
  };

  const handleDeleteList = async (listId: string) => {
    if (!confirm('이 공유 목록을 삭제할까요?')) return;
    try {
      await deleteSharedList(listId);
      if (selectedListId === listId) setSelectedListId(null);
      loadData();
    } catch (err) {
      console.error('Failed to delete shared list:', err);
    }
  };

  const handleAddTask = async () => {
    if (!selectedListId || !newTaskTitle.trim()) return;
    try {
      await addSharedTask(selectedListId, {
        title: newTaskTitle.trim(),
        status: 'todo',
        priority: 'medium',
        starred: false,
        listId: selectedListId,
        myDay: false,
      });
      setNewTaskTitle('');
      loadListTasks(selectedListId);
    } catch (err) {
      console.error('Failed to add shared task:', err);
    }
  };

  const handleToggleTask = async (task: TaskData) => {
    if (!selectedListId || !task.id) return;
    const newStatus = task.status === 'completed' ? 'todo' : 'completed';
    setListTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: newStatus } : t));
    await updateSharedTask(selectedListId, task.id, { status: newStatus });
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!selectedListId) return;
    setListTasks((prev) => prev.filter((t) => t.id !== taskId));
    await deleteSharedTask(selectedListId, taskId);
  };

  const handleInvite = async () => {
    if (!showInviteForm || !inviteEmail.trim()) return;
    // In a real app, you'd look up the user by email.
    // For now, we add a placeholder member entry.
    try {
      const { inviteToSharedList } = await import('@/lib/firestore');
      await inviteToSharedList(showInviteForm, {
        uid: `invited-${Date.now()}`,
        email: inviteEmail.trim(),
        name: inviteEmail.split('@')[0],
        permission: invitePermission,
        joinedAt: new Date().toISOString(),
      });
      setInviteEmail('');
      setShowInviteForm(null);
      loadData();
    } catch (err) {
      console.error('Failed to invite:', err);
    }
  };

  const getUserPermission = (list: SharedListData) => {
    if (list.ownerUid === user?.uid) return 'admin';
    const member = list.members?.find((m) => m.uid === user?.uid);
    return member?.permission || 'view';
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const selectedList = sharedLists.find((l) => l.id === selectedListId);

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">👥</span>
            <h2 className="text-3xl font-extrabold text-text-primary">{t('shared.title')}</h2>
          </div>
          <p className="text-text-secondary text-sm">{t('shared.desc')}</p>
        </div>

        <div className="flex gap-6">
          {/* Left: Shared Lists */}
          <div className="w-80 flex-shrink-0">
            {/* Shared Lists */}
            <div className="space-y-3">
              {sharedLists.map((list, index) => {
                const perm = permissionLabels[getUserPermission(list)] || permissionLabels.view;
                const completedCount = 0; // Would need to track per-list
                const isSelected = selectedListId === list.id;

                return (
                  <div
                    key={list.id}
                    onClick={() => setSelectedListId(list.id!)}
                    className={`p-4 bg-background-card border rounded-xl transition-all cursor-pointer group ${
                      isSelected ? 'border-[#e94560]/40 shadow-[0_0_12px_rgba(233,69,96,0.1)]' : 'border-border hover:border-border-hover'
                    }`}
                    style={{ animation: 'fadeUp 0.4s ease-out both', animationDelay: `${index * 0.05}s` }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                        style={{ backgroundColor: `${list.color}20` }}
                      >
                        {list.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-bold text-text-primary truncate">{list.name}</h3>
                          <span
                            className="text-[9px] px-2 py-0.5 rounded-full font-semibold"
                            style={{ color: perm.color, backgroundColor: `${perm.color}20` }}
                          >
                            {perm.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-text-muted">
                          {list.ownerName} · {(list.members?.length ?? 0) + 1}명
                        </p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowInviteForm(list.id!); }}
                          className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-[#8b5cf6] text-xs"
                          title="초대"
                        >
                          ✉️
                        </button>
                        {list.ownerUid === user?.uid && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteList(list.id!); }}
                            className="w-6 h-6 flex items-center justify-center text-text-muted hover:text-[#e94560] text-xs"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Members */}
                    <div className="flex -space-x-2 mt-2">
                      <div
                        className="w-6 h-6 rounded-full border-2 border-background-card flex items-center justify-center text-[8px] font-bold text-white"
                        style={{ backgroundColor: list.color }}
                      >
                        {list.ownerName?.[0] || '?'}
                      </div>
                      {list.members?.slice(0, 3).map((member, i) => (
                        <div
                          key={i}
                          className="w-6 h-6 rounded-full border-2 border-background-card flex items-center justify-center text-[8px] font-bold text-white"
                          style={{ backgroundColor: ['#8b5cf6', '#06b6d4', '#22c55e'][i % 3] }}
                        >
                          {member.name?.[0] || '?'}
                        </div>
                      ))}
                      {(list.members?.length ?? 0) > 3 && (
                        <div className="w-6 h-6 rounded-full border-2 border-background-card bg-border flex items-center justify-center text-[8px] text-text-secondary">
                          +{(list.members?.length ?? 0) - 3}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Create new shared list */}
            {showCreateForm ? (
              <div className="mt-4 p-4 border border-border rounded-xl bg-background-card">
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateList()}
                  placeholder="공유 목록 이름..."
                  autoFocus
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-[#e94560] mb-2"
                />
                <div className="flex gap-2">
                  <button onClick={handleCreateList} className="flex-1 py-2 bg-[#e94560] text-white rounded-lg text-xs font-semibold hover:bg-[#ff5a7a]">
                    {t('common.add')}
                  </button>
                  <button onClick={() => setShowCreateForm(false)} className="px-3 py-2 text-text-muted text-xs">
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCreateForm(true)}
                className="mt-4 w-full p-4 border-2 border-dashed border-border rounded-xl text-center hover:border-[#e94560]/30 transition-colors cursor-pointer group"
              >
                <div className="text-2xl mb-1">✉️</div>
                <p className="text-sm font-semibold text-text-secondary group-hover:text-text-primary transition-colors">
                  {t('shared.newList')}
                </p>
              </button>
            )}

            {sharedLists.length === 0 && !showCreateForm && (
              <div className="mt-8 text-center">
                <div className="text-4xl mb-3">👥</div>
                <p className="text-text-secondary font-semibold">{t('shared.noLists')}</p>
                <p className="text-text-muted text-sm mt-1">{t('shared.createFirst')}</p>
              </div>
            )}
          </div>

          {/* Right: Selected List Tasks */}
          <div className="flex-1">
            {selectedList ? (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ backgroundColor: `${selectedList.color}20` }}>
                    {selectedList.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-text-primary">{selectedList.name}</h3>
                    <p className="text-xs text-text-muted">{listTasks.length}개 작업</p>
                  </div>
                </div>

                {/* Add task */}
                <div className="mb-4 flex gap-2">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                    placeholder="+ 새 작업 추가..."
                    className="flex-1 px-4 py-2.5 bg-background-card border border-border rounded-xl text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-[#e94560]"
                  />
                  <button onClick={handleAddTask} className="px-4 py-2.5 bg-[#e94560] text-white rounded-xl text-sm font-semibold hover:bg-[#ff5a7a]">
                    {t('common.add')}
                  </button>
                </div>

                {/* Tasks */}
                <div className="space-y-2">
                  {listTasks.map((task) => {
                    const isCompleted = task.status === 'completed';
                    return (
                      <div key={task.id} className="flex items-center gap-3 p-3 bg-background-card border border-border rounded-xl group hover:border-border-hover transition-all">
                        <button
                          onClick={() => handleToggleTask(task)}
                          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all flex-shrink-0 ${
                            isCompleted ? 'bg-gradient-to-br from-[#e94560] to-[#533483] border-transparent' : 'hover:border-[#e94560]'
                          }`}
                          style={isCompleted ? undefined : { borderColor: 'var(--color-checkbox-border)' }}
                        >
                          {isCompleted && (
                            <svg width="10" height="10" viewBox="0 0 14 14" fill="none"><path d="M3 7L6 10L11 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          )}
                        </button>
                        <span className={`flex-1 text-sm ${isCompleted ? 'line-through text-text-inactive' : 'text-text-primary'}`}>
                          {task.title}
                        </span>
                        <button
                          onClick={() => handleDeleteTask(task.id!)}
                          className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-[#e94560] text-sm transition-all"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>

                {listTasks.length === 0 && (
                  <div className="text-center py-12 text-text-muted text-sm">
                    작업이 없습니다. 새 작업을 추가해보세요.
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[300px]">
                <div className="text-center text-text-muted">
                  <div className="text-4xl mb-3">📋</div>
                  <p className="text-sm">목록을 선택하세요</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Invite Modal */}
        {showInviteForm && (
          <>
            <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setShowInviteForm(null)} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-96 bg-background-card border border-border rounded-2xl p-6 shadow-2xl" style={{ animation: 'fadeUp 0.2s ease-out' }}>
              <h3 className="text-sm font-bold text-text-primary mb-4">{t('shared.invite')}</h3>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                placeholder="이메일 주소..."
                autoFocus
                className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-[#e94560] mb-3"
              />
              <div className="flex gap-2 mb-4">
                {(['view', 'edit'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setInvitePermission(p)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-all ${
                      invitePermission === p ? 'border-[#e94560] bg-[#e94560]/10 text-[#e94560]' : 'border-border text-text-secondary'
                    }`}
                  >
                    {permissionLabels[p].label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={handleInvite} className="flex-1 py-2.5 bg-[#e94560] text-white rounded-xl text-sm font-semibold hover:bg-[#ff5a7a]">
                  초대 보내기
                </button>
                <button onClick={() => setShowInviteForm(null)} className="px-4 py-2.5 text-text-muted text-sm">
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
