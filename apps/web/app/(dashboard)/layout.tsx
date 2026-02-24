'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Sidebar from '@/components/layout/Sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 페이지 이동 시 모바일 사이드바 닫기
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-text-secondary text-sm">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div
      className="flex h-screen overflow-hidden bg-background text-text-primary"
      style={{ fontFamily: "'Pretendard Variable', -apple-system, sans-serif" }}
    >
      {/* 모바일 상단 헤더 */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-background border-b border-border flex items-center px-4 gap-3 flex-shrink-0">
        <button
          onClick={() => setSidebarOpen(true)}
          className="w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-lg text-text-secondary hover:bg-background-card transition-colors"
          aria-label="메뉴 열기"
        >
          <span className="w-5 h-0.5 bg-current rounded-full" />
          <span className="w-5 h-0.5 bg-current rounded-full" />
          <span className="w-4 h-0.5 bg-current rounded-full" />
        </button>
        <h1 className="text-lg font-extrabold bg-gradient-to-r from-text-primary to-[#e94560] bg-clip-text text-transparent">
          AI Todo
        </h1>
      </div>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto flex flex-col pt-14 md:pt-0 min-w-0">
        <div className="flex-1">{children}</div>
      </main>
    </div>
  );
}
