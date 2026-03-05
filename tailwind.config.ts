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
          subtle: '#2A2A2E',
          emphasis: '#3A3A40',
        },
        text: {
          primary: '#E8E8EC',
          secondary: '#8B8B94',
          muted: '#4A4A52',
          faint: '#2E2E34',
        },
        accent: {
          DEFAULT: 'rgba(255,255,255,0.85)',
          hover: 'rgba(255,255,255,0.95)',
          dim: 'rgba(255,255,255,0.12)',
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
