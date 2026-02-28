'use client';

interface NoahAIUsageBarProps {
  used: number;
  limit: number; // -1 = unlimited
}

export default function NoahAIUsageBar({ used, limit }: NoahAIUsageBarProps) {
  if (limit === -1) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
        <span>∞</span>
        <span>{formatTokens(used)} used</span>
      </div>
    );
  }

  const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isNearLimit = percentage > 80;
  const isExhausted = percentage >= 100;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-background-hover rounded-full overflow-hidden min-w-[60px]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isExhausted ? 'bg-red-500' : isNearLimit ? 'bg-yellow-500' : 'bg-gradient-to-r from-[#e94560] to-[#8b5cf6]'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className={`text-[10px] whitespace-nowrap ${isExhausted ? 'text-red-400' : 'text-text-muted'}`}>
        {formatTokens(used)}/{formatTokens(limit)}
      </span>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}
