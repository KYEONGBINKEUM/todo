'use client';

import { useState, useRef, useEffect } from 'react';
import { useNoahAI } from '@/lib/noah-ai-context';
import { useI18n } from '@/lib/i18n-context';
import { callNoahAI } from '@/lib/noah-ai';
import type { NoahAIAction } from '@/lib/noah-ai-context';
import NoahAIUpgradePrompt from './NoahAIUpgradePrompt';

interface FloatingAIBarProps {
  getContext: (text: string) => Record<string, any>;
  getAction?: (text: string) => NoahAIAction;
  onResult?: (action: NoahAIAction, result: any) => void;
  placeholder?: string;
}

const SLASH_COMMANDS = [
  { label: '일정 추가', example: '내일 회의 일정 추가해줘', icon: '📅', desc: '캘린더에 일정 추가' },
  { label: '일정 변경', example: '구역심방 일정 오후 3시로 변경해줘', icon: '✏️', desc: '기존 일정 수정' },
  { label: '일정 삭제', example: '내일 일정 모두 삭제해줘', icon: '🗑️', desc: '캘린더 일정 삭제' },
  { label: '오늘 일정 짜줘', example: '오늘 일정 짜줘', icon: '⏱️', desc: '타임박스 스케줄 생성' },
  { label: '할일 추가', example: '보고서 작성 할일로 추가해줘', icon: '✅', desc: '오늘의 할일에 추가' },
  { label: '노트 작성', example: '파이썬 문법 노트에 기록해줘', icon: '📝', desc: 'AI가 노트 작성' },
  { label: '마인드맵', example: '마케팅 전략 마인드맵 만들어줘', icon: '🧠', desc: '마인드맵 생성' },
];

export default function FloatingAIBar({
  getContext,
  getAction,
  onResult,
  placeholder = 'AI에게 질문하거나 명령하세요...',
}: FloatingAIBarProps) {
  const { canUseAI } = useNoahAI();
  const { language } = useI18n();

  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ action: NoahAIAction; data: any; text: string } | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showCommands, setShowCommands] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setResult(null);
        setShowCommands(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setShowCommands(val === '/');
  };

  const handleCommandSelect = (example: string) => {
    setInputValue(example);
    setShowCommands(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSubmit = async () => {
    if (!canUseAI) { setShowUpgrade(true); return; }
    const text = inputValue.trim();
    if (!text || loading) return;

    setLoading(true);
    setResult(null);
    setInputValue('');
    setShowCommands(false);

    try {
      const action: NoahAIAction = getAction ? getAction(text) : 'chat';
      const context = getContext(text);
      context.__userText = text;
      const response = await callNoahAI(action, context, language);
      const res = response.result;

      let preview = '';
      if (action === 'calendar_add_event' && res?.title) {
        preview = `✅ 일정 추가: ${res.title} (${res.date}${res.startTime ? ' ' + res.startTime : ''})`;
      } else if (action === 'calendar_update_event' && res?.targetTitle) {
        preview = `✅ 일정 수정: "${res.targetTitle}" → ${res.newDate || ''}${res.newStartTime ? ' ' + res.newStartTime : ''}`;
      } else if (action === 'calendar_delete_events' && res?.targetIds?.length) {
        preview = `✅ 삭제 완료: ${(res.targetTitles || []).join(', ')}`;
      } else if (action === 'smart_schedule' && res?.schedule?.length) {
        preview = `✅ 스케줄 생성 (${res.schedule.length}개 슬롯) → 타임박스로 이동합니다`;
      } else if (typeof res === 'string') preview = res;
      else if (res?.reply) preview = res.reply;
      else if (res?.text) preview = res.text;
      else if (res?.suggestions?.length) preview = res.suggestions.map((s: any) => `• ${s.title}`).join('\n');
      else if (res?.tasks?.length) preview = res.tasks.map((t: any) => `• ${t.title}`).join('\n');
      else if (res?.blocks?.length) preview = res.blocks.map((b: any) => b.content).filter(Boolean).join('\n');
      else preview = JSON.stringify(res, null, 2).slice(0, 400);

      setResult({ action, data: res, text: preview });
      if (onResult) onResult(action, res);
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

          {/* 슬래시 명령어 팝업 */}
          {showCommands && (
            <div className="w-full bg-background-card border border-[#e94560]/30 rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-3 py-2 border-b border-border flex items-center gap-2">
                <img src="/symbol.svg" alt="AI" className="w-3.5 h-3.5" />
                <p className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">명령어 목록 — 클릭하면 입력됩니다</p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {SLASH_COMMANDS.map((cmd) => (
                  <button
                    key={cmd.label}
                    onClick={() => handleCommandSelect(cmd.example)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#e94560]/8 transition-colors text-left"
                  >
                    <span className="text-base flex-shrink-0">{cmd.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text-primary">{cmd.label}</p>
                      <p className="text-[10px] text-text-muted truncate">{cmd.example}</p>
                    </div>
                    <span className="text-[10px] text-text-muted flex-shrink-0 hidden sm:block">{cmd.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                if (e.key === 'Escape') { setResult(null); setInputValue(''); setShowCommands(false); }
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
