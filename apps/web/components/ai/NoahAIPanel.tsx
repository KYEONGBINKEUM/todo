'use client';

import { useState, useRef, useEffect } from 'react';
import { useNoahAI } from '@/lib/noah-ai-context';
import { useI18n } from '@/lib/i18n-context';
import { useDataStore } from '@/lib/data-store';
import { useAuth } from '@/lib/auth-context';
import { usePathname, useRouter } from 'next/navigation';
import { addNote as addNoteDB, addMindmap as addMindmapDB, addTask as addTaskDB, updateTask } from '@/lib/firestore';
import { callNoahAI, detectYouTubeURL } from '@/lib/noah-ai';
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
  const { t, language } = useI18n();
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

  /** Note intent: "OOO 노트에 기록/추가/작성해줘" */
  const detectNoteIntent = (msg: string): string | null => {
    const patterns = [
      /(.+?)\s*(?:를?|을?)?\s*노트에?\s*(?:기록|추가|저장|작성|써|적어)(?:줘|줄래|해줘|해|주세요)?/i,
      /노트에?\s+(.+?)(?:를?|을?)?\s*(?:기록|추가|저장|작성|써|적어)(?:줘|줄래|해줘|해|주세요)?/i,
      /(.+?)\s*(?:정보|레시피|내용|방법|가이드|설명)\s*(?:를?|을?)?\s*노트에/i,
      /(.+?)\s*노트\s*(?:작성|추가|기록)/i,
    ];
    for (const p of patterns) {
      const m = msg.match(p);
      if (m?.[1]?.trim()) return m[1].trim();
    }
    return null;
  };

  /** Task intent: "OOO 할일로 추가해줘" or "할일에 OOO 추가해줘" */
  const detectTaskIntent = (msg: string): string | null => {
    // Must NOT be a subtask request
    if (/하위\s*할일|서브태스크|subtask/i.test(msg)) return null;
    const patterns = [
      /(.+?)(?:를?|을?)?\s*할일(?:로|에)?\s*추가(?:해줘|해|줘|주세요)/i,
      /(?:할일에?|오늘의?\s*할일에?|태스크에?)\s+(.+?)(?:를?|을?)?\s*추가(?:해줘|해|줘|주세요)/i,
      /(.+?)(?:를?|을?)?\s*(?:오늘의?\s*)?할일에\s*(?:추가|등록)(?:해줘|해|줘|주세요)?/i,
      /(.+?)\s*(?:task|태스크)로?\s*추가(?:해줘|해|줘|주세요)/i,
    ];
    for (const p of patterns) {
      const m = msg.match(p);
      const title = m?.[1]?.trim();
      if (title && title.length > 0 && title.length < 100) return title;
    }
    return null;
  };

  /** Mindmap intent: "OOO 마인드맵 만들어줘" */
  const detectMindmapIntent = (msg: string): string | null => {
    const patterns = [
      /(.+?)\s*(?:에?\s*)?마인드맵\s*(?:만들어줘|생성해줘|그려줘|만들어주세요|생성해주세요|만들어|생성해)/i,
      /마인드맵\s+(.+?)(?:를?|을?)?\s*(?:만들어줘|생성해줘|그려줘|만들어|생성해)/i,
      /(.+?)\s*mind\s*map\s*(?:만들어줘|생성해줘|그려줘|만들어|생성해)/i,
    ];
    for (const p of patterns) {
      const m = msg.match(p);
      if (m?.[1]?.trim()) return m[1].trim();
    }
    return null;
  };

  /** Subtask intent: "OOO 할일에 하위 할일 AAA를 추가해줘" */
  const detectSubtaskIntent = (msg: string): { parentTitle: string; subtaskTitle: string } | null => {
    const patterns = [
      /(.+?)\s*(?:할일|task)에?\s+(?:하위\s*할일|서브태스크|subtask)\s+(.+?)(?:를?|을?)?\s*추가(?:해줘|해|줘|주세요)?/i,
      /(.+?)\s*에?\s+하위\s*할일\s+(.+?)(?:를?|을?)?\s*추가(?:해줘|해|줘|주세요)?/i,
      /(.+?)\s*에?\s+(.+?)\s*(?:를?|을?)?\s*하위\s*할일로?\s*추가(?:해줘|해|줘|주세요)?/i,
    ];
    for (const p of patterns) {
      const m = msg.match(p);
      if (m?.[1]?.trim() && m?.[2]?.trim()) {
        return { parentTitle: m[1].trim(), subtaskTitle: m[2].trim() };
      }
    }
    return null;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const msg = input.trim();
    if (!msg || isLoading || !user) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    // ── Subtask intent: add subTask to matching task ──
    const subtaskIntent = detectSubtaskIntent(msg);
    if (subtaskIntent) {
      insertMessage({ role: 'user', content: msg });
      const allTasks = dataStore.tasks || [];
      const parent = allTasks.find((t) =>
        t.title.toLowerCase().includes(subtaskIntent.parentTitle.toLowerCase()) ||
        subtaskIntent.parentTitle.toLowerCase().includes(t.title.toLowerCase())
      );
      if (!parent?.id) {
        insertMessage({ role: 'assistant', content: `"${subtaskIntent.parentTitle}" 할일을 찾지 못했어요. 할일 이름을 정확히 입력해 주세요.` });
        return;
      }
      try {
        const existing = (parent as any).subTasks || [];
        const newSub = { id: `sub-${Date.now()}`, title: subtaskIntent.subtaskTitle, completed: false };
        await updateTask(user.uid, parent.id, { subTasks: [...existing, newSub] });
        insertMessage({ role: 'assistant', content: `✅ "${parent.title}" 할일에 하위 항목 "${subtaskIntent.subtaskTitle}"을 추가했어요!` });
      } catch {
        insertMessage({ role: 'assistant', content: '하위 할일 추가에 실패했어요. 다시 시도해 주세요.' });
      }
      return;
    }

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
        insertMessage({ role: 'assistant', content: `✅ "${taskTitle}" 할일을 오늘의 할일에 추가했어요!` });
      } catch {
        insertMessage({ role: 'assistant', content: '할일 추가에 실패했어요. 다시 시도해 주세요.' });
      }
      return;
    }

    // ── Note intent: show confirm message first (no AI call = no token waste) ──
    const noteTopic = detectNoteIntent(msg);
    if (noteTopic) {
      insertMessage({ role: 'user', content: msg });
      insertMessage({
        role: 'assistant',
        content: `"${noteTopic}"를 노트에 기록해드릴까요?\n적용하기를 누르면 노트 페이지로 이동해 AI가 직접 작성해드립니다.`,
        action: 'confirm_write_note',
        structuredData: { topic: noteTopic },
      });
      return;
    }

    // ── Mindmap intent: generate mindmap from topic ──
    const mindmapTopic = detectMindmapIntent(msg);
    if (mindmapTopic) {
      await sendAction('generate_mindmap', { text: mindmapTopic, topic: mindmapTopic }, msg);
      return;
    }

    // ── YouTube URL: show choice buttons ──
    const youtubeUrl = detectYouTubeURL(msg);
    if (youtubeUrl) {
      insertMessage({ role: 'user', content: msg });
      insertMessage({
        role: 'assistant',
        content: 'YouTube 링크를 어떻게 변환할까요?',
        action: 'youtube_choice',
        structuredData: { url: youtubeUrl },
      });
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
  const [youtubeLoading, setYoutubeLoading] = useState<string | null>(null);

  const handleYoutubeChoice = async (url: string, action: 'youtube_to_note' | 'youtube_to_mindmap', msgId: string) => {
    if (!user) return;
    const loadingKey = `${msgId}-${action === 'youtube_to_note' ? 'note' : 'mindmap'}`;
    setYoutubeLoading(loadingKey);
    try {
      if (action === 'youtube_to_note') {
        router.push('/notes');
        await new Promise(r => setTimeout(r, 600));
        const response = await callNoahAI('youtube_to_note', { url }, language);
        const blocks = response.result?.blocks || response.result?.content?.blocks || [];
        if (blocks.length > 0) {
          const title = response.result?.title || response.result?.content?.title || 'YouTube 노트';
          window.dispatchEvent(new CustomEvent('noah-ai-stream-note', { detail: { title, blocks } }));
          insertMessage({ role: 'assistant', content: `✅ "${title}" 노트가 생성됐어요!` });
        } else {
          insertMessage({ role: 'assistant', content: '노트 생성에 실패했어요. 다시 시도해 주세요.' });
        }
      } else {
        router.push('/mindmap');
        await new Promise(r => setTimeout(r, 600));
        const response = await callNoahAI('youtube_to_mindmap', { url }, language);
        // Try multiple possible response structures from the cloud function
        const result = response.result;
        const nodes = result?.nodes || result?.mindmap?.nodes || result?.data?.nodes || [];
        const edges = result?.edges || result?.mindmap?.edges || result?.data?.edges || [];
        const title = result?.title || result?.mindmap?.title || 'YouTube 마인드맵';
        if (nodes.length > 0) {
          window.dispatchEvent(new CustomEvent('noah-ai-apply-mindmap', { detail: { ...result, nodes, edges, title } }));
          insertMessage({ role: 'assistant', content: `✅ "${title}" 마인드맵이 생성됐어요! (${nodes.length}개 노드)` });
        } else {
          // Fallback: try passing raw result (cloud function might structure differently)
          insertMessage({ role: 'assistant', content: `마인드맵 생성에 실패했어요. (결과: ${JSON.stringify(result)?.slice(0, 100)})` });
        }
      }
    } catch (err: any) {
      console.error('YouTube choice failed:', err);
      insertMessage({ role: 'assistant', content: `오류가 발생했어요: ${err?.message || err?.code || '다시 시도해 주세요.'}` });
    } finally {
      setYoutubeLoading(null);
    }
  };

  const handleApplyResult = async (data: any, action?: NoahAIAction, msgId?: string) => {
    if (!data || !user) return;
    setApplying(msgId || null);

    try {
      // Confirm write note: navigate to notes, call AI, then stream animation
      if (action === 'confirm_write_note' && data.topic) {
        router.push('/notes');
        await new Promise(r => setTimeout(r, 600));
        try {
          const response = await callNoahAI('auto_write_note', { title: data.topic, topic: data.topic }, language);
          if (response.result?.blocks && response.result.blocks.length > 0) {
            window.dispatchEvent(new CustomEvent('noah-ai-stream-note', {
              detail: { title: data.topic, blocks: response.result.blocks }
            }));
          }
        } catch (err) {
          console.error('Failed to generate note content:', err);
        }
        return;
      }

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

      // Mindmap actions: create a new mindmap (try multiple response structures)
      if (action === 'generate_mindmap' || action === 'youtube_to_mindmap') {
        const rawNodes = data.nodes || data.mindmap?.nodes || data.data?.nodes || [];
        const rawEdges = data.edges || data.mindmap?.edges || data.data?.edges || [];
        if (rawNodes.length === 0) return;
        const nodes = rawNodes.map((n: any) => ({
          id: n.id || `ai-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          text: n.text || '',
          x: n.x ?? 400, y: n.y ?? 300,
          width: n.width || 180, height: n.height || 70,
          color: n.color || '#e94560',
        }));
        const edges = rawEdges.map((e: any) => ({
          id: e.id || `edge-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          from: e.from, to: e.to, style: e.style || 'curved',
        }));
        await addMindmapDB(user.uid, {
          title: data.title || data.mindmap?.title || 'AI 마인드맵',
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
                    {/* YouTube choice buttons */}
                    {msg.role === 'assistant' && msg.action === 'youtube_choice' && msg.structuredData?.url && (
                      <div className="mt-2 flex gap-1.5">
                        <button
                          onClick={() => handleYoutubeChoice(msg.structuredData.url, 'youtube_to_note', msg.id)}
                          disabled={youtubeLoading !== null}
                          className="flex-1 py-1.5 px-2 rounded-lg text-xs font-medium
                            bg-[#e94560]/10 text-[#e94560] hover:bg-[#e94560]/20
                            border border-[#e94560]/20 disabled:opacity-50 transition-colors"
                        >
                          {youtubeLoading === `${msg.id}-note` ? '생성 중...' : '📝 노트로 생성'}
                        </button>
                        <button
                          onClick={() => handleYoutubeChoice(msg.structuredData.url, 'youtube_to_mindmap', msg.id)}
                          disabled={youtubeLoading !== null}
                          className="flex-1 py-1.5 px-2 rounded-lg text-xs font-medium
                            bg-[#8b5cf6]/10 text-[#8b5cf6] hover:bg-[#8b5cf6]/20
                            border border-[#8b5cf6]/20 disabled:opacity-50 transition-colors"
                        >
                          {youtubeLoading === `${msg.id}-mindmap` ? '생성 중...' : '🧠 마인드맵으로'}
                        </button>
                      </div>
                    )}
                    {/* Apply button for structured data */}
                    {msg.role === 'assistant' && msg.structuredData && !msg.isLoading && msg.action !== 'chat' && msg.action !== 'youtube_choice' && (
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
