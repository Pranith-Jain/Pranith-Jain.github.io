# Threat-Intel Feeds Program — Design Spec

**Date:** 2026-05-18
**Status:** Approved (design); pending spec review
**Author:** Claude (brainstormed with user)

## Summary

A phased program upgrading the threat-intel surface of the portfolio. Six
independently-implementable sub-projects (A–G; F is cross-cutting). Each
sub-project gets its own implementation plan and ships incrementally in the
stated build order. The chosen approach is **additive, following existing
codebase patterns** — extend the per-route source-config arrays in place,
add net-new pages where required, reframe one existing page, and register
every new dataset in the feed-status registry. No shared-registry refactor
(rejected as over-engineering against the codebase's deliberate per-route
pattern).

## Cross-Cutting Constraints (apply to every sub-project)

1. **Free OSINT sources only.** No paid APIs/tiers. The ransomware.live PRO
   key already exists in the Worker env (`Infostealer.tsx` already calls
   `/api/v1/rl/infostealer`) and may be reused for A and E.
2. **Defensive / intelligence-about framing.** For combolist, stealer-log,
   and breach-forum work the platform surfaces _intelligence about_ these
   sources — names, counts, trends, activity timestamps, and links to public
   trackers. It MUST NOT mirror, host, proxy, parse, or redistribute stolen
   credentials, combolists, or breach contents. Aggregation is limited to
   metadata published by reputable OSINT trackers (DarkWebInformer,
   deepdarkCTI, abuse.ch, etc.).
3. **F — Live surfaces, not only Metrics.** Every new dataset MUST get its
   own page surface (live feed/table/panel) AND a `feed-status.ts` PROBE
   entry so health is observable. Metrics-page aggregation is optional and
   secondary.
4. **Follow existing patterns.** New Worker routes mirror the existing
   fetch+cache+`feed-status` shape. New pages mirror existing threatintel
   page structure (`DataState`, refresh key, window toggles where relevant).
   Typecheck (`tsc --noEmit` for both root and `api/tsconfig.json`) and
   `eslint --max-warnings 0` gate every sub-project. Prettier/lint-staged
   runs on commit.

## Reference: current source-config locations (for extension)

| Route                               | Source list                  | Current                                      |
| ----------------------------------- | ---------------------------- | -------------------------------------------- |
| `src/data/rssFeeds.ts`              | `rssFeeds` array             | 100+ RSS configs                             |
| `api/src/routes/feeds.ts`           | `ALLOWED_HOSTS` set (~7–138) | 138 hosts                                    |
| `api/src/routes/c2-tracker.ts`      | upstream consts (~10–16)     | 3 upstreams                                  |
| `api/src/routes/telegram-feed.ts`   | `CHANNELS` (~75–172)         | 22 channels                                  |
| `api/src/routes/reddit-feed.ts`     | `SUBS` (~36–101)             | 15 subs                                      |
| `api/src/lib/deepdarkcti-parser.ts` | `DDC_FILES` (~28–61)         | 17 files                                     |
| `api/src/routes/detection-rules.ts` | `SOURCES` (~29–129)          | 11 repos                                     |
| `api/src/routes/feed-status.ts`     | `PROBES` (~89–492)           | 18 probes                                    |
| `api/src/routes/ransomwarelive.ts`  | proxied RL resources         | incl. `negotiations`, `cyberattacks`, `yara` |

---

## A — Ransomware Negotiation Page (build 1st)

**Goal.** A scannable view of ransomware negotiation chats from
ransomware.live, with per-negotiation transcript drill-down.

**Backend.** `/api/v1/rl/negotiations` is already proxied (1h cache) in
`ransomwarelive.ts`. No new route unless a transform is needed. During
planning, fetch the live response once and pin the exact schema; design
assumes fields approximately: group, victim/company, ransom demand, amount
paid, currency, status, first/last message timestamps, and a `messages[]`
array (sender, timestamp, text). If the proxy returns raw upstream, add a
thin normalizing transform in a new `api/src/routes/negotiations.ts` (or
extend the RL route) producing a stable typed shape; otherwise consume the
proxy directly. Add a `negotiations` PROBE to `feed-status.ts`.

**Frontend.** New page `src/pages/threatintel/Negotiations.tsx`, route
`/threatintel/negotiations` registered in `src/App.tsx` (+ route-preloader if
the pattern requires it). Layout:

- Header with refresh + summary stats (count, avg discount %, payment-rate).
- Sortable table: group · victim · demand · paid · discount % · status ·
  first/last date. Column sort + group/status filter.
- Row click expands an inline transcript panel (chronological messages,
  sender-styled, monospace), collapsible.
- Empty/error/loading via existing `DataState`.
- Cross-links from `threatintel/Home.tsx` and `RansomwareActivity.tsx`.

**Edge cases.** Missing amounts → "—"; discount % only when both demand &
paid present and demand>0; transcript may be empty (show "no transcript");
upstream unauthorized/empty → DataState error, no cache poisoning (follow
existing RL proxy cache rules).

**Testing.** Unit test for the discount %/payment-rate derivation and the
normalize transform (if added). Manual smoke on the page.

---

## D — Feed Source Expansion (build 2nd)

**Goal.** Materially widen free coverage across Dark Web, Tech AI, Threat
Feeds, C2, Telegram, Reddit, and Scam — by extending existing source arrays.

**Changes (curated free sources; final list confirmed during planning by
verifying each feed resolves):**

- `rssFeeds.ts`:
  - _Dark Web:_ vx-underground, Cyble blog, Group-IB blog, BushidoToken,
    RansomLook blog.
  - _Tech AI:_ Anthropic news, Google DeepMind blog, Hugging Face blog,
    The Decoder, Import AI.
  - _Threat Feeds:_ Mandiant/Google Cloud threat blog, Rapid7 blog, JPCERT/CC,
    NCSC-UK, ACSC, CERT-In, ENISA, AhnLab ASEC.
  - _Scam:_ ACCC Scamwatch, Action Fraud UK, additional Google-News scam
    queries (pig-butchering, recovery-scam).
- `feeds.ts` `ALLOWED_HOSTS`: add any new hostnames introduced above.
- `c2-tracker.ts`: add Feodo Tracker (abuse.ch), ViriBack C2 tracker (free
  CSV), C2IntelFeeds domain list (in addition to existing IP/Port). Extend
  the source-summary + framework counting accordingly.
- `telegram-feed.ts` `CHANNELS`: add reputable CTI/news/tracking channels
  only (e.g. ransomware/breach _tracking_ channels). Explicitly exclude any
  channel whose purpose is distributing stolen credentials/combolists.
- `reddit-feed.ts` `SUBS`: add r/redteamsec, r/purpleteam, r/digitalforensics,
  r/Pentesting, r/cybersecurity_news (final set validated to exist & be
  active).
- `feed-status.ts`: bump/confirm probes so new upstreams are health-checked
  (c2-tracker probe metrics reflect added feeds; aggregator-backed pages
  already covered via existing probes — verify, add if missing).

**Constraints.** Each added feed must resolve and parse with the existing
aggregator/CSV logic; dead/duplicate feeds are dropped, not force-fit. No
new abstractions — array entries only, plus minimal parsing glue for the new
C2 CSV formats.

**Testing.** Where C2 parsing changes, unit-test the new CSV parsers.
Aggregator/RSS additions verified by manual fetch during planning + page
smoke. Lint/typecheck gate.

---

## B — Re-leaks Reframe (build 3rd)

**Goal.** `/threatintel/re-leaks` stops leading with noisy normalized victim
tokens and becomes trend-first across **sector** and **operation-type**,
plus group-pair re-claim trends and a timeline.

**Backend (`api/src/routes/victim-releaks.ts`).** Keep
`lib/victim-normalize.ts` as the grouping key (unchanged dedupe logic). Extend
the response with aggregates computed server-side:

- `by_sector`: re-leak counts per heuristic sector (reuse existing
  `sector-classifier`).
- `by_optype`: re-leak counts per operation type — RaaS / double-extortion /
  leak-only — derived from a small curated group→type lookup (new
  `api/src/lib/ransomware-optype.ts`; unknown→"unclassified", shown honestly).
- `group_pairs`: top group↔group re-claim pairs with counts.
- `timeline`: re-leak events bucketed by day over the existing window.
- Existing per-victim `releaks[]` retained but marked secondary (drill-down).

**Frontend (`VictimReleaks.tsx`).** Reorder to: (1) sector breakdown bar,
(2) operation-type breakdown bar, (3) group-pair re-claim list, (4) re-leak
timeline (reuse the SVG sparkbar/HBar primitives from Metrics or local
equivalents — do not add a chart dependency). Raw victim names move into an
expandable "individual re-leaks" section, de-emphasized; generic single-word
labels no longer headline anything.

**Edge cases.** Unclassified sector/optype bucketed explicitly and labeled;
empty window → DataState empty; classifier is best-effort (label as
heuristic, consistent with existing sector panel copy).

**Testing.** Unit tests for `by_sector`/`by_optype`/`group_pairs`/`timeline`
aggregation given a fixture of re-leak rows. Page smoke.

---

## C — Infostealer Upgrade + Combo/Forum Intel (build 4th)

**Goal.** Broaden the existing tabbed `Infostealer.tsx` with more free
sources and a new defensive **combo & stealer-forum intel** tab.

**Backend.**

- Hudson Rock free Cavalier endpoints: add a thin route
  `api/src/routes/hudsonrock.ts` proxying only Hudson Rock's _free_ public
  endpoints (e.g. domain/email exposure summary counts) with cache +
  feed-status probe. Verify free-tier endpoints & ToS during planning; if
  unusable for free, drop this bullet (not load-bearing).
- Combo/forum intel aggregation: new route
  `api/src/routes/stealer-forum-intel.ts` that aggregates **metadata only**
  from already-integrated free trackers — deepdarkCTI `forum.md` &
  `telegram_infostealer.md` (via existing parser), DarkWebInformer
  (allowlisted), and tagged hits from the existing Reddit/Telegram feeds.
  Output: forum/channel names, category, last-seen, source link, simple
  activity counts/trends. No credential/data fields, ever.

**Frontend.** Add a tab "Combo & stealer-forum intel": ranked list of
tracked forums/channels with category, activity trend sparkline, and
source link; plus a short "Reddit/Telegram chatter about stealers/combos"
strip filtered from existing feeds by family/keyword tags. Existing tabs
retained; new sources also appended where they enrich an existing tab.

**Constraint (hard).** Anything that would render or relay actual stolen
data is out of scope and must not be implemented. Reviews must reject it.

**Testing.** Unit test the metadata aggregation/ranking. Page smoke.

---

## E — Detection Page RL Panels (build 5th)

**Goal.** On the YARA/detection page, add ransomware.live-backed
attack→detection context without disturbing the existing 11-repo rules.

**Backend.** Reuse proxied `/api/v1/rl/cyberattacks` (press/recent) and
`/api/v1/rl/yara/:group`. Add feed-status probes if not present.

**Frontend.** On the existing YARA page (`src/pages/dfir/YaraManager.tsx` —
exact target file confirmed during planning; user referenced `/dfir/yara`):

- Panel 1: "Recent ransomware cyber-attacks" from `/rl/cyberattacks` —
  compact list (group, victim, date, link).
- Panel 2: "Ransomware-group YARA (ransomware.live)" — group picker →
  `/rl/yara/:group` rules rendered read-only, copy button.
- Cross-link: selecting an attack's group pre-selects the YARA panel
  (attack→detection pivot). Existing repo-rule UI untouched.

**Testing.** Light — transform/formatting unit test if any; manual smoke.

---

## G — Breach Forums (build 6th)

**Goal.** Both integration targets: fold free breach-forum trackers into the
Dark Web feed AND ship a dedicated tracker page. Intelligence-about only.

**Backend.** New route `api/src/routes/breach-forums.ts` aggregating free
metadata sources: deepdarkCTI `forum.md` + `markets.md` (existing parser),
DarkWebInformer (allowlisted RSS/site), and a small curated free
forum-directory constant (names, status, public tracker links). Cache +
feed-status probe. No forum content scraping; no stolen-data fields.

**Frontend.**

- Fold: add the breach-forum tracker entries into the Dark Web aggregator
  page surface (`DarkWeb.tsx`) as an additional section/source.
- New page `src/pages/threatintel/BreachForums.tsx`, route
  `/threatintel/breach-forums`: list of tracked forums/markets with
  category, status, last-activity, and source links; simple activity trend.
  Cross-linked from Dark Web + Home.

**Constraint (hard).** Same defensive boundary as C. Directory/status/trend
metadata only.

**Testing.** Unit test the aggregation/dedupe. Page smoke.

---

## Build Order & Dependencies

A → D → B → C → E → G. A is fully independent (fastest clean win). D widens
sources that C and the Dark Web fold (G) benefit from. B is independent and
can slot anywhere. C depends conceptually on D's expanded Telegram/Reddit
sources for the chatter strip. E is independent. G reuses the deepdarkCTI
parser and the allowlist updated in D.

Each sub-project: own implementation plan, own commit(s), own
typecheck/lint/test gate, deploy at the user's instruction (not
automatically).

## Out of Scope / YAGNI

- No shared free-source registry / aggregator refactor.
- No chart library — reuse hand-rolled SVG primitives.
- No paid data sources or tiers.
- No mirroring/parsing/redistribution of stolen credentials, combolists, or
  breach contents anywhere in the program.
- No unrelated refactoring of routes not listed above.

## Risks

- ransomware.live free/PRO endpoint shapes or rate limits differ from
  assumptions → mitigated by pinning live schema during each sub-project's
  planning before coding.
- Some proposed free RSS/Telegram/Reddit sources may be dead or unsuitable →
  validated during planning; dropped rather than force-fit.
- Ethical boundary drift on C/G → enforced by explicit hard constraints here
  and at code review.
