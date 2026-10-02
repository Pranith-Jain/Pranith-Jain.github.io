# DESIGN.md

Derived from `src/index.css` (Tailwind v4, `@theme` + CSS-channel tokens).
Canonical source of truth is the CSS file; this documents intent.

## Theme strategy

Both modes ship; `.dark` class on `<html>` flips channel values.
Scene: analysts in dim rooms on desktop (dark default) and daylight office skims (light).
Dark canvas `#070b1c` (deep navy); light canvas flat white — a brand-tinted glow was
deliberately removed as AI-slop.

**Light mode is now verifiably flat.** `Layout.tsx` used to render its own pair
of blurred brand blobs on top of the one `BackgroundLayer` draws, and neither
had a `dark:` guard on the light half, so light mode painted a 10%-opacity
brand wash anyway (sampled at `rgb(241,243,254)` top-left and `rgb(236,237,252)`
bottom-right; now `rgb(255,255,255)` at every sample point). Dark mode was
getting three pools where the comment in `BackgroundLayer.tsx` calls for one.
The blobs are gone; ambient depth is owned solely by `BackgroundLayer`,
dark-only. If a glow ever comes back, scale the radius on mobile — never
`filter: none` on a blurred coloured element, which turns a soft falloff into a
hard-edged disc (that is how mobile ended up with a crisp 500px circle through
the hero headline).

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
| `--on-fill`            | #fff                | #fff                | ink on a saturated fill         |
| `--track`              | #e2e8f0             | #1c253c             | loading/progress track on card  |
| `--inverted`           | #334155             | #94a3b8             | low-emphasis ink, both modes    |
| `--disabled`           | #cbd5e1 (slate-300) | #334155 (slate-700) | disabled button fill            |
| `--accent-text`        | #435ef1 (brand-500) | #6d8bf7 (brand-400) | accent used as text / links     |
| `--focus-ring`         | #435ef1 (brand-500) | #6d8bf7 (brand-400) | focus outline                   |

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

Full set: `bg-surface-100/200/300`, `bg-input-200`, `bg-wash`, `bg-track`,
`bg-disabled` (under `disabled:` only), `border-line-1/2/3/input`,
`divide-line-1/2/3`, `text-muted/heading/body/inverted`, `text-on-fill`,
`text-accent-text`.

### Three roles that are not the surface ladder

These exist because collapsing everything onto `surface-*` would be wrong in a
way that is easy to miss:

- **`--on-fill`** — ink on a saturated brand/severity fill. White in **both**
  modes. Using `--ink-heading` here is a real bug, not a style choice: its dark
  value is a blue-tinted near-white, which goes muddy on `brand-600`. The fill
  sets the contrast, so the ink must not follow the theme.
- **`--track`** — a loading placeholder sitting _on_ a card. Not a surface: it
  has to read as a recessed track, ~1.2:1 against the card in both modes.
- **`--inverted`** — low-emphasis ink that stays low-emphasis across modes. It
  replaces the raw pair `text-slate-300 dark:text-slate-700`, whose **light**
  half measured **1.48:1 on white** (effectively invisible). So this token is
  not an average of the pair's two ends; it is the first value that passes on
  both. In light mode it coincides with `--ink-body` because no lighter ink
  step clears 4.5:1 there.
- **`--disabled`** — the fill of a disabled brand/severity button
  (`disabled:bg-disabled`, replacing `disabled:bg-slate-300
dark:disabled:bg-slate-700`). White-on-fill here is 1.48:1 in light mode,
  which is _not_ a violation: inactive controls are explicitly exempt from SC
  1.4.3. The value is pinned by tests precisely so nobody "fixes" it and
  breaks the disabled affordance. Only the `disabled:`-variant spelling maps;
  a bare `bg-slate-300` stays unmapped because its intent is unknown.

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

Shadows `--shadow-e1/e2/e3` (soft, low-alpha slate). Borders do most separation
work; shadows are accents, not defaults.

Radius is **four** roles, not three. The fourth is `--radius-control`, and it
exists because the container radii alone left controls ungoverned:

| Token              | Value | Use                                                   |
| ------------------ | ----- | ----------------------------------------------------- |
| `--radius-control` | 6px   | every interactive element: button, input, select, tab |
| `--radius-card`    | 8px   | standard panel / data tile                            |
| `--radius-panel`   | 10px  | surface containing internal rows or tables            |
| `--radius-hero`    | 14px  | hero CTAs and contact panels                          |

The nesting rule is control-inside-surface, so `--radius-control` must stay
tighter than every container it can sit in. Before this token existed, controls
split: `Button` sat at 4px (`rounded`) while `Input`/`Select`/`Textarea` sat
at 12px (`rounded-xl`), so a primary button sitting beside a text field in the
same row was 8px apart in radius and read as two design languages. Shared
primitives (`Button`, `Input`, `Card`, `Skeleton`, `StatCards`) now spell
`rounded-control` / `rounded-card`.

`rounded-xl` is still the most-used radius in call sites (~1,600) where it
means "card". That is four px off `--radius-card` and is the largest remaining
inconsistency; aligning it is a mechanical sweep, not a redesign, and is
deliberately not bundled into unrelated work.

### Surface recipes in components

`.surface-card` and friends hardcode `border: 1px solid #e2e8f0` for the light
half. That is a raw palette step sitting next to the `border-line-1` token and
it disagrees with it by a few levels (`#e2e8f0` opaque vs black@8% ≈ `#ebebeb`
on white). Page-level cards were swept onto `border-line-1`; these component
classes still carry the raw half.

## Component conventions

- `.surface-card` — standard panel (surface bg + hairline border + e1 shadow).
- Data tables: sticky headers, font-mono cells, zebra-free, hairline row borders.
- Chips/pills: rounded-full, tinted bg at low alpha, mono text-xs.
- Buttons: brand-600 solid primary; ghost/bordered secondary; no gradients.
- Text fields: `border-line-input` (not the decorative ladder), `rounded-control`,
  `bg-input-200`. Ink on a saturated fill is `text-on-fill`, never
  `text-heading`.
- Accent-as-text is `text-accent-text`, focus is `ring-focus-ring`. Both are
  channels because no single brand step clears contrast in both modes.

### Unstyled form controls are a bug class, not a style choice

A bare `<input>` with no `className` renders with zero border, zero fill and
zero radius, so it does not read as a control at all. Three tool pages had
exactly this on their primary field (`dfir/ioc-check`, `dfir/asn-lookup`,
`dfir/url-preview`), so the flagship IOC tool's main input was an invisible
175x24 box next to a fully styled button. `scripts/.find-bare-controls.mjs`
enumerates them; it skips checkbox/radio/range (different vocabulary) and
`CsrfPocGenerator`'s occurrences, which live inside a template literal that
generates CSRF PoC HTML and must never carry app styling.

Prefer the `Input` / `Select` / `Textarea` components. `INPUT_CLASS` is exported
for the case where the element must stay a native tag.
`npm run check:unstyled-controls` enumerates offenders; it is a reporting
guard, not a hard failure, because the `CsrfPocGenerator` occurrences are
legitimate (template-literal PoC HTML) and are skipped by rule rather than by
allowlist.

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
- **Both-halves-raw pairs collapsed (642).** Phase 1 fixed `<raw light> +
<dark: token>`. What remained were pairs where _neither_ half used a token
  (`text-slate-900 dark:text-white`, `bg-slate-200 dark:bg-surface-300`, …),
  backed by the three new tokens above. One of these was an outright
  accessibility bug — see `--inverted`.
- **The lint rule stopped suppressing fixes.** It gated its autofix on
  _every_ issue in a className being fixable, so a single unmapped sibling
  stranded the ~800 fixable warnings next to it. The fix is now attached to the
  last _fixable_ issue instead, and is withheld only when a dead token is
  present (an undefined variable is the one case where silently renaming
  would destroy the signal).
- **239 findings remain**, all reported but deliberately **not** auto-fixed,
  because the rewrite would change rendering rather than spelling:
  - `dark:bg-white/10` and similar. White at 10% LIFTS a navy card; the token
    form DARKENS it, because `--surface-100` is near-black in dark mode. Same
    class name, opposite effect.
  - `text-white` with no saturated fill behind it. White on a neutral surface
    is a contrast bug, and renaming it to a reactive ink would hide that
    instead of surfacing it.
  - Steps with no token (`slate-950`, `border-slate-700`).

  These live in `eslint-rules/raw-colors-baseline.mjs`, regenerated by
  `npm run lint:baseline` and asserted by `raw-colors-baseline.test.ts` so the
  waiver cannot silently widen. New files are always guarded.

  A note on the earlier claim that `hover:`/`disabled:` variants must not be
  bulk-fixed: checked rather than assumed. All 176 state-variant fixes keep a
  distinct resting value — e.g. `text-muted` at rest vs `hover:text-slate-700
-> hover:text-body`, whose light value (`#334155`) equals `--ink-body`
  exactly. Zero cases collapsed a hover step. The real risk turned out to be
  the alpha overlays above, which is what is now withheld.

- **Intentional raw-color waivers** (do not codemod): inverted chip text
  (`text-slate-300 dark:text-slate-600/700`), decorative separators/dots at deliberately
  low contrast (`dark:text-slate-700`, `dark:bg-slate-600`), opacity composites
  (`slate-500/10`, `/40`) used as washes, and dark-only emphasis overrides inside
  light-styled controls. These read correctly per-context; a blind swap would regress them.
- **Overlay scrims are not token debt.** `bg-black/50`-style scrims behind
  modals and `dark:bg-white/10`-style lifts on navy cards are translucent
  overlays whose effect depends on what is _beneath_ them. No solid token can
  express "10% lighter than whatever is behind this element", so these stay raw
  by design. The lint rule reports them but withholds the autofix (rewriting to
  a surface token would invert the effect); see the `alphaOnExtremes` gate.
- **Argus has its own token scope.** `--text-primary/secondary/tertiary`,
  `--ink-600…950` and `--edge*` are defined in `src/pages/argus/argus.css` and
  are only valid inside Argus views (`Argus.tsx` imports that stylesheet). They
  are not part of the global ramp and must not be "unified" into it; the two
  palettes serve different surfaces.
- ESLint rule `no-raw-colors` warns on raw palette colors in touched files.
