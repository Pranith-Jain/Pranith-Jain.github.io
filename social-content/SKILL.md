# social-content — Content Creation Skill

Generate brand-aligned social media content for cybersecurity thought leadership.
Offline tool — not deployed, runs locally.

## When to load this skill

- User asks to create social media content (LinkedIn, Instagram, Twitter)
- User asks to generate carousels, threads, or posts
- User mentions TOFU/MOFU/BOFU content strategy
- User asks about content repurposing
- User asks to create content for cybersecurity audience
- User asks to fix or improve the carousel design

## Quick start

```bash
cd social-content
npm run generate          # generate all examples
npx ts-node src/cli.ts examples/tofu/01-mfa-myth.md   # single file
npm run agent -- "topic" --funnel tofu --hook data-shock   # generate from topic
npm run repurpose examples/tofu/02-80-percent-stat.md   # one spec → all platforms
```

## Design system v2 — restraint first

**3 base kinds** (FranciscoMoretti/carousel-generator pattern):

| Kind      | Role        | Background                   | Chrome elements                             |
| --------- | ----------- | ---------------------------- | ------------------------------------------- |
| `hook`    | Slide 1     | Dark gradient (slate→accent) | Brand mark, slide indicator                 |
| `content` | Body slides | White                        | Slide indicator only                        |
| `cta`     | Last slide  | Dark gradient (accent→slate) | Brand mark, slide indicator, big CTA button |

**4 content variants** (auto-detected from slide content):

| Variant     | Trigger               | Visual                                |
| ----------- | --------------------- | ------------------------------------- |
| `stat`      | `stat:` field present | 280px number + 32px label, centered   |
| `list`      | 3–5 bullets           | Numbered cards, 48px badges, vertical |
| `framework` | 4 or 6 bullets        | 2×2 or 3×2 grid, step cards           |
| `quote`     | `body` > 100 chars    | Dark bg, big pull-quote, brand mark   |

**Chrome budget: 3 elements max per slide.** Body slides have ONLY the slide indicator. No noise, no blobs, no dashed circles, no watermarks, no accent bars, no grid patterns. **Restraint amplifies the data.**

## Content spec format

Each `.md` file in `examples/` is a content spec with YAML frontmatter + slides separated by `---`.

```markdown
---
slug: tofu-01-mfa-myth
title: 4 MFA Myths That Get You Owned
funnel: tofu # tofu | mofu | bofu
platform: linkedin # linkedin | instagram | twitter
format: carousel # carousel | thread | post | graphic
hook: contrarian # contrarian | data-shock | curiosity-gap | story | list | how-to | hot-take | question
persona: Junior SOC Analyst
hashtags: cybersecurity, MFA, security
cta: Save this. I'll send the detection queries next week.
---

Hook headline. # 1st slide, auto-detected as `hook`
Optional body line.

---

KIND: stat
STAT: 80%|of breaches involve valid credentials.

# 2nd slide, stat layout with 280px number

---

KIND: list
Headline.

- Bullet 1
- Bullet 2
- Bullet 3

# 3rd slide, numbered list layout

---

KIND: framework
Headline.

- Step card 1
- Step card 2
- Step card 3
- Step card 4

# 4th slide, 2x2 framework grid

---

CTA: Save this.

# Last slide, auto-detected as `cta`
```

### Slide directives

| Directive                | Effect                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `KIND: <name>`           | Override auto-detection (`hook`, `content`, `cta`, `stat`, `list`, `framework`, `quote`) |
| `STAT: <value>\|<label>` | Stat data: huge number + supporting label                                                |
| `CTA: <text>`            | Mark slide as CTA (also auto-detected if last)                                           |
| `-` or `*` or `→`        | Bullet points (3–5 = list, 4 or 6 = framework)                                           |

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

Funnel colors:

- **TOFU** = brand-600 `#2c3ee5` (primary)
- **MOFU** = sky-500 `#0ea5e9`
- **BOFU** = emerald-500 `#10b981`

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

## Design principles (in priority order)

1. **Restraint > decoration**. Every visual element must earn its place. Body slides have 1 chrome element. Hook/CTA may have 2–3.
2. **One idea per slide**. If you have 2 ideas, split into 2 slides.
3. **Specific numbers > vague claims**. "80%" beats "most". Cite sources.
4. **Actionable > awareness**. Each slide tells the reader what to DO.
5. **Real tools, real techniques**. Reference Evilginx, Splunk, MITRE T1059, Sigma, etc.
6. **Honest > vendor marketing**. No "hope everyone is having a great day" energy.
7. **Whitespace > density**. Outer padding 96–120px. Between-element gap 24–56px.
8. **Type hierarchy is the design**. Display font for headlines, body for content, mono for chrome.

## Agent workflow

To generate a new content piece:

1. **Pick a topic** from the content calendar or user request
2. **Determine funnel stage** (TOFU/MOFU/BOFU)
3. **Choose hook type** (from the 8 patterns above)
4. **Write the spec** (YAML frontmatter + slides, with `KIND:` directives where needed)
5. **Run the generator** (`npm run generate` or `npm run agent`)
6. **Preview** (open HTML in browser)
7. **Export** (Print to PDF for LinkedIn, screenshot for IG)

## Repurposing

One spec → multiple platforms:

- LinkedIn carousel (HTML → PDF)
- Twitter thread (text, each tweet ≤280 chars)
- Instagram carousel (same HTML, screenshot slides)
- LinkedIn post (long-form caption)

Use `npm run repurpose <spec.md>` to convert a LinkedIn spec to IG + Twitter variants.

## File structure

```
social-content/
├── SKILL.md              # This file (opencode skill)
├── AGENTS.md             # Agent behavior rules + design system
├── README.md             # User documentation
├── research/             # Platform specs, hooks, funnel, personas
├── brand/                # Brand tokens
├── prompts/              # Prompt templates for AI generation
├── src/                  # Generator source code
├── examples/             # Content specs (tofu/, mofu/, bofu/)
└── output/               # Generated files (gitignored)
```

## Reviewing changes

After editing files in `social-content/`, invoke the `social-content-reviewer` agent to audit the design + content quality. The agent is at `.claude/agents/social-content-reviewer.md` (read-only).
