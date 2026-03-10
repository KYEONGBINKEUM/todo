'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { FONT_SIZE_KEY } from '@/app/providers';
import { useI18n } from '@/lib/i18n-context';
import { updateUserSettings, getUserSettings, getStorageLimit, type Plan, type Language } from '@/lib/firestore';
import { useDataStore } from '@/lib/data-store';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error';

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
}

interface SettingsModalProps {
  onClose: () => void;
}

type Tab = 'account' | 'display' | 'language' | 'info';

function applyFontSize(size: number) {
  document.documentElement.style.fontSize = `${size}px`;
}

const LANGUAGES: { code: Language; name: string; flag: string }[] = [
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
];

const PLANS: { value: Plan; label: string; desc: string; color: string }[] = [
  { value: 'free', label: 'Free', desc: 'settings.freeDesc', color: '#64748b' },
  { value: 'pro', label: 'Pro', desc: 'settings.planFeatures.ai', color: '#e94560' },
];

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t, language, setLanguage } = useI18n();
  const { storageUsed } = useDataStore();
  const [activeTab, setActiveTab] = useState<Tab>('account');
  const [fontSize, setFontSizeState] = useState<number>(16);
  const [userPlan, setUserPlan] = useState<Plan>('free');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTauri, setIsTauri] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateVersion, setUpdateVersion] = useState('');
  const [currentVersion, setCurrentVersion] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateError, setUpdateError] = useState('');
  const [hideFutureTasks, setHideFutureTasksState] = useState(true);
  const [timeboxAlarmDefault, setTimeboxAlarmDefaultState] = useState(true);
  const [planCancelAtPeriodEnd, setPlanCancelAtPeriodEnd] = useState(false);
  const [planCurrentPeriodEnd, setPlanCurrentPeriodEnd] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  useEffect(() => {
    const isTauriApp = isTauriEnv();
    setIsTauri(isTauriApp);
    if (isTauriApp) {
      import('@tauri-apps/api/app').then(({ getVersion }) => {
        getVersion().then(setCurrentVersion).catch(() => {});
      });
      import('@tauri-apps/plugin-autostart').then(({ isEnabled }) => {
        isEnabled().then(setAutostart).catch(() => {});
      });
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    if (!isTauriEnv()) return;
    setUpdateStatus('checking');
    setUpdateError('');
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        setUpdateVersion(update.version);
        setUpdateStatus('available');
      } else {
        setUpdateStatus('up-to-date');
      }
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Update check failed');
      setUpdateStatus('error');
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!isTauriEnv()) return;
    setUpdateStatus('downloading');
    setDownloadProgress(0);
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) return;

      let downloaded = 0;
      let totalSize = 0;

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          totalSize = (event.data as { contentLength?: number }).contentLength || 0;
          downloaded = 0;
        } else if (event.event === 'Progress') {
          downloaded += (event.data as { chunkLength?: number }).chunkLength || 0;
          if (totalSize > 0) {
            setDownloadProgress(Math.min(100, Math.round((downloaded / totalSize) * 100)));
          } else {
            setDownloadProgress((prev) => Math.min(99, prev + 1));
          }
        } else if (event.event === 'Finished') {
          setDownloadProgress(100);
        }
      });

      setUpdateStatus('ready');
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Update download failed');
      setUpdateStatus('error');
    }
  }, []);

  const handleAutostartToggle = useCallback(async () => {
    setAutostartLoading(true);
    try {
      const { enable, disable } = await import('@tauri-apps/plugin-autostart');
      if (autostart) {
        await disable();
        setAutostart(false);
      } else {
        await enable();
        setAutostart(true);
      }
    } catch (err) {
      console.error('Autostart toggle failed:', err);
    } finally {
      setAutostartLoading(false);
    }
  }, [autostart]);

  const restartApp = useCallback(async () => {
    try {
      const core = await import('@tauri-apps/api/core');
      await core.invoke('plugin:updater|restart');
    } catch {
      // Fallback: reload the page
      window.location.reload();
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    // Apply localStorage font size first (instant, device-specific)
    const localFs = localStorage.getItem(FONT_SIZE_KEY);
    if (localFs) {
      const fs = Number(localFs);
      if (fs >= 10 && fs <= 24) { setFontSizeState(fs); applyFontSize(fs); }
    }
    getUserSettings(user.uid).then((s) => {
      const rawFs = s.fontSize ?? 16;
      // Migrate legacy string values
      const fs = typeof rawFs === 'string'
        ? (rawFs === 'small' ? 12 : rawFs === 'large' ? 16 : 16)
        : (rawFs as number);
      // Only apply Firestore value if no localStorage value (first time on this device)
      if (!localFs) {
        setFontSizeState(fs);
        applyFontSize(fs);
        localStorage.setItem(FONT_SIZE_KEY, String(fs));
      } else {
        setFontSizeState(Number(localFs));
      }
      setUserPlan(s.plan || 'free');
      setIsAdmin(s.isAdmin || false);
      setHideFutureTasksState(s.hideFutureTasks ?? true);
      setTimeboxAlarmDefaultState(s.timeboxAlarmDefault ?? true);
      setPlanCancelAtPeriodEnd(s.planCancelAtPeriodEnd || false);
      setPlanCurrentPeriodEnd(s.planCurrentPeriodEnd || null);
    });
  }, [user]);

  const storageLimit = getStorageLimit(userPlan);
  const storagePercent = Math.min(100, (storageUsed / storageLimit) * 100);
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const handleFontSize = (size: number) => {
    const clamped = Math.max(10, Math.min(24, size));
    setFontSizeState(clamped);
    applyFontSize(clamped);
    localStorage.setItem(FONT_SIZE_KEY, String(clamped));
    if (user) updateUserSettings(user.uid, { fontSize: clamped });
  };

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
  };

  const handleHideFutureTasks = (val: boolean) => {
    setHideFutureTasksState(val);
    if (user) updateUserSettings(user.uid, { hideFutureTasks: val });
  };

  const handleTimeboxAlarmDefault = (val: boolean) => {
    setTimeboxAlarmDefaultState(val);
    if (user) updateUserSettings(user.uid, { timeboxAlarmDefault: val });
  };

  const handlePlanChange = (plan: Plan) => {
    setUserPlan(plan);
    if (user) updateUserSettings(user.uid, { plan });
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'account', label: t('settings.account'), icon: '👤' },
    { id: 'display', label: t('settings.display'), icon: '🎨' },
    { id: 'language', label: t('settings.language'), icon: '🌐' },
    { id: 'info', label: t('settings.info'), icon: 'ℹ️' },
  ];

  const handleCancelSubscription = async () => {
    setCancelLoading(true);
    try {
      const cancel = httpsCallable<unknown, { success: boolean; periodEnd: string }>(functions, 'cancelPolarSubscription');
      const { data } = await cancel({});
      setPlanCancelAtPeriodEnd(true);
      setPlanCurrentPeriodEnd(data.periodEnd);
      setShowCancelModal(false);
    } catch (err) {
      console.error('Cancel error:', err);
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <>
      {/* Cancel Subscription Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCancelModal(false)} />
          <div className="relative z-10 w-full max-w-sm bg-background-card border border-border rounded-2xl shadow-2xl p-6">
            <h3 className="text-base font-bold text-text-primary mb-2">구독 취소</h3>
            <p className="text-[13px] text-text-secondary mb-1">
              구독을 취소하시겠습니까?
            </p>
            <p className="text-[12px] text-text-muted mb-6">
              현재 결제 기간이 끝날 때까지 Pro 기능을 계속 사용할 수 있으며, 이후 Free 플랜으로 자동 전환됩니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm border border-border hover:border-border-hover text-text-secondary transition-colors"
              >
                돌아가기
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={cancelLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {cancelLoading ? '처리 중...' : '구독 취소 확인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg bg-background-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          style={{ animation: 'fadeUp 0.2s ease-out' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="text-lg">⚙️</span>
              <h2 className="text-base font-bold text-text-primary">{t('settings.title')}</h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:text-text-primary hover:bg-border transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="flex">
            {/* Tab sidebar */}
            <div className="w-32 border-r border-border py-4 flex-shrink-0">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2 transition-colors ${
                    activeTab === tab.id
                      ? 'text-[#e94560] bg-[#e94560]/10'
                      : 'text-text-secondary hover:text-text-primary hover:bg-border/30'
                  }`}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 p-6 overflow-y-auto max-h-[60vh]">

              {/* ── 계정 탭 ── */}
              {activeTab === 'account' && (
                <div className="space-y-5">
                  {/* Profile */}
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">{t('settings.profile')}</p>
                    <div className="flex items-center gap-3 p-3 bg-background rounded-xl border border-border">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#e94560] to-[#533483] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {user?.email?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-primary truncate">
                          {user?.displayName || t('common.user')}
                        </p>
                        <p className="text-xs text-text-muted truncate">{user?.email}</p>
                      </div>
                    </div>
                  </div>

                  {/* Plan */}
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">{t('settings.plan')}</p>
                    <div className="p-4 bg-background rounded-xl border border-border">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="text-xs font-bold text-text-primary">
                            {userPlan === 'free' ? 'Free' : 'Pro'} {t('settings.plan.label')}
                          </span>
                          <p className="text-[11px] text-text-muted mt-0.5">
                            {t(PLANS.find(p => p.value === userPlan)?.desc || '')}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ color: PLANS.find(p => p.value === userPlan)?.color, backgroundColor: `${PLANS.find(p => p.value === userPlan)?.color}20` }}>
                          {t('settings.currentPlan')}
                        </span>
                      </div>
                      <div className="space-y-1.5 mb-4">
                        {[
                          { key: 'settings.planFeatures.tasks', included: true },
                          { key: 'settings.planFeatures.notes', included: true },
                          { key: 'settings.planFeatures.sync', included: true },
                          { key: 'settings.planFeatures.ai', included: userPlan !== 'free' },
                          { key: 'settings.planFeatures.storage', included: userPlan !== 'free' },
                        ].map((item) => (
                          <div key={item.key} className="flex items-center gap-2 text-[11px]">
                            <span className={item.included ? 'text-[#22c55e]' : 'text-text-inactive'}>
                              {item.included ? '✓' : '–'}
                            </span>
                            <span className={item.included ? 'text-text-secondary' : 'text-text-inactive'}>
                              {t(item.key)}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Admin: Plan selector */}
                      {isAdmin && (
                        <div className="mb-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs">🔧</span>
                            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">{t('settings.adminOnly')}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {PLANS.map((plan) => (
                              <button
                                key={plan.value}
                                onClick={() => handlePlanChange(plan.value)}
                                className={`p-2 rounded-lg border text-center transition-all ${
                                  userPlan === plan.value
                                    ? 'border-[#e94560] bg-[#e94560]/10'
                                    : 'border-border hover:border-border-hover'
                                }`}
                              >
                                <span className="text-xs font-bold block" style={{ color: plan.color }}>{plan.label}</span>
                                <span className="text-[9px] text-text-muted">{t(plan.desc)}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {!isAdmin && userPlan === 'free' && (
                        <button
                          onClick={async () => {
                            try {
                              const createCheckout = httpsCallable<unknown, { url: string }>(functions, 'createPolarCheckout');
                              const { data } = await createCheckout({});
                              const url = data.url;
                              if (!url) return;
                              if (isTauriEnv()) {
                                try {
                                  const { openUrl } = await import('@tauri-apps/plugin-opener');
                                  await openUrl(url);
                                } catch {
                                  try {
                                    const { open } = await import('@tauri-apps/plugin-shell');
                                    await open(url);
                                  } catch {
                                    window.open(url, '_blank');
                                  }
                                }
                              } else {
                                window.open(url, '_blank');
                              }
                            } catch (err) {
                              console.error('Checkout error:', err);
                            }
                          }}
                          className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-[#e94560] to-[#c94580] hover:opacity-90 transition-opacity"
                        >
                          {t('settings.upgrade')}
                        </button>
                      )}

                      {!isAdmin && userPlan !== 'free' && (
                        <div className="mt-2 space-y-2">
                          {/* Period end info */}
                          {planCurrentPeriodEnd && (
                            <div className={`flex items-center justify-between px-3 py-2 rounded-xl ${planCancelAtPeriodEnd ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-background-secondary'}`}>
                              <span className="text-[11px] text-text-muted">
                                {planCancelAtPeriodEnd ? '취소 예약 · 만료일' : '다음 결제일'}
                              </span>
                              <span className={`text-[11px] font-semibold ${planCancelAtPeriodEnd ? 'text-amber-400' : 'text-text-primary'}`}>
                                {new Date(planCurrentPeriodEnd).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                              </span>
                            </div>
                          )}

                          {/* Manage / Cancel / Reactivate buttons */}
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                try {
                                  const fn = httpsCallable<unknown, { url: string }>(functions, 'getPolarPortalUrl');
                                  const { data } = await fn({});
                                  window.open(data.url, '_blank');
                                } catch (err) {
                                  console.error('Portal error:', err);
                                }
                              }}
                              className="flex-1 py-2 rounded-xl text-[11px] text-text-muted border border-border hover:border-border-hover transition-all"
                            >
                              구독 관리
                            </button>
                            {planCancelAtPeriodEnd ? (
                              <button
                                onClick={async () => {
                                  try {
                                    const fn = httpsCallable(functions, 'reactivatePolarSubscription');
                                    await fn({});
                                    setPlanCancelAtPeriodEnd(false);
                                  } catch (err) {
                                    console.error('Reactivate error:', err);
                                  }
                                }}
                                className="flex-1 py-2 rounded-xl text-[11px] font-semibold text-[#e94560] border border-[#e94560]/40 hover:bg-[#e94560]/10 transition-all"
                              >
                                취소 철회
                              </button>
                            ) : (
                              <button
                                onClick={() => setShowCancelModal(true)}
                                className="flex-1 py-2 rounded-xl text-[11px] text-text-muted border border-border hover:border-red-500/50 hover:text-red-400 transition-all"
                              >
                                구독 취소
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Storage */}
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">{t('settings.storage')}</p>
                    <div className="p-4 bg-background rounded-xl border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-text-secondary">{t('settings.usage')}</span>
                        <span className="text-xs font-bold text-text-primary">
                          {formatSize(storageUsed)} / {formatSize(storageLimit)}
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-border rounded-full overflow-hidden mb-2">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            storagePercent > 90 ? 'bg-[#e94560]' : storagePercent > 70 ? 'bg-amber-500' : 'bg-gradient-to-r from-[#e94560] to-[#533483]'
                          }`}
                          style={{ width: `${storagePercent}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-text-muted">
                        {userPlan === 'free' ? `Free ${t('settings.plan.label')}: 100 MB` : `Pro ${t('settings.plan.label')}: 10 GB`}
                        {storagePercent > 90 && <span className="text-[#e94560] ml-1 font-semibold">— {t('settings.storageFull')}</span>}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 표시 탭 ── */}
              {activeTab === 'display' && (
                <div className="space-y-6">
                  {/* Theme */}
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">{t('nav.theme')}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'system' as const, label: t('nav.themeSystem'), icon: '🖥' },
                        { value: 'light' as const, label: t('nav.themeLight'), icon: '☀️' },
                        { value: 'dark' as const, label: t('nav.themeDark'), icon: '🌙' },
                      ].map((thm) => (
                        <button
                          key={thm.value}
                          onClick={() => setTheme(thm.value)}
                          className={`p-3 rounded-xl border text-center transition-all ${
                            theme === thm.value
                              ? 'border-[#e94560] bg-[#e94560]/10 text-[#e94560]'
                              : 'border-border text-text-secondary hover:border-border-hover'
                          }`}
                        >
                          <span className="text-xl block mb-1">{thm.icon}</span>
                          <span className="text-[11px] font-semibold">{thm.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font size */}
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">{t('settings.fontSize')}</p>
                    <div className="flex items-center justify-between p-3 bg-background rounded-xl border border-border">
                      <button
                        onClick={() => handleFontSize(fontSize - 1)}
                        disabled={fontSize <= 10}
                        className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-text-primary hover:bg-background-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all text-lg font-bold"
                      >
                        −
                      </button>
                      <div className="text-center">
                        <span className="text-lg font-bold text-text-primary">{fontSize}</span>
                        <span className="text-xs text-text-muted ml-1">px</span>
                      </div>
                      <button
                        onClick={() => handleFontSize(fontSize + 1)}
                        disabled={fontSize >= 24}
                        className="w-9 h-9 flex items-center justify-center rounded-lg border border-border text-text-primary hover:bg-background-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all text-lg font-bold"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-[11px] text-text-muted mt-2 text-center">
                      min: 10px · max: 24px
                    </p>
                  </div>

                  {/* Hide future tasks */}
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">{t('settings.behavior')}</p>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-background rounded-xl border border-border">
                        <div>
                          <p className="text-xs font-semibold text-text-primary">{t('settings.hideFutureTasks')}</p>
                          <p className="text-[11px] text-text-muted mt-0.5">{t('settings.hideFutureTasksDesc')}</p>
                        </div>
                        <button
                          onClick={() => handleHideFutureTasks(!hideFutureTasks)}
                          className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${hideFutureTasks ? 'bg-[#e94560]' : 'bg-border'}`}
                        >
                          <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${hideFutureTasks ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-background rounded-xl border border-border">
                        <div>
                          <p className="text-xs font-semibold text-text-primary">{t('settings.timeboxAlarmDefault')}</p>
                          <p className="text-[11px] text-text-muted mt-0.5">{t('settings.timeboxAlarmDefaultDesc')}</p>
                        </div>
                        <button
                          onClick={() => handleTimeboxAlarmDefault(!timeboxAlarmDefault)}
                          className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${timeboxAlarmDefault ? 'bg-[#e94560]' : 'bg-border'}`}
                        >
                          <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${timeboxAlarmDefault ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 언어 탭 ── */}
              {activeTab === 'language' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">{t('settings.language')}</p>
                    <div className="space-y-2">
                      {LANGUAGES.map((lang) => (
                        <button
                          key={lang.code}
                          onClick={() => handleLanguageChange(lang.code)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                            language === lang.code
                              ? 'border-[#e94560] bg-[#e94560]/10'
                              : 'border-border hover:border-border-hover'
                          }`}
                        >
                          <span className="text-xl">{lang.flag}</span>
                          <span className={`text-sm font-semibold ${language === lang.code ? 'text-[#e94560]' : 'text-text-primary'}`}>
                            {lang.name}
                          </span>
                          {language === lang.code && (
                            <span className="ml-auto text-[#e94560] text-sm">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── 정보 탭 ── */}
              {activeTab === 'info' && (
                <div className="space-y-4">
                  <div className="text-center py-4">
                    <img src="/symbol.svg" alt="NOAH" className="w-16 h-16 mx-auto mb-3 rounded-2xl" />
                    <h3 className="text-lg font-extrabold text-text-primary mb-1">NOAH</h3>
                    <p className="text-xs text-text-muted">{t('settings.version')} {currentVersion || '1.0.0'}{isTauri ? ' (Desktop)' : ' (Web)'}</p>
                  </div>

                  {/* 시작 프로그램 — Tauri 전용 */}
                  {isTauri && (
                    <div className="p-4 bg-background rounded-xl border border-border">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-text-primary">{t('settings.autostart')}</p>
                          <p className="text-[11px] text-text-muted mt-0.5">{t('settings.autostartDesc')}</p>
                        </div>
                        <button
                          onClick={handleAutostartToggle}
                          disabled={autostartLoading}
                          className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${autostart ? 'bg-[#e94560]' : 'bg-border'} disabled:opacity-50`}
                        >
                          <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${autostart ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 업데이트 섹션 — Tauri 전용 */}
                  {isTauri && (
                    <div className="p-4 bg-background rounded-xl border border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">{t('settings.softwareUpdate')}</span>
                      </div>

                      {updateStatus === 'idle' && (
                        <button
                          onClick={checkForUpdates}
                          className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold bg-[#e94560] hover:bg-[#d63b55] text-white transition-all"
                        >
                          {t('settings.checkUpdate')}
                        </button>
                      )}

                      {updateStatus === 'checking' && (
                        <div className="flex items-center justify-center gap-2 py-2.5">
                          <div className="w-4 h-4 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs text-text-secondary">{t('settings.checking')}</span>
                        </div>
                      )}

                      {updateStatus === 'up-to-date' && (
                        <div className="flex items-center justify-center gap-2 py-2.5">
                          <span className="text-[#22c55e] text-sm">✓</span>
                          <span className="text-xs text-text-secondary">{t('settings.upToDate')} {currentVersion ? `(v${currentVersion})` : ''}</span>
                        </div>
                      )}

                      {updateStatus === 'available' && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-[#f59e0b] text-sm">●</span>
                            <span className="text-xs text-text-primary font-semibold">v{updateVersion} {t('settings.updateAvailable')}</span>
                          </div>
                          <button
                            onClick={downloadAndInstall}
                            className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold bg-[#22c55e] hover:bg-[#16a34a] text-white transition-all"
                          >
                            {t('settings.updateNow')}
                          </button>
                        </div>
                      )}

                      {updateStatus === 'downloading' && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-text-secondary">
                            <span>{t('settings.downloading')}</span>
                            <span>{downloadProgress}%</span>
                          </div>
                          <div className="w-full h-2 bg-border rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#e94560] rounded-full transition-all duration-300"
                              style={{ width: `${downloadProgress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {updateStatus === 'ready' && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-[#22c55e] text-sm">✓</span>
                            <span className="text-xs text-text-primary">{t('settings.updateReady')}</span>
                          </div>
                          <button
                            onClick={restartApp}
                            className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold bg-[#8b5cf6] hover:bg-[#7c3aed] text-white transition-all"
                          >
                            {t('settings.restart')}
                          </button>
                        </div>
                      )}

                      {updateStatus === 'error' && (
                        <div className="space-y-2">
                          <p className="text-xs text-red-400 text-center">{updateError}</p>
                          <button
                            onClick={checkForUpdates}
                            className="w-full py-2 px-4 rounded-xl text-xs font-semibold border border-border hover:border-border-hover text-text-secondary transition-all"
                          >
                            {t('settings.retry')}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 p-3 bg-background rounded-xl border border-border text-[11px] text-text-muted text-center">
                    © 2026 NOAH
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
