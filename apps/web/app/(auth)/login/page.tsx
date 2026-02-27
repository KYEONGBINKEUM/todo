'use client';

import { signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';

type TauriMode = 'web' | 'desktop' | 'mobile';

export default function LoginPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tauriMode, setTauriMode] = useState<TauriMode>('web');
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const unlistenRef = useRef<(() => void) | null>(null);

  // Tauri 환경 감지 (데스크톱 vs 모바일 vs 웹)
  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && (
      '__TAURI__' in window ||
      '__TAURI_INTERNALS__' in window
    );
    if (!isTauri) {
      setTauriMode('web');
      return;
    }
    // Tauri API로 OS 타입 확인
    (async () => {
      try {
        const { type } = await import('@tauri-apps/plugin-os');
        const osType = type();
        if (osType === 'android' || osType === 'ios') {
          setTauriMode('mobile');
        } else {
          setTauriMode('desktop');
        }
      } catch {
        // OS 플러그인 없으면 UA로 폴백
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        setTauriMode(isMobile ? 'mobile' : 'desktop');
      }
    })();
  }, []);

  // 이미 로그인된 상태면 마지막 페이지(또는 /my-day)로 리다이렉트
  useEffect(() => {
    if (!authLoading && user) {
      const lastPage = typeof window !== 'undefined'
        ? localStorage.getItem('lastPage') || '/my-day'
        : '/my-day';
      router.replace(lastPage);
    }
  }, [user, authLoading, router]);

  // 리다이렉트 폴백 결과 확인 (웹 전용)
  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          router.replace('/my-day');
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Android Tauri: 딥링크로 돌아온 인증 데이터 처리
  useEffect(() => {
    if (tauriMode !== 'mobile') return;

    let cancelled = false;

    (async () => {
      try {
        const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
        const unlisten = await onOpenUrl((urls: string[]) => {
          if (cancelled) return;
          for (const url of urls) {
            try {
              // aitodo://auth-callback#data=base64encodedJSON
              const hashPart = url.split('#')[1];
              if (!hashPart) continue;
              const params = new URLSearchParams(hashPart);
              const data = params.get('data');
              if (!data) continue;

              const userData = JSON.parse(atob(data));
              if (!userData || !userData.uid) continue;

              const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '';
              const storageKey = `firebase:authUser:${apiKey}:[DEFAULT]`;
              localStorage.setItem(storageKey, JSON.stringify(userData));
              window.location.href = '/my-day';
              return;
            } catch {
              // skip invalid URLs
            }
          }
        });
        unlistenRef.current = unlisten;
      } catch {
        // deep-link not available
      }
    })();

    return () => {
      cancelled = true;
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, [tauriMode]);

  // 컴포넌트 언마운트 시 리스너 정리
  useEffect(() => {
    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
      }
    };
  }, []);

  // Tauri Desktop: 시스템 브라우저 인증 → 로컬 서버 → localStorage 주입
  const handleTauriDesktopLogin = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { open } = await import('@tauri-apps/plugin-shell');
      const { listen } = await import('@tauri-apps/api/event');

      const port = await invoke<number>('start_oauth_server');

      const unlisten = await listen<string>('oauth-callback', async (event) => {
        unlisten();
        unlistenRef.current = null;
        try {
          const userData = JSON.parse(event.payload);
          if (!userData || !userData.uid) {
            setError('인증 정보를 받지 못했습니다. 다시 시도해주세요.');
            setLoading(false);
            return;
          }
          const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '';
          const storageKey = `firebase:authUser:${apiKey}:[DEFAULT]`;
          localStorage.setItem(storageKey, JSON.stringify(userData));
          window.location.href = '/my-day';
        } catch (err) {
          const message = err instanceof Error ? err.message : '로그인에 실패했습니다';
          setError(message);
          setLoading(false);
        }
      });
      unlistenRef.current = unlisten;

      const params = new URLSearchParams({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
      });

      await open(`http://localhost:${port}/login?${params.toString()}`);

      setTimeout(() => {
        if (unlistenRef.current) {
          unlistenRef.current();
          unlistenRef.current = null;
          setError('로그인 시간이 초과되었습니다. 다시 시도해주세요.');
          setLoading(false);
        }
      }, 120000);

    } catch (err) {
      const message = err instanceof Error ? err.message : '로그인에 실패했습니다';
      console.error('Tauri login error:', err);
      setError(`데스크톱 로그인 오류: ${message}`);
      setLoading(false);
    }
  }, []);

  // Tauri Mobile: Firebase Hosting의 mobile-auth.html 열기
  // signInWithRedirect → Google 인증 → aitodo:// 딥링크로 앱 복귀
  // 딥링크 콜백은 위의 onOpenUrl 핸들러(useEffect)가 처리
  const handleTauriMobileLogin = useCallback(async () => {
    setLoading(true);
    setError(null);

    const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '';
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '';
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';

    if (!authDomain || !apiKey || !projectId) {
      setError('앱 설정 오류: Firebase 환경 변수가 설정되지 않았습니다.');
      setLoading(false);
      return;
    }

    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      const params = new URLSearchParams({ apiKey, authDomain, projectId });
      await openUrl(`https://${authDomain}/mobile-auth.html?${params.toString()}`);
      // 브라우저가 열리면 로딩 해제 (실제 로그인 완료는 딥링크 onOpenUrl이 처리)
      setTimeout(() => setLoading(false), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Mobile login error:', err);
      setError(`로그인 오류: ${message}`);
      setLoading(false);
    }
  }, []);

  // 웹: 기존 Firebase signInWithPopup
  const handleWebLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      router.replace('/my-day');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '로그인에 실패했습니다';
      if (message.includes('auth/popup-blocked') || message.includes('auth/popup-closed-by-browser')) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch {
          setError('로그인에 실패했습니다. 다시 시도해주세요.');
        }
      } else if (message.includes('invalid-api-key') || message.includes('auth/configuration-not-found')) {
        setError('Firebase가 아직 설정되지 않았습니다. .env.local을 확인해주세요.');
      } else if (!message.includes('auth/cancelled-popup-request')) {
        setError(message);
      }
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    if (tauriMode === 'desktop') {
      handleTauriDesktopLogin();
    } else if (tauriMode === 'mobile') {
      handleTauriMobileLogin();
    } else {
      handleWebLogin();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08081a] p-4">
      <div className="w-full max-w-md space-y-8 animate-fade-up">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-extrabold bg-gradient-to-r from-[#e2e8f0] to-[#e94560] bg-clip-text text-transparent mb-2">
            AI Todo
          </h1>
          <p className="text-[#94a3b8]">오늘을 설계해주는 디지털 비서</p>
        </div>

        {/* Login Card */}
        <div className="bg-[#111128] border border-[#1e1e3a] rounded-2xl p-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-[#e2e8f0]">로그인</h2>
            <p className="text-[#94a3b8] text-sm">
              구글 계정으로 간편하게 시작하세요
            </p>
            {tauriMode !== 'web' && (
              <p className="text-[#4a4a6a] text-xs">
                시스템 브라우저에서 로그인이 진행됩니다
              </p>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 text-center">
              {error}
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white hover:bg-gray-50 text-gray-800 font-semibold rounded-xl border border-gray-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span>Google로 계속하기</span>
              </>
            )}
          </button>

          {/* Demo mode link */}
          <button
            onClick={() => router.push('/my-day')}
            className="w-full py-3 text-[#94a3b8] hover:text-[#e2e8f0] text-sm transition-colors"
          >
            로그인 없이 둘러보기 →
          </button>

          <div className="text-center text-xs text-[#4a4a6a]">
            로그인하면{' '}
            <a href="#" className="text-[#e94560] hover:underline">서비스 약관</a>{' '}
            및{' '}
            <a href="#" className="text-[#e94560] hover:underline">개인정보 처리방침</a>
            에 동의하게 됩니다.
          </div>
        </div>

        {/* Features List */}
        <div className="text-center space-y-3 text-sm text-[#94a3b8]">
          <p className="font-semibold text-[#e2e8f0]">시작하면 바로 사용 가능</p>
          <ul className="space-y-2">
            <li className="flex items-center justify-center gap-2">
              <span className="text-[#e94560]">✓</span>
              <span>기본 Todo 관리</span>
            </li>
            <li className="flex items-center justify-center gap-2">
              <span className="text-[#e94560]">✓</span>
              <span>My Day 뷰</span>
            </li>
            <li className="flex items-center justify-center gap-2">
              <span className="text-[#e94560]">✓</span>
              <span>크로스 플랫폼 동기화</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
