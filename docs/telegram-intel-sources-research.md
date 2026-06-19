# Telegram Intelligence Sources — Deep Research & Integration Plan

> Researched: 2026-06-19 · Companion to `threat-intel-sources-research.md` and `docs/OSINT-THREAT-INTEL-AUDIT.md`.
> Scope: Free and free-tier Telegram-derived threat intelligence, mapped against the
> current `TelegramMonitor` + `TelegramFeed` + leak-monitor stack with concrete
> integration recommendations.

## 0. Where we stand today (audit summary)

| Surface | Status | Key file |
|---------|--------|----------|
| Curated channel firehose (t.me/s/ preview scrape, ~25 channels) | ✅ Live | `api/src/routes/telegram-feed.ts` |
| Channel-level quality scoring + auto-discovery → review queue | ✅ Live | `telegram-leak-monitor.ts` |
| Hourly leak scanner (credentials / hashes / CVEs / domains / crypto) → D1 | ✅ Live | `telegram-leak-monitor.ts` |
| Per-channel leak feed + stats + channel discovery UI | ✅ Live | `src/pages/threatintel/Telegram*` |
| Telegram bot → ingest chat-pushed leaks via Bot API webhook | ✅ Live | `telegram-leak-bot.ts` |
| Curated catalog (~25 channels with category + language + audience) | ✅ Live | `src/data/dfir/telegram-watch-catalog.ts` |
| Outbound cron archive → posted to `TELEGRAM_CHANNEL_ID` | ✅ Live | `telegram-archive.ts` |
| `deepdarkCTI` parser (GitHub-served markdown; Telegram section) | ✅ Live | `api/src/lib/deepdarkcti-parser.ts` |
| `mythreatintel` Spanish CVE/ransomware template parser | ✅ Live | `api/src/lib/mythreatintel-parser.ts` |
| Wiki article on Telegram OSINT tradecraft | ✅ Live | `src/data/dfir/wiki-articles.ts` (`telegram-osint` slug) |

**What's missing** — the gap the rest of this doc fills — is everything that
goes BEYOND "scrape a fixed list of public channels". Specifically:

1. **Channel discovery at scale.** Currently we discover new channels only by
   spotting `t.me/...` mentions inside the already-curated feed. There are
   free, public, off-the-shelf indexes (tgstat, RSSHub, deepdarkCTI, OSINT
   lists) that we can pull in to widen the net without a bot account.
2. **Channel statistics & metadata.** Subscribers, view-per-post medians,
   posting cadence, growth trend, related channels — critical for "is this
   channel worth monitoring" triage. tgstat / telemetr / tgram supply this.
3. **Telegram-derived IOCs as a first-class feed.** The leak scanner
   currently stores IOCs in D1 (`telegram_leak_entries`) but does not push
   them into the cross-source IOC consensus / MISP / OpenCTI pipeline. The
   platform already has 24-source IOC fan-out; Telegram should be source #25.
4. **Historical / paginated channel content.** t.me/s/ only returns the
   most recent ~30-50 messages. RSSHub's `/telegram/channel/:name` route
   wraps the same endpoint with retry/ETag/caching — and is free, no key.
5. **Bot-API-only chat metadata (joins/leaves/post counts).** The bot can
   join a public channel and read member counts + admins, but only when
   it's actually a member. We currently never set up the bot for read-only
   membership — every channel we monitor is via the public preview, which
   gives us no join/leave signal at all.
6. **Regional / multi-language coverage.** Our curated list is EN/ES/RU/DE
   heavy but lacks Persian (APT35/APT42 chatter), Arabic, and Chinese
   (PRC APT channels). This is a real, addressable gap.

The rest of this document is the source-by-source deep dive that backs the
recommendations.

---

## 1. The t.me/s/ preview scrape (current foundation — keep, expand, harden)

**What it is.** Telegram serves a public, no-account-required HTML preview
of any channel at `https://t.me/s/<handle>`. The page shows the last ~20
messages with timestamps, permalinks, view counts, and text. Bot-free,
no rate-limit disclosure, no auth.

**What we have.** `telegram-feed.ts` already implements this with:
- 4-way concurrent fetch + 30 min KV/Cache TTL
- HTML-entity decode + channel quality scoring (recent %, dupe %,
  median length, posts/day)
- 50 messages/channel cap, 30-day freshness window
- 22 curated handles + user-added custom channels (KV-stored)

**What we don't have / should add.**
- **Pagination.** `t.me/s/<handle>?before=<msg_id>` is supported server-side
  and lets us walk back further than the preview window. Cost is one
  additional subrequest per page; cap at 5 pages (~250 messages/channel)
  for the on-demand "load more" path.
- **Media awareness.** Preview pages include `tgme_widget_message_video`
  and `tgme_widget_message_photo` classes — the parser currently drops
  these. A `has_media: boolean` flag is enough; we don't need to fetch
  the actual media.
- **Forward signature.** Forwarded messages carry the original channel
  handle in `tgme_widget_message_forwarded_from`. Surfacing "this was
  forwarded from @ContiLeaks" is a great pivot for tracking viral leaks.
- **Reactions / reply threads.** `tgme_widget_message_reactions` and the
  `reply_to_message_id` data are in the HTML. Cheap to extract.

**Cost shape.** Each page is 30-130 KB. Pagination is one extra
subrequest per page; 5 pages per channel × 22 channels = 110 extra
subrequests per deep-refresh. Schedule deep-refresh (full pagination) on
a 6h cron, keep the 30-min light-refresh on the 50-msg window for the
real-time surface.

**Verdict: keep as the backbone. Add the four enrichments above.**

---

## 2. RSSHub — the single biggest "free" win

**URL.** `https://rsshub.app` (public instance) or self-host
(`github.com/DIYgod/RSSHub`, MIT, 16k+ stars, 700+ routes including a
`/telegram/channel/:name` route).

**What it gives.** A normalized JSON-or-RSS feed for any public Telegram
channel. The route definition is `https://rsshub.app/telegram/channel/<handle>`
and returns a JSON Feed you can fetch from a Worker. The JSON shape:
`{title, link, items: [{title, url, date_published, content_html,
  authors, attachments: []}]}`.

**Why it's a big deal.**
- Pagination via `?before=…` query param — same upstream capability as
  the raw preview, but RSSHub already handles retry + 304 + ETag for us.
- Cross-channel JSON format — one parser for the whole firehose.
- `rsshub.app` is free, no key, public. 1 req/s soft limit; one
  subrequest per channel per 15 min is trivially within that.
- The official `telegram/channel` route supports `?search=...` and
  `?showMediaPreview=true` flags.

**The catch.** The public `rsshub.app` instance is community-funded and
occasionally rate-limits anonymous traffic. Two safety nets:
1. Cache the JSON in Cloudflare Cache API for 15 min per channel so
   we're never hitting the public instance more than once per channel
   per 15 min anyway.
2. Have a deployable `wrangler.jsonc` change for self-hosting on the
   same Worker / a separate service if `rsshub.app` ever 5xx's.

**Verdict: HIGHEST priority. Replace the bespoke HTML parser in
`telegram-feed.ts` with an RSSHub JSON consumer. Falls back to the
current HTML parser if RSSHub 5xx's. Estimated diff: ~120 lines of new
code, ~80 lines deleted.**

---

## 3. tgstat.com — channel statistics, discovery, and the best free search

**URL.** `https://tgstat.com` · Free tier: 5 req/min unauthenticated, 60
req/min with a free key (sign-up required, no credit card).

**What it gives (free tier).**
- Channel search by keyword: `https://tgstat.com/en/search?q=<kw>` returns
  HTML with subscriber count, growth, posts/day, category, and the channel
  handle. The HTML is straightforward to parse (we already have a similar
  parser for `t.me/s/`).
- Channel detail page: `https://tgstat.com/en/channel/@<handle>` —
  subscriber count, avg post reach, post-per-day trend, top mentions.
- Public channel rankings by category (ransomware, leak, CTI, etc.).
- "Similar channels" suggestion block on every channel page.

**Auth.** None for the HTML pages; optional free API key for the JSON
endpoints behind `https://api.tgstat.com/`. The HTML path is the right
place to start because (a) no key to provision, (b) same shape for every
channel — easy to write one parser.

**Cost shape.** Each search is 1 subrequest; each channel detail is 1
subrequest. Cache both 12h (subscriber counts move slowly).

**Verdict: HIGH priority. Build a `tgstat-search` endpoint that takes a
keyword and returns candidate channels with subscriber/post metadata.
This is the single biggest "find new channels" improvement we can make
without a Telegram account.**

---

## 4. telemetr.io — channel growth trends + cross-platform

**URL.** `https://telemetr.io` · Free tier: 1000 req/day with a free key
(same signup shape as tgstat). Without a key the public pages are
readable but their robots/caching is more aggressive.

**What it gives.** Channel growth timeline (subscriber delta per day for
the last 30d), post view count, similar channels, related Telegram
groups, and a public channel directory. The growth-trend data is the
uniquely valuable bit — tgstat gives a snapshot, telemetr gives a chart.

**Verdict: MEDIUM. Pull in only when the user clicks "growth trend" on a
channel we already know about. Don't pre-warm — the 1000 req/day budget
is too tight to be cavalier with.**

---

## 5. deepdarkCTI — already parsed, currently under-used

**URL.** `https://github.com/fastfire/deepdarkCTI` · License: MIT.

**What it gives.** A living markdown index of dark-web / Telegram
channels. The repo is updated daily by a community of OSINT researchers
and includes:
- `telegram_threat_actors.md` — handles + actor attribution
- `telegram_infostealer.md` — stealer-log distribution channels
- `forum.md`, `markets.md`, `phishing.md`, `rat.md`, `exploits.md`,
  `malware_samples.md`, `discord.md`, `counterfeit_goods.md`, `commercial_services.md`,
  `defacement.md`, `others.md`, `search_engines.md`, `maas.md`

**Where we have it.** `api/src/lib/deepdarkcti-parser.ts` parses every
file. The current consumers are `DeepDarkCTI` page + a few others.

**What we should add.**
- A "Telegram threat-actor index" page that pivots deepdarkCTI's
  `telegram_threat_actors.md` by actor name → shows the linked handles,
  attack type, and a t.me/s/ live preview. This turns the catalog from
  a static list into a queryable actor index.
- An auto-correlator: when a `telegram_discovered_channels` row appears,
  cross-reference it against deepdarkCTI and surface a "matches actor:
  X" badge if the handle is already in the index.

**Cost shape.** One git raw fetch per file per 6h. The data is small
(under 1 MB total) and our existing parser handles the shape.

**Verdict: HIGH priority. Cheap integration, big analyst value.**

---

## 6. RSS-Bridge (alternative to RSSHub)

**URL.** `https://github.com/RSS-Bridge/rss-bridge` · MIT, 8k stars.

**What it gives.** Similar to RSSHub but with fewer Telegram routes —
the `TelegramBridge` provides `/telegram?handle=<handle>` and
`/telegram-channel?handle=<handle>`. The public instance list is at
`https://rssbridgeinstances.nosebs.ru/` (rotates every hour).

**Why not just RSSHub?** RSSHub's coverage is wider (700+ routes),
but RSS-Bridge's Telegram bridge is more conservative — less likely to
break when Telegram's preview HTML changes. Useful as a fallback when
RSSHub is down.

**Verdict: LOW priority. Only wire it up as the second-fallback when
both RSSHub and the bespoke HTML parser fail.**

---

## 7. Open-source Telegram OSINT tools — worth mirroring, not running

| Project | What it does | Integration angle |
|---------|--------------|---------------------|
| [Telethon](https://github.com/LonamiWebs/Telethon) | Python MTProto client | Not for us (needs an account) |
| [Pyrogram](https://github.com/pyrogram/pyrogram) | Python MTProto client | Not for us (needs an account) |
| [telegram-channel-scraper](https://github.com/hatamiarash7/telegram-channel-scraper) | Headless scraper | Reference only |
| [awesome-telegram-osint](https://github.com/ItIsReallyMe/awesome-telegram-osint) | Curated tool list | Drop in `external-resources.ts` |
| [TelegramHawk](https://github.com/tejado/TelegramHawk) | OSINT tool (Python) | Reference |
| [Telerecon](https://github.com/p4-team/telerecon) | OSINT reconnaissance | Reference |
| [OSINT-Telegram-toolkit](https://github.com/ItIsReallyMe/OSINT-Telegram-toolkit) | Multi-tool aggregator | Reference |
| [tg-intel](https://github.com/cipher387/tg-intel) | Channel-intel scraper | Reference |
| [telegram-osint-services](https://github.com/paulpierre/telegram-osint-services) | TDLib-based discovery | Reference |
| [tgstat-cli](https://github.com/typical-use/tgstat-cli) | tgstat wrapper | Reference |
| [awesome-telegram-groups](https://github.com/paulpierre/awesome-telegram-groups) | Hand-curated group index | Add to `telegram-watch-catalog.ts` |

**The honest read.** Every mature Telegram OSINT tool in the open-source
ecosystem uses Telethon / Pyrogram / TDLib, which means a Telegram
**user account** (with a phone number). That's a deliberate opsec
boundary for this platform — we don't want the platform's egress IP
linked to a Telegram user account. The free web sources above (tgstat,
telemetr, RSSHub, deepdarkCTI) give us 90% of the value with zero
account risk.

**Verdict: the catalog (`telegram-watch-catalog.ts`) and the
`external-resources.ts` are the right homes for these references. Don't
try to embed the MTProto-based tools in the Worker.**

---

## 8. Threat-actor attribution datasets that include Telegram handles

These are static, but invaluable for "is this channel worth monitoring?"
triage.

| Source | What it adds | How to ingest |
|--------|--------------|---------------|
| [MITRE ATT&CK Groups](https://attack.mitre.org/groups/) | ~140 APT groups with country/sector/aliases | Already in our `actors.ts` data — add a `telegram_handles: string[]` field per actor |
| [MISP Galaxy Threat Actors](https://github.com/MISP/misp-galaxy) | 800+ actors with TTPs | Already pulled by `misp-galaxy-actors.ts` route — extend the parser to capture `associated-telegram-handle` custom fields |
| [Malpedia actors](https://malpedia.caad.fraunhofer.de/actors) | Actor → malware family mapping | Already have `malpedia.ts` provider |
| [Flashpoint Telegram actor reports](https://flashpoint.io/blog/) | Public blog posts naming handles | Manual enrichment, surface in `Wiki → Telegram OSINT` |
| [Group-IB Telegram-cited reports](https://www.group-ib.com/blog/) | Same | Same |
| [Intel 471 free reports](https://intel471.com/blog) | Same | Same |
| [CrowdStrike adversary profiles](https://www.crowdstrike.com/blog/category/adversary-profiles/) | Same | Same |
| [ransomwatch victim → leak-site chat](https://github.com/joshhighet/ransomwatch) | Maps victim to chat handle | Pull daily, correlate against `ransomware_activity` |

**Verdict: MEDIUM. Cheapest is adding `telegram_handles: string[]` to
`threat-actor-catalog.ts` and back-filling from the public vendor
reports. ~2-3 hours of work for a durable analyst-facing feature.**

---

## 9. The Telegram Bot API — what a free bot can actually do

A no-frills bot (we already have one, see `telegram-leak-bot.ts`) can
call these endpoints for free, no rate limit issues at our scale:

| Endpoint | What it gives | Worth doing? |
|----------|---------------|--------------|
| `getChat` | Channel title, description, member count, invite link, linked chat ID | ✅ Cheap — call once per curated channel on cron, store in KV |
| `getChatMemberCount` | Just the count, cheaper than getChat | ✅ Same as above |
| `getChatAdministrators` | Admin list, admin-promotion timestamps | ✅ Useful for "who's running this channel" pivot |
| `getUserProfilePhotos` | Profile photos of any user (with user_id) | ⚠️ Only useful if we know user_id |
| `getFile` | Download a file by file_id (from messages we received) | ✅ Already used |
| `getUpdates` | Polling fallback for messages pushed to the bot | ✅ Already used (webhook in production) |
| `createChatInviteLink` | Make a one-time invite link | ❌ Not relevant |
| `setChatDescription` / `setChatTitle` | Modify our own channels | ❌ Not relevant |

**The limit.** A bot **cannot** read messages from channels it isn't
an admin of. So this is purely for **channels the bot has been
explicitly added to** — typically a private tip channel a researcher
or partner has set up. We should not assume the bot can read arbitrary
public channels.

**Verdict: HIGH for the metadata side (member count + admins), MEDIUM
for the bot-pushed leaks. Both already work — we just need to wire the
metadata endpoints into the curated-channel cron and surface a
"members" column in `TelegramFeedResponse`.**

---

## 10. Telegram-as-a-service: free scrapers, JSON APIs

There are a handful of community-run JSON wrappers that accept a
channel handle and return parsed message JSON. They are third-party
dependencies with no SLA, but worth keeping in mind as fallbacks:

| Service | URL pattern | Format | Auth | Reliability |
|---------|-------------|--------|------|-------------|
| tg.i-c-a.su | `https://tg.i-c-a.su/json/<handle>` | JSON | None | Spotty, used by IntelOwl |
| t.me-preview-json (various forks) | `https://api.preview.t.me/<handle>` | JSON | None | No central instance |
| tchannels.me | `https://tchannels.me/<handle>` | HTML | None | Catalog only, no messages |
| lolz.live Telegram API | Internal | JSON | Free signup | CIS-focused |

**Verdict: LOW. These are not durable. The HTML parser + RSSHub combo
is the right primary path; treat these as emergency fallbacks only.**

---

## 11. Stealer-log specific channels (the part dark-web monitoring reaches)

`deepdarkCTI/telegram_infostealer.md` enumerates ~200 stealer-log
distribution channels. Our `hudsonrock.ts` route + `infostealer` page
already cover the index side. The Telegram side gives us:

- **Freshness signal.** A new sample dropped in a stealer-log channel
  appears 6-24h before it surfaces in Hudson Rock's index.
- **Bot/automation distribution.** Some stealer channels are tied to
  automated drop bots — the message text often includes the stealer
  family name, the originating marketplace, and the panel URL.
- **Combo-list trading.** Same shape as credential leaks but with
  bigger price tags.

**Verdict: HIGH. Wire stealer-log channels into the existing
`scanMessageForLeaks` pipeline. The IOC patterns already match
`email:password` — no new code in the parser, just a new
`STOLEN_LOG_KEYWORDS` list and a `stealer_log` leak_type.**

---

## 12. Cybercrime-phishing-scam specific channels (separate category)

Beyond stealer logs there are dedicated phishing-kit and scam channels
that don't always show up in deepdarkCTI's `phishing.md` because they
rotate fast. The `mythreatintel-parser.ts` already pulls structured
`ALERTA PHISHING` templates (if any) — the same parser pattern can be
applied to:
- `phishingradar` (already in our curated list)
- `cyberscams` (German phishing kit marketplace — verify t.me/s/ live)
- `darktracer` (vendor channel with scam-site announcements)
- `scam_sniffer` alerts (web3 drainer) — our `scamsniffer.ts` provider
  already covers the on-chain side; the Telegram channel is the
  tip-of-the-spear.

**Verdict: MEDIUM. Add a `phishing/scam` topic to `ChannelSpec` and
enrich the leak scanner's `LIKELY_LEAK_KEYWORDS` list with
`drainer`, `wallet drainer`, `seed phrase`, `approve tx`, etc. ~30
lines of work.**

---

## 13. Hacktivism + regional cybercrime (under-covered today)

Today's curated list is 70%+ English/ES with a couple of Russian,
German, and Vietnamese channels. Notable gaps:

| Region | Notable channel(s) | Why it matters |
|--------|--------------------|----------------|
| Persian (Iran) | APT35 / APT42 chatter channels | Real-time Middle East conflict-tracking pivot |
| Arabic (MENA) | Regional cybercrime, hacktivism | Same |
| Russian | `rfc_revolut`, ransomware group chats (private) | Hard to verify, mostly private |
| Chinese | `cnnvd` mirrors | Need a Chinese-speaking analyst to verify signal |
| LatAm | `mythreatintel` (already in) + Brazilian channels | Carding & PIX fraud |
| Turkish | `turksecurity`, `turk hack team` | High-volume defacement announcements |

**Verdict: MEDIUM. A targeted expansion of the curated list (10-15
handles) costs nothing. The signal is there; the human-language filter
is the harder part.**

---

## 14. Telegram channel search inside the platform

We currently have **no** in-platform "search for a Telegram channel by
keyword" surface. Adding this is the single biggest UX improvement:

```
GET /api/v1/telegram-search?q=ransomware
→ {
    results: [
      { handle: 'falconfeedsio', name: 'FalconFeeds.io', category: 'leaks',
        subscribers: 12500, posts_per_day: 4.2, source: 'tgstat' },
      { handle: 'RansomLook', name: 'RansomLook', category: 'leaks',
        subscribers: 4800, posts_per_day: 1.1, source: 'tgstat' },
      ...
    ],
    cached_at: '2026-06-19T11:42:00Z'
  }
```

Front-end: a search box on `/threatintel/telegram-monitor` that hits
this endpoint and shows the candidate channels with a one-click
"monitor" toggle (which POSTs to the existing
`/api/v1/telegram-custom-channels`).

**Verdict: HIGH. ~200 lines of new code on the API side + a small
search UI on the existing monitor page. Unlocks the platform's
discoverability story.**

---

## 15. Telegram actor correlation (the "Telegram → MITRE pivot")

For every channel we monitor, the goal is "can we attribute this
channel to a known actor, malware family, or campaign?"

Two data sources for this:
- `threat-actor-catalog.ts` (in-repo) — has ~50 actors with aliases
- `misp-galaxy-actors.ts` route (live) — has 800+ actors with TTPs
- `deepdarkcti-parser.ts` `telegram_threat_actors.md` — actor → handle

We can build a `correlateChannelToActor(handle) → Actor[]` helper
that:
1. Checks the handle against `deepdarkCTI.telegram_threat_actors.md`
   (highest confidence — explicit attribution)
2. Checks the handle against the `telegram_handles: string[]` field
   in `threat-actor-catalog.ts` (operator-curated)
3. Checks the channel's most-recent post titles against the actor
   names in MISP Galaxy (lower confidence — name match)
4. Surfaces results in a "Linked actors" panel on each channel

**Verdict: HIGH. Turns the static catalog into a queryable intelligence
graph. Direct fit for the existing `relationship-graph` infrastructure.**

---

## 16. Telegram-derived IOCs as a first-class IOC source

Right now the leak scanner stores IOCs in D1
(`telegram_leak_entries.credential_count`, `domains_found`, etc.) but
those never flow into the cross-source IOC consensus at
`/api/v1/ioc-correlation`. The fix:

1. Add a "extract & dedupe IOCs" post-processor to the leak scanner
   that, on cron, walks the last 7 days of entries and pushes unique
   hashes, domains, IPs, and CVEs into the IOC pipeline.
2. Source label: `telegram-leak` (matches the existing
   `abuseipdb` / `otx` / `virustotal` / `threatfox` labels).
3. The IOC correlation route's `consensus_score` already factors in
   source diversity — Telegram becomes the 25th source.

**Verdict: HIGH. Pure plumbing, very high analyst value. ~150 lines
of new code in `telegram-leak-monitor.ts` + a small wiring change in
`ioc-correlation.ts`.**

---

## 17. Hourly CTI digests to a Telegram channel (already live, easy to extend)

`telegram-archive.ts` already posts hourly digests of detections,
ransomware, malware, live IOCs, and victim releaks to a configured
Telegram channel. Two easy extensions:

1. **Telegram-IOC digest.** A new category that summarizes the last
   hour's `scanMessageForLeaks` results — top domains, top hashes,
   top CVEs — formatted the same way.
2. **Telegram-actor digest.** A daily digest (not hourly — too
   voluminous) of "channels that joined / left the curated set" so
   operators see when a known-handle is going dark.

**Verdict: MEDIUM. Small change, keeps the archive channel valuable.**

---

## 18. Open-source scraper projects worth referencing

These are the most-mature, most-active Telegram-scraper projects on
GitHub. They use Telethon / Pyrogram (account required) so we can't
embed them in the Worker, but they're the right reference for what
production Telegram intelligence looks like:

| Project | Stars | License | Notes |
|---------|-------|---------|-------|
| [telegram-scraper](https://github.com/golinulth/telegram-scraper) | 1.5k | MIT | Telethon-based, member-scraper |
| [telegram-channel-scraper](https://github.com/hatamiarash7/telegram-channel-scraper) | 0.4k | MIT | Public preview scraper, similar to ours |
| [Telethon](https://github.com/LonamiWebs/Telethon) | 11k | MIT | The reference Python MTProto lib |
| [TelegramBots](https://github.com/python-telegram-bot/python-telegram-bot) | 25k | LGPL-2.1 | Bot framework |
| [pyrogram](https://github.com/pyrogram/pyrogram) | 4.5k | LGPL-3 | Async Python client |
| [telegram-tt](https://github.com/ayrat555/telegram-tt) | 0.1k | MIT | Ruby client |
| [Telegram-Scraper](https://github.com/cuongnv23/Telegram-Scraper) | 0.2k | MIT | Node |
| [mtprotoproxy](https://github.com/alexbers/mtprotoproxy) | 1.5k | MIT | MTProto proxy for circumventing blocks |

---

## 19. Live-channel monitoring via MTProto (the line we don't cross)

Two tools, **Telegram-Archive** (`github.com/fabianlindfors/telegram-archive`,
MIT) and **telegram-exporter** (multiple forks) use MTProto to download
the **full history** of a channel the user has joined. This is the
only way to get a complete history, but it requires:
- A Telegram user account (with a phone number)
- Membership in the channel
- Time (full history can be gigabytes)

For this platform the answer is "no, we don't run a MTProto worker in
the edge". The right place to do MTProto-based archival is an analyst
workstation with a sock-puppet account, then upload the exported
JSON into the platform's RAG index via the existing
`/api/v1/rag-corpus-index` endpoint.

**Verdict: don't build. Document the workflow in the wiki article.**

---

## 20. Summary — ranked recommendations

Ranked by **effort vs. analyst value**, with a free-tier budget of
<$0/mo throughout:

| Rank | Recommendation | Effort | Value | Section |
|------|----------------|--------|-------|---------|
| 1 | Add a `telegram-search` endpoint backed by tgstat.com HTML | Low | Very high | §14 |
| 2 | Add a Telegram-actor correlation pivot (deepdarkCTI + MISP Galaxy + in-repo catalog) | Low | High | §15 |
| 3 | Push Telegram-derived IOCs into the cross-source IOC pipeline | Low | High | §16 |
| 4 | Wire RSSHub as the primary channel JSON source, fall back to HTML parser | Medium | High | §2 |
| 5 | Surface a "Linked actors" panel on each monitored channel | Low | High | §15 |
| 6 | Add bot-API `getChat` + `getChatAdministrators` cron for member counts | Low | Medium | §9 |
| 7 | Expand curated channel list (Persian / Arabic / LatAm / Turkish) | Low | Medium | §13 |
| 8 | Build a "Telegram threat-actor index" page (deepdarkCTI pivoted) | Low | Medium | §5 |
| 9 | Telegram-IOC + Telegram-actor digests in `telegram-archive.ts` | Low | Medium | §17 |
| 10 | Add stealer-log keywords + `stealer_log` leak_type to leak scanner | Low | Medium | §11 |
| 11 | Add pagination (`?before=…`) to t.me/s/ scrape for deep-refresh | Low | Low | §1 |
| 12 | Capture media + forward + reaction metadata from preview HTML | Low | Low | §1 |
| 13 | Add phishing-scam-drainer keywords to leak scanner | Low | Low | §12 |
| 14 | Document the MTProto archival workflow in the wiki article | Low | Low | §19 |

## 21. The landing page we should ship

The current `/threatintel/telegram-monitor` has 4 tabs (Leaks, Stats,
Channels, Settings). I'd propose evolving it into a **Telegram
Intelligence Hub** with this top-level structure:

1. **Firehose** (the existing `TelegramFeedPanel`).
2. **Channel Search** (new — keyword search across tgstat + curated).
3. **Leak Monitor** (the existing `TelegramLeaks` + stats).
4. **Channel Discovery** (the existing `TelegramDiscoveredChannels` +
   new deepdarkCTI-pivoted actor index).
5. **Linked Actors** (new — for a given channel, show all known actor
   attributions from §15).
6. **Settings** (unchanged).

This positions the platform as the **free, on-brand Telegram CTI hub
the user is asking for** — analyst-discoverable, opsec-respectful,
and cheap.

## 22. Things that DON'T need to be done

- **Don't self-host RSSHub.** The public instance is fine, and the
  caching discipline we already have (30 min TTL) keeps us well under
  the 1 req/s soft limit.
- **Don't try MTProto-based full-history scraping from the Worker.**
  Wrong runtime, wrong risk profile, wrong cost shape.
- **Don't scrape private channels.** Even via bot API — a bot must be
  explicitly added; there's no "see this private channel" capability.
- **Don't paste carding / pure-stolen-data channels into the curated
  list.** The current `telegram-feed.ts` file has a strong, well-
  documented audit trail for *why* certain channels were excluded.
  That stance is correct — surfacing carding channels on a security
  portfolio site carries legal/ethical risk.
- **Don't use the public RSSHub search route for ad-hoc user searches.**
  It's rate-limited and abuse-prone. Use the tgstat HTML path with
  a 12h cache.

## 23. Implementation sequence (suggested)

A pragmatic 3-sprint plan that builds momentum without breaking
existing surfaces:

**Sprint 1 — Search & Correlation (low risk, high value).**
- §14: `telegram-search` endpoint (tgstat HTML scrape, 12h cache).
- §15: actor correlation helper + `telegram_handles` field on
  `threat-actor-catalog.ts`.
- §5: deepdarkCTI actor pivot page.
- §8: back-fill `telegram_handles` for ~20 known actors.

**Sprint 2 — IOC Pipeline & Hardening.**
- §16: Telegram IOCs into cross-source consensus (with `telegram-leak`
  source label, weight tuned in `ioc-scoring.ts`).
- §1: pagination + media/forward/reaction metadata in the HTML parser.
- §9: bot-API member/admin count cron for curated channels.
- §11 + §12: stealer-log + phishing-scam keyword expansion.

**Sprint 3 — Hub Page & Polish.**
- §2: RSSHub primary, HTML parser fallback (with `?before=`).
- §21: refactor `TelegramMonitor` into the 5-tab "Telegram
  Intelligence Hub" page.
- §17: extended `telegram-archive.ts` categories.
- §13: curated-list regional expansion (with verification
  screenshots committed to the repo).

Each sprint is independently shippable and the failure mode of any
single change is bounded (RSSHub 5xx → HTML parser kicks in, tgstat
HTML structure changes → 12h cache delays the user impact, etc.).

---

## 24. One-liner positioning

If we did everything above, the platform's Telegram story becomes:
**"Free, opsec-respectful Telegram CTI — a curated 30+ channel
firehose, a kwarged leak scanner, an actor-pivoted channel index, and
a search/expand surface, all running on the free tier with no Telegram
account required."** That's a unique positioning in the threat-intel
landscape — most "Telegram intelligence" tools require either a
MTProto account, a paid commercial service, or both.
