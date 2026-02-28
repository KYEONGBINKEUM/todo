'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from './auth-context';
import { getUserSettings, type Plan } from './firestore';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { callNoahAI, detectYouTubeURL } from './noah-ai';

// ============================================================================
// AI Types (inlined to avoid shared package import issues)
// ============================================================================

export type NoahAIAction =
  | 'chat'
  | 'suggest_tasks'
  | 'prioritize'
  | 'schedule'
  | 'breakdown'
  | 'auto_write_note'
  | 'complete_note'
  | 'youtube_to_note'
  | 'youtube_to_mindmap'
  | 'generate_mindmap';

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action?: NoahAIAction;
  timestamp: number;
  structuredData?: any;
  isLoading?: boolean;
}

export interface AISuggestionChip {
  id: string;
  label: string;
  action: NoahAIAction;
  icon: string;
  description?: string;
}

// ============================================================================
// Suggestion chips per page
// ============================================================================

function getSuggestionsForPage(page: string, t: (key: string) => string): AISuggestionChip[] {
  switch (page) {
    case '/my-day':
      return [
        { id: 'prioritize', label: t('ai.chip.prioritize'), action: 'prioritize', icon: '🎯' },
        { id: 'suggest', label: t('ai.chip.suggest'), action: 'suggest_tasks', icon: '💡' },
        { id: 'breakdown', label: t('ai.chip.breakdown'), action: 'breakdown', icon: '📋' },
      ];
    case '/tasks':
      return [
        { id: 'prioritize', label: t('ai.chip.prioritize'), action: 'prioritize', icon: '🎯' },
        { id: 'suggest', label: t('ai.chip.suggest'), action: 'suggest_tasks', icon: '💡' },
        { id: 'schedule', label: t('ai.chip.schedule'), action: 'schedule', icon: '📅' },
      ];
    case '/upcoming':
      return [
        { id: 'schedule', label: t('ai.chip.schedule'), action: 'schedule', icon: '📅' },
        { id: 'suggest', label: t('ai.chip.suggest'), action: 'suggest_tasks', icon: '💡' },
      ];
    case '/notes':
      return [
        { id: 'auto_write', label: t('ai.chip.autoWrite'), action: 'auto_write_note', icon: '✍️' },
        { id: 'complete', label: t('ai.chip.completeNote'), action: 'complete_note', icon: '📝' },
        { id: 'youtube_note', label: t('ai.chip.youtubeNote'), action: 'youtube_to_note', icon: '🎬' },
      ];
    case '/mindmap':
      return [
        { id: 'generate_mindmap', label: t('ai.chip.generateMindmap'), action: 'generate_mindmap', icon: '🧠' },
        { id: 'youtube_mindmap', label: t('ai.chip.youtubeMindmap'), action: 'youtube_to_mindmap', icon: '🎬' },
      ];
    case '/important':
      return [
        { id: 'prioritize', label: t('ai.chip.prioritize'), action: 'prioritize', icon: '🎯' },
        { id: 'suggest', label: t('ai.chip.suggest'), action: 'suggest_tasks', icon: '💡' },
      ];
    default:
      return [
        { id: 'suggest', label: t('ai.chip.suggest'), action: 'suggest_tasks', icon: '💡' },
      ];
  }
}

// ============================================================================
// Context types
// ============================================================================

interface NoahAIContextType {
  isPanelOpen: boolean;
  isLoading: boolean;
  messages: AIMessage[];
  suggestions: AISuggestionChip[];
  monthlyUsage: { used: number; limit: number } | null;
  canUseAI: boolean;
  isAdmin: boolean;
  plan: Plan;
  togglePanel: () => void;
  closePanel: () => void;
  sendAction: (action: NoahAIAction, context: Record<string, any>, userMessage?: string) => Promise<void>;
  sendMessage: (message: string) => Promise<void>;
  clearMessages: () => void;
}

const NoahAIContext = createContext<NoahAIContextType | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface NoahAIProviderProps {
  children: ReactNode;
  t: (key: string) => string;
  language: string;
}

export function NoahAIProvider({ children, t, language }: NoahAIProviderProps) {
  const { user } = useAuth();
  const pathname = usePathname();

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [monthlyUsage, setMonthlyUsage] = useState<{ used: number; limit: number } | null>(null);
  const [plan, setPlan] = useState<Plan>('free');
  const [isAdmin, setIsAdmin] = useState(false);

  // Derive page from pathname
  const currentPage = pathname || '/my-day';
  const suggestions = getSuggestionsForPage(currentPage, t);
  const canUseAI = plan !== 'free' || isAdmin;

  // Load user settings
  useEffect(() => {
    if (!user) return;
    getUserSettings(user.uid).then((settings) => {
      setPlan(settings.plan || 'free');
      setIsAdmin(settings.isAdmin || false);
    });
  }, [user]);

  // Load monthly usage
  useEffect(() => {
    if (!user || !canUseAI) return;
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const usageRef = doc(db, 'users', user.uid, 'ai_usage', monthKey);
    getDoc(usageRef).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const used = (data.totalInputTokens || 0) + (data.totalOutputTokens || 0);
        const limit = isAdmin ? -1 : (plan === 'team' ? 2000000 : 500000);
        setMonthlyUsage({ used, limit });
      } else {
        const limit = isAdmin ? -1 : (plan === 'team' ? 2000000 : 500000);
        setMonthlyUsage({ used: 0, limit });
      }
    });
  }, [user, canUseAI, plan, isAdmin]);

  const togglePanel = useCallback(() => setIsPanelOpen((prev) => !prev), []);
  const closePanel = useCallback(() => setIsPanelOpen(false), []);

  // Listen for 'noah-ai-open' events from in-page AI buttons
  useEffect(() => {
    const handleOpen = () => {
      setIsPanelOpen(true);
    };
    window.addEventListener('noah-ai-open', handleOpen);
    return () => window.removeEventListener('noah-ai-open', handleOpen);
  }, []);

  const addMessage = useCallback((msg: Omit<AIMessage, 'id' | 'timestamp'>) => {
    const newMsg: AIMessage = {
      ...msg,
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, newMsg]);
    return newMsg.id;
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<AIMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  }, []);

  const sendAction = useCallback(
    async (action: NoahAIAction, context: Record<string, any>, userMessage?: string) => {
      if (!user || isLoading) return;

      // Add user message
      const chipLabel = suggestions.find((s) => s.action === action)?.label || action;
      addMessage({
        role: 'user',
        content: userMessage || chipLabel,
        action,
      });

      // Add loading message
      const loadingId = addMessage({
        role: 'assistant',
        content: t('ai.thinking'),
        isLoading: true,
      });

      setIsLoading(true);

      try {
        const response = await callNoahAI(action, context, language);

        // Update loading message with result
        updateMessage(loadingId, {
          content: formatResult(action, response.result, t),
          isLoading: false,
          structuredData: response.result,
        });

        // Update monthly usage
        if (response.monthlyUsage) {
          setMonthlyUsage(response.monthlyUsage);
        }
      } catch (error: any) {
        const errorMsg = getErrorMessage(error, t);
        updateMessage(loadingId, {
          content: errorMsg,
          isLoading: false,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [user, isLoading, language, suggestions, t, addMessage, updateMessage]
  );

  const sendMessage = useCallback(
    async (message: string) => {
      if (!user || isLoading || !message.trim()) return;

      // Check for YouTube URL
      const youtubeUrl = detectYouTubeURL(message);
      if (youtubeUrl) {
        // Determine action based on current page
        const action: NoahAIAction = currentPage === '/mindmap' ? 'youtube_to_mindmap' : 'youtube_to_note';
        await sendAction(action, { url: youtubeUrl }, message);
        return;
      }

      // Default: general chat conversation
      await sendAction('chat', { userInput: message, currentPage }, message);
    },
    [user, isLoading, currentPage, sendAction]
  );

  const clearMessages = useCallback(() => setMessages([]), []);

  return (
    <NoahAIContext.Provider
      value={{
        isPanelOpen,
        isLoading,
        messages,
        suggestions,
        monthlyUsage,
        canUseAI,
        isAdmin,
        plan,
        togglePanel,
        closePanel,
        sendAction,
        sendMessage,
        clearMessages,
      }}
    >
      {children}
    </NoahAIContext.Provider>
  );
}

export function useNoahAI() {
  const ctx = useContext(NoahAIContext);
  if (!ctx) throw new Error('useNoahAI must be used within NoahAIProvider');
  return ctx;
}

// ============================================================================
// Helpers
// ============================================================================

function formatResult(action: NoahAIAction, result: any, t: (key: string) => string): string {
  if (!result) return t('ai.noResult');

  switch (action) {
    case 'chat': {
      return result.reply || result.text || JSON.stringify(result);
    }
    case 'suggest_tasks': {
      const suggestions = result.suggestions || [];
      if (suggestions.length === 0) return t('ai.noSuggestions');
      return suggestions.map((s: any) => `• **${s.title}** (${s.priority})\n  ${s.reason}`).join('\n\n');
    }
    case 'prioritize': {
      const priorities = result.priorities || [];
      if (priorities.length === 0) return t('ai.noResult');
      return priorities.map((p: any, i: number) => `${i + 1}. ${p.reason} (${p.suggestedPriority})`).join('\n');
    }
    case 'schedule': {
      const schedule = result.schedule || [];
      return schedule.map((s: any) => `📅 ${s.suggestedDate} (${s.timeSlot}): ${s.reason}`).join('\n');
    }
    case 'breakdown': {
      const subtasks = result.subtasks || [];
      return subtasks.map((s: any) => `☐ ${s.title} (~${s.estimatedMinutes}min)`).join('\n');
    }
    case 'auto_write_note':
    case 'complete_note':
    case 'youtube_to_note': {
      const blocks = result.blocks || [];
      return blocks.map((b: any) => {
        const prefix = b.type === 'heading1' ? '# ' : b.type === 'heading2' ? '## ' : b.type === 'heading3' ? '### ' : b.type === 'bullet' ? '• ' : b.type === 'todo' ? '☐ ' : b.type === 'quote' ? '> ' : '';
        return prefix + (b.content || '');
      }).join('\n');
    }
    case 'youtube_to_mindmap':
    case 'generate_mindmap': {
      const nodes = result.nodes || [];
      return `🧠 ${t('ai.mindmapGenerated')} (${nodes.length} ${t('ai.nodes')})`;
    }
    default:
      return JSON.stringify(result, null, 2);
  }
}

function getErrorMessage(error: any, t: (key: string) => string): string {
  const code = error?.code || '';
  if (code.includes('permission-denied')) return t('ai.upgradeRequired');
  if (code.includes('resource-exhausted')) return t('ai.tokenExhausted');
  if (code.includes('unauthenticated')) return t('ai.loginRequired');
  if (code.includes('failed-precondition')) return error.message || t('ai.error');
  return t('ai.error');
}
