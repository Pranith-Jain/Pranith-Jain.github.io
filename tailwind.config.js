/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f7ff',
          100: '#ebf0fe',
          200: '#ced9fd',
          300: '#a1b6fb',
          400: '#6d8bf7',
          500: '#5a78f2',
          600: '#2c3ee5',
          700: '#232ebf',
          800: '#21299b',
          900: '#1f267c',
          950: '#121649',
        },
        // Canonical severity scale — THE single source of truth, byte-aligned
        // with src/components/severity.ts (SEVERITY_TONE/SEVERITY_BAR) and
        // src/components/threatintel/soc/tone.ts. The ramp maps to threat
        // meaning, not a colour gradient: `high` is orange (not a 2nd rose) and
        // `low` is *intentionally* slate (neutral) — green reads as "safe/done"
        // which conflicts with "this is still a finding". Render criticality
        // through <SeverityPill> / SEVERITY_TONE, never ad-hoc rose/amber/emerald.
        severity: {
          critical: '#e11d48', // rose-600
          high: '#f97316', // orange-500
          medium: '#f59e0b', // amber-500
          low: '#94a3b8', // slate-400 (neutral — NOT green)
          info: '#0ea5e9', // sky-500
        },
        // `muted` = theme-aware secondary text (slate-600 in light → AA on white,
        // slate-400 in dark). Backed by the --muted CSS var in index.css. Prefer
        // `text-muted` over bare text-slate-400 so light mode stays >=4.5:1.
        muted: 'rgb(var(--muted) / <alpha-value>)',
        // Removed the unused `neon` cyberpunk palette (cyan/pink/purple/green) —
        // 0 references, a generic-AI tell carried in config dead weight.
      },
      fontFamily: {
        // Distinctive, domain-fit type system (replaced generic Inter/Poppins/
        // Space Grotesk). Bricolage Grotesque = characterful display, Hanken
        // Grotesk = clean readable body, JetBrains Mono = forensic IOC/terminal.
        sans: ['"Hanken Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', '"Hanken Grotesk"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      // Named type scale — the one source of truth replacing the ad-hoc
      // text-[11px]/[12px]/[13px] + arbitrary tracking scattered across the
      // app. Additive (no Tailwind defaults overridden): adopt incrementally.
      //   eyebrow  → uppercase section labels (was text-[11px] tracking-[0.18em])
      //   meta     → captions / counts / footnotes (was text-[12px])
      //   tool     → tile + card descriptions (was text-[13px])
      //   mini     → plain 11px label, NO tracking (was text-[11px] non-uppercase)
      //   micro    → tightest 10px chrome label (was text-[10px]/[9px])
      // mini/micro exist so the type codemod can tokenize every ad-hoc
      // text-[9..13px] with zero visual change; the mobile legibility floor in
      // index.css then lifts micro/mini to 12px on small screens.
      fontSize: {
        eyebrow: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.16em' }],
        meta: ['0.75rem', { lineHeight: '1.1rem' }],
        tool: ['0.8125rem', { lineHeight: '1.25rem' }],
        mini: ['0.6875rem', { lineHeight: '1rem' }],
        micro: ['0.625rem', { lineHeight: '0.9rem' }],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(37, 99, 235, 0.25), 0 18px 60px rgba(37, 99, 235, 0.15)',
        // Elevation scale — the depth system the flat light theme was missing.
        // Tuned soft for light surfaces (dark mode leans on borders + glass).
        e1: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
        e2: '0 2px 4px rgba(15, 23, 42, 0.05), 0 8px 24px rgba(15, 23, 42, 0.08)',
        e3: '0 12px 32px rgba(15, 23, 42, 0.10), 0 24px 64px rgba(15, 23, 42, 0.12)',
        // Removed unused glow-cyan/pink/purple (0 references; neon-AI tell).
      },
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
            boxShadow: '0 0 20px rgba(44, 62, 229, 0.4)',
          },
          '50%': {
            opacity: '0.7',
            boxShadow: '0 0 36px rgba(44, 62, 229, 0.6), 0 0 60px rgba(67, 94, 241, 0.3)',
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
