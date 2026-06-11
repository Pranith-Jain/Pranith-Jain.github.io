# Threat-Intel Unified Search → Omnibox — Design

> Status: **approved-pending-spec-review** · Date: 2026-06-11 · Branch: `feat/unified-search-omnibox`

## Goal

Upgrade the threat-intel **Unified Search** into a single ranked "omnibox" that searches
**both the tool catalog and live threat data** in one place, with entity-aware quick-actions,
relevance ranking, and an **opt-in AI summary**. Wire the **existing** global ⌘K command
palette to launch it. The `/threatintel` landing tile-filter is left untouched.

This is a focused upgrade of three already-shipped surfaces — it builds almost nothing new
from scratch; it ranks, merges, and connects what exists.

## Context — what exists today (and the gap)

Three separate "search" experiences exist, none of which talk to each other:

1. **Landing tile-filter** — `src/pages/threatintel/Home.tsx`. Client-side substring filter over
   the tool catalog (`src/data/threatintel-sections.ts`: `SECTIONS` = 19 sections / 106 `Tool`s;
   helpers `flattenTools`, `matchesQuery`). Finds _tool surfaces_, not data. **Stays as-is.**
2. **Unified Search page** — `src/pages/threatintel/UnifiedSearch.tsx` → `GET /api/v1/unified-search`
   (`api/src/routes/unified-search.ts`). Fans out across **12 cached sources + 3 live lookups**
   (ransomware, c2, live-iocs, detections, actor-timeline, cve-recent, writeups, cybercrime,
   ioc-correlation, breaches, malware-samples, malpedia + live CVE lookup + live IOC reputation
   check + in-memory actor KB). Ranking today is **`sections.sort((a,b) => b.total - a.total)`** —
   count-sorted, no item-level relevance, no entity awareness, no deep-links into tools, no AI.
3. **Global ⌘K palette** — `src/components/dfir/CommandPalette.tsx`, already mounted in `App.tsx`
   (~line 654) for **both** `/dfir` and `/threatintel`. Searches a static ~340-entry catalog
   (`src/data/dfir/searchable-content.ts`), does IOC entity-pivots with deep-links, remembers
   recent paths. **It never calls `/api/v1/unified-search`** — it has zero live-data awareness.

**The gap:** the page that has live data has crude ranking and no tools/entity/AI; the palette
that has entity-pivots + reach has no live data. This design closes that gap.

## Decisions (locked)

| #   | Decision  | Choice                                                                                                  |
| --- | --------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Vision    | One smart omnibox: tool catalog **+** live threat data, merged                                          |
| 2   | Placement | Unified Search **page** becomes the omnibox; global ⌘K **opens** it; landing tile-filter untouched      |
| 3   | AI        | Deterministic + instant by default; **opt-in** AI summary (Groq `llama-4-scout`, fenced)                |
| 4   | ⌘K depth  | **Launcher action only** — one "Search live intel for ⟨q⟩ →" entry; no inline live fetch in the palette |

## Architecture — four coordinated pieces

```
┌─────────────────────────────── FRONTEND ───────────────────────────────┐
│ C. UnifiedSearch.tsx (the omnibox page)                                 │
│    • entity header + quick-actions   • TOOLS section (client catalog)    │
│    • LIVE DATA sections (ranked)      • [✨ Summarize] button            │
│ D. CommandPalette.tsx  →  + "Search live intel for ⟨q⟩ →" launcher row   │
└───────────────┬───────────────────────────────────┬─────────────────────┘
                │ GET /api/v1/unified-search?q=       │ POST .../summarize
┌───────────────▼───────────────┐   ┌────────────────▼─────────────────────┐
│ A. unified-search.ts (upgrade)│   │ B. unified-search-summarize (new)    │
│   • scoreMatch() ranking      │   │   • fenceUntrusted(items)            │
│   • +score on items (additive)│   │   • runCompletion (Groq+fence)       │
│   • same 15 sources preserved │   │   • validateAiOutput · cache 1h      │
└───────────────────────────────┘   └──────────────────────────────────────┘
```

### A. Backend — `/api/v1/unified-search` ranking (`api/src/routes/unified-search.ts`)

One additive change (ranking); the 15 source searchers, same-origin auth, `unifiedSearchSchema`
(`api/src/lib/validation-schemas.ts:237`), `index.ts:932` registration, and the 120 s
`Cache-Control` all stay. **Entity detection is NOT a backend concern** — see A2 below for why it
lives entirely on the frontend, so the API response change is purely an additive `score` field.

**A1. Item-level relevance ranking.** Add a pure `scoreMatch(needle, fields)` helper (its own
unit-tested module, e.g. `api/src/lib/search/rank.ts`):

```ts
// Higher = more relevant. Deterministic, no I/O.
export function scoreMatch(needle: string, primary: string, secondary = ''): number {
  const n = needle.toLowerCase().trim();
  const p = primary.toLowerCase();
  if (!n) return 0;
  if (p === n) return 100; // exact
  if (p.startsWith(n)) return 80; // prefix
  if (new RegExp(`\\b${escapeRe(n)}`).test(p)) return 60; // word-boundary in label
  if (p.includes(n)) return 45; // substring in label
  if (secondary.toLowerCase().includes(n)) return 25; // substring in description
  return 0;
}
```

Each searcher attaches a `score` to its `SearchItem`s (label = primary, description = secondary).
Items sort by score desc within a section; sections sort by their **top item's score** (ties
broken by `total`, preserving today's behavior when scores tie). Add an optional small
**source-priority** tiebreak constant (e.g. live-iocs / actor-kb slightly above writeups) so a
freetext actor name surfaces the actor KB before a blog post. `SearchItem` gains an optional
`score?: number`; the frontend response stays backward-compatible (extra field, no removals).

**A2. Entity detection is frontend-only (no backend change).** The frontend **already owns** a
maintained detector + deep-link builder: `detectIoc(raw)` → `DetectedIoc | null`
(`src/lib/dfir/ioc-detect.ts:48`, `IocType` union at line 28) and `getIocPivots(ioc): Pivot[]`
(`src/lib/dfir/ioc-detect.ts:100`), which returns the exact `{ label, desc, path }` deep-links per
IOC type (CVE→`/dfir/cve?id=`, IP/domain/hash→`/dfir/ioc-check?indicator=` + `/threatintel/correlation?q=`,
BTC→`/dfir/crypto-trace?address=`, email→`/dfir/breach-check?email=`, …). The omnibox page calls
these locally and renders the pivots **instantly with zero round-trip**. The worker cannot import
`src/` (separate build roots) and there is no reason to duplicate this — so the backend gains **no**
entity field. **Actor** queries are freetext (`detectIoc` returns null); their affordance comes for
free from the existing "Threat Actor KB" / "Actor Timeline" result sections, whose items already
deep-link to `/threatintel/actors/<slug>`.

Budget note: the live IOC fan-out (AbuseIPDB / blocklist.de / URLhaus / MalwareBazaar) still only
fires for ip/domain/hash and stays well under the 50-subrequest cap. Ranking is pure CPU — zero new
per-request fetches.

### B. AI summary — new opt-in endpoint (reuses existing engine)

The existing `/api/v1/ai-summary` (`api/src/routes/ai-summary.ts`, lib `api/src/lib/ai-summary.ts`,
`generateAiSummary`) is **admin-gated** (`index.ts:479` `requireAdminMiddleware`) — so the public
omnibox **cannot** call it. We mount the **same** `generateAiSummary` logic at a new
**same-origin (non-admin)** path:

```ts
app.post(
  '/api/v1/unified-search/summarize',
  validate('json', unifiedSearchSummarizeSchema),
  unifiedSearchSummarizeHandler
);
```

- **Same-origin auth only** (the default `authenticate('external-only')` already on `/api/v1/*` —
  no admin gate, no key for the frontend), **not** added to `ADMIN_GATED_PREFIXES`.
- **Request body reuses the `ai-summary` shape** (`{ surface, date, items: [{title, body, source?}], maxItems? }`)
  so the client POSTs the search results it already has — **no second search fan-out** (subrequest-safe).
- Inside `generateAiSummary`: untrusted items are wrapped with
  `fenceUntrusted(itemLines, 'SEARCH_RESULTS')` and the system prompt carries
  `UNTRUSTED_DATA_SYSTEM_NOTE` (`api/src/lib/prompt-fence.ts`) — identical to the 7 existing fence
  sites. Generation goes through `runCompletion(env.AI, input, { groqKey: env.GROQ_API_KEY })`
  (`api/src/case-study/generation/ai-client.ts`): Groq `meta-llama/llama-4-scout-17b-16e-instruct`
  primary, Workers-AI fallback. Output runs through `validateAiOutput`
  (`api/src/lib/ai-output-validator.ts`) to strip untrusted URLs + score quality.
- **Cost containment** (because it's public): cache the summary 1 h by normalized-query hash
  (mirrors `ai-summary`'s existing 1 h cache), the global `apiKeyRateLimit` middleware already
  applies, input is capped/sliced, and it bounds to **one** LLM call per uncached query.
- **Graceful degradation:** if `GROQ_API_KEY` is unset _and_ Workers-AI fails, return 503 /
  `{ error: 'summarization unavailable' }`; the button shows an inline "unavailable" state and the
  deterministic results remain fully usable. (Most likely we keep the existing graceful-`null`
  path in `generateAiSummary` and map `null → 503`.)

This is the only genuinely new backend surface, and it is ~30 lines of route glue over an existing,
production-tested lib.

### C. Frontend — Unified Search page → omnibox (`src/pages/threatintel/UnifiedSearch.tsx`)

Restructured results, same `DataPageLayout` + `?q=` URL state + same-origin fetch:

1. **Entity quick-actions header** — call the **existing** `detectIoc(query)` and, when it returns a
   `DetectedIoc`, render `getIocPivots(ioc)` as a row of action buttons (each `Pivot` is already a
   `{ label, desc, path, external? }` with a correct deep-link — CVE→`/dfir/cve?id=`,
   IP/domain/hash→`/dfir/ioc-check?indicator=` + `/threatintel/correlation?q=`,
   BTC→`/dfir/crypto-trace?address=`, email→`/dfir/breach-check?email=`, …). Internal `path`s render
   as `<Link>`; `external` ones as `<a rel="noopener">` through `sanitizeUrl()`. **No new mapping
   table is authored** — the omnibox reuses the pivots the palette + `/dfir` landing already use, so
   they stay in sync. Freetext **actor** queries return `null` from `detectIoc` and get their
   affordance from the actor result sections instead (their items already link to
   `/threatintel/actors/<slug>`).

2. **TOOLS section** (client-side, instant, zero backend coupling) — `import { SECTIONS, flattenTools, matchesQuery }`,
   render up to ~6 matching tiles, deep-linking to `tool.to`, rendered **above** live-data sections
   so a returning analyst lands on the tool fast. (This intentionally overlaps the landing
   tile-filter — that is the omnibox premise.)

3. **LIVE DATA sections** — unchanged rendering, now in the ranked order from piece A; each item may
   show its `score`-driven order implicitly (no score badge needed).

4. **`[✨ Summarize]` button** — appears once results exist. On click, POSTs the rendered items to
   `/api/v1/unified-search/summarize` and renders the result. **Reuse `AiSummaryCard`**
   (`src/components/intel/AiSummaryCard.tsx`) generalized with an **optional `endpoint` prop**
   (default `/api/v1/ai-summary` to preserve current callers; the omnibox passes the new public
   path). Loading/empty/unavailable states handled in-card.

Fetch hygiene: debounced query + `AbortController` to cancel in-flight searches on new keystrokes
(the page currently fetches on submit/initial only; debounce makes the omnibox feel live without
hammering the API given the 120 s cache).

### D. Global ⌘K — launcher action (`src/components/dfir/CommandPalette.tsx`)

A single additive change: when the palette has a non-empty query and the user is in (or the action
always routes to) the threat-intel omnibox, surface a top, always-present synthetic entry:

```
→ Search live intel for "⟨q⟩"     ⟶  navigate(`/threatintel/unified-search?q=${enc}`)
```

Modeled on the palette's existing synthetic IOC-pivot entries (it already builds
`{ label, path }` rows and `navigate`s on Enter). No async, no new fetch in the palette, no change
to `/dfir` behavior beyond one extra catch-all row. The palette stays a fast static-catalog
launcher; the omnibox page is where live results render.

## Data flow

```
keystroke
  ├─ (instant) client filter SECTIONS → TOOLS tiles
  ├─ (instant) detectIoc(q) locally for an optimistic entity header
  └─ (debounced) GET /api/v1/unified-search?q=
        → relevance-ranked sections (+score)        ── 120s edge cache
  click ✨ Summarize
  └─ POST /api/v1/unified-search/summarize {items}
        → fenceUntrusted → runCompletion(Groq) → validateAiOutput → {summary}  ── 1h cache
⌘K anywhere → "Search live intel for ⟨q⟩" → /threatintel/unified-search?q=
```

## Error handling & edge cases

- **Cold source cache** → that section returns `total:0` and is dropped (today's behavior, kept).
- **No entity** (`detectIoc` returns null) → no quick-action row; actor sections still carry their own links.
- **Empty query** → existing 400-free empty response; tools/live sections both empty.
- **No `GROQ_API_KEY` + Workers-AI failure** → summarize returns 503; button shows "AI summary
  unavailable", deterministic results unaffected.
- **Abort** → cancelled fetches are swallowed (no error toast on supersede).
- **Oversized/odd query** → `unifiedSearchSchema` 1–500 char clamp already enforced; summarize input
  is sliced before fencing.

## Security

- **Same-origin** preserved for both endpoints; summarize is explicitly **not** admin/key-gated but
  **not** added to public-external allowlist beyond same-origin.
- **Prompt-injection:** every untrusted search item is `fenceUntrusted(…, 'SEARCH_RESULTS')`'d and the
  system prompt carries `UNTRUSTED_DATA_SYSTEM_NOTE`; output runs `validateAiOutput` (URL strip +
  ungrounded-CVE / MITRE checks). This extends the existing input-side fence to a new LLM boundary.
- **Output rendering:** summary text rendered as plain text (no `dangerouslySetInnerHTML`); any links
  go through `sanitizeUrl`.

## Performance / budget

- Ranking is **pure CPU**; entity detection is client-side — zero added subrequests.
- Live IOC fan-out unchanged and within the **50-subrequest** cap.
- 120 s response cache on search; **1 h** cache on summaries; debounce + abort on the client.
- One LLM call per uncached summarize click only.

## Testing

- **Lib unit (CI, no network):** `scoreMatch` ordering (exact > prefix > word-boundary > substring >
  desc) and `rankSections` (items sorted within a section, sections by top item, count tiebreak) —
  pure, injected inputs. Mirror `api/test/lib/address-labels.test.ts` style.
- **Route (local, sandbox-disabled — CI skips `test/routes/`):** unified-search still 200s and now
  returns ranked order for a seeded cache; the summarize mini-app returns a summary with a fake Groq
  fetch and a 503 when the key is absent. Mirror `api/test/routes/crypto-monitor.test.ts` + the
  existing `ai-summary` test, flipping `OPEN_PUBLIC_READS` in the test env.
- **Verification (mandatory, esbuild-deploys-past-tsc):** all three —
  `tsc -p tsconfig.json && tsc -p api/tsconfig.json && tsc -p api/tsconfig.worker.json` — plus the
  lib tests in CI and route tests locally.

## Out of scope (YAGNI / future)

- Inline live-data hits **inside** the ⌘K palette (decision 4 = launcher only).
- AI-first natural-language querying / LLM-planned source selection.
- New data sources (supply-chain, crypto labels) in unified-search — the upgrade ranks the existing
  15; adding sources is a separate change.
- Touching the landing tile-filter or the `/dfir` ToolSearchBar.
- A keywords/aliases field on `Tool` (catalog search stays label+desc+section).

## Repo footguns honored

- Two wranglers — deploy from **root**. `validate()` schema mirrors handler reads exactly.
- Route tests run sandbox-disabled & are CI-skipped → run locally. Lib tests in CI inject `fetch`.
- `GROQ_API_KEY` is **optional** → the AI path must degrade, never throw.
- Commit on this feature branch; never rebase/force-push `main`; rebase onto `origin/main` before deploy.
- Run the worker tsconfig after any `api/src` change touched by the worker.
