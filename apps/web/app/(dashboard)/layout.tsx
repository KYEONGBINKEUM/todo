'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Sidebar from '@/components/layout/Sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08081a]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#e94560] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#94a3b8] text-sm">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div
      className="flex min-h-screen bg-[#08081a] text-[#e2e8f0]"
      style={{ fontFamily: "'Pretendard Variable', -apple-system, sans-serif" }}
    >
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
