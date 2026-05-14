# Cybersecurity Case-Study Generator — Design

**Date:** 2026-05-14
**Author:** brainstormed with Claude
**Status:** Draft, pending review

## Goal

Auto-generate and publish cybersecurity case-study blog posts on the portfolio at a randomized cadence of 2–3 posts/week, with a human approval gate. Posts cover four types: CVEs, threat actors, malware/tools, and ransomware groups. The entire system runs on the existing Cloudflare Worker using KV and Workers AI — no new services, no paid subscriptions.

## Non-goals

- Cross-posting to Medium, dev.to, or other platforms (could be added later)
- Image generation beyond on-brand SVG hero banners
- Newsletter/email distribution
- Comments, reactions, or any reader interactivity
- Automated publishing without human approval

## Decisions locked during brainstorm

| #   | Decision                                                                        |
| --- | ------------------------------------------------------------------------------- |
| 1   | Self-hosted blog on portfolio (`/blog`) — no external publishing platforms      |
| 2   | Hybrid discovery: auto-discover candidates → human approval → publish           |
| 3   | LLM via Cloudflare Workers AI free tier (no API subscription)                   |
| 4   | 2–3 posts/week, randomized weekday + hour                                       |
| 5   | Admin page at `/admin`, gated by `ADMIN_TOKEN` env secret                       |
| 6   | Four type-specific templates (CVE / Threat Actor / Malware / Ransomware)        |
| 7   | Procedurally generated SVG hero banners (no stock photos / external image APIs) |

## Architecture

Single new logical subsystem inside the existing Worker. One new KV namespace, one new Workers AI binding, **one new cron trigger** (hourly, with internal time-based branching to handle three logical jobs).

```
                    ┌─────────────────────────────────────────┐
                    │   Cloudflare Worker (existing)          │
                    │                                         │
   Cron Trigger ────┤  scheduled(): hourly :05                │
                    │    if (hour===6) → runDiscovery         │
                    │    if (sun && hour===23) → runPlanner   │
                    │    always → runPublisher                │
                    │                                         │
   Public routes ───┤  /blog, /blog/:slug, /blog/rss.xml      │
                    │                                         │
   Admin routes ────┤  /admin, /api/v1/admin/*  (token-gated) │
                    │                                         │
                    │  Bindings:                              │
                    │  ├── KV: CASE_STUDIES   (new)           │
                    │  ├── AI: Workers AI     (new)           │
                    │  └── Existing 22 IOC providers          │
                    └─────────────────────────────────────────┘
                                      │
                                      ▼
                              Data sources (existing)
                              KEV · NVD · abuse.ch · MITRE
                              dark-web feed · RSS feeds
```

**Why one cron, three jobs:** Cloudflare free-plan cron trigger count is limited, and the portfolio already uses two (daily + weekly Intel Briefings). A single hourly cron with internal time-based branching is cleaner, consumes only one slot, and keeps everything in a single scheduled handler:

```ts
async scheduled(event, env, ctx) {
  const now = new Date(event.scheduledTime);
  const hour = now.getUTCHours();
  const day  = now.getUTCDay();

  ctx.waitUntil(runPublisher(env, now));               // every hour

  if (hour === 6)
    ctx.waitUntil(runDiscovery(env, now));             // daily 06:00 UTC
  if (day === 0 && hour === 23)
    ctx.waitUntil(runPlanner(env, now));               // Sundays 23:00 UTC
}
```

## Discovery pipeline (daily 06:00 UTC)

### Sources per type

| Type         | Source                                                                                             | Signal                                   |
| ------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| CVE          | CISA KEV feed                                                                                      | newly added entries                      |
| CVE          | NVD recent CVEs                                                                                    | CVSS ≥ 7, has PoC reference              |
| Threat Actor | MITRE ATT&CK groups + existing vendor RSS feeds (Mandiant / CrowdStrike / Microsoft / Cisco Talos) | recent campaign mentions                 |
| Malware      | abuse.ch ThreatFox + MalwareBazaar                                                                 | first-seen ≤ 7 days, sample count rising |
| Ransomware   | existing `/dfir/darkweb` watcher output                                                            | new victim posts from active leak sites  |

### Scoring

Deterministic, transparent — no LLM in this step.

- **Recency** — 1.0 if ≤ 24h, linear decay to 0 over 14 days
- **Severity** — CVSS / KEV exploitation flag / victim count for ransomware
- **Novelty** — penalty if the same stable key surfaced as a candidate or published post within last 90 days (lookup in `meta:dedup:*`)
- **Source weight** — KEV > NVD; first-party vendor blogs > aggregators

Top 5 candidates per day are written to KV.

### Dedup

Every candidate gets a **stable key** so re-discoveries update rather than duplicate:

- `cve-2026-1234`
- `actor-fin7`
- `malware-lumma-stealer`
- `ransom-akira-2026-05`

### KV write

```ts
// Key: candidates:<type>:<stable-key>   TTL: 7 days
{
  key: "cve-2026-1234",
  type: "cve",
  title: "CVE-2026-1234 — Fortinet FortiGate auth bypass",
  rationale: "Added to KEV today; PoC public on GitHub; CVSS 9.8",
  score: 0.92,
  evidence: { /* full snapshot from each source — consumed by generator */ },
  discoveredAt: "2026-05-14T06:00:00Z",
  status: "pending"   // pending | approved | skipped | published
}
```

## Generation pipeline

Triggered by the Publisher when an approved candidate's slot is due. Five steps:

### 1. Enrich evidence

Re-fetch the candidate's `evidence` snapshot to capture anything new since approval, plus type-specific deepening:

- **CVE** → NVD CPE data, MITRE technique mapping, KEV notes
- **Threat Actor** → MITRE ATT&CK group page (techniques, software, sectors)
- **Malware** → abuse.ch family page, recent C2 from ThreatFox
- **Ransomware** → recent victim list, TTPs from leak-site claims, MITRE mapping

### 2. Build prompt from type-specific template

```
SYSTEM: You are a security analyst writing a technical case study for
        Pranith Jain's blog. House style: factual, sourced, no hype,
        no "in today's threat landscape" filler. Output Markdown only.

FACTS: <deterministic evidence as JSON — ground truth. Must not invent
        anything beyond this block.>

OUTLINE: <type-specific section list>

INSTRUCTIONS: Write 800-1200 words. Cite every claim using the FACTS
              block. If a section has no supporting facts, write
              "No public reporting yet." rather than fabricating.
```

The FACTS block is the anti-hallucination guardrail.

### Type-specific outlines

- **CVE / Vulnerability:** Summary → Affected products → How it works → Exploitation in the wild → Detection & mitigation → IOCs → References
- **Threat Actor:** Summary → Origin / attribution → Known campaigns → TTPs (MITRE mapped) → Targeted sectors → Recent activity → Defensive guidance → References
- **Malware / Tool:** Summary → Capabilities → Delivery → Infrastructure → IOCs (hashes, C2, domains) → Detection (YARA / Sigma if available) → Related families → References
- **Ransomware:** Group profile → Recent victims → Negotiation tactics → TTPs → Defensive recommendations → References

### 3. Call Workers AI

- **Primary model:** `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
- **Fallback model:** `@cf/meta/llama-3.1-8b-instruct` (on quota exhaustion or primary failure)
- `max_tokens` ≈ 3000, `temperature` 0.4

> **Model IDs must be verified against Cloudflare's current catalog at implementation time** — Cloudflare's available models change.

### 4. Post-process

- Strip any model preamble ("Here is the case study:")
- Validate every required `## ` section header is present (regex check)
- Sanitize markdown with `isomorphic-dompurify`
- Extract IOCs into a separate array using `api/src/lib/ioc-feed-parsers` patterns
- Auto-link IOC strings in body to `/dfir/ioc-check?q=<ioc>` (via a `marked` extension at render time, not stored)
- Hallucination smell test: every CVE / hash / domain mentioned in body must appear in FACTS — if not, write to `failed:` and surface in admin

### 5. SVG hero banner

Procedural — title text + type chip + on-brand pattern (dark bg, mono font, hex/glitch decoration). Same approach as the existing `scripts/generate-og-png.mjs`, but Worker-side and inline. Stored as a string on the post object.

### Output

```ts
{
  slug: "cve-2026-1234-fortinet-fortigate-auth-bypass",
  type: "cve",
  title: "CVE-2026-1234 — Fortinet FortiGate auth bypass",
  excerpt: "First 200 chars stripped of markdown",
  publishedAt: "2026-05-19T15:05:00Z",
  candidateId: "cve-2026-1234",
  body: "## Summary\n\n…",
  hero: "<svg …>",
  iocs: [
    { type: "ipv4", value: "1.2.3.4" },
    { type: "sha256", value: "…" }
  ],
  tags: ["cve", "fortinet", "auth-bypass"],
  sources: [ { url: "…", title: "…" } ]
}
```

## Publishing pipeline

### Schedule planner — Sundays 23:00 UTC

```ts
1. Read kv:approved (FIFO list of approved candidate IDs)
2. Target N = min(approved.length, randInt(2, 3))
3. Pick N distinct weekdays (weighted toward Tue/Wed/Thu)
4. For each picked day: random hour in 09:00-17:00 UTC, random minute 0-59
5. Write to kv:schedule:upcoming as sorted array:
   [
     { slotAt: "2026-05-19T14:23:00Z", candidateId: "cve-2026-1234", status: "pending" },
     { slotAt: "2026-05-21T11:07:00Z", candidateId: "actor-fin7",    status: "pending" }
   ]
```

If the approved queue is empty, no slots are scheduled — logged and skipped.

### Publisher — hourly :05

```ts
1. Read kv:schedule:upcoming
2. Find earliest slot where slotAt <= now() AND status === "pending"
3. If none, return (most hours do nothing — cheap)
4. CAS-mark slot status = "publishing" (re-read to confirm)
5. Run Generation pipeline
6. On success:
   - Write kv:posts:<slug>
   - Refresh kv:posts:index
   - Refresh kv:meta:rss
   - Refresh kv:meta:dedup:<stable-key> with publishedSlug
   - Remove candidate from kv:approved
   - Mark slot status = "published" with publishedSlug
7. On failure:
   - Write kv:failed:<slotId> with error + raw output
   - Mark slot status = "failed"
   - Surface in /admin Failed tab
```

**Why slots are "target windows," not exact times:** Cloudflare cron triggers fire on the minute they're scheduled (`5 * * * *` = hh:05). A slot scheduled for 14:23 actually publishes at 15:05. Acceptable for a personal blog — readers can't tell the difference, and we avoid sub-hour cron complexity.

**Manual override:** admin UI's "Publish now" button calls `POST /api/v1/admin/publish-now/:candidateId`, which uses `ctx.waitUntil(...)` to run generation in the background and returns `202 Accepted` immediately. The admin UI polls `/api/v1/admin/posts/:slug` to detect appearance.

## Admin interface

### Routes

```
GET  /admin                                    — UI (token in localStorage, login screen otherwise)
GET  /api/v1/admin/candidates                  — list pending (score desc)
POST /api/v1/admin/candidates/:id/approve
POST /api/v1/admin/candidates/:id/skip
POST /api/v1/admin/candidates/:id/regenerate   — re-enrich evidence
GET  /api/v1/admin/posts                       — list published (recent first)
POST /api/v1/admin/posts/:slug/unpublish
POST /api/v1/admin/posts/:slug/regenerate
GET  /api/v1/admin/schedule                    — view upcoming slots
POST /api/v1/admin/publish-now/:candidateId    — bypass schedule (async via waitUntil)
GET  /api/v1/admin/health                      — observability surface
```

### Auth

Hono middleware checks `X-Admin-Token` header (or `?t=<token>` query param) against `env.ADMIN_TOKEN`. Token stored via `wrangler secret put ADMIN_TOKEN`. No CSRF needed — the token _is_ the secret. Admin React app reads token from `localStorage` and sends it in headers. No auth state ships in public bundles.

### UI tabs

- **Pending** (default) — Type · Title · Score · Rationale · Discovered · [Approve] [Skip]
- **Approved** — queue, with [Publish now] / [Unapprove]
- **Schedule** — upcoming slots with linked candidates
- **Published** — Type · Title · Published · [Unpublish] [Regenerate] [View]
- **Failed** — slot · error · raw output · [Retry] [Skip]
- **Health** — last cron runs, queue sizes, failure counts

### Code-splitting

Admin route + components live in `src/pages/admin/*` and are dynamically imported. Public users never download the admin bundle.

## Storage layout (KV)

**One new KV namespace: `CASE_STUDIES`** declared in `wrangler.jsonc`.

```
candidates:<type>:<stable-key>     →  Candidate                7-day TTL
approved:<id>                      →  Full candidate snapshot  no TTL
schedule:upcoming                  →  Sorted slot array        no TTL (rewritten weekly)
posts:<slug>                       →  Post object              no TTL
posts:index                        →  Array of post summaries  no TTL (rebuilt on publish)
meta:rss                           →  Pre-rendered RSS XML     no TTL (rebuilt on publish)
meta:dedup:<stable-key>            →  Novelty lookup           90-day TTL
failed:<slotId>                    →  Failure record           30-day TTL
```

### Why KV over R2

- Each post ≤ 20 KB (well under KV's 25 MB cap)
- Read-heavy public traffic — KV reads cached at the edge automatically
- No runtime enumeration required (`posts:index` array drives listing)
- `list()` is slow and eventually consistent — the explicit index gives O(1) reads

## Public blog surface

### Routes

```
GET  /blog                  — paginated index (10/page)
GET  /blog/:slug            — individual post (SSR'd)
GET  /blog/tag/:tag         — filtered index
GET  /blog/type/:type       — filtered (cve / actor / malware / ransom)
GET  /blog/rss.xml          — full-content RSS 2.0 feed
GET  /blog/sitemap.xml      — blog-specific sitemap, referenced from /robots.txt
```

### Rendering

- Posts SSR'd through the existing `src/entry-server.tsx` pipeline
- Markdown → HTML via existing `marked` dependency, sanitized with `isomorphic-dompurify`
- IOC strings auto-linked to `/dfir/ioc-check?q=<ioc>` via a `marked` extension
- Hero SVG inlined into HTML — no extra request, no flash
- Code blocks: client-side syntax highlighting via small Prism-like lib OR static highlight at build (decide at implementation time)

### SEO basics per post

- `<title>`, meta description from excerpt
- Open Graph + Twitter card using a rasterized version of the SVG hero (reuses existing OG PNG generator path, cached)
- `<link rel="canonical">`
- JSON-LD `Article` schema (author = Pranith Jain, datePublished, keywords)

### Navigation integration

- "Blog" link in top nav
- Home hero section can spotlight the latest post (optional, decide at impl time)

### Privacy

No analytics, no tracking pixels, no third-party fonts — matches existing portfolio stance.

## Testing strategy

Vitest, consistent with the existing setup.

| Layer                                              | What's tested                                                                                                     |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Scoring (`api/src/lib/case-study/scoring.test.ts`) | Pure functions — recency decay, novelty penalty, source weights                                                   |
| Discovery (`…discovery.test.ts`)                   | Each source adapter with fixture responses; dedup keys, candidate shape, score range                              |
| Generation (`…generation.test.ts`)                 | Workers AI binding mocked; prompt construction, post-processing, hallucination smell test                         |
| Templates (`…templates.test.ts`)                   | Snapshot tests per type — fixture evidence → expected prompt                                                      |
| Publisher (`…publisher.test.ts`)                   | KV mocked; slot picking, CAS race guard, failure path                                                             |
| Admin routes (`api/test/admin.test.ts`)            | Token auth (401 / 200), approve/skip side effects, publish-now bypass                                             |
| E2E (`api/test/case-study-e2e.test.ts`)            | One golden path per type: fixture feed → discovery → approve → schedule → publish → assertions on body, IOCs, RSS |

### Manual smoke test before each deploy

- `wrangler dev` → trigger crons via `curl http://localhost:8787/__scheduled?cron=<expr>`
- Walk through admin flow with a fixture candidate

## Failure modes

| Failure                                   | Behavior                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Workers AI returns empty / garbage        | Validate sections; retry once with 8B fallback; if still bad, `failed:` + admin surface |
| Workers AI free quota exhausted           | Catch 429, mark `failed:` with `quota_exceeded`, planner re-slots next Sunday           |
| Source feed down (KEV / NVD / abuse.ch)   | Skip that source for the run, log; never block discovery on a single source             |
| Discovery returns no candidates           | Log `"no candidates today"` — silent skip                                               |
| Approved queue empty when planner runs    | No slots — silent skip                                                                  |
| Hallucination detected post-gen           | Validation rejects; admin Failed tab with raw output + Retry                            |
| KV race on concurrent publish             | Publishing flag + CAS re-read; realistically one cron fires per hour                    |
| Post-gen exceeds 30s (HTTP "Publish now") | `ctx.waitUntil()` runs it after response; UI polls for appearance                       |

## Observability

- Each cron job logs structured JSON to `console.log` (visible via `wrangler tail`). Fields: `job`, `duration_ms`, `outcome`, `candidate_ids`.
- `/api/v1/admin/health` surfaces: last discovery/planner/publisher run times, queue sizes (pending/approved/scheduled/failed), failure count last 7 days
- No external observability service — matches existing zero-dependency posture

## Free-tier budget check

| Resource             | Free quota    | Projected usage @ 2–3 posts/week                                                  |
| -------------------- | ------------- | --------------------------------------------------------------------------------- |
| Worker requests      | 100k / day    | trivial                                                                           |
| Worker cron CPU time | 30s free tier | publisher's own CPU work is well under 1s; Workers AI wait time is not CPU-billed |
| KV reads             | 100k / day    | trivial                                                                           |
| KV writes            | 1k / day      | < 20 / day                                                                        |
| KV storage           | 1 GB          | < 5 MB lifetime                                                                   |
| Workers AI neurons   | 10k / day     | one 70B post ≈ 200–500 neurons                                                    |

Comfortable headroom across every resource.

## Open implementation-time questions

- Exact Workers AI model IDs to use (verify Cloudflare's current catalog)
- Whether to host a small Prism-like syntax highlighter client-side or pre-highlight at generation time
- Whether to spotlight the latest blog post in the home hero or keep `/blog` as the only entry point

These are minor choices that don't change the architecture and can be settled when writing the implementation plan.
