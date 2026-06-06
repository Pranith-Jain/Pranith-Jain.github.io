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

# Generate from a single spec
npx ts-node src/cli.ts examples/tofu/01-mfa-myth.md

# AI agent — topic → spec → output (one command)
npm run agent -- "MFA bypass techniques" --funnel tofu --hook contrarian

# Repurpose — one spec → all platforms
npm run repurpose examples/tofu/01-mfa-myth.md
```

Output goes to `output/`. Open the `-carousel.html` file in Chrome, print to PDF, upload to LinkedIn.

---

## How It Works

```
                          ┌─────────────┐
                          │  Topic/idea  │
                          └──────┬──────┘
                                 │
                          ┌──────▼──────┐
                          │   agent.ts   │  AI generates spec from topic
                          └──────┬──────┘
                                 │
                          ┌──────▼──────┐
                          │  .md spec    │  YAML frontmatter + slides
                          └──────┬──────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
             ┌──────▼──────┐ ┌──▼────┐ ┌─────▼─────┐
             │  cli.ts      │ │repo-  │ │  Manual   │
             │  (generate)  │ │purpose│ │  edit     │
             └──────┬──────┘ └──┬────┘ └─────┬─────┘
                    │           │            │
             ┌──────▼──────┐   │     ┌──────▼──────┐
             │  output/     │   │     │  examples/  │
             │  *.html      │   │     │  *.md       │
             │  *.md        │   │     └─────────────┘
             └─────────────┘   │
                          ┌────▼────────┐
                          │ All platforms│
                          │ LinkedIn    │
                          │ Instagram   │
                          │ Twitter     │
                          └─────────────┘
```

### Three ways to generate

1. **Manual**: Write a .md spec in `examples/`, run `npm run generate`
2. **Agent**: Run `npm run agent -- "topic"` — AI generates the spec and runs the generator
3. **Repurpose**: Run `npm run repurpose spec.md` — generates all platform variants from one spec

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
├── SKILL.md              # Opencode skill definition
├── AGENTS.md             # Agent behavior rules
├── README.md             # User documentation
├── research/             # Platform specs, hooks, funnel, personas
│   ├── carousel-specs.md
│   ├── hook-formulas.md
│   ├── funnel-framework.md
│   └── target-audience.md
├── brand/                # Brand tokens
│   └── tokens.md
├── prompts/              # AI prompt templates
│   └── templates.md
├── src/                  # Generator source code
│   ├── cli.ts            # CLI entry point
│   ├── agent.ts          # AI content agent
│   ├── repurpose.ts      # Cross-platform repurposer
│   ├── parser.ts         # Markdown frontmatter parser
│   ├── content-spec.ts   # Content type definitions
│   ├── brand.ts          # Brand tokens (TypeScript)
│   ├── carousel-renderer.ts
│   └── generators/
│       ├── linkedin.ts
│       ├── instagram.ts
│       └── twitter.ts
├── examples/             # Content specs
│   ├── tofu/             # Top of funnel
│   ├── mofu/             # Middle of funnel
│   └── bofu/             # Bottom of funnel
└── output/               # Generated files (gitignored)
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

Or use the agent:

```bash
npm run agent -- "your topic" --funnel tofu --hook contrarian
```

Or repurpose an existing spec:

```bash
npm run repurpose examples/tofu/01-mfa-myth.md
```

---

## AI Agent Workflow

The agent takes a topic and generates a full content spec:

```bash
npm run agent -- "Credential Stuffing Attacks" --funnel tofu --hook data-shock
```

Options:

- `--funnel` — tofu | mofu | bofu (default: tofu)
- `--platform` — linkedin | instagram | twitter (default: linkedin)
- `--format` — carousel | thread | post (default: carousel)
- `--persona` — target audience (default: Junior SOC Analyst)
- `--hook` — hook type (default: curiosity-gap)

The agent writes the spec to `examples/<funnel>/` and runs the generator.

---

## Prompt Templates

See `prompts/templates.md` for reusable AI prompts:

1. **Topic → Content Spec** — full pipeline prompt
2. **Hook Generator** — 10 hook options for any topic
3. **Slide Writer** — write individual slides
4. **Thread Writer** — convert carousel to thread
5. **Repurposer** — adapt content across platforms
6. **Content Calendar** — 4-week posting schedule
7. **Persona-Specific** — tailored for each audience
8. **Engagement Optimizer** — review and improve content

---

## Agent Rules

See `AGENTS.md` for content generation rules:

- Always: specific numbers, one idea per slide, actionable takeaways
- Never: generic quotes, walls of text, vendor marketing language
- Quality checklist: hook, CTA, format, persona verification

---

## Brand Colors

| Token             | Hex       | Usage             |
| ----------------- | --------- | ----------------- |
| brand-600         | `#2c3ee5` | Primary accent    |
| severity-critical | `#e11d48` | Critical findings |
| severity-info     | `#0ea5e9` | Informational     |

Fonts: Bricolage Grotesque (display), Hanken Grotesk (body), JetBrains Mono (code/stats)

See `brand/tokens.md` for the full palette.
