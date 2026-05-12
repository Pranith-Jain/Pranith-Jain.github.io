# Portfolio editorial redesign — design spec

**Date:** 2026-05-12
**Owner:** Pranith Jain
**Status:** Awaiting user review
**Scope:** Site-wide visual redesign — all portfolio pages, DFIR/ThreatIntel app shell, and 60+ tool pages. Code logic untouched; visual layer only.

## Goal

Replace the current "AI-default" aesthetic (neon palette, glow shadows, grain overlay, chromatic aberration, float/pulse animations, Poppins display + Space Grotesk mono) with an **editorial dossier** look that reads as serious, readable, and human.

Constraints carried from the existing site:

- SSR + prerender pipeline must keep working
- Lighthouse scores must not regress below current values (wiki 77, exif 84 on desktop)
- Light + dark modes both supported
- Reduced-motion and full keyboard navigation preserved
- Brand-blue identity preserved — repointed to a deeper editorial tone, not swapped

## Design system

### Colors — semantic, paired light/dark

| Token              | Light     | Dark      | Use                             |
| ------------------ | --------- | --------- | ------------------------------- |
| `--surface-page`   | `#FAF9F6` | `#0E0E10` | Page background                 |
| `--surface-raised` | `#FFFFFF` | `#16161A` | Cards, raised surfaces          |
| `--surface-sunken` | `#F2F0EA` | `#08080B` | Inline code, sunken regions     |
| `--ink-1`          | `#111111` | `#ECEAE3` | Body text, headings             |
| `--ink-2`          | `#4A4A4A` | `#A8A39A` | Muted body, secondary           |
| `--ink-3`          | `#8B8780` | `#6E6963` | Faint labels, captions          |
| `--rule`           | `#D8D4CB` | `#2A2A2E` | Hairlines, borders, dividers    |
| `--accent`         | `#1B3A6B` | `#6C8EC9` | Links, focus rings, primary CTA |
| `--accent-soft`    | `#E6ECF4` | `#1B2333` | Accent washes, hover states     |

Status colors (red/amber/green) remain in the Tailwind defaults — used **only** for status pills on tool pages.

**Tailwind `brand-*` token repointed:** `brand.600 = #1B3A6B` with the rest of the scale rebuilt around it. Every existing `text-brand-600` / `bg-brand-600` / `focus:ring-brand-600` class stays valid — it just renders editorial ink-blue instead of indigo.

### Typography — three families

| Family         | Weights used  | Role                                 |
| -------------- | ------------- | ------------------------------------ |
| Newsreader     | 400, 500, 600 | Hero display + H1 + H2 + pull quotes |
| Inter          | 400, 500, 600 | Body, UI labels, H3-H6               |
| JetBrains Mono | 400, 500      | Code, IOCs, data labels, metadata    |

**Dropped:** Poppins, Space Grotesk. **No italic anywhere** — italic serif at body/H2 sizes fatigues the eye and reads worse in dark mode; upright Newsreader was engineered for long-form reading and carries the editorial voice without the cost.

**Scale:**

| Role    | Size (desktop)  | Mobile clamp                  | Weight           |
| ------- | --------------- | ----------------------------- | ---------------- |
| Display | 56px / 3.5rem   | `clamp(2.25rem, 6vw, 3.5rem)` | serif 500        |
| H1      | 48px / 3rem     | `clamp(2rem, 5vw, 3rem)`      | serif 500        |
| H2      | 32px / 2rem     | `clamp(1.5rem, 4vw, 2rem)`    | serif 400        |
| H3      | 20px / 1.25rem  | static                        | sans 600         |
| Body    | 16-17px         | static (16 minimum)           | sans 400         |
| Small   | 14px / 0.875rem | static                        | sans 500 tracked |
| Mono    | 13-14px         | static                        | mono 400         |

Line-height: 1.55 body, 1.15 headings. Measure capped at 68ch.

### Spacing / radius / motion

```
spacing  4-pt scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96
radius   0 / 4 / 8 / 12   (no full-pill, no irregular radii)
shadow   none (default) | sm 1px hairline | md soft 8/16
motion   --enter 220ms ease-out | --exit 140ms ease-in
         no spring, no float, no pulse, no parallax
border   1px solid var(--rule)  — structural element, used everywhere
```

### Focus ring (global, single rule)

```css
:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}
```

## Component primitives

### Header

- Sticky, 64px tall, `--surface-page` background, 1px bottom `--rule`. No `backdrop-blur`.
- Wordmark "Pranith Jain" in serif 500 18px.
- Nav links: sans 14px tracked +0.02em. Hover → underline-offset 6px, decoration `--accent`. Active → persistent underline.
- Theme toggle: mono "LIGHT / DARK" pair, current option in `--accent`.

### Buttons

- **Primary:** `bg: --accent`, white text, radius 4, padding 12/20, sans 500 14px. Hover: -2 lightness. Focus: ring per global rule.
- **Ghost link:** `→ arrow + label`, underline on hover, sans 500. Used for secondary CTAs.
- No tertiary button. No icon-only buttons in marketing pages.

### Card

- `--surface-raised`, 1px `--rule` border, radius 8, padding 24.
- No shadow by default. No `backdrop-blur`.
- Hover: `--rule` darkens one step + `translate-y(-1px)`, 180ms.
- Anatomy: eyebrow (mono 12px tracked uppercase, e.g. `CASE 02 · 2024`) → title (serif 400 22px) → body (sans 16px `--ink-2`) → meta (small + mono tags inline).

### Prose / long-form

- Container `max-w-[68ch] mx-auto py-16`.
- Body sans 17px, line-height 1.65, `--ink-1`.
- H2 serif 32px, `mt-16 mb-4`. First letter optional 24px left-rule in `--accent`.
- Blockquote: serif 400 24px (upright), `--accent` left-border 3px, no quotation glyphs.
- Code blocks: mono 14px on `--surface-sunken`, 1px rule, radius 8.
- Inline code: mono in `--surface-sunken` chip, no syntax color.

### Pull quote (existing component, retypeset)

- Serif 500 (upright) 36px desktop / 28px mobile. Tracking -0.01em. Slightly tighter line-height (1.25) for the magazine pull-quote feel.
- Attribution: mono 12px tracked, `--ink-3`, centered below. No quote glyph, no decorative line.

### Status pill

- Used on tool pages only.
- Tiny chip: mono 11px uppercase tracked, padding 2/8, radius 4.
- Semantic color: red `#DC2626` danger, amber `#D97706` warn, green `#16A34A` ok. Color is paired with text label and (optional) tabler/lucide icon — never color-only.

## Page archetypes

### Mode A — Editorial (portfolio pages, threat-intel landings, briefings, writeups)

```
Container        max-w-[68ch] for prose, max-w-6xl for grids
Section padding  py-24 desktop / py-16 mobile
Type scale       full editorial scale (display → body)
Density          paragraph mb-6, list-gap 12
Grid             6-col asymmetric (eyebrow col 1-2, body col 3-6)
Hero             single column, serif display, no decorative background
Imagery          single contained illustration OR none
```

Home page sections (Mode A):

1. **Hero** — split layout, type stack on left 7/12, anime-cyber illustration plate on right 5/12 (see Visual identity § below). Mobile: stack image above type.
2. **Pull quote** — existing component, retypeset.
3. **Featured** — three case-study cards in 3-col grid.
4. **Companies** — collapsed/expanded list (see Visual identity § below).
5. **Contact** — sans/mono email + socials inline, no form.

### Mode B — Utility (DFIR tools, ThreatIntel feeds, dashboards, AppShell, 60+ tool pages)

Same tokens, compressed density. Reads as an editorial newsroom monitor, not a SOC dashboard.

```
Container        max-w-7xl, gutters 24
Section padding  py-8 desktop / py-6 mobile
Type scale       body baseline 14-15px, h2 22px, mono 13px
Density          table row 36px, card padding 16
Grid             12-col where it matters
Surface          --surface-page with bordered --surface-raised regions
Tables           hairline rules only, no zebra, mono tabular figures
Filters          inline pill row, mono labels
Status pills     semantic chip pattern from primitives § above
```

**DFIR tool page template:**

```
[Tool name — serif 32px]      [Mono description — 14px --ink-2]
─────────────────────── 1px rule
[Input region — single-col, large textarea or input]
[Run button — primary]
─────────────────────── 1px rule
[Result region — mono output OR data table]
[Related tools — small footer card row]
```

### Shared chrome

- Header, Footer, theme toggle, focus ring — identical across Mode A and Mode B.
- AppShell wrapping `/dfir` and `/threatintel`:
  - **Desktop (≥1024px):** left rail with mono tool list grouped by category. Collapsible. Current item underlined. Top bar has search (cmd-k), theme toggle, link to `/`.
  - **Mobile (<1024px):** left rail collapses to an off-canvas drawer behind a top-bar menu icon. Top bar remains visible. cmd-k stays available via the search icon.
- **No `IntelTicker`** — surface critical updates inside the threat-intel landing's "Today" row instead.
- Icon-only buttons are allowed on tool pages (compact toolbars) but never on portfolio pages. All icon-only buttons require `aria-label`.

## Companies row (Home, expandable)

- Default state: 6 wordmarks (or 6 placeholder boxes if you haven't picked which) in a single typeset row, sans 500 16px tracked +0.05em `--ink-2`.
- Eyebrow above row: mono 12px tracked uppercase: `WORK HAS APPEARED AT`.
- "Show all" link below row: sans 500 14px `--accent` with `↓` glyph.
- Expanded state: full list in a 3-col wordmark grid (responsive), animates open with `--enter` token (220ms ease-out, opacity + 4px translate-y on each row staggered 30ms).
- No infinite horizontal auto-scroll. No logos at this stage — typeset wordmarks only. Real logos can be added later once usage rights for each are confirmed.

## Visual identity — anime-cyber illustration

Site reads editorial. The anime-cyber illustration is the **single piece of personality** — a magazine-cover plate, not a wallpaper. Three placements, one source illustration, one simplified mark version.

### Placements

1. **Home hero, right plate** — 480×600 portrait or 600×600 square. Sits inside a `--rule` 1px frame. Editorial type stack on the left.
2. **About page portrait** — 320×320 square. Top-right of the page, type column wraps around it.
3. **Favicon** — 16×16, 32×32, 180×180 (apple-touch). Simplified single-silhouette version of the main illustration — same character/mask outline, no interior detail. Provided as SVG that renders at 16px.

### Style brief (paste into Midjourney / Gemini / SDXL)

> Stylized cyberpunk anime portrait of a security analyst figure. Reference influences: Ghost in the Shell (1995), Akira, Serial Experiments Lain, Cyberpunk Edgerunners — late-90s ink-on-cel feel, NOT modern glossy digital anime, NOT Studio Ghibli, NOT generic AI anime.
>
> **Composition:** Three-quarter portrait, head and shoulders, looking just off-camera. Dark hooded jacket or jacket-with-collar silhouette. Subtle HUD/data fragments behind the figure, not glowing.
>
> **Technique:** Half-tone screentone shading. Visible ink linework. Limited cel-shading (max 3 tones per region). Newsprint-grain feel, like a scanned manga panel.
>
> **Palette — STRICT:**
>
> - Paper: `#FAF9F6` (bone)
> - Ink: `#111111`
> - Single saturated accent: `#1B3A6B` (deep ink-blue) — used sparingly, e.g. one piece of HUD text, one rim highlight
> - Optional second warm accent for ONE element: `#B5482D` (burnt red) — e.g. a single warning glyph
>
> **Avoid:** Cyan / pink / purple neon, glowing edges or rim lights, lens flares, holograms with glow, sakura petals, generic "girl with headphones" tropes, bokeh, watercolor splash effects, generic "AI anime girl" aesthetic.
>
> **Aspect:** Two outputs — 1:1 (1024×1024) for hero + About, and a 16:9 (1920×1080) variant for the OG image.
>
> **Favicon mark:** From the chosen final, produce a flat single-color silhouette of the figure's head/hood shape only, optimized to read at 16×16. Deliver as SVG with `fill: currentColor`.

### Quality bar

- At 16px the favicon mark must read as a distinct silhouette (not a smudge). Test before finalizing.
- At 320×320 the About portrait must still feel illustrated, not pixel-mushy. Generate at 1024 minimum and downscale.
- The hero plate must hold its own next to a 56px Newsreader headline without making the page feel like two different products. If it doesn't, iterate the prompt until it does.

## Migration plan

Four phases. Each phase leaves the site shippable.

### Phase 1 — Tokens & chrome (~2-3 hours)

```
tailwind.config.js
  Add: surface/ink/rule/accent CSS variable tokens
       serif/sans/mono font families (drop Poppins, drop Space Grotesk)
       editorial spacing scale
       --enter / --exit motion tokens
  Repoint: brand.* palette so brand.600 = #1B3A6B, scale rebuilt around it
  Keep (temporarily): neon palette, glow shadows, float animations — removed in Phase 4

index.html
  Swap Google Fonts query: Inter + Newsreader + JetBrains Mono
  Update <meta name="theme-color"> to #1B3A6B
  Update inline-SVG favicon to the new mark (when ready)

src/index.css
  Replace .glass, custom scrollbar, focus-ring rules with primitives §
  Drop hero-cascade (replace with single 220ms fade)
  Drop animate-float, animate-pulse-slow

src/components
  Rewrite Header.tsx, Footer.tsx, Layout.tsx per primitives §
  Delete BackgroundLayer.tsx, GrainOverlay.tsx
  Remove IntelTicker.tsx from App.tsx render (file kept until Phase 3)

public
  Regenerate og-image.svg using new accent color (placeholder until final
  illustration is ready)

Gate: build passes, light + dark both render, Lighthouse ≥ current scores
```

### Phase 2 — Portfolio surfaces (~2-3 hours)

```
src/pages/Home.tsx                 (re-typeset, plug in illustration plate)
src/components/sections/Hero.tsx
src/components/sections/Featured.tsx
src/components/sections/Contact.tsx
src/components/sections/Companies.tsx  (collapsible pattern)
src/components/editorial.tsx + PullQuote
src/pages/About.tsx, Skills.tsx, Experience.tsx, Projects.tsx

Gate: visual diff vs current site, 375 + 1440 widths, reduced-motion on,
      keyboard tab order verified
```

### Phase 3 — App chrome (~2 hours)

```
src/components/AppShell.tsx        (rewrite to Mode B utility shell)
src/components/dfir/CommandPalette.tsx (restyle, keep cmd-k behavior)
src/pages/DFIR.tsx                 (tool index, retypeset)
src/pages/threatintel/Home.tsx     (ditto)

Gate: every tool page still routes and renders. Shell only — no tool internals.
```

### Phase 4 — Tool-page sweep + cleanup (~2-3 sessions)

```
Batch by directory:
  src/pages/dfir/*.tsx          (~40 files)
  src/pages/threatintel/*.tsx   (~20 files)
  src/components/dfir/*         shared components
  src/components/threatintel/*  ditto

Per-page pattern: keep all logic, swap to primitives §:
  .glass card           → Card primitive
  shadow-glow-*         → none
  float-enhanced wrapper → drop
  Poppins/Space Grotesk class → serif/sans/mono per scale
  status indicators     → Status Pill primitive

Final cleanup commit:
  Remove neon palette from tailwind.config
  Remove float-enhanced / pulse-glow / threat-pulse keyframes
  Remove shadow-glow-* utilities
  Delete DESIGN-2026.md, replace with DESIGN.md describing this system
  Delete IntelTicker.tsx
  Audit update_dfir_section.py — delete if unused

Gate: grep "neon-|shadow-glow|float-enhanced|chromatic" in src/ returns zero.
      Lighthouse ≥ current scores. README updated.
```

## Risks

1. **Lighthouse regression.** `App.tsx` notes (lines 18-25) record that lazy-loading shell components regressed wiki 77→71 and exif 84→71. Preserve eager imports of Header / Footer / Hero. Each phase's gate re-runs Lighthouse before merge.
2. **SSR + prerender safety.** Build runs `vite build --ssr` then `prerender.mjs`. New CSS must not reference `document`/`window`. Font loading must keep `font-display: swap` so prerendered HTML doesn't FOIT.
3. **Dark-mode legibility.** All Newsreader sizes use upright weights (no italic) to keep long-form reading comfortable on dark surfaces. Body text on `--surface-page` dark verified at WCAG AA (4.5:1 minimum) before each phase ships.
4. **Mobile display scaling.** Display sizes use `clamp()` (e.g. hero `clamp(2.25rem, 6vw, 3.5rem)`) to prevent 56px Newsreader breaking 375px viewports.
5. **Test breakage.** Phase 4 removes class names that vitest tests may grep for (`glass`, `neon-`, `shadow-glow`). Tests updated in lockstep with each batch.
6. **Visual coherence with the anime-cyber image.** The illustration must hold its own next to serif typography without making the page feel like two products. Style brief above is strict on palette and technique; iterate the prompt until the test passes.
7. **Editorial-look + cyber-illustration tension.** Site reads editorial; one plate carries the personality. If the user later wants more illustration coverage, that decision is out of scope for this redesign.

## Success criteria

- `grep -rE "neon-|shadow-glow|float-enhanced|chromatic-text|animate-float" src/` returns zero hits.
- Poppins and Space Grotesk no longer requested from Google Fonts.
- Lighthouse desktop scores ≥ current measured values (wiki 77, exif 84).
- Both light and dark modes pass WCAG AA contrast on body text and AA on large text.
- Site renders correctly under `prefers-reduced-motion: reduce` (no animations except token-level fade on route change).
- A first-time visitor describes the site in adjectives like "editorial / considered / quiet / readable" rather than "neon / cyber / glowing / busy."

## Open work after spec approval

- Generate the anime-cyber illustration from the style brief above.
- Pick the 6-default wordmarks for the Companies row (or confirm placeholder is OK).
- Confirm the existing `og-image.svg` design intent — Phase 1 produces a typographic placeholder; the final replaces it once the illustration's 16:9 variant exists.
