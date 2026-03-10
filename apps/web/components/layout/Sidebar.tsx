'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useI18n } from '@/lib/i18n-context';
import { getUserSettings, getStorageLimit, type Plan } from '@/lib/firestore';
import { useDataStore } from '@/lib/data-store';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import SettingsModal from '@/components/settings/SettingsModal';

const DEFAULT_NAV = [
  { icon: '☀️', labelKey: 'nav.myDay', href: '/my-day' },
  { icon: '📋', labelKey: 'nav.allTasks', href: '/tasks' },
  { icon: '📅', labelKey: 'nav.upcoming', href: '/upcoming' },
  { icon: '🗓️', labelKey: 'nav.calendar', href: '/calendar' },
  { icon: '📝', labelKey: 'nav.notes', href: '/notes' },
  { icon: '⏱️', labelKey: 'nav.timebox', href: '/timebox' },
  { icon: '🧮', labelKey: 'nav.calculator', href: '/calculator' },
  { icon: '🌐', labelKey: 'nav.translate', href: '/translate' },
  { icon: '⭐', labelKey: 'nav.important', href: '/important' },
];

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
  const { storageUsed } = useDataStore();
  const [showSettings, setShowSettings] = useState(false);
  const [userPlan, setUserPlan] = useState<Plan>('free');
  const [hasUpdate, setHasUpdate] = useState(false);
  const [aiTokensUsed, setAiTokensUsed] = useState(0);
  const [aiTokenLimit, setAiTokenLimit] = useState(0);

  // Nav drag state
  const [navItems, setNavItems] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_NAV;
    try {
      const saved = localStorage.getItem('navOrder');
      if (!saved) return DEFAULT_NAV;
      const order: string[] = JSON.parse(saved);
      return [...DEFAULT_NAV].sort((a, b) => {
        const ai = order.indexOf(a.href);
        const bi = order.indexOf(b.href);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    } catch { return DEFAULT_NAV; }
  });
  const [dragNavSrc, setDragNavSrc] = useState<number | null>(null);
  const [dragNavOver, setDragNavOver] = useState<number | null>(null);
  const touchNavSrcRef = useRef<number | null>(null);
  const navItemRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Tauri: 앱 시작 시 백그라운드 업데이트 확인
  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
    if (!isTauri) return;

    const checkUpdate = async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (update) setHasUpdate(true);
      } catch {
        // 업데이트 확인 실패 — 무시
      }
    };
    // 3초 후 확인 (앱 로딩 완료 후)
    const timer = setTimeout(checkUpdate, 3000);
    return () => clearTimeout(timer);
  }, []);

  const saveNavOrder = (items: typeof DEFAULT_NAV) => {
    localStorage.setItem('navOrder', JSON.stringify(items.map(i => i.href)));
  };

  const handleNavDrop = (toIdx: number) => {
    setNavItems(prev => {
      if (dragNavSrc === null || dragNavSrc === toIdx) return prev;
      const next = [...prev];
      const [item] = next.splice(dragNavSrc, 1);
      next.splice(toIdx, 0, item);
      saveNavOrder(next);
      return next;
    });
    setDragNavSrc(null);
    setDragNavOver(null);
  };

  const handleNavTouchStart = (idx: number) => {
    touchNavSrcRef.current = idx;
    setDragNavSrc(idx);
  };

  const handleNavTouchMove = (e: React.TouchEvent) => {
    if (touchNavSrcRef.current === null) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const navEl = el?.closest('[data-nav-idx]');
    if (navEl) {
      const idx = parseInt(navEl.getAttribute('data-nav-idx') ?? '-1', 10);
      if (idx >= 0) setDragNavOver(idx);
    }
  };

  const handleNavTouchEnd = () => {
    if (touchNavSrcRef.current !== null && dragNavOver !== null) {
      handleNavDrop(dragNavOver);
    }
    touchNavSrcRef.current = null;
    setDragNavSrc(null);
    setDragNavOver(null);
  };

  const THEME_OPTIONS = [
    { value: 'system' as const, icon: '🖥', labelKey: 'nav.themeSystem' },
    { value: 'light' as const, icon: '☀️', labelKey: 'nav.themeLight' },
    { value: 'dark' as const, icon: '🌙', labelKey: 'nav.themeDark' },
  ];

  // 요금제 정보 — 세션당 1회만 조회
  useEffect(() => {
    if (!user) return;
    getUserSettings(user.uid).then((s) => {
      const plan = s.plan || 'free';
      setUserPlan(plan);
      const limits: Record<string, number> = { free: 0, pro: 500000, premium: 500000, team: 2000000 };
      setAiTokenLimit(limits[plan] || 0);
    }).catch(() => {});

    // AI 토큰 사용량 조회
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const db = getFirestore();
    getDoc(doc(db, `users/${user.uid}/ai_usage/${monthKey}`)).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setAiTokensUsed((d.totalInputTokens || 0) + (d.totalOutputTokens || 0));
      }
    }).catch(() => {});
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const displayName = user?.displayName || t('common.user');
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
        w-64 border-r border-border bg-background-sidebar p-6 flex flex-col flex-shrink-0
        fixed top-0 left-0 h-full z-50
        md:static md:h-full md:z-auto
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="mb-8">
          <Link href="/my-day" className="flex items-center">
            <img src="/logo.svg" alt="NOAH" className="h-8 dark:hidden" />
            <img src="/logo_w2.svg" alt="NOAH" className="h-8 hidden dark:block" />
          </Link>
        </div>

        {/* Navigation — draggable */}
        <nav
          className="flex-shrink-0 space-y-1"
          onTouchMove={handleNavTouchMove}
          onTouchEnd={handleNavTouchEnd}
        >
          {navItems.map((item, idx) => {
            const isActive = pathname === item.href || (item.href === '/tasks' && pathname?.startsWith('/tasks'));
            const isDragging = dragNavSrc === idx;
            const isOver = dragNavOver === idx && dragNavSrc !== idx;
            return (
              <div
                key={item.href}
                data-nav-idx={idx}
                ref={el => { navItemRefs.current[idx] = el; }}
                draggable
                onDragStart={e => { setDragNavSrc(idx); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={e => { e.preventDefault(); setDragNavOver(idx); }}
                onDrop={() => handleNavDrop(idx)}
                onDragEnd={() => { setDragNavSrc(null); setDragNavOver(null); }}
                onTouchStart={() => handleNavTouchStart(idx)}
                className={`transition-all ${isDragging ? 'opacity-40' : ''} ${isOver ? 'border-t-2 border-[#e94560]/60' : ''}`}
              >
                <Link
                  href={item.href}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all cursor-grab active:cursor-grabbing ${
                    isActive
                      ? 'bg-[#e94560]/10 text-[#e94560] font-semibold'
                      : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="flex-1 text-left">{t(item.labelKey)}</span>
                  <span className="text-text-muted/30 text-xs select-none">⠿</span>
                </Link>
              </div>
            );
          })}
        </nav>

        {/* spacer */}
        <div className="flex-1" />

        {/* Theme Toggle */}
        <div className="pt-4 border-t border-border flex-shrink-0">
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
                    : 'text-text-secondary hover:bg-background-hover hover:text-text-primary'
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
              className="relative text-text-inactive hover:text-text-secondary transition-colors flex-shrink-0"
              title={t('settings.title')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              {hasUpdate && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#e94560] rounded-full border border-surface" />
              )}
            </button>
            {/* Sign out button */}
            <button
              onClick={handleSignOut}
              className="text-text-inactive hover:text-[#e94560] transition-colors text-xs flex-shrink-0"
              title={t('sidebar.signOut')}
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

          {/* AI token usage bar (Pro+ only) */}
          {aiTokenLimit > 0 && (
            <div className="mt-2 px-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-text-muted">
                  AI {(aiTokensUsed / 1000).toFixed(0)}K / {(aiTokenLimit / 1000).toFixed(0)}K
                </span>
                <span className="text-[9px] text-text-inactive">
                  {Math.min(100, Math.round(aiTokensUsed / aiTokenLimit * 100))}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                {(() => {
                  const pct = Math.min(100, (aiTokensUsed / aiTokenLimit) * 100);
                  return (
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        pct > 90 ? 'bg-[#e94560]' : pct > 70 ? 'bg-amber-500' : 'bg-gradient-to-r from-[#533483] to-[#e94560]'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Settings Modal */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
