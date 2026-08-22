# KV usage audit + Cache-API reductions + UI/UX bug fixes — 2026-08-22

Audit of the two KV namespaces (`KV_CACHE`, `CASE_STUDIES`) to find request-path
reads/writes that can be reduced or replaced with the free per-colo Cache API
(`caches.default`), plus a frontend UI/UX bug audit (18 verified findings, all
fixed). Follows the established patterns:

- `api/src/lib/route-cache.ts` — `cachedJson` (Cache-API-only SWR),
  `kvBackedGet`/`kvBackedPut` (L1-first, KV-L2 with write-through shadow)
- `api/src/lib/lastgood.ts` — cross-colo last-good with 6h per-colo shadow
- `api/src/lib/cache.ts` — `ProviderCache` (IOC fan-out, L1-only batched)

## Inventory summary

`KV_CACHE` consumers: ~105 files. `CASE_STUDIES`: content store for blog /
case studies / admin drafts (primary datastore — **not** a cache; stays in KV).

### Already optimized (no action needed)

| Area                                           | Pattern                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| IOC provider cache                             | L1-only writes since the free-plan write-quota fix (`ProviderCache`) |
| Daily-briefs SSR data (`/data/daily-briefs/*`) | 10-min per-colo shadow in `worker/index.ts`                          |
| Blocklists (`blocklist:*`)                     | 300s per-colo front in `api/src/routes/blocklists.ts`                |
| HackerTarget lookups                           | Cache-API first, KV only as cross-colo last-good                     |
| CVE-recent handler                             | Edge cache → KV last-good → 503 (cron-warmed)                        |
| EPSS blobs (`cve:<id>`) in fusion-exposure     | 1h L1 shadow (`readEpssCache`)                                       |
| Rate limiting (SI + worker)                    | Fixed-window counters in `caches.default`, no KV                     |
| OG images / Argus feed / GlobalPulse           | Cache-API keyed responses                                            |

### Durable state — correctly in KV (do NOT migrate)

Telegram bot offsets/posts/channel maps, custom channels; watchlist weekly
digests; feedback items/aggregates; risk-register entries; assessments;
campaigns; patch-task manager; GRC evidence; one-time secrets; SOC automations;
admin X cookies/QIDs; `CASE_STUDIES` content; RAG sync dedupe markers;
queue-consumer cooldown/cycle markers.

These are user/admin records or cross-colo coordination state — the Cache API
is per-colo and evicts silently, so it cannot be the system of record.

### Hot request-path reads that lacked an L1 — fixed in this change

| File                                | Key(s)                   | Fix                                         | Shadow TTL rationale                                                                                |
| ----------------------------------- | ------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `api/src/routes/cve-risk-matrix.ts` | `cve-recent:lastgood`    | raw text get → `kvBackedGet`                | 1h — matches the hourly cron rewrite cadence (NOT the 24h KV expiry, which would mask a fresh warm) |
| `api/src/lib/ai-item-summary.ts`    | `ais:item:v1:<hash>`     | L1-first read + write-through on both paths | 7d — keys are content-hash write-once, so a shadow can never diverge from KV                        |
| `api/src/routes/dossier.ts`         | `dossier:<type>:<value>` | raw json get → `kvBackedGet`                | 5 min — bounds staleness after a regeneration in another colo                                       |
| `api/src/routes/dossier.ts`         | `cve:<id>`               | raw json get → `kvBackedGet`                | 1h — mirrors fusion-exposure's `readEpssCache` reasoning                                            |
| `api/src/routes/dossier.ts`         | `actor:<value>`          | raw json get → `kvBackedGet`                | 1h — cron-synced reference data                                                                     |
| `api/src/routes/maltrail-sync.ts`   | `skeleton-actor:<slug>`  | raw text get → `kvBackedGet`                | 5 min — matches the route's own `max-age=300` response contract                                     |

Net effect: repeat reads of these keys within a colo cost zero KV reads
(free-plan quota is ~1k reads/day); only cold-colos touch KV.

### Considered and rejected

- **`ransomware-quant.ts` `loadAll`** — user CRUD blob read on every GET, but
  an L1 would extend cross-colo update visibility from ~60s (KV propagation)
  to the shadow TTL. Low traffic; not worth the coherence trade.
- **Last-good fallback reads** (depx, supply-chain-attacks, misp-galaxy,
  cloud-threat-landscape, secret-leaks) — only touched when upstream fails,
  so they're already off the hot path.
- **`telegram-feed.ts`, watchlist digests, feedback** — durable bot/user
  state; KV is correct.
- **Migrating anything to Cache-API-only** where cross-colo durability
  matters — per-colo eviction means a cold region would lose fallback data.

## Verification

- `tsc -p tsconfig.json` ✅
- `tsc -p api/tsconfig.json` ✅
- `tsc -p api/tsconfig.worker.json` ✅
- `npx vitest run` — 1493/1493 (1 test updated: IocCheck deep-link now asserts
  the canonical `/dfir/asn?asn=` path instead of the legacy alias)
- `api/test/routes/ai-summary.test.ts` — 11/11 (unsandboxed, local)
- ESLint on all changed files — 0 warnings

## UI/UX audit fixes (same session)

Two parallel audits (shared chrome/components + high-traffic pages) found 18
verified bugs. All fixed:

**High**

1. CommandPalette / ioc-detect pivots emitted 4 paths with no route or
   redirect (`asn-lookup`, `breach-check`, `domain-lookup`, `file-analyze`) →
   Cmd+K pivots landed on the 404 page. Added preserving redirects in App.tsx.
2. Five pivot paths hit redirects that dropped their query param, opening
   blank tools. Fixed by adding `preserveQuery` where targets consume params,
   repointing pivots at the real consumers (`/threatintel/iocs/correlation?q=`
   not `/threatintel/correlation`; `/dfir/breach?email=`; `/dfir/cve?q=`;
   canonical `/dfir/asn?asn=`), removing the impossible IP→ASN pivot, and
   teaching CryptoTracer/Tracer (`?address=`), Breach (`?email=`/`?domain=`),
   CveLookup (`?id=`) and ActorTimeline (`?actor=` row highlight) to consume
   their deep-link params.
3. Blog.tsx stale filters: navigating `/blog/c/x` → `/blog` kept the category
   filter. Route params are now unconditionally mirrored into state.
4. DailyBriefs rendered fetch errors as the "no data / run the sync pipeline"
   empty state. Errors now surface via DataPageLayout's error banner + retry.

**Medium** 5. Status retry used bare fetch (no abort/timeout → out-of-order overwrite).
Extracted a shared `load()` with AbortController + 15s timeout. 6. CveIntel tab was read from `?tab=` only on mount; clicks never wrote it
back. Now derived every render and written via `setSearchParams`. 7. LiveIocs page index not clamped when results shrink → blank list with
"page 3/2". Added clamp effect. 8. BlogPost TOC regex missed headings containing inline tags (`<code>` etc.) →
missing ids/dead anchors. Rewritten with DOMParser (+ id de-duplication). 9. useDataFetch/useApiData aborted the previous request AFTER the fresh-cache
early return, so an in-flight response could overwrite newer data. Abort
moved before all early returns.

**Low** 10. `/api/docs` + `/api/v1/openapi.json` linked with `<Link>` (SPA 404) from
Status/McpCatalog → plain anchors. 11. DailyBriefs malformed Tailwind class (`}` vs `]`) killed dark-mode hover. 12. MITRE sub-technique links collapsed to parent technique pages. 13. "snapshot NaNd ago" / negative ages when `generated_at` is malformed —
`ageString` now guards non-finite/negative input. 14. Status page rendered nothing for a success response with zero rows —
added an explicit empty state. 15. CountUp wrapped per-frame animation in `aria-live="polite"` → SR spam;
final value now announced once via aria-label, animation aria-hidden. 16. AppShell `/` shortcut targeted a search `<input>` that doesn't exist in
the app shell (it's a button) — keystroke was swallowed for nothing; it
now dispatches the same synthetic Cmd+K as BottomNav. 17. CommandPalette didn't lock body scroll while open (inconsistent with
Modal/Drawer); added the Drawer scroll-lock pattern.
