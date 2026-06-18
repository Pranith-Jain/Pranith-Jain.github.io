# Design System & UI Consistency Guide

This document codifies the design patterns and spacing conventions for the threat intel and DFIR frontends.

## Container Widths

### Standard Widths

- **max-w-5xl** (64rem / 1024px) — Detail/single-content pages (default for DataPageLayout)
- **max-w-6xl** (72rem / 1152px) — Wider detail pages (articles, case studies, enrichment panels)
- **max-w-7xl** (80rem / 1280px) — Hub pages with multiple tools (ActorHub, IocHub, etc.)
- **max-w-4xl** (56rem / 896px) — Narrow single-column pages (About, privacy notices)

### Usage Pattern

```
/threatintel/              → w-full (inherited max-width from Layout)
/threatintel/actors        → max-w-7xl (hub/tabs)
/threatintel/actors/G1234  → max-w-5xl (detail)
/threatintel/research/:id  → max-w-6xl (rich content)
/threatintel/about         → max-w-4xl (docs)
```

### Horizontal Padding

All pages use: `px-4 sm:px-8`

- Mobile: 16px (4 \* 4)
- Desktop: 32px (8 \* 4)

## Vertical Spacing (py/space-y)

### Page Top Padding

- **Home/landing pages**: `py-4 sm:py-8`
- **Hub pages**: `py-6`
- **Detail pages**: `py-12`
- **Hero-centered pages** (e.g., CampaignDetail): `py-12 sm:py-20`

### Section Spacing (between blocks)

- **Landing pages** (Home, etc.): Use `space-y-6 sm:space-y-8` at container level
  - Mobile: 24px gaps
  - Desktop: 32px gaps
- **Detail pages**: Use `space-y-6` or `space-y-8`, OR explicit `mb-*` on each section
  - **Prefer space-y-\* over ad-hoc margins** (avoids margin collapse bugs)

### Heading Margins

- **h1 to following paragraph**: `mb-3` on h1 (12px)
- **h2 to following paragraph**: `mb-2` on h2 (8px)
- **h3 to following paragraph**: `mb-1.5` on h3 (6px)
- **Always explicit** — don't rely on sibling `mt-` (fragile)

### Meta/Caption Spacing

- Between title and description: `mt-1` or `mt-2` (depends on visual hierarchy)
- Below descriptions: Usually handled by parent's `space-y-*`

## Card Components

### Surface Classes (from index.css)

```css
.surface-card    /* rounded-xl, shadow-e1, dark:bg-slate-900/60 */
.surface-raised  /* rounded-xl, shadow-e2, dark:bg-slate-900/70 */
.card-hover      /* hover:-translate-y-0.5, hover:shadow-e2 */
```

### Card Padding Standards

- **Primary cards** (tiles, list items): `p-4` (16px)
- **Compact tiles** (grid items): `p-3` (12px)
- **Spacious panels** (hero, detail panels): `p-5` (20px)
- **Special cases** (tables, dense layouts): `p-2` (8px)

### Hover States

All interactive cards should use:

```tsx
className = 'group surface-card p-4 transition hover:-translate-y-0.5 hover:border-brand-500/50 hover:shadow-e2';
```

**Or** for threatintel (rose accent):

```tsx
className = 'group surface-card p-4 transition hover:-translate-y-0.5 hover:border-rose-500/50 hover:shadow-e2';
```

## Grid Layouts

### Responsive Column Progression

**Standard (most pages):**

```tsx
<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
```

- Mobile: 1 column
- Tablet (sm+): 2 columns
- Desktop (lg+): 3 columns

**QuickActions (special case):**

```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
```

- Mobile: 1 column, gap-2
- Tablet (sm+): 2 columns, gap-3
- Desktop (lg+): 4 columns, gap-3

### Grid Gap Standards

- `gap-2` (8px) — Compact layouts (dense grids, tight spacing)
- `gap-3` (12px) — Standard layouts (most grids)
- `gap-4` (16px) — Spacious layouts (hero sections)

### Hub Page Tabs

```tsx
<nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 mb-4">
  {TABS.map((t) => (
    <button
      className={`border-b-2 px-3 py-2 font-mono text-tool font-semibold transition-colors ${
        activeTab === t.id
          ? 'border-rose-600 text-rose-600 dark:border-rose-400 dark:text-rose-400'  /* Rose for threatintel */
          : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
      }`}
    >
```

**Note:** All threatintel hubs use rose colors (`rose-600/400`), DFIR uses brand blue.

## Typography

### Type Scale (from tailwind.config.js)

```
eyebrow   → 0.6875rem (11px) + 0.16em tracking (uppercase labels)
meta      → 0.75rem (12px) (captions, footnotes, metadata)
tool      → 0.8125rem (13px) (card descriptions, tile text)
mini      → 0.6875rem (11px) (plain labels, no tracking)
micro     → 0.625rem (10px) (tight chrome labels)
```

### Heading Sizes

- **h1** (page titles): `text-3xl sm:text-4xl font-display font-bold`
- **h2** (section titles): `text-2xl font-display font-bold` or `text-xl`
- **h3** (subsections): `text-base` or `text-lg font-display font-semibold`

### Text Color Convention

**All secondary/metadata text MUST include dark mode variant:**

```tsx
className = 'text-meta font-mono text-slate-500 dark:text-slate-400';
```

**Light mode**: slate-500 (4.6:1 on white, WCAG AA)
**Dark mode**: slate-400 (5.0:1 on slate-900, WCAG AA)

### Common Violations (DO NOT USE)

- ❌ `text-slate-400` without dark variant (fails contrast in light)
- ❌ `text-sm` (14px ad-hoc) — use `text-tool` (13px) instead
- ❌ `text-xs` (12px ad-hoc) — use `text-meta` (12px) instead
- ❌ `rounded-lg` for cards — use `surface-card` (includes `rounded-xl`)

## Color Theming

### Section Accents

- **/dfir** pages: Blue/brand (`text-brand-600 dark:text-brand-400`)
- **/threatintel** pages: Rose (`text-rose-600 dark:text-rose-400`)

### Hover State Shadows

All cards using `hover:shadow-*` should pick **one** option:

- **Option A (standard)**: `hover:shadow-e2` (16px shadow, 8px blur)
- **Option B (custom)** (deprecated): `hover:shadow-[0_8px_24px_-12px_rgba(44,62,229,0.25)]`

**Standardize on `hover:shadow-e2`** — don't mix.

## Dark Mode Guidelines

### Background Colors

- **Opaque surfaces** (main content): `dark:bg-slate-900`
- **Translucent overlays** (floating, secondary): `dark:bg-slate-900/40` or `/60`
- **Embedded panels** (cards within cards): `dark:bg-slate-900/60`
- **Deep/special contexts** (rare): `dark:bg-slate-950`

### Border Colors

- **Standard borders**: `dark:border-slate-800` (light mode: `border-slate-200`)
- **Subtle borders**: `dark:border-slate-700` (for lower contrast)
- **Transparent borders**: `dark:border-slate-800/50` (for glass effect)

### Text Colors

| Element       | Light            | Dark                  |
| ------------- | ---------------- | --------------------- |
| Body text     | `text-slate-900` | `dark:text-slate-100` |
| Secondary     | `text-slate-600` | `dark:text-slate-400` |
| Meta/caption  | `text-slate-500` | `dark:text-slate-400` |
| Disabled/hint | `text-slate-400` | `dark:text-slate-500` |

## Responsive Breakpoints (Tailwind)

| Breakpoint | Width   | Use Case                |
| ---------- | ------- | ----------------------- |
| _none_     | <640px  | Mobile                  |
| `sm`       | ≥640px  | Tablet landscape / iPad |
| `md`       | ≥768px  | Tablet portrait wide    |
| `lg`       | ≥1024px | Desktop                 |
| `xl`       | ≥1280px | Large desktop           |

**Current Grid Strategy**: Use `sm` as primary tablet breakpoint, `lg` for desktop (skip `md`).

## Spacing Constants (Tailwind Scale)

| Unit | Pixels | Common Uses                                      |
| ---- | ------ | ------------------------------------------------ |
| 0.5  | 2px    | hairlines, minimal gaps                          |
| 1    | 4px    | very tight spacing                               |
| 1.5  | 6px    | h3 margins, compact spacing                      |
| 2    | 8px    | mini/micro padding, compact grids                |
| 2.5  | 10px   | input padding                                    |
| 3    | 12px   | card padding (compact), h2 margins, standard gap |
| 4    | 16px   | card padding (standard), button padding          |
| 5    | 20px   | card padding (spacious), section padding         |
| 6    | 24px   | section spacing (mobile)                         |
| 8    | 32px   | section spacing (desktop), page padding          |
| 12   | 48px   | page top padding (py-12)                         |

## Border Radius Standards

| Class         | Size | Use Case                               |
| ------------- | ---- | -------------------------------------- |
| `rounded`     | 4px  | rare, minimal                          |
| `rounded-lg`  | 8px  | **DEPRECATED** — use `rounded-xl`      |
| `rounded-xl`  | 12px | **standard** — use via `.surface-card` |
| `rounded-2xl` | 16px | hero sections, large panels            |
| `rounded-3xl` | 24px | very rare                              |

**Migration in progress**: Replace all `rounded-lg` with `.surface-card` or explicit `.rounded-xl` classes.

## Animation & Transitions

### Stagger Animation (Home page)

Class: `.stagger` (defined in CSS)
Per-item delay: `style={{ animationDelay: `${i \* 40}ms` }}`
Creates 40ms offset between grid items (e.g., tiles assemble in sequence).

### Fade-in Animation

Class: `.animate-fade-in-up` (defined in tailwind.config.js)
Used on sections to create smooth entry (opacity + translateY).

### Standard Transitions

- Short interactions (hover): `duration-200`
- Card lift/shadow: `duration-200 transition-[transform,border-color,box-shadow]`
- Color changes: `transition-colors`

### Avoid

- `duration-300` or longer (feels slow)
- `ease-in-out` for micro-interactions (use default `ease`)
- Multiple keyframe definitions (stick to config)

## Component Checklist

Before committing new threat intel pages:

- [ ] Container width matches page type (7xl for hubs, 5xl for detail)
- [ ] Top padding: `py-6` (hubs) or `py-12` (detail) or `py-4 sm:py-8` (landing)
- [ ] All cards use `.surface-card` class (no bare `rounded-lg`)
- [ ] Grid uses `gap-3 sm:grid-cols-2 lg:grid-cols-3` pattern
- [ ] All headings have explicit margin-bottom (h1: mb-3, h2: mb-2)
- [ ] All secondary text includes `dark:text-slate-400` variant
- [ ] Tab buttons in hubs use `rose-600/400` (threatintel) or `brand-600/400` (dfir)
- [ ] Hover cards use `hover:shadow-e2` (not custom shadow)
- [ ] Page uses `space-y-6 sm:space-y-8` for section rhythm
- [ ] No ad-hoc `text-sm`, `text-xs` — use `text-tool`, `text-meta`

## Migration Notes

### Completed

- [x] Home.tsx: surface-card adoption, grid breakpoint unification, dark text fixes
- [x] ActorKb.tsx: border-radius, heading margins, dark contrast fixes
- [x] All Hub pages (15 total): Rose tab color theming
- [x] 35+ threat intel pages: Dark text contrast fixes

### In Progress

- [ ] Standardize all remaining detail pages (ActorTimeline, ActorUsernames, etc.)
- [ ] Fix .stagger animation definition / documentation
- [ ] Audit all remaining rounded-lg → surface-card migrations

### Future

- [ ] Create Tailwind plugin to enforce design tokens (warn on text-sm usage)
- [ ] Add component library with pre-styled card, grid, heading templates
- [ ] Document animation timing standards

---

## Hunt.io-inspired additions (2026-06-18)

Adopted from the Hunt.io glossary/PEAK surface — restraint and density,
not literal skin. See `docs/HUNTIO-AUDIT-2026-06-18.md` for the full
audit. Token additions live in `tailwind.config.js`; the prose utility
lives in `src/index.css`.

### Radius tokens

| Token           | Value | Use for                                       |
| --------------- | ----- | --------------------------------------------- |
| `rounded-card`  | 8px   | Data tiles, toolkit cards, profile card       |
| `rounded-panel` | 10px  | Panels with internal tables or dense rows     |
| `rounded-hero`  | 14px  | Hero CTA, contact panel, top-of-page callouts |

**Rule of thumb:** if the surface has rows/columns inside it, prefer
`rounded-card`. Only the hero/CTA panels earn `rounded-hero+`. The old
`rounded-2xl` blanket on every card is the AI-design tell we're
removing.

### Vertical rhythm on landing pages

Driven by the `RevealSection` wrappers in `src/pages/Home.tsx`, not
inline on each section. One source of truth.

| After section   | Gap     | Why                          |
| --------------- | ------- | ---------------------------- |
| Hero            | 0       | Sits at the top              |
| LiveSignalStrip | `mt-12` | 3rem — pairs with hero stat  |
| Toolkits        | `mt-20` | 5rem — first primary section |
| RecentWriting   | `mt-16` | 4rem — secondary             |
| Contact         | `mt-24` | 6rem — the closer, most air  |

### Hero stat row

Render the four stat chips as a `<ul>` of pills, not a single string
joined with middots. Mono, hairline border, even weight. Example:

```tsx
<ul className="mt-4 flex flex-wrap items-center gap-2 font-mono text-meta">
  <li className="rounded border bg-white/60 px-2 py-0.5">60+ tools</li>
  <li className="rounded border bg-white/60 px-2 py-0.5">18 feeds</li>
  <li className="rounded border bg-white/60 px-2 py-0.5">no login</li>
  <li className="rounded border bg-white/60 px-2 py-0.5">edge-hosted on Cloudflare</li>
</ul>
```

### Toolkits capability list

Use a `<dl>` with two columns (label / value) and a hairline divider
between rows — Hunt.io's "data table inside a card" pattern. Don't
re-state the description in a separate bullet list.

### Social link row

On dark CTA panels, render the social links as a single mono-uppercase
row of small text (no per-link icon chip). Equal weight, hover-underline
only. The icon chips with bold labels were a glassmorphism tell.

### `.prose-hunt` long-form utility

Apply to the wrapper of any `<p>/<ul>/<h2>` block on case studies, blog
posts, and the glossary. Caps the line length at ~70ch, lifts
line-height to 1.65, and uses the `--muted` token so body text stays

> =4.5:1 in both themes.
