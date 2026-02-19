'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { getLists, addList, updateList, type ListData } from '@/lib/firestore';

const NAV_ITEMS = [
  { icon: '☀️', label: 'My Day', href: '/my-day' },
  { icon: '📋', label: '모든 작업', href: '/tasks' },
  { icon: '📅', label: '예정된 작업', href: '/upcoming' },
  { icon: '📝', label: '노트', href: '/notes' },
  { icon: '👥', label: '공유됨', href: '/shared' },
  { icon: '⭐', label: '중요', href: '/important' },
];

const LIST_COLORS = ['#e94560', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899'];

const THEME_OPTIONS = [
  { value: 'system', icon: '🖥', label: 'OS 기본' },
  { value: 'light',  icon: '☀️', label: '라이트' },
  { value: 'dark',   icon: '🌙', label: '다크' },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [lists, setLists] = useState<ListData[]>([]);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [showAddList, setShowAddList] = useState(false);
  const [newListLabel, setNewListLabel] = useState('');

  const loadLists = useCallback(async () => {
    if (!user) return;
    try {
      const fetched = await getLists(user.uid);
      setLists(fetched);
    } catch (err) {
      console.error('Failed to load lists:', err);
    }
  }, [user]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
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
    const tempId = `temp-${Date.now()}`;
    setLists((prev) => [...prev, { id: tempId, label: newListLabel.trim(), color }]);
    setNewListLabel('');
    setShowAddList(false);
    try {
      const realId = await addList(user.uid, { label: newListLabel.trim(), color });
      setLists((prev) => prev.map((l) => l.id === tempId ? { ...l, id: realId } : l));
    } catch (err) {
      console.error('Failed to add list:', err);
      setLists((prev) => prev.filter((l) => l.id !== tempId));
    }
  };

  const displayName = user?.displayName || '사용자';
  const photoURL = user?.photoURL;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <aside className="w-64 border-r border-border bg-background p-6 flex flex-col flex-shrink-0">
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
      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
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
              <span className="flex-1 text-left">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Lists */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-text-muted uppercase tracking-widest font-semibold">
            목록
          </span>
          <button
            onClick={() => setShowAddList(!showAddList)}
            className="text-text-inactive hover:text-[#e94560] transition-colors text-sm"
            title="목록 추가"
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
                <span
                  className="flex-1 cursor-pointer"
                  onDoubleClick={() => { setEditingListId(list.id!); setEditingLabel(list.label); }}
                  title="더블클릭으로 이름 변경"
                >
                  {list.label}
                </span>
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
      <div className="mt-6 pt-4 border-t border-border">
        <p className="text-[10px] text-text-muted uppercase tracking-widest font-semibold mb-2">테마</p>
        <div className="flex gap-1">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              title={opt.label}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-xs transition-all ${
                theme === opt.value
                  ? 'bg-[#e94560]/15 text-[#e94560] font-semibold'
                  : 'text-text-secondary hover:bg-background-card hover:text-text-primary'
              }`}
            >
              <span>{opt.icon}</span>
              <span className="text-[9px]">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* User / Settings */}
      <div className="mt-4 pt-4 border-t border-border">
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
            <p className="text-[10px] text-text-muted">Free Plan</p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-text-inactive hover:text-[#e94560] transition-colors text-xs flex-shrink-0"
            title="로그아웃"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
