/**
 * Long-form portfolio case studies. These are the "credibility document"
 * of the portfolio: methodology and results from real engagements,
 * anonymised at the company/individual level. They live at
 * /projects/<slug>.
 *
 * Source of truth for ALL anchored stats: numbers that already appear
 * publicly on this site (stats.ts, the Hero bio, the live profile
 * README). Nothing fabricated. Nothing employer-identifying.
 *
 * Voice rules: written by hand, no AI tells. No em-dashes (commas,
 * periods, semicolons, or parens instead). No "leverage", "robust",
 * "comprehensive", "essential", "critical". No "let's dive in",
 * "it's worth noting", "in conclusion". Contractions are fine.
 * Specific numbers beat generic claims.
 *
 * Adding or editing a case study: keep the `published` flag honest.
 * Drafts with `published: false` are hidden from the public index and
 * read pages (the route returns 404). Lets a draft sit in the repo for
 * review before going live.
 */

export interface CaseStudyMeta {
  /** Stable slug for the URL: /projects/<slug>. */
  slug: string;
  /** Display title, short and declarative. */
  title: string;
  /** One-line summary used on the index card. Keep under 120 chars. */
  excerpt: string;
  /** Section label shown above the title on the read page. */
  kicker: string;
  /** Short result line surfaced on the index card: the 1-3 most
   *  compelling metrics, comma-separated. */
  outcome: string;
  /** ISO 8601 date the case study was written/published on the site. */
  publishedAt: string;
  /** Reading time hint shown on the index card; computed by hand from
   *  body word count (~200 wpm). Kept manual rather than calculated so
   *  a future expansion of the body doesn't silently change the number
   *  on render. */
  readingTime: string;
  /** Topical tags shown on the index card and the read page header. */
  tags: string[];
  /** Markdown body. Rendered through the same `marked` + DOMPurify
   *  chain the blog uses. Section headings start at H2. */
  body: string;
  /** Show on the public index. Set false to keep a draft in-repo
   *  without exposing it. */
  published: boolean;
}

const PHISHING_PROGRAM: CaseStudyMeta = {
  slug: 'phishing-program-at-scale',
  title: 'Phishing program at scale: methodology and what changed',
  excerpt:
    'How I cut false positives 25% and per-incident analysis time 35% across a 250+ incident year, without buying anything new.',
  kicker: 'Investigation methodology',
  outcome: '250+ incidents · −25% false positives · −35% time per case · 90%+ remediation',
  publishedAt: '2026-05-21',
  readingTime: '6 min',
  tags: ['Phishing', 'BEC', 'SOC', 'Investigation Methodology', 'Automation'],
  body: `Most analyst write-ups about "how to triage phishing" stop at the screenshot of headers and the smug "of course it's phishing" conclusion. They skip the part that actually matters at volume: which decisions stay with the human, which get automated away, and what changes when the queue is two-hundred-and-fifty incidents deep instead of two.

This is what worked at that scale.

## What the queue looked like

Over the period this measures, the inbox carried 250+ confirmed phishing, BEC, and commodity-malware incidents across a portfolio of about 150 companies. The mix was the usual unbalanced distribution. A lot of credential-harvest pages with low payoff, a small core of high-stakes BEC chains that wanted real time, and a long tail of malware-laden attachments that mostly auto-triaged themselves.

The starting state was not exotic. Analysts looked at each report individually, ran the IOCs by hand against three or four sources, made a judgement call, replied to the reporter, and moved on. The two numbers I cared about were how often we labelled a real attack as benign, and how long the median case sat in queue.

## The decisions that don't generalise, and the ones that do

The first thing I want to be honest about: the cleverness in phishing triage is mostly not in the *analysis*. It's in deciding what to look at and what to skip.

A confirmed credential-harvest page with no internal click-throughs is a 30-second case. A reply-chain BEC where the attacker has already gotten a vendor to change wire details is a 90-minute case. Treating both with the same playbook is the failure mode I kept seeing in adjacent teams. The BEC didn't get the depth it needed, and the harvest page wasted 20 minutes of context-loading. Closing that gap was where most of the time came from.

The second decision was about IOC enrichment. The instinct is to run every indicator against every source. The reality is that for about 70% of cases, two or three reputation feeds give you a clear verdict in ten seconds and you stop. The remaining 30% deserve depth, and that's where automation paid for itself.

## What I automated, and what stayed manual

The decision boundary I landed on, after measuring my own time for a few months:

**Automate:** IOC lookups (cross-source consensus is the only thing I trust on a single feed result), header parsing, reporter back-and-forth on confirmed/benign cases, ticketing and tagging, follow-up sweeps for repeat-victim cases a week after closure.

**Keep manual:** the read on whether a sender's behaviour change is suspicious; the call on whether to engage IR or treat as routine; the language of the reply when the reporter is clearly upset; anything to do with a financial movement.

I built the automation on n8n with a few MCP servers wired into Claude Code, because the team already used n8n and I didn't want to introduce a new vendor. The MCP layer is what made it sustainable. Instead of writing 40 brittle node configurations, each tool is a discrete function the model orchestrates against the case payload.

The result was a step change in median response, from about 4 hours sitting in queue to under 75 minutes, driven almost entirely by the cases the automation handled end-to-end without me. The cases I still touched took about the same time per case. There were just fewer of them.

## Why false positives dropped 25%

This part is less intuitive. Reducing false positives didn't come from better detection. It came from giving each case more *evidence per minute*. The IOC consensus engine surfaced cross-source agreement on indicators that, in isolation, looked single-source-flag suspicious. Twelve percent of the cases I would historically have labelled "suspicious, escalate" turned out, on consensus check, to be a single feed crying wolf.

The second contributor was simpler. By automating away the routine cases, the cognitive load on the analyst (me) dropped. Tired-analyst pattern-match is the biggest source of FPs I've measured. A rested triage queue produces measurably better calls than a fatigued one. None of this is new; Klein and Endsley have been saying it for thirty years. But you don't feel it as the analyst until the queue is short enough to leave your attention intact.

## What I'd do differently

A few things I got wrong and corrected mid-stream:

- I over-invested in custom enrichment for the first three months. Half the providers I integrated never moved a verdict. Now I start with three sources and add only when a case demands it.
- I underestimated how much value a *consistent* reply template added until I measured reporter satisfaction. The variability in my own responses was costing me trust signal with the reporters.
- I built the automation chain bottom-up (IOC, then enrichment, then ticketing) when the correct order was top-down (decision tree first, then automate each branch). The bottom-up version produced a beautiful pipeline that did the wrong work fast.

## Where the toolkit at /dfir came from

The interactive tools I ship at [/dfir](/dfir), the IOC checker streaming 24 providers, the phishing analyzer, the email defense scorer, are not parallel projects. They're the same triage workflow turned into a public surface. If you read the methodology above and the toolkit at /dfir feels like a thin wrapper around it, that's deliberate. I shipped the tools I wished I'd had on shift, and those tools work because they emerged from the work, not the other way around.

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

The portfolio was about 1,300 domains spanning roughly 150 early-stage companies. The kind of mix where some founders register a domain at incorporation and never think about it again, and others have eight subdomains spinning up cold outreach in twelve mail providers. Almost none of those domains had DMARC enforcement. Many had no DKIM. A handful were sending unauthenticated mail through gateways that had no idea what their own SPF record said.

The two numbers I started with: authentication alignment was rough (sample-based) around 40%, and the rate of phishing incidents that landed in inboxes because of perfect spoofing of internal senders was high enough to be its own KPI.

## What the plan said

The plan went something like this. Inventory every sender for every domain. Publish strict SPF and DKIM for the legitimate ones. Move DMARC from \`p=none\` to \`p=quarantine\` to \`p=reject\` over six weeks per domain with reporting on. Standard 2018-era playbook. The version you've read a dozen times.

The two assumptions in that plan that turned out to be wrong:

1. **Inventory of senders is a one-time exercise.** It isn't. New SaaS shows up every week with founders who don't tell anyone they're using a new mail sender. Half of the operational work was the discovery loop, reading DMARC aggregate reports for unknown sources and chasing down which department signed which contract.
2. **DKIM is the easy part.** It is, if you control the mail server. Across 1,300 domains, you mostly don't. The cooperation gradient, from "I'll do that today" to "who owns this domain, is it still us?", is the whole project, not a footnote.

## What actually worked

After the first dozen rollouts that all went slightly differently for the same reason, the playbook converged on three phases:

**Phase 1, Discovery (2 weeks per domain).** \`p=none\` with reporting wired into a parser that bucketed sources by provider. Each unknown source got a one-line outreach to the suspected owner. By week 2 we had a usable picture of who sends as the domain.

**Phase 2, Alignment (1-2 weeks).** Adjust SPF and DKIM per the discovered senders. The trap here is over-broad SPF includes that drift to \`?all\` because someone got a bounce. Resist. Track failure rate by sender and fix at the source, not at the policy.

**Phase 3, Enforcement (4 weeks).** \`p=quarantine pct=10\` to \`pct=50\` to \`pct=100\` to \`p=reject\`. The pct ladder is the part most rollouts skip and is the difference between a clean migration and a noisy one. The pct flag throttles enforcement by percentage of failing mail. By the time you're at 50% with no inbound complaints, you've effectively pre-tested the reject policy.

End state across the portfolio: 98%+ alignment on legitimate sources. \`p=reject\` on the domains we control fully. \`p=quarantine\` where ownership is partial.

## The 60% spoofing drop wasn't all DMARC

I want to be specific about this because the metric gets oversold. Spoofing incidents (incidents where the sender field perfectly matched an internal address) dropped about 60% over the same period. DMARC enforcement contributed maybe two-thirds of that. The other third came from:

- BIMI plus VMC on the domains that had the budget for it, which gave reporters a visual signal in their inbox.
- Tightening MTA-STS to make downgrade attacks (TLS strip plus reroute) impractical.
- A monitoring pipeline for lookalike domain registrations (typosquats, homograph variants, TLD swaps) that surfaced about 30 active impersonation campaigns over the period.

The lookalike piece deserves its own paragraph. Most DMARC rollouts treat the domain as the unit, but attackers don't care which domain they spoof if you've locked down the one they wanted. They register \`yourbrand.co\` (instead of \`.com\`) or \`yourbránd.com\` (homograph), and they're past your DMARC entirely. We ran a continuous lookalike sweep on every domain in the portfolio and got 30+ active impersonation registrations taken down through the abuse channels: registrars, hosting, Cloudflare. That number is approximate because some campaigns had multiple registrations.

## What I'd warn you about

Three things that consistently surprised people on adjacent teams when I described this:

1. **Don't trust your own SPF record.** SPF is the most-ignored standard at scale because everyone copies the include from a how-to and never re-reads it. I found \`include:\`s pointing to mail providers companies hadn't used for years. Audit, don't assume.
2. **Aggregate reports are a parsing problem, not a security problem.** The DMARC \`rua=\` reports come in XML, in volume, with vendor-specific schemas. Either pay for a parser or build one immediately. Reading them by hand at scale is not an option.
3. **The political work is the project.** Convincing five different team leads that their legacy mail server is the problem is most of the time. Engineering is the easy bit.

## Why it stuck

DMARC enforcement projects rot when the inventory ages out and no one's watching. The mechanism that kept the alignment at 98%+ over time was simple. Aggregate reports are parsed into a small dashboard, and any drift in alignment percentage on any domain pages on-call. The dashboard isn't fancy. It's the *attention model*, making misalignment visible, that does the work.

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
  body: `The hardest part of automating triage isn't the automation. It's the line between what the model handles end-to-end and what gets escalated to me. Get the line wrong in one direction and the queue becomes a polite waiting room. Get it wrong in the other and you've published a model auto-deciding things it shouldn't.

This is the line as I drew it, and the parts that worked.

## The stack

I'll get the boring layer out of the way first. The automation runs on n8n because the team was already running n8n for other workflows and a new orchestrator would have been political. MCP servers expose tool surfaces to Claude Code (the model orchestrates them; it doesn't see raw n8n nodes). The IOC enrichment layer is the same multi-source consensus engine that powers the [/dfir](/dfir) IOC checker: 24 free providers, no premium keys.

The interesting layer is the decision tree.

## The decision tree

Every reported phishing case enters the pipeline and gets classified into one of four buckets within the first 30 seconds:

**Bucket A, Confirmed benign.** Newsletter the reporter forgot they subscribed to. Misconfigured legitimate sender. Internal mail that lost its DKIM signature on a forward. Automation replies, closes ticket, no human touch.

**Bucket B, Confirmed malicious, low-impact.** Credential-harvest page, no clicks from the org. Automation pulls IOCs, kicks off a block-list update, replies to the reporter with the verdict and a one-line user-education note, closes ticket. Logged for the weekly summary.

**Bucket C, Confirmed malicious, potential impact.** Anything where evidence suggests a click happened, or where the target is high-risk (finance, executive, IT admin). Automation collects evidence and *waits* for human review. Reply to reporter is held. Everything queued for my attention.

**Bucket D, Uncertain.** This is the residual category that took most of the design work. Any case the model can't confidently put into A/B/C: novel infrastructure with no provider verdict, suspicious-but-not-obvious internal sender behaviour, anything with financial movement signals in the body.

The model handles A and B end-to-end. It assembles evidence and waits on me for C and D. Median throughput on A+B is about 3 minutes per case (mostly IOC enrichment latency). My median touch time on C+D dropped from about 25 minutes (before automation) to about 12 minutes (after), because the evidence was pre-assembled in a consistent shape.

The biggest single factor in dropping median response time from 4 hours to under 75 minutes was that about 70% of cases now never sit in queue waiting for me. They get handled in their own latency window, and my attention concentrates on the 30% that need it.

## What I almost got wrong

Two design choices that I changed mid-implementation:

**First, I initially let the automation reply to the reporter on bucket-C cases.** Within a week, two reporters complained that the reply felt cold for a case that they'd reported as anxious. The replies were technically correct but tonally off for someone who'd just clicked a suspicious link. I moved bucket C's reply back to human. Cost: about 5 minutes per case. Worth it.

**Second, the model's confidence threshold for "uncertain" needed calibration.** Out of the box, it was happy to classify ambiguous internal-sender behaviour as bucket B. After a near-miss where it labelled a low-grade BEC reconnaissance ping as a misconfigured newsletter, I raised the threshold deliberately high. Better to send more cases to D than to miss a C. The trade-off is more of my time on cases that turn out to be nothing. I'll take that over a missed BEC.

## What I didn't automate

Some things the automation could have done, that I deliberately kept manual:

- **The reply when a real user has clicked a phishing link.** This is a customer service moment as much as a security one. They're already feeling stupid. A robot reply makes it worse.
- **The decision to engage IR or treat as routine.** This is a judgement call where the cost of false-negative (not engaging when you should) is huge and the cost of false-positive (engaging when you shouldn't) is also material. Model-as-judge is the wrong shape.
- **Anything financial.** Wire-fraud cases need a human in the loop because the cost of getting it wrong is unrecoverable. The automation collects evidence and pages me.

## What this taught me about MCP servers

The MCP layer is the bit I'd most recommend to anyone building similar automation. The benefit isn't speed. n8n alone is fast enough. The benefit is *legibility*. Each tool is a discrete function with a documented surface, and the model orchestrates against those interfaces rather than against a brittle YAML of nodes. When the workflow breaks, the failure surface is in the tool, not in the wiring.

If you want to look at how this is wired in practice, the IOC enrichment side of the automation is essentially the [/dfir IOC checker](/dfir/ioc-check) running server-side instead of in the browser. Same provider list, same consensus scoring, same caching layer.

## Where I'd take it next

The next problem is sender-behaviour modelling. The bucket-D cases (where a sender's behaviour is *slightly* off but no individual signal is damning) are the ones that take the most time and produce the most genuine missed-BEC risk. The current automation doesn't model "this person normally writes in three-sentence paragraphs and this email is one-line all-caps". That's a per-sender baseline I want to build.

If you've solved that piece for your org and feel like comparing notes, reach me at [hello@pranithjain.qzz.io](mailto:hello@pranithjain.qzz.io).`,
  published: true,
};

const EMAIL_INFRA_PLATFORM: CaseStudyMeta = {
  slug: 'email-infra-automation-platform',
  title: 'Building an end-to-end email infrastructure automation platform',
  excerpt:
    'Domain purchase, DNS, Workspace provisioning, warmup, monitoring. Six disconnected workflows collapsed into one platform.',
  kicker: 'Platform engineering',
  outcome:
    '6 workflows automated · setup per domain: hours → 10 min · 2,700+ inboxes monitored · real-time DMARC dashboard',
  publishedAt: '2026-05-21',
  readingTime: '7 min',
  tags: ['Email Infra', 'Smartlead', 'n8n', 'Cloudflare', 'Automation', 'MCP'],
  body: `Spinning up a new mail-sending domain by hand has six steps. Buy the domain. Wire DNS. Provision Workspace users. Warm up the inboxes. Hook the inboxes into the sending tool. Watch the auth alignment land. Done by a person, that's an afternoon of clicking through six different consoles and a printed-out checklist. Done across 1,300 domains and 2,700 inboxes, that's not a job; that's a job that never finishes.

The platform that replaced the afternoon is what this is about.

## What it had to do

The non-negotiables, in order of how much they hurt when broken:

1. **Idempotent setup per domain.** Re-running the workflow against an already-configured domain has to be a noop, not a duplicate. Half the operational pain in the manual version was someone re-running step 4 because they forgot step 3 had completed.
2. **DNS authority as the source of truth.** Spreadsheet inventory drifts. The DNS records don't. If the platform asks "is this domain configured", it answers from \`dig\`, not from a row in a tracker.
3. **Continuous monitoring after setup.** A domain that authenticated cleanly on day 1 can drift on day 30 because a marketing team added a third-party sender. Without monitoring, the inventory ages out and the spoofing surface re-opens.
4. **Graceful failure.** Six external APIs, each with their own rate limits, downtime, and "the spec changed last week" surprises. One vendor blip shouldn't break a daily run for 1,300 domains.

## The stack

Six glue layers, each chosen because it fit the constraint rather than because it was fashionable:

- **Spaceship** for domain purchase. Their API is straightforward and their pricing doesn't go vertical at volume. Stayed away from registrars whose API requires a phone call to enable.
- **Cloudflare** for DNS. Every domain becomes a Cloudflare zone. The reason isn't performance; it's the API. Cloudflare's DNS API is the most reliable I've used at this scale, and the change-audit log is real (not a "we keep logs internally, contact support" answer).
- **Google Workspace Admin SDK** for inbox provisioning. The provisioning calls are well-documented but rate-limited at the API gateway level, so the platform queues them and respects 429s rather than retrying naively.
- **Playwright** for the parts where the vendor doesn't have an API. (Yes, there are vendors in this space whose admin UI is the only way to configure an account. I'm not going to name them. The Playwright scripts are 200 lines that do what a competent intern could do in an afternoon, except they do it every time without thinking.)
- **Smartlead** as the sending platform on top. The MCP server I wrote for it exposes 23 analytics tools so the campaign data is queryable from Claude Code rather than scrape-able from a dashboard. That's the bit founders actually ask for.
- **A monitoring dashboard** wired into the DMARC aggregate reports and a per-domain reachability sweep. This is the layer that closes the loop. When a domain drifts, the dashboard surfaces it, the platform re-runs the relevant step, and the domain returns to clean. No human in the loop for the routine drift cases.

I built this on FastAPI with a thin React control plane. The control plane is for the cases where a human *should* be in the loop (a new SaaS the platform doesn't know about, a domain ownership question, an alignment failure that isn't routine).

## The Smartlead MCP server

I want to dwell on this for a paragraph because it's the part most adjacent teams asked me about.

The problem: Smartlead has campaign data. I run Claude Code as my analyst-of-second-opinion. Connecting the two is normally done by piping CSV exports into a prompt, which is fragile and stale. The MCP server I wrote exposes 23 discrete tools (\`get_campaign_summary\`, \`list_inboxes_below_warmup_target\`, \`recent_bounces_by_domain\`, etc.) that Claude Code can call directly. Every tool returns a typed JSON shape. The model orchestrates against those shapes rather than against a pasted spreadsheet.

The lift was about a week. The payoff is permanent: every question I'd otherwise pull a CSV for ("which inboxes are below 80% reputation this week", "did the new domain X land in spam folders") is now a typed call.

## What it looks like in operation

A typical day:

- 06:00 UTC: the platform's morning sweep checks every domain's DMARC alignment. Anything that drifted gets queued.
- 06:30 UTC: the Cloudflare API normalises any DNS records that don't match the canonical template (someone's GoDaddy MX leaked in, etc.).
- 07:00 UTC: a queue of new domains (from yesterday's onboardings) goes through the setup pipeline. Each domain takes about 10 minutes of real time, almost entirely waiting on Workspace provisioning calls to settle.
- All day: the monitoring dashboard surfaces per-domain alignment, per-inbox reputation, and the lookalike domain registrations I covered in the [DMARC case study](/projects/dmarc-enforcement-1300-domains).

Median time from "new company onboarded" to "first email sent under DMARC alignment from a warmed inbox" went from "several hours of person-time" to "10-15 minutes of platform time".

## What I'd warn you about

Three things I'd flag for anyone building something similar:

**Don't fall in love with idempotency claims your APIs make.** Some of the upstreams claim idempotent endpoints; in practice, retrying a 200-but-partial response duplicates the underlying record. The platform's idempotency lives in *its* state, not the upstreams'.

**Treat the monitoring layer as load-bearing, not a nice-to-have.** Without it, the inventory ages, the setup state drifts, and you're back to "spreadsheet of unknown truth". I built the dashboard third (after setup and warmup). Should have been first; everything else hangs off it.

**Playwright is a tax, but pay it.** I tried twice to convince vendors-without-APIs to give me API access. Two no's, one ignored email. The Playwright scripts cost less to maintain than the back-and-forth would have.

## What this connects to

The platform is the substrate that the [phishing program at scale](/projects/phishing-program-at-scale) sits on. You can't run a real DMARC enforcement program if your domain inventory is a spreadsheet; you can if it's a continuously-monitored DNS-of-record. You can't triage 250+ phishing cases efficiently if half the BEC pivots involve "who owns this lookalike domain"; you can if the platform already surfaced the lookalike a week ago when it was registered.

The visible work is the SOC and the DMARC numbers. The platform is the thing that makes those numbers reproducible.

If you're building a similar layer or untangling a similar mess, reach me at [hello@pranithjain.qzz.io](mailto:hello@pranithjain.qzz.io). Happy to compare notes on the parts your vendors lied about.`,
  published: true,
};

const DFIR_TOOLKIT_BUILD: CaseStudyMeta = {
  slug: 'dfir-toolkit-design',
  title: 'Designing a 60-tool DFIR toolkit at the edge: what earns a slot',
  excerpt:
    'Building 60+ analyst tools on Cloudflare Workers, deciding which tools earn the front door, and why most of them are wrappers around the same triage workflow.',
  kicker: 'Tool design',
  outcome:
    '60+ tools shipped · 5 featured tools earn the front door · zero credits required · sub-200ms median IOC check',
  publishedAt: '2026-05-21',
  readingTime: '6 min',
  tags: ['DFIR', 'Cloudflare Workers', 'Tool Design', 'Detection Engineering', 'Universal Rule Converter'],
  body: `A 60-tool toolkit is suspect by default. Most of the time it means someone confused breadth for depth, and clicking around for ten minutes turns up the same JSON-formatter five times with a different name. I wanted to avoid that.

This is how the toolkit at [/dfir](/dfir) is structured, what earned a slot, what got demoted, and what I learned about tool design from running it.

## The hub problem

A toolkit hub is a UX problem before it's an engineering one. A visitor lands on a grid of 60 tiles. Each tile competes for attention. The depth of the best tool is invisible if it's the 47th tile.

The first cut I tried was alphabetical. Useless; analysts don't know the name, they know the *task*. The second was category (triage, OSINT, email, detection, etc.). Better, but a category with one strong tool and seven mediocre ones still hides the strong one.

The version that landed is two-tier:

1. **Featured tools** at the top, hand-picked. Five tools that earn their place by depth, not by being adjacent in a category. Each one carries a one-line "why this" differentiator versus the generic equivalent.
2. **Pick a workbench** below, the 9-category picker for the long tail. Same data, different framing.

The featured five (today) are: IOC Checker, Email Defense, Universal Rule Converter, Detection Lab, CVE Prioritizer. Adding or removing one is a deliberate editorial call, not a generated list. The list lives at the top of \`DFIR.tsx\` and is treated as content.

## What earns a slot

The criterion I converged on: a tool earns its place when there's a *concrete reason* an analyst would reach for it instead of the obvious commercial alternative.

The IOC Checker's reason is "cross-source consensus across 24 providers streaming". Single-feed flags are noise at scale; consensus is the only signal worth a Slack message. Most commercial tools don't expose the per-source breakdown that lets you discount a single noisy feed.

The Email Defense scorer's reason is "built from a 1,300-domain DMARC rollout". The rules check what actually breaks in practice (over-broad SPF includes, MTA-STS downgrade attacks, BIMI/VMC gaps), not the checklist of standards.

The Universal Rule Converter's reason is "round-trip between Sigma, KQL, SPL, Lucene, EQL, YARA, DLP, supply-chain via one canonical RuleIR". The competitors are pySigma-style mono-source converters; this one treats every format as both source and target through a shared IR. Heuristic on the reverse direction, flagged honestly in the warnings panel.

The Detection Lab's reason is "TDD loop for IOC-stream rules". You write a rule, declare two or three inline test cases, watch them tick green before the rule ever sees live data. The competing experience is "edit YAML, push, wait for the next cron, hope".

The CVE Prioritizer's reason is "tells you what to *do*, not just the CVSS score". CVSS plus EPSS plus KEV plus ransomware-use plus PoC count plus asset-context multiplier, surfaced as one of ACT NOW / SCHEDULE / MONITOR / DEFER with a per-factor breakdown.

Each of these has a [tool docs panel](/dfir/ioc-check) explaining what the tool ISN'T as well as what it is. That bit (the "what it isn't") matters more than the pitch. It's the thing that stops a visitor wasting ten minutes finding out the tool doesn't do what they assumed.

## The long tail

The other 55 tools are organised by analyst workflow stage, with a "utilities and converters" sub-section at the bottom for the duplicative ones (timestamp converter, hash calculator, decoder, encoder, plist parser, homograph detector).

I flagged six tools as \`utility: true\` in the data layer. The hub computes the headline count as MAIN_TOOL_COUNT (everything except utilities) so the front door doesn't read as padded. The utility routes still resolve; nothing is deleted. A visitor who wants the timestamp converter can still link straight to it. The toolkit just stops pretending those duplicates of CyberChef are where its depth lives.

This was the right move. The headline count drops from 60+ to about 54, which is closer to the truth.

## The detection-engine forcing function

The most useful exercise I went through was writing the [Detection Lab](/dfir/detection-lab). Forcing myself to define a JSON DSL ("a rule is \`match\` plus optional \`exclude\` plus optional \`aggregate\`") made me understand the actual shape of detection rules in a way that reading Sigma never did.

That understanding then became the [Universal Rule Converter](/dfir/rule-converter). The same IR is at the centre of both. The Detection Lab is "write a rule and test it"; the Converter is "translate an existing rule between dialects". They're two surfaces over one intermediate representation.

This pattern (a forcing-function tool that crystallises an idea, then a second tool that benefits from the crystallisation) is the one I'd repeat. Build the lab first. The converter follows naturally.

## Edge constraints

Everything runs on Cloudflare Workers. The constraints that shape the toolkit:

- **No filesystem.** Every parser (PCAP, EVTX, registry hive, plist, protobuf, PE, prefetch, SQLite) is JavaScript that takes a Uint8Array. The "no upload" promise is real because the Worker physically can't accept one; the file stays in the browser and the parser runs there.
- **50-subrequest budget per request.** The IOC checker streams 24 providers in parallel by carefully accounting for which providers are eligible per IOC type (a SHA-256 doesn't probe AbuseIPDB) so the budget covers the worst case.
- **Free-tier KV.** Every "save your rule" feature is localStorage on the client. The detection lab's saved-rule list lives in the browser only; the universal rule converter saves nothing. Both are intentional. The toolkit doesn't want your data.

The trade is real. You can't run a Volatility plugin on a 16GB memory image. The toolkit is "triage at the edge", not "full forensics". Saying that clearly on each tool's docs panel is more important than pretending otherwise.

## What I'd do differently

Two things, with hindsight:

**Tools should have ATT&CK alignment from day one.** Several tools (Detection Lab, Rule Converter, CVE Prioritizer) got MITRE technique pivot in later passes. They should have shipped with it. ATT&CK is the analyst's lingua franca; a tool that can't tag its output with a technique is a tool that won't show up in someone's report.

**The cross-tool dispatch belongs everywhere.** The hub has an "Paste an indicator" box that routes to the right tool. That same affordance should be on every tool page, not just the hub. An analyst who's looking at a domain in the IOC checker shouldn't have to navigate back to the hub to dispatch the same domain to the URL preview tool.

Both of these are on the backlog. Neither is hard; they just take a pass.

## What it's for

The toolkit is the practitioner side of my work. The investigations methodology and the DMARC rollout are the work; the toolkit is the work made *touchable*. If you want to see how I think about a problem, click through Detection Lab. The DSL it asks you to write is the same shape as the decisions I made in those engagements.

If you want to chat about tool design, or you've built a similar surface and want to compare what earned a slot versus what got demoted, reach me at [hello@pranithjain.qzz.io](mailto:hello@pranithjain.qzz.io).`,
  published: true,
};

const THREAT_INTEL_PLATFORM_BUILD: CaseStudyMeta = {
  slug: 'threat-intel-platform-build',
  title: 'Shipping autonomous threat-intel: layer-1 + layer-2 defences before the AI writes',
  excerpt:
    'How /threatintel publishes case studies without a human in the loop, and the two layers of IOC validation that make that safe.',
  kicker: 'Autonomous publishing',
  outcome:
    'Autonomous discover → AI generate → QA → publish · 2 IOC truth-defence layers · admin approval gate · 16 elite research sources curated',
  publishedAt: '2026-05-21',
  readingTime: '7 min',
  tags: ['Threat Intel', 'AI Safety', 'IOC Validation', 'Autonomous Publishing', 'Cloudflare Workers'],
  body: `The promise of an AI-written threat-intel blog is high. Discover topics from live feeds, generate analysis, publish without a human touching it. The risk is also high. One hallucinated CVE, one fabricated IOC, one invented attribution, and the blog becomes a liability instead of an asset.

This is how [/threatintel](/threatintel) ships AI-generated case studies safely, the two layers of IOC truth defence that catch the model when it's wrong, and the approval gate that catches the layers when they're wrong.

## The autonomous pipeline

The shape:

1. **Discovery** (cron, daily 00:05 UTC). Ten runners pull candidate topics from live CTI feeds. CVE candidates from NVD plus CISA KEV. Actor candidates from MITRE Groups. Malware from abuse.ch ThreatFox. Ransomware from ransomlook plus ransomware.live. Re-leak detection from the cross-actor matcher. Each candidate is scored, deduped (60-day window), and written to KV.
2. **Planner** (cron, weekly Monday 00:15 UTC). Approved candidates get scheduled into hourly publish slots over the coming week.
3. **Publisher** (cron, hourly). One due slot per firing. The model generates the post against the candidate's evidence (fenced FACTS/SOURCES block), the post goes through anti-slop and content-QA gates, and (when the gate is on) lands in the drafts queue.
4. **Admin approval** (human). The drafts tab in the admin shell shows pending posts with rendered preview, score-factor breakdown, and approve/reject buttons. Approve copies the draft to \`posts:index\` and refreshes RSS.

The whole pipeline is single-flight (KV lock per cron with 2-minute TTL) so retried scheduler events can't double-fire. Cron failure is logged with a structured shape so a missed firing surfaces in the logs rather than silently dropping a candidate.

## Why both layers matter

The model's two failure modes for IOCs are different, and they need different defences.

The first failure mode is **placeholder-shaped**. The model writes "192.168.1.1" as a C2 IP, or "example.com" as a malicious domain, or "deadbeef..." as a hash. These look like IOCs but they're obviously wrong on inspection. A regex catches them.

The second failure mode is **plausible-shaped**. The model writes "91.215.155.42" as a C2 IP. The IP is valid, the format is right, but there's no upstream record of it anywhere because the model invented it. A regex can't catch this. You need to ask someone who would know.

Both layers ship today.

## Layer 1: the placeholder filter

The first layer runs at post-process time, synchronous, no network calls. It drops:

- **IPv4** in RFC1918 (10/8, 172.16/12, 192.168/16), loopback (127/8), link-local (169.254/16), all three TEST-NET ranges (RFC5737), the benchmark range (198.18.0.0/15), and 240/4 future-reserved.
- **Domains** matching example.\\* or .test/.local/.invalid TLDs, plus a few well-known placeholder prefixes (placeholder.\\*, sample.\\*, dummy.\\*).
- **SHA-256 hashes** that are all-same-char (000000... ffffff...), or the cafebabe/deadbeef/feedface/baadf00d family, or repeating 0123456789abcdef patterns.

This catches the obvious cases. It's cheap (regex), deterministic (testable), and runs unconditionally. About a dozen tests pin the behaviour.

## Layer 2: the live cross-check

The second layer runs at QA time, async, with a per-IOC timeout. For each extracted IOC, the validator probes the providers that support that type:

- **VirusTotal** (any type). 200 means "exists", 404 means "absent in VT". The universal probe.
- **AbuseIPDB** (IPv4/v6). \`totalReports > 0\` means "reported", \`= 0\` means "no abuse history".
- **MalwareBazaar** (hashes). \`query_status: "ok"\` means "in the dataset", \`hash_not_found\` means "absent".
- **URLhaus** (URLs). Same shape as MalwareBazaar.

The decision rule is conservative on purpose:

- ANY provider returns "exists" → keep, mark validated=true.
- ALL voting providers return explicit "not found" → drop.
- ALL providers error (timeout, auth, rate-limit, network) → keep, validated=undef. We don't trust our own check; better a false-keep than a false-drop.
- No provider supports the IOC type → keep, validated=undef.

Guardrails: 20 IOCs per post max (bounds API quota), 8s timeout per probe, concurrency pool of 4, graceful no-op fast path when no provider keys are configured.

The layered design is what makes the validator safe to run. Layer 1 catches the bulk of obvious cases without any external dependency. Layer 2 catches the harder cases when the keys are provisioned, and silently degrades to layer-1-only when they aren't. Neither layer is load-bearing alone; both together cover what one couldn't.

## The reference allowlist

Hallucinated citations are the other failure mode I cared about. The model occasionally writes plausible-sounding URLs that don't exist. The defence is a static allowlist of about 90 trusted hosts (NVD, CISA, MITRE, CVSS, IETF, NIST, OWASP, ransomware trackers, abuse.ch family, the major research labs, security press, breach/OSINT sources) plus the candidate's own source URLs.

References whose host is neither in the static list nor in the per-post sources get stripped. Safety: if the filter would empty \`## References\` entirely, it backs off. Better an over-broad citation than a post that QA fails for being unsourced.

The allowlist is a deliberate maintenance tax. New legitimate sources require an edit to \`post-process.ts\`. I take the tax in exchange for being able to claim every citation has a known-trusted host.

## The approval gate

Even with the two layers, the safest position is a human click before publish.

The approval gate is env-flagged (\`BLOG_APPROVAL_REQUIRED=true\`). When on, the publisher writes new posts to a \`drafts:\` namespace instead of \`posts:\`. An admin reviews via four endpoints: list drafts, preview with rendered HTML, approve, reject. Approve copies the draft to \`posts:index\`, stamps \`approvedAt\`, refreshes RSS.

Fail-safe: if \`requireApproval\` is on but \`putDraft\` isn't wired (configuration drift), the publisher falls back to auto-publish rather than silently losing the post. The opposite failure (silent loss) is worse than the original problem.

The gate has been live in production since I wrote it. The autonomous pipeline still generates daily; nothing reaches \`/blog\` without an approve click.

## What I didn't ship

Two things I considered and decided against:

**A web-of-trust citation score.** I thought about ranking citations by how many other trusted sources cite them. Too much engineering for too little marginal accuracy over the static allowlist. Layer-2 IOC validation gets you most of the truth-check benefit without the citation-graph machinery.

**Real-time validation on publish, not generate.** Layer 2 runs at generation time, not publish time. A more paranoid design would re-validate every IOC on every publish (catching the case where an IOC was real at generation time but the upstream record disappeared since). Diminishing returns. The model isn't generating "real today, deleted tomorrow" IOCs; it's generating "valid-looking but never real" IOCs.

## What I'd warn you about

Three things for anyone building a similar autonomous pipeline:

**Caches will bite you.** I had a 24-hour edge cache on the blog index. When I deleted a draft for testing, it kept 200-ing from cache for hours. Replaced with a short Cache-Control plus no read-through cache. Lesson: any layer between the database and the response that doesn't bust on write is a bug waiting for a deletion.

**Hallucinated CVEs are sneaky.** The model sometimes references CVE-YYYY-XXXX as "context" without it being part of the candidate evidence. I marked these as warnings rather than failures (they're often legitimate historical context like "unlike CVE-2021-44228"), but I had to add explicit prompt instructions to mark them as context, not findings.

**The reference allowlist needs occasional tuning.** Once a quarter, a legitimate source for a specific post would fail the allowlist. Easier than I expected: add the host to the list, redeploy. The safety net catches the actual failure mode (fabricated hosts) consistently.

## Where this fits

The threat-intel platform is the most ambitious piece of this site because it's the part that publishes without me. Every defence above is what lets me sleep at night with that fact true. The platform's quality bar isn't "the AI is good"; it's "the structure around the AI is good enough that the AI's mistakes don't reach the reader".

If you're building a similar pipeline (autonomous discovery, AI generation, validation gates, approval workflow), reach me at [hello@pranithjain.qzz.io](mailto:hello@pranithjain.qzz.io). The bits that matter aren't the model or the prompts. They're the layers around both.`,
  published: true,
};

export const caseStudies: CaseStudyMeta[] = [
  PHISHING_PROGRAM,
  DMARC_ROLLOUT,
  N8N_AUTOMATION,
  EMAIL_INFRA_PLATFORM,
  DFIR_TOOLKIT_BUILD,
  THREAT_INTEL_PLATFORM_BUILD,
];

/** Public-only view, filtered to published studies and sorted newest-first. */
export const publishedCaseStudies: CaseStudyMeta[] = caseStudies
  .filter((c) => c.published)
  .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

/** Look up a case study by slug. Returns null for unknown / unpublished. */
export function findCaseStudy(slug: string): CaseStudyMeta | null {
  const hit = caseStudies.find((c) => c.slug === slug);
  return hit && hit.published ? hit : null;
}
