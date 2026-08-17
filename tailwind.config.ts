import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#F2F3F5',
          surface: '#FFFFFF',
          raised: '#E7E9ED',
          input: '#FFFFFF',
        },
        border: {
          subtle: '#D2D6DC',
          emphasis: '#8B929C',
        },
        text: {
          primary: '#15171A',
          secondary: '#454B54',
          muted: '#68707B',
          faint: '#969DA7',
        },
        accent: {
          DEFAULT: '#171A1F',
          hover: '#050607',
          dim: 'rgba(23, 26, 31, 0.08)',
        },
        success: {
          DEFAULT: '#187A3B',
          dim: 'rgba(24, 122, 59, 0.11)',
        },
        warning: {
          DEFAULT: '#A45108',
          dim: 'rgba(164, 81, 8, 0.11)',
        },
        danger: {
          DEFAULT: '#B4232C',
          dim: 'rgba(180, 35, 44, 0.10)',
        },
        recording: '#D92D3A',
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
