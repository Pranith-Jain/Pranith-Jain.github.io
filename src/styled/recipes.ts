/**
 * Design-system recipes — the executable version of DESIGN_SYSTEM.md.
 *
 * Each `cva(...)` call is a typed, variant-based component. The class
 * string `severityPill({ tone: 'critical' })` produces the CSS for a
 * severity pill, with all colors and tokens resolved by Panda against
 * `panda.config.ts` (severity/brand/slate/etc.). The class output is
 * Panda-generated at build time via `panda codegen` + `panda cssgen`
 * (runs in the `prebuild` hook, see package.json).
 *
 * Recipe usage pattern:
 *   BEFORE (Tailwind, ad-hoc class strings)
 *     <div className="group surface-card p-4 transition
 *                       hover:-translate-y-0.5 hover:border-brand-500/50
 *                       hover:shadow-e2">
 *   AFTER (Panda recipe + css)
 *     <div className={cx(card(), card({ variant: 'card' }), css({ p: '4' }))}>
 *   — or simpler with a single recipe that owns all the variants:
 *     <div className={card({ variant: 'card', interactive: true })}>
 *
 * Recipes are the single source of styling truth: define the recipe
 * here, then consume it from React components. For one-off layout
 * values not worth a recipe variant, use the `css()` function from
 * `../../styled-system/css` to drop in Panda atomic styles.
 */
import { cva, type RecipeVariantProps } from '../../styled-system/css';

// ─── Surface / Card ─────────────────────────────────────────────────
//
// The four card variants in DESIGN_SYSTEM.md (.surface-card / .surface-raised
// / .surface-elevated / .glass) collapse to a single recipe with `variant`.
// Variant names match the existing ui/Card.tsx API so the primitive swap
// is mechanical:
//
//   default     — workhorse surface card (e1 shadow)
//   surface     — flat card with no shadow (for nested cards)
//   elevated    — top-of-page hero card (e3 shadow)
//   glass       — translucent surface for overlays
//   interactive — base + hover-lift + cursor:pointer
//
// The `tone` variant ('brand' | 'rose') sets the interactive hover
// border + focus-ring colour. Default is brand (DFIR pages); threatintel
// pages pass tone="rose" so the interactive state matches the page accent.
//
// `padding` is the size variant; `radius` is the border-radius variant.
// Both are additive to the design system (no Tailwind defaults overridden).
export const card = cva({
  base: {
    borderRadius: 'xl',
    borderWidth: '1px',
    borderColor: 'border.400',
    bg: 'surface.200',
    transition: 'all 200ms',
  },
  variants: {
    variant: {
      default: {
        boxShadow: 'e1',
        bg: 'surface.200',
      },
      surface: {
        bg: 'surface.200',
      },
      elevated: {
        boxShadow: 'e3',
        bg: 'surface.300',
      },
      glass: {
        bg: 'rgba(255,255,255,0.7)',
        borderColor: 'slate.300/60',
        _dark: { bg: 'rgba(18,18,24,0.6)', borderColor: 'white/10' },
      },
    },
    interactive: {
      true: {
        cursor: 'pointer',
        _hover: {
          transform: 'translateY(-2px)',
          boxShadow: 'e2',
        },
        _focusVisible: {
          outline: 'none',
          boxShadow: '0 0 0 2px var(--colors-surface-100)',
        },
      },
    },
    padding: {
      none: { p: '0' },
      sm: { p: '4' },
      md: { p: '5' },
      lg: { p: '6' },
    },
    radius: {
      card: { borderRadius: 'lg' },
      panel: { borderRadius: 'lg' },
      hero: { borderRadius: 'xl' },
    },
    tone: {
      brand: {
        _hover: { borderColor: 'brand.500/30' },
        _focusVisible: { boxShadow: '0 0 0 2px var(--colors-brand-500)' },
      },
      rose: {
        _hover: { borderColor: 'rose.500/30' },
        _focusVisible: { boxShadow: '0 0 0 2px var(--colors-rose-500)' },
      },
    },
  },
  defaultVariants: {
    variant: 'default',
    padding: 'md',
    radius: 'card',
    tone: 'brand',
  },
});

export type CardVariants = RecipeVariantProps<typeof card>;

// ─── Severity pill ─────────────────────────────────────────────────
//
// Direct port of `SEVERITY_TONE` in components/severity.ts. The five
// tones map to threat-meaning, not a colour gradient (low is
// intentionally slate, not green).
export const severityPill = cva({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 'md',
    borderWidth: '1px',
    px: '1.5',
    py: '0.5',
    fontSize: 'micro',
    lineHeight: 'micro',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 'wider',
    fontFamily: 'mono',
  },
  variants: {
    tone: {
      critical: {
        borderColor: 'rose.500/50',
        bg: 'rose.500/15',
        color: 'rose.700',
        _dark: { color: 'rose.300' },
      },
      high: {
        borderColor: 'orange.500/50',
        bg: 'orange.500/15',
        color: 'orange.700',
        _dark: { color: 'orange.300' },
      },
      medium: {
        borderColor: 'amber.500/50',
        bg: 'amber.500/15',
        color: 'amber.700',
        _dark: { color: 'amber.300' },
      },
      low: {
        borderColor: 'slate.400/50',
        bg: 'slate.400/10',
        color: 'slate.600',
        _dark: { color: 'slate.300' },
      },
      info: {
        borderColor: 'sky.500/50',
        bg: 'sky.500/15',
        color: 'sky.700',
        _dark: { color: 'sky.300' },
      },
    },
  },
  defaultVariants: { tone: 'info' },
});

// Direct port of `SEVERITY_BAR` — solid bar/dot fill per severity for
// progress bars, count strips, and legend dots.
export const severityBar = cva({
  base: {},
  variants: {
    tone: {
      critical: { bg: 'rose.500' },
      high: { bg: 'orange.500' },
      medium: { bg: 'amber.500' },
      low: { bg: 'slate.400' },
      info: { bg: 'sky.500' },
    },
  },
  defaultVariants: { tone: 'info' },
});

// ─── Button ────────────────────────────────────────────────────────
//
// Geist-style button primitive with the full variant set used by the
// existing ui/Button.tsx (6 variants, 5 sizes). Variant names match
// the existing API so the primitive swap is mechanical:
//
//   primary          — solid brand fill (the "one important action" rule)
//   primary-brand    — explicit brand blue (use sparingly)
//   secondary        — surface fill + translucent border
//   ghost            — transparent; hover wash only
//   danger           — solid red-700
//   danger-secondary — red text on light, red border on dark
//
// Size scale: xs (28) | sm (32) | md (40) | lg (48) | xl (52). All
// sizes use the same horizontal padding ratio so visual rhythm
// matches the Geist spec.
export const button = cva({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2',
    borderRadius: 'md',
    fontWeight: '500',
    transition: 'colors 150ms',
    cursor: 'pointer',
    fontFamily: 'sans',
    _focusVisible: { outline: 'none' },
  },
  variants: {
    intent: {
      // Geist default: solid gray-1000 with white label.
      primary: {
        bg: 'slate.900',
        color: 'white',
        _hover: { bg: 'slate.800' },
        _dark: { bg: 'white', color: 'slate.900', _hover: { bg: 'slate.100' } },
        _disabled: {
          bg: 'slate.200',
          color: 'slate.500',
          cursor: 'not-allowed',
          _dark: { bg: 'slate.800', color: 'slate.500' },
        },
      },
      // Brand variant — the literal "primary" of an in-app surface.
      // Pass via className if the caller wants brand blue; we keep
      // the default neutral so portfolio landing chrome doesn't shout.
      'primary-brand': {
        bg: 'brand.600',
        color: 'white',
        _hover: { bg: 'brand.500' },
        _dark: { bg: 'brand.500', _hover: { bg: 'brand.400' } },
        _disabled: { opacity: 0.4, cursor: 'not-allowed' },
      },
      // Geist secondary: surface fill, translucent border.
      secondary: {
        bg: 'white',
        color: 'slate.900',
        borderWidth: '1px',
        borderColor: 'black/15',
        _hover: { bg: 'black/5', borderColor: 'black/25' },
        _dark: {
          bg: 'transparent',
          color: 'slate.100',
          borderColor: 'white/10',
          _hover: { bg: 'white/5', borderColor: 'white/20' },
        },
        _disabled: { opacity: 0.5, cursor: 'not-allowed' },
      },
      ghost: {
        bg: 'transparent',
        color: 'slate.700',
        _hover: { bg: 'black/5', color: 'slate.900' },
        _dark: { color: 'slate.300', _hover: { bg: 'white/5', color: 'white' } },
        _disabled: { opacity: 0.4, cursor: 'not-allowed' },
      },
      danger: {
        bg: 'red.700',
        color: 'white',
        _hover: { bg: 'red.800' },
        _dark: { bg: 'red.700', _hover: { bg: 'red.800' } },
        _disabled: { opacity: 0.5, cursor: 'not-allowed' },
      },
      'danger-secondary': {
        bg: 'white',
        color: 'red.700',
        borderWidth: '1px',
        borderColor: 'black/15',
        _hover: { bg: 'red.50', borderColor: 'red.300' },
        _dark: {
          bg: 'transparent',
          color: 'red.400',
          borderColor: 'white/10',
          _hover: { bg: 'red.500/10', borderColor: 'red.500/30' },
        },
        _disabled: { opacity: 0.5, cursor: 'not-allowed' },
      },
    },
    size: {
      xs: { h: '7', px: '1.5', fontSize: 'tool' },
      sm: { h: '8', px: '2.5', fontSize: 'tool' },
      md: { h: '10', px: '3', fontSize: 'sm' },
      lg: { h: '12', px: '4', fontSize: 'base' },
      xl: { h: '13', px: '5', fontSize: 'base' },
    },
  },
  defaultVariants: { intent: 'primary', size: 'sm' },
});

export type ButtonVariants = RecipeVariantProps<typeof button>;

// ─── Stack (vertical/horizontal layout primitive) ──────────────────
//
// Replaces the repeated `flex flex-col gap-N` and `flex gap-N` patterns.
export const stack = cva({
  base: { display: 'flex' },
  variants: {
    direction: {
      column: { flexDirection: 'column' },
      row: { flexDirection: 'row' },
    },
    gap: {
      0: { gap: '0' },
      1: { gap: '0.25rem' },
      2: { gap: '0.5rem' },
      3: { gap: '0.75rem' },
      4: { gap: '1rem' },
      6: { gap: '1.5rem' },
      8: { gap: '2rem' },
    },
    align: {
      start: { alignItems: 'flex-start' },
      center: { alignItems: 'center' },
      end: { alignItems: 'flex-end' },
      stretch: { alignItems: 'stretch' },
    },
    justify: {
      start: { justifyContent: 'flex-start' },
      center: { justifyContent: 'center' },
      end: { justifyContent: 'flex-end' },
      between: { justifyContent: 'space-between' },
    },
  },
  defaultVariants: { direction: 'column', gap: 4 },
});

// ─── Eyebrow (uppercase section label) ─────────────────────────────
//
// Replaces the hand-rolled `text-eyebrow font-mono uppercase tracking-[0.16em]`
// or `text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500
// dark:text-slate-400` strings repeated 151+ times across the
// codebase. Used as the small label above section headings.
//
// Two variants:
//   - default → 0.2em tracking (the common "section eyebrow" pattern)
//   - tight   → 0.16em tracking (the tighter "metadata" pattern in
//               list rows, table headers, and breadcrumbs)
export const eyebrow = cva({
  base: {
    textTransform: 'uppercase',
    fontFamily: 'mono',
    color: 'slate.500',
    _dark: { color: 'slate.400' },
  },
  variants: {
    tracking: {
      default: { letterSpacing: '0.2em' },
      tight: { letterSpacing: '0.16em' },
    },
  },
  defaultVariants: { tracking: 'default' },
});

// ─── Display heading (h1/h2 with display font) ─────────────────────
//
// Replaces the `font-display text-3xl sm:text-4xl font-bold tracking-tight
// text-slate-900 dark:text-white` pattern used 16+ times for hero
// headings on detail pages. Two sizes (lg for hero h1, md for section
// h2) cover the existing usage; new variants can be added
// incrementally.
export const displayHeading = cva({
  base: {
    fontFamily: 'display',
    fontWeight: 'bold',
    letterSpacing: 'tight',
    color: 'slate.900',
    _dark: { color: 'white' },
  },
  variants: {
    size: {
      // h1 hero / page-title size
      lg: { fontSize: { base: '3xl', sm: '4xl' } },
      // h2 section size
      md: { fontSize: { base: '2xl', sm: '3xl' } },
      // h3 sub-section size
      sm: { fontSize: 'xl' },
    },
  },
  defaultVariants: { size: 'lg' },
});

// ─── Chip (small inline label / skill tag) ─────────────────────────
//
// Replaces the `rounded-md border border-slate-200 dark:border-slate-700
// bg-slate-50 dark:bg-slate-900/60 px-2.5 py-1 text-mini font-mono
// text-slate-500 dark:text-slate-400` pattern used 12+ times on the
// About page skill tags, plus a brand variant for interactive chips.
//
// Two tones:
//   - default → neutral (about-page skill tags, list metadata)
//   - brand   → accent border + hover state (interactive filter chips)
export const chip = cva({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 'md',
    borderWidth: '1px',
    px: '2.5',
    py: '1',
    fontSize: 'mini',
    fontFamily: 'mono',
    lineHeight: 'mini',
  },
  variants: {
    tone: {
      default: {
        borderColor: 'slate.200',
        bg: 'slate.50',
        color: 'slate.500',
        _dark: {
          borderColor: 'slate.700',
          bg: 'slate.900/60',
          color: 'slate.400',
        },
      },
      brand: {
        borderColor: 'brand.500/30',
        bg: 'white',
        color: 'brand.700',
        _hover: { borderColor: 'brand.500/60', bg: 'brand.50' },
        _dark: {
          bg: 'slate.200',
          color: 'brand.300',
          _hover: { bg: 'brand.950/30' },
        },
      },
    },
  },
  defaultVariants: { tone: 'default' },
});
