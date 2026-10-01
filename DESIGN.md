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

### `@theme` utilities — the canonical spellings

Every token above is registered in the `@theme` block, which is what makes it
usable as a utility. **Write the utility, never an arbitrary value.**

| Instead of                        | Write            |
| --------------------------------- | ---------------- |
| `bg-[rgb(var(--surface-200))]`    | `bg-surface-200` |
| `border-[rgb(var(--border-400))]` | `border-line-1`  |
| `bg-[rgb(var(--input-200))]`      | `bg-input-200`   |
| `bg-[rgb(var(--hover-100))]`      | `bg-wash`        |
| `text-[rgb(var(--muted))]`        | `text-muted`     |

Full set: `bg-surface-100/200/300`, `bg-input-200`, `bg-wash`,
`border-line-1/2/3/input`, `divide-line-1/2/3`, `text-muted/heading/body/accent-text`.

These utilities resolve through the channel variables, so they adapt to both
modes with **no `dark:` prefix**. `bg-surface-200 dark:bg-surface-200` is
redundant; write `bg-surface-200`.

### Accent-as-text (`--accent-text`) and focus ring (`--focus-ring`)

No single brand step works for both modes, so the channel flips it:

|                | light (brand-500) | dark (brand-400) |
| -------------- | ----------------- | ---------------- |
| on surface-100 | 5.11:1            | 5.96:1           |
| on surface-300 | 4.69:1            | 4.85:1           |

`--focus-ring` exists because of the 3px `outline-offset`: the ring can land on
`--surface-300`, where brand-400 only reaches **2.88:1** and fails SC 1.4.11.
Light uses brand-500 (4.69:1 on that surface). Use `--color-focus-ring` for any
custom focus treatment and `--color-accent-text` for link-colored text; do not
hardcode a brand step.

`eslint-rules/no-raw-colors.js` enforces all three of these rules and is covered
by `eslint-rules/no-raw-colors.test.mjs`.

### Opacity modifiers on alpha-carrying tokens

`--border-*` and `--hover-100` already contain an alpha (`255 255 255 / 0.08`).
Appending a second one produces `rgb(255 255 255 / 0.08/0.4)`, which is
**invalid CSS** — a second slash is never permitted, so the declaration is
dropped and the element renders no border at all. For these tokens, express
reduced emphasis with the ladder step (`border-line-1` instead of `line-2`) or
`color-mix()`, never a nested alpha. Tokens without an embedded alpha
(`--surface-*`, `--input-200`) accept `/50` normally.

### Status colors

Semantic severity chips: rose (critical/malicious), amber (medium/warn),
emerald (clean/supported), sky (info). Dark variants use `-300/-400` text on `-950/40`
backgrounds. These are conventional in security tooling — keep them.

**Light-mode chip text is `-800`, not `-700`.** Chips render at `text-xs` bold
(12px), so SC 1.4.3 requires the full 4.5:1 and the 3:1 large-text allowance
does not apply. Measured against the composited 15% tint over white, `-700`
gave 4.44:1 (`high`) and 4.47:1 (`medium`) — just under. `-800` gives 6.27:1
and 6.31:1 while staying in the same hue family. Canonical map:
`src/components/severity.ts` (`SEVERITY_TONE` / `SEVERITY_BAR`).

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

- **Arbitrary-value syntax eliminated (5,953 sites).** The codebase had been
  writing `bg-[rgb(var(--surface-200))]` and `border-[rgb(var(--border-400))]`
  even though `@theme` already registered those tokens as real utilities. All
  are now `bg-surface-200` / `border-line-1`.
- **Redundant `dark:` variants removed (~5,450).** The August sweep rewrote the
  dark half of every pair onto tokens but left the light half raw, so one CSS
  property had two sources of truth (`border-slate-200 dark:border-line-1`).
  Since token utilities already adapt, both halves collapse to one utility.
- **Three undefined CSS variables eliminated.** `--card-bg`, `--border-300` and
  `--brand-500` were referenced 26 times and defined nowhere. A declaration
  referencing an undefined variable is invalid at computed-value time, so those
  elements rendered with **no background/border at all**.
- **30 invalid `rgb(R G B / A / B)` declarations repaired.** `rgb(var(--border-400)/0.4)`
  expands to `rgb(255 255 255 / 0.08/0.4)`, which `CSS.supports` rejects (verified
  in Chromium). A second slash is never valid, so the extra alpha could not have
  applied; these now collapse onto the intended ladder step.
- Raw `dark:slate-*` usage swept from ~7,000 to 0 via pairing codemods into
  semantic tokens. New code must use tokens.
- **Intentional raw-color waivers** (do not codemod): inverted chip text
  (`text-slate-300 dark:text-slate-600/700`), decorative separators/dots at deliberately
  low contrast (`dark:text-slate-700`, `dark:bg-slate-600`), opacity composites
  (`slate-500/10`, `/40`) used as washes, and dark-only emphasis overrides inside
  light-styled controls. These read correctly per-context; a blind swap would regress them.
- ESLint rule `no-raw-dark-colors` warns on raw dark palette classes in touched files.
