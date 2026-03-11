'use client';

import { useState, useRef, useEffect } from 'react';
import { useNoahAI } from '@/lib/noah-ai-context';
import { useI18n } from '@/lib/i18n-context';
import { callNoahAI } from '@/lib/noah-ai';
import type { NoahAIAction } from '@/lib/noah-ai-context';
import NoahAIUpgradePrompt from './NoahAIUpgradePrompt';

export interface AIChip {
  id: string;
  label: string;
  icon: string;
  action: NoahAIAction;
  /** 칩 클릭 시 추가 텍스트 입력 필요 여부 */
  needsInput?: boolean;
  inputPlaceholder?: string;
}

interface FloatingAIBarProps {
  chips: AIChip[];
  /** 액션별 컨텍스트 생성 (text = 사용자가 입력한 자유 텍스트) */
  getContext: (action: NoahAIAction, text?: string) => Record<string, any>;
  /** 결과 수신 후 페이지에서 처리 */
  onResult: (action: NoahAIAction, result: any) => void;
  /** 결과 카드에 표시할 레이블 (기본: "적용하기") */
  applyLabel?: string;
  /** 자유 입력 placeholder */
  placeholder?: string;
}

export default function FloatingAIBar({
  chips,
  getContext,
  onResult,
  applyLabel = '적용하기',
  placeholder = 'AI에게 질문하거나 명령하세요...',
}: FloatingAIBarProps) {
  const { canUseAI } = useNoahAI();
  const { language } = useI18n();

  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingChip, setLoadingChip] = useState<string | null>(null);
  const [pendingChip, setPendingChip] = useState<AIChip | null>(null); // needsInput chip
  const [result, setResult] = useState<{ action: NoahAIAction; data: any; text: string } | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 축소
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setExpanded(false);
        setPendingChip(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  useEffect(() => {
    if (pendingChip) inputRef.current?.focus();
  }, [pendingChip]);

  const runAction = async (action: NoahAIAction, chipId: string, text?: string) => {
    setLoading(true);
    setLoadingChip(chipId);
    setResult(null);
    try {
      const context = getContext(action, text);
      if (text) context.__userText = text;
      const response = await callNoahAI(action, context, language);
      const res = response.result;
      // 결과 텍스트 추출
      let preview = '';
      if (typeof res === 'string') preview = res;
      else if (res?.text) preview = res.text;
      else if (res?.suggestions?.length) preview = res.suggestions.map((s: any) => `• ${s.title}`).join('\n');
      else if (res?.tasks?.length) preview = res.tasks.map((t: any) => `• ${t.title}`).join('\n');
      else if (res?.blocks?.length) preview = res.blocks.slice(0, 3).map((b: any) => b.content).filter(Boolean).join('\n');
      else preview = JSON.stringify(res, null, 2).slice(0, 300);
      setResult({ action, data: res, text: preview });
    } catch (err) {
      console.error('[FloatingAIBar] action failed:', err);
    } finally {
      setLoading(false);
      setLoadingChip(null);
    }
  };

  const handleChipClick = (chip: AIChip) => {
    if (!canUseAI) { setShowUpgrade(true); return; }
    if (chip.needsInput) {
      setPendingChip(chip);
      setInputValue('');
      setExpanded(true);
      return;
    }
    runAction(chip.action, chip.id);
  };

  const handleSubmit = async () => {
    if (!canUseAI) { setShowUpgrade(true); return; }
    const text = inputValue.trim();
    if (!text) return;

    if (pendingChip) {
      // 칩이 텍스트 입력 요구한 경우
      await runAction(pendingChip.action, pendingChip.id, text);
      setPendingChip(null);
    } else {
      // 자유 텍스트 → chat 액션
      await runAction('chat', 'free-text', text);
    }
    setInputValue('');
    setExpanded(false);
  };

  const handleApply = () => {
    if (!result) return;
    onResult(result.action, result.data);
    setResult(null);
  };

  const activePlaceholder = pendingChip?.inputPlaceholder ?? placeholder;

  return (
    <>
      {/* 사이드바 너비(w-64)를 고려해 메인 영역 중앙에 배치 */}
      <div
        ref={barRef}
        className="fixed bottom-6 left-0 md:left-64 right-0 flex justify-center px-4 z-40 pointer-events-none"
      >
        <div className="pointer-events-auto w-full max-w-xl flex flex-col items-center gap-2">

          {/* 결과 카드 */}
          {result && (
            <div className="w-full bg-background-card border border-[#e94560]/30 rounded-2xl shadow-2xl p-4 animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-2 mb-2">
                <img src="/symbol.svg" alt="AI" className="w-4 h-4" />
                <span className="text-xs font-bold text-[#e94560]">Noah AI</span>
                <button
                  onClick={() => setResult(null)}
                  className="ml-auto text-text-muted hover:text-text-primary text-sm leading-none"
                >✕</button>
              </div>
              <pre className="text-xs text-text-primary whitespace-pre-wrap break-words max-h-40 overflow-y-auto font-sans leading-relaxed">
                {result.text}
              </pre>
              <button
                onClick={handleApply}
                className="mt-3 w-full py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#e94560] to-[#8b5cf6] text-white hover:opacity-90 transition-opacity"
              >
                {applyLabel}
              </button>
            </div>
          )}

          {/* 칩 행 */}
          {!result && (
            <div className="flex gap-1.5 flex-wrap justify-center">
              {chips.map((chip) => (
                <button
                  key={chip.id}
                  onClick={() => handleChipClick(chip)}
                  disabled={loading}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all
                    ${loadingChip === chip.id
                      ? 'bg-[#e94560]/20 text-[#e94560] border-[#e94560]/40 animate-pulse'
                      : 'bg-background-card/90 backdrop-blur text-text-secondary border-border hover:border-[#e94560]/50 hover:text-[#e94560]'
                    }`}
                >
                  <span>{chip.icon}</span>
                  <span>{chip.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* 입력 바 */}
          <div className={`w-full flex items-center gap-2 px-4 py-3 rounded-2xl border shadow-2xl transition-all duration-200
            bg-background-card/95 backdrop-blur-md
            ${expanded || pendingChip ? 'border-[#e94560]/50 shadow-[#e94560]/10' : 'border-border'}
            ${loading ? 'opacity-70' : ''}
          `}>
            {loading ? (
              <svg className="w-5 h-5 text-[#e94560] animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <img src="/symbol.svg" alt="AI" className="w-5 h-5 flex-shrink-0" />
            )}

            {pendingChip && !loading && (
              <span className="text-[11px] text-[#e94560] font-medium flex-shrink-0 bg-[#e94560]/10 px-2 py-0.5 rounded-full">
                {pendingChip.icon} {pendingChip.label}
              </span>
            )}

            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => setExpanded(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                if (e.key === 'Escape') { setExpanded(false); setPendingChip(null); setInputValue(''); }
              }}
              placeholder={loading ? 'AI가 생각하는 중...' : activePlaceholder}
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none min-w-0"
            />

            <button
              onClick={handleSubmit}
              disabled={loading || !inputValue.trim()}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-gradient-to-r from-[#e94560] to-[#8b5cf6] text-white disabled:opacity-30 transition-opacity flex-shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>

        </div>
      </div>

      {showUpgrade && <NoahAIUpgradePrompt onClose={() => setShowUpgrade(false)} />}
    </>
  );
}
