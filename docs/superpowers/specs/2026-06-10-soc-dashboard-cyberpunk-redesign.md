# SOC Dashboard Cyberpunk Redesign

**Date:** 2026-06-10
**Status:** Approved (design) — pending implementation plan
**Scope:** The three threat-intel SOC dashboards (`/threatintel/iocs`, `/threatintel/vulns`,
`/threatintel/ransomware`) and their shared component layer.

## Problem

The three SOC dashboards are visually weak ("low") and the data presentation is "not accurate":

- **Broken/messy charts.** Donuts render as a mess of unreadable slivers; the IOC
  "Threat Frequency (Types)" chart is effectively broken (everything reads ~0 except one
  bar — a log-scale failure); horizontal bar / donut labels overlap and get cut off.
- **Foreign-language / junk category labels.** Although this repo's component tokens are
  English, any upstream `sector`/`country`/severity string the maps don't recognize renders
  verbatim and falls back to neutral grey — so foreign-language or variant category names can
  leak through unnormalized (the failure mode visible in the reference product as
  `OTROS` / `SALUD` / `DESCONOCIDO`).
- **No "is this good or bad" context.** Numbers are shown bare — no trend vs. the previous
  window, no inline sparkline.
- **Unaudited numbers.** KPI numerators/denominators and percentage bases have not been
  verified against the live API contracts.

The user wants the dashboards rebuilt to a **full cyberpunk aesthetic** (pure-black canvas,
glowing oversized numerals, corner-bracket "scanner" frames, DEFCON-style status banners) —
matching the quality of the reference screenshots — while fixing all four data problems
above.

## Goals

1. **Full cyberpunk visual theme** for all three dashboards, distinct and bold, while never
   misrepresenting the underlying data.
2. **Readable charts** — no slivers, no overlapping/cut-off labels, no broken frequency chart;
   every chart has legible labels, a legend or axis, and hover tooltips.
3. **Clean English categories** — a normalization layer guarantees sector/country/severity
   names are canonical English before they reach a chart; unknown → "Unknown".
4. **Correct numbers** — every KPI and percentage audited against the real API response.
5. **Context per metric** — trend-vs-previous-window deltas and inline sparklines where a
   time series exists.

## Non-goals

- No new charting library. Keep the **custom-SVG** approach (the repo has a documented
  history of Lighthouse/bundle reverts; a chart lib would blow the perf budget for no gain).
- No API/Worker changes **unless** the number audit uncovers a genuine server-side bug. The
  category normalizer lives client-side so it is testable in isolation and adds zero
  subrequest cost to the Free-plan-limited fan-out.
- No changes to the rest of the portfolio's brand. The cyberpunk theme is scoped to the SOC
  component layer (`src/components/threatintel/soc/`), which is consumed **only** by these
  three pages.

## Resolved decisions

- **Custom SVG, no library.** Confirmed.
- **Status banner is functionally accurate, styled boldly.** The DEFCON / "ACTIVE SENSORS" /
  "SYSTEM NOMINAL" flavor text is _derived from the real severity logic already in each page_
  (e.g. `critical → "DEFCON 1 · ACTIVE INTRUSIONS"`), not hardcoded theater. It looks like the
  reference but never lies.

## Architecture

Reskin and extend the existing shared SOC component layer in place — no duplicate
`CyberShell`, because nothing outside these three pages consumes it.

### Files

| File                                                     | Change                                                                                                                                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/threatintel/soc/tone.ts`                 | Add cyberpunk palette: canvas/black tokens, per-dashboard neon accents (IOC violet, Vulns cyan, Ransomware red), severity glow colors, DEFCON mapping. Keep existing severity hexes.                                               |
| `src/components/threatintel/soc/SocShell.tsx`            | Cyberpunk canvas (near-black `#05070d` + faint CSS grid/scanline/vignette, cheap CSS only — no large blur filters). Controls (window toggle / refresh / export / back-link) restyled to match. Status badge → DEFCON-style banner. |
| `src/components/threatintel/soc/SocCharts.tsx`           | Rewrite chart internals for readability (see below). Same component APIs (`SocBar`, `SocDonut`, `SocSparkline`) so the three pages need minimal prop churn.                                                                        |
| `src/components/threatintel/soc/SocShell.tsx` (`SocKpi`) | KPI card → "scanner frame": corner brackets, uppercase mono micro-label, oversized severity-glow numeral, optional inline sparkline slot, delta chip.                                                                              |
| `src/components/threatintel/soc/categories.ts` _(new)_   | `normalizeSector()`, `normalizeCountry()`, `normalizeSeverity()` — map foreign-language + variant spellings to canonical English; unknown → "Unknown". Pure functions, unit-tested.                                                |
| `src/pages/threatintel/SocIocs.tsx`                      | Apply normalizer to type/criticality categories; fix frequency chart; add prev-window delta + sparkline; audit KPIs.                                                                                                               |
| `src/pages/threatintel/SocVulns.tsx`                     | Apply normalizer to severity/vendor categories; add prev-window delta + sparkline; audit KPIs.                                                                                                                                     |
| `src/pages/threatintel/SocRansomware.tsx`                | Route `sector`/`country` through normalizer before charting; audit KPIs (main-actor share, top-named-sector).                                                                                                                      |

### Component contracts (unchanged public APIs)

- `SocBar({ items, max?, axis?, vertical?, height?, onItemClick?, defaultColor? })` — internals
  rewritten for label legibility + tooltips; props stable.
- `SocDonut({ slices, size?, thickness?, centerLabel?, centerSub?, legend?, emptyText? })` —
  gains internal small-slice grouping into "Other" and an always-on legend with value + %.
- `SocSparkline(...)` — already exists; wired into KPI frames.
- `categories.ts` — `normalizeSector(raw: string): string`, `normalizeCountry(raw: string):
string`, `normalizeSeverity(raw: string): 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'|'UNKNOWN'`.

## Chart rewrite details

- **Donut.** Group all slices below a share threshold (e.g. <2%) into a single "Other" slice
  to eliminate the sliver mess. Always render the legend (label · value · %). Neon stroke with
  a soft glow; hover highlights the matching slice + legend row. Center shows total + caption.
- **Horizontal bars.** Neon gradient fill; value label right-aligned and never clipped; long
  category labels truncate with an ellipsis and expose the full string via `title` tooltip
  (fixes the overlapping/cut-off country labels).
- **Frequency / type-distribution chart.** Replace the broken log-scale chart with an honest
  **linear horizontal bar** (categorical: counts per type) or **area-over-time** (temporal:
  counts per day). Pick per dashboard based on what the data actually is. No log scale.

## Data correctness

- **`categories.ts` normalizer** runs on every category string before it becomes a chart label
  or KPI pick. Backed by lookup tables for the known foreign-language / variant spellings
  (sectors, countries, severity words) plus a passthrough for already-canonical English and a
  final "Unknown" bucket. Unit tests cover the leak cases.
- **KPI audit.** Per page, verify each numerator/denominator and percentage base against the
  live API response shape (`/api/v1/live-iocs`, `/api/v1/cve-recent`,
  `/api/v1/ransomware-recent`). Confirm headline picks (IOC critical/sensitive %, Vulns
  critical-vector / high-severity %, ransomware main-actor share + top-named sector) are
  correct. Fix any that are wrong; note the ones already correct.

## Context additions

- **Trend vs previous window.** Generalize the `prevCount` delta pattern already in
  `SocRansomware.tsx` (delta chip + direction hue) to the IOC and Vulns pages.
- **Inline sparklines.** Wire the existing-but-unused `SocSparkline` into KPI frames wherever a
  per-day series is available.

## Testing & verification

- **Unit:** `categories.ts` normalizer — assert known foreign/variant inputs map to canonical
  English and unknowns bucket to "Unknown".
- **Typecheck:** all three projects (`tsc -p tsconfig.json`, `-p api/tsconfig.json`,
  `-p api/tsconfig.worker.json`) — esbuild deploys past `tsc`, so this is the only gate.
- **Visual:** run the app and screenshot all three dashboards; compare against the reference
  for readability (no slivers, no clipped labels, legible numerals) and confirm the cyberpunk
  theme reads as intended in dark mode.
- **Perf guard:** glows are `text-shadow`/`box-shadow` (GPU-composited, cheap); no `backdrop-
blur` on large areas, no animated `filter`. Sanity-check no bundle regression.

## Risks & footguns (from repo memory)

- Deploy from **repo root** (`npm run deploy`), not `api/`, for this frontend change.
- Per-edit hook typechecks `api/src` but not `worker/`; this change is all frontend
  (`src/`), so the standard `tsc -p tsconfig.json` covers it.
- `main` auto-FF-merges feature branches mid-session — commit on the branch, never
  rebase/force-push; re-check the current branch before any git mutation.
