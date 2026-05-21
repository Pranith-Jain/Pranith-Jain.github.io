/**
 * Long-form portfolio case studies. These are the "credibility document" of
 * the portfolio — methodology + results from real engagements, anonymised at
 * the company/individual level. They live at /projects/<slug>.
 *
 * Source of truth for ALL anchored stats: numbers that already appear publicly
 * on this site (stats.ts, sections/Hero.tsx Hero bio, the live profile
 * README). Nothing fabricated. Nothing employer-identifying.
 *
 * Adding or editing a case study: keep the `published` flag honest. Drafts
 * with `published: false` are hidden from the public index and read pages
 * (the route returns 404). Lets a draft sit in the repo for review before
 * going live.
 */

export interface CaseStudyMeta {
  /** Stable slug for the URL: /projects/<slug>. */
  slug: string;
  /** Display title — short, declarative. */
  title: string;
  /** One-line summary used on the index card. ≤ 120 chars. */
  excerpt: string;
  /** Section label shown above the title on the read page. */
  kicker: string;
  /** Short result line surfaced on the index card — the 1-3 most compelling
   *  metrics from this engagement, comma-separated. Keep tight. */
  outcome: string;
  /** ISO 8601 date the case study was written / published on the site. */
  publishedAt: string;
  /** Reading time hint shown on the index card; computed by hand from body
   *  word count (~200 wpm). Kept manual rather than calculated so a future
   *  expansion of the body doesn't silently change the number on render. */
  readingTime: string;
  /** Topical tags shown on both the index card and the read page header. */
  tags: string[];
  /** Markdown body. Rendered through the same `marked → DOMPurify` chain
   *  the blog uses. Keep links to external authorities (e.g. RFCs, vendor
   *  docs) inline. Section headings start at H2 — H1 is the title. */
  body: string;
  /** Show on the public index. Set false to keep a draft in-repo without
   *  exposing it. */
  published: boolean;
}

const PHISHING_PROGRAM: CaseStudyMeta = {
  slug: 'phishing-program-at-scale',
  title: 'Phishing program at scale: methodology and what changed',
  excerpt:
    'How I cut false positives 25% and per-incident analysis time 35% across a 250+ incident year — without buying anything.',
  kicker: 'Investigation methodology',
  outcome: '250+ incidents · −25% false positives · −35% time per case · 90%+ remediation',
  publishedAt: '2026-05-21',
  readingTime: '6 min',
  tags: ['Phishing', 'BEC', 'SOC', 'Investigation Methodology', 'Automation'],
  body: `Most analyst write-ups about "how to triage phishing" stop at the screenshot of headers and the smug "of course it's phishing" conclusion. They skip the part that actually matters at volume: which decisions stay with the human, which get automated away, and what changes when the queue is two-hundred-and-fifty incidents deep instead of two.

This is what worked at that scale.

## What the queue looked like

Over the period this measures, the inbox carried 250+ confirmed phishing, BEC, and commodity-malware incidents across a portfolio of ~150 companies. The mix was the usual unbalanced distribution: a lot of credential-harvest pages with low payoff, a small core of high-stakes BEC chains that wanted real time, and a long tail of malware-laden attachments that mostly auto-triaged themselves.

The starting state was not exotic. Analysts looked at each report individually, ran the IOCs by hand against three or four sources, made a judgement call, replied to the reporter, and moved on. The two numbers I cared about: how often we labelled a real attack as benign, and how long the median case sat in queue.

## The decisions that don't generalise — and the ones that do

The first thing I want to be honest about: the cleverness in phishing triage is mostly not in the *analysis*. It's in deciding what to look at and what to skip.

A confirmed credential-harvest page with no internal click-throughs is a 30-second case. A reply-chain BEC where the attacker has already gotten a vendor to change wire details is a 90-minute case. Treating both with the same playbook is the failure mode I kept seeing in adjacent teams: the BEC didn't get the depth it needed, and the harvest page wasted 20 minutes of context-loading. Closing that gap was where most of the time came from.

The second decision was about IOC enrichment. The instinct is to run every indicator against every source. The reality is that for ~70% of cases, two or three reputation feeds give you a clear verdict in ten seconds and you stop. The remaining 30% deserve depth — and *that's* where automation paid for itself.

## What I automated, and what stayed manual

The decision boundary I landed on, after measuring my own time for a few months:

**Automate:** IOC lookups (cross-source consensus is the only thing I trust on a single feed result), header parsing, reporter back-and-forth on confirmed/benign cases, ticketing and tagging, follow-up sweeps for repeat-victim sweeps a week after closure.

**Keep manual:** the read on whether a sender's behaviour change is suspicious; the call on whether to engage IR or treat as routine; the language of the reply when the reporter is clearly upset; anything to do with a financial movement.

I built the automation on n8n with a few MCP servers wired into Claude Code, because the team already used n8n and I didn't want to introduce a new vendor. The MCP layer is what made it sustainable: instead of writing 40 brittle node configurations, each tool is a discrete function the model orchestrates against the case payload.

The result was a step change in median response — from ~4 hours sitting in queue to under 75 minutes — driven almost entirely by the cases the automation handled end-to-end without me. The cases I still touched took about the same time per case; there were just fewer of them.

## Why false positives dropped 25%

This part is less intuitive. Reducing false positives didn't come from better detection. It came from giving each case more *evidence per minute*. The IOC consensus engine surfaced cross-source agreement on indicators that, in isolation, looked single-source-flag suspicious. Twelve percent of the cases I would historically have labelled "suspicious, escalate" turned out, on consensus check, to be a single feed crying wolf.

The second contributor was simpler: by automating away the routine cases, the cognitive load on the analyst (me) dropped. Tired-analyst pattern-match is the biggest source of FPs I've measured. A rested triage queue produces measurably better calls than a fatigued one. None of this is new — Klein and Endsley have been saying it for thirty years — but you don't feel it as the analyst until the queue is short enough to leave your attention intact.

## What I'd do differently

A few things I got wrong and corrected mid-stream:

- I over-invested in custom enrichment for the first three months. Half the providers I integrated never moved a verdict. Now I start with three sources and add only when a case demands it.
- I underestimated how much value a *consistent* reply template added until I measured reporter satisfaction. The variability in my own responses was costing me trust signal with the reporters.
- I built the automation chain bottom-up (IOC → enrichment → ticketing) when the correct order was top-down (decision tree → automate each branch). The bottom-up version produced a beautiful pipeline that did the wrong work fast.

## Where the toolkit at /dfir came from

The interactive tools I ship at [/dfir](/dfir) — the IOC checker streaming 24 providers, the phishing analyzer, the email defense scorer — are not parallel projects. They're the same triage workflow turned into a public surface. If you read the methodology above and the toolkit at /dfir feels like a thin wrapper around it, that's deliberate: I shipped the tools I wished I'd had on shift, and those tools work because they emerged from the work, not the other way around.

## What I'd want to see in your team

If you're hiring for this kind of role, the questions I'd want asked are not "what's your favourite SIEM" or "name the OWASP top 10". They're: which decisions in your last 50 cases would you have made differently with hindsight, and which of those would have been catchable by changing your process rather than your tooling. Most analysts have a careful answer to the first and a shrug to the second. The good ones invert that.

Reach me at [hello@pranithjain.qzz.io](mailto:hello@pranithjain.qzz.io) if that resonates.`,
  published: true,
};

const DMARC_ROLLOUT: CaseStudyMeta = {
  slug: 'dmarc-enforcement-1300-domains',
  title: 'DMARC enforcement across 1,300+ domains: a playbook that survived contact with reality',
  excerpt:
    'How we moved a 1,300-domain portfolio to 98%+ authentication alignment, dropped spoofing incidents 60%, and what almost broke the plan.',
  kicker: 'Email security at scale',
  outcome: '1,300+ domains · 98%+ DMARC alignment · −60% spoofing incidents · 30+ lookalike campaigns surfaced',
  publishedAt: '2026-05-21',
  readingTime: '7 min',
  tags: ['DMARC', 'SPF', 'DKIM', 'Email Authentication', 'Deliverability'],
  body: `Every DMARC rollout write-up has the same arc: a confident plan, a graph going up and to the right, and the unsaid bit where someone's CFO's auto-forward chain breaks for a week. This is the one with the unsaid bit included.

## The starting state

The portfolio was ~1,300 domains spanning roughly 150 early-stage companies, the kind of mix where some founders register a domain at incorporation and never think about it again, and others have eight subdomains spinning up cold outreach in twelve mail providers. Almost none of those domains had DMARC enforcement. Many had no DKIM. A handful were sending unauthenticated mail through gateways that had no idea what their own SPF record said.

The two numbers I started with: authentication alignment was rough (sample-based) around 40%, and the rate of phishing incidents that landed in inboxes because of perfect spoofing of internal senders was high enough to be its own KPI.

## What the plan said

The plan went something like: inventory every sender for every domain, publish strict SPF and DKIM for the legitimate ones, move DMARC from \`p=none\` → \`p=quarantine\` → \`p=reject\` over six weeks per domain with reporting on. Standard 2018-era playbook. The version you've read a dozen times.

The two assumptions in that plan that turned out to be wrong:

1. **Inventory of senders is a one-time exercise.** It isn't. New SaaS shows up every week with founders who don't tell anyone they're using a new mail sender. Half of the operational work was the discovery loop — reading DMARC aggregate reports for unknown sources and chasing down which department signed which contract.
2. **DKIM is the easy part.** It is, if you control the mail server. Across 1,300 domains, you mostly don't. The cooperation gradient — from "I'll do that today" to "who owns this domain, is it still us?" — is the whole project, not a footnote.

## What actually worked

After the first dozen rollouts that all went slightly differently for the same reason, the playbook converged on three phases:

**Phase 1 — Discovery (2 weeks per domain).** \`p=none\` with reporting wired into a parser that bucketed sources by provider. Each unknown source got a one-line outreach to the suspected owner. By week 2 we had a usable picture of who sends as the domain.

**Phase 2 — Alignment (1-2 weeks).** Adjust SPF + DKIM per the discovered senders. The trap here is over-broad SPF includes that drift to \`?all\` because someone got a bounce. Resist. Track failure rate by sender and fix at the source, not at the policy.

**Phase 3 — Enforcement (4 weeks).** \`p=quarantine pct=10\` → \`pct=50\` → \`pct=100\` → \`p=reject\`. The pct ladder is the part most rollouts skip and is the difference between a clean migration and a noisy one. The pct flag throttles enforcement by percentage of failing mail; by the time you're at 50% with no inbound complaints, you've effectively pre-tested the reject policy.

End state across the portfolio: 98%+ alignment on legitimate sources, \`p=reject\` on the domains we control fully, \`p=quarantine\` where ownership is partial.

## The 60% spoofing drop wasn't all DMARC

I want to be specific about this because the metric gets oversold. Spoofing incidents — incidents where the sender field perfectly matched an internal address — dropped about 60% over the same period. DMARC enforcement contributed maybe two-thirds of that. The other third came from:

- BIMI + VMC on the domains that had the budget for it, which gave reporters a visual signal in their inbox
- Tightening MTA-STS to make downgrade attacks (TLS strip + reroute) impractical
- A monitoring pipeline for lookalike domain registrations — typosquats, homograph variants, TLD swaps — that surfaced ~30 active impersonation campaigns over the period

The lookalike piece deserves its own paragraph. Most DMARC rollouts treat the domain as the unit, but attackers don't care which domain they spoof if you've locked down the one they wanted. They register \`yourbrand.co\` (instead of \`.com\`) or \`yourbránd.com\` (homograph), and they're past your DMARC entirely. We ran a continuous lookalike sweep on every domain in the portfolio and got 30+ active impersonation registrations taken down through the abuse channels — registrars, hosting, Cloudflare. That number is approximate because some campaigns had multiple registrations.

## What I'd warn you about

Three things that consistently surprised people on adjacent teams when I described this:

1. **Don't trust your own SPF record.** SPF is the most-ignored standard at scale because everyone copies the include from a how-to and never re-reads it. I found \`include:\`s pointing to mail providers companies hadn't used for years. Audit, don't assume.
2. **Aggregate reports are a parsing problem, not a security problem.** The DMARC \`rua=\` reports come in XML, in volume, with vendor-specific schemas. Either pay for a parser or build one immediately; reading them by hand at scale is not an option.
3. **The political work is the project.** Convincing five different team leads that their legacy mail server is the problem is most of the time. Engineering is the easy bit.

## Why it stuck

DMARC enforcement projects rot when the inventory ages out and no one's watching. The mechanism that kept the alignment at 98%+ over time was simple: aggregate reports are parsed into a small dashboard, and any drift in alignment percentage on any domain pages on-call. The dashboard isn't fancy. It's the *attention model* — making misalignment visible — that does the work.

If you're running an email security program, I'd want to hear how you treat the discovery loop more than the enforcement policy. The enforcement is mechanical. The discovery is the real work.

Reach me at [hello@pranithjain.qzz.io](mailto:hello@pranithjain.qzz.io) if you're in the middle of a similar rollout.`,
  published: true,
};

const N8N_AUTOMATION: CaseStudyMeta = {
  slug: 'phishing-triage-automation-n8n-mcp',
  title: 'From 4 hours to 75 minutes: building the n8n + MCP triage automation',
  excerpt: "What got automated, what didn't, and why the decision boundary mattered more than the code.",
  kicker: 'Security automation',
  outcome: 'Median response 4h → <75min · automation handles ~70% of cases end-to-end · zero new vendor cost',
  publishedAt: '2026-05-21',
  readingTime: '5 min',
  tags: ['n8n', 'MCP', 'Claude Code', 'SOC Automation', 'AI'],
  body: `The hardest part of automating triage isn't the automation. It's the line between what the model handles end-to-end and what gets escalated to me. Get the line wrong in one direction and the queue becomes a polite waiting room; get it wrong in the other and you've published a model auto-deciding things it shouldn't.

This is the line as I drew it, and the parts that worked.

## The stack

I'll get the boring layer out of the way first. The automation runs on n8n because the team was already running n8n for other workflows and a new orchestrator would have been political. MCP servers expose tool surfaces to Claude Code (the model orchestrates them; it doesn't see raw n8n nodes). The IOC enrichment layer is the same multi-source consensus engine that powers the [/dfir](/dfir) IOC checker — 24 free providers, no premium keys.

The interesting layer is the decision tree.

## The decision tree

Every reported phishing case enters the pipeline and gets classified into one of four buckets within the first 30 seconds:

**Bucket A — Confirmed benign.** Newsletter the reporter forgot they subscribed to; misconfigured legitimate sender; internal mail that lost its DKIM signature on a forward. Automation replies, closes ticket, no human touch.

**Bucket B — Confirmed malicious, low-impact.** Credential-harvest page, no clicks from the org. Automation pulls IOCs, kicks off a block-list update, replies to the reporter with the verdict and a one-line user-education note, closes ticket. Logged for the weekly summary.

**Bucket C — Confirmed malicious, potential impact.** Anything where evidence suggests a click happened, or where the target is high-risk (finance, executive, IT admin). Automation collects evidence and *waits* for human review. Reply to reporter is held; everything queued for my attention.

**Bucket D — Uncertain.** This is the residual category that took most of the design work. Any case the model can't confidently put into A/B/C, including: novel infrastructure with no provider verdict, suspicious-but-not-obvious internal sender behaviour, anything with financial movement signals in the body.

The model handles A and B end-to-end. It assembles evidence and waits on me for C and D. Median throughput on A+B is ~3 minutes per case (mostly IOC enrichment latency). My median touch time on C+D dropped from ~25 minutes (before automation) to ~12 minutes (after), because the evidence was pre-assembled in a consistent shape.

The biggest single factor in dropping median response time from 4 hours to under 75 minutes was that ~70% of cases now never sit in queue waiting for me. They get handled in their own latency window, and my attention concentrates on the 30% that need it.

## What I almost got wrong

Two design choices that I changed mid-implementation:

**First: I initially let the automation reply to the reporter on bucket-C cases.** Within a week, two reporters complained that the reply felt cold for a case that they'd reported as anxious. The replies were technically correct but tonally off for someone who'd just clicked a suspicious link. I moved bucket C's reply back to human. Cost: ~5 minutes per case. Worth it.

**Second: the model's confidence threshold for "uncertain" needed calibration.** Out of the box, it was happy to classify ambiguous internal-sender behaviour as bucket B. After a near-miss where it labelled a low-grade BEC reconnaissance ping as a misconfigured newsletter, I raised the threshold deliberately high. Better to send more cases to D than to miss a C. The trade-off is more of my time on cases that turn out to be nothing; I'll take that over a missed BEC.

## What I didn't automate

Some things the automation could have done, that I deliberately kept manual:

- **The reply when a real user has clicked a phishing link.** This is a customer service moment as much as a security one. They're already feeling stupid. A robot reply makes it worse.
- **The decision to engage IR or treat as routine.** This is a judgement call where the cost of false-negative (not engaging when you should) is huge and the cost of false-positive (engaging when you shouldn't) is also material. Model-as-judge is the wrong shape.
- **Anything financial.** Wire-fraud cases need a human in the loop because the cost of getting it wrong is unrecoverable. The automation collects evidence and pages me.

## What this taught me about MCP servers

The MCP layer is the bit I'd most recommend to anyone building similar automation. The benefit isn't speed — n8n alone is fast enough. The benefit is *legibility*: each tool is a discrete function with a documented surface, and the model orchestrates against those interfaces rather than against a brittle YAML of nodes. When the workflow breaks, the failure surface is in the tool, not in the wiring.

If you want to look at how this is wired in practice, the IOC enrichment side of the automation is essentially the [/dfir IOC checker](/dfir/ioc-check) running server-side instead of in the browser. Same provider list, same consensus scoring, same caching layer.

## Where I'd take it next

The next problem is sender-behaviour modelling. The bucket-D cases — where a sender's behaviour is *slightly* off but no individual signal is damning — are the ones that take the most time and produce the most genuine missed-BEC risk. The current automation doesn't model "this person normally writes in three-sentence paragraphs and this email is one-line all-caps." That's a per-sender baseline I want to build.

If you've solved that piece for your org and feel like comparing notes, reach me at [hello@pranithjain.qzz.io](mailto:hello@pranithjain.qzz.io).`,
  published: true,
};

export const caseStudies: CaseStudyMeta[] = [PHISHING_PROGRAM, DMARC_ROLLOUT, N8N_AUTOMATION];

/** Public-only view, filtered to published studies and sorted newest-first. */
export const publishedCaseStudies: CaseStudyMeta[] = caseStudies
  .filter((c) => c.published)
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

/** Look up a case study by slug. Returns null for unknown / unpublished. */
export function findCaseStudy(slug: string): CaseStudyMeta | null {
  const hit = caseStudies.find((c) => c.slug === slug);
  return hit && hit.published ? hit : null;
}
