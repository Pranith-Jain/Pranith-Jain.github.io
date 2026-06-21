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
      // Threat-Intel palette (violet/magenta dark) — opt-in only.
      // Backs the .ti-bg / .ti-panel / .ti-text-gradient / .ti-btn-gradient
      // utilities in index.css. The CSS-var bridge means future theme
      // switches (e.g. a light-mode TI variant) are a one-line change in
      // :root, not a Tailwind rebuild.
      ti: {
        DEFAULT: 'rgb(var(--ti-accent-violet) / <alpha-value>)',
        base: 'rgb(var(--ti-bg-base) / <alpha-value>)',
        panel: 'rgb(var(--ti-bg-panel) / <alpha-value>)',
        border: 'rgb(var(--ti-bg-border) / <alpha-value>)',
        indigo: 'rgb(var(--ti-accent-indigo) / <alpha-value>)',
        violet: 'rgb(var(--ti-accent-violet) / <alpha-value>)',
        pink: 'rgb(var(--ti-accent-pink) / <alpha-value>)',
        text: 'rgb(var(--ti-text) / <alpha-value>)',
        muted: 'rgb(var(--ti-text-muted) / <alpha-value>)',
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

      // Hunt.io-inspired radius scale: sharp 4-8px on data tiles, larger
      // radii only on hero/CTA surfaces. Use named tokens instead of
      // raw rounded-* so intent is in the class name.
      //   card     -> 8px   (toolkit cards, data tiles)
      //   panel    -> 10px  (panels with internal table)
      //   hero     -> 14px  (hero/CTA panels, top-of-page callouts)
      borderRadius: {
        card: '0.5rem',
        panel: '0.625rem',
        hero: '0.875rem',
      },

      boxShadow: {
        glow: '0 0 0 1px rgba(37, 99, 235, 0.25), 0 18px 60px rgba(37, 99, 235, 0.15)',
        // Geist-aligned elevation — borders first, shadows subtle.
        //   e1 → raised card:        0 2px 2px rgba(0,0,0,0.04)
        //   e2 → popover/menu:        + 0 4px 8px -4px, 0 16px 24px -8px
        //   e3 → modal/dialog:        + 0 8px 16px -4px, 0 24px 32px -8px
        // Dark mode leans on borders + translucency, not shadow.
        e1: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)',
        e2: '0 1px 1px rgba(0, 0, 0, 0.02), 0 4px 8px -4px rgba(0, 0, 0, 0.04), 0 16px 24px -8px rgba(0, 0, 0, 0.06)',
        e3: '0 1px 1px rgba(0, 0, 0, 0.02), 0 8px 16px -4px rgba(0, 0, 0, 0.04), 0 24px 32px -8px rgba(0, 0, 0, 0.06)',
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
        // (Removed 2026-06-20: float-enhanced + pulse-glow keyframes
        //  were the "AI decorative motion" leftover — 0 references
        //  in src/. pulse-glow wrapped a brand-blue box-shadow
        //  oscillation, float-enhanced wrapped a translate + rotate
        //  + scale drift.)
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
