'use client';

import { signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function LoginPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // 이미 로그인된 상태면 바로 리다이렉트 (onAuthStateChanged 감지)
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/my-day');
    }
  }, [user, authLoading, router]);

  // 리다이렉트 폴백 결과 확인
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

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      // 팝업 우선 시도 (EXE/데스크톱에서 가장 안정적)
      await signInWithPopup(auth, googleProvider);
      router.replace('/my-day');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '로그인에 실패했습니다';
      // 팝업이 차단된 경우에만 리다이렉트로 폴백
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
