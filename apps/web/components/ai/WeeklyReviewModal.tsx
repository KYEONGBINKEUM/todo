'use client';

import { useState, useEffect } from 'react';
import { callNoahAI } from '@/lib/noah-ai';
import { useI18n } from '@/lib/i18n-context';
import { useNoahAI } from '@/lib/noah-ai-context';
import NoahAIUpgradePrompt from './NoahAIUpgradePrompt';

interface WeeklyReview {
  summary: string;
  achievements: string[];
  patterns: string[];
  nextWeekPlan: string[];
  motivationalMessage: string;
}

interface Props {
  tasks: Array<{ title: string; status: string; priority: string; completedDate?: string | null }>;
  onClose: () => void;
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=일
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((day + 6) % 7));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { weekRange: `${fmt(mon)} ~ ${fmt(sun)}`, monStr: fmt(mon), sunStr: fmt(sun) };
}

export default function WeeklyReviewModal({ tasks, onClose }: Props) {
  const { language } = useI18n();
  const { canUseAI } = useNoahAI();
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const { weekRange, monStr, sunStr } = getWeekRange();

  const completedTasks = tasks.filter(
    (t) => t.status === 'completed' && t.completedDate && t.completedDate >= monStr && t.completedDate <= sunStr
  );
  const pendingTasks = tasks.filter((t) => t.status !== 'completed');

  const generate = async () => {
    if (!canUseAI) { setShowUpgrade(true); return; }
    setLoading(true);
    try {
      const res = await callNoahAI('weekly_review', {
        weekRange,
        completedTasks,
        pendingTasks,
        totalPomodoros: 0,
      }, language);
      if (res.result) setReview(res.result as WeeklyReview);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  // 자동 생성
  useEffect(() => { generate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
          <img src="/symbol.svg" alt="AI" className="w-5 h-5" />
          <div className="flex-1">
            <h2 className="text-sm font-bold text-text-primary">AI 주간 리뷰</h2>
            <p className="text-[10px] text-text-muted">{weekRange}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <svg className="w-8 h-8 text-[#e94560] animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <p className="text-xs text-text-muted">AI가 이번 주를 분석하는 중...</p>
            </div>
          )}

          {!loading && !review && (
            <div className="text-center py-8">
              <p className="text-sm text-text-muted mb-4">이번 주 생산성 리포트를 AI가 생성합니다</p>
              <div className="flex gap-3 text-xs text-text-muted justify-center mb-4">
                <span>✅ 완료 {completedTasks.length}개</span>
                <span>📋 미완 {pendingTasks.length}개</span>
              </div>
              <button
                onClick={generate}
                className="px-4 py-2 bg-gradient-to-r from-[#e94560] to-[#8b5cf6] text-white rounded-xl text-sm font-bold"
              >
                리뷰 생성
              </button>
            </div>
          )}

          {review && (
            <div className="space-y-4">
              {/* 요약 */}
              <div className="p-3 bg-[#e94560]/5 border border-[#e94560]/20 rounded-xl">
                <p className="text-xs text-text-primary leading-relaxed">{review.summary}</p>
              </div>

              {/* 성취 */}
              {review.achievements?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">🏆 이번 주 성취</p>
                  <ul className="space-y-1">
                    {review.achievements.map((a, i) => (
                      <li key={i} className="text-xs text-text-primary flex gap-2">
                        <span className="text-[#e94560] flex-shrink-0">•</span>{a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 패턴 */}
              {review.patterns?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">💡 발견한 패턴</p>
                  <ul className="space-y-1">
                    {review.patterns.map((p, i) => (
                      <li key={i} className="text-xs text-text-secondary flex gap-2">
                        <span className="text-amber-500 flex-shrink-0">•</span>{p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 다음 주 계획 */}
              {review.nextWeekPlan?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">📅 다음 주 추천</p>
                  <ul className="space-y-1">
                    {review.nextWeekPlan.map((p, i) => (
                      <li key={i} className="text-xs text-text-primary flex gap-2">
                        <span className="text-[#8b5cf6] flex-shrink-0">{i + 1}.</span>{p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 동기 메시지 */}
              {review.motivationalMessage && (
                <div className="p-3 bg-[#8b5cf6]/5 border border-[#8b5cf6]/20 rounded-xl text-center">
                  <p className="text-xs text-[#8b5cf6] font-medium">{review.motivationalMessage}</p>
                </div>
              )}

              <button
                onClick={generate}
                className="w-full py-2 border border-border rounded-xl text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                다시 생성
              </button>
            </div>
          )}
        </div>
      </div>

      {showUpgrade && <NoahAIUpgradePrompt onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
