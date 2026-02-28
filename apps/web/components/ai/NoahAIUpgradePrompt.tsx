'use client';

import { useI18n } from '@/lib/i18n-context';

interface NoahAIUpgradePromptProps {
  onClose: () => void;
}

export default function NoahAIUpgradePrompt({ onClose }: NoahAIUpgradePromptProps) {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-background-card rounded-card p-6 max-w-sm w-full shadow-2xl border border-border animate-fadeUp">
        {/* Gradient icon */}
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-[#e94560] to-[#8b5cf6] flex items-center justify-center">
          <span className="text-3xl">🔒</span>
        </div>

        <h3 className="text-lg font-bold text-center text-text-primary mb-2">
          {t('ai.upgradeTitle')}
        </h3>

        <p className="text-sm text-text-secondary text-center mb-6">
          {t('ai.upgradeDescription')}
        </p>

        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="text-[#e94560]">✓</span>
            <span>{t('ai.feature.autoWrite')}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="text-[#e94560]">✓</span>
            <span>{t('ai.feature.youtube')}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="text-[#e94560]">✓</span>
            <span>{t('ai.feature.mindmap')}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="text-[#e94560]">✓</span>
            <span>{t('ai.feature.taskAI')}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-button text-sm font-medium text-text-secondary hover:bg-background-hover transition-colors"
          >
            {t('common.close')}
          </button>
          <button
            onClick={() => {
              // TODO: Navigate to subscription page or open settings
              onClose();
            }}
            className="flex-1 px-4 py-2.5 rounded-button text-sm font-bold text-white bg-gradient-to-r from-[#e94560] to-[#8b5cf6] hover:opacity-90 transition-opacity"
          >
            {t('ai.upgradeCTA')}
          </button>
        </div>
      </div>
    </div>
  );
}
