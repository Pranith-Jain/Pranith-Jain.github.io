# Prompt Templates — Content Generation

These prompts are used by AI agents to generate content specs.
Copy-paste into Claude/ChatGPT/Gemini and fill in the [BRACKETS].

---

## 1. Topic → Content Spec (Full Pipeline)

```
You are a cybersecurity thought leadership content strategist.

Create a [PLATFORM] [FORMAT] about [TOPIC].

Funnel stage: [TOFU/MOFU/BOFU]
Target persona: [Junior SOC Analyst / Detection Engineer / CISO / Career Changer]
Hook type: [contrarian / data-shock / curiosity-gap / story / list / how-to / hot-take / question]

Rules:
- Max 7 words in the hook headline
- One idea per slide, max 3 bullets per slide
- Use specific numbers, not vague claims
- Include actionable takeaways
- End with a clear CTA

Output as markdown with YAML frontmatter:

---
slug: [funnel]-[number]-[short-topic]
title: [Compelling title]
funnel: [tofu/mofu/bofu]
platform: [linkedin/instagram/twitter]
format: [carousel/thread/post]
hook: [hook-type]
persona: [persona]
hashtags: [tag1, tag2, tag3]
cta: [Single clear action]
---
[Hook slide headline]
[Optional body]
---
[Slide 2 headline]
- [Bullet 1]
- [Bullet 2]
- [Bullet 3]
---
[Continue for 5-8 slides]
---
CTA: [Final CTA text]
```

---

## 2. Hook Generator

```
Generate 10 hook options for a cybersecurity [FORMAT] about [TOPIC].

Hook types to try:
1. Contrarian — "Everyone says X. They're wrong."
2. Data shock — "N% of [audience] don't know..."
3. Curiosity gap — "There's one thing [people] do differently..."
4. Story — "Last week, I [experienced]..."
5. List — "N things every [role] should know..."
6. How-to — "How to [achieve] in [timeframe]..."
7. Hot take — "Unpopular opinion: [statement]..."
8. Question — "What would you do if [scenario]?"

For each hook, provide:
- The hook text (max 7 words)
- The hook type
- Why it would stop the scroll
- A 1-sentence preview of what the content covers

Target audience: [Junior SOC Analyst / Detection Engineer / CISO]
```

---

## 3. Slide Writer

```
You are writing slides for a LinkedIn carousel about [TOPIC].

Slide [N] of [TOTAL]:
Topic: [SPECIFIC POINT]
Hook type: [TYPE]

Rules:
- Headline: max 7 words, large and bold
- Body: max 3 bullets, each ≤15 words
- Use specific numbers or examples
- Make it scannable in <5 seconds

Output:
[Headline]
- [Bullet 1]
- [Bullet 2]
- [Bullet 3]
```

---

## 4. Thread Writer

```
Convert this carousel into a Twitter/X thread (each tweet ≤280 chars):

[CAROUSEL CONTENT]

Rules:
- Tweet 1: Hook (must be standalone valuable)
- Tweet 2: Context (why this matters)
- Tweets 3–N: One point per tweet
- Last tweet: CTA + hashtags
- Each tweet separated by blank line
- Max 12 tweets total
```

---

## 5. Repurposer

```
Repurpose this [ORIGINAL FORMAT] into [TARGET FORMAT]:

[ORIGINAL CONTENT]

Target platform: [LinkedIn / Instagram / Twitter]
Target format: [Carousel / Thread / Post / Reel script]

Rules:
- Adapt tone to platform (LinkedIn=professional, IG=visual, Twitter=concise)
- Preserve the core message
- Adjust slide count for platform limits (IG max 10, LinkedIn max 30)
- Add platform-specific hashtags
```

---

## 6. Content Calendar Generator

```
Generate a 4-week content calendar for a cybersecurity thought leader.

Target audience: [Junior SOC Analyst / Detection Engineer / CISO]
Posting frequency: [3-5 posts/week]
Platforms: [LinkedIn, Twitter, Instagram]

Funnel mix:
- 60% TOFU (awareness — myths, stats, hot takes)
- 30% MOFU (consideration — how-tos, comparisons, frameworks)
- 10% BOFU (decision — portfolio, hire-me, CTA)

Output as a table:
| Week | Day | Type | Funnel | Platform | Topic | Hook |
```

---

## 7. Persona-Specific Content

### For Junior SOC Analysts

```
Create a [FORMAT] that helps junior SOC analysts with [SPECIFIC PAIN POINT].

Pain points to address:
- Alert fatigue and triage overwhelm
- Imposter syndrome
- Unclear career path (SOC → what?)
- Which skills to learn next

Tone: Encouraging but honest. No toxic positivity.
Include: Specific tools, frameworks, and next steps.
```

### For Detection Engineers

```
Create a [FORMAT] about [DETECTION TOPIC] for mid-level detection engineers.

Requirements:
- Reference MITRE ATT&CK techniques by ID
- Include Sigma/YARA rule snippets
- Cover both Windows and Linux
- Explain the "why" behind the detection

Tone: Technical but accessible. Assume 3-5 years experience.
```

### For CISOs

```
Create a [FORMAT] about [SECURITY TOPIC] for CISOs and security directors.

Requirements:
- Use business-case language (ROI, risk, cost)
- Include industry benchmarks
- Reference frameworks (NIST, ISO 27001, MITRE)
- Quantify impact in dollars or percentages

Tone: Strategic, not tactical. Board-ready language.
```

---

## 8. Engagement Optimizer

```
Review this [FORMAT] and suggest improvements for engagement:

[CONTENT]

Check:
1. Does the hook stop the scroll in <3 seconds?
2. Is there a clear CTA?
3. Are there specific numbers (not vague)?
4. Is it scannable (one idea per slide)?
5. Would you save this post? Why/why not?
6. What's the weakest slide? How to fix it?
7. Suggest 3 alternative hooks.
```
