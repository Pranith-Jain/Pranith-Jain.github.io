/**
 * Brand tokens for social content generation.
 * Derived from the portfolio tailwind.config.js — single source of truth.
 * These are CSS values, not Tailwind classes, so the HTML renderer
 * works standalone without Tailwind.
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
      600: '#2c3ee5', // primary
      700: '#232ebf',
      800: '#21299b',
      900: '#1f267c',
      950: '#121649',
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
    mono: '"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  },
  // Funnel-specific color themes
  funnel: {
    tofu: { accent: '#2c3ee5', bg: '#f5f7ff', label: 'TOFU' }, // brand-600
    mofu: { accent: '#0ea5e9', bg: '#f0f9ff', label: 'MOFU' }, // sky-500
    bofu: { accent: '#10b981', bg: '#ecfdf5', label: 'BOFU' }, // emerald-500
  },
  // Platform-specific color overrides
  platform: {
    linkedin: '#0a66c2',
    instagram: '#e4405f',
    twitter: '#1d9bf0',
  },
} as const;
