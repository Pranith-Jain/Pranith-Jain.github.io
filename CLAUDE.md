# CLAUDE.md

Guidance for agents working in this repo. Keep it short; deep context lives in
`docs/` and in the loop templates.

## Loop templates — read these first for recurring workflows

This repo encodes its recurring dev workflows as **loop templates** in
[`docs/loops/`](docs/loops/) (see [`docs/LOOP-ENGINEERING.md`](docs/LOOP-ENGINEERING.md)).
Each is a goal + max-iterations + a between-iteration check + an exit condition + anti-
gaming guardrails, designed to be driven by an agent (e.g. Claude Code's `/loop`). Before
deploying, editing a provider, touching a route, changing the IOC fan-out, etc., check
[`docs/loops/README.md`](docs/loops/README.md) for the matching loop — it carries this
repo's footguns so you don't rediscover them.

## Operational footguns (the short list)

- **Two wranglers.** Deploy from the **repo root** (`wrangler.jsonc` → Worker
  `pranithjain`), NOT from `api/`, for any frontend/prod change. `npm run deploy` from
  root. See [`docs/loops/deploy-from-root.md`](docs/loops/deploy-from-root.md).
- **esbuild deploys past `tsc`.** Workers bundle without a typecheck, so type errors
  accumulate invisibly and a single parse error masks the rest. Run all three projects:
  `tsc -p tsconfig.json`, `tsc -p api/tsconfig.json`, `tsc -p api/tsconfig.worker.json`.
  The per-edit hook checks api/src but skips `worker/`.
- **API route tests.** CI skips `test/routes/`; run them locally (vitest-pool-workers
  needs the sandbox disabled). External `/api/v1/*` reads are key-gated.
- **D1 binding is `BRIEFINGS_DB`** (database `pranithjain-briefings`), not `DB`.
  Migrations are immutable; add new ones via `/create-migration`; `--remote` is
  destructive.
- **Free-plan limits.** 50 subrequests per invocation (KV + Cache-API both count); the
  IOC fan-out must use one batched `primeBatch` + one `flushBatch`. Briefing self-heal
  runs its own `20 * * * *` cron, one build per invocation.
- **KV policy — Cache API first.** The free per-colo `caches.default` fronts every
  read-heavy request path; KV is the cross-colo durable layer only. Use the shared
  helpers, never hand-roll a third pattern: `kvBackedGet`/`kvBackedPut`
  (`api/src/lib/route-cache.ts`) for cached upstream data, `readLastGood`/`writeLastGood`
  (`api/src/lib/lastgood.ts`, `keyPrefix: ''` for legacy verbatim keys) for upstream-
  outage fallbacks, `routeCacheGet`/`routeCachePut` + evict-on-write for mutable blobs.
  Records that mutate need short shadow TTLs + evict-on-write (see
  `phishing-fingerprint.ts`, `feedback.ts`). Cross-colo correctness state stays on KV:
  bot offsets, one-time secrets, dedup/idempotency markers, queue cooldowns.
  Bulk reads: `kvBulkGetText` (`api/src/lib/safe-catch.ts`) — one subrequest per ≤100
  keys; batch `get(keys[])` over per-key loops.
- **`main` moves fast.** Feature branches auto-FF-merge into `main` mid-session; commit on
  a branch and let it merge — never rebase/force-push/`branch -f main`. Re-check the
  current branch before any git mutation. Rebase onto `origin/main` right before
  deploying.
- **MCP server** (`worker/mcp-server.ts`, `/api/mcp`) is mirrored to the standalone repo
  `dfir-mcp-server` via branch + PR.

## Runtime loop engine

The investigator agent is built on a small generic loop engine
(`api/src/lib/agent/loop-engine.ts` + `cti-loop.ts`); its behavior is pinned by
`api/test/lib/loop-engine.test.ts`. Keep that parity test green when changing exit
conditions or guardrails. See [`docs/LOOP-ENGINEERING.md`](docs/LOOP-ENGINEERING.md).

## Security Investigator (replicated) — edge MCP tools

The Worker exposes the replicated SCStelz/security-investigator content (25 Agent
Skills + 45 KQL queries + 3 automations) as 6 MCP tools on the existing
`DFIR_MCP` Durable Object. The data lives in `public/data/si/` (slim index + per-slug
bodies) and is read back at runtime through `env.ASSETS` — no public internet hop.

| Tool                | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `si_list_skills`    | List the 25 skills, filter by category/keyword    |
| `si_get_skill`      | Return full SKILL.md body (markdown) for a slug   |
| `si_list_queries`   | List the 45 KQL queries, filter by domain/keyword |
| `si_get_query`      | Return full KQL query body (markdown) for a slug  |
| `si_get_automation` | Return a scheduled-workflow definition (3 ship)   |
| `si_stats`          | Cache + manifest stats for cold-start diagnosis   |

**Files**:

- `worker/lib/si-manifest.ts` — loader (LRU body cache, 200 entries, in-memory index)
- `worker/lib/si-manifest.test.ts` — 12 unit tests (run via `npx vitest run worker/lib/si-manifest.test.ts`)
- `worker/mcp-server.ts` — 6 new `this.server.tool(...)` registrations
- `public/data/si/` — `index.json` (37 KB) + `skills/*.json` + `queries/*.json` + `automations/*.json` (3.2 MB total)
- `scripts/build-si-manifest.mjs` — regenerates `public/data/si/` from `security-investigator-replication/` (the source of truth; can be deleted once the upstream sync is finished)

**Source**: `github.com/SCStelz/security-investigator` (MIT, 210★). Bodies are raw
markdown — clients should render markdown themselves. Replication is the
`security-investigator-replication/` folder at the repo root; the MCP tools read
the same data via ASSETS, not from the folder directly. Delete the folder after
upstream sync is no longer needed (the data is now in `public/data/si/`).

**To rebuild the data** after editing upstream: `node scripts/build-si-manifest.mjs`
**To re-fetch from upstream**: `node scripts/sync-si-from-upstream.mjs && node scripts/build-si-manifest.mjs`

### Extended content types (round 2)

| Tool                          | Purpose                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `si_render_svg_dashboard`     | Return the SVG widget manifest (YAML) for a skill that ships one (14 of 25). Pair with `si_get_skill({slug: 'svg-dashboard'})` for the component library.             |
| `si_list_docs` / `si_get_doc` | Browse + retrieve the 10 upstream knowledge-base docs (Sentinel Exposure Graph guide, signinlog KQL cookbook, identity protection, honeypot, ingestion cost, etc).    |
| `si_get_routing_prompt`       | Return the upstream `.github/copilot-instructions.md` (91 KB) verbatim — the universal skill-detection prompt. Load once at session start.                            |
| `si_list_ref` / `si_get_ref`  | Retrieve 14 reference datasets: MITRE ATT&CK catalog (32 KB), known KQL tables (17 KB), M365 platform coverage (16 KB), and 11 Sentinel ingestion-scan query schemas. |

**Data layout** (107 files, 4.2 MB total):

- `public/data/si/index.json` (~40 KB) — slim manifest for skills/queries/automations
- `public/data/si/skills/<slug>.json` — 27 files; 14 include an embedded `svgWidgetsYaml` field
- `public/data/si/queries/<slug>.json` — 45 KQL files
- `public/data/si/automations/<slug>.json` — 3 workflow definitions
- `public/data/si/docs/<slug>.md` — 10 long-form KB docs
- `public/data/si/docs-index.json` — slim doc index
- `public/data/si/routing-prompt.md` — 91 KB routing prompt
- `public/data/si/ref/<name>.json` — 14 reference datasets
- `public/data/si/scripts/<name>` — 5 PowerShell + detection-manifest assets (360 KB)

### Extended SI tools (rounds 3–4)

| Tool                 | Purpose                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `si_enrich_ip`       | Enrich a single IP through existing platform providers (ipinfo, abuseipdb, shodan, shodan-internetdb, vpnapi) — output shape matches upstream `enrich_ips.py`. |
| `si_enrich_ip_batch` | Same, up to 25 IPs in parallel.                                                                                                                                |
| `si_kql_to_ah_url`   | Encode a KQL query to a Defender XDR Advanced Hunting deep link (UTF-16LE → GZip → Base64url). TS port of `kql_to_ah_url.py`.                                  |
| `si_list_scripts`    | List the 5 PowerShell / detection-manifest assets.                                                                                                             |
| `si_get_script`      | Return the raw body of a script.                                                                                                                               |
| `si_render_svg`      | Server-render an SVG dashboard from a JSON manifest (14 widget types).                                                                                         |
| `si_render_png`      | Rasterise a dashboard to PNG (base64 in the MCP text field). Uses bundled `@resvg/resvg-wasm` + Hanken Grotesk TTF.                                            |

**HTTP routes**: `GET /api/v1/si/render?slug=…&format=svg|png`, `POST /api/v1/si/render` with JSON/YAML manifest.

**Key modules**: `worker/lib/si-svg-renderer.ts`, `worker/lib/si-svg-png.ts`, `worker/lib/si-rate-limit.ts`, `api/src/lib/si-yaml-mini.ts`, `src/lib/security-investigator.ts` (typed client).

**Weekly sync**: `.github/workflows/si-upstream-sync.yml` re-runs sync + build every Monday 06:00 UTC; opens a PR if `public/data/si/` changed.

**MCP tool inventory**: 283 tools total across the `DFIR_MCP` Durable Object — DFIR/threat-intel tools (`check_ioc`, `lookup_cve`, `enrich_actor`, `lookup_domain`, etc.) + SI tools (`si_*`) + threat-intel vertical (`ti_*`) + NHI scanner (`nhi_*`) + depx (`depx_*`) + winreg (`winreg_*`) + HudsonRock (`hr_*`) + Telegram (`tg_*`) + workspace/notebook (`ws_*`, `notebook_*`) + passive DNS + IOC watchlist + report analysis + more. Regenerate `public/mcp-manifest.json` + `public/mcp/README.md` + `public/llms-full.txt` with `node scripts/build-mcp-manifest.mjs && node scripts/build-llms-full.mjs`.

## Threat Intel vertical — CVE/KEV/IOC/sector brief (v1)

A second data vertical replicating the SI pattern (`public/data/threat-intel/`, weekly cron sync, slim-index + per-slug JSON bodies read through `env.ASSETS`). Three upstream references feed the design:

| Source                                                                    | What it brings                                                                     | License    |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------- |
| [OpenThreat](https://github.com/hoodinformatik/OpenThreat)                | NVD + CISA KEV ingest, priority scoring (AGPL — design ref only, no code vendored) | AGPL-3.0   |
| [cyber_threat_intel](https://github.com/NarendraKarki/cyber_threat_intel) | Sector briefing pipeline (Financial/Healthcare/Government)                         | MIT        |
| [Daily-Hunt](https://github.com/TheRavenFile/Daily-Hunt)                  | 130+ IOC families (ransomware/malware/APT) as a knowledge base                     | Unlicensed |

**Decision doc**: `docs/decisions/2026-06-29-threat-intel-vertical.md`

**6 MCP tools** (new `ti_*` namespace, registered on `DFIR_MCP`):
`ti_list_cves`, `ti_get_cve`, `ti_list_kev`, `ti_list_iocs`, `ti_get_ioc`, `ti_brief_sector`, `ti_stats`

**9 REST routes** under `/api/v1/threat-intel/*` — all read-only, key-gated.

**1 SPA route** at `/threat-intel` (lazy, 4 tabs: CVEs / KEV / IOC Families / Sector Briefs).

**Files**:

- `worker/lib/threat-intel-manifest.ts` — LRU loader + filter helpers + priority scoring
- `worker/lib/threat-intel-manifest.test.ts` — 52 unit tests
- `scripts/sync-threat-intel.mjs` — NVD + CISA KEV + Daily-Hunt fetch
- `scripts/build-threat-intel.mjs` — normalize + score + slice into per-slug JSON
- `worker/mcp-server.ts` — 7 `ti_*` tool registrations
- `api/src/routes/threat-intel-edge-tools.ts` — 9 REST route handlers
- `api/src/lib/threat-intel-manifest.ts` — symlink to `worker/lib/threat-intel-manifest.ts`
- `src/pages/ThreatIntel.tsx` — SPA dashboard
- `.github/workflows/threat-intel-sync.yml` — daily sync workflow (05:30 UTC). Each sync/build
  step is isolated with `continue-on-error` so one flaky upstream (NVD times out under load)
  never aborts the other verticals; covers threat-intel, darknetlist, ThreatCluster, dPhish,
  Living Threat, MalwareAnalyzer, and Threaticon (main vertical, 1 req/s pacing).
- `docs/loops/threat-intel-sync.md` — loop template for manual sync
- `public/data/threat-intel/` — generated manifest tree (not committed empty; populate via sync + build)

**Sync pipeline** (matches `si-upstream-sync.yml` pattern):

```bash
node scripts/sync-threat-intel.mjs   # fetches NVD recent + CISA KEV + Daily-Hunt
node scripts/build-threat-intel.mjs  # slices into public/data/threat-intel/
```

**To rebuild**: `node scripts/sync-threat-intel.mjs && node scripts/build-threat-intel.mjs`

**Tests**: 52 vitest tests in `worker/lib/threat-intel-manifest.test.ts`

### Darknetlist — Tor Site Directory (darknetlist.is)

A live directory of Tor-accessible sites from [darknetlist.is](https://darknetlist.is/),
integrated as a sub-vertical of the threat-intel platform. A scanner on the
upstream server walks the list through a fresh SOCKS circuit every 30 minutes
and rewrites the page with whatever responded. 108 sites across 9 categories
(markets, search, forums, news, security, comms, crypto, tools, AI), each with
live up/down status, onion URLs, response codes, and fingerprints.

**3 MCP tools** (registered on `DFIR_MCP`):
`ti_list_darknet`, `ti_get_darknet_site`, `ti_get_darknet_category`

**5 REST routes** under `/api/v1/threat-intel/darknet/*`:
`GET /darknet`, `GET /darknet/sites`, `GET /darknet/sites/:slug`,
`GET /darknet/categories`, `GET /darknet/categories/:category`

**1 SPA route** at `/threatintel/darkweb/darknetlist`.

**Files**:

- `scripts/sync-darknetlist.mjs` — fetch + parse darknetlist.is HTML into staging JSON
- `scripts/build-darknetlist.mjs` — slice staging into `public/data/threat-intel/darknet/`
- `worker/lib/threat-intel-manifest.ts` — darknet types + loader + filter helpers (same file)
- `worker/mcp-server.ts` — 3 `ti_*darknet*` tool registrations
- `api/src/routes/threat-intel-edge-tools.ts` — 5 darknet REST route handlers
- `src/pages/threatintel/DarknetList.tsx` — SPA page at `/threatintel/darkweb/darknetlist`
- `public/data/threat-intel/darknet/` — generated manifest tree (index + categories + sites)

**To rebuild**: `node scripts/sync-darknetlist.mjs && node scripts/build-darknetlist.mjs`

**Data layout**:

- `public/data/threat-intel/darknet/index.json` — slim index (categories + sites)
- `public/data/threat-intel/darknet/categories/<id>.json` — 9 category bodies with sites
- `public/data/threat-intel/darknet/sites/<dwd-id>.json` — 108 per-site bodies

### ThreatCluster — Trending Clusters, CVEs, Exploits, Dark-Web Victims, IOC Blocklist

A feed vertical replicating 5 public feeds from [threatcluster.io](https://threatcluster.io/feeds)
(hourly refresh, no API key): top-50 trending threat clusters (7d), CVE vulnerability feed (7d),
exploits with public PoCs (30d), ransomware leak-site victims (14d), and a high-confidence
domain/IP blocklist (30d). Plus a slim MISP manifest pass-through. The SmartNews feed is
deliberately skipped (same clusters, only for news-aggregator submission).

**6 MCP tools** (registered on `DFIR_MCP`): `tc_feed`, `tc_get_cluster`, `tc_get_cve`,
`tc_list_victims`, `tc_list_iocs`, `tc_list_misp_events`

**11 REST routes** under `/api/v1/threat-intel/threatcluster/*`:
`/`, `/clusters`, `/clusters/:slug`, `/vulnerabilities`, `/vulnerabilities/:cveId`,
`/exploits`, `/exploits/:cveId`, `/victims`, `/victims/:id`, `/iocs`, `/misp`

**1 SPA route** at `/threatintel/feeds/threatcluster` (6 tabs: Trending Clusters /
Vulnerabilities / Exploits / Dark Web Victims / IOC Blocklist / MISP Events; IOC tab has
copy-all for pfSense/Pi-hole blocklists).

### ThreatCluster Entity Intelligence (sub-vertical)

Derived entity profiles from ThreatCluster data — threat actors (MISP galaxy attribution),
ransomware groups + sectors (dark-web victims), malware families (Daily-Hunt dictionary
matching), CVEs (feed + cluster-text regex). **Deterministic build-time extraction — no LLM.**
Each profile: first/last seen, mention frequency by day, recent activity, weighted
co-occurrence relationship graph, MITRE techniques (groups also carry their victim list).

**8 MCP tools** (6 above + `tc_list_entities`, `tc_get_entity`)

**3 REST routes** under `/api/v1/threat-intel/threatcluster/entities*`:
`GET /entities` (q, type, min_mentions, limit → flat list with counts),
`GET /entities/:type`, `GET /entities/:type/:slug` (activity_limit)

**1 SPA route** at `/threatintel/feeds/threatcluster/entities` (explorer + profile with
frequency chart, relationship chips, victim table).

**Files**:

- `scripts/sync-threatcluster.mjs` — fetches + regex-parses the RSS feeds + IOC JSON into `threat-intel-staging/threatcluster/`
- `scripts/build-threatcluster.mjs` — slices staged data into `public/data/threat-intel/threatcluster/`
- `scripts/build-tc-entities.mjs` — entity extraction pipeline → `entities/` tree (index + 5 type dirs)
- `worker/lib/threat-intel-manifest.ts` — `loadThreatClusterIndex`, `getTcCluster/Vuln/Exploit/Victim`, `loadTcIocs`, `loadTcMispEvents`, `filterTc*` helpers + `loadTcEntities`/`getTcEntity`/`filterTcEntities`/`getTcEntityTypeOrNull` (same file as darknet)
- `worker/mcp-server.ts` — 6 `tc_*` tool registrations (+2 entity tools)
- `api/src/routes/threat-intel-edge-tools.ts` — 11 route handlers (+3 entity routes)
- `src/pages/threatintel/ThreatCluster.tsx` — SPA page
- `src/pages/threatintel/ThreatClusterEntities.tsx` — SPA entity explorer
- `public/data/threat-intel/threatcluster/` — generated tree (index + clusters/ + vulnerabilities/ + exploits/ + victims/ + iocs.json + misp.json + entities/)

**To rebuild**: `node scripts/sync-threatcluster.mjs && node scripts/build-threatcluster.mjs && node scripts/build-tc-entities.mjs`

**To re-run entity extraction only**: `node scripts/build-tc-entities.mjs` (reads staging + feeds from `public/data/threat-intel/threatcluster/`)

**Data layout**:

- `index.json` — slim index (counts, feed metadata, lastBuildDates, per-feed slim arrays)
- `clusters/<slug>.json` — 50 trending cluster bodies (title, source count, description w/ key points)
- `vulnerabilities/<cve-id>.json` — 50 CVE bodies
- `exploits/<cve-id>.json` — ~50 exploit bodies (severity, KEV flag)
- `victims/<id>.json` — 50 victim bodies (group, sector, country)
- `iocs.json` — whole IOC blocklist (38+ indicators with sources)
- `misp.json` — slim MISP manifest pass-through (uuid, title, tags, threat level)

### Threaticon — Threat-Actor Catalog, Malware Dictionary, Detection Coverage, Threat Map

A replicated vertical from [threaticon.com](https://threaticon.com) (STIX 2.1/TAXII
platform, public server-rendered preview, no API key): ~1,500 threat-actor profiles,
~9,200 malware family entries, an ATT&CK detection-coverage dataset (493 techniques /
13 tactics with per-technique rule counts), and a country-level threat map
(actor origins × targeted countries × sectors). Also feeds the ThreatCluster entity
dictionary (malware family names merged at build time).

**3 MCP tools** (registered on `DFIR_MCP`): `ti_list_threaticon_actors`,
`ti_get_threaticon_actor`, `ti_threaticon_coverage`

**6 REST routes** under `/api/v1/threat-intel/threaticon/*`:
`/` (index + counts + cache), `/actors` (q, type, country, tlp, status, has_mitre, limit),
`/actors/:slug`, `/malware` (category, q, min_confidence, limit), `/coverage`
(tactic, min_rules, q, limit), `/map`

**1 SPA route** at `/threatintel/feeds/threaticon` (9 tabs: Threat Actors / Malware /
Detection Coverage / Threat Map / Campaigns / Attack Patterns / Vulnerabilities /
Controls Catalog / Indicators; actor + catalog cards expand to full bodies on
demand — never fetch details for closed cards, the upstream rate bucket is ~30
requests/min and a full-profile storm 429s every list fetch).

**Files**:

- `scripts/sync-threaticon.mjs` — fetches coverage + malware + actor list pages (`?page=N`) + actor details (sitemap ids) into `threat-intel-staging/threaticon/`; resumable, 429 backoff, `--skip-details`/`--malware-pages N`/`--actors-pages N`/`--actors-limit N`/`--concurrency N`
- `scripts/build-threaticon.mjs` — slices staging into `public/data/threat-intel/threaticon/` (index + actors/ + malware.json + coverage.json + map.json)
- `worker/lib/threat-intel-manifest.ts` — `TiThreaticon*` types + `loadThreaticonIndex`/`getThreaticonActor`/`loadThreaticonMalware`/`loadThreaticonCoverage`/`loadThreaticonMap` + `filterThreaticon*` helpers; `tiCacheStats().threaticon`
- `worker/lib/stix-export.ts` (+ symlink `api/src/lib/stix-export.ts`) — STIX 2.1 bundle builder with deterministic UUIDv5 ids
- `worker/mcp-server.ts` — 3 `ti_*threaticon*` tool registrations; `api/src/lib/agent/mcp-bridge.ts` mirrors
- `api/src/routes/threat-intel-edge-tools.ts` — 6 threaticon route handlers + `GET /threat-intel/export/stix` (STIX 2.1 bundle, `include`/`max`/`download` params)
- `src/pages/threatintel/Threaticon.tsx` — SPA page
- `public/data/threat-intel/threaticon/` — generated tree

**To rebuild**: `node scripts/sync-threaticon.mjs && node scripts/build-threaticon.mjs`

**Data layout**:

- `index.json` — slim actor index + counts + per-tactic coverage summary
- `actors/<slug>.json` — full actor profiles (MITRE ID, types, origin, confidence, aliases, sectors/countries, tactics/techniques, tools, IOC patterns, key capabilities, campaigns)
- `malware.json` — family dictionary (name, category, TLP, confidence, status) — consumed by `build-tc-entities.mjs`
- `coverage.json` — 493 techniques (patternId, techniqueId, name, tactic, rules) + per-tactic coverage %s
- `map.json` — origin/targeted country counts + sector counts

**Upstream quirks tolerated**: dirty origin values ("R"), dominant Type "Unknown",
future-ish "added" dates (platform test/seed data). Parser notes live in
`scripts/sync-threaticon.mjs` (section-boundary scoping for actor details).

### Threaticon Extended Catalog (round 2) — Controls, Campaigns, Attack Patterns

A second manifest tree under `public/data/threat-intel/threaticon-catalog/`
replicating the other public-preview sections: tools (95), mitigations (44),
data-sources (106), detection-strategies (697), campaigns (7,748), attack-patterns
(3,087). **vulnerabilities (22,190 CVEs) and the indicators dictionary (480,188
IOCs) are DELIBERATELY EXCLUDED** — their ~32k extra bodies would push the
deployment past the 20,000 static-asset limit of the Workers free plan
(public/ already runs ~18.5k files). Sync/build scripts list only the 6 kept
sections. Login-gated sections (intrusion-sets, observed-data, analysis) are
skipped; the graph is client-rendered and not replicated.

**3 MCP tools** (registered on `DFIR_MCP`): `ti_threaticon_catalog`,
`ti_get_threaticon_catalog_item`, `ti_threaticon_indicators` (returns the
empty type catalog when the section is absent)

**4 REST routes** under `/api/v1/threat-intel/threaticon/*`:
`GET /catalog` (index counts + section meta), `GET /catalog/:section` (q, limit
≤1000, sections: tools|mitigations|data-sources|detection-strategies|campaigns|
attack-patterns), `GET /catalog/:section/:id` (full body),
`GET /indicators` (types catalog without `type`; with `type`+`chunk`+q/tlp/
min_confidence/limit → up to 1,000 records per chunk)

**1 SPA route** at `/threatintel/feeds/threaticon` — tabs: Campaigns,
Attack Patterns, Controls Catalog (4-section select). The Vulnerabilities and
Indicators tabs were removed when those sections were cut for the 20k asset cap.

**Files**:

- `scripts/sync-threaticon-catalog.mjs` — 6-section crawler into `threat-intel-staging/threaticon-catalog/`; per-page/per-detail caching (resumable), 429 backoff, `--only`/`--concurrency`/`--gap-ms 1300`/`--list-only`/`--details-only`/`--limit-pages`. **Pace matters**: the free tier rate-limits at ~1 req/s sustained — run `--concurrency 1 --gap-ms 1300`; bursts 429 and the 15/30/45s retries make a fast crawl slower than a slow one.
- `scripts/build-threaticon-catalog.mjs` — slices staging into `public/data/threat-intel/threaticon-catalog/` (index.json + `<section>/<id>.json`)
- `worker/lib/threat-intel-manifest.ts` — `TiCatalog*`/`TiThreaticonCatalogIndex` types, `loadThreaticonCatalogIndex`/`getThreaticonCatalogBody`/`loadThreaticonIndicators` + `filterThreaticonCatalog`/`filterThreaticonIndicators`/`threaticonIndicatorTypes`; `tiCacheStats().threaticon.catalog`
- `worker/mcp-server.ts` — 3 `ti_*` tool registrations; `api/src/lib/agent/mcp-bridge.ts` mirrors
- `api/src/routes/threat-intel-edge-tools.ts` — 4 catalog route handlers (after `/threaticon/map`)
- `api/test/routes/threat-intel-catalog.test.ts` — 4 route tests
- `src/pages/threatintel/Threaticon.tsx` — 3 catalog SPA tabs (campaigns, attack-patterns, controls catalog)
- `public/data/threat-intel/threaticon-catalog/` — generated tree (~11.5k files incl. bodies)
- `.github/workflows/threaticon-catalog-sync.yml` — weekly (Tue 06:00 UTC) sync + build + PR. **The crawl staging is git-committed** (`threat-intel-staging/threaticon-catalog/`, ~12k files) so CI resumes incrementally — a full re-crawl (~8h) would exceed the 6h runner limit. When re-seeding, commit the staging in the same PR that adds the data.

**To rebuild**: `node scripts/sync-threaticon-catalog.mjs --concurrency 1 --gap-ms 1300 && node scripts/build-threaticon-catalog.mjs`

**Data layout**:

- `index.json` — counts + per-section meta (syncedAt, detailCount, slim items)
- `<section>/<id>.json` — bodies: per-section detail fields (tools: category/
  aliases; mitigations: M###/STIX id/technique coverage; data-sources: DC###/
  analytic+strategy counts/AN### analytics; detection-strategies: DET###/analytics;
  campaigns: status/confidence/first+last-seen; attack-patterns: CAPEC/A### ids)

**Crawl footguns** (learned the hard way):

- Stale-cache trap: cached pages are parsed _once_ and merged — if you fix a
  parser mid-crawl, delete `pages/` + `list.json` + `details/` for the affected
  section before re-running, or the old parse poisons the build.
- threaticon.com may answer HTTP 200 with a ~7.5 KB "Too Many Requests" body
  instead of 429 — a page with zero parsed cards ends the list loop early.
- Attack-pattern cards carry their id in a mono span as either `CAPEC-N` or
  `A#### - <name>` — the techniqueId regex captures the `[A-Za-z]+\d+(?:-\d+)?`
  prefix, there is no CAPEC field in the page markup per se.

### dPhish — Phishing Threat-Intel Feed (TAXII 2.1)

A live phishing-IOC vertical from [dphish.com](https://dphish.com/feeds/): a public
OpenCTI-backed TAXII 2.1 collection (STIX 2.1 indicators) covering malicious domains,
phishing URLs, sender IPs, phone numbers, and attachment detection rules. **The
collection endpoint requires no auth even though the discovery/root endpoints 401.**
Indicators carry OpenCTI extension fields (score, detection, main observable type +
`observable_values`); category mapping: `Domain-Name→domain`, `IPv4/IPv6-Addr→ipv4/ipv6`,
`Url→url`, `Phone-Number→phone`, `StixFile→file`, `Email-Addr→email`, else `other`.

**2 MCP tools** (registered on `DFIR_MCP` + mirrored in `api/src/lib/agent/mcp-bridge.ts`):
`ti_list_dphish` (category / activeOnly / keyword / limit filters),
`ti_get_dphish_indicator` (full STIX body by slug)

**3 REST routes** under `/api/v1/threat-intel/dphish/*`:
`GET /dphish` (index + counts + cache), `GET /dphish/indicators`
(category, active_only, q, limit), `GET /dphish/indicators/:slug`

**1 SPA route** at `/threatintel/feeds/dphish` (expandable indicator cards: value,
category, active/revoked, confidence, score, STIX pattern, labels, validity).

**IOC provider**: dphish is also registered as a provider adapter
(`api/src/providers/dphish.ts`, `ProviderId 'dphish'`) in the `/api/v1/ioc/check`
fan-out (`runIocProviders`) — it matches indicators against the replicated manifest
through `env.ASSETS` (zero network egress, no key; tiers/providers maps + weights +
admiralty/confidence registry entries wired). Active indicators → malicious (85),
revoked/inactive → suspicious (45); domain checks also match URL-entry hosts.
Tests: `api/test/providers/dphish.test.ts` (5).

**Files**:

- `scripts/sync-dphish.mjs` — TAXII 2.1 paginated fetch (`next` cursors, `added_after`
  incremental ~24h overlap), normalized → `threat-intel-staging/dphish/indicators.json`
  (merge by stixId keeps newest `modified`); `scripts/sync-dphish.test.mjs` unit-tests
  the pure functions (`npm run test:dphish`)
- `scripts/build-dphish.mjs` — slices into `public/data/threat-intel/dphish/`
  (index.json + per-slug bodies)
- `worker/lib/threat-intel-manifest.ts` — `Dphish*` types + `loadDphishIndex` /
  `getDphishIndicator` / `filterDphishIndicators` + `tiCacheStats().dphish`
- `api/src/routes/threat-intel-edge-tools.ts` — 3 route handlers
- `api/test/routes/dphish.test.ts` — 3 route tests
- `src/pages/threatintel/Dphish.tsx` — SPA page

**To rebuild**: `node scripts/sync-dphish.mjs && node scripts/build-dphish.mjs`
**Tests**: `npx vitest run worker/lib/threat-intel-manifest.test.ts` (dphish suites) +
`cd api && npx vitest run test/routes/dphish.test.ts`

### Living Threat Repository — MITRE-mapped Incident Feed (living-threat.rabitanoor.com)

A behavioral vertical replicating the [Living Threat Repository](https://living-threat.rabitanoor.com/)
(github.com/HudKSD/Living-Threat, MIT): real-world incidents continuously mapped to
MITRE ATT&CK tactics + techniques via a keyless bootstrap API
(`GET /api/bootstrap?size=5000`). Each body is AI-enriched — per-kill-chain-stage
ATT&CK analyses (tactic + technique refs with descriptions), per-stage Detection +
Remediation notes, CVEs, Threat_Actors, Tools, priority/relevance scores (0–100),
diamond-model + kill-chain summaries, detection rules/indicators, behavioral +
data-exfiltration indicators, pyramid of pain, post-incident recommendations.

**2 MCP tools** (registered on `DFIR_MCP` + mirrored in `api/src/lib/agent/mcp-bridge.ts`):
`ti_list_living_threat` (tactic / technique / severity / actor / keyword / minPriority
filters), `ti_get_living_threat_incident` (full body by slug)

**3 REST routes** under `/api/v1/threat-intel/living-threat/*`: `/` (index + counts),
`/incidents` (tactic, technique, severity, actor, q, min_priority, limit), `/incidents/:slug`

**1 SPA route** at `/threatintel/feeds/living-threat` (tactic chips + severity/
technique filters + expandable incident cards with per-stage detection/remediation,
CVE/actor pills, kill-chain + diamond-model summaries).

**Data**: `public/data/threat-intel/living-threat/` — `index.json` (slim ~3 MB: 5000
entries with techniques + actor names for server-side filters) + `shards/0000.json…
0009.json` (500 full bodies each, ~4 MB). **Sharding is deliberate** — upstream holds
~21k incidents but bootstrap caps at 5000, and per-incident files would blow the 20k
static-asset cap (public/ runs ~18.5k files).

**Files**:

- `scripts/sync-living-threat.mjs` — keyless bootstrap fetch (5000 docs) → `threat-intel-staging/living-threat/`
- `scripts/build-living-threat.mjs` — slim index + 10 shards + tactic/severity/technique/actor/source rollups
- `worker/lib/threat-intel-manifest.ts` — `LivingThreat*` types, `loadLivingThreatIndex` /
  `getLivingThreatIncident` (shard-level LRU cache) / `filterLivingThreatIncidents` +
  `tiCacheStats().livingThreat`
- `worker/mcp-server.ts` — 2 `ti_*` tool registrations
- `api/src/routes/threat-intel-edge-tools.ts` — 3 route handlers
- `api/test/routes/living-threat.test.ts` — 3 route tests
- `src/pages/threatintel/LivingThreat.tsx` — SPA page
- `.github/workflows/threat-intel-sync.yml` — daily sync step

**To rebuild**: `node scripts/sync-living-threat.mjs && node scripts/build-living-threat.mjs`

### MalwareAnalyzer by Cyble — Live URL Feeds + IOC Lookup (malwareanalyzer.com)

A keyless vertical replicating the free public API of [MalwareAnalyzer by Cyble](https://malwareanalyzer.com/)
(free multi-engine malware analysis: static scanning + dynamic detonation, 70k+
public sample corpus, 46 engines). **No secret required.**

**2 MCP tools** (registered on `DFIR_MCP` + mirrored in `api/src/lib/agent/mcp-bridge.ts`):
`ti_list_malwareanalyzer` (feed: malicious | newly-observed; verdict / category /
keyword filters), `ti_malwareanalyzer_lookup` (live reputation lookup for IP /
domain / URL / hash — verdict, score 0–100, first/last seen, prevalence, tags)

**3 REST routes** under `/api/v1/threat-intel/malwareanalyzer/*`:
`/` (index + counts + cache), `/feed/:name` (malicious | newly-observed, max 200),
`/lookup?indicator=` (live upstream call, keyless)

**1 SPA route** at `/threatintel/feeds/malwareanalyzer` (feed tabs, verdict/score
pills, copy-all pfSense/Pi-hole hostname blocklist, live lookup box).

**Files**:

- `scripts/sync-malwareanalyzer.mjs` — fetches `/v1/feed/malicious` + `/v1/feed/newly-observed` (capped 200) + `/v1/status` → `threat-intel-staging/malwareanalyzer/`
- `scripts/build-malwareanalyzer.mjs` — slim index + 2 whole-feed files + status (only 4 assets)
- `worker/lib/threat-intel-manifest.ts` — `Ma*` types, `loadMaIndex` / `getMaFeed` / `filterMaFeed` + `tiCacheStats().malwareanalyzer`
- `worker/lib/malwareanalyzer.ts` (+ symlink `api/src/lib/malwareanalyzer.ts`) — `malwareAnalyzerLookup` / `malwareAnalyzerStatus` live helpers, graceful degradation
- `worker/mcp-server.ts` — 2 `ti_*` tool registrations
- `api/src/routes/threat-intel-edge-tools.ts` — 3 route handlers
- `api/test/routes/malwareanalyzer.test.ts` — 3 route tests
- `src/pages/threatintel/MalwareAnalyzer.tsx` — SPA page

**To rebuild**: `node scripts/sync-malwareanalyzer.mjs && node scripts/build-malwareanalyzer.mjs`

### STIX 2.1 export (cross-vertical)

`GET /api/v1/threat-intel/export/stix` maps the replicated verticals to STIX 2.1
SDOs: ThreatCluster entities → threat-actor/intrusion-set/malware + victims feed
groups → intrusion-set + IOC blocklist → indicator; Daily-Hunt IOC families →
indicator (with MITRE kill-chain phases); darknetlist → infrastructure;
Threaticon actors → threat-actor (with ATT&CK external references). Deterministic
UUIDv5 object ids (same data → same bundle, safe to cache/diff). Identity +
TLP:CLEAR marking included. Params: `include=entities,iocs,darknet,threaticon`,
`max` (default 500), `download=1`.

**Files**: `worker/lib/stix-export.ts` (builders + `buildStixBundle`),
`api/src/routes/threat-intel-edge-tools.ts` (route),
`api/test/routes/threat-intel-stix.test.ts` (4 tests).

## Destroylist — Phishing & Scam Domain Blacklist

A replicated vertical from [phishdestroy/destroylist](https://github.com/phishdestroy/destroylist)
(MIT): ~193k curated primary phishing/scam domains plus a 13+ source community
aggregate (~1M). **Primary ships as 64 hash-bucketed sorted domain arrays**
(`public/data/threat-intel/destroylist/buckets/`) — membership = one ASSETS
fetch + binary search, LRU-cached per isolate. The community aggregate is NOT
shipped (23MB); it stays reachable through the keyless `api.destroy.tools`
live lookup with a 24h per-colo Cache-API shadow.

**2 MCP tools** (registered on `DFIR_MCP`): `dl_check_domain`, `dl_stats`

**5 REST routes** under `/api/v1/threat-intel/destroylist/*`:
`/` (index+counts+cache), `/check?domain=`, `POST /check` (bulk ≤100),
`/search?q=` (root-domain substring), `/roots.txt` (Pi-hole/AdGuard-ready
subscription, 6h edge cache)

**1 provider adapter** (`destroylist`, tier 1, domains/URLs) in the IOC
fan-out — local manifest first, live API only on primary miss.

**1 SPA route** at `/threatintel/feeds/destroylist`.

**Files**: `scripts/sync-destroylist.mjs` + `build-destroylist.mjs`,
manifest loaders in `worker/lib/threat-intel-manifest.ts`
(`checkDestroylistDomain`, bucket djb2 hash MUST stay in sync with the build
script), provider `api/src/providers/destroylist.ts`, routes in
`api/src/routes/threat-intel-edge-tools.ts`, SPA `src/pages/threatintel/
Destroylist.tsx`. Daily sync rides `.github/workflows/threat-intel-sync.yml`.

## Admin content-generation system (/admin/generate + tabs)

The admin Generate tab (formerly "Manual") drives on-demand content: topic +
audience + tone + type → blog draft and/or LinkedIn/X posts via
`POST /admin/generate`. Mirrors the reference n8n LinkedIn pipeline contract:
brand configuration → composition → **approval gate** (empty/too-short/
score<60 output is returned `rejected` with a reason, never usable) →
normalized single `final_post` field per format → optional `dry_run`
(compose without persisting). Social publishing supports `?dry_run=true` on
`/social/:slug/:platform/post-*` — returns exactly what would be posted.
Dead admin UI (PendingTab per-candidate LI/X buttons, DraftsTab `_SocialBtn`
/`_generateSocial`/unused regenerate menu) was removed; social generation for
candidates lives in PublishedTab, drafts get it after approval.

## WinReg DFIR — Windows Registry Forensic Artifact Reference

A data vertical replicating the SI pattern for the upstream Windows Registry
Forensic Artifacts schema from [dfir-scripts.github.io/registry/](https://dfir-scripts.github.io/registry/).
292 artifacts, 16 categories, 10 hive types, 77 MITRE techniques.

**Data**: `public/data/winreg/` (generated by build script)

**Files**:

- `scripts/build-winreg-manifest.mjs` — fetches upstream JSON, slices into manifest + per-artifact bodies
- `worker/lib/winreg-manifest.ts` — LRU loader + filter helpers
- `worker/mcp-server.ts` — 4 `winreg_*` MCP tools
- `api/src/routes/winreg-edge-tools.ts` — 5 REST routes under `/api/v1/winreg/*`
- `api/src/lib/winreg-manifest.ts` — symlink to `worker/lib/winreg-manifest.ts`
- `src/pages/WinReg.tsx` — SPA page at `/winreg`

**To rebuild**: `node scripts/build-winreg-manifest.mjs`

**MCP tools**: `winreg_list_artifacts`, `winreg_get_artifact`, `winreg_list_categories`, `winreg_stats`

## Traceix — SHA-256 Hash AV/Reputation Lookup

A live enrichment provider for SHA-256 file hash lookups against
[traceix.com](https://traceix.com) (PCEF / Perkins Fund, a 501(c)(3) nonprofit).
Returns per-engine antivirus/reputation verdicts (Safe/Malicious/Unknown/Failed).

**API docs**: https://docs.perkinsfund.org/readme/traceix-endpoints/traceix.md

**Files**:

- `worker/lib/traceix.ts` — core lookup module (`traceixLookup` function)
- `api/src/lib/traceix.ts` — symlink to `worker/lib/traceix.ts`
- `worker/mcp-server.ts` — `traceix_lookup` MCP tool
- `api/src/routes/traceix.ts` — `GET /api/v1/traceix/lookup?hash=<sha256>` REST route
- `src/pages/Traceix.tsx` — SPA page at `/traceix`

**Secret**: `TRACEIX_API_KEY` (`wrangler secret put TRACEIX_API_KEY`)

## NHI Scanner — Non-Human & Agent Identity Risk (nhi-scan port)

A TypeScript port of [nhi-scan](https://github.com/rpmsft9/nhi-scan) (MIT) —
inventories non-human & agent identities (service accounts, API keys, OAuth
apps, service principals, workload identities, CI/CD tokens, PATs, webhooks,
secrets, AI agents) and assigns each a defensible Tier 1–4 (critical→baseline)
from a transparent floor-tier rules engine, mapped to the OWASP NHI Top 10
with a least-privilege remediation per finding. **Deterministic and fully
local — no LLM in the verdict path, no secrets required, no upstream calls.**

**3 MCP tools** (registered on `DFIR_MCP`): `nhi_scan`, `nhi_inventory`, `nhi_owasp_catalog`

**2 REST routes** under `/api/v1/nhi/` (key-gated like every other route):

- `POST /api/v1/nhi/scan` — body is the inventory (list or `{identities:[...]}`) or `{inventory, format?: json|markdown}`; returns the full JSON report or `{markdown}`
- `GET /api/v1/nhi/catalog` — OWASP NHI Top 10 catalog + tiering rules + thresholds + allowed values

**1 SPA route** at `/dfir/nhi-scan` (alias `/nhi-scan`), under the Identity & OSINT hub.

**Files**:

- `worker/lib/nhi-scan.ts` — full engine port: models/parse, `TIER_RULES` + `assess`, `CHECKS` + `runChecks`, `OWASP_CATALOG`, `parseFleet`, `scan`, `reportToJson`/`reportToMarkdown`, `catalogSummary`
- `worker/lib/nhi-scan.test.ts` — 36 vitest tests (port of the upstream pytest suite)
- `api/src/lib/nhi-scan.ts` — symlink to `worker/lib/nhi-scan.ts`
- `api/src/routes/nhi-scan.ts` — the 2 REST routes
- `worker/mcp-server.ts` — 3 `nhi_*` MCP tool registrations
- `api/src/lib/agent/mcp-bridge.ts` — `nhi_*` agent bridge tools (call the lib directly, no HTTP hop)
- `src/pages/NhiScan.tsx` — SPA page at `/dfir/nhi-scan`

**Policy tuning**: thresholds live at the top of `worker/lib/nhi-scan.ts`
(`ROTATION_MAX_DAYS`, `STALE_DAYS`, `WILDCARD_SCOPES`); tiering rules and OWASP
checks are ordered pure-function lists (`TIER_RULES`, `CHECKS`) — edit those,
not scattered logic. Upstream source: `github.com/rpmsft9/nhi-scan` (MIT).

**Tests**: `npx vitest run worker/lib/nhi-scan.test.ts` (36 tests)

## BreachVIP — Breach Database Search

A breach data source integrated into the existing `/dfir/breach` checker.
[BreachVIP](https://breach.vip) is a free, keyless breach search engine with
10B+ records across 1000+ breach datasets. Searches by email, username,
domain, IP, phone, password, name, Minecraft UUID, Steam ID, or Discord ID.

**API**: `POST https://breach.vip/api/search` — `{term, fields, categories?, wildcard?, case_sensitive?}`.
Rate-limited to 15 req/min. The site sits behind a Cloudflare managed challenge
that may block server-side egress; the helpers degrade gracefully to `[]` on
non-JSON/403 responses (same pattern as every other source helper).

**Files**:

- `api/src/routes/breach.ts` — `queryBreachVipEmail` / `queryBreachVipDomain` + `groupBreachVipResults` (groups raw records by breach source into metadata-only entries: record count + data-class labels; raw credentials never surfaced)
- `worker/mcp-server.ts` — `breach_vip_search` MCP tool (direct API call, full 10-field set)
- `api/src/lib/confidence.ts` — `breachvip` source reliability entry (C / secondary)
- `src/pages/dfir/Breach.tsx` — `breachvip` source label/color + privacy notices
- `src/components/dfir/BreachDatabasesPanel.tsx` — BreachVIP external catalog entry
- `api/test/routes/breach.test.ts` — 5 tests (email grouping, empty, CF challenge; domain grouping, non-JSON)

**No secret required** — free, keyless API.

## Whoxy — Reverse WHOIS Lookup

A live enrichment provider for reverse WHOIS lookups against
[whoxy.com](https://www.whoxy.com/reverse-whois/) — 705M+ WHOIS records across
1,596 TLDs. Find all domains registered by an email, owner name, company, or
keyword. Costs $0.01/query (paid, no free tier).

**API docs**: https://www.whoxy.com/reverse-whois/

**Files**:

- `worker/lib/whoxy.ts` — core lookup module (`whoxyReverseWhois` function)
- `api/src/lib/whoxy.ts` — symlink to `worker/lib/whoxy.ts`
- `worker/mcp-server.ts` — `whoxy_reverse_whois` MCP tool
- `api/src/routes/whoxy.ts` — `GET /api/v1/whoxy/reverse?q=<term>&type=email|name|company|keyword` REST route
- `src/pages/Whoxy.tsx` — SPA page at `/dfir/whoxy`

**Secret**: `WHOXY_API_KEY` (`wrangler secret put WHOXY_API_KEY`)

## depx — Supply-Chain Intelligence

A supply-chain intelligence vertical replicating the depx pattern — recently
disclosed malicious packages from the [OpenSSF Malicious Packages](https://github.com/ossf/malicious-packages)
database. Fetches recently disclosed malicious packages via GitHub Commits API
and returns them in a depx-style feed format with ecosystem breakdown, disclosure
age, and package verdicts.

**Files**:

- `api/src/routes/depx.ts` — 3 route handlers: feed, stats, check
- `worker/mcp-server.ts` — 3 MCP tools: `depx_feed`, `depx_check`, `depx_stats`
- `src/pages/threatintel/SupplyChainFeed.tsx` — SPA page at `/threatintel/depx`

**REST routes** (under `/api/v1/depx/`):

- `GET /api/v1/depx/feed?since=7d&ecosystem=npm&limit=100` — recently disclosed malicious packages
- `GET /api/v1/depx/feed/stats` — 30-day ecosystem breakdown
- `GET /api/v1/depx/feed/check?ecosystem=npm&package=lodash` — package verdict (clean/malicious/unknown)

**MCP tools** (registered on `DFIR_MCP`):

- `depx_feed` — list recently disclosed malicious packages
- `depx_check` — check if a package is known-malicious
- `depx_stats` — ecosystem breakdown and feed statistics

**Data flow**: OSSF GitHub Commits API → Cache-API L1 + KV last-good fallback.
No sync scripts needed — live data on each request with aggressive caching.
