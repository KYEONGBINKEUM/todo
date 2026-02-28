'use client';

import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';
import { I18nProvider, useI18n } from '@/lib/i18n-context';
import { DataStoreProvider } from '@/lib/data-store';
import { NoahAIProvider } from '@/lib/noah-ai-context';

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
            <NoahAIWrapper>{children}</NoahAIWrapper>
          </DataStoreProvider>
        </I18nProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
