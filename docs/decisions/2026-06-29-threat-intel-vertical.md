# Decision: Threat Intel vertical on `pranithjain`

**Date:** 2026-06-29
**Status:** Proposed
**Owner:** Pranith
**Driver:** Concrete user demand for CVE/KEV tracking, sector briefings, and IOC family lookups (capabilities currently in three upstream repos: OpenThreat, cyber_threat_intel, Daily-Hunt).

---

## CONTEXT

The `pranithjain` Worker already ships a "Security Investigator" vertical — 21 MCP tools + 15 REST routes exposing 25 Agent Skills, 45 KQL queries, 3 automations, 10 KB docs, 14 reference datasets, and IP-enrichment / SVG / PNG rendering. The next logical vertical is **Threat Intel** (vulnerabilities, adversary activity, sector briefings). Three reference open-source projects cover the shape:

| Upstream repo                                                                                      | What it brings                                                                                                            | Why it's relevant                       |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| [hoodinformatik/OpenThreat](https://github.com/hoodinformatik/OpenThreat) (355★, AGPL-3)           | NVD + CISA KEV + BSI CERT-Bund ingest, priority scoring, REST API, Next.js UI, Postgres + Celery + Redis stack            | Bulk CVE ingestion + KEV prioritization |
| [NarendraKarki/cyber_threat_intel](https://github.com/NarendraKarki/cyber_threat_intel) (10★, MIT) | Collect→classify→enrich→brief pipeline, sector-aware (Financial / Healthcare / Government) briefs, local Ollama reasoning | Sector briefings with LLM reasoning     |
| [TheRavenFile/Daily-Hunt](https://github.com/TheRavenFile/Daily-Hunt) (133★, JS)                   | 130+ IOCs (ransomware families, malware, APT groups) curated as plain files                                               | IOC family catalog as a knowledge base  |

**Note on licenses:** OpenThreat is AGPL-3.0. We will **not copy its code or large verbatim excerpts**. We'll use it as a design reference for ingest shape and priority-scoring heuristics. All code we write will be MIT (matching the rest of `pranithjain`).

This decision is about how to ship the capability, not whether to. The capability is needed for the next deploy — there is real user demand.

---

## CONSTRAINTS

- **Worker free plan: 50 subrequests/invocation** (KV + Cache-API both count). The 21 SI tools already use one batched `primeBatch` + one `flushBatch` per IOC fan-out — same pattern required here.
- **D1 binding `BRIEFINGS_DB` is reserved for the briefings product**; introducing new tables there would entangle two product verticals.
- **`env.ASSETS` bundle cap is real** — SI ships ~4.2 MB of pre-baked JSON. Daily-Hunt alone has 130+ files; we must keep slim index + per-slug bodies, not slurp the whole tree.
- **MCP tools, REST routes, and the frontend dashboard all need to be served** — the vertical ships only when all three surfaces work, not just one.
- **Cron + cache is the only sane run mode** under the 50-subrequest cap. Real-time fan-out per MCP call would burn the budget on one CVE lookup.
- **Reversibility matters**: if this approach is wrong, we should be able to back it out cleanly without breaking the existing SI vertical.

---

## OPTIONS

### Option A: Single vertical, slim-index + per-slug R2 manifests (RECOMMENDED)

Mirror the existing `public/data/si/` pattern exactly, under a new `public/data/threat-intel/` tree.

```
public/data/threat-intel/
├── index.json                    (~50-80 KB; one slim manifest)
├── cves/
│   ├── <CVE-ID>.json             (one file per CVE; CVSS, KEV flag, priority score, BSI description)
│   ├── index-by-cvss.json        (sliced views for fast filter)
│   └── kev.json                  (CISA KEV snapshot)
├── iocs/
│   ├── <family-slug>.json        (ransomware/malware family, IOCs, MITRE refs)
│   └── index.json
└── sectors/
    ├── financial.json            (sector brief: top N threats, LLM one-liners, recommended action)
    ├── healthcare.json
    └── government.json
```

**Pipeline (cron, weekly, mirrors `si-upstream-sync.yml`):**

1. `scripts/sync-threat-intel.mjs` — fetch NVD recent deltas + CISA KEV + Daily-Hunt repo via GitHub API
2. `scripts/build-threat-intel.mjs` — normalize, score, slice, write JSON to `public/data/threat-intel/`
3. Weekly GitHub Action opens a PR if anything changed (same pattern as `si-upstream-sync.yml`)
4. Deploy from root via `wrangler deploy` (per CLAUDE.md "two wranglers" rule)

**Surfaces:**

- **MCP tools (new namespace `ti_*`, registered on existing `DFIR_MCP` Durable Object):**
  - `ti_list_cves({severity?, kevOnly?, vendor?, daysBack?})` — paginated index reads
  - `ti_get_cve({cveId})` — full CVE body
  - `ti_list_kev()` — CISA KEV list
  - `ti_search_ioc({family?, type?})` — IOC family search
  - `ti_get_ioc({family})` — full IOC body
  - `ti_brief_sector({sector, maxItems?})` — pre-rendered sector brief
  - `ti_stats()` — manifest stats (cache hits/misses like `si_stats`)

- **REST routes (`/api/v1/threat-intel/*`, 15 SI-style routes; key-gated for external reads):**
  - `GET /api/v1/threat-intel/` (slim index)
  - `GET /api/v1/threat-intel/cves/:cveId`
  - `GET /api/v1/threat-intel/cves?severity=…&kev=…&vendor=…`
  - `GET /api/v1/threat-intel/kev`
  - `GET /api/v1/threat-intel/iocs/:family`
  - `GET /api/v1/threat-intel/iocs?family=…&type=…`
  - `GET /api/v1/threat-intel/sectors/:sector`
  - `GET /api/v1/threat-intel/sectors` (Financial/Healthcare/Government list)
  - `GET /api/v1/threat-intel/stats`

- **Frontend dashboard (new SPA route `/threat-intel`, 4 panels):**
  - CVE feed (sortable, filterable)
  - KEV list (with priority score column)
  - IOC family browser (search by family/type)
  - Sector brief cards (one per sector)

**Upside:**

- **Reuses the proven SI pipeline** — same manifest shape, same LRU cache pattern in `worker/lib/si-manifest.ts`, same script shape, same test pattern (vitest unit tests, R4-style). Lowest learning curve.
- **No new infrastructure** — no D1 migration, no R2 namespace, no KV namespace. Reuses `env.ASSETS`.
- **50-subrequest cap is comfortable** — index + 1-2 body reads per call.
- **Reversible** — additive, lives in its own `public/data/threat-intel/` tree. If we kill the vertical, the SI surface is untouched.
- **Free-plan friendly** — read-only ASSETS, no DB writes, no egress, no LLM cost on read path. LLM only used in pipeline for sector briefs (one shot per sector per week).

**Downside:**

- **Weekly freshness, not real-time** — KEV deltas are at most 24h stale, but a user requesting "what's new RIGHT NOW" will see up to 7 days old. For threat intel this is fine — CISA KEV is curated.
- **Bundle growth** — slim index + per-slug bodies adds ~2-3 MB on top of the current 4.2 MB SI bundle. Still well under Worker limits, but worth watching.
- **AGPL boundary** — we cannot copy OpenThreat code. All ingest + priority scoring must be rewritten from scratch. Daily-Hunt files are JavaScript and we will re-format the IOCs into our JSON shape, not copy the JS.

**Effort:** L (5-7 days for the full vertical: pipeline + 6 MCP tools + 9 REST routes + dashboard + tests + AGENTS.md updates)

**Reversibility:** Easy — additive, no shared code with SI, no schema changes.

---

### Option B: D1-backed, queryable Threat Intel DB

Add D1 tables for CVEs, KEV, IOC families, sector briefs; query directly.

**Upside:**

- Real-time queries (no manifest staleness)
- Can support per-user filters, subscriptions, saved searches
- Mutable — corrections, takedowns, vendor updates flow through

**Downside:**

- **D1 migration immutability** — once a migration is in prod, you can't change it. Adding CVEs as a new domain means a big new migration that's hard to evolve.
- **BRIEFINGS_DB is for the briefings product** — sharing one DB across two product verticals mixes concerns. New D1 binding `THREAT_INTEL_DB` would mean more cost and more deploy risk.
- **50-subrequest cap burns on every list/search** — list pages hitting D1 + Cache + Workers AI for LLM enrichment would be tight.
- **Higher ops surface** — migration scripts, schema docs, query plans, indexes.

**Effort:** XL (8-12 days, plus a new binding + migration discipline + DB-specific tests)

**Reversibility:** Hard — D1 migrations are immutable; ripping the tables out is a destructive migration.

---

### Option C: Clone cyber_threat_intel Python/Ollama agent verbatim

Port NarendraKarki's pure-Python agent to run as a Worker. Drop Ollama, swap in Workers AI.

**Upside:**

- Fastest to a sector-briefing demo (the LLM code is already battle-tested)
- 1:1 feature parity with the reference

**Downside:**

- **Doesn't absorb OpenThreat or Daily-Hunt** — only covers one of the three repos. Doesn't match the "all three, full fidelity" answer.
- **stdlib HTTP + curl fallback** pattern is Python-shaped; would not fit Worker's `fetch` model well.
- **No CVE catalog, no IOC catalog** — just briefs.

**Effort:** M (2-3 days) — but it leaves the other two repos unaddressed.

**Reversibility:** Easy.

---

## RECOMMENDATION

**Option A.** It's the only path that ships all three repos' value under the 50-subrequest cap, matches the architecture we've already validated with SI, and stays reversible. The AGPL boundary on OpenThreat forces us to rewrite the priority-scoring logic anyway, so we lose nothing by not forking. D1 (Option B) is tempting but mixes product verticals and locks us into migration discipline we don't need yet. Option C only covers a third of the scope.

The cron+cache pattern is the right call. Workers AI is used once per sector per week in the pipeline (cheap), and reads are zero-LLM.

---

## WHAT WE'RE GIVING UP

- **Real-time freshness.** A user hitting `ti_list_kev` on Monday morning may see Friday's snapshot. Mitigation: run the cron twice a week (Tue + Fri) and surface a `lastSyncedAt` field in every response so the UI can show "data as of X" honestly.
- **AGPL-driven rewrite cost.** We cannot vendor OpenThreat's Python priority-scoring code. We will re-derive the scoring formula from its README, not copy it. This is ~1 day of extra work.
- **A single fat manifest for everything.** Keeping the slim-index + per-slug shape means every MCP tool call does 2-3 ASSETS reads instead of 1. Within the 50-subrequest cap this is fine, but it does mean the tools are slightly slower than a hypothetical D1 query path.

---

## FIRST ACTION AFTER THIS DECISION

1. Create a feature branch: `git checkout -b threat-intel-vertical`
2. Run `/create-migration` is **not** needed — D1 is not in scope for v1.
3. Add `docs/loops/threat-intel-sync.md` loop template (mirrors `si-upstream-sync.yml` structure).
4. Scaffold `public/data/threat-intel/` with empty `index.json`.
5. Write `scripts/sync-threat-intel.mjs` (NVD + CISA KEV + Daily-Hunt GitHub fetch).
6. Write `scripts/build-threat-intel.mjs` (normalize + score + slice).
7. Add `worker/lib/threat-intel-manifest.ts` (LRU cache + loader, copy pattern from `si-manifest.ts`).
8. Wire 6 `ti_*` MCP tools into `worker/mcp-server.ts`.
9. Wire 9 REST routes under `/api/v1/threat-intel/*` in `worker/index.ts`.
10. Add SPA route `/threat-intel` with 4 panels in `src/pages/` (register per `/new-route` skill — page + App.tsx + prerender ROUTES).
11. Vitest tests in `worker/lib/threat-intel-manifest.test.ts` (mirror SI's 12 tests).
12. Weekly sync workflow: `.github/workflows/threat-intel-sync.yml` (mirror `si-upstream-sync.yml`).
13. Update `worker/scheduled.ts` to log `ti-stats` JSON on every cron tick.
14. Update `CLAUDE.md` to add the vertical to the loop-templates list and the "two wranglers" footgun (deploy-from-root).
15. `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p api/tsconfig.json && npx tsc --noEmit -p api/tsconfig.worker.json` — all three must pass (per CLAUDE.md "esbuild deploys past tsc" footgun).
16. `npx vitest run` — all tests green (SI's 45 + Threat Intel's ~12).
17. `npx wrangler deploy --dry-run` — bundle under 10 MB / 3 MB gzip, all bindings intact.
18. Deploy from repo root: `npm run deploy`.

---

## KILL CRITERIA

If during the build, any of these become true, stop and re-decide:

- The slim `index.json` grows past 200 KB (means our slicing is wrong; consider sharded indexes per Option A's sub-pattern)
- Worker bundle exceeds 10 MB / 3 MB gzip
- LLM sector-brief pipeline cost exceeds $5/week (means we need a cheaper model or shorter context)
- D1 ends up needed for user-specific data (e.g., "follow this CVE" subscriptions) — that's a separate decision, not a v1 concern
