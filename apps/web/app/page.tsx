'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';

function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-accent-dark p-8">
      <div className="max-w-4xl mx-auto text-center space-y-8 animate-fade-up">
        <div className="inline-block">
          <div className="px-4 py-2 bg-primary/20 border border-primary/40 rounded-full text-xs font-semibold text-primary tracking-wide uppercase">
            Product Framework v1.0
          </div>
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold bg-gradient-to-r from-text-primary to-primary bg-clip-text text-transparent leading-tight">
          NOAH
        </h1>
        <p className="text-xl md:text-2xl text-text-secondary max-w-2xl mx-auto leading-relaxed">
          할 일을 적는 앱이 아니라, <br />
          <span className="text-primary font-semibold">오늘을 설계해주는 디지털 비서</span>
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
          <Link
            href="/login"
            className="w-full sm:w-auto px-8 py-4 bg-primary hover:bg-primary-hover text-white font-semibold rounded-button transition-all duration-200 transform hover:scale-105 shadow-lg"
          >
            시작하기
          </Link>
          <a
            href="#features"
            className="w-full sm:w-auto px-8 py-4 bg-background-card border border-border hover:border-primary text-text-primary font-semibold rounded-button transition-all duration-200"
          >
            자세히 보기
          </a>
        </div>
        <div id="features" className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16">
          {[
            { icon: '🧱', title: 'Foundation Layer', desc: '핵심 Todo 기능' },
            { icon: '🧠', title: 'AI Core Layer', desc: 'AI 기반 자동화 엔진' },
            { icon: '🤖', title: 'AI Agent Layer', desc: '에이전트형 디지털 비서' },
          ].map((feature, i) => (
            <div
              key={i}
              className="p-6 bg-background-card border border-border rounded-card hover:border-primary transition-all duration-200 animate-fade-up"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
              <p className="text-text-secondary text-sm">{feature.desc}</p>
            </div>
          ))}
        </div>
        <div className="pt-16 text-text-muted text-sm">
          <p>정보 제공이 아니라 행동 지원 — 오늘의 성공률을 높이는 도구</p>
        </div>
      </div>
    </div>
  );
}

export default function RootPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  // null = 아직 환경 감지 전, true = Tauri 앱, false = 웹
  const [isTauri, setIsTauri] = useState<boolean | null>(null);

  // 클라이언트 마운트 시 Tauri 환경 감지
  useEffect(() => {
    const detected = typeof window !== 'undefined' && (
      '__TAURI__' in window || '__TAURI_INTERNALS__' in window
    );
    setIsTauri(detected);
  }, []);

  // Tauri 앱: 로그인 상태에 따라 리다이렉트
  useEffect(() => {
    if (isTauri === null || loading) return;
    if (!isTauri) return; // 웹은 랜딩 페이지 표시

    if (user) {
      const lastPage = localStorage.getItem('lastPage') || '/my-day';
      router.replace(lastPage);
    } else {
      router.replace('/login');
    }
  }, [isTauri, user, loading, router]);

  // 환경 감지 전 또는 Tauri 앱이면 빈 화면 (리다이렉트 중)
  if (isTauri === null || isTauri) return null;

  // 웹 전용: 랜딩 페이지
  return <LandingPage />;
}
