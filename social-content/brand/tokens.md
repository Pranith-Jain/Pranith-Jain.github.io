# Brand Tokens — Social Content

These are the canonical brand values for all generated content.
Derived from the portfolio `tailwind.config.js` — single source of truth.

---

## Colors

### Brand (primary accent)

| Token     | Hex       | Usage                                 |
| --------- | --------- | ------------------------------------- |
| brand-50  | `#f5f7ff` | Background tints, light mode          |
| brand-100 | `#ebf0fe` | Hover backgrounds                     |
| brand-400 | `#6d8bf7` | Links, secondary accents              |
| brand-600 | `#2c3ee5` | **Primary accent** — CTAs, highlights |
| brand-700 | `#232ebf` | Text on light backgrounds             |
| brand-900 | `#1f267c` | Dark mode accent                      |
| brand-950 | `#121649` | Darkest shade, footer                 |

### Severity (data visualization)

| Token    | Hex       | Usage                     |
| -------- | --------- | ------------------------- |
| critical | `#e11d48` | Critical findings, alerts |
| high     | `#f43f5e` | High severity             |
| medium   | `#f59e0b` | Medium severity, warnings |
| low      | `#10b981` | Low severity, success     |
| info     | `#0ea5e9` | Informational, neutral    |

### Neutrals

| Token | Hex       | Usage                   |
| ----- | --------- | ----------------------- |
| 50    | `#f8fafc` | Lightest background     |
| 100   | `#f1f5f9` | Page background         |
| 200   | `#e2e8f0` | Borders, dividers       |
| 400   | `#94a3b8` | Muted text              |
| 500   | `#64748b` | Secondary text          |
| 700   | `#334155` | Body text (light mode)  |
| 800   | `#1e293b` | Card backgrounds (dark) |
| 900   | `#0f172a` | Primary text            |
| 950   | `#020617` | Darkest black           |

---

## Typography

| Role    | Font                | Weight  | Usage                   |
| ------- | ------------------- | ------- | ----------------------- |
| Display | Bricolage Grotesque | 800     | Slide headlines, hooks  |
| Body    | Hanken Grotesk      | 400–600 | Body text, descriptions |
| Mono    | JetBrains Mono      | 400–500 | Code, IOCs, stats       |

### Font sizes (carousel)

- **Hook headline**: 36px, weight 800, Bricolage Grotesque
- **Section headline**: 28px, weight 800, Bricolage Grotesque
- **Body text**: 20–22px, weight 400, Hanken Grotesk
- **Bullets**: 20px, weight 400, Hanken Grotesk
- **Stat number**: 84px, weight 800, Bricolage Grotesque
- **Stat label**: 22px, weight 500, Hanken Grotesk
- **Badge/meta**: 11px, weight 500, JetBrains Mono

---

## Funnel Colors

| Stage | Accent                  | Background             | Label |
| ----- | ----------------------- | ---------------------- | ----- |
| TOFU  | `#2c3ee5` (brand-600)   | `#f5f7ff` (brand-50)   | TOFU  |
| MOFU  | `#0ea5e9` (sky-500)     | `#f0f9ff` (sky-50)     | MOFU  |
| BOFU  | `#10b981` (emerald-500) | `#ecfdf5` (emerald-50) | BOFU  |

---

## Platform Colors

| Platform  | Hex       | Usage              |
| --------- | --------- | ------------------ |
| LinkedIn  | `#0a66c2` | LinkedIn branding  |
| Instagram | `#e4405f` | Instagram branding |
| Twitter/X | `#1d9bf0` | Twitter branding   |

---

## Slide Layout Rules

1. **Max 7 words** in the headline (scannable)
2. **Max 3 bullets** per slide (cognitive load)
3. **One idea per slide** (don't combine)
4. **White space is content** — don't fill every pixel
5. **CTA slide**: accent background, white text, single clear action
6. **Hook slide**: must be readable in <3 seconds
7. **Stat slide**: number is the hero, label is the supporting text
