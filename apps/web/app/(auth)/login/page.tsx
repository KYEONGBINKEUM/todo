'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleGoogleLogin = async () => {
    setLoading(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      console.error('Login error:', error);
      setLoading(false);
    }

    // OAuth will redirect, so we don't need to do anything else
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8 animate-fade-up">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-extrabold bg-gradient-to-r from-text-primary to-primary bg-clip-text text-transparent mb-2">
            AI Todo
          </h1>
          <p className="text-text-secondary">오늘을 설계해주는 디지털 비서</p>
        </div>

        {/* Login Card */}
        <div className="bg-background-card border border-border rounded-card p-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">로그인</h2>
            <p className="text-text-secondary text-sm">
              구글 계정으로 간편하게 시작하세요
            </p>
          </div>

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-white hover:bg-gray-50 text-gray-800 font-semibold rounded-button border border-gray-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                <span>Google로 계속하기</span>
              </>
            )}
          </button>

          <div className="text-center text-xs text-text-muted">
            로그인하면{' '}
            <a href="#" className="text-primary hover:underline">
              서비스 약관
            </a>{' '}
            및{' '}
            <a href="#" className="text-primary hover:underline">
              개인정보 처리방침
            </a>
            에 동의하게 됩니다.
          </div>
        </div>

        {/* Features List */}
        <div className="text-center space-y-3 text-sm text-text-secondary">
          <p className="font-semibold text-text-primary">시작하면 바로 사용 가능</p>
          <ul className="space-y-2">
            <li className="flex items-center justify-center gap-2">
              <span className="text-primary">✓</span>
              <span>기본 Todo 관리</span>
            </li>
            <li className="flex items-center justify-center gap-2">
              <span className="text-primary">✓</span>
              <span>My Day 뷰</span>
            </li>
            <li className="flex items-center justify-center gap-2">
              <span className="text-primary">✓</span>
              <span>크로스 플랫폼 동기화</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
