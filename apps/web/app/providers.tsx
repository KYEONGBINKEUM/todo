'use client';

import { useEffect } from 'react';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';
import { I18nProvider, useI18n } from '@/lib/i18n-context';
import { DataStoreProvider } from '@/lib/data-store';
import { NoahAIProvider } from '@/lib/noah-ai-context';

const FONT_SIZE_KEY = 'noah-font-size';

/** Apply font size from localStorage immediately (device-specific, no Firestore delay) */
function FontSizeBootstrap() {
  useEffect(() => {
    const saved = localStorage.getItem(FONT_SIZE_KEY);
    if (saved) {
      const size = Number(saved);
      if (size >= 10 && size <= 24) {
        document.documentElement.style.fontSize = `${size}px`;
      }
    }
  }, []);
  return null;
}

function NoahAIWrapper({ children }: { children: React.ReactNode }) {
  const { t, language } = useI18n();
  return (
    <NoahAIProvider t={t} language={language}>
      {children}
    </NoahAIProvider>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <I18nProvider>
          <DataStoreProvider>
            <FontSizeBootstrap />
            <NoahAIWrapper>{children}</NoahAIWrapper>
          </DataStoreProvider>
        </I18nProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export { FONT_SIZE_KEY };
