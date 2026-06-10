# Polymarket Predictions (cyber / tech / AI) — Design

**Date:** 2026-06-10
**Status:** Approved (design); pending implementation plan

## Goal

Surface Polymarket prediction-market data, filtered to **cyber-threat**, **tech**, and
**AI** topics, on the threat-intel platform — as both a standalone feed page and a
toggleable Global Pulse layer — while staying inside the Cloudflare free-plan
subrequest budget.

## Decisions (locked)

| Question | Decision |
| --- | --- |
| Placement | **Both** — standalone page **and** a Global Pulse layer |
| Market selection | **Hybrid** — Polymarket native tags for AI/Tech + keyword match for cyber-threat |
| Ranking | **Volume + liquidity**, capped ~15–20 markets per bucket |
| Route name | `/api/v1/predictions` + `/threatintel/predictions` (source-agnostic; labeled "Prediction Markets · Polymarket") |
| Globe behavior | Non-geographic → CTI Live Feed panel only; no synthetic globe coordinates |

## Data source

Polymarket **Gamma API** (`https://gamma-api.polymarket.com/markets`) — free, no auth,
read-only. Returns `question`, `outcomes`, `outcomePrices`, `volume`, `liquidity`,
`endDate`, `slug`, `active`/`closed`, and tag/category metadata.

Selection (hybrid) merges 2–3 upstream calls in-worker:

1. **AI bucket** — query Polymarket AI/Tech tag(s) for active, non-closed markets.
2. **Tech bucket** — query Tech tag(s).
3. **Cyber bucket** — keyword match over active markets:
   `breach`, `ransomware`, `hack`, `hacked`, `CVE`, `CISA`, `outage`, `data leak`,
   `cyberattack`, `zero-day`, `exploit` (curated set, tunable).

After fetching: classify into buckets (a market may match a bucket via tag or keyword),
dedupe by market id/slug, rank each bucket by `volume + liquidity`, cap at ~15–20.

A market that matches multiple buckets is assigned to its strongest signal (cyber >
ai > tech precedence) to avoid duplication across sections.

## Backend

- `api/src/providers/polymarket.ts` — fetch + normalize Gamma markets to the internal
  shape; fail-soft (return `[]` on upstream error/timeout, never throw).
- `api/src/routes/predictions.ts` — `GET /api/v1/predictions` handler: orchestrates the
  hybrid fetch, classification, ranking, caps; returns the envelope below. Registered in
  `api/src/index.ts`.

**Response envelope** (matches repo feed convention, snake_case):

```jsonc
{
  "total": 47,
  "buckets": {
    "cyber": [ /* Market[] */ ],
    "tech":  [ /* Market[] */ ],
    "ai":    [ /* Market[] */ ]
  },
  "timestamp": "2026-06-10T09:00:00Z",
  "source": "Polymarket"
}
```

**Market shape:**

```jsonc
{
  "question": "Will OpenAI release GPT-6 before 2027?",
  "slug": "openai-gpt6-2027",
  "url": "https://polymarket.com/market/openai-gpt6-2027",
  "probability": 0.62,          // top-outcome implied probability (0–1)
  "outcomes": [ { "name": "Yes", "price": 0.62 }, { "name": "No", "price": 0.38 } ],
  "volume": 1840000,
  "liquidity": 220000,
  "end_date": "2026-12-31T00:00:00Z",
  "bucket": "ai",
  "tags": ["AI", "Tech"]
}
```

## Frontend — standalone page

`src/pages/threatintel/Predictions.tsx`, built on the canonical `DataPageLayout`
component (inherits the redesign tokens + a11y states). Fetches `/api/v1/predictions`
on mount. Renders three bucket sections (Cyber / Tech / AI), each a responsive grid of
market cards:

- question (truncated, full on hover/title)
- probability bar for the top outcome (e.g. `62% Yes`)
- volume + resolution date
- "view on Polymarket ↗" link (`rel="noopener noreferrer"`, new tab)

Bucket filter chips (All / Cyber / Tech / AI). Loading / empty / error states come from
`DataPageLayout` (`loading`, `empty`, `error` + `onRetry`).

Wiring:
- `src/App.tsx` — lazy route `{ path: '/threatintel/predictions', Component: Predictions }`.
- `src/data/threatintel-sections.ts` — add a `Tool` entry (News/Intel section).
- `src/data/sidebar-nav.ts` — add a `SidebarItem`.
- `scripts/prerender.mjs` **and** `worker/router.ts` — add `/threatintel/predictions` to
  both `PRERENDERED_ROUTES` lists (the route-drift test enforces all three agree).

## Frontend — Global Pulse layer

- `api/src/routes/global-pulse.ts` — add `prediction_market` to the `PulseKind` union;
  add a `fromPredictions()` converter that reads the cached `/api/v1/predictions` data
  and emits `PulseEvent[]` (non-geo: omitted from globe arcs, shown in the feed panel).
- `worker/scheduled.ts` — add `predictions` to the `gp:warm` warm list (+1 subrequest/hour).
- `src/pages/threatintel/GlobalPulse.tsx` — add `prediction_market` to the `PulseKind`
  union + a `LayerDef` (label "Prediction Markets", short "PM", `TrendingUp` icon,
  intel group, toggleable); include its events in the aggregation.
- `src/pages/threatintel/PulseMap.tsx` — add `prediction_market` to `EventKind` +
  `KIND_COLORS` + `KIND_LABELS` (keeps the drift/`Record<EventKind>` maps complete).

## Budget

- Reads: served from KV (`predictions:warm`, ~10-min TTL) + CF edge cache → ~0
  subrequests amortized.
- Cold build: ≤3 upstream Gamma fetches.
- Global Pulse: +1 to the hourly `gp:warm` warm (≈16 → 17 of 50). Comfortable headroom.

## Error handling

- Provider fail-soft: upstream error/timeout → that bucket resolves to `[]`; the route
  returns 200 with whatever buckets succeeded (never a 500).
- Standalone page: empty buckets render the `DataPageLayout` empty state; a full failure
  shows the error state with retry.
- Global Pulse: missing predictions data is simply an absent layer (existing
  merge-with-fallback pattern already tolerates missing sources).

## Testing

`api/test/routes/predictions.test.ts` (vitest-pool-workers, run un-sandboxed locally):

- mocked Gamma response → correct bucket classification (tag + keyword paths)
- ranking by volume+liquidity and per-bucket cap
- response envelope shape
- multi-bucket market assigned once (precedence cyber > ai > tech)
- upstream failure → 200 with empty buckets (fail-soft), not 500

## Out of scope (YAGNI)

- Odds-history / momentum (would need extra price-history calls).
- Trading, wallet, or any write/auth interaction with Polymarket.
- Non-cyber/tech/AI markets (politics, sports, etc.).
