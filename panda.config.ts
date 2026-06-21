import { defineConfig } from '@pandacss/dev';

// Panda CSS config — the single source of truth for the design system.
//
// Phase 5 (final): Tailwind removed entirely. The design tokens
// (brand/severity/slate/rose/orange/amber/sky/emerald ramps, named
// type scale, shadows, radii, semantic muted/surface/border channels)
// are defined exclusively here. See DESIGN_SYSTEM.md for the design
// intent and docs/PANDA_MIGRATION.md for the migration log.

export default defineConfig({
  preflight: true,
  include: ['./src/**/*.{js,jsx,ts,tsx}'],
  exclude: ['**/*.test.{ts,tsx}', '**/test/**', './dist/**', './.ssr-build/**'],
  jsxFramework: 'react',
  outdir: 'styled-system',
  theme: {
    extend: {
      tokens: {
        colors: {
          brand: {
            50: { value: '#f5f7ff' },
            100: { value: '#ebf0fe' },
            200: { value: '#ced9fd' },
            300: { value: '#a1b6fb' },
            400: { value: '#6d8bf7' },
            500: { value: '#435ef1' },
            600: { value: '#2c3ee5' },
            700: { value: '#232ebf' },
            800: { value: '#21299b' },
            900: { value: '#1f267c' },
            950: { value: '#121649' },
          },
          severity: {
            critical: { value: '#e11d48' },
            high: { value: '#f97316' },
            medium: { value: '#f59e0b' },
            low: { value: '#94a3b8' },
            info: { value: '#0ea5e9' },
          },
          slate: {
            50: { value: '#f8fafc' },
            100: { value: '#f1f5f9' },
            200: { value: '#e2e8f0' },
            300: { value: '#cbd5e1' },
            400: { value: '#94a3b8' },
            500: { value: '#64748b' },
            600: { value: '#475569' },
            700: { value: '#334155' },
            800: { value: '#1e293b' },
            900: { value: '#0f172a' },
            950: { value: '#020617' },
          },
          rose: {
            50: { value: '#fff1f2' },
            100: { value: '#ffe4e6' },
            200: { value: '#fecdd3' },
            300: { value: '#fda4af' },
            400: { value: '#fb7185' },
            500: { value: '#f43f5e' },
            600: { value: '#e11d48' },
            700: { value: '#be123c' },
            800: { value: '#9f1239' },
            900: { value: '#881337' },
          },
          orange: {
            50: { value: '#fff7ed' },
            100: { value: '#ffedd5' },
            200: { value: '#fed7aa' },
            300: { value: '#fdba74' },
            400: { value: '#fb923c' },
            500: { value: '#f97316' },
            600: { value: '#ea580c' },
            700: { value: '#c2410c' },
            800: { value: '#9a3412' },
            900: { value: '#7c2d12' },
          },
          amber: {
            50: { value: '#fffbeb' },
            100: { value: '#fef3c7' },
            200: { value: '#fde68a' },
            300: { value: '#fcd34d' },
            400: { value: '#fbbf24' },
            500: { value: '#f59e0b' },
            600: { value: '#d97706' },
            700: { value: '#b45309' },
            800: { value: '#92400e' },
            900: { value: '#78350f' },
          },
          sky: {
            50: { value: '#f0f9ff' },
            100: { value: '#e0f2fe' },
            200: { value: '#bae6fd' },
            300: { value: '#7dd3fc' },
            400: { value: '#38bdf8' },
            500: { value: '#0ea5e9' },
            600: { value: '#0284c7' },
            700: { value: '#0369a1' },
            800: { value: '#075985' },
            900: { value: '#0c4a6e' },
          },
          emerald: {
            50: { value: '#ecfdf5' },
            100: { value: '#d1fae5' },
            200: { value: '#a7f3d0' },
            300: { value: '#6ee7b7' },
            400: { value: '#34d399' },
            500: { value: '#10b981' },
            600: { value: '#059669' },
            700: { value: '#047857' },
            800: { value: '#065f46' },
            900: { value: '#064e3b' },
          },
          black: { value: '#000' },
          white: { value: '#fff' },
          transparent: { value: 'transparent' },
          current: { value: 'currentColor' },
        },
        fonts: {
          sans: { value: 'Hanken Grotesk, ui-sans-serif, system-ui, sans-serif' },
          display: { value: '"Bricolage Grotesque", "Hanken Grotesk", sans-serif' },
          mono: { value: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
        },
        fontSizes: {
          eyebrow: { value: '0.6875rem' },
          meta: { value: '0.75rem' },
          tool: { value: '0.8125rem' },
          mini: { value: '0.6875rem' },
          micro: { value: '0.625rem' },
        },
        lineHeights: {
          eyebrow: { value: '1rem' },
          meta: { value: '1.1rem' },
          tool: { value: '1.25rem' },
          mini: { value: '1rem' },
          micro: { value: '0.9rem' },
        },
        letterSpacings: {
          tightDisplay: { value: '-0.018em' },
          eyebrow: { value: '0.16em' },
        },
        shadows: {
          e1: { value: '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.06)' },
          e2: { value: '0 2px 4px rgba(15, 23, 42, 0.05), 0 8px 24px rgba(15, 23, 42, 0.08)' },
          e3: { value: '0 12px 32px rgba(15, 23, 42, 0.10), 0 24px 64px rgba(15, 23, 42, 0.12)' },
        },
        radii: {
          sm: { value: '0.125rem' },
          md: { value: '0.375rem' },
          lg: { value: '0.5rem' },
          xl: { value: '0.75rem' },
          '2xl': { value: '1rem' },
          '3xl': { value: '1.5rem' },
        },
      },
      semanticTokens: {
        colors: {
          muted: { value: { base: 'rgb(71 85 105)', _dark: 'rgb(148 163 184)' } },
          surface: {
            100: { value: { base: 'rgb(255 255 255)', _dark: 'rgb(10 10 15)' } },
            200: { value: { base: 'rgb(250 250 250)', _dark: 'rgb(18 18 24)' } },
            300: { value: { base: 'rgb(245 245 245)', _dark: 'rgb(28 28 36)' } },
            input: { value: { base: 'rgb(250 250 250)', _dark: 'rgb(14 14 20)' } },
          },
          border: {
            400: { value: { base: 'rgb(0 0 0 / 0.08)', _dark: 'rgb(255 255 255 / 0.08)' } },
            500: { value: { base: 'rgb(0 0 0 / 0.14)', _dark: 'rgb(255 255 255 / 0.14)' } },
            600: { value: { base: 'rgb(0 0 0 / 0.22)', _dark: 'rgb(255 255 255 / 0.22)' } },
          },
        },
      },
    },
  },
  globalCss: {
    html: {
      fontFamily: 'sans',
      scrollBehavior: 'smooth',
      colorScheme: 'light',
      _dark: { colorScheme: 'dark' },
    },
    body: {
      fontFeatureSettings: '"cv11", "ss01"',
      textRendering: 'optimizeLegibility',
      WebkitFontSmoothing: 'antialiased',
    },
    'h1, h2, h3, h4, h5, h6': {
      fontFamily: 'display',
      letterSpacing: 'tightDisplay',
      fontOpticalSizing: 'auto',
    },
    '@media (max-width: 639px)': {
      "input:not([type='checkbox']):not([type='radio']):not([type='range']), select, textarea": {
        fontSize: '16px !important',
      },
    },
  },
});
