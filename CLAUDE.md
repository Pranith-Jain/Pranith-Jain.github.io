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

### Round 3 — REST routes, edge tools, SVG renderer, weekly sync

| Tool                 | Purpose                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `si_enrich_ip`       | Enrich a single IP through existing platform providers (ipinfo, abuseipdb, shodan, shodan-internetdb, vpnapi) — output shape matches upstream `enrich_ips.py`. |
| `si_enrich_ip_batch` | Same, up to 25 IPs in parallel.                                                                                                                                |
| `si_kql_to_ah_url`   | Encode a KQL query to a Defender XDR Advanced Hunting deep link (UTF-16LE → GZip → Base64url). TS port of `kql_to_ah_url.py`.                                  |
| `si_list_scripts`    | List the 5 PowerShell / detection-manifest assets.                                                                                                             |
| `si_get_script`      | Return the raw body of a script.                                                                                                                               |
| `si_render_svg`      | Server-render an SVG dashboard from a JSON manifest (6 widget types: title-banner, kpi-card, score-card, donut-chart, stacked-bar-chart, table-widget).        |

**HTTP routes** (15 SI routes registered, 13 from round 2 + 2 new):

- `GET /api/v1/si/render?slug=threat-pulse` → `image/svg+xml` directly
- `POST /api/v1/si/render` with JSON `{manifest, data}` or YAML `manifestYaml` → JSON `{svg, bytes, widgetCount}`

**Renderer module**: `worker/lib/si-svg-renderer.ts` (324 lines) + symlinked into `api/src/lib/si-svg-renderer.ts` so the HTTP route can call it.

**YAML parser**: `api/src/lib/si-yaml-mini.ts` (183 lines) — minimal indent-based parser for upstream svg-widgets.yaml manifests. NOT a general YAML parser.

**Weekly sync** (round 3 G):

- `worker/scheduled.ts` now logs `si-stats` JSON on every cron tick (cache hits/misses + manifest counts).
- `.github/workflows/si-upstream-sync.yml` re-runs `scripts/sync-si-from-upstream.mjs` and `scripts/build-si-manifest.mjs` every Monday 06:00 UTC; opens a PR if `public/data/si/` changed.

**Tests**: 24 vitest tests pass (was 19 from round 2; +5 for round-3).

### Round 4 — PNG export, rate limiter, typed client, streaming

| Tool            | Purpose                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `si_render_png` | Rasterise a dashboard to PNG (base64 in the MCP text field). Uses bundled `@resvg/resvg-wasm` + Hanken Grotesk TTF. |

**R4-2 — PNG export (`worker/lib/si-svg-png.ts`)**:

- `svgDashboardToPng(env, svg, {width, defaultFontFamily, background})` mirrors the `og-raster.ts` pattern (wasm bundled, fonts from `public/og/`). Default width 1400 matches upstream `canvas.width`.
- `GET /api/v1/si/render?format=png&slug=…&width=1400` returns `image/png` directly. The existing `?format=svg` and JSON paths are unchanged.

**R4-3 — Per-provider rate limiter (`worker/lib/si-rate-limit.ts`)**:

- Fixed-window counter in `KV_CACHE` (key: `rl:<provider>:<windowStart>`). Conservative quotas (ipinfo 70/h, abuseipdb 1000/d, shodan 5/d, vpnapi 1000/d, shodan-internetdb unlimited).
- Wired into `si-enrich.ts` — when a bucket is empty the provider call is skipped and a `status: 'rate_limited'` diagnostic is added so the LLM client can distinguish quota exhaustion from "empty response".
- 8 unit tests: under-limit, at-limit, window rollover, per-provider isolation, disabled providers, peek, KV-missing degradation, reset.

**R4-4 — Typed Hono client (`src/lib/security-investigator.ts`)**:

- `createSiClient({baseUrl?, fetch?, signal?})` returns a strongly-typed wrapper over all 15 REST routes + the streaming variants. Default singleton `siClient`.
- Types mirror the API shapes (`SiIndex`, `SiSkillBody`, `SiQueryBody`, `SiAutomationBody`, `SiDoc`, `SiRenderManifest`, `SiStreamResult`).
- 13 unit tests cover: index, listSkills, getSkill, renderSvg (slug + POST), renderPng (400 path), SiClientError 404, routingPrompt, URL encoding, and the streaming methods.

**R4-5 — Streaming responses for get_skill / get_doc / get_query**:

- Added `?stream=true` to `GET /api/v1/si/skills/:slug`, `/query?slug=…`, `/docs/:slug`. Returns `text/markdown; charset=utf-8` as a `ReadableStream` chunked in 8 KB pieces.
- Optional `?from_line=N&max_lines=M` slices the body by line range. Response headers `X-SI-Start-Line`, `X-SI-End-Line`, `X-SI-Total-Lines`, `X-SI-Bytes` carry the metadata.
- Client methods `streamSkill`, `streamQuery`, `streamDoc` on `siClient` return `{text, meta}`.

**Stale comment fixed**: `worker/lib/si-svg-renderer.ts` header now says "Supports 14 widget types" with the full enumerated list (was "6 widget types").

**MCP tool inventory (final)**: 67 tools total — 46 pre-existing DFIR / threat-intel tools + 21 SI tools (`si_list_skills`, `si_get_skill`, `si_list_queries`, `si_get_query`, `si_get_automation`, `si_stats`, `si_render_svg_dashboard`, `si_list_docs`, `si_get_doc`, `si_get_routing_prompt`, `si_list_ref`, `si_get_ref`, `si_enrich_ip`, `si_enrich_ip_batch`, `si_enrich_ip_stix`, `si_enrich_ip_stix_batch`, `si_kql_to_ah_url`, `si_list_scripts`, `si_get_script`, `si_render_svg`, `si_render_png`).

**Verification (final)**:

- `npx tsc --noEmit -p tsconfig.json` — clean
- `npx tsc --noEmit -p api/tsconfig.json` — zero SI-related errors
- `npx vitest run` — 45/45 tests pass across `si-manifest.test.ts`, `si-rate-limit.test.ts`, `security-investigator.test.ts`
- `npx wrangler deploy --dry-run` — 9.3 MB / 2.3 MB gzip, all bindings intact, `env.ASSETS` bound, resvg-wasm bundled, 20 references to SI render tools in the output `index.js`

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
- `worker/lib/threat-intel-manifest.test.ts` — 24 unit tests
- `scripts/sync-threat-intel.mjs` — NVD + CISA KEV + Daily-Hunt fetch
- `scripts/build-threat-intel.mjs` — normalize + score + slice into per-slug JSON
- `worker/mcp-server.ts` — 7 `ti_*` tool registrations
- `api/src/routes/threat-intel-edge-tools.ts` — 9 REST route handlers
- `api/src/lib/threat-intel-manifest.ts` — symlink to `worker/lib/threat-intel-manifest.ts`
- `src/pages/ThreatIntel.tsx` — SPA dashboard
- `.github/workflows/threat-intel-sync.yml` — weekly sync workflow (Mon + Thu 05:30 UTC)
- `docs/loops/threat-intel-sync.md` — loop template for manual sync
- `public/data/threat-intel/` — generated manifest tree (not committed empty; populate via sync + build)

**Sync pipeline** (matches `si-upstream-sync.yml` pattern):

```bash
node scripts/sync-threat-intel.mjs   # fetches NVD recent + CISA KEV + Daily-Hunt
node scripts/build-threat-intel.mjs  # slices into public/data/threat-intel/
```

**To rebuild**: `node scripts/sync-threat-intel.mjs && node scripts/build-threat-intel.mjs`

**Tests**: 24 vitest tests in `worker/lib/threat-intel-manifest.test.ts`

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
