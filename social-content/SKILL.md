# social-content — Content Creation Skill

Generate brand-aligned social media content for cybersecurity thought leadership.
Offline tool — not deployed, runs locally.

## When to load this skill

- User asks to create social media content (LinkedIn, Instagram, Twitter)
- User asks to generate carousels, threads, or posts
- User mentions TOFU/MOFU/BOFU content strategy
- User asks about content repurposing
- User asks to create content for cybersecurity audience

## Quick start

```bash
cd social-content
npm run generate          # generate all examples
npx ts-node src/cli.ts examples/tofu/01-mfa-myth.md   # single file
```

## Content spec format

Each `.md` file in `examples/` is a content spec with YAML frontmatter:

```markdown
---
slug: tofu-01-mfa-myth
title: 5 MFA Myths That Will Blow Your Mind
funnel: tofu # tofu | mofu | bofu
platform: linkedin # linkedin | instagram | twitter
format: carousel # carousel | thread | post | graphic
hook: contrarian # contrarian | data-shock | curiosity-gap | story | list | how-to | hot-take | question
persona: Junior SOC Analyst
hashtags: cybersecurity, MFA, security
cta: Follow for more myth-busting
---

Slide 1 headline.
Optional body text.

---

Slide 2 headline.

- Bullet 1
- Bullet 2
- Bullet 3

---

CTA: Final slide text.
```

## Output files per spec

| File                  | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| `*-carousel.html`     | Open in Chrome → Print to PDF → Upload to LinkedIn |
| `*-linkedin-post.md`  | Copy-paste LinkedIn caption                        |
| `*-ig-caption.md`     | Instagram caption with hashtags                    |
| `*-twitter-thread.md` | Thread text (each tweet ≤280 chars)                |
| `*-twitter-post.md`   | Single tweet                                       |
| `*-readme.md`         | Upload instructions + metadata                     |

## Funnel framework

| Stage | Goal          | Content types                              | Mix |
| ----- | ------------- | ------------------------------------------ | --- |
| TOFU  | Awareness     | Myth-busts, stats, hot takes, infographics | 60% |
| MOFU  | Consideration | Tool comparisons, how-tos, frameworks      | 30% |
| BOFU  | Decision      | Portfolio, hire-me, ROI, CTA               | 10% |

## Target personas

1. **Junior SOC Analyst** (0–2 yr) — skill roadmaps, career advice
2. **Detection Engineer** (3–7 yr) — deep technical, frameworks
3. **CISO** (15+ yr) — business cases, ROI
4. **Career Changer** (0 yr) — honest guidance, entry points

## Hook formulas

| Type          | Pattern                                        | Example                                  |
| ------------- | ---------------------------------------------- | ---------------------------------------- |
| contrarian    | "Everyone says X. They're wrong."              | "MFA won't save you."                    |
| data-shock    | "N% of [audience] don't know..."               | "80% of breaches use valid creds."       |
| curiosity-gap | "There's one thing [people] do differently..." | "The one detection rule you're missing." |
| story         | "Last week, I investigated..."                 | "At 3 AM, our SIEM lit up."              |
| list          | "N things every [role] should know..."         | "5 DFIR tools I can't live without."     |
| how-to        | "How to [achieve] in [timeframe]..."           | "Build a detection lab in 30 min."       |
| hot-take      | "Unpopular opinion: [statement]..."            | "Most pentests are theater."             |
| question      | "What would you do if [scenario]?"             | "You find C2 traffic at 2 AM."           |

## Brand tokens

- **Fonts**: Bricolage Grotesque (display), Hanken Grotesk (body), JetBrains Mono (code)
- **Primary**: brand-600 `#2c3ee5`
- **Severity**: critical `#e11d48`, high `#f43f5e`, medium `#f59e0b`, low `#10b981`, info `#0ea5e9`
- **Funnel colors**: TOFU=brand-600, MOFU=sky-500, BOFU=emerald-500

## Agent workflow

To generate a new content piece:

1. **Pick a topic** from the content calendar or user request
2. **Determine funnel stage** (TOFU/MOFU/BOFU)
3. **Choose hook type** (from the 8 patterns above)
4. **Write the spec** (YAML frontmatter + slides)
5. **Run the generator** (`npm run generate`)
6. **Preview** (open HTML in browser)
7. **Export** (Print to PDF for LinkedIn, screenshot for IG)

## Repurposing

One idea → 4 formats:

- LinkedIn carousel (HTML → PDF)
- Twitter thread (text)
- Instagram carousel (same HTML, screenshot slides)
- Blog post (expand slides into paragraphs)

Use `npx ts-node src/cli.ts` to generate all formats from one spec.

## File structure

```
social-content/
├── SKILL.md              # This file (opencode skill)
├── AGENTS.md             # Agent behavior rules
├── README.md             # User documentation
├── research/             # Platform specs, hooks, funnel, personas
├── brand/                # Brand tokens
├── prompts/              # Prompt templates for AI generation
├── src/                  # Generator source code
├── examples/             # Content specs (tofu/, mofu/, bofu/)
└── output/               # Generated files (gitignored)
```
