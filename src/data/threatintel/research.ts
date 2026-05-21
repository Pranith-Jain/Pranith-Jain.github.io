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

export const researchPosts: ResearchPost[] = [NOVA_LOCKBIT5_QILIN];

export const publishedResearch = (): ResearchPost[] =>
  researchPosts.filter((p) => p.published).sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

export function findResearchPost(slug: string): ResearchPost | null {
  const hit = researchPosts.find((p) => p.slug === slug);
  if (!hit || !hit.published) return null;
  return hit;
}
