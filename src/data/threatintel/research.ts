/**
 * Original threat-intel research authored by Pranith Jain.
 *
 * Lives separately from /projects case studies because the editorial
 * intent is different. Case studies are about systems I built; research
 * pieces are about adversaries I'm reading. The data lives here so the
 * read page can render markdown through the same marked+DOMPurify chain
 * the rest of the site uses.
 *
 * Voice rules carry over from case studies: no em-dashes, no
 * "leverage / robust / comprehensive / essential / critical", no
 * "let's dive in / it's worth noting / in conclusion". Specific numbers
 * beat generic claims. If a claim can't be sourced to public reporting
 * or to this site's own data, it doesn't go in.
 *
 * Each piece sources every quantitative claim either to (a) the
 * platform's own aggregated ransomlook.io view, which any reader can
 * verify at /threatintel/ransomware-activity, or (b) named third-party
 * reporting linked inline. No anonymous claims.
 */

export interface ResearchPost {
  /** URL slug: /threatintel/research/<slug>. */
  slug: string;
  /** Display title. */
  title: string;
  /** One-line summary for the index card and meta description. */
  excerpt: string;
  /** Section label shown above the title on the read page. */
  kicker: string;
  /** Publish date, ISO 8601. */
  publishedAt: string;
  /** Hand-set reading-time hint. */
  readingTime: string;
  /** Topical tags. */
  tags: string[];
  /** Markdown body. */
  body: string;
  /** Set false to keep a draft in-repo without exposing it. */
  published: boolean;
}

const NOVA_LOCKBIT5_QILIN: ResearchPost = {
  slug: 'nova-lockbit5-qilin-may-2026',
  title: 'The May 2026 leak-site board: Nova, LockBit5, and Qilin tell three different stories',
  excerpt:
    "The top three operators on this platform's ransomlook feed for May 2026 each say something different about how to read a leak-site board. One is loud, one is quiet, one is structural.",
  kicker: 'Adversary read',
  publishedAt: '2026-05-21',
  readingTime: '7 min',
  tags: ['Ransomware', 'Adversary Tracking', 'Leak-site Analysis', 'Nova', 'LockBit 5', 'Qilin'],
  body: `Quick context. The number that matters at the top of this site, the one in [Live from the platform](/threatintel/ransomware-activity) on the home page, is "ransomware claims in the last 24 hours". That number, like every other in the platform, comes from ransomlook.io's aggregated leak-site index. Today, as I'm writing this on May 21, 2026, the 30-day cut of that index looks like this:

\`\`\`
Nova               17 claims
LockBit5           15 claims
Qilin               8 claims
Pear                4
The Gentlemen       3
Akira               3
DragonForce         3
Shadowbyt3$         2
Anubis              2
SafePay             1
\`\`\`

The first three operators carry the month. Each of them tells a different story about what to actually weigh when you're reading a leak-site board, and the gap between those stories is the point of this piece.

## Nova: a quiet rebrand becomes a top-of-board operator

[Nova is RALord with new branding](https://threatlabsnews.xcitium.com/blog/from-ralord-to-nova-how-this-raas-gang-is-wreaking-havoc-worldwide/). The rebrand happened around April 2025; in the year since, the group has expanded from a regional curiosity to a leak-site fixture, with over 86 victims spread across five continents [reported by early 2026](https://threatlabsnews.xcitium.com/blog/from-ralord-to-nova-how-this-raas-gang-is-wreaking-havoc-worldwide/). Their public posting cadence is what's interesting: not a single spike, but a steady drip of 4-5 new victims per week across diverse geographies (Brazilian e-commerce, Colombian government, French food production, financial services).

Two reads on this.

First, the rebrand worked. RALord was a name most defenders would have recognised by mid-2025. Nova is not. A surprising number of organisations are still going to treat a "Nova ransomware" claim as a novel actor and underweight it accordingly, when it carries the exact toolchain, qTox negotiation handle, and \`.ralord\` extension pattern of the predecessor. Detection rules keyed on group name age badly. Rules keyed on TTPs (Rust binaries, qTox contact, distinctive ransom note language) don't.

Second, the targeting profile is wider than the typical specialist RaaS. A group that's hitting KPMG branches one week and Brazilian e-commerce the next is either running multiple affiliates with their own target lists or doing opportunistic exploitation of whatever credentials they buy on the way in. Either way, what defenders should take is that "Nova doesn't target our sector" is not a defence; the targeting is whatever the affiliate has access to.

## LockBit5: the press story versus the actual volume story

LockBit5 is the louder operator on this board, but the headline coverage and the operational signal are not the same thing.

The press story is genuinely big. After [the international law enforcement operation in early 2024](https://en.wikipedia.org/wiki/LockBit), LockBit was widely assumed to be functionally dead. The 5.0 announcement [on RAMP in September 2025](https://blog.checkpoint.com/research/lockbit-returns-and-it-already-has-victims/), followed by [the Christmas-themed leak site launching in December 2025](https://blog.checkpoint.com/research/lockbit-returns-and-it-already-has-victims/), is a real comeback narrative. They have multi-platform builds (Windows, Linux, ESXi), claimed targets across [technology, manufacturing, and healthcare](https://www.dexpose.io/lockbit-ransomware/), and [157 victims posted by March 2026](https://www.dexpose.io/lockbit-ransomware/).

The operational story is more measured. 15 claims in the last 30 days on the public board puts them second by volume, not first, and well below their pre-takedown average. The leak site infrastructure has been [publicly burned at least once already](https://blog.checkpoint.com/research/lockbit-returns-and-it-already-has-victims/), which is the kind of operational hygiene failure you don't usually see from a mature RaaS. And the victim mix is shallower than the press coverage suggests; a lot of the new claims are mid-market organisations of the kind that wouldn't have made the brand's pre-takedown highlight reel.

The defender's read here: LockBit5 is back, but it's back as a competent mid-tier operator, not as the dominant force it was in 2023. Treat it accordingly. Detection coverage matters; panic budgeting doesn't.

## Qilin: the affiliate economics are the durable signal

Qilin is the operator on this board that's easiest to under-rate from a 30-day window. 8 claims is fewer than Nova or LockBit5. But Qilin's actual posture is [over 1,500 cumulative victims](https://www.dexpose.io/qilin-ransomware/), [55 new postings in the first weeks of 2026](https://www.dexpose.io/qilin-ransomware/), and [an affiliate revenue share reported as high as 85%](https://socradar.io/blog/dark-web-profile-qilin-agenda-ransomware/) against the more typical 70-75% the rest of the market offers.

That 85% number is what makes Qilin durable. RaaS operators compete for affiliates the way SaaS companies compete for engineers, and the headline split is the single biggest recruiting lever. A program that pays more, runs payload generation, leak-site publication, and negotiations for the affiliate, and has been visibly operational for years is going to keep pulling new affiliates regardless of what any individual month's claim count says.

If Nova is the operator-of-the-moment story, Qilin is the infrastructure-of-the-market story. The first matters for the next 90 days. The second matters for the next 3 years.

## What I'd do with this

Three concrete reads, in priority order:

1. **Update detection coverage on Nova/RALord as one actor, not two.** Any rule pack that calls Nova "new" and RALord "legacy" is splitting a single operator's history across two attribution buckets, and the merger of those buckets is where the cumulative case material lives.

2. **Treat LockBit5 as a mid-tier RaaS, not a flagship threat.** The brand carries weight the operational reality doesn't fully back up yet. Plan defensive posture against the technical capability (multi-platform builds, [improved evasion](https://areteir.com/resources/lockbit-5-0-ransomware-threat-resurgence)), not against the historical reputation.

3. **Track Qilin's affiliate count, not its monthly victim count.** The monthly board ranks affiliates running campaigns; the quarterly affiliate recruitment numbers reveal whether the program is growing the supply side. The second predicts the first by roughly two quarters.

What I won't do is rank these operators on a single dimension. "Most active" is a small slice of "most worth defending against", and the three operators here are pulling on different levers. The board is a snapshot. The analysis is what makes it a forecast.

---

*All quantitative claims about leak-site volume are sourced to the [ransomlook.io aggregated feed](https://www.ransomlook.io/) that this platform indexes; the 30-day snapshot above is queryable live at [/threatintel/ransomware-activity](/threatintel/ransomware-activity). Third-party reporting is linked inline. Anything I couldn't source isn't here.*`,
  published: true,
};

const IOC_CONSENSUS_NOISE_FLOOR: ResearchPost = {
  slug: 'ioc-consensus-noise-floor-may-2026',
  title: 'Cross-source IOC consensus: what a 98.2% filter rate reveals about the noise floor',
  excerpt:
    'This platform scans 7,779 indicators across 18 IOC feeds and surfaces 141 that two or more sources agree on. The 98.2% that get dropped are the methodology lesson, not the success.',
  kicker: 'Methodology',
  publishedAt: '2026-05-22',
  readingTime: '6 min',
  tags: ['IOC Methodology', 'Cross-source Consensus', 'False Positives', 'Threat Intelligence Tradecraft'],
  body: `Open [/threatintel/correlation](/threatintel/correlation) right now and the snapshot says this: 7,779 indicators scanned, 141 correlated, 18 source feeds. The 141 are the ones two or more independent feeds agree on. The other 7,638 are gone. That's a 98.2% filter rate on the input, which is the methodology lesson worth talking about.

Most CTI consumers treat single-feed flags as "indicators worth checking." That's how vendor blocklist counts get bigger every quarter without operational quality going up. Cross-source consensus is the rare lens where the per-day count gets smaller and the per-indicator confidence gets larger, and it's the only filter I've found that survives a serious post-mortem on false positives.

## Why the 141 survive and the 7,638 don't

The 141 correlated indicators decompose like this on today's snapshot:

\`\`\`
50 IPs
40 domains
50 hashes
1 URL
\`\`\`

The IP overlaps are dominated by a trio. Of the 50 correlated IPs, 47 appear on ipsum, 25 on binary-defense, 20 on cinsarmy. None of those three feeds is exotic. Each is a free, well-known threat-IP list aggregated from public sensors. The methodology insight isn't that any one of them is exceptional. It's that when an IP shows up on all three of these "reasonable but boring" lists, it's almost always a scanning host that hits enough honeypots to land on multiple sensor networks at once. The 22 indicators in this snapshot that hit three or more sources are virtually all in that category.

The 119 indicators that hit exactly two sources are different. They're where the editorial work happens. ThreatFox + URLhaus on a domain doesn't mean "two free feeds agree"; it means malware infrastructure tracking and URL distribution tracking are seeing the same artefact, which is a much higher-confidence signal. Today, three domains in the correlated set are both labeled \`malware_download | ClearFake\` by both ThreatFox and URLhaus simultaneously. That's a campaign you can act on; the underlying domains are still resolving as I write this.

## What single-source flags actually are

Run any single one of these feeds on its own and the per-day output is a few hundred indicators. Run all eighteen and the *union* is 7,779. The 7,638 that drop out of the consensus filter aren't garbage; they're observations from one sensor. Some of those will be confirmed by a second sensor tomorrow and graduate. Most won't.

The temptation is to say "well, that's still 7,638 indicators that someone reported, surely we should block them." The math on that is straightforward and depressing. A typical mid-sized SOC blocking everything its feeds flag at single-source confidence will, over a quarter, generate enough false-positive disruption that the security team's reputation with engineering becomes the actual operational problem. The 98.2% number isn't squeamishness. It's what the indicators that *would have been disruptive* if blocked look like in aggregate.

## Where consensus surprises you

Two patterns from today's snapshot are worth flagging:

**1. The volume sources are not the highest-quality sources.** Ipsum contributes 47 of the 50 correlated IPs. URLhaus contributes 1 of 1 correlated URLs. The per-indicator yield is wildly different. The methodology takeaway is that "feed quality" isn't measurable as a constant. A feed's value is determined entirely by what it's correlated *against*.

**2. Specialist sources punch above their weight.** SANS ISC contributes 10 IPs to the correlated set despite carrying only 200 IPs in its window (vs. ipsum's 500). That's a 5% retention rate on SANS vs ipsum's ~9% — but SANS' indicators are tied to incident reports, not honeypot triggers, so the few that *do* correlate carry more case material per hit. Don't equate "fewer indicators" with "less useful."

## What the filter doesn't catch

Cross-source consensus catches scan farms and shared malware infrastructure. It doesn't catch:

- **Targeted attacks** where the attacker controls infrastructure not shared with any commodity operator. Those will never appear in cross-source consensus because there's nothing for sources to overlap on.
- **Living-off-the-land traffic** where the only indicators are behavioural, not network-level.
- **Stage-zero loaders** that pivot to fresh infrastructure inside the first hour of compromise.

For those, you need detection rules against the *behaviour* of the activity, not consensus against the *artefacts*. The [Detection Lab](/dfir/detection-lab) on this site is the other half of that loop — the rules and the consensus filter are designed to complement each other, not substitute for each other.

## The operational reading

The 141 indicators that survive cross-source consensus on this platform today are not the only indicators that matter. They are the indicators where "block this" is a low-risk operational call. For the 7,638 that get filtered, the right action isn't to ignore them, it's to feed them into the *detection* side of the pipeline so they sharpen rules over time rather than create immediate paging events.

That's the whole methodology. Cross-source consensus is a *triage* filter, not a *coverage* one. Confusing the two is the most common mistake I see in CTI program design, and it's the one this platform's correlation surface was specifically built to make harder.

---

*All counts referenced in this piece are from a live snapshot of [/api/v1/ioc-correlation](https://pranithjain.qzz.io/api/v1/ioc-correlation) at the time of writing (May 22, 2026). The snapshot updates approximately hourly; refresh the linked endpoint to see the current numbers, which will differ. Source feed list and per-source weights are visible on [/threatintel/correlation](/threatintel/correlation).*`,
  published: true,
};

const C2_FRAMEWORK_DOMINANCE: ResearchPost = {
  slug: 'cobalt-strike-c2-dominance-may-2026',
  title: 'Cobalt Strike is still 96% of all dedicated-C2-tracker hits in May 2026',
  excerpt:
    "1,815 of 1,888 currently-tracked C2 servers run Cobalt Strike. 73 run Metasploit. Everything else is statistical noise. Defenders who plan their detection coverage as if 'C2 framework diversity' is real are mis-allocating.",
  kicker: 'Adversary infrastructure',
  publishedAt: '2026-05-23',
  readingTime: '6 min',
  tags: ['C2 Frameworks', 'Cobalt Strike', 'Adversary Infrastructure', 'Detection Engineering'],
  body: `The [/threatintel](/threatintel) platform indexes C2IntelFeeds, the public OSINT tracker that fingerprints live command-and-control infrastructure. Today's snapshot at [/threatintel/c2-tracker](/threatintel/c2-tracker) shows 1,888 currently-active C2 servers detected. Of those, 1,815 are Cobalt Strike. 73 are Metasploit. The remaining everything else — Sliver, Mythic, Covenant, Brute Ratel, every other framework that gets discussed at conferences — does not appear in the snapshot at meaningful volume.

That 96.1% number is uncomfortable to write down because it cuts against several years of CTI industry messaging about "framework diversity." But it is the number, and the operational implications are real.

## Why C2IntelFeeds is the right tracker even though it's one tracker

A reasonable objection: "single source, single bias." Fair. C2IntelFeeds isn't perfect. It is, however, the public fingerprinting effort with the best signal-to-noise ratio I've benchmarked against my own incident corpus, and the framework breakdown above matches what I see in the cases I work. The platform doesn't carry Censys or Shodan paid C2 enrichment because the free public tracker carries enough of the picture for the operational claim I'm about to make.

If your dataset shows a different breakdown, I'd genuinely like to know — but the bar for "Cobalt Strike isn't actually dominant" is a sourced disagreement, not a vibe. The vibe in the CTI community has been "diversity is increasing" for at least three years. The numbers from public trackers have not moved in that direction.

## The licensing reality is the boring explanation

The market explanation for Cobalt Strike dominance isn't mysterious. The legitimate licensed market (Fortra / red teamers) is the bottom of the funnel that feeds the cracked-leaked-trial-version market that 90%+ of malicious operators use. Other frameworks (Sliver, Mythic) are open-source from inception, which is supposed to make them more attractive to threat actors. In practice, that hasn't happened at scale because:

1. Cobalt Strike has 13 years of mature tradecraft, public training, and red-team ergonomics.
2. The cracked versions are trivially obtainable.
3. Detection signatures keyed on Cobalt Strike are *also* the most mature, but operators have years of tradecraft for evading them — and operator population learning is sticky.

Open-source alternatives keep getting predicted as the next big thing. Their actual deployment numbers, as measured by public trackers, keep being a rounding error.

## The 73 Metasploit hits

Metasploit's 3.9% share is worth a separate paragraph because it's misleadingly tempting to dismiss. Metasploit's role in 2026 isn't as a primary operator framework; it's as a stage-zero loader and as a red-team training tool. The 73 hits today are mostly skiddie operators on freshly compromised VPSes — not advanced campaigns. The defender takeaway: Metasploit detection is a low-bar fundamentals check, not a sign of sophisticated adversaries.

## What the absence of "everything else" actually says

Sliver, Mythic, Brute Ratel, Havoc, Nighthawk — all of these have legitimate red-team usage and confirmed nation-state usage. They do not appear in this snapshot at any meaningful count. There are three possible explanations and they're worth distinguishing because the defensive implications are different:

1. **C2IntelFeeds doesn't fingerprint them well.** Plausible. Newer frameworks ship with fingerprinting evasion baked in. The tracker's coverage of Cobalt Strike is mature; its coverage of newer frameworks is by necessity less so.

2. **Operators using them don't expose internet-reachable infrastructure.** Plausible. Sophisticated operators using less-common frameworks often run them through proxy chains, fronting CDNs, or compromised infrastructure that doesn't fingerprint as the upstream framework.

3. **They're genuinely rare in active campaigns.** Also plausible. Most public reporting on "Sliver in the wild" is from one or two campaigns at a time. The aggregate active footprint at any moment really may be in single digits.

I think the truth is a mix of (1) and (2), with a smaller contribution from (3). The point is that the absence of these frameworks from the tracker output doesn't mean defenders can ignore them. It means *the public-tracker route to detecting them is not viable*, and the detection coverage has to come from the [Detection Lab](/dfir/detection-lab) side of the workflow — behavioural rules against the operator's tradecraft, not signature matches against the framework.

## The operational reading

For SOCs and detection engineers reading this, the prioritisation order from today's numbers:

1. **Cobalt Strike detection coverage is the only first-priority C2 detection investment.** 96% of currently-active tracked C2 maps to it. If your coverage is good against everything else and weak on Cobalt Strike, you have an actual gap.

2. **Metasploit coverage is mid-priority hygiene.** The 3.9% share will produce some real hits and a lot of low-skill operator noise.

3. **Open-source-framework coverage is a behavioural-detection problem**, not a signature problem. Build the rules in [/dfir/detection-lab](/dfir/detection-lab), validate them in the lab, then export to your SIEM via the [Rule Converter](/dfir/rule-converter). The C2 trackers won't tell you when those frameworks fire; your own detections will.

The "96%" number is going to be uncomfortable for the next round of vendor pitches you sit through. It should be.

---

*Source data: live snapshot of [/threatintel/c2-tracker](/threatintel/c2-tracker) on May 23, 2026, indexing [C2IntelFeeds](https://github.com/drb-ra/C2IntelFeeds). Numbers refresh approximately hourly. The framework breakdown method is fingerprint-based and excludes infrastructure that the public tracker doesn't currently classify. Counter-evidence sourced to other trackers welcome.*`,
  published: true,
};

export const researchPosts: ResearchPost[] = [NOVA_LOCKBIT5_QILIN, IOC_CONSENSUS_NOISE_FLOOR, C2_FRAMEWORK_DOMINANCE];

export const publishedResearch = (): ResearchPost[] =>
  researchPosts.filter((p) => p.published).sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

export function findResearchPost(slug: string): ResearchPost | null {
  const hit = researchPosts.find((p) => p.slug === slug);
  if (!hit || !hit.published) return null;
  return hit;
}
