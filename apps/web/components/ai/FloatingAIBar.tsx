'use client';

import { useState, useRef, useEffect } from 'react';
import { useNoahAI } from '@/lib/noah-ai-context';
import { useI18n } from '@/lib/i18n-context';
import { callNoahAI } from '@/lib/noah-ai';
import type { NoahAIAction } from '@/lib/noah-ai-context';
import NoahAIUpgradePrompt from './NoahAIUpgradePrompt';

export interface SlashCommand {
  label: string;
  icon: string;
  desc: string;
  action?: NoahAIAction;
}

interface FloatingAIBarProps {
  commands?: SlashCommand[];
  getContext: (text: string) => Record<string, any>;
  getAction?: (text: string) => NoahAIAction;
  /** Return true from onResult to suppress the result card */
  onResult?: (action: NoahAIAction, result: any) => void | boolean | Promise<void | boolean>;
  placeholder?: string;
}

export default function FloatingAIBar({
  commands = [],
  getContext,
  getAction,
  onResult,
  placeholder = 'AI에게 질문하거나 명령하세요...',
}: FloatingAIBarProps) {
  const { canUseAI } = useNoahAI();
  const { language } = useI18n();

  const [inputValue, setInputValue] = useState('');
  const [selectedTag, setSelectedTag] = useState<SlashCommand | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ action: NoahAIAction; data: any; text: string } | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const chatHistoryRef = useRef<{ user: string; assistant: string }[]>([]);

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
    if (commands.length > 0) {
      setShowCommands(val === '/');
    }
  };

  const handleCommandSelect = (cmd: SlashCommand) => {
    setSelectedTag(cmd);
    setInputValue('');
    setShowCommands(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleTagRemove = () => {
    setSelectedTag(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSubmit = async () => {
    if (!canUseAI) { setShowUpgrade(true); return; }
    const rawText = inputValue.trim();
    const fullText = selectedTag ? `${selectedTag.label} ${rawText}`.trim() : rawText;
    if (!fullText || loading) return;

    setLoading(true);
    setResult(null);
    setInputValue('');
    setSelectedTag(null);
    setShowCommands(false);

    try {
      const action: NoahAIAction =
        (selectedTag?.action) ||
        (getAction ? getAction(fullText) : 'chat');
      const context = getContext(fullText);
      context.__userText = fullText;
      // 채팅 액션에만 대화 히스토리 전달
      if (action === 'chat' && chatHistoryRef.current.length > 0) {
        context.chatHistory = chatHistoryRef.current.slice(-5); // 최대 5턴
      }
      const response = await callNoahAI(action, context, language);
      const res = response.result;
      // 채팅 응답은 히스토리에 추가
      if (action === 'chat') {
        const assistantText = res?.reply || res?.text || '';
        if (assistantText) {
          chatHistoryRef.current = [
            ...chatHistoryRef.current.slice(-4),
            { user: rawText, assistant: assistantText },
          ];
        }
      }

      let preview = '';
      if (action === 'calendar_add_event' && res?.events?.length) {
        preview = `✅ 일정 추가 (${res.events.length}일):\n` + res.events.map((e: any) => `• ${e.date} ${e.title}`).join('\n');
      } else if (action === 'calendar_add_event' && res?.title) {
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

      const suppress = onResult ? await onResult(action, res) : false;
      if (!suppress) setResult({ action, data: res, text: preview });
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
          {showCommands && commands.length > 0 && (
            <div className="w-full bg-background-card border border-[#e94560]/30 rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-3 py-2 border-b border-border flex items-center gap-2">
                <img src="/symbol.svg" alt="AI" className="w-3.5 h-3.5" />
                <p className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">명령어 선택 후 내용을 입력하세요</p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {commands.map((cmd) => (
                  <button
                    key={cmd.label}
                    onClick={() => handleCommandSelect(cmd)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#e94560]/8 transition-colors text-left"
                  >
                    <span className="text-base flex-shrink-0">{cmd.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-text-primary">{cmd.label}</p>
                      <p className="text-[10px] text-text-muted truncate">{cmd.desc}</p>
                    </div>
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

            {/* 선택된 태그 */}
            {selectedTag && (
              <span className="flex items-center gap-1 bg-[#e94560]/15 text-[#e94560] text-xs px-2 py-1 rounded-lg flex-shrink-0 font-medium">
                {selectedTag.icon} {selectedTag.label}
                <button
                  onClick={handleTagRemove}
                  className="ml-0.5 hover:opacity-70 leading-none"
                  aria-label="태그 제거"
                >✕</button>
              </span>
            )}

            <input
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                if (e.key === 'Escape') {
                  setResult(null);
                  setInputValue('');
                  setSelectedTag(null);
                  setShowCommands(false);
                }
                // Backspace on empty input removes tag
                if (e.key === 'Backspace' && !inputValue && selectedTag) {
                  handleTagRemove();
                }
              }}
              placeholder={loading ? 'AI가 생각하는 중...' : selectedTag ? `${selectedTag.desc}...` : placeholder}
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none min-w-0"
            />

            <button
              onClick={handleSubmit}
              disabled={loading || (!inputValue.trim() && !selectedTag)}
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
