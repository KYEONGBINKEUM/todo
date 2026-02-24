'use client';

import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';
import { I18nProvider } from '@/lib/i18n-context';
import { DataStoreProvider } from '@/lib/data-store';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <I18nProvider>
          <DataStoreProvider>{children}</DataStoreProvider>
        </I18nProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
