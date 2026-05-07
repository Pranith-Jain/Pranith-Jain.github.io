# DFIR Toolkit + Portfolio Integration — Design

**Date:** 2026-05-07
**Owner:** Pranith Jain
**Status:** Draft for review
**Revision:** 3 — added free-tier constraints (no paid Cloudflare features) + design language reference (dfir-lab.ch-inspired aesthetic for `/dfir/*`)

## 1. Goal

Merge the DFIR Platform (currently `dfir/` with Next.js scaffold + FastAPI backend) into the personal portfolio (currently `Pranith-Jain.github.io`, **Vite + React 18 SPA** on Cloudflare Workers) so the unified site is served from `pranithjain.qzz.io`.

The toolkit lives at `/dfir` and all 5 tools (IOC checker, phishing analyzer, domain lookup, exposure scanner, file analyzer) work live against real threat-intel APIs. New functionality (dashboard, shareable results, theme, MITRE ATT&CK tagging, PDF export) and infrastructure improvements (SSE streaming, KV caching) are added on top of the original plan.

**Reuse policy:** the portfolio is the mature codebase (~30 components, tests, eslint, prettier, design system, sitemap, structured data, existing `DFIR.tsx`/`DFIRNavigation.tsx`/`useDFIRSettings.ts`). It is the **base**. The empty Next.js scaffold in the `dfir/` repo is **discarded**; only its planning docs (`DFIR-PLATFORM-PLAN.md`, `wiki_data.py` content, FastAPI code as porting reference) are carried over.

## 2. Architecture

### 2.1 Topology

One repo, **two** Cloudflare Workers under one domain.

- **Repo strategy:** the existing `Pranith-Jain.github.io` repo is the unified base. The DFIR planning docs and reference Python code from the `dfir` repo are pulled in (under `docs/dfir-legacy/`). The empty `dfir/web` Next.js scaffold is discarded. The standalone `dfir` repo is archived after cutover.
- **Frontend stack (existing):** Vite 6 + React 18 + react-router-dom v6 + Tailwind v3 + framer-motion + vitest. SPA bundles to `./dist`.
- **SPA Worker:** existing static-asset Worker (`wrangler.json` with `assets.directory: ./dist`) keeps serving the SPA at all non-API paths.
- **API Worker (new):** a separate Cloudflare Worker at `api/` in the same repo, deployed independently, bound to the route `pranithjain.qzz.io/api/v1/*`. This is where every threat-intel call, KV cache, share/recent storage, and PDF generation lives.
- **Why two Workers, not one:** Cloudflare's static-asset Workers can't currently host long-lived API logic alongside SPA assets cleanly. Splitting keeps the SPA build fast (Vite, no SSR) and lets the API Worker iterate on its own deploy cadence.
- **Domain:** `pranithjain.qzz.io` unchanged. Routes binding sends `/api/v1/*` to the API Worker, everything else to the SPA Worker.
- **The original FastAPI `api/` Python code is kept as porting reference under `docs/dfir-legacy/api-reference/`** until phase 2 ships, then deleted.

### 2.2 Cloudflare bindings (API Worker `api/wrangler.toml`)

| Binding     | Type         | Purpose                                          | Notes                              |
| ----------- | ------------ | ------------------------------------------------ | ---------------------------------- |
| `KV_CACHE`  | KV namespace | Threat-intel response cache                      | TTL 1h–24h by indicator type       |
| `KV_SHARES` | KV namespace | Shared-result snapshots + recent-lookups history | TTL 30d (recent), 90d (shares)     |
| `R2_FILES`  | R2 bucket    | File analyzer uploads                            | 10MB limit, hash-only mode default |
| `RL_API`    | Rate limit   | `/api/v1/*` abuse protection                     | 30 req/min/IP                      |

The SPA Worker (existing `wrangler.json` at repo root) keeps no bindings — pure static assets. All bindings live on the API Worker only.

### 2.3 Secrets (`wrangler secret put`)

`VT_API_KEY`, `ABUSEIPDB_API_KEY`, `SHODAN_API_KEY`, `GREYNOISE_API_KEY`, `OTX_API_KEY`, `URLSCAN_API_KEY`, `HYBRID_ANALYSIS_API_KEY`, `PULSEDIVE_API_KEY`. Never committed.

## 3. Routes & sitemap

### 3.1 Portfolio routes (existing react-router-dom v6 in `src/App.tsx`)

```
/                       portfolio home (existing src/pages/Home.tsx)
/about                  src/pages/About.tsx
/skills                 src/pages/Skills.tsx
/experience             src/pages/Experience.tsx
/projects               src/pages/Projects.tsx
/dfir                   src/pages/DFIR.tsx (existing — kept and extended)
```

### 3.2 DFIR sub-routes (new react-router children of `/dfir`)

```
/dfir                   landing — tool grid + recent activity + intro (extends existing DFIR.tsx)
/dfir/ioc-check         IOC checker UI
/dfir/phishing          phishing email analyzer UI
/dfir/domain            domain lookup UI
/dfir/exposure          exposure scanner UI
/dfir/file              file analyzer UI
/dfir/wiki              knowledge base index (5 categories)
/dfir/wiki/:slug        wiki article (pre-rendered to static HTML for SEO via vite-plugin-prerender or equivalent)
/dfir/dashboard         recent lookups (anonymous, cookie-keyed)
/dfir/r/:id             shared result page (read-only)
```

### 3.3 API routes (separate Cloudflare Worker at `api/`)

```
GET  /api/v1/ioc/check?indicator=…    SSE stream, per-provider results
POST /api/v1/phishing/analyze
GET  /api/v1/domain/lookup?domain=…
GET  /api/v1/exposure/scan?domain=…   SSE stream
POST /api/v1/file/analyze              hash-mode + optional upload
GET  /api/v1/wiki/articles
GET  /api/v1/wiki/[slug]
POST /api/v1/share                     returns short id
GET  /api/v1/share/[id]
GET  /api/v1/recent                    last 20 lookups for cookie uid
GET  /api/v1/export/pdf?share_id=…     PDF download
```

## 4. Backend

### 4.1 Layout

API Worker (separate from SPA):

```
api/
  src/
    index.ts            router (itty-router or Hono) — dispatches /api/v1/* paths
    routes/
      ioc.ts            GET /api/v1/ioc/check (SSE)
      phishing.ts       POST /api/v1/phishing/analyze
      domain.ts         GET /api/v1/domain/lookup
      exposure.ts       GET /api/v1/exposure/scan (SSE)
      file.ts           POST /api/v1/file/analyze
      wiki.ts           GET /api/v1/wiki/articles, /api/v1/wiki/:slug
      share.ts          POST /api/v1/share, GET /api/v1/share/:id
      recent.ts         GET /api/v1/recent
      pdf.ts            GET /api/v1/export/pdf
    providers/
      virustotal.ts
      abuseipdb.ts
      shodan.ts
      greynoise.ts
      otx.ts
      urlscan.ts
      hybridanalysis.ts
      pulsedive.ts
    lib/
      scoring.ts        composite-score (port of providers.py:calculate_score)
      cache.ts          KV cache wrapper, per-type TTL, stale-while-revalidate
      mitre.ts          provider-tag → ATT&CK technique map
      share.ts          encode/decode share-link payloads
      indicator.ts      type detection + defang/refang helpers
      sse.ts            ReadableStream helpers for text/event-stream
  wrangler.toml         API Worker config + bindings
  package.json
  tsconfig.json

src/data/
  wiki/                 markdown source files (migrated from dfir/api/wiki_data.py)
  wiki-index.ts         build-time index used by the prerender plugin
```

The SPA Worker stays at `wrangler.json` (repo root) and serves `./dist` only.

### 4.2 Provider adapter contract

Every adapter exports the same shape so the IOC route can fan out and combine results:

```ts
export async function query(
  indicator: { type: 'ipv4' | 'ipv6' | 'domain' | 'url' | 'hash' | 'email'; value: string },
  env: Env
): Promise<ProviderResult>;

type ProviderResult = {
  source: 'virustotal' | 'abuseipdb' | 'shodan' | 'greynoise' | 'otx' | 'urlscan' | 'hybridanalysis' | 'pulsedive';
  status: 'ok' | 'error' | 'unsupported';
  score: number; // 0-100, normalized
  verdict: 'clean' | 'suspicious' | 'malicious' | 'unknown';
  raw_summary: object; // flat fields for the UI
  tags: string[]; // feeds MITRE mapping
  fetched_at: string; // ISO timestamp
  cached: boolean;
};
```

Each adapter handles its own auth header, error mapping, normalization, and timeout (5s default).

### 4.3 Composite scoring (`lib/scoring.ts`)

Weighted average per indicator type — for an IP, AbuseIPDB and GreyNoise weigh more than hash-focused sources; for a hash, VT and Hybrid Analysis dominate. Port the existing `calculate_score` logic from `api/providers.py`. Add a confidence band derived from the count of providers that responded `ok` vs `error`.

### 4.4 Caching (`lib/cache.ts`)

- **Key:** `sha256(provider:indicator_value)`
- **TTL:** hashes 24h, domains 6h, IPs 1h, URLs 1h
- **Hit:** return cached result immediately, set `cached: true`
- **Miss:** query provider, write to KV, return
- **Stale-while-revalidate (SSE only):** emit cached result instantly, kick off refresh in background, emit a second event if the refreshed result differs

### 4.5 SSE streaming (IOC + Exposure)

The route handler returns a `ReadableStream` with `Content-Type: text/event-stream`. Frontend uses `EventSource` to render provider cards in three states (`pending` → `result` / `error`). Fast (cached) providers appear within ~200ms; slow ones don't block the others.

### 4.6 Anti-abuse

- **Per-IP rate limit (KV-based, no binding):** key `rl:<sha1(ip)>:<minute_bucket>` → counter. On each request, `INCR`-equivalent (read+write). Reject if > 30/min. Ten KV ops/request is cheap; counters expire via TTL=120s. Avoids the rate-limit binding (paid).
- **Per-provider circuit breaker:** two consecutive 401/403 responses within 5 min mark the provider unhealthy in KV for 15 min; further requests short-circuit
- **Input hardening:** payloads >10kB rejected, email bodies truncated to 64kB, file uploads capped at 10MB

### 4.7 Workers caveats (deliberately accepted)

- **30s CPU limit per request** — fine for a fan-out of 8 provider calls (each ~1–3s)
- **Exposure scanner** does not run nmap; it stays a wrapper around Shodan/Censys/passive-DNS, identical to current Python behavior
- **File analyzer** is hash-only by default. Optional drag-drop upload writes to R2, server computes SHA-256, queries by hash. No actual sandbox detonation — third-party only.

## 5. New features

### 5.1 Recent lookups dashboard (`/dfir/dashboard`)

- Anonymous, cookie-keyed (random 16-byte id stored in `dfir_uid` cookie)
- KV stores last 20 lookups per uid, TTL 30 days
- UI lists indicator, verdict chip, score, age, "re-run" button
- No login. Clearing cookies clears history.

### 5.2 Shareable result links (`/dfir/r/[id]`)

- "Share" button on any result page → POST `/api/v1/share` with the result snapshot → returns short id (e.g. `r/Xk2P9q`)
- KV stores the snapshot, TTL 90 days
- Read-only page, no recompute, "Re-run live" CTA links back to the tool with prefilled input
- Open Graph: a single **static OG image** stored in `public/og-dfir-share.png` (built once, served by SPA Worker). Share links unfurl with this generic image plus the dynamic title/description. Dynamic Satori-generated images are deferred until/unless the account upgrades from free.

### 5.3 Dark/light theme

- Tailwind v4 with CSS variables, `<html data-theme="…">` toggle
- System preference default, manual override stored in `localStorage`
- Toggle in DFIR layout header

### 5.4 MITRE ATT&CK tagging (`lib/mitre.ts`)

- Static map: provider tag → ATT&CK technique id (e.g. URLScan `phishing` → `T1566.002`, VirusTotal `cryptominer` → `T1496`)
- Result UI renders ATT&CK chips with links to mitre.org technique pages
- Map-based only — no inference beyond what the map covers, to avoid false attribution

### 5.5 PDF export (free-tier-safe)

- "Export PDF" button on result and share pages → opens `/dfir/r/:id?print=1` in a new tab
- That route renders a **print-optimized HTML view** (`@media print` CSS, no nav/footer, monospace indicators, full provider table)
- The print page auto-triggers `window.print()` on load; the user's browser produces the PDF
- **Zero server CPU cost.** Identical end-result quality with no Worker compute.
- Server-side `@react-pdf/renderer` and Cloudflare Browser Rendering are both **out of scope** (CPU and/or paid)

## 6. Improvements

- **Streaming via SSE** (§4.5)
- **KV caching with per-type TTL** (§4.4)
- **Stale-while-revalidate** for SSE flows (§4.4)
- **Optimistic UI** — defanged echo + indicator type detection runs client-side instantly while providers load
- **Skeleton loaders + error boundaries** on every tool page
- **Bulk IOC mode** — paste up to 50 indicators on `/dfir/ioc-check`; internal queue runs concurrency=5; results stream in as each finishes. Triggered automatically when input contains multiple lines.

## 7. Out of scope

Listed explicitly to keep scope tight:

- User accounts, login, OAuth — anonymous + cookie is enough for a portfolio piece
- Credit / billing system — drop "Phase 3 Enterprise" from the original `DFIR-PLATFORM-PLAN.md`
- Real port scanning, sandbox detonation, malware execution — third-party APIs only
- Mobile app
- CLI tool (`dfir-cli`)
- Self-hosted variant
- Cloudflare Browser Rendering integration for PDFs
- **Anything that requires a paid Cloudflare plan** (Workers Paid, Browser Rendering, paid rate-limit, advanced bot management). MVP must work entirely on the free tier.

## 8. Migration phases

| #   | Phase                        | Scope                                                                                                                                                                                                                                                | Acceptance                                                                                                                                                 |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Foundation                   | Clone `Pranith-Jain.github.io` locally as the unified working tree. Add `api/` directory with Worker scaffolding, `wrangler.toml`, KV/R2 bindings, secret placeholders, dev/prod envs. Set up the routes binding so `/api/v1/*` hits the API Worker. | `wrangler dev` for both Workers boots locally; `curl localhost:.../api/v1/health` returns `{"ok": true}`; SPA still builds and serves on its existing port |
| 1   | DFIR consolidation           | Pull DFIR planning docs and FastAPI reference code from `dfir/` repo into `docs/dfir-legacy/` of unified repo. Add `/dfir/*` child routes (placeholder pages) under existing `DFIR.tsx`. Update `DFIRNavigation.tsx` with new sub-routes.            | Visiting `/dfir/ioc-check`, `/dfir/phishing`, etc. on the SPA renders a placeholder page; portfolio still passes existing tests                            |
| 2   | Provider adapters + IOC tool | Port `providers.py` → `lib/providers/*.ts`, scoring, caching, IOC route handler with SSE, IOC checker UI                                                                                                                                             | `/dfir/ioc-check` works live with VirusTotal + AbuseIPDB + GreyNoise at minimum; cache hit returns < 200ms                                                 |
| 3   | Remaining adapters + tools   | Shodan, OTX, URLScan, Hybrid Analysis, Pulsedive. Build phishing, domain, exposure, file analyzer UIs + routes                                                                                                                                       | All 5 tool pages return live data from ≥ 2 providers each on cold cache; ≥ 1 of those providers must be currently in good health                           |
| 4   | Wiki                         | Migrate `wiki_data.py` content → `src/data/wiki/*.md` (frontmatter + markdown). Build index + article pages. Set up `vite-plugin-prerender` (or equivalent) to emit static HTML for each `/dfir/wiki/:slug` at build time.                           | `/dfir/wiki` lists 5 categories, individual article URLs return server-rendered HTML in `view-source:` (crawlable)                                         |
| 5   | New features (B)             | Dashboard, share links, theme toggle, MITRE chips, PDF export                                                                                                                                                                                        | Each feature has at least one happy-path test                                                                                                              |
| 6   | Polish & cutover             | Rate limiting, circuit breakers, OG images, SEO metadata, error boundaries, delete `api/` Python code, archive old portfolio repo, point `pranithjain.qzz.io` at new Worker                                                                          | Lighthouse ≥ 90 on `/` and `/dfir`; all tool pages return data with p95 < 3s                                                                               |

## 9. Risks & mitigations

| Risk                                                    | Mitigation                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Provider free-tier quota exhaustion                     | KV cache + circuit breaker + rate limit on `/api/v1/*`                                                       |
| API key leak via misconfigured env                      | Secrets via `wrangler secret put` only; `.dev.vars` gitignored; pre-commit hook scans for known key prefixes |
| Cloudflare Worker 30s CPU limit                         | Per-provider 5s timeout; SSE streams partial results so a stuck provider doesn't kill the request            |
| File upload abuse                                       | 10MB cap, content-type validation, hash-only default mode                                                    |
| Shared result links leaking sensitive data              | Snapshots are explicit user action; expire after 90 days; no PII in shares                                   |
| Migration breaks live portfolio at `pranithjain.qzz.io` | Cut over via Cloudflare gradual deployment (10% → 100%); keep old Worker deployable as rollback for 7 days   |

## 10. Success criteria

- `pranithjain.qzz.io/` serves the existing portfolio with parity to today (no regression)
- `pranithjain.qzz.io/dfir/<tool>` serves all 5 tools with live results from ≥ 2 providers each
- Wiki articles return prerendered HTML and are indexed by Google within 4 weeks of cutover
- p95 tool response time < 3s with cache warm
- Zero secrets in git history (verified by pre-commit secret scan)
- Old standalone `dfir` repo archived; FastAPI reference code deleted from unified repo after phase 2 ships
- Entire MVP runs on the **Cloudflare free tier** with daily KV writes < 1k and Worker requests < 100k

## 11. Free-tier budget

| Resource           | Free quota      | MVP usage estimate                                        | Headroom       |
| ------------------ | --------------- | --------------------------------------------------------- | -------------- |
| Worker requests    | 100k/day        | ~500/day at small audience                                | 200×           |
| Worker CPU         | 10ms/invocation | ~3–8ms typical (provider fan-out is I/O, not CPU)         | tight, monitor |
| Worker subrequests | 50/invocation   | 8 (one per provider in IOC fan-out)                       | 6×             |
| KV reads           | 100k/day        | ~3 per request (cache lookup + recent + share) ≈ 1.5k/day | 60×            |
| KV writes          | 1k/day          | ~1 per cache miss; mostly hits expected ≈ 100/day         | 10×            |
| KV storage         | 1GB             | <50MB cached responses + history                          | 20×            |
| R2 storage         | 10GB            | <100MB hashed file uploads                                | 100×           |
| R2 Class A ops     | 1M/month        | minimal — uploads only                                    | 1000×          |
| Custom domains     | unlimited       | 1 (`pranithjain.qzz.io`)                                  | n/a            |

**Hot constraints to monitor:**

1. **Worker CPU time:** the only feature at risk is PDF/OG generation — already swapped for client-side print + static OG (§5.2, §5.5).
2. **KV writes:** if traffic spikes, cache write storms could exhaust 1k/day. Mitigation: stale-while-revalidate already debounces refresh writes; add probabilistic 10% sampling for SWR if needed.
3. **Subrequests per invocation:** 50 is plenty for 8 providers. Stay below 20 to leave room for cache + recent-history reads in the same invocation.

If any of these regularly hit ceilings, the user can upgrade to Workers Paid ($5/mo) for 50ms CPU and 1000 subrequests — design supports this with no code changes.

## 12. Design language for `/dfir/*` (dfir-lab.ch-inspired)

Applies only to routes under `/dfir/*`. Portfolio routes (`/`, `/about`, `/skills`, `/experience`, `/projects`) keep their existing visual identity. The transition between aesthetics is intentional — `/dfir` is a "tool surface" that should feel distinct from the personal-brand portfolio.

### 12.1 Palette

| Token               | Value                                                         | Usage                                 |
| ------------------- | ------------------------------------------------------------- | ------------------------------------- |
| `dfir-bg`           | `#0a0a0a` (near-black)                                        | page background                       |
| `dfir-surface`      | `#111113`                                                     | cards, code blocks, elevated surfaces |
| `dfir-border`       | `#1f1f23`                                                     | hairline borders, dividers            |
| `dfir-text`         | `#fafafa`                                                     | primary text                          |
| `dfir-text-dim`     | `#a1a1aa`                                                     | secondary text, metadata              |
| `dfir-accent`       | reuse `neon.cyan: #00fff9` from existing `tailwind.config.js` | links, focus rings, key highlights    |
| `dfir-accent-hover` | `#22d3ee`                                                     | hover state                           |
| `dfir-warn`         | `#f59e0b`                                                     | suspicious verdict                    |
| `dfir-danger`       | `#ef4444`                                                     | malicious verdict                     |
| `dfir-ok`           | `#10b981`                                                     | clean verdict                         |

Add these as Tailwind theme extensions in `tailwind.config.js` under a new `dfir.*` namespace so the existing `brand.*` palette stays untouched.

### 12.2 Typography

- Headings: existing `Poppins` (already in `fontFamily.display`), weights 600–700
- Body: existing `Inter` (already in `fontFamily.sans`)
- Monospace: existing `Space Grotesk` (already in `fontFamily.mono`) — use for IOCs, hashes, IPs, code blocks, endpoint URLs
- Scale: H1 38–44px, H2 28–32px, H3 20–22px, body 15–16px, mono 14–15px

### 12.3 Layout primitives

- **DFIR layout shell** (`src/components/dfir/DfirLayout.tsx`): dark background, sticky compact top nav (logo / Tools dropdown / Wiki link / theme toggle), content max-width 1200px, generous 32px section padding.
- **ToolPage shell**: breadcrumbs → page title → 1-line subtitle → form-card → result rows. Keep input form above the fold.
- **Wiki grid**: category filter pills along the top (`All | Email Security | Threat Intel | Forensics | Detection | Attack Types`), then a responsive 1/2/3-column grid of concept cards. Each card: title (Poppins 600), 1–2-line definition (Inter), small metadata (category tag), entire card is the link.
- **Result row** (per-provider in IOC checker): provider logo or initials, score chip, verdict chip (color from §12.1), tags row, "details" disclosure expanding to raw summary.
- **Code/snippet block**: `bg-dfir-surface`, `border-dfir-border`, `text-dfir-text`, mono font, optional cyan inline-highlight for the active line.
- **Metric callout** (homepage / tool landing): bold cyan number + dim label, e.g. `312ms · 11 sources`.

### 12.4 Don'ts

- No gradient blobs, no framer-motion-heavy animations on `/dfir/*` (existing portfolio keeps them; the DFIR sub-app feels calmer)
- No emoji decoration; lucide-react icons only
- No light-mode-first styling on `/dfir/*` — the section is dark-only by design (theme toggle still works, but DFIR forces its own scheme regardless)

### 12.5 Reference

`https://dfir-lab.ch/` (homepage) and `https://dfir-lab.ch/wiki/` (knowledge base) — match the spirit of these pages, not the literal layout. Don't copy assets, copy patterns.
