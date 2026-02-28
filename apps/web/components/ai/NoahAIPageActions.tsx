'use client';

import { useState, useRef, useEffect } from 'react';
import { useNoahAI } from '@/lib/noah-ai-context';
import type { NoahAIAction } from '@/lib/noah-ai-context';

interface AIActionItem {
  id: string;
  label: string;
  icon: string;
  action: NoahAIAction;
  description: string;
}

interface NoahAIPageActionsProps {
  actions: AIActionItem[];
  getContext: (action: NoahAIAction) => Record<string, any>;
  onYouTubePrompt?: () => void;
}

export default function NoahAIPageActions({ actions, getContext, onYouTubePrompt }: NoahAIPageActionsProps) {
  const { sendAction, isLoading, canUseAI, togglePanel } = useNoahAI();
  const [open, setOpen] = useState(false);
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
    setOpen(false);

    if (!canUseAI) {
      togglePanel();
      return;
    }

    // For YouTube actions, need URL input
    if (item.action === 'youtube_to_note' || item.action === 'youtube_to_mindmap') {
      const url = prompt('YouTube URL을 입력하세요:');
      if (!url?.trim()) return;
      togglePanel();
      await sendAction(item.action, { url: url.trim() }, `${item.label}: ${url.trim()}`);
      return;
    }

    const context = getContext(item.action);
    togglePanel();
    await sendAction(item.action, context, item.label);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="h-7 px-2.5 flex items-center gap-1.5 rounded-lg text-[11px] font-semibold transition-all
          bg-gradient-to-r from-[#e94560]/15 to-[#8b5cf6]/15 text-[#e94560] border border-[#e94560]/30
          hover:from-[#e94560]/25 hover:to-[#8b5cf6]/25"
      >
        <span className="text-xs font-bold">N</span> AI
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-56 bg-background-card border border-border rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border mb-1">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Noah AI</span>
          </div>
          {actions.map((item) => (
            <button
              key={item.id}
              onClick={() => handleAction(item)}
              disabled={isLoading}
              className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-background-hover transition-colors disabled:opacity-40"
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
