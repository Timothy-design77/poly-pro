import type { Config } from 'tailwindcss';

// Colors resolve to the CSS custom properties in src/styles/globals.css, which
// are the single source of truth for the palette.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'var(--bg-primary)',
          surface: 'var(--bg-surface)',
          raised: 'var(--bg-raised)',
          input: 'var(--bg-input)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          emphasis: 'var(--border-emphasis)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          faint: 'var(--text-faint)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          dim: 'var(--accent-dim)',
        },
        success: {
          DEFAULT: 'var(--success)',
          dim: 'var(--success-dim)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          dim: 'var(--warning-dim)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          dim: 'var(--danger-dim)',
        },
        recording: 'var(--recording)',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono: ['"DM Sans"', 'system-ui', 'sans-serif'],
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
