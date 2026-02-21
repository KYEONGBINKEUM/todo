'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useI18n } from '@/lib/i18n-context';
import { addList, updateList, deleteList, getUserSettings, getStorageLimit, type ListData, type Plan } from '@/lib/firestore';
import { useDataStore } from '@/lib/data-store';
import SettingsModal from '@/components/settings/SettingsModal';

const LIST_COLORS = ['#e94560', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899'];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const { lists: storeLists, storageUsed } = useDataStore();
  const [lists, setLists] = useState<ListData[]>([]);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [showAddList, setShowAddList] = useState(false);
  const [newListLabel, setNewListLabel] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [userPlan, setUserPlan] = useState<Plan>('free');

  const NAV_ITEMS = [
    { icon: '☀️', labelKey: 'nav.myDay', href: '/my-day' },
    { icon: '📋', labelKey: 'nav.allTasks', href: '/tasks' },
    { icon: '📅', labelKey: 'nav.upcoming', href: '/upcoming' },
    { icon: '📝', labelKey: 'nav.notes', href: '/notes' },
    // { icon: '👥', labelKey: 'nav.shared', href: '/shared' }, // TODO: Firestore 권한 규칙 수정 후 부활
    { icon: '⭐', labelKey: 'nav.important', href: '/important' },
  ];

  const THEME_OPTIONS = [
    { value: 'system' as const, icon: '🖥', labelKey: 'nav.themeSystem' },
    { value: 'light' as const, icon: '☀️', labelKey: 'nav.themeLight' },
    { value: 'dark' as const, icon: '🌙', labelKey: 'nav.themeDark' },
  ];

  // storeLists(onSnapshot)로 목록 동기화 — getDocs 호출 제거
  useEffect(() => {
    setLists(storeLists);
  }, [storeLists]);

  // 요금제 정보 — 세션당 1회만 조회
  useEffect(() => {
    if (!user) return;
    getUserSettings(user.uid)
      .then((s) => { setUserPlan(s.plan || 'free'); })
      .catch(() => {});
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const handleDeleteList = async (listId: string) => {
    setLists((prev) => prev.filter((l) => l.id !== listId));
    try {
      await deleteList(user!.uid, listId);
    } catch (err) {
      console.error('Failed to delete list:', err);
    }
  };

  const handleRenameList = async (listId: string) => {
    if (!user || !editingLabel.trim()) { setEditingListId(null); return; }
    setLists((prev) => prev.map((l) => l.id === listId ? { ...l, label: editingLabel.trim() } : l));
    setEditingListId(null);
    try {
      await updateList(user.uid, listId, { label: editingLabel.trim() });
    } catch (err) {
      console.error('Failed to rename list:', err);
    }
  };

  const handleAddList = async () => {
    if (!user || !newListLabel.trim()) { setShowAddList(false); return; }
    const color = LIST_COLORS[lists.length % LIST_COLORS.length];
    const label = newListLabel.trim();
    setNewListLabel('');
    setShowAddList(false);
    try {
      await addList(user.uid, { label, color });
      // onSnapshot이 storeLists를 갱신 → useEffect가 local lists를 자동 동기화
    } catch (err) {
      console.error('Failed to add list:', err);
    }
  };

  const displayName = user?.displayName || '사용자';
  const photoURL = user?.photoURL;
  const initials = displayName.charAt(0).toUpperCase();
  const planLabel = userPlan === 'free' ? t('freePlan') : userPlan === 'pro' ? 'Pro Plan' : 'Team Plan';

  const storageLimit = getStorageLimit(userPlan);
  const storagePercent = Math.min(100, (storageUsed / storageLimit) * 100);
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <>
      {/* 모바일 오버레이 배경 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`
        w-64 border-r border-border bg-background p-6 flex flex-col flex-shrink-0
        fixed top-0 left-0 h-full z-50
        md:static md:h-full md:z-auto
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="mb-8">
          <Link href="/my-day">
            <h1 className="text-xl font-extrabold bg-gradient-to-r from-text-primary to-[#e94560] bg-clip-text text-transparent">
              AI Todo
            </h1>
          </Link>
          <p className="text-[10px] text-text-muted mt-1 uppercase tracking-widest">
            Digital Assistant
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-shrink-0 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href === '/tasks' && pathname?.startsWith('/tasks'));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-[#e94560]/10 text-[#e94560] font-semibold'
                    : 'text-text-secondary hover:bg-background-card hover:text-text-primary'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1 text-left">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        {/* Lists — flex-1 + min-h-0으로 독립 스크롤 */}
        <div className="mt-4 flex-1 min-h-0 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-text-muted uppercase tracking-widest font-semibold">
              {t('nav.lists')}
            </span>
            <button
              onClick={() => setShowAddList(!showAddList)}
              className="text-text-inactive hover:text-[#e94560] transition-colors text-sm"
              title={t('common.add')}
            >
              +
            </button>
          </div>
          <div className="space-y-1">
            {lists.map((list) => (
              <div
                key={list.id}
                className="group w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-background-card hover:text-text-primary transition-all"
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: list.color }}
                />
                {editingListId === list.id ? (
                  <input
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onBlur={() => handleRenameList(list.id!)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRenameList(list.id!); if (e.key === 'Escape') setEditingListId(null); }}
                    autoFocus
                    className="flex-1 bg-transparent text-text-primary text-sm outline-none border-b border-[#e94560]"
                  />
                ) : (
                  <>
                    <Link
                      href={`/tasks?list=${list.id}`}
                      className="flex-1 cursor-pointer truncate"
                    >
                      {list.label}
                    </Link>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={(e) => { e.preventDefault(); setEditingListId(list.id!); setEditingLabel(list.label); }}
                        className="w-5 h-5 flex items-center justify-center text-text-inactive hover:text-text-secondary transition-colors text-[11px]"
                        title="이름 변경"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={(e) => { e.preventDefault(); handleDeleteList(list.id!); }}
                        className="w-5 h-5 flex items-center justify-center text-text-inactive hover:text-[#e94560] transition-colors text-sm"
                        title="목록 삭제"
                      >
                        ×
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {showAddList && (
              <div className="flex items-center gap-2 px-3 py-1.5">
                <span className="w-3 h-3 rounded-full flex-shrink-0 bg-[#e94560]" />
                <input
                  value={newListLabel}
                  onChange={(e) => setNewListLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddList(); if (e.key === 'Escape') setShowAddList(false); }}
                  onBlur={handleAddList}
                  placeholder="목록 이름..."
                  autoFocus
                  className="flex-1 bg-transparent text-text-primary text-sm placeholder-text-muted outline-none border-b border-[#e94560]"
                />
              </div>
            )}
          </div>
        </div>

        {/* Theme Toggle */}
        <div className="mt-6 pt-4 border-t border-border flex-shrink-0">
          <p className="text-[10px] text-text-muted uppercase tracking-widest font-semibold mb-2">{t('nav.theme')}</p>
          <div className="flex gap-1">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                title={t(opt.labelKey)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-xs transition-all ${
                  theme === opt.value
                    ? 'bg-[#e94560]/15 text-[#e94560] font-semibold'
                    : 'text-text-secondary hover:bg-background-card hover:text-text-primary'
                }`}
              >
                <span>{opt.icon}</span>
                <span className="text-[9px]">{t(opt.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* User / Settings */}
        <div className="mt-4 pt-4 border-t border-border flex-shrink-0">
          <div className="flex items-center gap-3 px-2">
            {photoURL ? (
              <img
                src={photoURL}
                alt={displayName}
                className="w-8 h-8 rounded-full flex-shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#e94560] to-[#533483] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {initials}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">{displayName}</p>
              <p className="text-[10px] text-text-muted">{planLabel}</p>
            </div>
            {/* Settings button */}
            <button
              onClick={() => setShowSettings(true)}
              className="text-text-inactive hover:text-text-secondary transition-colors flex-shrink-0"
              title={t('settings.title')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            {/* Sign out button */}
            <button
              onClick={handleSignOut}
              className="text-text-inactive hover:text-[#e94560] transition-colors text-xs flex-shrink-0"
              title="로그아웃"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
          {/* Storage usage bar */}
          <div className="mt-3 px-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-text-muted">
                {formatSize(storageUsed)} / {formatSize(storageLimit)}
              </span>
              <span className="text-[9px] text-text-inactive">{storagePercent.toFixed(0)}%</span>
            </div>
            <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  storagePercent > 90 ? 'bg-[#e94560]' : storagePercent > 70 ? 'bg-amber-500' : 'bg-gradient-to-r from-[#e94560] to-[#533483]'
                }`}
                style={{ width: `${storagePercent}%` }}
              />
            </div>
          </div>
        </div>
      </aside>

      {/* Settings Modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
