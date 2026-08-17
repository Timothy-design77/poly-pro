import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0C0C0E',
          surface: '#141416',
          raised: '#1C1C1F',
          input: '#0A0A0C',
        },
        border: {
          subtle: '#3A3A40',
          emphasis: '#52525B',
        },
        text: {
          primary: '#F1F1F4',
          secondary: '#B0B0B8',
          // Both muted and faint remain WCAG AA against the raised surface,
          // the lightest dark background used by the application.
          muted: '#8F8F98',
          faint: '#85858E',
        },
        accent: {
          DEFAULT: 'rgba(255,255,255,0.88)',
          hover: 'rgba(255,255,255,0.98)',
          dim: 'rgba(255,255,255,0.16)',
        },
        success: {
          DEFAULT: '#4ADE80',
          dim: 'rgba(74, 222, 128, 0.15)',
        },
        warning: {
          DEFAULT: '#FBBF24',
          dim: 'rgba(251, 191, 36, 0.15)',
        },
        danger: {
          DEFAULT: '#F87171',
          dim: 'rgba(248, 113, 113, 0.15)',
        },
        recording: '#EF4444',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        pill: '9999px',
      },
      spacing: {
        safe: 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
} satisfies Config;
