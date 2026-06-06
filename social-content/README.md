# social-content

Offline content generator for LinkedIn carousels, Instagram posts, and Twitter/X threads.
Brand-aligned, funnel-mapped, cybersecurity thought leadership.

**Not deployed. Not a web app.** This is an offline tool that generates HTML files you open in a browser, screenshot or print to PDF, and upload to social platforms.

---

## Quick Start

```bash
cd social-content
npm install
npm run generate          # generate all examples
npm run generate:all      # same as above
npx ts-node src/cli.ts examples/tofu/01-mfa-myth.md   # single file
```

Output goes to `output/`. Open the `-carousel.html` file in Chrome, print to PDF, upload to LinkedIn.

---

## How It Works

```
examples/*.md  →  parser  →  ContentSpec  →  generators  →  output/
                                                          ├── *-carousel.html
                                                          ├── *-linkedin-post.md
                                                          ├── *-ig-caption.md
                                                          ├── *-twitter-thread.md
                                                          ├── *-twitter-post.md
                                                          └── *-readme.md
```

1. **Write** a content spec in `examples/` (markdown with YAML frontmatter)
2. **Run** `npm run generate`
3. **Open** the HTML carousel in Chrome
4. **Print** to PDF (Ctrl+P → Save as PDF)
5. **Upload** the PDF to LinkedIn as a carousel post
6. **Copy** the post caption from the `-linkedin-post.md` file

---

## Content Specs

Each `.md` file in `examples/` is a content spec. Format:

```markdown
---
slug: tofu-01-mfa-myth
title: 5 MFA Myths That Will Blow Your Mind
funnel: tofu # tofu | mofu | bofu
platform: linkedin # linkedin | instagram | twitter
format: carousel # carousel | thread | post | graphic | reel
hook: contrarian # contrarian | data-shock | curiosity-gap | story | list | how-to | hot-take | question
persona: Junior SOC Analyst
hashtags: cybersecurity, MFA, security
cta: Follow for more myth-busting
---

MFA Won't Save You.
Here are 5 myths most security pros still believe.

---

Myth 1: MFA = Unbreakable

- MFA stops 99% of automated attacks
- But targeted attacks bypass MFA in minutes
- SIM swapping, prompt bombing, real-time phishing

---
```

Slides are separated by `---`. First line of each slide = headline. Lines starting with `-` = bullets.

---

## Funnel Framework

| Stage    | Goal          | Content Types                                       | Mix |
| -------- | ------------- | --------------------------------------------------- | --- |
| **TOFU** | Awareness     | Myth-busts, stats, hot takes, infographics          | 60% |
| **MOFU** | Consideration | Tool comparisons, how-tos, frameworks, case studies | 30% |
| **BOFU** | Decision      | Portfolio showcase, hire-me, ROI posts, CTA         | 10% |

See `research/funnel-framework.md` for the full framework.

---

## Target Audience

| Persona            | Age | Experience | Content They Want                                       |
| ------------------ | --- | ---------- | ------------------------------------------------------- |
| Junior SOC Analyst | 24  | 0–2 years  | Skill roadmaps, career advice, tool tutorials           |
| Detection Engineer | 30  | 3–7 years  | Deep technical content, frameworks, real-world examples |
| CISO               | 42  | 15+ years  | Business cases, ROI, industry benchmarks                |
| Career Changer     | 28  | 0 years    | Honest guidance, clear entry points, encouragement      |

80% of content targets junior/mid practitioners. See `research/target-audience.md`.

---

## Folder Structure

```
social-content/
├── package.json
├── tsconfig.json
├── README.md
├── research/                    # Research documents
│   ├── carousel-specs.md        # Platform specs & best practices
│   ├── hook-formulas.md         # 8 hook patterns with examples
│   ├── funnel-framework.md      # TOFU/MOFU/BOFU mapping
│   └── target-audience.md       # Audience personas
├── brand/                       # Brand tokens
│   └── tokens.md                # Colors, fonts, layout rules
├── src/                         # Generator source code
│   ├── cli.ts                   # CLI entry point
│   ├── parser.ts                # Markdown frontmatter parser
│   ├── content-spec.ts          # Content type definitions
│   ├── brand.ts                 # Brand tokens (TypeScript)
│   ├── carousel-renderer.ts     # HTML carousel renderer
│   └── generators/
│       ├── linkedin.ts          # LinkedIn post + carousel
│       ├── instagram.ts         # Instagram caption + carousel
│       └── twitter.ts           # Twitter thread + post
├── examples/                    # Content specs
│   ├── tofu/
│   │   ├── 01-mfa-myth.md       # Contrarian myth-bust
│   │   ├── 02-80-percent-stat.md # Data shock
│   │   └── 03-infostealer-rise.md # Hot take thread
│   ├── mofu/
│   │   ├── 01-siem-vs-edr.md    # Tool comparison
│   │   └── 02-mitre-attck-t1059.md # Detection tutorial
│   └── bofu/
│       ├── 01-portfolio-showcase.md # Project showcase
│       └── 02-hire-me.md         # Hire-me CTA
└── output/                      # Generated files (gitignored)
```

---

## Platform Specs

### LinkedIn Carousel

- **Dimensions**: 1080 × 1350 px (4:5 portrait)
- **Format**: PDF (each page = one slide)
- **Max slides**: 30 (sweet spot: 7–12)
- **Font min**: 24pt body, 36pt headline

### Instagram Carousel

- **Dimensions**: 1080 × 1350 px (4:5 portrait)
- **Format**: PNG per slide
- **Max slides**: 10

### Twitter/X Thread

- **Character limit**: 280 per tweet
- **Thread length**: 5–12 tweets
- **Hook tweet**: Must be standalone valuable

See `research/carousel-specs.md` for full specs.

---

## Adding New Content

1. Create a new `.md` file in `examples/<funnel>/`
2. Write YAML frontmatter + slides
3. Run `npm run generate`
4. Open the HTML in Chrome, print to PDF
5. Upload to the platform

---

## Brand Colors

| Token             | Hex       | Usage             |
| ----------------- | --------- | ----------------- |
| brand-600         | `#2c3ee5` | Primary accent    |
| severity-critical | `#e11d48` | Critical findings |
| severity-info     | `#0ea5e9` | Informational     |

Fonts: Bricolage Grotesque (display), Hanken Grotesk (body), JetBrains Mono (code/stats)

See `brand/tokens.md` for the full palette.
