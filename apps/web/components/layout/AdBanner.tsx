'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getUserSettings, type Plan } from '@/lib/firestore';

interface AdBannerProps {
  client?: string;
  slot?: string;
  className?: string;
}

/**
 * Google AdSense 배너 컴포넌트
 * - Pro 이상 요금제는 광고가 표시되지 않음
 * - Free 플랜에서만 광고 노출
 */
export default function AdBanner({ client, slot, className = '' }: AdBannerProps) {
  const { user } = useAuth();
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);
  const [userPlan, setUserPlan] = useState<Plan>('free');
  const [loading, setLoading] = useState(true);

  const clientId = client ?? process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const slotId = slot ?? process.env.NEXT_PUBLIC_ADSENSE_SLOT;
  const isConfigured = !!clientId && !!slotId;

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    getUserSettings(user.uid).then((s) => {
      setUserPlan(s.plan || 'free');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!isConfigured || pushed.current || userPlan !== 'free') return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      pushed.current = true;
    } catch {}
  }, [isConfigured, userPlan]);

  // Pro 이상 요금제는 광고 숨김
  if (loading) return null;
  if (userPlan !== 'free') return null;

  // 목업 배너 (AdSense 미설정 시)
  if (!isConfigured) {
    return (
      <div
        className={`w-full flex items-center justify-center gap-3 px-4 py-2 bg-background-card border-b border-border text-text-muted text-xs ${className}`}
        style={{ minHeight: 52 }}
      >
        <span className="text-[10px] uppercase tracking-widest text-text-inactive font-semibold">광고</span>
        <span className="flex-1 text-center text-text-inactive text-[11px]">
          Google AdSense — 광고가 이 위치에 표시됩니다 (
          <code className="text-[10px]">NEXT_PUBLIC_ADSENSE_CLIENT</code> 환경변수 설정 후 활성화)
        </span>
        <span className="text-[9px] text-text-inactive border border-border rounded px-1.5 py-0.5 flex-shrink-0">AD</span>
      </div>
    );
  }

  return (
    <div className={`w-full overflow-hidden ${className}`} style={{ minHeight: 52 }}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={clientId}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
