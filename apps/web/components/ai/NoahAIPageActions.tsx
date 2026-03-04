'use client';

import { useState, useRef, useEffect } from 'react';
import { useNoahAI } from '@/lib/noah-ai-context';
import { useI18n } from '@/lib/i18n-context';
import { callNoahAI } from '@/lib/noah-ai';
import type { NoahAIAction } from '@/lib/noah-ai-context';
import NoahAIUpgradePrompt from './NoahAIUpgradePrompt';

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
  const { language, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [inputMode, setInputMode] = useState<{ item: AIActionItem; placeholder: string } | null>(null);
  const [inputValue, setInputValue] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setInputMode(null);
        setInputValue('');
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Auto-focus input when input mode is activated
  useEffect(() => {
    if (inputMode) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [inputMode]);

  const handleInputSubmit = async () => {
    if (!inputMode || !inputValue.trim()) return;
    const item = inputMode.item;
    const value = inputValue.trim();
    setInputMode(null);
    setInputValue('');
    setOpen(false);
    setLoading(true);
    setLoadingAction(item.id);
    try {
      const isYoutube = item.action === 'youtube_to_note' || item.action === 'youtube_to_mindmap';
      const context = isYoutube ? { url: value } : { text: value };
      const response = await callNoahAI(item.action, context, language);
      onResult(item.action, response.result);
    } catch (err) {
      console.error('AI action failed:', err);
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  };

  const handleAction = async (item: AIActionItem) => {
    if (!canUseAI) {
      setOpen(false);
      setShowUpgrade(true);
      return;
    }

    // Actions that need text input: show inline input instead of prompt()
    if (
      item.action === 'youtube_to_note' ||
      item.action === 'youtube_to_mindmap' ||
      item.action === 'generate_mindmap'
    ) {
      const isYoutube = item.action === 'youtube_to_note' || item.action === 'youtube_to_mindmap';
      setInputMode({
        item,
        placeholder: isYoutube ? 'YouTube URL을 입력하세요...' : '마인드맵 주제를 입력하세요...',
      });
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
            <span>{t('ai.thinking')}</span>
          </>
        ) : (
          <>
            <img src="/symbol.svg" alt="NOAH" className="w-3.5 h-3.5 rounded-sm" /> AI
          </>
        )}
      </button>

      {open && !loading && (
        <div className="absolute right-0 top-full mt-1.5 w-64 bg-background-card border border-border rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border mb-1">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Noah AI</span>
          </div>

          {/* Inline input for actions that need text */}
          {inputMode ? (
            <div className="px-3 py-2">
              <p className="text-[10px] text-text-muted mb-1.5 font-medium">{inputMode.item.label}</p>
              <div className="flex gap-1.5">
                <input
                  ref={inputRef}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleInputSubmit();
                    if (e.key === 'Escape') { setInputMode(null); setInputValue(''); }
                  }}
                  placeholder={inputMode.placeholder}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-background border border-border rounded-lg
                    focus:outline-none focus:border-[#e94560] text-text-primary placeholder:text-text-muted"
                />
                <button
                  onClick={handleInputSubmit}
                  disabled={!inputValue.trim()}
                  className="px-2.5 py-1.5 text-xs bg-gradient-to-r from-[#e94560] to-[#8b5cf6]
                    text-white rounded-lg disabled:opacity-40 font-medium"
                >
                  →
                </button>
              </div>
              <button
                onClick={() => { setInputMode(null); setInputValue(''); }}
                className="mt-1.5 text-[10px] text-text-muted hover:text-text-secondary"
              >
                ← 뒤로
              </button>
            </div>
          ) : (
            <>
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
                  onClick={() => { setOpen(false); if (!canUseAI) { setShowUpgrade(true); } else { togglePanel(); } }}
                  className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-background-hover transition-colors"
                >
                  <span className="text-sm flex-shrink-0">💬</span>
                  <div className="text-xs font-medium text-text-muted">{t('ai.openPanel')}</div>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {showUpgrade && <NoahAIUpgradePrompt onClose={() => setShowUpgrade(false)} />}
    </div>
  );
}
