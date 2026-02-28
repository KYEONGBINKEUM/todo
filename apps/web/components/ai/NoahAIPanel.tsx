'use client';

import { useState, useRef, useEffect } from 'react';
import { useNoahAI } from '@/lib/noah-ai-context';
import { useI18n } from '@/lib/i18n-context';
import { useDataStore } from '@/lib/data-store';
import { usePathname } from 'next/navigation';
import NoahAISuggestionChip from './NoahAISuggestionChip';
import NoahAIUsageBar from './NoahAIUsageBar';
import type { AISuggestionChip as ChipType, NoahAIAction } from '@/lib/noah-ai-context';

export default function NoahAIPanel() {
  const {
    isPanelOpen,
    isLoading,
    messages,
    suggestions,
    monthlyUsage,
    closePanel,
    sendAction,
    sendMessage,
    clearMessages,
  } = useNoahAI();
  const { t } = useI18n();
  const dataStore = useDataStore();
  const pathname = usePathname();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isPanelOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isPanelOpen]);

  const getContextForAction = (action: NoahAIAction): Record<string, any> => {
    const tasks = dataStore.tasks || [];
    const notes = dataStore.notes || [];
    const mindmaps = dataStore.mindmaps || [];

    switch (action) {
      case 'suggest_tasks':
      case 'prioritize':
      case 'schedule': {
        // Send minimal task data for token efficiency
        const taskSummaries = tasks.slice(0, 20).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate || null,
          myDay: t.myDay,
        }));
        return { tasks: taskSummaries };
      }
      case 'breakdown': {
        // Use the first selected/starred task or first incomplete task
        const targetTask = tasks.find((t) => t.starred && t.status !== 'completed')
          || tasks.find((t) => t.status !== 'completed');
        return { task: targetTask ? { title: targetTask.title, memo: targetTask.memo } : {} };
      }
      case 'auto_write_note': {
        // Use the first note or provide empty context
        const note = notes[0];
        return note
          ? { title: note.title, existingBlocks: (note.blocks || []).slice(0, 10) }
          : { title: '' };
      }
      case 'complete_note': {
        const note = notes[0];
        return note
          ? { title: note.title, blocks: (note.blocks || []).slice(-15) }
          : { title: '', blocks: [] };
      }
      case 'generate_mindmap': {
        const mm = mindmaps[0];
        return mm
          ? { text: mm.title, existingNodes: (mm.nodes || []).slice(0, 10) }
          : { text: '' };
      }
      default:
        return {};
    }
  };

  const handleChipClick = (chip: ChipType) => {
    const context = getContextForAction(chip.action);
    sendAction(chip.action, context);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleApplyResult = (data: any, action?: NoahAIAction) => {
    if (!data) return;

    // Apply note blocks
    if ((action === 'auto_write_note' || action === 'complete_note' || action === 'youtube_to_note') && data.blocks) {
      // Dispatch custom event for the notes page to handle
      window.dispatchEvent(new CustomEvent('noah-ai-apply-note', { detail: data }));
    }

    // Apply mindmap
    if ((action === 'generate_mindmap' || action === 'youtube_to_mindmap') && data.nodes) {
      window.dispatchEvent(new CustomEvent('noah-ai-apply-mindmap', { detail: data }));
    }

    // Apply task suggestions
    if (action === 'suggest_tasks' && data.suggestions) {
      window.dispatchEvent(new CustomEvent('noah-ai-apply-tasks', { detail: data }));
    }

    // Apply task breakdown
    if (action === 'breakdown' && data.subtasks) {
      window.dispatchEvent(new CustomEvent('noah-ai-apply-subtasks', { detail: data }));
    }
  };

  if (!isPanelOpen) return null;

  return (
    <>
      {/* Backdrop (mobile) */}
      <div
        className="fixed inset-0 bg-black/30 z-[45] md:hidden"
        onClick={closePanel}
      />

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 bottom-0 z-[50] w-full md:w-[400px] bg-background-card border-l border-border
          shadow-2xl flex flex-col transition-transform duration-300 ease-out
          ${isPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#e94560] to-[#8b5cf6] flex items-center justify-center">
              <span className="text-sm font-bold text-white">N</span>
            </div>
            <div>
              <h2 className="text-sm font-bold text-text-primary">{t('ai.name')}</h2>
              <div className="w-32 mt-0.5">
                {monthlyUsage && (
                  <NoahAIUsageBar used={monthlyUsage.used} limit={monthlyUsage.limit} />
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearMessages}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-background-hover hover:text-text-secondary transition-colors"
                title={t('ai.clearChat')}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            <button
              onClick={closePanel}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-background-hover hover:text-text-secondary transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Suggestion Chips */}
        <div className="px-4 py-3 border-b border-border flex-shrink-0">
          <p className="text-[11px] text-text-muted mb-2 font-medium uppercase tracking-wide">
            {t('ai.suggestions')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((chip) => (
              <NoahAISuggestionChip
                key={chip.id}
                chip={chip}
                onClick={handleChipClick}
                disabled={isLoading}
              />
            ))}
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-[#e94560]/20 to-[#8b5cf6]/20 flex items-center justify-center mb-4">
                <span className="text-2xl">🤖</span>
              </div>
              <p className="text-sm font-medium text-text-primary mb-1">{t('ai.greeting')}</p>
              <p className="text-xs text-text-muted max-w-[250px]">{t('ai.greetingDescription')}</p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-[#e94560] to-[#8b5cf6] text-white rounded-br-md'
                    : 'bg-background-hover text-text-primary rounded-bl-md'
                }`}
              >
                {msg.isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-text-muted text-xs">{t('ai.thinking')}</span>
                  </div>
                ) : (
                  <>
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    {/* Apply button for structured data */}
                    {msg.role === 'assistant' && msg.structuredData && !msg.isLoading && (
                      <button
                        onClick={() => handleApplyResult(msg.structuredData, msg.action)}
                        className="mt-2 w-full py-1.5 px-3 rounded-lg text-xs font-medium
                          bg-[#e94560]/10 text-[#e94560] hover:bg-[#e94560]/20
                          transition-colors border border-[#e94560]/20"
                      >
                        {t('ai.apply')}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form
          onSubmit={handleSubmit}
          className="px-4 py-3 border-t border-border flex-shrink-0"
        >
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t('ai.inputPlaceholder')}
              disabled={isLoading}
              className="flex-1 px-3.5 py-2.5 rounded-xl text-sm bg-background border border-border
                text-text-primary placeholder:text-text-muted
                focus:outline-none focus:border-[#e94560] focus:ring-1 focus:ring-[#e94560]/30
                disabled:opacity-50 transition-colors"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="w-10 h-10 flex items-center justify-center rounded-xl
                bg-gradient-to-r from-[#e94560] to-[#8b5cf6] text-white
                disabled:opacity-40 hover:opacity-90 transition-opacity active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19V5m0 0l-7 7m7-7l7 7" />
              </svg>
            </button>
          </div>
          <p className="text-[10px] text-text-muted mt-1.5 text-center">
            {t('ai.inputHint')}
          </p>
        </form>
      </div>
    </>
  );
}
