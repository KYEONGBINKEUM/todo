'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';
import Link from 'next/link';
import { Suspense } from 'react';

function SuccessContent() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const plan = params.get('plan') ?? 'pro';
  const customerSessionToken = params.get('customer_session_token');
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !customerSessionToken) return;

    const verify = async () => {
      try {
        const fn = httpsCallable(functions, 'verifyPolarPayment');
        await fn({ customerSessionToken });
        setVerified(true);
      } catch (e: any) {
        console.error('[payment/success] verify error:', e);
        setError(e.message || 'Verification failed');
      }
    };

    verify();
  }, [user, customerSessionToken]);

  useEffect(() => {
    if (!user || !verified) return;
    const timer = setTimeout(() => router.replace('/my-day'), 3000);
    return () => clearTimeout(timer);
  }, [user, verified, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#08081a] p-8">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">🎉</div>
        <h1 className="text-3xl font-extrabold text-white mb-3">결제 완료!</h1>
        <p className="text-slate-400 mb-2">
          <span className="text-[#e94560] font-bold capitalize">{plan === 'team' ? 'Team' : 'Pro'}</span> 플랜이 활성화됐습니다.
        </p>
        {!verified && !error && (
          <p className="text-slate-500 text-sm mb-8">플랜 활성화 중...</p>
        )}
        {verified && (
          <p className="text-slate-500 text-sm mb-8">잠시 후 앱으로 이동합니다...</p>
        )}
        {error && (
          <p className="text-red-400 text-sm mb-8">오류: {error}</p>
        )}
        <div className="flex gap-3 justify-center">
          <Link href="/my-day"
            className="px-6 py-3 bg-[#e94560] text-white rounded-xl font-bold hover:bg-[#d63b55] transition-colors">
            지금 시작하기
          </Link>
          <Link href="/"
            className="px-6 py-3 border border-white/20 text-slate-300 rounded-xl hover:border-white/40 transition-colors">
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#08081a]" />}>
      <SuccessContent />
    </Suspense>
  );
}
