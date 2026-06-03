# spmedia Feed Integration — Design

**Date:** 2026-06-03
**Status:** Approved for planning

## Summary

Integrate three MIT-licensed [spmedia](https://github.com/spmedia) threat-intel data sources into the existing threatintel app, each following an established in-app pattern:

1. **Crypto Scam Feed** — ~700 fresh crypto-phishing/scam domains. Live fetch + cache; surfaced both as a dedicated page **and** as a producer into the existing Live IOCs firehose.
2. **Threat-Actor Username Lookup** — ~291k deduplicated usernames + ~25 per-forum lists. On-demand fetch + KV cache; search returns which forums (active vs dead) a handle appears on.
3. **Phishing Hunting Wordlists** — two fuzzing wordlists (`Wizard.txt`, `Shells.txt`). Live fetch + cache; a viewer page framed as a phishing-kit hunting reference.

All three are read-only consumers of public `raw.githubusercontent.com` files. The SSRF guard is a denylist (private/reserved IPs), so **no allowlist change is required**.

## Sources

| Source       | Repo                                                | File(s)                                                                                                                                                              | Shape                                                                   |
| ------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Crypto scams | `Crypto-Scam-and-Crypto-Phishing-Threat-Intel-Feed` | `detected_urls.json`                                                                                                                                                 | `{ metadata, detected_urls: string[] }` — array of domain strings, ~700 |
| Usernames    | `Threat-Actor-Usernames-Scrape`                     | `forumusers_ALL_Dec_2025_count_291136.json` (5.2 MB, flat `usernames: string[]`) + `forum_users_<name>.txt` / `dead_forum_users_<name>.txt` (~25 files, ~9 MB total) | Consolidated JSON = presence only; per-forum txt = forum attribution    |
| Wordlists    | `PhishingSecLists`                                  | `Wizard.txt`, `Shells.txt`                                                                                                                                           | one entry per line                                                      |

All MIT-licensed. Each page shows source link + MIT attribution.

## Feature 1 — Crypto Scam Feed

### API — `api/src/routes/crypto-scam-feed.ts`

- Fetch `detected_urls.json` via `fetchResilient` / `pinnedFetch` (SSRF-safe).
- Cache in `KV_CACHE`, TTL 1h, with last-good fallback (mirror `phishing-urls.ts`: `shouldWriteLastGood` debounce).
- Parse domains; derive TLD per entry.
- Response: `{ items: [{ domain, tld }], stats: { total, tldBreakdown: Record<tld, count>, lastUpdated }, metadata }`.
- Mount in `api/src/index.ts`: `app.get('/api/v1/crypto-scam-feed', cryptoScamFeedHandler)`.

### Live IOCs producer

- Emit the domains into the unified `live-iocs` firehose tagged `source: 'crypto-scam'`, following the same producer/slice pattern OpenPhish/PhishTank use (see `live-iocs.ts` compose-on-read).
- Reuse the cached payload from the route's cache key — do **not** double-fetch.

### Page — `src/pages/threatintel/CryptoScamFeed.tsx`

- Searchable/filterable domain table.
- TLD-breakdown chart (reuse an existing chart component used elsewhere in threatintel).
- "Copy as blocklist" button (newline-joined domains).
- Source link + MIT attribution + last-updated.
- Lazy-registered in `src/App.tsx`; nav entry under **Feeds → "Crypto Scams"** in `src/data/sidebar-nav.ts`.

## Feature 2 — Threat-Actor Username Lookup

### Data strategy (on-demand + cache)

- **Presence + stats:** consolidated JSON (5.2 MB, fits KV's 25 MB value limit). Cache raw payload in `KV_CACHE`.
- **Forum attribution:** lazily fetch each per-forum `.txt` on first need, cache each in its own KV key (each well under 25 MB). A forum file maps to `{ forum: <name>, dead: <bool> }` parsed from the filename (`dead_` prefix → inactive).
- Cold-cache cost: first attribution query fans out ~25 cached fetches; warm thereafter. Acceptable and consistent with the on-demand+cache choice.

### API — `api/src/routes/actor-usernames.ts`

- `GET /api/v1/actor-usernames?q=<handle>`:
  - exact / prefix / substring match against the corpus,
  - for matches, the forums (active vs dead) the handle appears on,
  - a total match count; cap results (e.g. 200) and report truncation explicitly.
- `GET /api/v1/actor-usernames/stats`: total handles, source-forum list, per-forum counts.
- Per-query result caching keyed by normalized `q` to avoid re-scanning on repeat searches.

### Integration

- **Actor-DNA:** add a "seen on N cybercrime forums" enrichment signal (calls the stats/lookup endpoint for the actor's known handles).
- **Dedicated page** — `src/pages/threatintel/ActorUsernames.tsx`: search box → results grouped by handle, forum chips styled active vs dead, stats header.
- Nav entry under **Actors → "Username Search"**.

## Feature 3 — Phishing Hunting Wordlists

### API — `api/src/routes/phishing-wordlists.ts`

- Fetch `Wizard.txt` + `Shells.txt`; cache in `KV_CACHE` (TTL ~6h; slow-moving), last-good fallback.
- Response: `{ lists: [{ name, lineCount, lines }], total }` with server-side pagination/slicing for the larger list.

### Page — `src/pages/threatintel/PhishingWordlists.tsx`

- Per-list viewer with search/filter, copy/download, line counts.
- Framed as a phishing-kit hunting reference (filenames actors use to stash stolen creds) — complements existing open-directory / exposed-host hunting.
- Nav entry under **Darkweb / Reference**.

## Cross-cutting

- **Fetching:** all outbound via `fetchResilient` / `pinnedFetch`; no SSRF allowlist change.
- **Caching:** `KV_CACHE` with last-good fallback, matching existing feed routes.
- **Attribution:** MIT credit + source link on each page.
- **Testing:** API route tests in `api/test/routes/` run locally with `dangerouslyDisableSandbox` (CI skips them). Per-edit hook typechecks; `worker/` checked via `tsc -p api/tsconfig.worker.json` after any worker edit.
- **Deploy:** from repo **root** (two-wrangler rule).

## Out of scope / YAGNI

- No D1 ingest of usernames (chosen on-demand+cache instead).
- No GitHub Action preprocessing (chosen live fetch).
- No write/admin surface — all read-only.
- No automatic re-crawl of source repos beyond cache TTL expiry.

## Risks

- **Consolidated JSON grows** past 25 MB → would break the single-KV-value cache. Mitigation: guard on size; fall back to streaming-parse-without-cache or split keys. Currently 5.2 MB, ample headroom.
- **Per-forum fan-out latency** on cold cache. Mitigation: cache per file; consider warming the largest files; surface a loading state in the UI.
- **CPU on substring scan** of 291k strings per query. Mitigation: cache per-query results; prefer prefix matches; cap result set.
