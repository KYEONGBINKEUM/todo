'use client';

import { useState, useRef, useEffect } from 'react';
import { useNoahAI } from '@/lib/noah-ai-context';
import { useI18n } from '@/lib/i18n-context';
import { callNoahAI } from '@/lib/noah-ai';
import type { NoahAIAction } from '@/lib/noah-ai-context';
import NoahAIUpgradePrompt from './NoahAIUpgradePrompt';

interface FloatingAIBarProps {
  getContext: (text: string) => Record<string, any>;
  onResult?: (action: NoahAIAction, result: any) => void;
  placeholder?: string;
}

export default function FloatingAIBar({
  getContext,
  onResult,
  placeholder = 'AI에게 질문하거나 명령하세요...',
}: FloatingAIBarProps) {
  const { canUseAI } = useNoahAI();
  const { language } = useI18n();

  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ action: NoahAIAction; data: any; text: string } | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setResult(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSubmit = async () => {
    if (!canUseAI) { setShowUpgrade(true); return; }
    const text = inputValue.trim();
    if (!text || loading) return;

    setLoading(true);
    setResult(null);
    setInputValue('');

    try {
      const context = getContext(text);
      context.__userText = text;
      const response = await callNoahAI('chat', context, language);
      const res = response.result;

      let preview = '';
      if (typeof res === 'string') preview = res;
      else if (res?.text) preview = res.text;
      else if (res?.suggestions?.length) preview = res.suggestions.map((s: any) => `• ${s.title}`).join('\n');
      else if (res?.tasks?.length) preview = res.tasks.map((t: any) => `• ${t.title}`).join('\n');
      else if (res?.blocks?.length) preview = res.blocks.map((b: any) => b.content).filter(Boolean).join('\n');
      else preview = JSON.stringify(res, null, 2).slice(0, 400);

      setResult({ action: 'chat', data: res, text: preview });
      if (onResult) onResult('chat', res);
    } catch (err) {
      console.error('[FloatingAIBar]', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        ref={barRef}
        className="fixed bottom-6 left-0 md:left-64 right-0 flex justify-center px-4 z-40 pointer-events-none"
      >
        <div className="pointer-events-auto w-full max-w-xl flex flex-col items-center gap-2">

          {/* 결과 카드 */}
          {result && (
            <div className="w-full bg-background-card border border-[#e94560]/30 rounded-2xl shadow-2xl p-4">
              <div className="flex items-start gap-2 mb-2">
                <img src="/symbol.svg" alt="AI" className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <pre className="text-xs text-text-primary whitespace-pre-wrap break-words max-h-48 overflow-y-auto font-sans leading-relaxed flex-1">
                  {result.text}
                </pre>
                <button
                  onClick={() => setResult(null)}
                  className="text-text-muted hover:text-text-primary text-sm leading-none flex-shrink-0"
                >✕</button>
              </div>
            </div>
          )}

          {/* 입력 바 */}
          <div className={`w-full flex items-center gap-2 px-4 py-3 rounded-2xl border shadow-2xl
            bg-background-card/95 backdrop-blur-md transition-all duration-200
            ${loading ? 'border-[#e94560]/50' : 'border-border hover:border-[#e94560]/30'}
          `}>
            {loading ? (
              <svg className="w-5 h-5 text-[#e94560] animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <img src="/symbol.svg" alt="AI" className="w-5 h-5 flex-shrink-0" />
            )}

            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                if (e.key === 'Escape') { setResult(null); setInputValue(''); }
              }}
              placeholder={loading ? 'AI가 생각하는 중...' : placeholder}
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
