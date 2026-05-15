# deepdarkCTI Dark-Web Source Index — Design

**Date:** 2026-05-15
**Owner:** Pranith Jain
**Status:** Draft for review

## 1. Goal

Surface the `fastfire/deepdarkCTI` curated source lists on the platform as a dedicated, searchable dark-web source index at `/threatintel/deepdarkcti`. The repo is a living index of deep/dark-web CTI sources (ransomware leak sites, dark markets, criminal forums, infostealer/threat-actor Telegram channels, dark-web search engines, etc.) that the codebase already gestures at — `telegram-watch-catalog.ts` explicitly defers fast-rotating cybercrime channels to "the deepdarkCTI living index rather than hard-coding entries that decay within months." This formalizes that.

## 2. Scope

**In scope** — runtime fetch + parse of **18 source-list files**:

`ransomware_gang`, `telegram_threat_actors`, `telegram_infostealer`, `forum`, `markets`, `search_engines`, `phishing`, `maas`, `rat`, `exploits`, `malware_samples`, `discord`, `twitter`, `twitter_threat_actors`, `counterfeit_goods`, `commercial_services`, `defacement`, `others`.

- New parser module `api/src/lib/deepdarkcti-parser.ts`.
- New route `api/src/routes/deepdarkcti.ts` (pattern mirrors `detection-rules.ts`).
- New frontend page `src/pages/threatintel/DeepDarkCTI.tsx`.
- New tile on the threat-intel home (`src/pages/threatintel/Home.tsx`).
- New `feed-status.ts` probe row.
- Tests: parser unit tests + route integration tests.

**Out of scope**

- `cve_most_exploited.md` (duplicates existing CVE surfaces) and `methods.md` (prose tradecraft, not a list).
- Cross-linking from `telegram-watch-catalog` / `threat-actors` catalogs (user chose dedicated-page-only).
- IOC-correlation wiring (these are source directories, not indicators).
- Reachability probing of listed sites (trust deepdarkCTI's own ONLINE/OFFLINE column).
- Build-time snapshot (user chose runtime fetch + parse).

## 3. Upstream contract

**Base URL:** `https://raw.githubusercontent.com/fastfire/deepdarkCTI/main/<file>.md`

**Auth:** none (unauthenticated GitHub raw; generous per-IP rate limit, mitigated by the 12h cache layer).

**Format:** every file is a GitHub-flavored markdown table — row 1 = header (pipe-delimited column names), row 2 = `| --- |` separator, rows 3+ = data. Two row shapes observed:

1. **Markdown-link-first** — first cell is `[Display Name](url)`. Files: `ransomware_gang`, `forum`, `markets`, `search_engines`, `phishing`, `maas`, `rat`, `exploits`, `malware_samples`, `discord`, `counterfeit_goods`, `commercial_services`, `defacement`, `others`.
2. **Raw-URL-first** — first cell is a bare URL; a later column holds the display name. Files: `telegram_infostealer` (`|Telegram|Status|Name|`), `telegram_threat_actors` (`|Telegram|Status|Threat Actor Name|Type of attacks|`), `twitter` (`|Link|Description|`), `twitter_threat_actors` (`|Link|Description|Category|Status|`).

Column schemas vary per file; nearly all have a `Status` column with values like `ONLINE`, `OFFLINE`, `VALID`, `EXPIRED`.

**Error modes the route must handle:**

- A file 404s / times out / returns non-table content → that file's `sources[]` row is `ok:false`; restore its slice from KV last-good; render every other category normally.
- A data row with no extractable URL → skip that row, continue parsing the file.
- All 18 fail (total GitHub outage) → serve KV last-good for whatever files have it; if nothing, `200` with `total:0` and an empty-state message (not an error).

## 4. Parser — `api/src/lib/deepdarkcti-parser.ts`

### 4.1 Data model

```ts
export type DDCStatus = 'online' | 'offline' | 'valid' | 'expired' | 'unknown';

export interface DDCEntry {
  name: string; // link text, or the name/actor column for raw-URL files
  url: string; // from [text](url) or the bare-URL cell
  onion: boolean; // /\.onion(\/|$)/ test on url
  status: DDCStatus; // normalized case-insensitively; unrecognized → 'unknown'
  category: string; // human label derived from source file (see 4.3)
  source_file: string; // e.g. "ransomware_gang.md" — attribution + GitHub deep-link
  notes?: string; // Description / RSS / leftover columns, " · "-joined, trimmed
  actor?: string; // ONLY for the two threat-actor files
  attack_type?: string; // ONLY for the two threat-actor files
}

export interface DDCFileResult {
  source_file: string;
  ok: boolean;
  count: number; // entries kept (post-cap)
  total_seen: number; // data rows seen pre-cap
  stale?: boolean; // true when restored from KV last-good
}

export interface DDCResponse {
  generated_at: string;
  sources: DDCFileResult[];
  categories: Array<{ id: string; label: string; count: number }>;
  total: number;
  entries: DDCEntry[];
}
```

### 4.2 Per-file config

```ts
interface DDCFileConfig {
  file: string; // "ransomware_gang.md"
  label: string; // "Ransomware Gangs"
  shape: 'link-first' | 'raw-url-first';
  /** raw-url-first only: column index (0-based, post-split) holding the display name. */
  nameCol?: number;
  /** Mark the two threat-actor files; enables actor + attack_type extraction. */
  actorFile?: boolean;
  /** raw-url-first actor files: column indexes for actor name + attack type. */
  actorCol?: number;
  attackTypeCol?: number;
}
```

Concrete config (column indexes are 0-based after splitting a data row on `|` and trimming, excluding the leading/trailing empty cells):

| file                        | label                   | shape                | name/actor/attack cols             |
| --------------------------- | ----------------------- | -------------------- | ---------------------------------- |
| `ransomware_gang.md`        | Ransomware Gangs        | link-first           | —                                  |
| `telegram_threat_actors.md` | Threat-Actor Telegram   | raw-url-first, actor | url=0, status=1, actor=2, attack=3 |
| `telegram_infostealer.md`   | Infostealer Telegram    | raw-url-first        | url=0, status=1, name=2            |
| `forum.md`                  | Criminal Forums         | link-first           | —                                  |
| `markets.md`                | Dark Markets            | link-first           | —                                  |
| `search_engines.md`         | Dark-Web Search Engines | link-first           | —                                  |
| `phishing.md`               | Phishing Resources      | link-first           | —                                  |
| `maas.md`                   | Malware-as-a-Service    | link-first           | —                                  |
| `rat.md`                    | RAT Tooling             | link-first           | —                                  |
| `exploits.md`               | Exploit Sources         | link-first           | —                                  |
| `malware_samples.md`        | Malware Sample Repos    | link-first           | —                                  |
| `discord.md`                | Discord Servers         | link-first           | —                                  |
| `twitter.md`                | Researcher Twitter      | raw-url-first        | url=0, name=1                      |
| `twitter_threat_actors.md`  | Threat-Actor Twitter    | raw-url-first, actor | url=0, actor=1, attack=2, status=3 |
| `counterfeit_goods.md`      | Counterfeit Goods       | link-first           | —                                  |
| `commercial_services.md`    | Commercial CTI Services | link-first           | —                                  |
| `defacement.md`             | Defacement Archives     | link-first           | —                                  |
| `others.md`                 | Other Sources           | link-first           | —                                  |

For actor files, `name` = `actor` when present, else the handle (last URL path segment).

### 4.3 Parsing rules

1. Split content on `\r?\n`. Find the first line starting with `|` = header. Next non-empty line is the `|---|` separator → skip. All subsequent `|`-leading lines are data rows.
2. Split a data row on `|`, drop the first/last empty cells from the leading/trailing pipe, trim each cell.
3. **link-first:** extract from cell 0 via `/\[([^\]]+)\]\(([^)]+)\)/` → name = group 1, url = group 2. If no match but cell 0 is a bare `http(s)`/`.onion` URL, use it with name = host. Else skip row.
4. **raw-url-first:** url = cell at index 0 if it looks like a URL (`/^(https?:\/\/|http:\/\/[a-z2-7]{16,}\.onion)/i` or contains `t.me/`/`x.com`/`twitter.com`); name from `nameCol`/`actorCol`; skip if no URL.
5. `onion` = `/\.onion(\/|$)/i.test(url)`.
6. `status`: rather than a per-file status column (it sits at different indexes across files — col 1 for `forum`/`telegram_*`, col 3 for `twitter_threat_actors`), scan every remaining cell for a recognized status token (case-insensitive exact-trim match against `online|offline|valid|expired`); first match wins. No match → `unknown`. The matched cell is consumed (excluded from `notes`).
7. Leftover columns (not url/name/status/actor/attack) joined with `·` → `notes` (omit if empty).
8. **Per-file cap: 500 entries** (rows are kept in file order — the repo prepends newest near the top). `total_seen` records the pre-cap data-row count so the UI can show "showing 500 of N".
9. A file that yields zero parseable rows from non-empty content → caller treats as `ok:false` (likely a format change upstream) and uses last-good.

Parser functions are pure (`parseDDCFile(content: string, cfg: DDCFileConfig): DDCEntry[]`) — fully unit-testable without network.

## 5. Route — `api/src/routes/deepdarkcti.ts`

- `export const DEEPDARKCTI_CACHE_KEY = 'https://deepdarkcti-cache.internal/v1';`
- `CACHE_TTL_SECONDS = 12 * 60 * 60` (12h; the repo changes slowly).
- `FETCH_TIMEOUT_MS = 10_000` per file.
- KV last-good per file: key `ddc/<file>-lastgood/v1`, TTL `48h`.
- Handler: `cache.match` → hit returns cached. Miss → `Promise.all` over 18 files: each `fetch(raw_url, {signal: AbortSignal.timeout, cf:{cacheTtl:43200, cacheEverything:true}})`. On ok+parsed → write KV last-good (via `c.executionCtx.waitUntil`). On fail/empty → read KV last-good, mark `stale`. Assemble `DDCResponse`, aggregate `categories` from per-file label+count, sort `entries` by category label then name. Cache the response (`waitUntil`). Degraded TTL 60s when ≥1 file failed with no last-good (mirrors `phishing-urls.ts` `ttlFor`).
- Register route in `worker/index.ts` (and `api/src/index.ts` for the test harness) at `GET /api/v1/deepdarkcti`.
- `KV_CACHE` binding already exists in prod (`wrangler.jsonc`) and the test harness.

## 6. Frontend — `src/pages/threatintel/DeepDarkCTI.tsx`

- Fetches `/api/v1/deepdarkcti`. Renders a category-filtered, text-searchable index. Follows the existing threat-intel page conventions (mono/slate styling, card grid, `/`-to-search like `Home.tsx`).
- **Filters:** category multiselect (from `categories[]`), status filter (default hides `offline`/`expired`), onion/clearnet toggle, free-text search over name+notes+actor.
- **Onion rendering:** `.onion` entries render as **non-clickable copy-to-clipboard text** (matches the `onion-watch` convention — clearnet browsers can't open `.onion`, Workers can't egress Tor). `http(s)` entries render as `target=_blank rel=noopener noreferrer` links.
- **Actor files:** entries with `actor`/`attack_type` render an actor pill + attack-type badge; the two actor categories additionally expose an attack-type filter.
- Each entry shows a small `source_file` attribution chip linking to `https://github.com/fastfire/deepdarkCTI/blob/main/<file>`.
- Per-source health strip reads `sources[]`; a `stale` file shows a "cached" marker. Empty `total:0` → "deepdarkCTI temporarily unavailable" state.
- Tile added to `Home.tsx` under the **Curated Catalogs** section: label "deepdarkCTI Index", icon `Globe`, badge none, desc summarizing the dark-web source index.

## 7. Feed-status

Add a `deepdarkcti` probe row to `feed-status.ts` reading `DEEPDARKCTI_CACHE_KEY`. `evaluate`: no cache → `cold`; all sources ok → `ok` with `{files: N, entries: total}`; some `stale` → `degraded`; `total:0` → `down`. Bump `FEED_STATUS_CACHE_KEY` version.

## 8. Testing

- `api/test/lib/deepdarkcti-parser.test.ts` — inline fixtures per schema variant: link-first multi-col (`ransomware_gang`), link-first 2-col (`search_engines`), raw-url-first name (`telegram_infostealer`), raw-url-first actor (`twitter_threat_actors`, `telegram_threat_actors`). Assert: url/name extraction, onion detection, status normalization, notes assembly, actor/attack extraction, malformed-row skip, 500-cap + `total_seen`, zero-row-from-nonempty → signalled to caller.
- `api/test/routes/deepdarkcti.test.ts` — `vi.spyOn(globalThis,'fetch')` returning fixture markdown per file; assert response shape, per-file `sources[]`, category aggregation, and KV last-good fallback when one stubbed fetch fails.
- One `feed-status` assertion for the `deepdarkcti` row.

## 9. Failure modes & non-goals

- **Upstream format change** (deepdarkCTI restructures a table): that file parses to zero rows → `ok:false` → last-good for up to 48h → after that the category empties with a "source format changed" marker. Other 17 unaffected. Fix = update that file's `DDCFileConfig`.
- **GitHub raw rate-limit:** 12h Cache-API + `cf.cacheEverything` keeps request volume negligible.
- Not building a dark-web crawler, reachability checker, or onion proxy. This is a parsed mirror of a public curated index, nothing more.
