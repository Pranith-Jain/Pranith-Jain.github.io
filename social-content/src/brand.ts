/**
 * Brand tokens matching pranithjain.qzz.io design system.
 * Single source of truth for all generated content.
 *
 * Aligned with `tailwind.config.js`:
 *   - brand-100/200 = tints for TOFU
 *   - sky-100/200    = tints for MOFU
 *   - emerald-100/200 = tints for BOFU
 */

export const BRAND = {
  colors: {
    brand: {
      50: '#f5f7ff',
      100: '#ebf0fe',
      200: '#ced9fd',
      300: '#a1b6fb',
      400: '#6d8bf7',
      500: '#435ef1',
      600: '#2c3ee5',
      700: '#232ebf',
      800: '#21299b',
      900: '#1f267c',
      950: '#121649',
    },
    sky: {
      50: '#f0f9ff',
      100: '#e0f2fe',
      200: '#bae6fd',
      300: '#7dd3fc',
      400: '#38bdf8',
      500: '#0ea5e9',
      600: '#0284c7',
      700: '#0369a1',
    },
    emerald: {
      50: '#ecfdf5',
      100: '#d1fae5',
      200: '#a7f3d0',
      300: '#6ee7b7',
      400: '#34d399',
      500: '#10b981',
      600: '#059669',
      700: '#047857',
    },
    severity: {
      critical: '#e11d48',
      high: '#f43f5e',
      medium: '#f59e0b',
      low: '#10b981',
      info: '#0ea5e9',
    },
    neutral: {
      white: '#ffffff',
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
      950: '#020617',
    },
  },
  fonts: {
    display: '"Bricolage Grotesque", "Hanken Grotesk", sans-serif',
    body: '"Hanken Grotesk", ui-sans-serif, system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
  // Funnel colors: accent (CTA buttons, side bars, brand mark)
  //               tint  (light backgrounds, cards)
  //               deep  (gradient mid-tone, top-fade)
  funnel: {
    tofu: { accent: '#2c3ee5', tint: '#ebf0fe', deep: '#ced9fd', label: 'TOFU' },
    mofu: { accent: '#0ea5e9', tint: '#e0f2fe', deep: '#bae6fd', label: 'MOFU' },
    bofu: { accent: '#10b981', tint: '#d1fae5', deep: '#a7f3d0', label: 'BOFU' },
  },
  portfolioUrl: 'pranithjain.qzz.io',
  platform: {
    linkedin: '#0a66c2',
    instagram: '#e4405f',
    twitter: '#1d9bf0',
  },
} as const;

export const FONTS = BRAND.fonts;
