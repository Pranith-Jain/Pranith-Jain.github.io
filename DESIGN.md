# DESIGN.md

Derived from `src/index.css` (Tailwind v4, `@theme` + CSS-channel tokens).
Canonical source of truth is the CSS file; this documents intent.

## Theme strategy

Both modes ship; `.dark` class on `<html>` flips channel values.
Scene: analysts in dim rooms on desktop (dark default) and daylight office skims (light).
Dark canvas `#070b1c` (deep navy); light canvas flat white — a brand-tinted glow was
deliberately removed as AI-slop.

## Color tokens

Channel triples consumed via `rgb(var(--token))`, so one definition serves both modes:

| Token                  | Light               | Dark                | Role                            |
| ---------------------- | ------------------- | ------------------- | ------------------------------- |
| `--surface-100`        | #fff                | #0c1124             | page/card base                  |
| `--surface-200`        | #fafafa             | #12192e             | raised panels                   |
| `--surface-300`        | #f5f5f5             | #1c253c             | highest elevation, inputs hover |
| `--input-200`          | #fafafa             | #0b0f20             | form field backgrounds          |
| `--border-400/500/600` | black @ 8/14/22%    | white @ 8/14/22%    | hairline ladder                 |
| `--border-input`       | #7d8ca0             | #64748b             | form-control boundary only      |
| `--muted`              | #475569 (slate-600) | #94a3b8 (slate-400) | secondary text (`text-muted`)   |
| `--hover-100`          | black 4%            | white 4%            | hover washes                    |

### Hairlines vs. control boundaries (WCAG 1.4.11)

The `--border-4/5/6` ladder is **decorative** — it carries layout and grouping.
Measured on white it runs 1.19:1 → 1.69:1, which is correct for a hairline and
intentionally far below the 3:1 floor. Do not "fix" these: raising the ladder
would flatten the elevation hierarchy for no accessibility gain, since a
separator isn't what identifies a control.

`--border-input` is different in kind. A field's border is the **only** thing
identifying it as an interactive control, so SC 1.4.11 requires ≥3:1. It is
therefore a separate token rather than a fourth ladder step:

|                | light  | dark   |
| -------------- | ------ | ------ |
| on surface-100 | 3.43:1 | 3.94:1 |
| on surface-200 | 3.28:1 | 3.66:1 |

Rule of thumb: if removing the border would make the element stop reading as
interactive, it needs `--border-input`. If it's only separating two regions,
use the ladder. `src/__tests__/token-contrast.test.ts` pins both the floor and
the intentional sub-threshold hairline values so neither drifts silently.

`@theme` color utilities: `brand-50…950` (indigo family), `severity-critical/high/medium/low/info`,
`muted`. Surfaces are consumed as arbitrary values today
(`bg-[rgb(var(--surface-100))]`); utilities exist for muted only.

### Status colors

Semantic severity chips: rose (critical/malicious), amber (medium/warn),
emerald (clean/supported), sky (info). Dark variants use `-300/-400` text on `-950/40`
backgrounds. These are conventional in security tooling — keep them.

## Typography

- Sans stack via `--font-sans`; mono for all data/identifiers/queries (signature element).
- Micro scale: `text-micro` 10px / `text-mini` 11px / `text-tool` with fixed line-heights —
  dense tool UIs use these instead of ad-hoc sizes.
- Hierarchy: weight + size steps ≥1.25 ratio; avoid mid-gray-on-gray body copy
  (slate-500-on-white minimum for readable text).

## Elevation & radius

Shadows `--shadow-e1/e2/e3` (soft, low-alpha slate). Radii `--radius-card` 8px,
`--radius-panel` 10px, `--radius-hero` 14px. Borders do most separation work;
shadows are accents, not defaults.

## Component conventions

- `.surface-card` — standard panel (surface bg + hairline border + e1 shadow).
- Data tables: sticky headers, font-mono cells, zebra-free, hairline row borders.
- Chips/pills: rounded-full, tinted bg at low alpha, mono text-xs.
- Buttons: brand-600 solid primary; ghost/bordered secondary; no gradients.

## Known debt → resolved + waivers

- Raw `dark:slate-*` usage swept from ~7,000 to ~240 (−97%) via three pairing codemods
  into semantic tokens (`text-muted`, `text-heading`, `text-body`, `border-line-1`,
  `bg-input-200`). New code must use tokens.
- **Intentional raw-color waivers** (do not codemod): inverted chip text
  (`text-slate-300 dark:text-slate-600/700`), decorative separators/dots at deliberately
  low contrast (`dark:text-slate-700`, `dark:bg-slate-600`), opacity composites
  (`slate-500/10`, `/40`) used as washes, and dark-only emphasis overrides inside
  light-styled controls. These read correctly per-context; a blind swap would regress them.
- ESLint rule `no-raw-dark-colors` warns on raw dark palette classes in touched files.
