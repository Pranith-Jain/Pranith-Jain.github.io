/**
 * Minimal BRAND token subset for carousel SVG renderer.
 * Extracted from social-content/src/brand.ts (outside api tsconfig).
 */

export const BRAND = {
  colors: {
    neutral: {
      50: '#f8fafc',
      400: '#94a3b8',
      900: '#0f172a',
      950: '#020617',
    },
  },
  funnel: {
    tofu: { accent: '#2c3ee5' },
  },
} as const;
