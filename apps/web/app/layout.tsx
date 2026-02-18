import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Todo - 오늘을 설계해주는 디지털 비서',
  description: '할 일을 적는 앱이 아니라, 오늘을 설계해주는 디지털 비서',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-background text-text-primary">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
