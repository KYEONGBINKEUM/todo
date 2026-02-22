'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useI18n } from '@/lib/i18n-context';
import { updateUserSettings, getUserSettings, getStorageLimit, type FontSize, type Plan, type Language } from '@/lib/firestore';
import { useDataStore } from '@/lib/data-store';

type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error';

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
}

interface SettingsModalProps {
  onClose: () => void;
}

type Tab = 'account' | 'display' | 'language' | 'info';

function applyFontSize(size: FontSize) {
  document.documentElement.setAttribute('data-font', size);
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
  { value: 'free', label: 'Free', desc: '기본 기능 무제한', color: '#64748b' },
  { value: 'pro', label: 'Pro', desc: 'AI + 10GB 스토리지', color: '#e94560' },
  { value: 'team', label: 'Team', desc: '무제한 협업 + 관리자 기능', color: '#8b5cf6' },
];

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { t, language, setLanguage } = useI18n();
  const { storageUsed } = useDataStore();
  const [activeTab, setActiveTab] = useState<Tab>('account');
  const [fontSize, setFontSizeState] = useState<FontSize>('medium');
  const [userPlan, setUserPlan] = useState<Plan>('free');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTauri, setIsTauri] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateVersion, setUpdateVersion] = useState('');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateError, setUpdateError] = useState('');

  useEffect(() => {
    setIsTauri(isTauriEnv());
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
      setUpdateError(err instanceof Error ? err.message : '업데이트 확인 실패');
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
      setUpdateError(err instanceof Error ? err.message : '업데이트 다운로드 실패');
      setUpdateStatus('error');
    }
  }, []);

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
    getUserSettings(user.uid).then((s) => {
      const fs = s.fontSize ?? 'medium';
      setFontSizeState(fs);
      applyFontSize(fs);
      setUserPlan(s.plan || 'free');
      setIsAdmin(s.isAdmin || false);
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

  const handleFontSize = (size: FontSize) => {
    setFontSizeState(size);
    applyFontSize(size);
    if (user) updateUserSettings(user.uid, { fontSize: size });
  };

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
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

  return (
    <>
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
                          {user?.displayName || '사용자'}
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
                            {userPlan === 'free' ? 'Free' : userPlan === 'pro' ? 'Pro' : 'Team'} 플랜
                          </span>
                          <p className="text-[11px] text-text-muted mt-0.5">
                            {PLANS.find(p => p.value === userPlan)?.desc}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ color: PLANS.find(p => p.value === userPlan)?.color, backgroundColor: `${PLANS.find(p => p.value === userPlan)?.color}20` }}>
                          {t('settings.currentPlan')}
                        </span>
                      </div>
                      <div className="space-y-1.5 mb-4">
                        {[
                          { label: '할일 목록 관리', included: true },
                          { label: '노트 작성', included: true },
                          { label: '기기 동기화', included: true },
                          { label: 'AI 자동 작성/요약', included: userPlan !== 'free' },
                          { label: '무제한 공유 협업', included: userPlan === 'team' },
                          { label: '파일 스토리지 10GB', included: userPlan !== 'free' },
                        ].map((item) => (
                          <div key={item.label} className="flex items-center gap-2 text-[11px]">
                            <span className={item.included ? 'text-[#22c55e]' : 'text-text-inactive'}>
                              {item.included ? '✓' : '–'}
                            </span>
                            <span className={item.included ? 'text-text-secondary' : 'text-text-inactive'}>
                              {item.label}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Admin: Plan selector */}
                      {isAdmin && (
                        <div className="mb-3 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs">🔧</span>
                            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">관리자 전용</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
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
                                <span className="text-[9px] text-text-muted">{plan.desc}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {!isAdmin && (
                        <button
                          className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-amber-500 to-red-500 opacity-70 cursor-not-allowed"
                          disabled
                        >
                          {t('settings.upgrade')} (준비 중)
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Storage */}
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">스토리지</p>
                    <div className="p-4 bg-background rounded-xl border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-text-secondary">사용량</span>
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
                        {userPlan === 'free' ? 'Free 플랜: 100 MB' : userPlan === 'pro' ? 'Pro 플랜: 10 GB' : 'Team 플랜: 50 GB'}
                        {storagePercent > 90 && <span className="text-[#e94560] ml-1 font-semibold">— 용량이 거의 찼습니다</span>}
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
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'small' as FontSize, label: t('settings.fontSmall'), preview: 'Aa', size: 'text-xs' },
                        { value: 'medium' as FontSize, label: t('settings.fontMedium'), preview: 'Aa', size: 'text-sm' },
                        { value: 'large' as FontSize, label: t('settings.fontLarge'), preview: 'Aa', size: 'text-base' },
                      ].map((f) => (
                        <button
                          key={f.value}
                          onClick={() => handleFontSize(f.value)}
                          className={`p-3 rounded-xl border text-center transition-all ${
                            fontSize === f.value
                              ? 'border-[#e94560] bg-[#e94560]/10 text-[#e94560]'
                              : 'border-border text-text-secondary hover:border-border-hover'
                          }`}
                        >
                          <span className={`${f.size} font-bold block mb-1`}>{f.preview}</span>
                          <span className="text-[11px] font-semibold">{f.label}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-text-muted mt-2">
                      현재: {fontSize === 'small' ? '12px' : fontSize === 'large' ? '16px' : '14px'}
                    </p>
                  </div>
                </div>
              )}

              {/* ── 언어 탭 ── */}
              {activeTab === 'language' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">{t('settings.language')}</p>
                    <p className="text-[11px] text-text-muted mb-4">
                      접속 지역 및 IP 주소에 따라 자동으로 언어가 감지됩니다. 수동으로 변경할 수도 있습니다.
                    </p>
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
                    <div className="text-4xl mb-3">✅</div>
                    <h3 className="text-lg font-extrabold text-text-primary mb-1">AI Todo</h3>
                    <p className="text-xs text-text-muted">버전 1.0.0{isTauri ? ' (Desktop)' : ' (Web)'}</p>
                  </div>

                  {/* 업데이트 섹션 — Tauri 전용 */}
                  {isTauri && (
                    <div className="p-4 bg-background rounded-xl border border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted">소프트웨어 업데이트</span>
                      </div>

                      {updateStatus === 'idle' && (
                        <button
                          onClick={checkForUpdates}
                          className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold bg-[#e94560] hover:bg-[#d63b55] text-white transition-all"
                        >
                          업데이트 확인
                        </button>
                      )}

                      {updateStatus === 'checking' && (
                        <div className="flex items-center justify-center gap-2 py-2.5">
                          <div className="w-4 h-4 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs text-text-secondary">업데이트 확인 중...</span>
                        </div>
                      )}

                      {updateStatus === 'up-to-date' && (
                        <div className="flex items-center justify-center gap-2 py-2.5">
                          <span className="text-[#22c55e] text-sm">✓</span>
                          <span className="text-xs text-text-secondary">최신 버전입니다 (v1.0.0)</span>
                        </div>
                      )}

                      {updateStatus === 'available' && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-[#f59e0b] text-sm">●</span>
                            <span className="text-xs text-text-primary font-semibold">v{updateVersion} 업데이트 가능</span>
                          </div>
                          <button
                            onClick={downloadAndInstall}
                            className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold bg-[#22c55e] hover:bg-[#16a34a] text-white transition-all"
                          >
                            지금 업데이트
                          </button>
                        </div>
                      )}

                      {updateStatus === 'downloading' && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-text-secondary">
                            <span>다운로드 중...</span>
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
                            <span className="text-xs text-text-primary">업데이트 설치 완료</span>
                          </div>
                          <button
                            onClick={restartApp}
                            className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold bg-[#8b5cf6] hover:bg-[#7c3aed] text-white transition-all"
                          >
                            재시작하여 적용
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
                            다시 시도
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-2 text-xs text-text-secondary">
                    {[
                      { label: '프레임워크', value: 'Next.js 14 (App Router)' },
                      { label: '데이터베이스', value: 'Firebase Firestore' },
                      { label: '인증', value: 'Firebase Auth' },
                      { label: '배포', value: isTauri ? 'Tauri 2 (Desktop)' : 'Cloudflare Pages' },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between py-2 border-b border-border/50">
                        <span className="text-text-muted">{item.label}</span>
                        <span className="font-medium text-text-primary">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 p-3 bg-background rounded-xl border border-border text-[11px] text-text-muted text-center">
                    © 2026 AI Todo · 개인 프로젝트
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
