# CTI Platform — 3D Threat Globe Dashboard

**Date:** 2026-06-08
**Status:** Approved design, pending implementation plan
**Route:** `/threatintel/cti-platform`

## 1. Goal

Add a "CTI Platform" threat-intelligence dashboard to the threatintel section,
reverse-engineered from two reference screenshots of a commercial CTI product.
The centerpiece is an auto-rotating WebGL globe with severity-colored threat arcs
and impact points, surrounded by a Top-10 critical-threats rail, a live-feed
ticker, KPI counters, and severity/time-window/mode filters.

The page reuses the existing `SocShell` design system so it is visually
consistent with the other SOC pages (`SocIocs`, `SocRansomware`, `SocVulns`)
rather than cloning the source product's chrome.

### Reference deconstruction (what the screenshots contain)

- **Center:** WebGL 3D globe with animated source→target arcs, glowing impact
  dots, atmosphere glow; colored by severity (Critical/High/Medium/Low/Info).
- **Top bar:** KPI counters — Entries/24h, Critical, High, Geo count; "Updated X ago".
- **Filter row:** mode tabs (Threat Severity / Incident Type / Ransomware) +
  time-range pills (24h, 48h, Last Week, Last Month, This Year, Last Year, All Time).
- **Right rail:** "Top 10 Critical Threats" — ranked CVE cards with severity +
  type badges, source, relative time, CVE id.
- **Bottom:** collapsible "Live Feed" of recent items.
- **Left rail (NOT cloned):** the source product's own nav. We use `SocShell`
  - the site's existing threatintel nav instead.

## 2. Scope

**In scope (all four phases):**

1. Core — route + `SocShell` page + globe (points + arcs) + Top-10 rail +
   KPI counters + severity/time filters + live-feed bar + legend.
2. Interactivity — click point/arc → focus + drill-down side panel; click
   Top-10 card → highlight its arc/point; hover tooltips; reduced-motion +
   no-WebGL degradation.
3. Modes — Incident-Type / Ransomware dataset switching; sector/actor donut +
   trend sparklines beside the globe.
4. Extra layers — toggleable C2 / breach / dark-web point layers, each
   endpoint-verified against live output before being trusted.

**Out of scope:** cloning the source product's left navigation; any new
persistence; user-configurable saved searches.

## 3. Architecture

New lazy route in `src/App.tsx` following the existing SOC pattern:

```typescript
const CtiPlatform = lazy(() => import('./pages/threatintel/CtiPlatform'));
// ...
{ path: '/threatintel/cti-platform', Component: CtiPlatform },
```

New page: `src/pages/threatintel/CtiPlatform.tsx`, rendered inside `SocShell`.

New components under `src/components/threatintel/cti/`:

| File                   | Purpose                                                                                                                                                                                       | New dep        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `CtiGlobe.tsx`         | Wraps `react-globe.gl`. Props: `arcs[]`, `points[]`, `focus`, `onPointClick`, `onArcHover`, `paused`. **Internally `React.lazy`'d** so `three.js` lives in a chunk loaded only on this route. | react-globe.gl |
| `ThreatRail.tsx`       | "Top 10 Critical Threats" ranked CVE cards (severity + type badges, source, time, CVE id).                                                                                                    | —              |
| `LiveFeedBar.tsx`      | Bottom collapsible live-feed ticker.                                                                                                                                                          | —              |
| `CtiFilters.tsx`       | Mode tabs + time pills + layer toggles.                                                                                                                                                       | —              |
| `SeverityLegend.tsx`   | Globe legend overlay.                                                                                                                                                                         | —              |
| `useCtiData.ts`        | Orchestrates fetches per `(mode, windowDays, layers)`; returns normalized `{ arcs, points, topThreats, feed, kpis, sectors, generatedAt, degraded }`.                                         | —              |
| `geo.ts`               | Severity→color map, arc synthesis, KPI derivation, normalizers.                                                                                                                               | —              |
| `country-centroids.ts` | Static country-code → `{lat, lng}` table (~250 entries). No topojson load.                                                                                                                    | —              |

### Why these boundaries

- **`CtiGlobe`** owns all WebGL/three.js so the rest of the page is plain React
  and unit-testable. Swapping the globe library later touches one file.
- **`useCtiData`** is the only place that knows endpoint URLs and payload shapes;
  components receive normalized props. Mode/layer/time changes re-run the hook.
- **`geo.ts`** holds pure functions (centroid lookup, severity→color, arc
  synthesis, KPI derivation) so they can be unit-tested without the network or DOM.

## 4. Data layer

All data comes from existing endpoints — **no backend work required.**
Access via the existing `fetchJson` helper with `signal` + `cache: 'no-store'`
for live data, matching the SOC pages.

| Concern                              | Endpoint                           | Notes                             |
| ------------------------------------ | ---------------------------------- | --------------------------------- |
| Top-10 threats                       | `/api/v1/cve-recent?days=N`        | sort by severity, KEV, score      |
| Live feed                            | `/api/v1/live-iocs`                | recent indicators ticker          |
| Geo points/arcs — Severity mode      | `/api/v1/threat-map`               | observed malicious-source IP geos |
| Geo points/arcs — Ransomware mode    | `/api/v1/ransomware-map`           | victim countries + counts         |
| Geo points/arcs — Incident-Type mode | `/api/v1/cve-threat-map`           | CVE geo distribution              |
| Sector/actor donut                   | `/api/v1/ransomware-recent?days=N` | sectors[], groups[]               |
| Extra layer — C2                     | `/api/v1/c2-tracker`               | phase 4, verify live first        |
| Extra layer — breach                 | `/api/v1/breach-disclosures`       | phase 4, verify live first        |
| Extra layer — dark web               | `/api/v1/deepdarkcti`              | phase 4, verify live first        |

`useCtiData(mode, windowDays, layers)` returns:

```typescript
interface CtiData {
  arcs: Array<{
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    color: string;
    severity: Severity;
    label: string;
  }>;
  points: Array<{ lat: number; lng: number; severity: Severity; count: number; label: string; countryCode: string }>;
  topThreats: ThreatCard[]; // from cve-recent
  feed: FeedItem[]; // from live-iocs
  kpis: { entries24h: number; critical: number; high: number; geoCount: number };
  sectors: Array<{ label: string; value: number }>;
  generatedAt: string | null;
  degraded: boolean;
}
```

### Honesty about arcs (important modeling decision — APPROVED)

The available endpoints do **not** contain true paired attacker→victim links.
Arcs therefore model **observed malicious-source country → a focal monitored
target node** (source geos from IP/threat telemetry converging on a focal point),
**not** invented attacker→victim attribution. The legend and arc tooltips label
this explicitly ("observed source telemetry") rather than implying attribution we
do not have. Points represent real observed/victim geos with counts + severity.

## 5. Interaction

- Auto-rotating globe; pauses on hover/interaction and when
  `prefers-reduced-motion` is set.
- Click a point or arc → globe eases (`pointOfView`) to that geo; side drill-down
  panel filters Top-10 + feed to that geo.
- Click a Top-10 card → highlight its arc/point on the globe.
- Hover point/arc → tooltip (label, severity, count).
- No WebGL / load error → skeleton placeholder, then a static fallback message;
  the rest of the dashboard (rail, feed, KPIs) still works.

## 6. Performance guardrails

This repo has documented Lighthouse reverts for bundle bloat, so:

- `react-globe.gl` / `three.js` are imported **only** inside `CtiGlobe`, which is
  itself `React.lazy`'d inside the already-lazy route. Net effect: three.js lands
  in a dedicated chunk fetched only when this page renders the globe — zero impact
  on any other page's bundle.
- A skeleton placeholder shows until the chunk + first frame are ready.
- No globe imports anywhere in shared modules, `App.tsx`, or the SOC shell.

## 7. Testing

- **Unit (Vitest):** pure functions in `geo.ts` and the `useCtiData` normalizers —
  centroid lookup (incl. unknown country code), severity→color mapping, arc
  synthesis, KPI derivation, mode→endpoint selection.
- **Smoke:** one render test of `CtiPlatform` with `react-globe.gl` and
  `fetchJson` mocked, asserting the rail/feed/KPIs render and mode switch triggers
  the right fetch.
- Globe WebGL rendering itself is not unit-tested (no headless GL); covered by the
  mocked smoke test only.

## 8. Phasing (each independently shippable)

1. **Core:** route, `SocShell` page, `CtiGlobe` (points + arcs), `ThreatRail`,
   KPIs, `CtiFilters` (severity + time), `LiveFeedBar`, `SeverityLegend`,
   `useCtiData`, `geo.ts`, `country-centroids.ts`, unit tests.
2. **Interactivity:** focus-on-click, hover tooltips, card↔globe linking,
   drill-down panel, reduced-motion / no-WebGL handling.
3. **Modes:** Incident-Type / Ransomware dataset switching; sector/actor `SocDonut`
   - trend sparklines.
4. **Extra layers:** C2 / breach / dark-web toggles — verify each endpoint against
   live output before wiring (provider adapters have a history of silently
   returning empty payloads).

## 9. Risks & mitigations

| Risk                                        | Mitigation                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| three.js bundle bloat regressing Lighthouse | Lazy-in-lazy isolation; no shared imports; skeleton fallback.                                  |
| Arcs implying false attribution             | Source→focal-target model + explicit "observed source telemetry" labels.                       |
| Phase-4 endpoints silently empty            | Verify live output before trusting; layers are optional toggles, off by default.               |
| Country centroid gaps                       | Static table covers ISO-3166; unknown codes drop to no-point (logged), never a wrong location. |
| WebGL unavailable on a client               | Skeleton → static fallback; rest of dashboard functions without the globe.                     |
