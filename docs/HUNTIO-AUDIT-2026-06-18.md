# Hunt.io-inspired UI/UX audit — 2026-06-18

Reference: https://hunt.io/glossary/peak-threat-hunting-framework (Hunt.io
glossary/PEAK framework surface). I could not fetch the live page from the
sandbox (DNS blocked), so this audit is built from prior knowledge of
Hunt.io's design language plus a structural reading of the current platform.

## TL;DR

Hunt.io's visual language is **content-first, instrument-panel quiet**:
mono meta labels, hairline borders, one accent color, sharp 4–8px radii,
generous reading width, and a numbered heading hierarchy. The current
platform is close in many places (type system, mono eyebrows, severity
scale) but leans too hard on the brand blue, repeats `mt-20` rhythm,
mixes densities, and has a Contact section that drifts into generic
marketing prose. Adopt Hunt.io's _restraint_, not its literal skin.

## What Hunt.io does well (the borrow list)

- **Density that earns its space.** Tables, stat cards, and code chips
  are the primary content units. Decorative gradients are absent.
- **One accent, two neutrals.** A single brand color plus slate/zinc
  neutrals. Status colors (red/amber/green) are reserved for meaning.
- **Mono for data.** Counts, IOCs, hashes, and meta labels are mono,
  with tabular numerals. Body text is humanist sans.
- **Heading hierarchy is numbered and explicit** (H1, H2 with caps
  eyebrows, no clever subheadings).
- **Sharp radii (4–8px) for content blocks**, larger radii (12–16px)
  reserved for hero/CTA surfaces.
- **Reading width ~70ch**, line-height 1.6–1.7 for prose.
- **High color contrast**. Body text never drops below slate-700 on
  white or slate-300 on slate-950.

## Current platform — issues found

### Hierarchy & rhythm (P1)

- `mt-20` repeated on every section in `Home.tsx` and most section
  components. The page has a single vertical rhythm. Hunt.io varies
  rhythm by section importance: hero → 1.5rem gap, primary sections →
  3–4rem gap, contact CTA → 5–6rem gap.
- Hero h1 is `text-[1.75rem]` on mobile, `lg:text-[3.4rem]` — fine
  spread, but the H2 in `Contact` is `text-4xl sm:text-5xl` which
  competes with the H1 at `lg`. Hunt.io would demote the contact H2 to
  `text-3xl sm:text-4xl`.
- The two H2s in `Toolkits` (`text-4xl sm:text-5xl`) and `Contact` use
  the same scale, but `Contact` is a CTA while `Toolkits` is a primary
  section. They should not be the same size.

### Color & emphasis (P1)

- Brand-600 is used for _every_ emphasis: heading, eyebrow, CTA, hover,
  link. The page is monochromatic-brand. Hunt.io uses accent for action
  and weight for emphasis.
- **Fix:** reserve `text-brand-600` for primary action and active state.
  Use `text-slate-900` (light) / `text-white` (dark) for headings, and
  use `text-muted` (existing) for body.

### Buttons (P2)

- Primary "Try IOC Check" + secondary "Threat Intel Platform" are
  visually unequal (filled vs. thin border). They are not bad, but they
  read as different components. Hunt.io would give them the same
  height/weight, one filled and one outline of equal weight.
- Contact CTAs ("Schedule call" / "Email me") are good but the social
  links below are visually heavy (icon chip + bold label). Hunt.io
  would shrink the social row to text-only with hover underline.

### Copy — grammar & clarity (P1)

Concrete fixes captured in the patch:

- `Contact.tsx`: replace generic CTA prose with specific value prop.
- `Toolkits.tsx`: tighten feature bullets; remove redundancy with the
  description.
- `Hero.tsx`: tighten stat row, add period after last item, fix "60+
  tools · 18 feeds" framing.
- `content.ts`: convert "Whether you need..." wording.

### Spacing & radii (P2)

- `rounded-2xl` on every card. Hunt.io uses `rounded-md` (6px) on
  data tiles, `rounded-lg` (8px) on tool/feature cards, and only
  `rounded-xl+` on hero/CTA.
- `mt-20` on every section is a tell. Standardize to `mt-16` (4rem) and
  use `mt-24` only above the final contact CTA.

### Tokens (P2)

- Add `radius.md`/`radius.lg` aliases to `tailwind.config.js` so the
  intent (`radius-card` vs `radius-hero`) is named.
- Add a `prose` class to `index.css` with `max-w-[68ch]`,
  `leading-[1.65]`, and `text-muted` body for any future long-form
  copy.

## What we are NOT copying

- Hunt.io's literal skin (cyan accent). Brand stays `#2c3ee5`.
- Hunt.io's font stack. Bricolage/Hanken/JetBrains is already
  better-fitting for a security portfolio.
- Hunt.io's "glossary" writing voice. Our tone is first-person
  builder, not encyclopedic.

## Action items (in PR order)

1. `Contact.tsx` — copy rewrite + grammar fix + tighter social row.
2. `Toolkits.tsx` — dedupe features, tighten copy, equalize CTA.
3. `Hero.tsx` — stat row restructure, eyebrow color shift, heading
   weight down 1 step.
4. `Home.tsx` — section rhythm (mt-20 -> mt-16, mt-24 above contact).
5. `tailwind.config.js` — `radius` aliases + eyebrow-muted color.
6. `index.css` — `.prose` utility for any long-form copy.
7. `DESIGN_SYSTEM.md` — document the new radii and prose utility.
