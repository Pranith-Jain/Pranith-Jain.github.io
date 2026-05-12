# Phase 1 — Tokens & Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce editorial design tokens and rewrite the shared site chrome (Header, Footer, Layout, theme toggle) so every page picks up the new visual language while every existing page continues to render. Old neon colors and decorative animations remain present in the codebase but are no longer rendered — Phase 4 removes them.

**Architecture:** CSS variables hold semantic tokens (`--surface-page`, `--ink-1`, `--accent`, etc.) in `:root` (light) and `.dark` (dark). Tailwind config exposes those tokens as utility classes via the `theme.colors` CSS-variable bridge. The existing `brand-*` palette is repointed — class names stay valid; the colors render as deep editorial ink-blue instead of indigo. Three Google Fonts (Newsreader, Inter, JetBrains Mono) replace four (drops Poppins, Space Grotesk). Shared chrome components are edited surgically — behavior preserved, surface treatment swapped.

**Tech Stack:** Vite 6, React 18, TypeScript 5.7, Tailwind CSS 3.4, PostCSS, Google Fonts (CSS link), Cloudflare Workers (deploy target — no SSR runtime impact in this phase).

**Working directory:** `/Users/pranith/Documents/portfolio`

**Spec:** `docs/superpowers/specs/2026-05-12-portfolio-editorial-redesign-design.md`

**Out of scope:** Portfolio page content (Phase 2), DFIR AppShell (Phase 3), tool-page sweep (Phase 4), final anime-cyber illustration (separate asset work — Phase 1 ships a typographic OG placeholder).

---

## File map

| File                                 | Action  | Purpose                                                                                                                                                                                                                                                                         |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.css`                      | Modify  | Add `:root` + `.dark` CSS variable tokens; replace focus / scrollbar base layer; drop `hero-cascade` and `animate-float` keyframes.                                                                                                                                             |
| `tailwind.config.js`                 | Modify  | Add CSS-var-backed color tokens; repoint `brand-*` scale; swap `fontFamily` (drop Poppins + Space Grotesk, add JetBrains Mono); add motion duration tokens; drop `spring` timing function.                                                                                      |
| `index.html`                         | Modify  | Swap Google Fonts request; update `<meta name="theme-color">` to `#1B3A6B`.                                                                                                                                                                                                     |
| `src/components/ui/ThemeToggle.tsx`  | Modify  | Replace Sun/Moon icon button with LIGHT / DARK mono text pair.                                                                                                                                                                                                                  |
| `src/components/Header.tsx`          | Modify  | Drop `backdrop-blur`, gradient SVG masthead, scroll-state styling, mono-uppercase nav pills. Replace with: flat surface + 1px rule, serif wordmark, sans-tracked nav links with underline hover. Keep all behavior (mobile menu, dropdowns, focus trap, escape, click-outside). |
| `src/components/Footer.tsx`          | Modify  | Remove `italic` from wordmark + index entries. Drop `ease-spring`. Update "Set in" colophon to `Newsreader · Inter · JetBrains Mono`.                                                                                                                                           |
| `src/components/Layout.tsx`          | Modify  | Delete the two `bg-brand-*/10 blur-[120px]` decorative blob divs. Keep container width and padding.                                                                                                                                                                             |
| `src/App.tsx`                        | Modify  | Remove `BackgroundLayer`, `GrainOverlay`, and `IntelTicker` from render (both portfolio and app routes). Remove their imports.                                                                                                                                                  |
| `src/components/BackgroundLayer.tsx` | Delete  | Per spec — replaced by flat `--surface-page`.                                                                                                                                                                                                                                   |
| `src/components/GrainOverlay.tsx`    | Delete  | Per spec — no decorative grain.                                                                                                                                                                                                                                                 |
| `public/og-image.svg`                | Replace | Typographic placeholder using new ink-blue accent. Final illustration-based OG is separate asset work.                                                                                                                                                                          |

`src/components/IntelTicker.tsx` — file is kept on disk until Phase 3 / 4 (still referenced by `App.tsx` until this phase removes the render). After this plan, the component is unused but present. **Do not delete it in this phase.**

---

## Pre-flight

- [ ] **Step 1: Confirm clean git state**

Run:

```bash
cd /Users/pranith/Documents/portfolio
git status --short
```

Expected: only `?? docs/superpowers/specs/2026-05-12-portfolio-editorial-redesign-design.md` (and possibly the plan file itself). No other modified files.

If anything else is dirty, stop and ask the user.

- [ ] **Step 2: Confirm working tree builds before any changes**

Run:

```bash
npm run lint && npm run test:run && npm run build:client
```

Expected: all three commands exit 0. Capture the Lighthouse-relevant chunk size from the build output (e.g. "dist/assets/index-\*.css ... gzipped") so we can compare at the end.

If anything fails on the baseline, stop and ask the user.

- [ ] **Step 3: Commit the design spec from the previous step**

Run:

```bash
git add docs/superpowers/specs/2026-05-12-portfolio-editorial-redesign-design.md docs/superpowers/plans/2026-05-12-phase-1-tokens-and-chrome.md
git commit -m "docs(design): editorial redesign spec + phase-1 plan"
```

---

## Task 1 — Add design token CSS variables

**Files:**

- Modify: `src/index.css`

- [ ] **Step 1: Replace the `@layer base` block at the top of the file**

Find this block in `src/index.css` (lines 5-45):

```css
@layer base {
  html {
    font-family: theme('fontFamily.sans');
    scroll-behavior: smooth;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-family: theme('fontFamily.display');
  }

  html.dark {
    color-scheme: dark;
  }

  html:not(.dark) {
    color-scheme: light;
  }

  :focus-visible {
    outline: 2px solid theme('colors.brand.400');
    outline-offset: 3px;
  }

  /* Custom Scrollbar */
  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    @apply bg-slate-100 dark:bg-slate-900;
  }

  ::-webkit-scrollbar-thumb {
    @apply rounded-full bg-slate-300 transition-colors hover:bg-slate-400 dark:bg-slate-700 dark:hover:bg-slate-600;
  }
}
```

Replace it with:

```css
@layer base {
  /* ─── Editorial design tokens ──────────────────────────────────────
     Semantic, paired light/dark per
     docs/superpowers/specs/2026-05-12-portfolio-editorial-redesign-design.md
     ──────────────────────────────────────────────────────────────── */
  :root {
    --surface-page: #faf9f6;
    --surface-raised: #ffffff;
    --surface-sunken: #f2f0ea;
    --ink-1: #111111;
    --ink-2: #4a4a4a;
    --ink-3: #8b8780;
    --rule: #d8d4cb;
    --accent: #1b3a6b;
    --accent-soft: #e6ecf4;

    --motion-enter: 220ms;
    --motion-exit: 140ms;
    --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-in: cubic-bezier(0.5, 0, 0.75, 0);
  }

  html.dark {
    --surface-page: #0e0e10;
    --surface-raised: #16161a;
    --surface-sunken: #08080b;
    --ink-1: #eceae3;
    --ink-2: #a8a39a;
    --ink-3: #6e6963;
    --rule: #2a2a2e;
    --accent: #6c8ec9;
    --accent-soft: #1b2333;
  }

  html {
    font-family: theme('fontFamily.sans');
    scroll-behavior: smooth;
    background: var(--surface-page);
    color: var(--ink-1);
  }

  body {
    background: var(--surface-page);
    color: var(--ink-1);
  }

  h1,
  h2 {
    font-family: theme('fontFamily.serif');
    font-weight: 500;
    line-height: 1.15;
    letter-spacing: -0.01em;
  }

  h3,
  h4,
  h5,
  h6 {
    font-family: theme('fontFamily.sans');
    font-weight: 600;
    line-height: 1.2;
  }

  html.dark {
    color-scheme: dark;
  }

  html:not(.dark) {
    color-scheme: light;
  }

  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
  }

  /* Custom scrollbar — quieted to use the rule token */
  ::-webkit-scrollbar {
    width: 8px;
  }
  ::-webkit-scrollbar-track {
    background: var(--surface-page);
  }
  ::-webkit-scrollbar-thumb {
    background: var(--rule);
    border-radius: 9999px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: var(--ink-3);
  }
}
```

- [ ] **Step 2: Remove the decorative animation utilities**

Find the block at lines 70-97 (the `.shadow-glow`, `.animate-float`, `@keyframes float`, `.animate-pulse-slow`, `@keyframes pulse` block inside `@layer utilities`):

```css
.shadow-glow {
  box-shadow: 0 0 20px -5px rgba(37, 99, 235, 0.5);
}

.animate-float {
  animation: float 6s ease-in-out infinite;
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.animate-pulse-slow {
  animation: pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
}
```

Delete those rules entirely (keep the surrounding `@layer utilities { ... }` opening and closing). The `.bg-dot-grid` rule above them stays — Phase 4 removes it.

- [ ] **Step 3: Remove the `hero-cascade` staggered animation block**

Find and delete the comment block + rules at lines ~149-173 starting with `/* * Hero cascade — each top-level child of \`.hero-cascade\` fades in`and ending at the final`@media (prefers-reduced-motion: reduce) { .hero-cascade > \* { animation: none !important; } }`.

The `.animate-fade-in` and `.animate-fade-in-up` utilities ABOVE that block (the DFIR fade-in pair) stay — they're used by other pages and are token-compatible.

- [ ] **Step 4: Verify the file parses**

Run:

```bash
npm run build:client 2>&1 | tail -20
```

Expected: build succeeds. CSS chunk size may shrink (deleted ~25 lines of decorative rules) — that's normal.

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "design(tokens): add editorial CSS variables + drop decorative animations"
```

---

## Task 2 — Repoint Tailwind config

**Files:**

- Modify: `tailwind.config.js`

- [ ] **Step 1: Replace the file's contents**

Open `tailwind.config.js`. Replace the entire file with:

```js
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
        // utilities. The `spring` overshoot used previously is intentionally
        // dropped — no part of the new system uses it.
        'out-token': 'var(--ease-out)',
        'in-token': 'var(--ease-in)',
      },
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
```

Note what changed vs. the previous file:

- `brand.*` scale rebuilt around `#1B3A6B`.
- `fontFamily.mono` was `['Space Grotesk', 'monospace']` → now JetBrains Mono.
- `fontFamily.display` was `['Poppins', 'sans-serif']` → now Newsreader (alias of serif).
- `fontFamily.serif` ([already Newsreader](#)) is unchanged.
- New: `surface.*`, `ink.*`, `rule`, `accent.*` token classes.
- New: `duration-enter` / `duration-exit` motion utilities.
- Removed: `transitionTimingFunction.spring` (used previously by Footer wordmark hover).

- [ ] **Step 2: Verify config still parses + tailwind still builds**

Run:

```bash
npm run build:client 2>&1 | tail -10
```

Expected: build succeeds. Watch for warnings like "unknown class" — none expected at this point because the new utilities haven't been used yet, and the removed `ease-spring` utility shows up as an "unknown" only when something uses it (Footer.tsx, fixed in Task 7).

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.js
git commit -m "design(tokens): repoint brand palette to ink-blue + swap fonts in tailwind config"
```

---

## Task 3 — Swap Google Fonts + theme-color in `index.html`

**Files:**

- Modify: `index.html`

- [ ] **Step 1: Update the Google Fonts `<link>` element**

In `index.html`, find this `<link>` (around line 82-85):

```html
<link
  href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Newsreader:ital,opsz,wght@1,6..72,300;1,6..72,400;0,6..72,400;0,6..72,600&family=Poppins:wght@600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
  rel="stylesheet"
/>
```

Replace with:

```html
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap"
  rel="stylesheet"
/>
```

What changed:

- Dropped `Poppins` entirely.
- Dropped `Space Grotesk` entirely.
- Added `JetBrains Mono` at weights 400 + 500.
- Newsreader: dropped italic axis (`ital`) — spec is upright-only.
- Inter: dropped italic axis + weights 300 / 700 (unused after the redesign).

- [ ] **Step 2: Update the `<meta name="theme-color">`**

Find (around line 19):

```html
<meta name="theme-color" content="#2c3ee5" />
```

Replace with:

```html
<meta name="theme-color" content="#1b3a6b" />
```

- [ ] **Step 3: Update the comment about Poppins above the link**

Find this comment (around lines 79-81):

```html
<!-- Google Fonts with font-display swap for performance.
         Poppins weights 800/900 were dropped 2026-05-12 — only `font-display font-semibold` (600)
         and `font-display font-bold` (700) are used in the codebase. -->
```

Replace with:

```html
<!-- Google Fonts with font-display: swap. Three families:
           - Inter        (sans body + UI, 400/500/600)
           - JetBrains Mono (code + data labels, 400/500)
           - Newsreader   (serif headings + pull quotes, 400/500/600, upright only)
         Poppins + Space Grotesk were dropped 2026-05-12 with the editorial
         redesign — see docs/superpowers/specs/2026-05-12-portfolio-editorial-redesign-design.md -->
```

- [ ] **Step 4: Verify build still succeeds**

Run:

```bash
npm run build:client 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "design(tokens): swap Google Fonts to Inter+JetBrains+Newsreader + update theme-color"
```

---

## Task 4 — Update `ThemeToggle` to LIGHT / DARK mono pair

**Files:**

- Modify: `src/components/ui/ThemeToggle.tsx`

- [ ] **Step 1: Replace the component implementation**

Replace the entire file contents with:

```tsx
interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
}

/**
 * Editorial theme toggle — a "LIGHT / DARK" pair where the active mode is
 * rendered in the accent ink-blue and the inactive one is muted ink-3.
 * Single button so screen readers and keyboard users get one focusable
 * target; the visual treatment is two side-by-side spans.
 *
 * Per docs/superpowers/specs/2026-05-12-portfolio-editorial-redesign-design.md
 * (Header section). Replaces the previous Sun/Moon icon button.
 */
export function ThemeToggle({ isDark, onToggle }: ThemeToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-baseline gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <span className={isDark ? 'text-ink-3' : 'text-accent'}>Light</span>
      <span aria-hidden="true" className="text-ink-3">
        /
      </span>
      <span className={isDark ? 'text-accent' : 'text-ink-3'}>Dark</span>
    </button>
  );
}
```

- [ ] **Step 2: Verify type-check passes**

Run:

```bash
npx tsc --noEmit 2>&1 | tail -10
```

Expected: no TypeScript errors related to this file. (Pre-existing errors elsewhere — if any — are acceptable; just confirm no new ones from `ThemeToggle.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/ThemeToggle.tsx
git commit -m "design(chrome): replace ThemeToggle icon button with LIGHT/DARK mono pair"
```

---

## Task 5 — Edit `Header.tsx`

The `Header` keeps **all** of its existing behavior (mobile menu, focus trap, dropdowns, escape key, click-outside, route-change menu close, scroll listener). Only visual class strings change. Do not touch the hooks or the JSX structure outside the explicit edits below.

**Files:**

- Modify: `src/components/Header.tsx`

- [ ] **Step 1: Drop the scroll-state styling and `backdrop-blur`**

Find (around lines 104-110):

```tsx
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'border-b border-slate-200/60 bg-white/85 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/85'
            : 'border-b border-transparent bg-white/75 backdrop-blur-xl dark:bg-slate-950/70'
        }`}
        role="banner"
      >
```

Replace with:

```tsx
      <header
        className="sticky top-0 z-50 border-b border-rule bg-surface-page"
        role="banner"
      >
```

The `isScrolled` state and its effect are now unused but still computed. **Leave the `useState`, `useEffect` for scroll listener, and the variable in place** — Phase 2's Hero may use it for parallax. The unused-var lint rule does not fire for state setters.

If the lint configuration flags `isScrolled` as unused (it's used in JSX above only), this single conditional is removed and the variable is now truly unused. **In that case**, remove lines 15 (state declaration) and 22-30 (the scroll listener effect) as part of this step.

- [ ] **Step 2: Replace the masthead wordmark**

Find the `<Link to="/">` block at lines 114-150 (the gradient SVG PJ logo + masthead label):

```tsx
{
  /* Masthead */
}
<Link
  to="/"
  className="group inline-flex items-baseline gap-3 rounded focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
  aria-label="P. Jain Dossier — Back to home"
>
  <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg shadow-sm">
    <svg viewBox="0 0 36 36" className="h-full w-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="pjGradientHeader" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2c3ee5" />
          <stop offset="100%" stopColor="#435ef1" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="8" fill="url(#pjGradientHeader)" />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fill="white"
        fontFamily="Poppins, sans-serif"
        fontWeight="800"
        fontSize="16"
      >
        PJ
      </text>
    </svg>
  </span>
  <span className="hidden flex-col leading-none sm:flex">
    <span className="font-mono text-[9px] uppercase tracking-[0.32em] text-slate-500 group-hover:text-brand-600 dark:group-hover:text-brand-400">
      P.&nbsp;Jain · Dossier
    </span>
    <span className="mt-1 font-mono text-[8px] uppercase tracking-[0.4em] text-slate-400 dark:text-slate-600">
      Issue&nbsp;26.05 — Threat&nbsp;Intel
    </span>
  </span>
</Link>;
```

Replace with:

```tsx
{
  /* Masthead — editorial wordmark */
}
<Link
  to="/"
  className="font-serif text-lg font-medium tracking-tight text-ink-1 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent"
  aria-label="Pranith Jain — back to home"
>
  Pranith Jain
</Link>;
```

- [ ] **Step 3: Replace the desktop nav link class strings**

Find the desktop `<button>` (the dropdown-trigger) at lines 166-189 — specifically the `className` template literal at lines 175-179:

```tsx
                        className={`flex items-center gap-1 rounded px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                          isActive(link.href)
                            ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300'
                            : 'text-slate-600 hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
                        }`}
```

Replace with:

```tsx
                        className={`inline-flex items-center gap-1 py-1.5 text-sm font-medium tracking-tight transition-colors duration-enter focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent ${
                          isActive(link.href)
                            ? 'text-ink-1 underline decoration-accent decoration-2 underline-offset-8'
                            : 'text-ink-2 hover:text-ink-1 hover:underline hover:decoration-accent hover:decoration-2 hover:underline-offset-8'
                        }`}
```

Then find the second `<Link>` (the non-dropdown nav item) at lines 213-225 — the `className`:

```tsx
                      className={`rounded px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.22em] transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                        isActive(link.href)
                          ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300'
                          : 'text-slate-600 hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white'
                      }`}
```

Replace with:

```tsx
                      className={`inline-flex items-center py-1.5 text-sm font-medium tracking-tight transition-colors duration-enter focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent ${
                        isActive(link.href)
                          ? 'text-ink-1 underline decoration-accent decoration-2 underline-offset-8'
                          : 'text-ink-2 hover:text-ink-1 hover:underline hover:decoration-accent hover:decoration-2 hover:underline-offset-8'
                      }`}
```

- [ ] **Step 4: Quiet the dropdown menu surface**

Find the dropdown panel at lines 191-210 — the wrapping `<div>` className:

```tsx
                        <div
                          id={`dropdown-${link.href.replace('/', '')}`}
                          className="absolute left-0 top-full mt-1 min-w-[200px] rounded-xl border border-slate-200/60 bg-white/95 py-2 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95"
                          onMouseLeave={() => setOpenDropdown(null)}
                        >
```

Replace with:

```tsx
                        <div
                          id={`dropdown-${link.href.replace('/', '')}`}
                          className="absolute left-0 top-full mt-2 min-w-[220px] border border-rule bg-surface-raised py-2"
                          onMouseLeave={() => setOpenDropdown(null)}
                        >
```

And the dropdown items' `<Link>` className at lines 197-205:

```tsx
className =
  'block px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10 focus:outline-none focus:bg-slate-100 dark:focus:bg-white/10';
```

Replace with:

```tsx
className =
  'block px-4 py-2 text-sm text-ink-2 transition-colors duration-enter hover:bg-accent-soft hover:text-ink-1 focus:outline-none focus:bg-accent-soft focus:text-ink-1';
```

- [ ] **Step 5: Quiet the mobile menu button**

Find the mobile menu toggle button at lines 234-248. Replace its `className`:

```tsx
className =
  'grid h-10 w-10 place-items-center rounded-full border border-slate-200/60 bg-white/70 text-slate-700 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-200 md:hidden focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2';
```

Replace with:

```tsx
className =
  'grid h-10 w-10 place-items-center border border-rule text-ink-1 transition-colors duration-enter hover:border-ink-1 md:hidden focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent';
```

- [ ] **Step 6: Quiet the mobile menu overlay + nav surface**

Find the mobile overlay backdrop div at lines 261-264:

```tsx
<div
  className="absolute inset-0 bg-slate-950/20 backdrop-blur-sm dark:bg-slate-950/40"
  onClick={closeMobileMenu}
  aria-hidden="true"
/>
```

Replace with:

```tsx
<div className="absolute inset-0 bg-ink-1/40" onClick={closeMobileMenu} aria-hidden="true" />
```

Find the nav surface at lines 268-272:

```tsx
          <nav
            className="absolute top-[72px] left-0 right-0 border-t border-slate-200/60 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 max-h-[calc(100vh-80px)] overflow-y-auto"
            role="navigation"
            aria-label="Mobile navigation"
          >
```

Replace with:

```tsx
          <nav
            className="absolute top-[64px] left-0 right-0 border-t border-rule bg-surface-page max-h-[calc(100vh-64px)] overflow-y-auto"
            role="navigation"
            aria-label="Mobile navigation"
          >
```

Find the mobile menu item `<Link>` at lines 276-285:

```tsx
                    className={`rounded-lg px-4 py-3 text-sm font-medium block focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                      isActive(link.href)
                        ? 'text-brand-600 dark:text-brand-400 bg-brand-500/10'
                        : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10'
                    }`}
```

Replace with:

```tsx
                    className={`block px-4 py-3 text-sm font-medium focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent ${
                      isActive(link.href)
                        ? 'text-ink-1 underline decoration-accent decoration-2 underline-offset-8'
                        : 'text-ink-2 hover:text-ink-1'
                    }`}
```

And the mobile sub-link className at lines 290-296:

```tsx
className =
  'block rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2';
```

Replace with:

```tsx
className =
  'block px-4 py-2 text-xs text-ink-3 hover:text-ink-1 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent';
```

- [ ] **Step 7: Verify type-check and component test**

Run:

```bash
npx tsc --noEmit 2>&1 | tail -10
npm run test:run 2>&1 | tail -20
```

Expected: no new TypeScript errors. Existing component tests pass (`DfirRoutes.test.tsx`, `ErrorBoundary.test.tsx`).

- [ ] **Step 8: Commit**

```bash
git add src/components/Header.tsx
git commit -m "design(chrome): rewrite Header to editorial wordmark + underline nav"
```

---

## Task 6 — Edit `Footer.tsx`

**Files:**

- Modify: `src/components/Footer.tsx`

- [ ] **Step 1: De-italicize the wordmark and drop `ease-spring`**

Find the `<a href="#top">` block at lines 56-65:

```tsx
<a
  href="#top"
  className="group inline-flex items-baseline gap-3 rounded focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
  aria-label={`${personalInfo.name} — back to top`}
>
  <span className="font-serif text-3xl font-light italic leading-none text-slate-900 transition-transform duration-200 ease-spring group-hover:-translate-y-0.5 dark:text-white">
    P.&nbsp;Jain
  </span>
  <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-slate-500">Dossier</span>
</a>
```

Replace with:

```tsx
<a
  href="#top"
  className="group inline-flex items-baseline gap-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-accent"
  aria-label={`${personalInfo.name} — back to top`}
>
  <span className="font-serif text-3xl font-medium leading-none text-ink-1 transition-colors duration-enter group-hover:text-accent">
    Pranith Jain
  </span>
  <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink-3">Dossier</span>
</a>
```

What changed:

- `font-light italic` → `font-medium` (upright, per spec)
- `transition-transform ... ease-spring group-hover:-translate-y-0.5` → `transition-colors group-hover:text-accent` (no spring overshoot, no decorative translate)
- `text-slate-900 dark:text-white` → `text-ink-1` (token)
- `text-slate-500` → `text-ink-3` (token)
- `P.&nbsp;Jain` → `Pranith Jain` (matches Header masthead)

- [ ] **Step 2: De-italicize the index-of-sections entries**

Find the `inner` JSX at lines 81-89:

```tsx
const inner = (
  <>
    <span className="tabular-nums text-slate-500">{s.no}</span>
    <span className="flex-1 italic">{s.subject}</span>
    <span
      aria-hidden="true"
      className="h-px flex-1 bg-slate-200 transition-colors group-hover:bg-brand-400 dark:bg-slate-800"
    />
  </>
);
```

Replace with:

```tsx
const inner = (
  <>
    <span className="tabular-nums text-ink-3">{s.no}</span>
    <span className="flex-1">{s.subject}</span>
    <span aria-hidden="true" className="h-px flex-1 bg-rule transition-colors duration-enter group-hover:bg-accent" />
  </>
);
```

- [ ] **Step 3: Update the "Set in" colophon to reflect the new font stack**

Find lines 115-120:

```tsx
<div>
  <dt className="text-[9px] uppercase tracking-[0.22em] text-slate-500">Set in</dt>
  <dd className="mt-1 text-slate-800 dark:text-slate-200">
    <span className="font-serif text-[15px] italic">Newsreader</span> · Space&nbsp;Grotesk · Inter
  </dd>
</div>
```

Replace with:

```tsx
<div>
  <dt className="text-[9px] uppercase tracking-[0.22em] text-ink-3">Set in</dt>
  <dd className="mt-1 text-ink-2">
    <span className="font-serif text-[15px]">Newsreader</span> · Inter · JetBrains Mono
  </dd>
</div>
```

- [ ] **Step 4: Replace remaining `slate-*` tokens in the file**

Inside `Footer.tsx`, perform these find-and-replace passes (verify each is unique within the file before applying):

| Find                                                                                                         | Replace                                                                         |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `text-brand-600 dark:text-brand-400` (in ColophonHead)                                                       | `text-accent`                                                                   |
| `text-slate-500`                                                                                             | `text-ink-3`                                                                    |
| `bg-slate-200 dark:bg-slate-800` (in ColophonHead h-px rule)                                                 | `bg-rule`                                                                       |
| `border-slate-200 dark:border-slate-800` (top + bottom rules)                                                | `border-rule`                                                                   |
| `text-slate-700 ... hover:text-brand-700 dark:text-slate-300 dark:hover:text-brand-300` (in section I links) | `text-ink-2 hover:text-accent` (collapse light + dark since tokens auto-switch) |
| `bg-slate-900 dark:bg-white/60` (the heavy rule div near top)                                                | `bg-ink-1`                                                                      |
| `text-slate-800 dark:text-slate-200` (the `dd` text colors in colophon)                                      | `text-ink-2`                                                                    |
| `text-slate-400 dark:text-slate-600` (end-of-issue text)                                                     | `text-ink-3`                                                                    |
| `decoration-brand-500`                                                                                       | `decoration-accent`                                                             |

If `replace_all` would over-match (some classes appear multiple times), apply each Edit individually with enough surrounding context to keep changes scoped.

After all replacements, the file should have **zero** references to `slate-*`, `brand-*` color utilities, or `italic`. Verify with:

```bash
grep -n "slate-\|italic\|ease-spring\|brand-[0-9]" src/components/Footer.tsx
```

Expected: empty output.

- [ ] **Step 5: Verify type-check + tests still pass**

Run:

```bash
npx tsc --noEmit 2>&1 | tail -5
npm run test:run 2>&1 | tail -10
```

Expected: no errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/Footer.tsx
git commit -m "design(chrome): rewrite Footer to editorial colophon with new tokens"
```

---

## Task 7 — Strip decorative blobs from `Layout.tsx`

**Files:**

- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Replace the file contents**

Replace `src/components/Layout.tsx` with:

```tsx
import { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6">{children}</div>
    </div>
  );
}
```

What changed: dropped the two `pointer-events-none absolute ... blur-[120px]` decorative blob divs and the `relative` + `z-index: 2` wrapper they required. The flat `--surface-page` background (set in `body` via `index.css`) now shows through cleanly.

- [ ] **Step 2: Verify**

Run:

```bash
npx tsc --noEmit 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Layout.tsx
git commit -m "design(chrome): drop decorative blur blobs from Layout"
```

---

## Task 8 — Remove BackgroundLayer / GrainOverlay / IntelTicker from `App.tsx`

**Files:**

- Modify: `src/App.tsx`

- [ ] **Step 1: Remove three imports**

Find at lines 11-13:

```tsx
import { BackgroundLayer } from './components/BackgroundLayer';
import { GrainOverlay } from './components/GrainOverlay';
import { IntelTicker } from './components/IntelTicker';
```

Delete those three lines.

- [ ] **Step 2: Remove the components from the app-route render**

Find the `isAppRoute` block (around lines 906-920):

```tsx
if (isAppRoute && appMode) {
  return (
    <>
      <StructuredData />
      <SkipToContent />
      <BackgroundLayer isDark={isDark} />
      <GrainOverlay />
      <CommandPalette />
      <AppShell mode={appMode} isDark={isDark} onToggleTheme={toggleTheme}>
        {routes}
      </AppShell>
      <div id="aria-live-region" aria-live="polite" aria-atomic="true" className="sr-only" />
    </>
  );
}
```

Replace with:

```tsx
if (isAppRoute && appMode) {
  return (
    <>
      <StructuredData />
      <SkipToContent />
      <CommandPalette />
      <AppShell mode={appMode} isDark={isDark} onToggleTheme={toggleTheme}>
        {routes}
      </AppShell>
      <div id="aria-live-region" aria-live="polite" aria-atomic="true" className="sr-only" />
    </>
  );
}
```

`isDark` becomes unused inside this branch — that's fine, it's still consumed by `AppShell`.

- [ ] **Step 3: Remove the components from the portfolio render**

Find the portfolio render block (around lines 922-944):

```tsx
return (
  <>
    <StructuredData />
    <SkipToContent />
    <BackgroundLayer isDark={isDark} />
    <GrainOverlay />

    <ScrollProgress progress={progress} />
    <IntelTicker />
    <Header isDark={isDark} onToggleTheme={toggleTheme} />
    <CommandPalette />

    <main id="main-content" tabIndex={-1}>
      <Layout>{routes}</Layout>
    </main>

    <Footer />
    <BackToTop visible={showBackToTop} onClick={scrollToTop} />

    <div id="aria-live-region" aria-live="polite" aria-atomic="true" className="sr-only" />
  </>
);
```

Replace with:

```tsx
return (
  <>
    <StructuredData />
    <SkipToContent />

    <ScrollProgress progress={progress} />
    <Header isDark={isDark} onToggleTheme={toggleTheme} />
    <CommandPalette />

    <main id="main-content" tabIndex={-1}>
      <Layout>{routes}</Layout>
    </main>

    <Footer />
    <BackToTop visible={showBackToTop} onClick={scrollToTop} />

    <div id="aria-live-region" aria-live="polite" aria-atomic="true" className="sr-only" />
  </>
);
```

- [ ] **Step 4: Verify type-check + tests**

Run:

```bash
npx tsc --noEmit 2>&1 | tail -5
npm run test:run 2>&1 | tail -10
```

Expected: no errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "design(chrome): remove BackgroundLayer / GrainOverlay / IntelTicker from app render"
```

---

## Task 9 — Delete `BackgroundLayer.tsx` and `GrainOverlay.tsx`

**Files:**

- Delete: `src/components/BackgroundLayer.tsx`
- Delete: `src/components/GrainOverlay.tsx`

(`IntelTicker.tsx` stays on disk until Phase 3 — it's still imported by no code now, but other phases may reference its data utility helpers.)

- [ ] **Step 1: Confirm nothing else imports these files**

Run:

```bash
grep -rn "BackgroundLayer\|GrainOverlay" src 2>&1
```

Expected: zero matches (the App.tsx removals from Task 8 cleared them).

If there are matches, stop and resolve them before deleting.

- [ ] **Step 2: Delete the files**

```bash
rm src/components/BackgroundLayer.tsx src/components/GrainOverlay.tsx
```

- [ ] **Step 3: Verify build + tests**

Run:

```bash
npm run build:client 2>&1 | tail -10
npm run test:run 2>&1 | tail -10
```

Expected: build succeeds, tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A src/components
git commit -m "design(chrome): delete BackgroundLayer + GrainOverlay (replaced by flat surface)"
```

---

## Task 10 — Update `IntelTicker` import drift check

`IntelTicker.tsx` may still import from places that the redesign breaks. Verify it's not silently broken before merging.

**Files:**

- Read: `src/components/IntelTicker.tsx` (no modification expected)

- [ ] **Step 1: Confirm it still type-checks**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -i "IntelTicker" | tail -10
```

Expected: empty (no errors mention `IntelTicker`).

If errors surface, **do not fix them in this phase** — record the failure in a comment at the top of `IntelTicker.tsx` and leave it for Phase 3 to address. The component is no longer rendered, so a non-typechecking file is acceptable temporarily — but `tsc --noEmit` failing will block the whole build. If that happens, take the smaller workaround: add `// @ts-nocheck` to line 1 of `IntelTicker.tsx`.

- [ ] **Step 2: If a workaround was applied, commit it**

If you needed `// @ts-nocheck`:

```bash
git add src/components/IntelTicker.tsx
git commit -m "chore: silence IntelTicker type-check temporarily (deleted in Phase 3)"
```

Otherwise this task is a no-op verification — skip the commit.

---

## Task 11 — Regenerate `public/og-image.svg` with new accent (placeholder)

The OG image is the social-share preview. Phase 1 swaps in the new accent so shares don't broadcast the old indigo brand. The final illustration-based OG (per spec's "Visual identity" section) is separate asset work.

**Files:**

- Modify: `public/og-image.svg`

- [ ] **Step 1: Replace the file contents**

Replace `public/og-image.svg` with:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <!-- Background — bone paper -->
  <rect width="1200" height="630" fill="#FAF9F6"/>

  <!-- Top + bottom hairlines, magazine-style -->
  <rect x="80" y="80" width="1040" height="2" fill="#111111"/>
  <rect x="80" y="548" width="1040" height="1" fill="#D8D4CB"/>

  <!-- Issue / section eyebrow — mono caps -->
  <text x="80" y="120" font-family="ui-monospace, monospace" font-size="14" font-weight="500" fill="#4A4A4A" letter-spacing="0.22em">PRANITH JAIN · DOSSIER · ISSUE 26.05</text>

  <!-- Main headline — Newsreader display -->
  <text x="80" y="240" font-family="Newsreader, ui-serif, Georgia, serif" font-size="72" font-weight="500" fill="#111111">A working DFIR</text>
  <text x="80" y="320" font-family="Newsreader, ui-serif, Georgia, serif" font-size="72" font-weight="500" fill="#1B3A6B">toolkit on the edge.</text>

  <!-- Supporting line — Inter body -->
  <text x="80" y="380" font-family="Inter, system-ui, sans-serif" font-size="22" font-weight="400" fill="#4A4A4A">60+ tools across 11 categories · 90+ threat-intel sources · runs on Cloudflare Workers</text>

  <!-- Stat row — mono labels above sans figures, hairline borders only -->
  <g transform="translate(80, 440)" font-family="Inter, system-ui, sans-serif">
    <g>
      <rect width="220" height="70" fill="none" stroke="#D8D4CB" stroke-width="1"/>
      <text x="16" y="26" font-family="ui-monospace, monospace" font-size="11" fill="#8B8780" letter-spacing="0.18em">DOMAINS SECURED</text>
      <text x="16" y="54" font-size="24" font-weight="500" fill="#111111">1,300+</text>
    </g>
    <g transform="translate(244, 0)">
      <rect width="220" height="70" fill="none" stroke="#D8D4CB" stroke-width="1"/>
      <text x="16" y="26" font-family="ui-monospace, monospace" font-size="11" fill="#8B8780" letter-spacing="0.18em">INCIDENTS</text>
      <text x="16" y="54" font-size="24" font-weight="500" fill="#111111">250+</text>
    </g>
    <g transform="translate(488, 0)">
      <rect width="220" height="70" fill="none" stroke="#D8D4CB" stroke-width="1"/>
      <text x="16" y="26" font-family="ui-monospace, monospace" font-size="11" fill="#8B8780" letter-spacing="0.18em">RESPONSE</text>
      <text x="16" y="54" font-size="24" font-weight="500" fill="#111111">&lt; 75 min</text>
    </g>
    <g transform="translate(732, 0)">
      <rect width="220" height="70" fill="#1B3A6B"/>
      <text x="16" y="26" font-family="ui-monospace, monospace" font-size="11" fill="#C5D2E5" letter-spacing="0.18em">LIVE AT</text>
      <text x="16" y="54" font-size="22" font-weight="500" fill="#FFFFFF">pranithjain.qzz.io</text>
    </g>
  </g>

  <!-- Footer line — index of categories -->
  <text x="80" y="580" font-family="ui-monospace, monospace" font-size="12" fill="#8B8780" letter-spacing="0.10em">/dfir · IOC Checker · Threat Map · STIX Viewer · Email Defense · Dark Web Watch · MITRE ATT&amp;CK</text>
</svg>
```

What changed vs. the previous file:

- Background: dark gradient → bone paper `#FAF9F6`
- Removed the glowing radial gradient
- Removed the gradient PJ logo (replaced by typographic masthead eyebrow)
- Removed the `<g stroke="#1e293b">` subtle grid
- Stats use hairline borders + ink type, not filled dark cards
- Single accent block is the "LIVE AT" chip in ink-blue
- Newsreader serif for the headline (matches the site)
- "PJ" gradient logo + brandText gradient deleted

- [ ] **Step 2: Visually verify the file renders**

Run:

```bash
open public/og-image.svg
```

Expected: bone-paper background with serif headline reading "A working DFIR toolkit on the edge." Second line in ink-blue. Four stat cards along the bottom, three with hairline borders and one filled ink-blue.

If it looks broken (e.g. transparent background, missing fonts), check that the file is valid SVG with `xmllint --noout public/og-image.svg`.

- [ ] **Step 3: Commit**

```bash
git add public/og-image.svg
git commit -m "design(chrome): regenerate OG image placeholder with editorial tokens"
```

---

## Task 12 — Full verification + Lighthouse gate

This is the Phase 1 acceptance gate per the spec.

- [ ] **Step 1: Full lint + type-check + test + build**

Run:

```bash
npm run lint && npx tsc --noEmit && npm run test:run && npm run build:client && npm run build:server
```

Expected: all five commands exit 0.

If `npm run build:server` fails with SSR errors (e.g. `document is not defined`), investigate — the most likely culprit is a `useEffect` that needs a guard. Do not skip this check.

- [ ] **Step 2: Dev server smoke test**

Start the dev server:

```bash
npm run dev
```

Open in browser, visit each of:

- `http://localhost:5173/` (Home)
- `http://localhost:5173/about`
- `http://localhost:5173/dfir`
- `http://localhost:5173/dfir/ioc-check` (any tool page)
- `http://localhost:5173/threatintel` (threatintel landing)

For each page, verify:

- Page renders without console errors
- Header shows "Pranith Jain" wordmark + sans nav with underline hover
- Theme toggle reads "Light / Dark" with one half in ink-blue
- No noise / grain texture visible
- No gradient mesh / radial blur in the background — should be flat bone paper (light) or ink (dark)
- Footer wordmark is upright "Pranith Jain" (not italic, not "P. Jain")

Toggle dark mode and re-verify the same pages render.

Stop the dev server (Ctrl-C).

- [ ] **Step 3: Production preview + Lighthouse check on key pages**

Run:

```bash
npm run build && npm run preview
```

In a new terminal, run Lighthouse against the URLs the spec calls out as previously measured:

```bash
npx lighthouse http://localhost:4173/threatintel/wiki --only-categories=performance --quiet --chrome-flags='--headless'
npx lighthouse http://localhost:4173/dfir/exif --only-categories=performance --quiet --chrome-flags='--headless'
```

Expected (per spec success criteria):

- `/threatintel/wiki` performance score ≥ 77
- `/dfir/exif` performance score ≥ 84

If either regresses, do not merge — investigate. The most likely cause is the font swap (extra round-trip for JetBrains Mono) or removed `preconnect`/`dns-prefetch` lines. Check `index.html`'s `<link rel="preconnect">` to fonts is intact.

Stop the preview server.

- [ ] **Step 4: Reduced-motion sanity check**

Open the production preview again (`npm run preview`). In Chrome DevTools → Rendering → Emulate CSS media feature `prefers-reduced-motion: reduce`. Visit Home and `/dfir`. Confirm no animations play.

- [ ] **Step 5: Grep for clean state**

```bash
grep -rn "BackgroundLayer\|GrainOverlay" src 2>&1
grep -rn "ease-spring" src 2>&1
grep -rn "italic" src/components/Header.tsx src/components/Footer.tsx 2>&1
```

Expected: all three return empty.

`italic` is allowed elsewhere in the codebase during Phase 1 (writeups, prose) — only `Header.tsx` and `Footer.tsx` must be italic-free.

- [ ] **Step 6: Final phase commit**

If the previous steps produced no further changes, skip this step. Otherwise stage and commit any small fixes:

```bash
git add -A
git commit -m "design(chrome): finalize Phase 1 token + chrome cleanup"
```

- [ ] **Step 7: Summarize phase completion**

Print a summary to the user:

```
Phase 1 complete.

Changed:
  M  index.html               (fonts, theme-color)
  M  tailwind.config.js       (brand palette repointed, fonts swapped)
  M  src/index.css            (tokens added, decorative anims dropped)
  M  src/components/Header.tsx
  M  src/components/Footer.tsx
  M  src/components/Layout.tsx
  M  src/components/ui/ThemeToggle.tsx
  M  src/App.tsx
  M  public/og-image.svg
  D  src/components/BackgroundLayer.tsx
  D  src/components/GrainOverlay.tsx

Lighthouse: wiki <score>, exif <score>  (vs. baseline 77 / 84)
SSR build: ok
Reduced motion: respected

Next: Phase 2 plan (portfolio pages — Hero, Featured, Contact,
Companies collapsible, About/Skills/Experience/Projects).
```

Hand back to the user for review before starting Phase 2.

---

## Self-review

**Spec coverage check** (against `docs/superpowers/specs/2026-05-12-portfolio-editorial-redesign-design.md` Phase 1 section):

- ✅ tailwind.config.js: tokens added, brand repointed, fonts swapped → Task 2
- ✅ index.html: fonts swapped, theme-color updated → Task 3
- ✅ src/index.css: tokens, focus ring, drop hero-cascade → Task 1
- ✅ Header / Footer / Layout rewrite → Tasks 5, 6, 7
- ✅ Delete BackgroundLayer + GrainOverlay → Task 9
- ✅ Remove IntelTicker render → Task 8
- ✅ OG placeholder with new accent → Task 11
- ✅ Theme toggle rewrite → Task 4 (called out in primitives §)
- ✅ Lighthouse gate (wiki ≥ 77, exif ≥ 84) → Task 12

**Not in this phase per spec:** Companies collapsible (Phase 2), AppShell rewrite (Phase 3), tool-page sweep (Phase 4), final illustration-based OG (separate asset work).

**Placeholder scan:** No "TBD" / "implement later" / vague steps. Every code edit shows the actual code.

**Type / name consistency:**

- `Header.tsx` uses `text-ink-1` / `text-ink-2` / `text-ink-3` / `bg-surface-page` / `border-rule` / `text-accent` — all defined in Task 2's tailwind config.
- `Footer.tsx` uses the same token set — confirmed.
- `ThemeToggle.tsx` uses `text-accent` / `text-ink-3` — confirmed.
- `duration-enter` / `duration-exit` utilities defined in Task 2, consumed in Tasks 4-6.
- `outline-accent` Tailwind utility — generated from the `accent` color extension. Confirmed.
