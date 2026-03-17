'use client';

import { useState, useRef, useEffect } from 'react';
import { callNoahAI } from '@/lib/noah-ai';
import { useNoahAI } from '@/lib/noah-ai-context';
import { useI18n } from '@/lib/i18n-context';
import type { NoahAIAction } from '@/lib/noah-ai-context';
import NoahAIUpgradePrompt from './NoahAIUpgradePrompt';

export interface SlashCommand {
  label: string;
  icon: string;
  desc: string;
  action?: NoahAIAction;
  /** Direct handler — bypasses AI. Return string to show as result. */
  handler?: (text: string) => void | string | Promise<void | string>;
}

interface Message {
  role: 'user' | 'ai';
  text: string;
}

interface FloatingAIBarProps {
  commands?: SlashCommand[];
  getContext: (text: string) => Record<string, any>;
  getAction?: (text: string) => NoahAIAction;
  /** Return true from onResult to suppress the result message */
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showCommands, setShowCommands] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Chat history for AI context (role/content pairs)
  const chatHistoryRef = useRef<{ user: string; assistant: string }[]>([]);

  // Auto-scroll messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close command popup on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setShowCommands(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (commands.length > 0) setShowCommands(val === '/');
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
    setInputValue('');
    const capturedTag = selectedTag;
    setSelectedTag(null);
    setShowCommands(false);

    // Add user message to thread
    setMessages(prev => [...prev, { role: 'user', text: fullText }]);

    // Direct handler (no AI)
    if (capturedTag?.handler) {
      try {
        const msg = await capturedTag.handler(rawText);
        if (typeof msg === 'string') {
          setMessages(prev => [...prev, { role: 'ai', text: `✅ ${msg}` }]);
        }
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const action: NoahAIAction =
        (capturedTag?.action) ||
        (getAction ? getAction(fullText) : 'chat');
      const context = getContext(fullText);
      context.__userText = fullText;
      // Pass conversation history for context continuity
      if (chatHistoryRef.current.length > 0) {
        context.chatHistory = chatHistoryRef.current.slice(-6);
      }

      const response = await callNoahAI(action, context, language);
      const res = response.result;

      // Build response text
      let aiText = '';
      if (action === 'calendar_add_event' && res?.events?.length) {
        aiText = `✅ 일정 추가 (${res.events.length}개):\n` + res.events.map((e: any) => `• ${e.date} ${e.title}`).join('\n');
      } else if (action === 'calendar_add_event' && res?.title) {
        aiText = `✅ 일정 추가: ${res.title} (${res.date}${res.startTime ? ' ' + res.startTime : ''})`;
      } else if (action === 'calendar_update_event' && res?.targetTitle) {
        aiText = `✅ 일정 수정: "${res.targetTitle}" → ${res.newDate || ''}${res.newStartTime ? ' ' + res.newStartTime : ''}`;
      } else if (action === 'calendar_delete_events' && res?.targetIds?.length) {
        aiText = `✅ 삭제 완료: ${(res.targetTitles || []).join(', ')}`;
      } else if (action === 'smart_schedule' && res?.schedule?.length) {
        aiText = `✅ 스케줄 ${res.schedule.length}개 생성 → 타임박스로 이동합니다`;
      } else if (typeof res === 'string') aiText = res;
      else if (res?.reply) aiText = res.reply;
      else if (res?.text) aiText = res.text;
      else if (res?.suggestions?.length) aiText = res.suggestions.map((s: any) => `• ${s.title}`).join('\n');
      else if (res?.tasks?.length) aiText = res.tasks.map((t: any) => `• ${t.title}`).join('\n');
      else if (res?.blocks?.length) aiText = res.blocks.map((b: any) => b.content).filter(Boolean).join('\n');
      else aiText = JSON.stringify(res, null, 2).slice(0, 400);

      // Update chat history for next turn
      const assistantText = res?.reply || res?.text || aiText;
      chatHistoryRef.current = [
        ...chatHistoryRef.current.slice(-5),
        { user: fullText, assistant: assistantText },
      ];

      const suppress = onResult ? await onResult(action, res) : false;
      if (!suppress) {
        setMessages(prev => [...prev, { role: 'ai', text: aiText }]);
      }
    } catch (err) {
      console.error('[FloatingAIBar]', err);
      setMessages(prev => [...prev, { role: 'ai', text: '오류가 발생했습니다. 다시 시도해주세요.' }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    chatHistoryRef.current = [];
  };

  return (
    <>
      <div
        ref={barRef}
        className="fixed bottom-6 left-0 md:left-64 right-0 flex justify-center px-4 z-40 pointer-events-none"
      >
        <div className="pointer-events-auto w-full max-w-xl flex flex-col gap-2">

          {/* 슬래시 명령어 팝업 */}
          {showCommands && commands.length > 0 && (
            <div className="w-full bg-background-card border border-[#e94560]/30 rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-3 py-2 border-b border-border flex items-center gap-2">
                <img src="/symbol.svg" alt="AI" className="w-3.5 h-3.5" />
                <p className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">명령어 선택 후 내용을 입력하세요</p>
              </div>
              <div className="max-h-56 overflow-y-auto">
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

          {/* 대화 스레드 */}
          {messages.length > 0 && (
            <div className="w-full bg-background-card/95 backdrop-blur-md border border-border rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <div className="flex items-center gap-1.5">
                  <img src="/symbol.svg" alt="AI" className="w-3.5 h-3.5" />
                  <span className="text-[10px] text-text-muted font-semibold">NOAH AI</span>
                </div>
                <button
                  onClick={clearChat}
                  className="text-[10px] text-text-muted hover:text-text-primary transition-colors"
                >
                  대화 초기화
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto px-3 py-2 space-y-2">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed whitespace-pre-wrap break-words ${
                      msg.role === 'user'
                        ? 'bg-[#e94560] text-white rounded-br-sm'
                        : 'bg-border/40 text-text-primary rounded-bl-sm'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-border/40 px-3 py-2 rounded-xl rounded-bl-sm flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{animationDelay:'0ms'}}/>
                      <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{animationDelay:'150ms'}}/>
                      <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{animationDelay:'300ms'}}/>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
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

            {selectedTag && (
              <span className="flex items-center gap-1 bg-[#e94560]/15 text-[#e94560] text-xs px-2 py-1 rounded-lg flex-shrink-0 font-medium">
                {selectedTag.icon} {selectedTag.label}
                <button onClick={handleTagRemove} className="ml-0.5 hover:opacity-70 leading-none" aria-label="태그 제거">✕</button>
              </span>
            )}

            <input
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
                if (e.key === 'Escape') { setShowCommands(false); setInputValue(''); setSelectedTag(null); }
                if (e.key === 'Backspace' && !inputValue && selectedTag) handleTagRemove();
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
