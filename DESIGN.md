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
| `--muted`              | #475569 (slate-600) | #94a3b8 (slate-400) | secondary text (`text-muted`)   |
| `--hover-100`          | black 4%            | white 4%            | hover washes                    |

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

## Known debt (tracked)

- ~6k raw `dark:text-slate-*` usages across pages predate the token ladder; the
  dominant pairing (`text-slate-500 dark:text-slate-400`) maps exactly to `text-muted`.
  Codemod in progress; new code must use tokens.
- ESLint rule `no-raw-dark-colors` warns on raw dark palette classes in touched files.
