/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic, CSS-variable backed. Use these by default.
        surface: {
          page: 'var(--surface-page)',
          raised: 'var(--surface-raised)',
          sunken: 'var(--surface-sunken)',
        },
        ink: {
          1: 'var(--ink-1)',
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
        },
        rule: 'var(--rule)',
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
        },

        // Brand palette — repointed so `brand-600` is the editorial ink-blue.
        // Every existing `bg-brand-600`, `text-brand-600`, `ring-brand-600`,
        // etc. stays valid; the rendered colour just becomes deeper and more
        // editorial. The full scale is rebuilt around `#1B3A6B`.
        brand: {
          50: '#f4f7fb',
          100: '#e6ecf4',
          200: '#c5d2e5',
          300: '#9ab1cf',
          400: '#6c8ec9',
          500: '#3f689f',
          600: '#1b3a6b',
          700: '#16305a',
          800: '#112648',
          900: '#0d1d38',
          950: '#06122a',
        },

        // Neon palette retained temporarily for backwards compatibility with
        // the existing /dfir tool pages. Phase 4 removes references and then
        // removes this block.
        neon: {
          cyan: '#00fff9',
          pink: '#ff006e',
          purple: '#8b5cf6',
          green: '#00ff88',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Newsreader', 'ui-serif', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        // `display` aliased to serif so any lingering `font-display` class
        // renders Newsreader, not the dropped Poppins. Removed in Phase 4.
        display: ['Newsreader', 'ui-serif', 'Georgia', 'serif'],
      },
      transitionDuration: {
        enter: 'var(--motion-enter)',
        exit: 'var(--motion-exit)',
      },
      transitionTimingFunction: {
        // Tailwind has `ease-out`/`ease-in` defaults; we add our token aliases
        // so component code can use `transition-enter ease-out-token` style
        // utilities.
        'out-token': 'var(--ease-out)',
        'in-token': 'var(--ease-in)',
        // `spring` overshoot is no longer part of the new editorial system,
        // but ~13 consumers (Hero / Featured / Contact / Projects / etc.)
        // still reference it via `ease-spring`. Kept as a temporary alias so
        // their hover transitions don't snap to instant during the Phase 2
        // sweep that rewrites those consumers. Removed in Phase 4 cleanup.
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      // Old indigo brand glow — no longer harmonises with the ink-blue accent.
      // Retained for Phase-2/3 consumers that still reference `shadow-glow*`.
      // Removed in Phase 4 cleanup.
      boxShadow: {
        glow: '0 0 0 1px rgba(37, 99, 235, 0.25), 0 18px 60px rgba(37, 99, 235, 0.15)',
        'glow-cyan': '0 0 30px rgba(0, 255, 249, 0.5)',
        'glow-pink': '0 0 30px rgba(255, 0, 110, 0.5)',
        'glow-purple': '0 0 30px rgba(139, 92, 246, 0.5)',
      },
      // Animations + keyframes retained temporarily — the only one wired into
      // the chrome (`scroll-horizontal` for the companies row) is removed in
      // Phase 2. The rest survive until Phase 4 clean-up.
      animation: {
        'float-enhanced': 'float-enhanced 6s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
        'scroll-horizontal': 'scroll-horizontal 40s linear infinite',
        'count-up': 'count-up 0.8s ease-out forwards',
        'threat-pulse': 'threat-pulse 4s ease-in-out infinite',
      },
      keyframes: {
        'float-enhanced': {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg) scale(1)' },
          '33%': { transform: 'translateY(-20px) rotate(2deg) scale(1.05)' },
          '66%': { transform: 'translateY(-10px) rotate(-2deg) scale(0.95)' },
        },
        'pulse-glow': {
          '0%, 100%': {
            opacity: '1',
            boxShadow: '0 0 20px rgba(0, 255, 249, 0.5)',
          },
          '50%': {
            opacity: '0.7',
            boxShadow: '0 0 40px rgba(0, 255, 249, 0.8), 0 0 60px rgba(255, 0, 110, 0.4)',
          },
        },
        'scroll-horizontal': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'count-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'threat-pulse': {
          '0%, 100%': { opacity: '0.1', transform: 'scale(1)' },
          '50%': { opacity: '0.3', transform: 'scale(1.05)' },
        },
      },
    },
  },
  plugins: [],
};
