'use client';

import { useState, useRef, useEffect } from 'react';
import { useNoahAI } from '@/lib/noah-ai-context';
import { useI18n } from '@/lib/i18n-context';
import { useDataStore } from '@/lib/data-store';
import { useAuth } from '@/lib/auth-context';
import { usePathname, useRouter } from 'next/navigation';
import { addNote as addNoteDB, addMindmap as addMindmapDB, addTask as addTaskDB, updateTask } from '@/lib/firestore';
import NoahAISuggestionChip from './NoahAISuggestionChip';
import NoahAIUsageBar from './NoahAIUsageBar';
import type { AISuggestionChip as ChipType, NoahAIAction } from '@/lib/noah-ai-context';

export default function NoahAIPanel() {
  const { user } = useAuth();
  const router = useRouter();
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
    insertMessage,
  } = useNoahAI();
  const { t } = useI18n();
  const dataStore = useDataStore();
  const lists = dataStore.lists || [];
  const pathname = usePathname();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // ── Intent detection helpers ──────────────────────────────────────────────

  /** Returns the topic string if the message is asking to add a note/write content */
  const detectNoteIntent = (msg: string): string | null => {
    const patterns = [
      /(?:노트에?|note에?)\s+(.+?)(?:를?|을?)?\s*(?:추가|저장|작성|써|적어)(?:줘|줄래|해줘|해)?/i,
      /(.+?)\s*(?:레시피|정보|내용|방법|가이드|설명)\s*(?:를?|을?)?\s*노트에?\s*(?:추가|저장|작성)/i,
      /(.+?)\s*(?:에\s*대한?|관련\s*)?노트\s*(?:작성|추가)/i,
    ];
    for (const p of patterns) {
      const m = msg.match(p);
      if (m?.[1]) return m[1].trim();
    }
    // Fallback: contains "노트에" anywhere
    if (/노트에/.test(msg)) return msg.replace(/노트에?\s*(추가|저장|작성)?해?줘?/g, '').trim() || msg;
    return null;
  };

  /** Returns the task title if the message is asking to add a task */
  const detectTaskIntent = (msg: string): string | null => {
    const patterns = [
      /(?:할일에?|오늘의?\s*할일에?|태스크에?|task에?)\s+(.+?)(?:를?|을?)?\s*(?:추가|등록|넣어)(?:줘|줄래|해줘|해)?/i,
      /(.+?)(?:를?|을?)?\s*(?:할일에?|오늘의?\s*할일에?|태스크에?)\s*(?:추가|등록)/i,
    ];
    for (const p of patterns) {
      const m = msg.match(p);
      if (m?.[1]) return m[1].trim();
    }
    return null;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const msg = input.trim();
    if (!msg || isLoading || !user) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    // ── Task intent: add directly to Firestore ──
    const taskTitle = detectTaskIntent(msg);
    if (taskTitle) {
      insertMessage({ role: 'user', content: msg });
      try {
        const today = new Date();
        const createdDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        await addTaskDB(user.uid, {
          title: taskTitle,
          status: 'todo',
          priority: 'medium',
          starred: false,
          listId: lists[0]?.id || '',
          myDay: true,
          tags: [],
          order: Date.now(),
          createdDate,
        });
        insertMessage({ role: 'assistant', content: `✅ "${taskTitle}" 할일을 추가했어요!` });
        router.push('/my-day');
      } catch {
        insertMessage({ role: 'assistant', content: '할일 추가에 실패했어요. 다시 시도해 주세요.' });
      }
      return;
    }

    // ── Note intent: route to auto_write_note so AI writes content + apply button appears ──
    const noteTopic = detectNoteIntent(msg);
    if (noteTopic) {
      await sendAction('auto_write_note', { title: noteTopic, topic: noteTopic }, msg);
      return;
    }

    // ── Default: general chat ──
    sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      handleSubmit();
    }
    // Shift+Enter or Alt+Enter = newline (default behavior)
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  };

  const [applying, setApplying] = useState<string | null>(null);

  const handleApplyResult = async (data: any, action?: NoahAIAction, msgId?: string) => {
    if (!data || !user) return;
    setApplying(msgId || null);

    try {
      // Note actions: create a new note with AI blocks
      if ((action === 'auto_write_note' || action === 'complete_note' || action === 'youtube_to_note') && data.blocks) {
        const blocks = data.blocks.map((b: any, i: number) => ({
          id: `${Date.now()}-ai-${i}`,
          type: b.type || 'text',
          content: b.content || '',
        }));
        await addNoteDB(user.uid, {
          title: data.title || 'AI 노트',
          icon: '🤖',
          blocks,
          pinned: false,
          tags: [],
          folderId: null,
          linkedTaskId: null,
          linkedTaskIds: [],
        });
        router.push('/notes');
      }

      // Mindmap actions: create a new mindmap
      if ((action === 'generate_mindmap' || action === 'youtube_to_mindmap') && data.nodes) {
        const nodes = data.nodes.map((n: any) => ({
          id: n.id || `ai-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          text: n.text || '',
          x: n.x ?? 400, y: n.y ?? 300,
          width: n.width || 180, height: n.height || 70,
          color: n.color || '#e94560',
        }));
        const edges = (data.edges || []).map((e: any) => ({
          id: e.id || `edge-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          from: e.from, to: e.to, style: e.style || 'curved',
        }));
        await addMindmapDB(user.uid, {
          title: data.title || 'AI 마인드맵',
          nodes, edges,
          viewportX: 0, viewportY: 0, zoom: 1,
        });
        router.push('/mindmap');
      }

      // Task actions: directly write to Firestore
      if (action === 'suggest_tasks' && data.suggestions) {
        const today = new Date();
        const createdDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const listId = lists[0]?.id || '';
        for (const s of data.suggestions) {
          await addTaskDB(user.uid, {
            title: s.title, status: 'todo', priority: s.priority || 'medium',
            starred: false, listId, myDay: true,
            tags: [], order: Date.now(), createdDate,
          });
        }
        router.push('/tasks');
      }
      if (action === 'breakdown' && data.subtasks) {
        const today = new Date();
        const createdDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const listId = lists[0]?.id || '';
        for (const s of data.subtasks) {
          await addTaskDB(user.uid, {
            title: s.title, status: 'todo', priority: 'medium',
            starred: false, listId, myDay: true,
            tags: [], order: Date.now(), createdDate,
          });
        }
        router.push('/tasks');
      }
      if (action === 'prioritize' && data.priorities) {
        for (const p of data.priorities) {
          if (p.taskId) {
            await updateTask(user.uid, p.taskId, { priority: p.suggestedPriority });
          }
        }
        router.push('/tasks');
      }
      if (action === 'schedule' && data.schedule) {
        for (const s of data.schedule) {
          if (s.taskId && s.suggestedDate) {
            await updateTask(user.uid, s.taskId, { dueDate: s.suggestedDate });
          }
        }
        router.push('/upcoming');
      }
    } catch (err) {
      console.error('Apply failed:', err);
    } finally {
      setApplying(null);
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
            <img src="/symbol.svg" alt="NOAH" className="w-8 h-8 rounded-full" />
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
              <img src="/symbol.svg" alt="NOAH" className="w-16 h-16 mb-4" />
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
                    {msg.role === 'assistant' && msg.structuredData && !msg.isLoading && msg.action !== 'chat' && (
                      <button
                        onClick={() => handleApplyResult(msg.structuredData, msg.action, msg.id)}
                        disabled={applying === msg.id}
                        className="mt-2 w-full py-1.5 px-3 rounded-lg text-xs font-medium
                          bg-[#e94560]/10 text-[#e94560] hover:bg-[#e94560]/20
                          transition-colors border border-[#e94560]/20 disabled:opacity-50"
                      >
                        {applying === msg.id ? t('common.loading') : t('ai.apply')}
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
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={t('ai.inputPlaceholder')}
              disabled={isLoading}
              rows={1}
              className="flex-1 px-3.5 py-2.5 rounded-xl text-sm bg-background border border-border
                text-text-primary placeholder:text-text-muted resize-none
                focus:outline-none focus:border-[#e94560] focus:ring-1 focus:ring-[#e94560]/30
                disabled:opacity-50 transition-colors"
              style={{ maxHeight: '120px' }}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl
                bg-gradient-to-r from-[#e94560] to-[#8b5cf6] text-white
                disabled:opacity-40 hover:opacity-90 transition-opacity active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19V5m0 0l-7 7m7-7l7 7" />
              </svg>
            </button>
          </div>
          <p className="text-[10px] text-text-muted mt-1.5 text-center">
            Enter: {t('ai.send')} · Shift+Enter / Alt+Enter: {t('ai.newline')}
          </p>
        </form>
      </div>
    </>
  );
}
