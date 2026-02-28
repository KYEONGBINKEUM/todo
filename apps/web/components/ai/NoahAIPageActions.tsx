'use client';

import { useState, useRef, useEffect } from 'react';
import { useNoahAI } from '@/lib/noah-ai-context';
import { useI18n } from '@/lib/i18n-context';
import { callNoahAI } from '@/lib/noah-ai';
import type { NoahAIAction } from '@/lib/noah-ai-context';

export interface AIActionItem {
  id: string;
  label: string;
  icon: string;
  action: NoahAIAction;
  description: string;
}

interface NoahAIPageActionsProps {
  actions: AIActionItem[];
  getContext: (action: NoahAIAction) => Record<string, any>;
  onResult: (action: NoahAIAction, result: any) => void;
}

export default function NoahAIPageActions({ actions, getContext, onResult }: NoahAIPageActionsProps) {
  const { canUseAI, togglePanel } = useNoahAI();
  const { language } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleAction = async (item: AIActionItem) => {
    if (!canUseAI) {
      setOpen(false);
      togglePanel();
      return;
    }

    // For YouTube actions, need URL input
    if (item.action === 'youtube_to_note' || item.action === 'youtube_to_mindmap') {
      const url = prompt('YouTube URL을 입력하세요:');
      if (!url?.trim()) { setOpen(false); return; }
      setOpen(false);
      setLoading(true);
      setLoadingAction(item.id);
      try {
        const response = await callNoahAI(item.action, { url: url.trim() }, language);
        onResult(item.action, response.result);
      } catch (err) {
        console.error('AI action failed:', err);
      } finally {
        setLoading(false);
        setLoadingAction(null);
      }
      return;
    }

    // For mindmap generation, need text input
    if (item.action === 'generate_mindmap') {
      const text = prompt('마인드맵 주제를 입력하세요:');
      if (!text?.trim()) { setOpen(false); return; }
      setOpen(false);
      setLoading(true);
      setLoadingAction(item.id);
      try {
        const response = await callNoahAI(item.action, { text: text.trim() }, language);
        onResult(item.action, response.result);
      } catch (err) {
        console.error('AI action failed:', err);
      } finally {
        setLoading(false);
        setLoadingAction(null);
      }
      return;
    }

    setOpen(false);
    setLoading(true);
    setLoadingAction(item.id);
    try {
      const context = getContext(item.action);
      const response = await callNoahAI(item.action, context, language);
      onResult(item.action, response.result);
    } catch (err) {
      console.error('AI action failed:', err);
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => !loading && setOpen(!open)}
        disabled={loading}
        className={`h-7 px-2.5 flex items-center gap-1.5 rounded-lg text-[11px] font-semibold transition-all
          border border-[#e94560]/30
          ${loading
            ? 'bg-[#e94560]/20 text-[#e94560] animate-pulse'
            : 'bg-gradient-to-r from-[#e94560]/15 to-[#8b5cf6]/15 text-[#e94560] hover:from-[#e94560]/25 hover:to-[#8b5cf6]/25'
          }`}
      >
        {loading ? (
          <>
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span>AI 작업중...</span>
          </>
        ) : (
          <>
            <span className="text-xs font-bold">N</span> AI
          </>
        )}
      </button>

      {open && !loading && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-background-card border border-border rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border mb-1">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Noah AI</span>
          </div>
          {actions.map((item) => (
            <button
              key={item.id}
              onClick={() => handleAction(item)}
              className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-background-hover transition-colors"
            >
              <span className="text-sm flex-shrink-0">{item.icon}</span>
              <div className="min-w-0">
                <div className="text-xs font-medium text-text-primary truncate">{item.label}</div>
                <div className="text-[10px] text-text-muted truncate">{item.description}</div>
              </div>
            </button>
          ))}
          <div className="border-t border-border mt-1 pt-1">
            <button
              onClick={() => { setOpen(false); togglePanel(); }}
              className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-background-hover transition-colors"
            >
              <span className="text-sm flex-shrink-0">💬</span>
              <div className="text-xs font-medium text-text-muted">노아AI 채팅 열기</div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
