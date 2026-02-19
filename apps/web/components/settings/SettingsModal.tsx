'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { updateUserSettings, getUserSettings, type FontSize } from '@/lib/firestore';

interface SettingsModalProps {
  onClose: () => void;
}

type Tab = 'account' | 'display' | 'info';

function applyFontSize(size: FontSize) {
  document.documentElement.setAttribute('data-font', size);
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('account');
  const [fontSize, setFontSizeState] = useState<FontSize>('medium');

  // 초기 폰트 크기 로드
  useEffect(() => {
    if (!user) return;
    getUserSettings(user.uid).then((s) => {
      const fs = s.fontSize ?? 'medium';
      setFontSizeState(fs);
      applyFontSize(fs);
    });
  }, [user]);

  const handleFontSize = (size: FontSize) => {
    setFontSizeState(size);
    applyFontSize(size);
    if (user) updateUserSettings(user.uid, { fontSize: size });
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'account', label: '계정', icon: '👤' },
    { id: 'display', label: '표시', icon: '🎨' },
    { id: 'info', label: '정보', icon: 'ℹ️' },
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
              <h2 className="text-base font-bold text-text-primary">설정</h2>
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
                  {/* 프로필 */}
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">프로필</p>
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

                  {/* 요금제 */}
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">요금제</p>
                    <div className="p-4 bg-background rounded-xl border border-border">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="text-xs font-bold text-text-primary">Free 플랜</span>
                          <p className="text-[11px] text-text-muted mt-0.5">기본 기능 무제한 사용</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-border text-text-secondary">
                          현재 플랜
                        </span>
                      </div>
                      <div className="space-y-1.5 mb-4">
                        {[
                          { label: '할일 목록 관리', included: true },
                          { label: '노트 작성', included: true },
                          { label: '기기 동기화', included: true },
                          { label: 'AI 자동 작성/요약', included: false },
                          { label: '무제한 공유 협업', included: false },
                          { label: '파일 스토리지 10GB', included: false },
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
                      <button
                        className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-amber-500 to-red-500 opacity-70 cursor-not-allowed"
                        disabled
                      >
                        Pro로 업그레이드 (준비 중)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 표시 탭 ── */}
              {activeTab === 'display' && (
                <div className="space-y-6">
                  {/* 테마 */}
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">테마</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'system' as const, label: 'OS 기본', icon: '🖥' },
                        { value: 'light' as const, label: '라이트', icon: '☀️' },
                        { value: 'dark' as const, label: '다크', icon: '🌙' },
                      ].map((t) => (
                        <button
                          key={t.value}
                          onClick={() => setTheme(t.value)}
                          className={`p-3 rounded-xl border text-center transition-all ${
                            theme === t.value
                              ? 'border-[#e94560] bg-[#e94560]/10 text-[#e94560]'
                              : 'border-border text-text-secondary hover:border-border-hover'
                          }`}
                        >
                          <span className="text-xl block mb-1">{t.icon}</span>
                          <span className="text-[11px] font-semibold">{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 폰트 크기 */}
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-3">폰트 크기</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'small' as FontSize, label: '작게', preview: 'Aa', size: 'text-xs' },
                        { value: 'medium' as FontSize, label: '보통', preview: 'Aa', size: 'text-sm' },
                        { value: 'large' as FontSize, label: '크게', preview: 'Aa', size: 'text-base' },
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
                      현재: {fontSize === 'small' ? '12px' : fontSize === 'large' ? '16px' : '14px'} (기본)
                    </p>
                  </div>
                </div>
              )}

              {/* ── 정보 탭 ── */}
              {activeTab === 'info' && (
                <div className="space-y-4">
                  <div className="text-center py-4">
                    <div className="text-4xl mb-3">✅</div>
                    <h3 className="text-lg font-extrabold text-text-primary mb-1">AI Todo</h3>
                    <p className="text-xs text-text-muted">버전 0.1.0 — MVP</p>
                  </div>

                  <div className="space-y-2 text-xs text-text-secondary">
                    {[
                      { label: '프레임워크', value: 'Next.js 14 (App Router)' },
                      { label: '데이터베이스', value: 'Firebase Firestore' },
                      { label: '인증', value: 'Firebase Auth' },
                      { label: '배포', value: 'Cloudflare Pages' },
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
