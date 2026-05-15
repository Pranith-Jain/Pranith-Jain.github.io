# Andrea Fortuna CTI Feeds Integration — Design

**Date:** 2026-05-15
**Owner:** Pranith Jain
**Status:** Draft for review

## 1. Goal

Integrate two new CTI feeds from `https://ctifeeds.andreafortuna.org/` — **Datamarkets** (underground forum threads) and **Recent Defacements** (defaced sites) — into the existing `/threatintel` platform so they enrich the cybercrime aggregator and the live-IOC firehose with sources we do not already cover.

## 2. Scope

**In scope**

- New helper module `api/src/lib/andreafortuna-feeds.ts` exporting two fetchers:
  - `fetchAFDatamarkets()` → returns `CybercrimeItem[]`
  - `fetchAFDefacements()` → returns `LiveIoc[]`
- Wiring `fetchAFDatamarkets()` into `api/src/routes/cybercrime.ts` alongside the existing RSS/Atom sources.
- Wiring `fetchAFDefacements()` into `api/src/routes/live-iocs.ts` as a new URL-bucket source.
- Adding a new `'underground-forums'` value to `CybercrimeSource.category` and surfacing it in the cybercrime UI's category badge styling (`src/pages/threatintel/CyberCrime.tsx`).
- Last-good KV fallback per feed (mirrors `phishing-urls.ts`).
- Tagging contributions with stable source identifiers — `andreafortuna-demonforums` (datamarkets) and `andreafortuna-defacements` (defacements) — so UI source filters and IOC-correlation can attribute them precisely.
- Tests: a parser unit test per feed using a saved JSON fixture; one merge-level test per consuming route ensuring AF items appear in the aggregated payload.

**Out of scope (intentionally dropped)**

- **Phishing Sites feed.** Upstream is URLhaus, which we already poll directly via `api/src/providers/urlhaus.ts` and via the URLhaus parser inside `live-iocs.ts`. Also misclassified by AF — these are malware-distribution URLs (e.g. `bin.sh`, Mirai loaders), not phishing.
- **Ransomware Victims feed.** Upstream is Ransomlook, already polled directly in `ransomware-recent.ts`. Dedup would drop ~100% of AF entries.
- **Dataleaks feed.** Upstream is HIBP, already polled directly in `breach-disclosures.ts`. Dedup would drop ~100% of AF entries.
- A new `/threatintel/cti-feeds` standalone page. User explicitly chose "wire into existing surfaces."
- RSS parsing of these feeds. JSON endpoints carry the same data with less parse cost.
- Backfill of historical AF entries beyond the 1000-record live window. The feeds are live snapshots; we treat them as such.

## 3. Upstream contract

Both feeds are JSON arrays at:

- `https://ctifeeds.andreafortuna.org/datamarkets.json` (1000 records, 7 fields)
- `https://ctifeeds.andreafortuna.org/recent_defacements.json` (1000 records, 7 fields)

Entry shape (identical for both, with `urlscan` present only on datamarkets):

```jsonc
{
  "url": "https://demonforums.net/Thread-...", // primary indicator
  "name": "DemonForums - ✪ [ 3,83 GB ] ✪ CLOUD'S ✪ ULP LOG'S ✪",
  "source": "demonforums", // or "hax" for defacements
  "screenshot": "https://urlscan.io/screenshots/<id>.png",
  "status": "published",
  "timestamp": "2026-05-15T02:08:01.440399", // ISO 8601, UTC, no offset
  "urlscan": "https://urlscan.io/result/<id>/", // datamarkets only
  "id": "6a0680018cc20d18ca9725a7",
}
```

**Cadence:** not formally documented; observed entries arrive multiple times per day. We poll on demand and serve from cache.

**Auth:** none. Public JSON.

**Error modes the fetcher must handle:**

- Network timeout / 5xx → `null` → caller marks source `ok: false`, falls back to KV last-good.
- 200 but empty array → treat as fresh-empty, do NOT overwrite last-good (an empty upstream snapshot has happened to other sources here and silently zeroed analyst views).
- Malformed entry (missing `url`, `name`, or `timestamp`) → skip that entry, keep parsing the rest. Do not fail the batch.

## 4. Module layout

### 4.1 `api/src/lib/andreafortuna-feeds.ts` (new)

```ts
import type { CybercrimeItem } from '../routes/cybercrime';
import type { LiveIoc } from '../routes/live-iocs'; // requires changing `interface LiveIoc` → `export interface LiveIoc` in live-iocs.ts (one-line edit)

const DATAMARKETS_URL = 'https://ctifeeds.andreafortuna.org/datamarkets.json';
const DEFACEMENTS_URL = 'https://ctifeeds.andreafortuna.org/recent_defacements.json';
const FETCH_TIMEOUT_MS = 12_000;
const MAX_ITEMS_PER_FEED = 200;

interface AFEntry {
  url: string;
  name: string;
  source: string;
  screenshot?: string;
  timestamp: string;
  urlscan?: string;
  id?: string;
}

async function fetchJson(url: string): Promise<AFEntry[] | null> {
  /* timeout + JSON */
}
function toIso(ts: string): string | undefined {
  /* coerce "...T...441399" → ISO */
}

export async function fetchAFDatamarkets(): Promise<CybercrimeItem[]>;
export async function fetchAFDefacements(): Promise<LiveIoc[]>;
```

Both return [] on upstream failure; the consuming route owns the "fallback to KV last-good" decision because the route already does that for its other sources.

### 4.2 Mapping rules

**Datamarkets → `CybercrimeItem`:**

| AF field                                     | CybercrimeItem field |
| -------------------------------------------- | -------------------- |
| `name`                                       | `title`              |
| `url`                                        | `url`                |
| `'andreafortuna-demonforums'` (constant)     | `source`             |
| `'underground-forums'` (new category)        | `category`           |
| `timestamp` → ISO                            | `published`          |
| `'Underground forum thread'` (constant)      | `description`        |
| `[<source-from-AF>, 'credentials', 'forum']` | `tags`               |

**Defacements → `LiveIoc`:**

| AF field                                 | LiveIoc field               |
| ---------------------------------------- | --------------------------- |
| `url`                                    | `value`                     |
| `'url'` (constant)                       | `kind`                      |
| `'andreafortuna-defacements'` (constant) | `source`                    |
| `'hax.or'` (constant)                    | `reporter`                  |
| `'website defacement'` (constant)        | `context`                   |
| (none — AF does not link out)            | `reference_url` (undefined) |
| `timestamp` → ISO                        | `observed_at`               |

### 4.3 `routes/cybercrime.ts` changes

- Import `fetchAFDatamarkets` from `../lib/andreafortuna-feeds`.
- After the RSS sources are gathered, run `fetchAFDatamarkets()` in parallel inside the same `Promise.all` block.
- Add its items to the merged list before the round-robin selector.
- Add one row to the `sources[]` response array: `{ label: 'AndreaFortuna Datamarkets', category: 'underground-forums', ok, count }`.
- KV last-good for this slice: key `cybercrime/af-datamarkets-lastgood/v1`, 24h TTL.

### 4.4 `routes/live-iocs.ts` changes

- Import `fetchAFDefacements`.
- Add to the `Promise.all` of source fetches.
- Append items to the existing `items` array; the existing chronological sort (by `observed_at`) handles ordering.
- Add to `sources[]` response: `{ id: 'andreafortuna-defacements', ok, count, newest_observation }`.
- These items are URL-kind and participate in `ioc-correlation.ts` automatically (it reads the cached live-iocs payload).
- KV last-good slice: key `live-iocs/af-defacements-lastgood/v1`, 24h TTL.

### 4.5 `lib/cybercrime-sources.ts` changes

- Extend `CybercrimeSource['category']` union with `'underground-forums'`.
- No new entry in `CYBERCRIME_SOURCES` (AF is wired through code, not config — it's JSON, not RSS).

### 4.6 `routes/feed-status.ts` changes

- Two new probe rows, both read from the parent route's cached payload (`CYBERCRIME_CACHE_KEY` and `LIVE_IOCS_CACHE_KEY`) and inspect the `sources[]` array for the AF source id.
- Row ids: `af-datamarkets`, `af-defacements`.
- Status mapping: ok→`ok`, !ok with stale fallback→`degraded`, !ok no fallback→`down`, no cache yet→`cold`.

### 4.7 Frontend type/UI changes

- `src/pages/threatintel/CyberCrime.tsx`: add the `'underground-forums'` case to the category-badge color/label switch (existing styling lives next to the other categories).
- No new component. Existing card renders title, url, source, category, published, description — all already populated.

## 5. Caching strategy

- **No new top-level cache.** AF data lives inside the parent route's cache entry (`cybercrime` 30-min, `live-iocs` 30-min). One entry round-trip per cache hit, identical to today.
- **Per-feed last-good KV slice.** Mirrors `phishing-urls.ts`. Written on successful fetch; read when current fetch returns null. Stale slices are flagged with `stale: true` in the response `sources[]` row.
- **`cf.cacheEverything: true` on the upstream fetch with 1800s edge TTL.** AF's CDN headers are unknown; we control our own freshness.

## 6. IOC correlation

Defacement URLs flow into `ioc-correlation.ts` for free — it reads `live-iocs`'s cached output and treats each new `source` as an independent feed. This is the main analytical lift: when a defaced URL also shows up in URLhaus or PhishTank, the correlation engine will rank it higher.

Datamarkets URLs do NOT flow into correlation — `cybercrime.ts` is news, not IOCs, and correlation does not consume it. This is intentional: forum thread URLs aren't C2/malware/phishing indicators in the usual sense.

## 7. Tests

- `api/test/andreafortuna-feeds.test.ts` (new)
  - Fixture-based: 1 datamarkets fixture + 1 defacements fixture under `api/test/fixtures/`.
  - Asserts mapping rules (4.2) row-for-row.
  - Asserts that malformed entries are skipped without throwing.
  - Asserts that the 200-item cap is enforced.
- `api/test/cybercrime.test.ts` (add a new test case)
  - Stub `fetchAFDatamarkets` to return 3 items; assert they appear in the merged response with the `'underground-forums'` category badge and `andreafortuna-demonforums` source label.
- `api/test/live-iocs.test.ts` (add a new test case)
  - Stub `fetchAFDefacements` to return 3 items; assert they appear in the response, are URL-kind, and that the `sources[]` row reports their count.

## 8. Rollout

1. Land module + fetchers behind a no-op import (not yet called by routes). Run unit tests.
2. Wire into `cybercrime.ts`. Verify locally that `/api/v1/cybercrime` includes the new source row.
3. Wire into `live-iocs.ts`. Verify that `/api/v1/live-iocs` includes the new source and that `/api/v1/ioc-correlation` picks it up.
4. Add `feed-status.ts` rows. Verify via `/threatintel/status`.
5. Deploy.

## 9. Failure modes & non-goals

- **AF goes dark for 24h+.** KV last-good expires after 24h; the source rows go `degraded` then `down`. Other sources continue serving. No user action required.
- **AF rebrands a feed.** URL constants are top-of-file. Update them, redeploy.
- **AF starts returning malformed JSON.** Per-entry skip keeps the rest of the batch alive; total source `ok: false` if zero entries parsed.
- **AF rate-limits us.** A 12s timeout caps the blast radius on a single request; the cached parent responses absorb retries.

We are not building a generic CTI-feed-of-feeds aggregator. This is a targeted integration of two specific upstream feeds that fill known gaps.
