import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: 'var(--color-bg-base)',
          card: 'var(--color-bg-card)',
          hover: 'var(--color-bg-hover)',
          sidebar: 'var(--color-bg-sidebar)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          hover: 'var(--color-border-hover)',
          focus: '#e94560',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          muted: 'var(--color-text-muted)',
          inactive: 'var(--color-text-inactive)',
        },
        primary: {
          DEFAULT: '#e94560',
          hover: '#ff5a7a',
        },
        accent: {
          purple: '#533483',
          blue: '#0f3460',
          dark: '#1a1a2e',
        },
      },
      fontFamily: {
        sans: [
          'var(--font-pretendard)',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
      },
      animation: {
        'fade-up': 'fadeUp 0.4s ease-out',
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': {
            opacity: '0',
            transform: 'translateY(16px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
      },
      borderRadius: {
        card: '12px',
        button: '8px',
      },
    },
  },
  plugins: [],
};

export default config;
