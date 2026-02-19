'use client';

import { useEffect, useRef } from 'react';

interface AdBannerProps {
  /** Google AdSense 게시자 ID (예: ca-pub-XXXXXXXXXXXXXXXX) */
  client?: string;
  /** 광고 슬롯 ID */
  slot?: string;
  className?: string;
}

/**
 * Google AdSense 배너 컴포넌트 (프리 플랜 유저 대상)
 * - NEXT_PUBLIC_ADSENSE_CLIENT 환경변수 미설정 시 목업 플레이스홀더 표시
 * - 실제 사용 시 .env.local에 NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-XXXX 설정
 */
export default function AdBanner({ client, slot, className = '' }: AdBannerProps) {
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  const clientId = client ?? process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  const slotId = slot ?? process.env.NEXT_PUBLIC_ADSENSE_SLOT;
  const isConfigured = !!clientId && !!slotId;

  useEffect(() => {
    if (!isConfigured || pushed.current) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      pushed.current = true;
    } catch {}
  }, [isConfigured]);

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
      {/* AdSense 스크립트는 app/layout.tsx <head>에 추가해야 합니다 */}
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
