'use client';

import { useState } from 'react';
import { useNoahAI } from '@/lib/noah-ai-context';
import { useI18n } from '@/lib/i18n-context';
import NoahAIPanel from './NoahAIPanel';
import NoahAIUpgradePrompt from './NoahAIUpgradePrompt';

export default function NoahAIButton() {
  const { isPanelOpen, togglePanel, canUseAI, isLoading } = useNoahAI();
  const { t } = useI18n();
  const [showUpgrade, setShowUpgrade] = useState(false);

  const handleClick = () => {
    if (!canUseAI) {
      setShowUpgrade(true);
      return;
    }
    togglePanel();
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={handleClick}
        className={`fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full
          bg-gradient-to-r from-[#e94560] to-[#8b5cf6]
          shadow-lg shadow-[#e94560]/25
          flex items-center justify-center
          hover:shadow-xl hover:shadow-[#e94560]/30 hover:scale-105
          active:scale-95 transition-all duration-200
          ${isLoading ? 'animate-pulse' : ''}
          ${isPanelOpen ? 'opacity-0 pointer-events-none md:opacity-100 md:pointer-events-auto' : ''}`}
        title={t('ai.name')}
        aria-label={t('ai.openPanel')}
      >
        {!canUseAI ? (
          // Lock icon for free users
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        ) : isPanelOpen ? (
          // Close icon
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          // Noah AI icon
          <div className="relative">
            <span className="text-xl font-black text-white tracking-tighter">N</span>
            {/* Subtle glow ring */}
            <div className="absolute -inset-1 rounded-full bg-white/10 animate-ping opacity-30" />
          </div>
        )}
      </button>

      {/* Floating label (shown on hover) */}
      {!isPanelOpen && (
        <div className="fixed bottom-[88px] right-6 z-40 pointer-events-none">
          <div className="bg-background-card text-text-primary text-xs font-medium px-2.5 py-1 rounded-lg shadow-md border border-border opacity-0 group-hover:opacity-100 transition-opacity">
            {t('ai.name')}
          </div>
        </div>
      )}

      {/* Panel */}
      <NoahAIPanel />

      {/* Upgrade Prompt */}
      {showUpgrade && <NoahAIUpgradePrompt onClose={() => setShowUpgrade(false)} />}
    </>
  );
}
