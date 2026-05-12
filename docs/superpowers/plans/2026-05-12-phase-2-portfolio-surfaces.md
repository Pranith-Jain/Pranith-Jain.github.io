# Phase 2 — Portfolio Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the five portfolio routes (`/`, `/about`, `/skills`, `/experience`, `/projects`) and the editorial primitive set so every section consumes Phase 1's design tokens directly, drops italic + decorative motion, and reads as the editorial dossier described in the spec.

**Architecture:** Surgical, one-section-at-a-time. Each section file's logic stays — class strings, JSX of decorative spans, and italic styling get replaced. `editorial.tsx` ships first because every section imports `FiledTag` / `DropCapParagraph` / `PullQuote`. `Companies.tsx` gains a small `useState` for the new collapsible pattern. `Skills.tsx` collapses its 6-color accent system to monochrome per spec ("single accent"). `Contact.tsx` loses the dark slate CTA panel and becomes a flat inline section. The site stays shippable after each commit.

**Tech Stack:** Vite 6, React 18, TypeScript 5.7, Tailwind 3.4. Same as Phase 1.

**Working directory:** `/Users/pranith/Documents/portfolio-redesign`
**Branch:** `redesign/phase-1-tokens-and-chrome` (Phase 2 stacks on top — same branch, additional commits)

**Spec:** `docs/superpowers/specs/2026-05-12-portfolio-editorial-redesign-design.md`
**Phase 1 plan:** `docs/superpowers/plans/2026-05-12-phase-1-tokens-and-chrome.md`

**Out of scope:** AppShell + `/dfir` + `/threatintel` tool pages (Phase 3 + 4). Final anime-cyber illustration (separate asset work — Hero ships type-only here, image plate slots in via follow-up commit once the illustration exists).

---

## File map

| File                                         | Action  | Purpose                                                                                                                                                                                                                                             |
| -------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/editorial.tsx`               | Rewrite | Drop italic + accent-color prop + quote-glyph decoration. New API: single accent everywhere, upright Newsreader, centered attribution, no horizontal rules.                                                                                         |
| `src/components/sections/Hero.tsx`           | Rewrite | Drop italic headline, gradient PJ SVG, status-color pills, ease-spring transitions, animate-fade-in-up. New: single-column editorial type stack, one primary CTA, one secondary link. Image plate scaffolded but disabled until illustration ships. |
| `src/components/sections/About.tsx`          | Rewrite | Drop italic H2, decorative blur blobs, slate/brand utilities. Keep the terminal mock as the page's visual hook (re-tokenized).                                                                                                                      |
| `src/components/sections/Featured.tsx`       | Rewrite | Drop italic, ease-spring, gradient F/D marks, status-color pill borders. List rows with mono numerals + serif titles.                                                                                                                               |
| `src/components/sections/Companies.tsx`      | Rewrite | Drop the all-at-once wordmark wall. New collapsible pattern: 6 wordmarks default, "Show all" reveals the rest with staggered fade.                                                                                                                  |
| `src/components/sections/Experience.tsx`     | Rewrite | Drop italic role headings, emerald status badges, brand-\* dot bullets. Mono-period left rail + sans body. Single accent.                                                                                                                           |
| `src/components/sections/Projects.tsx`       | Rewrite | Drop italic project titles, ease-spring hover slides, emerald badges, brand-\* link colors. Mono index + serif title + sans body + underline links.                                                                                                 |
| `src/components/sections/Skills.tsx`         | Rewrite | Drop 6-color accent system entirely (brand/emerald/rose/cyan/amber/violet). All cards monochrome — single rule border, no top stripe. Single accent only on hover and icon.                                                                         |
| `src/components/sections/Contact.tsx`        | Rewrite | Drop the dark slate panel, dot-grid, ease-spring CTAs. New: flat editorial section with sans/mono email + socials inline, no form.                                                                                                                  |
| `src/components/sections/Certifications.tsx` | Rewrite | Drop `glass` cards, brand-\* type-tags, hover-translate. Category headings as serif H3, cards as bordered ruled list.                                                                                                                               |
| `src/components/sections/Memberships.tsx`    | Rewrite | Drop `glass` chrome, `hover:shadow-glow`, brand/emerald/cyan abbreviation badges. Monochrome list with mono abbreviation + serif name + sans description.                                                                                           |
| `src/index.css`                              | Modify  | Drop the `.animate-fade-in-up` class usage from portfolio sections is done in the rewrites above. CSS rule itself stays (consumed by DFIR pages — Phase 4 sweeps).                                                                                  |

`src/components/sections/index.ts` — exports unchanged.
`src/pages/Home.tsx`, `About.tsx`, `Skills.tsx`, `Experience.tsx`, `Projects.tsx` — composition unchanged.
`src/data/content.ts` — content data unchanged.

## Editorial conventions (apply consistently across every section)

Each section task below assumes these rules:

1. **No italic.** Replace `font-light italic` / `italic` with `font-medium` upright Newsreader for headings, plain sans for body.
2. **No `slate-*` or `brand-*` color utilities** in class strings. Use the Phase 1 semantic tokens:
   - Body text → `text-ink-1` (or `text-ink-2` for muted)
   - Faint metadata / counters → `text-ink-3`
   - Links / hover-emphasis → `text-accent`
   - Surfaces → `bg-surface-page`, `bg-surface-raised`, `bg-surface-sunken`
   - Borders / hairlines → `border-rule`
   - Soft accent wash → `bg-accent-soft`
3. **No `ease-spring` transitions.** Replace with `transition-colors duration-enter` for color shifts; `transition-transform duration-enter` only if a transform is genuinely needed (rare in Phase 2).
4. **No `animate-fade-in-up` className** on portfolio sections. Pages render statically.
5. **No `focus:ring-*` / `focus:ring-offset-*` utilities.** The global `:focus-visible` rule in `src/index.css` paints the editorial ring; component code doesn't add to it.
6. **Status colors (emerald / rose / amber / cyan / violet) restricted.** Keep only where semantic — e.g. green "open for work" dot, red "danger" pill on a tool page. Drop where purely decorative (FiledTag accent, project category pills, skill card variety).
7. **One primary CTA per section.** Secondary actions are sans/mono underline links.
8. **Section padding** per spec Mode A: `py-24` desktop / `py-16` mobile. Many sections currently use `mt-24 scroll-mt-24` which is fine; if section padding is tighter than `py-16 / py-24`, increase it.

---

## Pre-flight

- [ ] **Step 1: Confirm clean state on the worktree branch**

```bash
cd /Users/pranith/Documents/portfolio-redesign
git status --short
git log --oneline -3
```

Expected: `git status --short` empty (or showing only the new plan file `?? docs/superpowers/plans/2026-05-12-phase-2-portfolio-surfaces.md`). Top commit on the branch should be the body-class fix from Phase 1.

- [ ] **Step 2: Commit the Phase 2 plan**

```bash
git add docs/superpowers/plans/2026-05-12-phase-2-portfolio-surfaces.md
git commit -m "docs(design): phase-2 portfolio surfaces plan"
```

- [ ] **Step 3: Capture Phase 2 baseline measurements**

```bash
npm run lint && npm run test:run && npm run build:client
```

Expected all green; 121 tests pass. Note the JS chunk size for /index — record for end-of-phase comparison.

---

## Task 1 — Rewrite `editorial.tsx` primitives

Every section imports from this file. Doing it first means the section rewrites only need surface-level edits, not API changes.

**File:** `src/components/editorial.tsx`

### Step 1: Replace the file contents with this

```tsx
import type { ReactNode } from 'react';

/**
 * Editorial primitives shared across the portfolio surfaces.
 *
 * The site reads as an editorial dossier: numbered sections filed under
 * subjects, drop-capped lead paragraphs, and a centered pull-quote that
 * breathes between sections. Single accent throughout — no per-section
 * color differentiation; the numbered subjects do the work of hierarchy.
 *
 * Per docs/superpowers/specs/2026-05-12-portfolio-editorial-redesign-design.md
 */

interface FiledTagProps {
  /** Two-digit issue / section number — 01, 02, 03 … */
  number: string;
  /** Subject line in caps, e.g. "WELCOME", "ABOUT", "EXPERIENCE". */
  subject: string;
  /** Optional date stamp on the right side. Defaults to the current month/year. */
  date?: string;
  /** Render in light text for inverted backgrounds (rare in the new system). */
  inverted?: boolean;
}

const DEFAULT_DATE = 'MAY · MMXXVI';

/**
 * Mono caps with the accent ink-blue picking up the FILED label + the
 * number; subject in ink-2; date stamp in ink-3 on the right. Hairlines
 * between elements use the rule token.
 */
export function FiledTag({ number, subject, date = DEFAULT_DATE, inverted }: FiledTagProps): JSX.Element {
  const labelClass = inverted ? 'text-surface-page/85' : 'text-ink-2';
  const stampClass = inverted ? 'text-surface-page/45' : 'text-ink-3';
  const accentClass = inverted ? 'text-surface-page' : 'text-accent';
  const ruleClass = inverted ? 'bg-surface-page/20' : 'bg-rule';
  return (
    <div className="mb-4 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em]">
      <span className={accentClass}>Filed</span>
      <span className={`${accentClass} tabular-nums`}>{number}</span>
      <span aria-hidden="true" className={`hidden h-px w-6 ${ruleClass} sm:inline-block`} />
      <span className={labelClass}>{subject}</span>
      <span aria-hidden="true" className={`hidden h-px flex-1 ${ruleClass} sm:inline-block`} />
      <span className={stampClass}>{date}</span>
    </div>
  );
}

interface DropCapParagraphProps {
  /** First character will be rendered as the drop cap; rest as prose. */
  children: string;
  className?: string;
}

/**
 * Editorial drop-cap on the lead paragraph of long-form prose. Floats
 * left, set in serif at large size; remaining text wraps around it.
 * Single accent — no per-section color differentiation.
 */
export function DropCapParagraph({ children, className = '' }: DropCapParagraphProps): JSX.Element {
  const first = children.charAt(0);
  const rest = children.slice(1);
  return (
    <p className={`text-base leading-relaxed text-ink-2 ${className}`}>
      <span
        aria-hidden="true"
        className="float-left mr-3 mt-1 font-serif text-[3.5rem] font-medium leading-[0.85] text-accent sm:text-[4.5rem]"
      >
        {first}
      </span>
      {rest}
    </p>
  );
}

interface PullQuoteProps {
  /** The quotation itself, without quote marks. */
  children: ReactNode;
  /** Optional attribution line. */
  attribution?: string;
  /** Tighten / loosen vertical rhythm. */
  className?: string;
}

/**
 * Editorial pull-quote — upright Newsreader at display size, centered,
 * with a centered attribution line below. No decorative quote glyphs,
 * no horizontal rules — the typography is the breather.
 */
export function PullQuote({ children, attribution, className = '' }: PullQuoteProps): JSX.Element {
  return (
    <figure className={`mx-auto max-w-3xl px-4 py-16 text-center sm:py-20 ${className}`}>
      <blockquote>
        <p className="font-serif text-3xl font-medium leading-[1.25] tracking-[-0.01em] text-ink-1 sm:text-4xl">
          {children}
        </p>
      </blockquote>
      {attribution && (
        <figcaption className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
          — {attribution}
        </figcaption>
      )}
    </figure>
  );
}
```

### Step 2: Verify build + types

```bash
npx tsc --noEmit 2>&1 | tail -10
npm run lint 2>&1 | tail -3
npm run build:client 2>&1 | tail -3
```

Expected: clean.

You'll see TypeScript errors in the consuming sections (`Hero.tsx`, `Featured.tsx`, etc. still pass an `accent` prop to `FiledTag`). That's fine — those errors fix themselves when each consumer is rewritten in subsequent tasks. **But the build must still succeed** — Vite + TypeScript will still produce a build with `accent` ignored as an extra prop because React just spreads unknown props in the JSX, and TypeScript only warns via `noEmit`. If `tsc --noEmit` fails, that's a real problem; if it just emits warnings, fine. **If `tsc --noEmit` exits non-zero with errors about `accent` prop**, accept the breakage temporarily and continue — subsequent tasks fix it. Run the build separately:

```bash
npm run build:client 2>&1 | tail -3
```

This MUST exit 0. If it doesn't, stop.

### Step 3: Commit

```bash
git add src/components/editorial.tsx
git commit -m "design(editorial): drop italic + accent prop + decorative quote glyphs"
```

---

## Task 2 — Rewrite `Hero.tsx`

The Hero is the page's first impression. Phase 2 ships a **typography-only** Hero — single column, editorial type stack, one primary CTA, no image plate. The right-side anime-cyber illustration plate is a separate follow-up commit once the illustration asset exists in `/public`.

**File:** `src/components/sections/Hero.tsx`

### Step 1: Replace the file contents

```tsx
import { Linkedin, Github, Mail, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { personalInfo, stats } from '../../data/content';
import { FiledTag } from '../editorial';

/**
 * Hero — editorial subject brief. Single-column type stack:
 *   eyebrow → "open for work" pill → display headline → lede →
 *   focus / learning bullets → one primary CTA → socials.
 *
 * The right-side anime-cyber illustration plate is a follow-up — when
 * /public/portrait.png (or .svg) exists, it slots into a 5/12 right
 * column at lg+. For now Phase 2 ships type-only.
 */
export function Hero() {
  return (
    <section className="relative pt-10 pb-24 sm:pt-16">
      <FiledTag number="01" subject="Welcome — Subject Profile" />

      {/* Live status — one small pill, semantic green (open / available) */}
      <div className="mb-8 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2">
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
        Open for consultations &amp; strategy calls
      </div>

      {/* Display headline — upright Newsreader, clamped for mobile */}
      <h1
        className="max-w-[18ch] font-serif font-medium leading-[1.05] tracking-[-0.01em] text-ink-1"
        style={{ fontSize: 'clamp(2.25rem, 6vw, 3.5rem)' }}
      >
        Investigating attacks at human scale. Building defenders at AI scale.
      </h1>

      <p className="mt-8 max-w-[60ch] text-lg leading-[1.55] text-ink-2">
        I&rsquo;m <span className="text-ink-1">{personalInfo.name}</span>, {personalInfo.description}
      </p>

      {/* Focus / learning — mono labels, ink hierarchy */}
      <dl className="mt-8 space-y-2 text-sm">
        <div className="flex items-baseline gap-3">
          <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3 min-w-[5.5rem]">Focus</dt>
          <dd className="text-ink-1">{personalInfo.currentFocus}</dd>
        </div>
        <div className="flex items-baseline gap-3">
          <dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3 min-w-[5.5rem]">Learning</dt>
          <dd className="text-ink-1">{personalInfo.currentlyLearning}</dd>
        </div>
      </dl>

      {/* CTAs — one primary, two secondary text-links */}
      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
        <a
          href={personalInfo.calendlyUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 bg-accent px-5 py-3 text-sm font-medium text-white transition-colors duration-enter hover:bg-brand-700"
        >
          Book a call <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <Link
          to="/threatintel"
          className="inline-flex items-center gap-1 font-mono text-[13px] text-ink-2 underline decoration-rule decoration-2 underline-offset-6 transition-colors duration-enter hover:text-accent hover:decoration-accent"
        >
          /threatintel <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
        <Link
          to="/dfir"
          className="inline-flex items-center gap-1 font-mono text-[13px] text-ink-2 underline decoration-rule decoration-2 underline-offset-6 transition-colors duration-enter hover:text-accent hover:decoration-accent"
        >
          /dfir <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      {/* Socials */}
      <div className="mt-10 flex items-center gap-6">
        <a
          href={personalInfo.linkedInUrl}
          target="_blank"
          rel="noreferrer"
          className="text-ink-3 transition-colors duration-enter hover:text-accent"
          aria-label="LinkedIn"
        >
          <Linkedin className="h-5 w-5" aria-hidden="true" />
        </a>
        <a
          href={personalInfo.githubUrl}
          target="_blank"
          rel="noreferrer"
          className="text-ink-3 transition-colors duration-enter hover:text-accent"
          aria-label="GitHub"
        >
          <Github className="h-5 w-5" aria-hidden="true" />
        </a>
        <a
          href={`mailto:${personalInfo.email}`}
          className="text-ink-3 transition-colors duration-enter hover:text-accent"
          aria-label="Email"
        >
          <Mail className="h-5 w-5" aria-hidden="true" />
        </a>
      </div>

      {/* Stats — hairline-bordered cards, four across at lg */}
      <div className="mt-20 grid grid-cols-2 gap-4 border-t border-rule pt-10 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col">
            <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">{stat.label}</dt>
            <dd className="mt-2 flex items-baseline gap-1.5">
              <span className="font-serif text-3xl font-medium tracking-tight text-ink-1 sm:text-4xl">
                {stat.value}
              </span>
              {stat.suffix && <span className="font-mono text-xs text-ink-3">{stat.suffix}</span>}
            </dd>
            <p className="mt-2 text-sm leading-snug text-ink-2">{stat.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

### What changed

- Whole right-side ID card + Now widget gone — Phase 2 ships type-only.
- `hero-cascade` className removed (was already an orphan after Phase 1).
- All `font-light italic` removed; headline is upright Newsreader 500.
- Display size uses `clamp(2.25rem, 6vw, 3.5rem)` so mobile doesn't break.
- Identity pills (Certified AI / Threat Intel / Email Defense / AU Ambassador) removed — clutter; the FiledTag already labels the page.
- Gradient `from-brand-600 to-brand-400` on the second clause removed.
- `ease-spring` removed everywhere; only `transition-colors duration-enter` survives.
- Stats card chrome (`rounded-2xl border bg-white shadow ...`) dropped; stats are now a hairline-divider grid block.
- One primary CTA (`Book a call`), two secondary text-links (`/threatintel`, `/dfir`).

### Step 2: Verify

```bash
npx tsc --noEmit 2>&1 | tail -10
npm run lint 2>&1 | tail -3
npm run test:run 2>&1 | tail -5
npm run build:client 2>&1 | tail -3
```

Expected: clean. 121/121 tests.

### Step 3: Commit

```bash
git add src/components/sections/Hero.tsx
git commit -m "design(sections): rewrite Hero to editorial type-only column"
```

---

## Task 3 — Rewrite `About.tsx`

Two-column layout retains: prose left, terminal mock right. Both retypeset; terminal mock keeps its dark surface (it's a tool preview, not editorial chrome).

**File:** `src/components/sections/About.tsx`

### Step 1: Replace the file contents

```tsx
import { Link } from 'react-router-dom';
import { Terminal, ArrowRight } from 'lucide-react';
import { stats } from '../../data/content';
import { DropCapParagraph, FiledTag } from '../editorial';

/**
 * About — prose left, /dfir terminal preview right.
 *
 * The terminal mock is the page's visual hook: it shows what /dfir
 * actually does without requiring a click. The mock keeps its dark
 * surface (it's a tool preview, not editorial chrome), but loses the
 * decorative blur blobs around it.
 */
export function About() {
  return (
    <section id="about" className="py-16 lg:py-24 scroll-mt-24">
      <div className="grid items-start gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        {/* LEFT: prose */}
        <div>
          <FiledTag number="02" subject="About — Subject Brief" />
          <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl">
            Alerts first, then everything else
          </h2>
          <div className="mt-8 max-w-[65ch] space-y-5 text-base leading-[1.65] text-ink-2">
            <DropCapParagraph>
              The work that taught me anything useful was the alert work. Phishing, BEC, malware, lookalike domains. Two
              hundred and fifty incidents in, you start seeing the same attacker patterns, the same defensive blind
              spots, and the same five steps you keep repeating by hand.
            </DropCapParagraph>
            <p>
              That&apos;s where the automation came from. With{' '}
              <span className="text-ink-1">n8n and a few MCP servers</span>, I moved the repeatable parts of triage off
              the analyst critical path. Mean response dropped from four hours to under 75 minutes. The decisions that
              actually need a human stayed with the human.
            </p>
            <p>
              I ship the tools I wish I&apos;d had on shift. The interactive ones live at{' '}
              <Link
                to="/dfir"
                className="text-accent underline decoration-2 underline-offset-4 transition-colors duration-enter hover:decoration-accent"
              >
                /dfir
              </Link>
              , the live threat-intel surface at{' '}
              <Link
                to="/threatintel"
                className="text-accent underline decoration-2 underline-offset-4 transition-colors duration-enter hover:decoration-accent"
              >
                /threatintel
              </Link>
              . Both run on Cloudflare Workers, both are free.
            </p>
            <p>
              Lately I&apos;ve been spending most of my reading time on{' '}
              <span className="text-ink-1">AI security and Non-Human Identity governance</span>. Prompt injection, MCP
              attack surface, service-account sprawl. The investigation-first mindset transfers well; the tooling is
              mostly still being built.
            </p>
            <p>
              If you&apos;re hiring for any of this, or working on the same problems in the open, my inbox is below.
            </p>
          </div>

          {/* Inline stats */}
          <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-rule pt-8 sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col">
                <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">{stat.label}</dt>
                <dd className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-xl font-medium tracking-tight text-ink-1">{stat.value}</span>
                  {stat.suffix && <span className="font-mono text-[11px] text-ink-3">{stat.suffix}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* RIGHT: terminal mock — keeps its dark surface (tool preview, not chrome) */}
        <div aria-hidden="true">
          <div className="overflow-hidden border border-rule bg-slate-950 p-5">
            <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
              <span className="ml-3 font-mono text-[10px] text-slate-500">pranithjain.qzz.io/dfir/ioc-check</span>
            </div>
            <div className="space-y-1.5 font-mono text-[11px] leading-relaxed text-slate-300 sm:text-xs">
              <div className="text-slate-500">$ ioc check 8.8.8.8</div>
              <div className="text-emerald-400">streaming verdicts…</div>
              <div className="text-slate-400">virustotal · clean · 0/92</div>
              <div className="text-slate-400">abuseipdb · clean · 0%</div>
              <div className="text-slate-400">threatfox · clean · 0/list</div>
              <div className="text-slate-400">spamhaus · clean · 0/1626</div>
              <div className="text-slate-400">greynoise · clean · RIOT</div>
              <div className="text-slate-500">…18 more sources…</div>
              <div className="text-emerald-400">done</div>
              <div className="text-slate-300">{'{"verdict":"clean","contributing":24}'}</div>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400">Live demo</div>
              <Link
                to="/dfir/ioc-check"
                className="inline-flex items-center gap-1.5 border border-white/15 px-3 py-1.5 font-mono text-[10px] text-white transition-colors duration-enter hover:bg-white/10"
                aria-label="Open the IOC checker"
              >
                <Terminal className="h-3 w-3" aria-hidden="true" /> Try it{' '}
                <ArrowRight className="h-2.5 w-2.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

### What changed

- H2 dropped italic, single accent (no `accent="brand"` prop).
- Decorative blur blobs (`bg-brand-500/15 blur-3xl` etc.) removed.
- Terminal mock surface stays dark — it's a _tool preview_. Its rounded corners (`rounded-2xl`) become flat hairline borders. The colored dots stay (they signal traffic-light status).
- Inline link styling moves to single accent + decoration-2.
- Stats dl simplifies — drops `tabular-nums` (Inter handles digits fine at this size).
- `animate-fade-in-up` className removed.

### Step 2: Verify + commit

```bash
npx tsc --noEmit 2>&1 | tail -10
npm run lint 2>&1 | tail -3
npm run build:client 2>&1 | tail -3
git add src/components/sections/About.tsx
git commit -m "design(sections): rewrite About to single-accent editorial + flat terminal preview"
```

---

## Task 4 — Rewrite `Featured.tsx`

A list of articles/profiles with a left mark, title, description, source. Drops italic titles, gradient marks, status pills.

**File:** `src/components/sections/Featured.tsx`

### Step 1: Replace the file contents

```tsx
import { ArrowUpRight } from 'lucide-react';
import { featuredArticles } from '../../data/content';
import { FiledTag } from '../editorial';

/**
 * Featured — divider rows. Mono numeral + serif title + sans body.
 * Hover slides the right-side arrow forward; no scale, no spring.
 */
export function Featured() {
  return (
    <section id="featured" className="py-16 lg:py-24 scroll-mt-24">
      <div className="mb-10 max-w-[65ch]">
        <FiledTag number="05" subject="Recognition — Press Index" />
        <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl">
          Where the work shows up
        </h2>
        <p className="mt-4 text-base leading-[1.55] text-ink-2">Interviews and write-ups across security platforms.</p>
      </div>

      <ul className="divide-y divide-rule border-y border-rule">
        {featuredArticles.map((article, idx) => {
          const indexLabel = String(idx + 1).padStart(2, '0');
          return (
            <li key={article.title}>
              <a
                href={article.url}
                target="_blank"
                rel="noreferrer"
                className="group grid grid-cols-[auto_1fr_auto] items-baseline gap-x-4 gap-y-2 py-7 sm:gap-x-6"
              >
                {/* Left numeral */}
                <span className="self-start pt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">
                  {indexLabel}
                </span>

                {/* Title + description */}
                <div className="min-w-0">
                  <h3 className="font-serif text-xl font-medium leading-tight text-ink-1 transition-colors duration-enter group-hover:text-accent sm:text-2xl">
                    {article.title}
                  </h3>
                  <p className="mt-2 max-w-[65ch] text-sm leading-[1.55] text-ink-2">{article.description}</p>
                  <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                    {article.source}
                  </div>
                </div>

                {/* Right arrow */}
                <ArrowUpRight
                  className="hidden h-4 w-4 shrink-0 self-start text-ink-3 transition-colors duration-enter group-hover:text-accent sm:block"
                  aria-hidden="true"
                />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

### What changed

- Dropped the `isExpert` / F/D letter mark — replaced with a plain mono numeral (consistent with Projects).
- Dropped the colored category pill (`profile` / `article`) — the row's content is the differentiator.
- Dropped italic on H3, `ease-spring`, `group-hover:translate-x-1` (was a 1px slide on hover).
- Whole row is link target; H3 color-shifts to accent on hover.

### Step 2: Verify + commit

```bash
npx tsc --noEmit 2>&1 | tail -5 && npm run lint 2>&1 | tail -3 && npm run build:client 2>&1 | tail -3
git add src/components/sections/Featured.tsx
git commit -m "design(sections): rewrite Featured to mono-numeral divider rows"
```

---

## Task 5 — Rewrite `Companies.tsx` with collapsible pattern

The current implementation renders ALL company wordmarks at once in a `glass`-styled chip wall. New design: default 6 wordmarks in a typeset row, "Show all" reveals the rest with a small fade-in.

**File:** `src/components/sections/Companies.tsx`

### Step 1: Replace the file contents

```tsx
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { companies } from '../../data/content';
import { FiledTag } from '../editorial';

const DEFAULT_VISIBLE = 6;

/**
 * Companies — quiet wordmark row. By default shows the first 6 brands
 * as a typeset row; "Show all" reveals the rest with a staggered fade
 * matching the --motion-enter token. No logos, no chip chrome —
 * typography carries the trust signal.
 */
export function Companies() {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? companies : companies.slice(0, DEFAULT_VISIBLE);
  const remaining = companies.length - DEFAULT_VISIBLE;

  return (
    <section id="companies" className="py-16 lg:py-24 scroll-mt-24">
      <div className="mb-10 max-w-[65ch]">
        <FiledTag number="08" subject="Partners — Work Has Appeared At" />
        <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl">
          Enterprise partnerships
        </h2>
        <p className="mt-4 text-base leading-[1.55] text-ink-2">
          Email infrastructure secured for 150+ startups and enterprises across AI, HealthTech, and SaaS.
        </p>
      </div>

      <ul className="flex flex-wrap gap-x-8 gap-y-3 border-t border-rule pt-8 text-base font-medium text-ink-2">
        {visible.map((company) => (
          <li key={company} className="transition-colors duration-enter hover:text-ink-1">
            {company}
          </li>
        ))}
      </ul>

      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-6 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-accent transition-colors duration-enter hover:text-brand-700"
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3" aria-hidden="true" />
              Show fewer
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
              Show all {companies.length}
            </>
          )}
        </button>
      )}
    </section>
  );
}
```

### What changed

- All-at-once chip wall replaced with collapsible typeset row.
- `glass` chrome dropped; `hover:-translate-y-1` gone.
- `useState` toggles between 6-item preview and full list.
- "Show all 24" button uses mono caps + chevron icon, accent text.
- FiledTag added for consistency with sibling sections (uses new number `08`).

### Step 2: Verify + commit

```bash
npx tsc --noEmit 2>&1 | tail -5 && npm run lint 2>&1 | tail -3 && npm run build:client 2>&1 | tail -3
git add src/components/sections/Companies.tsx
git commit -m "design(sections): rewrite Companies as collapsible wordmark row"
```

---

## Task 6 — Rewrite `Experience.tsx`

Two-column rows: mono period + company on the left, role + sections on the right.

**File:** `src/components/sections/Experience.tsx`

### Step 1: Replace the file contents

```tsx
import { Search, Zap, Shield, FileText, Monitor, Mail } from 'lucide-react';
import { experiences } from '../../data/content';
import { FiledTag } from '../editorial';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Search,
  Zap,
  Shield,
  FileText,
  Monitor,
  Mail,
};

/**
 * Experience — divider rows. Mono date + company on the left rail,
 * serif role title + sans details on the right. No card chrome —
 * hierarchy via spacing + typography.
 */
export function Experience() {
  return (
    <section id="experience" className="py-16 lg:py-24 scroll-mt-24">
      <div className="mb-10 max-w-[65ch]">
        <FiledTag number="03" subject="Experience — Field Record" />
        <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl">
          Experience highlights
        </h2>
      </div>

      <ul className="divide-y divide-rule border-y border-rule">
        {experiences.map((exp, index) => (
          <li key={`${exp.title}-${index}`} className="grid grid-cols-1 gap-4 py-10 sm:grid-cols-[11rem_1fr] sm:gap-8">
            {/* Left rail: period + company */}
            <div className="space-y-1">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">{exp.period}</div>
              <div className="text-sm font-medium text-ink-1">{exp.company}</div>
              {exp.location && <div className="font-mono text-[11px] text-ink-3">{exp.location}</div>}
              {exp.badge && (
                <div className="pt-2">
                  <span className="inline-flex items-center font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                    {exp.badge}
                  </span>
                </div>
              )}
            </div>

            {/* Right rail: role + details */}
            <div className="min-w-0">
              <h3 className="font-serif text-xl font-medium leading-tight text-ink-1 sm:text-2xl">{exp.title}</h3>

              {exp.sections && (
                <div className="mt-6 space-y-6">
                  {exp.sections.map((section) => {
                    const IconComponent = iconMap[section.icon];
                    const sectionId = `experience-${section.title
                      .toLowerCase()
                      .replace(/[^\w\s-]/g, '')
                      .replace(/\s+/g, '-')}`;
                    return (
                      <div key={section.title} id={sectionId} className="scroll-mt-28">
                        <h4 className="mb-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
                          {IconComponent && <IconComponent className="h-3 w-3" aria-hidden="true" />}
                          {section.title}
                        </h4>
                        <ul className="space-y-2 text-[14px] leading-[1.55] text-ink-2">
                          {section.items.map((item, iIndex) => (
                            <li key={iIndex} className="relative max-w-[68ch] pl-4">
                              <span className="absolute left-0 top-2 inline-block h-1 w-1 rounded-full bg-accent" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}

              {exp.items && (
                <ul className="mt-5 space-y-2 text-[14px] leading-[1.55] text-ink-2">
                  {exp.items.map((item, iIndex) => (
                    <li key={iIndex} className="relative max-w-[68ch] pl-4">
                      <span className="absolute left-0 top-2 inline-block h-1 w-1 rounded-full bg-accent" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

### What changed

- Dropped italic on role H3.
- Dropped emerald-bordered badge for the "current role" callout — now mono accent text (`exp.badge`).
- Dropped `accent="emerald"` on FiledTag.
- All `bg-brand-500` bullet dots → `bg-accent`.
- Slate-_ tokens → ink-_ tokens.

### Step 2: Verify + commit

```bash
npx tsc --noEmit 2>&1 | tail -5 && npm run lint 2>&1 | tail -3 && npm run build:client 2>&1 | tail -3
git add src/components/sections/Experience.tsx
git commit -m "design(sections): rewrite Experience to single-accent divider rows"
```

---

## Task 7 — Rewrite `Projects.tsx`

A list of projects with index numeral, title, body, tags, and right-rail links. `useState` for read-more.

**File:** `src/components/sections/Projects.tsx`

### Step 1: Replace the file contents

```tsx
import { useState } from 'react';
import { Github, ExternalLink, ChevronDown, ChevronUp, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { projects } from '../../data/content';
import { FiledTag } from '../editorial';

const TRUNCATE_THRESHOLD = 240;

interface ProjectRowProps {
  project: (typeof projects)[number];
  index: number;
}

function ProjectRow({ project, index }: ProjectRowProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const needsToggle = project.description.length > TRUNCATE_THRESHOLD;
  const indexLabel = String(index + 1).padStart(2, '0');

  return (
    <li className="group grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 py-8 sm:grid-cols-[auto_1fr_auto] sm:gap-x-6">
      <div className="row-span-2 pt-2 sm:row-span-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">{indexLabel}</span>
      </div>

      <div className="min-w-0">
        <h3 className="font-serif text-xl font-medium leading-tight text-ink-1 transition-colors duration-enter group-hover:text-accent sm:text-2xl">
          {project.title}
        </h3>
        {project.badge && (
          <span className="ml-0 mt-2 inline-flex items-center font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            {project.badge}
          </span>
        )}
        <p
          className={`mt-3 max-w-[65ch] text-sm leading-[1.55] text-ink-2 ${
            needsToggle && !expanded ? 'line-clamp-3' : ''
          }`}
        >
          {project.description}
        </p>
        {needsToggle && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 inline-flex items-center gap-1 font-mono text-[11px] text-accent transition-colors duration-enter hover:text-brand-700"
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" aria-hidden="true" /> show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" aria-hidden="true" /> read more
              </>
            )}
          </button>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center border border-rule px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="col-start-2 flex flex-wrap items-center gap-3 sm:col-start-3 sm:flex-col sm:items-end sm:gap-2">
        {project.github && (
          <a
            href={project.github}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-2 transition-colors duration-enter hover:text-accent"
            aria-label={`View ${project.title} on GitHub`}
          >
            <Github className="h-3 w-3" aria-hidden="true" /> code
          </a>
        )}
        {project.href && (
          <Link
            to={project.href}
            className="inline-flex items-center gap-1 font-mono text-[11px] text-accent transition-colors duration-enter hover:text-brand-700"
            aria-label={`View ${project.title}`}
          >
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> view
          </Link>
        )}
        {project.externalUrl && (
          <a
            href={project.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-accent transition-colors duration-enter hover:text-brand-700"
            aria-label={`Open ${project.title} live demo`}
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" /> live
          </a>
        )}
      </div>
    </li>
  );
}

export function Projects() {
  return (
    <section id="projects" className="py-16 lg:py-24 scroll-mt-24">
      <div className="mb-10 max-w-[65ch]">
        <FiledTag number="04" subject="Projects — Shipped Tooling" />
        <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl">
          Selected projects &amp; initiatives
        </h2>
        <p className="mt-4 text-base leading-[1.55] text-ink-2">
          Tooling shipped on shift and on side time. Most are free, edge-hosted, and run without a signup.
        </p>
      </div>

      <ul className="divide-y divide-rule border-y border-rule">
        {projects.map((project, idx) => (
          <ProjectRow key={project.title} project={project} index={idx} />
        ))}
      </ul>
    </section>
  );
}
```

### What changed

- Dropped italic, `ease-spring`, `group-hover:translate-x-1` on project titles.
- Project badge (was emerald-bordered pill) now mono accent text.
- Tags lose the `rounded` corners — flat hairline.
- All link colors → accent / ink-2 mix per token system.
- `accent="cyan"` on FiledTag removed.

### Step 2: Verify + commit

```bash
npx tsc --noEmit 2>&1 | tail -5 && npm run lint 2>&1 | tail -3 && npm run build:client 2>&1 | tail -3
git add src/components/sections/Projects.tsx
git commit -m "design(sections): rewrite Projects to single-accent divider rows"
```

---

## Task 8 — Rewrite `Skills.tsx`

Drop the 6-color accent system (brand / emerald / rose / cyan / amber / violet). All cards monochrome — single rule border + accent only on icon and hover.

**File:** `src/components/sections/Skills.tsx`

### Step 1: Replace the file contents

```tsx
import { Mail, Search, Users, Shield, Cloud, Zap } from 'lucide-react';
import { skills } from '../../data/content';
import { FiledTag } from '../editorial';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Mail,
  Search,
  Users,
  Shield,
  Cloud,
  Zap,
};

/**
 * Skills — monochrome capability cards. Single accent only on the icon
 * surface and the hover border. The 6-color accent stripe system from
 * the previous design is dropped — typography and ordering carry the
 * differentiation.
 */
export function Skills() {
  return (
    <section id="skills" className="py-16 lg:py-24 scroll-mt-24">
      <div className="mb-10 max-w-[65ch]">
        <FiledTag number="06" subject="Expertise — Practice Areas" />
        <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl">
          Core competencies
        </h2>
        <p className="mt-4 text-base leading-[1.55] text-ink-2">
          Threat intelligence, cyber criminology, email security, and cloud identity defense.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((skill) => {
          const IconComponent = iconMap[skill.icon];
          return (
            <div
              key={skill.title}
              className="group flex h-full flex-col border border-rule bg-surface-raised p-6 transition-colors duration-enter hover:border-ink-1"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center bg-accent-soft text-accent">
                {IconComponent && <IconComponent className="h-4 w-4" aria-hidden="true" />}
              </div>
              <h3 className="text-base font-semibold text-ink-1">{skill.title}</h3>
              <ul className="mt-3 space-y-1.5 text-sm leading-[1.55] text-ink-2">
                {skill.items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

### What changed

- `ACCENTS` array (6 color sets) entirely removed.
- Card chrome: `rounded-2xl` → flat hairline `border-rule`.
- Top accent stripe gone.
- Icon container uses `bg-accent-soft text-accent` — single color across all 6 cards.
- Bullet dots use `bg-accent` (one color).
- Hover state: border darkens to `border-ink-1`. No shadow, no translate.

### Step 2: Verify + commit

```bash
npx tsc --noEmit 2>&1 | tail -5 && npm run lint 2>&1 | tail -3 && npm run build:client 2>&1 | tail -3
git add src/components/sections/Skills.tsx
git commit -m "design(sections): drop multi-color Skills accents for monochrome cards"
```

---

## Task 9 — Rewrite `Contact.tsx`

Drop the dark slate CTA panel with dot-grid and `ease-spring` button. New: flat editorial section inline with the page.

**File:** `src/components/sections/Contact.tsx`

### Step 1: Replace the file contents

```tsx
import { Calendar, Linkedin, Github, FileText, ArrowRight } from 'lucide-react';
import { personalInfo } from '../../data/content';
import { CopyToClipboard } from '../../components/CopyToClipboard';
import { FiledTag } from '../editorial';

/**
 * Contact — editorial open-channel. Flat surface, single primary CTA
 * (Schedule a call), plus the email + socials as a sans/mono row.
 * The dark slate panel from the previous design is gone.
 */
export function Contact() {
  return (
    <section id="contact" className="py-16 lg:py-24 scroll-mt-24" aria-labelledby="contact-heading">
      <div className="max-w-[65ch]">
        <FiledTag number="07" subject="Contact — Open Channel" />
        <h2
          id="contact-heading"
          className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl"
        >
          Ready to secure your digital presence?
        </h2>
        <p className="mt-5 text-base leading-[1.55] text-ink-2 sm:text-lg">
          Whether you need threat intelligence, email security hardening, or cloud identity protection — my work bridges
          technical controls with business-critical trust signals across 150+ global brands.
        </p>

        {/* Primary CTA + email row */}
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          <a
            href={personalInfo.calendlyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-accent px-5 py-3 text-sm font-medium text-white transition-colors duration-enter hover:bg-brand-700"
            aria-label="Schedule a 30-minute consultation call"
          >
            <Calendar className="h-4 w-4" aria-hidden="true" />
            Schedule a call
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <a
            href={`mailto:${personalInfo.email}`}
            className="font-mono text-sm text-ink-2 underline decoration-rule decoration-2 underline-offset-6 transition-colors duration-enter hover:text-accent hover:decoration-accent"
            aria-label={`Send email to ${personalInfo.email}`}
          >
            hello@pranithjain.qzz.io
          </a>
          <CopyToClipboard text={personalInfo.email} label="Copy email address" />
        </div>

        {/* Socials row */}
        <ul
          className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-rule pt-8 font-mono text-sm"
          aria-label="Social media and professional links"
        >
          <li>
            <a
              href={personalInfo.linkedInUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-ink-2 transition-colors duration-enter hover:text-accent"
            >
              <Linkedin className="h-3.5 w-3.5" aria-hidden="true" />
              linkedin
            </a>
          </li>
          <li>
            <a
              href={personalInfo.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-ink-2 transition-colors duration-enter hover:text-accent"
            >
              <Github className="h-3.5 w-3.5" aria-hidden="true" />
              github
            </a>
          </li>
          <li>
            <a
              href={personalInfo.resumeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-ink-2 transition-colors duration-enter hover:text-accent"
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              resume
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}
```

### What changed

- Dark slate panel + dot-grid texture removed.
- `bg-slate-900 dark:bg-brand-950` chrome dropped.
- `ease-spring` CTAs replaced with simple `transition-colors duration-enter`.
- "Featured Experts" socials link removed (not in core nav).
- One primary CTA + one secondary email link + one copy-to-clipboard utility.
- FiledTag's `inverted` prop no longer needed here (section is light).

### Step 2: Verify + commit

```bash
npx tsc --noEmit 2>&1 | tail -5 && npm run lint 2>&1 | tail -3 && npm run build:client 2>&1 | tail -3
git add src/components/sections/Contact.tsx
git commit -m "design(sections): rewrite Contact to flat editorial open-channel"
```

---

## Task 10 — Rewrite `Certifications.tsx` and `Memberships.tsx`

Two related sections; both used `glass` chrome with color-coded badges. Batch into one commit since they share the rewrite pattern.

### File 1: `src/components/sections/Certifications.tsx`

```tsx
import { certifications } from '../../data/content';
import { FiledTag } from '../editorial';

interface CertCardProps {
  title: string;
  issuer: string;
  year: string;
  featured?: boolean;
  type: string;
}

function CertCard({ title, issuer, year, featured, type }: CertCardProps) {
  return (
    <div
      className={`flex h-full flex-col border border-rule bg-surface-raised p-5 transition-colors duration-enter hover:border-ink-1 ${
        featured ? 'border-l-2 border-l-accent' : ''
      }`}
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">{type}</div>
      <div className="mt-2 text-sm font-medium text-ink-1">{title}</div>
      <div className="mt-1 text-sm text-ink-2">
        {issuer} · {year}
      </div>
    </div>
  );
}

interface CertItem {
  title: string;
  issuer: string;
  year: string;
  featured?: boolean;
  type: string;
}

interface CertCategoryProps {
  id: string;
  title: string;
  certs: CertItem[];
}

function CertCategory({ id, title, certs }: CertCategoryProps) {
  if (certs.length === 0) return null;
  return (
    <div id={id} className="scroll-mt-28">
      <h3 className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">{title}</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {certs.map((cert, index) => (
          <CertCard
            key={`${cert.title}-${index}`}
            title={cert.title}
            issuer={cert.issuer}
            year={cert.year}
            featured={cert.featured}
            type={cert.type}
          />
        ))}
      </div>
    </div>
  );
}

export function Certifications() {
  const coreCerts: CertItem[] = certifications.core.map((c) => ({ ...c, type: 'Certification' }));
  const trainingCerts: CertItem[] = certifications.training.map((c) => ({
    ...c,
    type: 'Training',
    featured: undefined,
  }));
  const bootcampCerts: CertItem[] = certifications.bootcamps.map((c) => ({
    ...c,
    type: 'Bootcamp',
    featured: undefined,
  }));
  const additionalCerts: CertItem[] = certifications.additional.map((c) => ({
    ...c,
    type: 'Certification',
    featured: undefined,
  }));
  const internshipCerts: CertItem[] = certifications.internships.map((c) => ({
    ...c,
    type: 'Internship',
    featured: undefined,
  }));
  const simulationCerts: CertItem[] = certifications.simulations.map((c) => ({
    ...c,
    type: 'Job Simulation',
    featured: undefined,
  }));

  return (
    <section id="certifications" className="py-16 lg:py-24 scroll-mt-24">
      <div className="mb-10 max-w-[65ch]">
        <FiledTag number="09" subject="Credentials — Certifications & Coursework" />
        <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl">
          Certifications &amp; coursework
        </h2>
      </div>

      <div className="space-y-12">
        <CertCategory id="certifications-core" title="Core Certifications" certs={coreCerts} />
        <CertCategory id="certifications-training" title="Training" certs={trainingCerts} />
        <CertCategory id="certifications-bootcamps" title="Bootcamps" certs={bootcampCerts} />
        <CertCategory id="certifications-additional" title="Additional Certifications" certs={additionalCerts} />
        <CertCategory id="certifications-internships" title="Internships" certs={internshipCerts} />
        <CertCategory id="certifications-simulations" title="Job Simulations" certs={simulationCerts} />
      </div>
    </section>
  );
}
```

### File 2: `src/components/sections/Memberships.tsx`

```tsx
import { memberships } from '../../data/content';
import { FiledTag } from '../editorial';

/**
 * Memberships — flat editorial list. Monochrome abbreviation tile +
 * serif name + sans description. No glass, no hover-glow, no
 * per-org color differentiation.
 */
export function Memberships() {
  return (
    <section id="memberships" className="py-16 lg:py-24 scroll-mt-24">
      <div className="mb-10 max-w-[65ch]">
        <FiledTag number="10" subject="Memberships — Professional Affiliations" />
        <h2 className="font-serif text-3xl font-medium leading-[1.15] tracking-[-0.01em] text-ink-1 sm:text-4xl">
          Professional affiliations
        </h2>
        <p className="mt-4 text-base leading-[1.55] text-ink-2">
          Active contributor to cybersecurity and intelligence communities.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {memberships.map((membership) => (
          <article
            key={membership.name}
            className="flex h-full flex-col border border-rule bg-surface-raised p-6 transition-colors duration-enter hover:border-ink-1"
          >
            <div className="flex items-center justify-between">
              <div className="grid h-12 w-12 place-items-center bg-accent-soft text-sm font-semibold tracking-tight text-accent">
                {membership.abbreviation}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">Member</div>
            </div>
            <h3 className="mt-5 font-serif text-xl font-medium leading-tight text-ink-1">{membership.name}</h3>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-3">{membership.period}</p>
            <p className="mt-3 text-sm leading-[1.55] text-ink-2">{membership.description}</p>
            {membership.details && (
              <ul className="mt-4 space-y-2 text-sm text-ink-2">
                {membership.details.map((detail) => (
                  <li key={detail.label} className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    <span>
                      <span className="text-ink-1">{detail.label}:</span> {detail.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
```

### What changed (both files)

- `glass` chrome dropped.
- `hover:shadow-glow`, `hover:-translate-y-2` dropped.
- 6-color membership badge system → single accent.
- `featured: true` on certs uses a 2px left accent border (one piece of color hierarchy, restrained).
- All slate/brand utilities → ink/rule/accent tokens.
- Both sections now use a FiledTag eyebrow for consistency (numbers `09` Certifications, `10` Memberships).

### Step 2: Verify + commit

```bash
npx tsc --noEmit 2>&1 | tail -5 && npm run lint 2>&1 | tail -3 && npm run build:client 2>&1 | tail -3
git add src/components/sections/Certifications.tsx src/components/sections/Memberships.tsx
git commit -m "design(sections): rewrite Certifications + Memberships to flat editorial cards"
```

---

## Task 11 — Drop `hero-cascade` className orphan and grep cleanup

The previous Hero used `<div className="hero-cascade">` — the CSS rule was removed in Phase 1 Task 1, but the className itself was still in the JSX. Task 2 above already rewrites Hero without it, so this task is a verification + grep sweep.

### Step 1: Verify no orphan classNames remain

```bash
cd /Users/pranith/Documents/portfolio-redesign
grep -rn "hero-cascade" src 2>&1
grep -rn "ease-spring" src 2>&1
grep -rn "animate-fade-in-up" src/components/sections 2>&1
grep -rn "animate-fade-in-up" src/pages 2>&1
```

Expected:

- `hero-cascade` → zero hits anywhere in `src/`
- `ease-spring` → zero hits in `src/components/sections/` and `src/pages/`; hits in `src/pages/dfir/` are acceptable (Phase 4 sweeps)
- `animate-fade-in-up` in `src/components/sections/` → zero hits
- `animate-fade-in-up` in `src/pages/` → zero hits

If any hit remains in portfolio sections, open the file and remove the orphan className. Commit only if there's anything to commit:

```bash
git status --short
# If something to commit:
git add -A src/components/sections src/pages
git commit -m "design(sections): sweep hero-cascade / ease-spring / animate-fade-in-up orphans"
```

---

## Task 12 — Verification gate

This is the Phase 2 acceptance gate.

### Step 1: Full lint + tsc + test + build

```bash
cd /Users/pranith/Documents/portfolio-redesign
npm run lint && npx tsc --noEmit && npm run test:run && npm run build:client && npm run build:server
```

Expected: all five exit 0; 121/121 tests.

### Step 2: Dev server smoke

```bash
npm run dev
```

Visit each page in a browser:

- `http://localhost:5173/` — Hero / PullQuote / Featured / Contact
- `http://localhost:5173/about` — About / Memberships
- `http://localhost:5173/skills` — Skills / Certifications
- `http://localhost:5173/experience` — Experience / Companies (verify "Show all" works)
- `http://localhost:5173/projects` — Projects (verify read-more on long descriptions)

Verify in both light and dark themes:

- No italic anywhere on portfolio pages
- Single ink-blue accent (no emerald/rose/cyan/amber/violet differentiation outside the green "open for work" pulse on Hero)
- All section headings are upright Newsreader 500
- Mono numbered eyebrows ("Filed 01", etc.) render uniformly
- Hover states color-shift (no scale, no translate, no spring)
- Companies "Show all" expands the list inline
- Project descriptions truncate at 240 chars with read-more

Stop the dev server.

### Step 3: Production preview + Lighthouse

```bash
npm run build && npm run preview
```

In another terminal:

```bash
npx lighthouse http://localhost:4173/ --only-categories=performance --quiet --chrome-flags='--headless' --output=json --output-path=/tmp/lh-home.json && node -e "const r = require('/tmp/lh-home.json'); console.log('Home:', Math.round(r.categories.performance.score * 100));"

npx lighthouse http://localhost:4173/about --only-categories=performance --quiet --chrome-flags='--headless' --output=json --output-path=/tmp/lh-about.json && node -e "const r = require('/tmp/lh-about.json'); console.log('About:', Math.round(r.categories.performance.score * 100));"
```

Expected: scores ≥ Phase 1 levels (median 82 on headless). Stop preview.

### Step 4: Grep for clean phase state

```bash
grep -rn "italic\|font-light" src/components/sections src/components/editorial.tsx 2>&1
grep -rn "ease-spring" src/components/sections src/components/editorial.tsx 2>&1
grep -rn "animate-fade-in-up" src/components/sections 2>&1
grep -rn "slate-[0-9]" src/components/sections 2>&1
grep -rn "brand-[0-9]" src/components/sections 2>&1
grep -rn "\\.glass" src/components/sections 2>&1
grep -rn "shadow-glow" src/components/sections 2>&1
```

All seven should return empty.

(Note: `text-slate-300` and `bg-slate-950` inside the About terminal mock are exceptions — those are tool-preview colors, not chrome. The grep above will catch them; verify each hit and whitelist if they're inside the terminal `<div>`.)

### Step 5: Final phase commit + summary

If the grep checks produced no extra changes, skip the commit. Otherwise stage and commit:

```bash
git add -A
git commit -m "design(sections): finalize Phase 2 portfolio surfaces sweep"
```

Print summary to user:

```
Phase 2 complete.

Sections rewritten: editorial.tsx + Hero / About / Featured / Companies /
  Experience / Projects / Skills / Contact / Certifications / Memberships

Lighthouse: home <X>, about <X> (vs Phase-1 baseline ≥82)
Build: client + SSR succeed
Tests: 121/121

Out of scope (later):
  - Hero illustration plate (slots into right column once /public/portrait.* exists)
  - AppShell + /dfir + /threatintel tool pages (Phase 3 / Phase 4)
  - Final neon palette + ease-spring temp alias removal (Phase 4)
```

Hand back to user for review before starting Phase 3.

---

## Self-review

**Spec coverage check (against `docs/superpowers/specs/2026-05-12-portfolio-editorial-redesign-design.md`):**

- ✅ Page archetypes — Mode A: `py-24` lg / `py-16` mobile, `max-w-[65ch]` prose, `max-w-6xl` grids — applied across every section above.
- ✅ Pull quote retypeset — upright Newsreader 500, no quote glyphs, centered attribution → Task 1.
- ✅ Companies collapsible — `useState` toggle, 6-item preview + "Show all N" → Task 5.
- ✅ One primary CTA per section → Hero, Contact verified.
- ✅ Headlines upright serif 500, mobile `clamp()` → all sections.
- ✅ Section anatomy: eyebrow → title → body → meta → tag → Tasks 4 (Featured), 7 (Projects), 10 (Certifications, Memberships).
- ✅ Single accent — multi-color systems (Skills 6-color, Memberships 3-color, FiledTag accent prop) collapsed → Task 1 + 8 + 10.
- ✅ Italic stripped everywhere → confirmed by Task 11 grep.
- ✅ Status-color pills retained only where semantic (green "open for work" pulse in Hero) → Task 2.

**Not in this phase per spec:** Anime-cyber illustration plate (separate asset work — Hero ships type-only here; image plate is a small follow-up commit once `/public/portrait.*` exists). AppShell rewrite (Phase 3). Tool page sweep + final neon/glow/ease-spring removal (Phase 4).

**Placeholder scan:** every Edit shows actual code; no TBD / TODO / vague steps.

**Type / name consistency:**

- `FiledTag` no longer accepts an `accent` prop in Task 1; Tasks 2, 3, 4, 5, 6, 7, 8, 9, 10 all stop passing it. `tsc --noEmit` will catch any consumer that still passes it — verification gate in Task 12.
- `PullQuote` keeps the same `{children, attribution, className}` interface; `Home.tsx` consumer unchanged.
- Every section uses `text-ink-1/2/3`, `text-accent`, `bg-surface-page`, `bg-surface-raised`, `bg-accent-soft`, `border-rule`, `divide-rule`, `duration-enter` — all defined in Phase 1's `tailwind.config.js` + `src/index.css`.
