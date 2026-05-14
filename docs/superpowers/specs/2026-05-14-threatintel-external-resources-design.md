# Threat-Intel External Resources Catalog — Design

**Date:** 2026-05-14
**Owner:** Pranith Jain
**Status:** Draft for review

## 1. Goal

Replace the inline "External Sources" block on the `/threatintel` landing page with a dedicated catalog page at `/threatintel/external-resources`. The catalog consolidates the 10 existing cross-reference entries with 6 new hands-on / community / research links into a single filterable surface that mirrors the established `/threatintel/awesome-lists` pattern.

**Why a separate page:** the landing has ~10 sections already; the External Sources block is the only one whose content keeps growing. A dedicated page lets the list scale to 30–50 entries with filtering, without bloating the landing tools grid.

## 2. Scope

**In scope**

- New route `/threatintel/external-resources` with the AwesomeLists-style UX: back-link, search box, multi-select kind pills, 2-column card grid, URL-state preservation.
- Data file consolidating all 16 entries (10 migrated + 6 new) with one `kind` value each.
- Replace the landing's `external` section with one catalog tile.
- OG/social metadata override for the new path.

**Out of scope (deferred)**

- Stars, badges, or rating columns (these aren't GitHub repos).
- Two-dimension filters (kind × topic). Single-dimension keeps UI light.
- Prerender / SSR for the new route. Stays a client-rendered lazy chunk; can be added later if the entry list grows large enough to need first-paint content.
- Migrating Awesome Lists into this catalog — they remain a distinct GitHub-repo-flavored surface.

## 3. UX & route

`/threatintel/external-resources` mirrors `/threatintel/awesome-lists` (`src/pages/dfir/AwesomeLists.tsx`):

- Header: title "External Resources", count line, one-sentence blurb.
- Search box: substring match across `name`, `description`, `why` (case-insensitive, multi-token AND).
- Pill row: one row of multi-select kind chips with per-kind counts. Inactive pills with count=0 are dimmed and disabled.
- Card grid: 2 columns on `md+`, single column on small screens. Card shows name (external-link icon), kind pill, description, optional `why:` note.
- URL state: `?q=<search>&kind=lab,tool`. Shareable view.
- Empty state: "Nothing matches the current filters. Clear all?" with a reset button.

Discoverability: a single tile labelled **"External Resources"** in the **Catalogues** section of the `/threatintel` landing, where Awesome Lists also lives.

## 4. Data model

```ts
// src/data/threatintel/external-resources.ts
export type ResourceKind =
  | 'training'
  | 'lab'
  | 'tool'
  | 'dashboard'
  | 'directory'
  | 'samples'
  | 'community'
  | 'research';

export interface ExternalResource {
  id: string; // kebab slug, unique within the file
  name: string; // display name
  url: string; // canonical external URL (no tracking params)
  kind: ResourceKind; // exactly one value drives the pill
  description: string; // 1–2 sentences, what the site IS
  why?: string; // optional analyst note: when/why to reach for it
}

export const KIND_LABELS: Record<ResourceKind, string> = {
  training: 'Training',
  lab: 'Lab',
  tool: 'Tool',
  dashboard: 'Dashboard',
  directory: 'Directory',
  samples: 'Samples',
  community: 'Community',
  research: 'Research',
};

export const KIND_PILL: Record<ResourceKind, string> = {
  // Tailwind class strings, matching FOCUS_PILL conventions in awesome-lists.ts.
  // Filled in during implementation.
};

export const RESOURCES: ExternalResource[] = [
  /* 16 entries — see §5 */
];
```

**Single-kind decision:** each entry has one `kind`. Multi-kind tagging was rejected to keep the catalog readable; a site like OpenSourceMalware (samples _and_ community) is tagged by its dominant artefact (`samples`) and the description mentions the community aspect.

## 5. Catalog entries (16)

### Migrated from `src/pages/threatintel/Home.tsx` (10)

Copy `description` strings verbatim from current Home.tsx. `why` blank for now.

| id                          | name                        | url                                       | kind      |
| --------------------------- | --------------------------- | ----------------------------------------- | --------- |
| my-threat-intel             | My Threat Intel             | `https://www.mythreatintel.com/?lang=en`  | dashboard |
| deepdark-cti                | deepdarkCTI                 | `https://github.com/fastfire/deepdarkCTI` | directory |
| threat-landscape-free-tools | Threat Landscape Free Tools | `https://threatlandscape.io/free-tools`   | directory |
| vecert-analyzer             | Vecert Analyzer             | `https://analyzer.vecert.io/index`        | tool      |
| world-monitor               | World Monitor               | `https://www.worldmonitor.app`            | dashboard |
| osint-tools                 | OSINT Tools                 | `https://osinttools.io/tools`             | directory |
| osintrack                   | OSINTrack                   | `https://osintrack.com/`                  | tool      |
| ai-soc                      | AI SOC                      | `https://aisoc.pplx.app/`                 | lab       |
| leakradar                   | LeakRadar                   | `https://leakradar.io/en/leaks`           | tool      |
| serus                       | Serus                       | `https://serus.ai`                        | tool      |

### New (6)

Descriptions verified against each site (2026-05-14 fetch). `why` notes can be added by hand later.

| id                    | name                  | url                                    | kind      | description                                                                                                                                          |
| --------------------- | --------------------- | -------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| opensourcemalware     | OpenSourceMalware     | `https://opensourcemalware.com/`       | samples   | Community-driven platform for sharing and analysing malware samples and threat intelligence.                                                         |
| ai-goat               | AI Goat               | `https://aigoat.co.in/learn/`          | lab       | Open-source AI security playground for hands-on LLM red teaming — prompt injection, RAG poisoning, OWASP LLM Top 10 — runs fully offline.            |
| vulnos                | VulnOS                | `https://learn.vulnos.tech/index.html` | training  | Cybersecurity learning platform with practical, interactive labs for hands-on skill building.                                                        |
| black-ledger-security | Black Ledger Security | `https://blackledgersecurity.ai/`      | research  | Research portfolio publishing AI/LLM security findings and the SPECTRA framework for context-aware adversarial testing of production AI deployments. |
| webverse-labs-pro     | WebVerse Labs Pro     | `https://webverselabs-pro.com/`        | lab       | Web-app pentest training platform — 36 labs across 5 difficulty tiers with XP, leaderboards, and vulnerability-chaining scenarios.                   |
| redteam-community     | Red Team Community    | `https://www.redteam.community/`       | community | Red-team practitioner community hub. (Description to refine — site fetch returned no body; tag from domain.)                                         |

**Open item:** `redteam-community` description is provisional. The implementation step will revisit it; if the live site still returns no extractable content, the description stays as written until the catalog owner provides one.

## 6. Files touched

**New (2)**

- `src/data/threatintel/external-resources.ts` — types + `RESOURCES` array + `KIND_LABELS` + `KIND_PILL`.
- `src/pages/threatintel/ExternalResources.tsx` — page component cloned from `src/pages/dfir/AwesomeLists.tsx`, simplified (no stars, no badges, single pill row).

**Edited (3)**

- `src/App.tsx` — add lazy import + `<Route path="external-resources" element={…}/>` under the existing `/threatintel` parent route, in alphabetical neighbourhood of `awesome-lists`.
- `src/pages/threatintel/Home.tsx` — delete the entire `id: 'external'` section (lines ~308–385 today). Add one tile in the **Catalogues** section with `to: '/threatintel/external-resources'` and a brief description.
- `worker/index.ts` — add a `/threatintel/external-resources` entry to `OG_OVERRIDES` for accurate social previews.

**Not touched**

- `worker/index.ts:PRERENDERED_ROUTES` — skipped (see §2 Out of scope).
- `scripts/prerender.mjs` — unchanged.
- AwesomeLists files — unchanged.

## 7. Error handling

The page is fully static — no fetch, no async failure mode. Only behaviour to verify:

- Empty filter result renders the "Nothing matches" affordance.
- URL state with an unknown `kind` value silently drops the unknown values and renders normally (mirror AwesomeLists' behaviour).

## 8. Testing

- A single render test in `src/components/__tests__/` (alongside the existing `DfirRoutes.test.tsx` style) that:
  1. Renders `/threatintel/external-resources`.
  2. Asserts every entry's `name` is present in the DOM.
  3. Asserts every `kind` pill is present.
  4. Filters by `?kind=lab` and asserts only `lab`-kinded entries remain visible.
- No backend changes, so no API tests.

## 9. Acceptance criteria

1. `/threatintel/external-resources` renders 16 entries.
2. Multi-select pills filter the grid; selection persists in the URL.
3. Search box narrows by name/description/why with multi-token AND.
4. `/threatintel` landing no longer shows the inline External Sources block; it shows one **External Resources** tile in the Catalogues section.
5. `npm run lint` passes. `npm run build` succeeds.
6. Social-card title/description for the new path matches the OG override.
