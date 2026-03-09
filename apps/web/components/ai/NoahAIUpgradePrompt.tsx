'use client';

import { useI18n } from '@/lib/i18n-context';
import { useAuth } from '@/lib/auth-context';

const POLAR_PRODUCT_PRO = process.env.NEXT_PUBLIC_POLAR_PREMIUM_PRODUCT_ID ?? '';

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
}

interface NoahAIUpgradePromptProps {
  onClose: () => void;
}

export default function NoahAIUpgradePrompt({ onClose }: NoahAIUpgradePromptProps) {
  const { t } = useI18n();
  const { user } = useAuth();

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
            onClick={async () => {
              if (!POLAR_PRODUCT_PRO) { onClose(); return; }
              const params = new URLSearchParams();
              params.set('products', POLAR_PRODUCT_PRO);
              if (user?.email) params.set('customer_email', user.email);
              if (user?.uid) params.set('metadata[uid]', user.uid);
              const url = `https://polar.sh/checkout?${params.toString()}`;
              if (isTauriEnv()) {
                try {
                  const { openUrl } = await import('@tauri-apps/plugin-opener');
                  await openUrl(url);
                } catch {
                  try {
                    const { open } = await import('@tauri-apps/plugin-shell');
                    await open(url);
                  } catch {
                    window.open(url, '_blank');
                  }
                }
              } else {
                window.open(url, '_blank');
              }
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
