# SOC Dashboard Cyberpunk Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the three threat-intel SOC dashboards (IOCs, Vulnerabilities, Ransomware) with a full cyberpunk visual theme while fixing chart readability, normalizing category labels to clean English, auditing the KPI numbers, and adding trend context.

**Architecture:** Reskin the shared SOC component layer in place (`SocShell`, `SocCharts`, `tone.ts`) — it is consumed only by these three pages, so there is no other theme to preserve. Add a pure, unit-tested `categories.ts` normalizer that every category string passes through before it becomes a chart label or KPI pick. Keep the custom-SVG charting (no new library — the repo has documented bundle/Lighthouse reverts). Visual work is verified by running the app and screenshotting; pure logic is verified by TDD with vitest.

**Tech Stack:** React + TypeScript, Tailwind, custom SVG charts, vitest (frontend, `npm test`), lucide-react icons.

---

## Spec reference

`docs/superpowers/specs/2026-06-10-soc-dashboard-cyberpunk-redesign.md`

## Pre-flight notes (repo footguns)

- **Branch:** work on the current feature branch (`feat/loop-engineering` at time of writing). `main` auto-FF-merges feature branches mid-session — never rebase/force-push; re-check `git branch --show-current` before any git mutation.
- **Typecheck is the only deploy gate** (esbuild deploys past `tsc`). After frontend edits run `tsc -p tsconfig.json`. The per-edit hook already typechecks on save.
- **Frontend tests:** `npm test -- run <path>` (vitest). Tests are colocated as `*.test.ts(x)`.
- **Lint/format:** `npm run lint`, `npm run format` before final commit.
- **Don't restyle the broken reference log-chart** — our pages never had it. Our timelines are vertical-bar charts (fine); the genuinely sliver-prone charts are the **ransomware sector & country donuts**.

## File structure

| File                                                        | Responsibility                                                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/components/threatintel/soc/categories.ts` _(new)_      | Pure normalizers: `normalizeSector`, `normalizeCountry`, `normalizeVendor`, `normalizeSeverity`. Foreign-language + variant + junk → canonical English; unknown → `'Unknown'`. |
| `src/components/threatintel/soc/categories.test.ts` _(new)_ | Unit tests for the normalizers (leak cases + passthrough + unknown).                                                                                                           |
| `src/components/threatintel/soc/slices.ts` _(new)_          | Pure `groupSmallSlices(slices, threshold)` helper — folds sub-threshold donut slices into one "Other".                                                                         |
| `src/components/threatintel/soc/slices.test.ts` _(new)_     | Unit tests for `groupSmallSlices`.                                                                                                                                             |
| `src/components/threatintel/soc/tone.ts`                    | Add cyberpunk palette tokens + `defconFor(severity)` mapping. Keep existing severity hexes.                                                                                    |
| `src/components/threatintel/soc/SocShell.tsx`               | Cyberpunk canvas/grid, DEFCON status banner, KPI "scanner frame" with glow + sparkline slot, restyled controls.                                                                |
| `src/components/threatintel/soc/SocCharts.tsx`              | Cyberpunk restyle of `SocBar`/`SocDonut`/`SocSparkline`; donut uses `groupSmallSlices` + always-on legend.                                                                     |
| `src/pages/threatintel/SocIocs.tsx`                         | Per-accent theming; add KPI sparkline; audit numbers. (IOC kinds already canonical — no category normalization needed.)                                                        |
| `src/pages/threatintel/SocVulns.tsx`                        | Route vendor names through `normalizeVendor`; add Discovered-CVEs delta + sparkline; audit numbers.                                                                            |
| `src/pages/threatintel/SocRansomware.tsx`                   | Route `sector`/`country` through normalizers; audit numbers.                                                                                                                   |

---

## Task 1: Category normalizer

**Files:**

- Create: `src/components/threatintel/soc/categories.ts`
- Test: `src/components/threatintel/soc/categories.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/threatintel/soc/categories.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeSector, normalizeCountry, normalizeVendor, normalizeSeverity } from './categories';

describe('normalizeSector', () => {
  it('maps spanish/foreign sector names to canonical english', () => {
    expect(normalizeSector('Salud')).toBe('Healthcare');
    expect(normalizeSector('SERVICIOS')).toBe('Professional Services');
    expect(normalizeSector('Construcción')).toBe('Construction');
    expect(normalizeSector('Educación')).toBe('Education');
    expect(normalizeSector('Financiero')).toBe('Finance');
  });
  it('passes through canonical english unchanged', () => {
    expect(normalizeSector('Healthcare')).toBe('Healthcare');
    expect(normalizeSector('finance')).toBe('Finance');
  });
  it('buckets empty/garbage/otros to Unknown', () => {
    expect(normalizeSector('')).toBe('Unknown');
    expect(normalizeSector('Otros')).toBe('Unknown');
    expect(normalizeSector('   ')).toBe('Unknown');
  });
});

describe('normalizeCountry', () => {
  it('maps spanish country names + codes to english', () => {
    expect(normalizeCountry('Estados Unidos')).toBe('United States');
    expect(normalizeCountry('Reino Unido')).toBe('United Kingdom');
    expect(normalizeCountry('Alemania')).toBe('Germany');
    expect(normalizeCountry('US')).toBe('United States');
  });
  it('buckets desconocido/empty to Unknown', () => {
    expect(normalizeCountry('Desconocido')).toBe('Unknown');
    expect(normalizeCountry('')).toBe('Unknown');
  });
});

describe('normalizeVendor', () => {
  it('rejects heuristic junk tokens', () => {
    expect(normalizeVendor('Improper')).toBe('Unknown');
    expect(normalizeVendor('Missing')).toBe('Unknown');
    expect(normalizeVendor('Unspecified')).toBe('Unknown');
    expect(normalizeVendor('Other')).toBe('Unknown');
    expect(normalizeVendor('')).toBe('Unknown');
  });
  it('canonicalizes known vendor casings', () => {
    expect(normalizeVendor('wordpress')).toBe('WordPress');
    expect(normalizeVendor('GOOGLE')).toBe('Google');
  });
  it('keeps an unknown-but-plausible vendor as-is', () => {
    expect(normalizeVendor('Acme')).toBe('Acme');
  });
});

describe('normalizeSeverity', () => {
  it('maps spanish severities to canonical tokens', () => {
    expect(normalizeSeverity('ALTO')).toBe('HIGH');
    expect(normalizeSeverity('Medio')).toBe('MEDIUM');
    expect(normalizeSeverity('crítico')).toBe('CRITICAL');
    expect(normalizeSeverity('bajo')).toBe('LOW');
  });
  it('passes english severities through', () => {
    expect(normalizeSeverity('critical')).toBe('CRITICAL');
  });
  it('buckets unknown to UNKNOWN', () => {
    expect(normalizeSeverity('weird')).toBe('UNKNOWN');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- run src/components/threatintel/soc/categories.test.ts`
Expected: FAIL — `Failed to resolve import "./categories"` / functions not defined.

- [ ] **Step 3: Write the implementation**

```ts
// src/components/threatintel/soc/categories.ts
/**
 * Category normalizers for the SOC dashboards. Upstream feeds (ransomware.live,
 * ransomfeed.it, NVD description heuristics) emit category strings in mixed
 * languages, casings, and junk tokens. These pure functions canonicalize every
 * sector / country / vendor / severity string to clean English BEFORE it becomes
 * a chart label or KPI headline. Anything unrecognized buckets to "Unknown" so
 * no foreign-language or garbage label ever leaks into the UI.
 *
 * Keep these as the single chokepoint — pages must not hand raw upstream strings
 * to charts.
 */

function clean(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}

/** lowercase + strip accents for lookup-key matching. */
function key(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/* ─── Sector ───────────────────────────────────────────────────────── */

const SECTOR_MAP: Record<string, string> = {
  // canonical english (passthrough, lets us normalize casing)
  healthcare: 'Healthcare',
  health: 'Healthcare',
  finance: 'Finance',
  financial: 'Finance',
  government: 'Government',
  technology: 'Technology',
  tech: 'Technology',
  manufacturing: 'Manufacturing',
  education: 'Education',
  retail: 'Retail',
  energy: 'Energy',
  'professional services': 'Professional Services',
  services: 'Professional Services',
  transportation: 'Transportation',
  media: 'Media',
  construction: 'Construction',
  industry: 'Manufacturing',
  // spanish / portuguese / italian variants seen from ransomware.live + ransomfeed
  salud: 'Healthcare',
  sanidad: 'Healthcare',
  saude: 'Healthcare',
  financiero: 'Finance',
  finanzas: 'Finance',
  finanziario: 'Finance',
  gobierno: 'Government',
  governo: 'Government',
  'administracion publica': 'Government',
  'admin. publica': 'Government',
  publica: 'Government',
  tecnologia: 'Technology',
  servicios: 'Professional Services',
  servizi: 'Professional Services',
  educacion: 'Education',
  educacao: 'Education',
  istruzione: 'Education',
  construccion: 'Construction',
  costruzioni: 'Construction',
  energia: 'Energy',
  industria: 'Manufacturing',
  manifatturiero: 'Manufacturing',
  transporte: 'Transportation',
  trasporti: 'Transportation',
  comercio: 'Retail',
  'venta minorista': 'Retail',
};

// Tokens that mean "no real classification" — always bucket to Unknown.
const UNCLASSIFIED = new Set([
  '',
  'otros',
  'other',
  'others',
  'na',
  'n/a',
  'none',
  'varios',
  'unknown',
  'desconocido',
  'altro',
  'altri',
]);

export function normalizeSector(raw: string | null | undefined): string {
  const s = clean(raw);
  const k = key(s);
  if (UNCLASSIFIED.has(k)) return 'Unknown';
  return SECTOR_MAP[k] ?? (s ? titleCase(s) : 'Unknown');
}

/* ─── Country ──────────────────────────────────────────────────────── */

const COUNTRY_MAP: Record<string, string> = {
  us: 'United States',
  usa: 'United States',
  'estados unidos': 'United States',
  'stati uniti': 'United States',
  uk: 'United Kingdom',
  gb: 'United Kingdom',
  'reino unido': 'United Kingdom',
  'regno unito': 'United Kingdom',
  de: 'Germany',
  alemania: 'Germany',
  germania: 'Germany',
  deutschland: 'Germany',
  fr: 'France',
  francia: 'France',
  es: 'Spain',
  espana: 'Spain',
  spagna: 'Spain',
  it: 'Italy',
  italia: 'Italy',
  br: 'Brazil',
  brasil: 'Brazil',
  au: 'Australia',
  australia: 'Australia',
  ca: 'Canada',
  canada: 'Canada',
};

export function normalizeCountry(raw: string | null | undefined): string {
  const s = clean(raw);
  const k = key(s);
  if (k === '' || k === 'desconocido' || k === 'unknown' || k === 'n/a') return 'Unknown';
  return COUNTRY_MAP[k] ?? (s ? titleCase(s) : 'Unknown');
}

/* ─── Vendor ───────────────────────────────────────────────────────── */

// Heuristic vendor extraction (SocVulns) emits these non-vendor tokens.
const VENDOR_JUNK = new Set([
  '',
  'other',
  'unknown',
  'unspecified',
  'improper',
  'missing',
  'multiple',
  'various',
  'no identificado',
  'incorrect',
  'insufficient',
]);

const VENDOR_CANON: Record<string, string> = {
  wordpress: 'WordPress',
  google: 'Google',
  microsoft: 'Microsoft',
  apple: 'Apple',
  linux: 'Linux',
  adobe: 'Adobe',
  cisco: 'Cisco',
  oracle: 'Oracle',
  ibm: 'IBM',
  hp: 'HP',
  github: 'GitHub',
  gitlab: 'GitLab',
};

export function normalizeVendor(raw: string | null | undefined): string {
  const s = clean(raw);
  const k = key(s);
  if (VENDOR_JUNK.has(k)) return 'Unknown';
  return VENDOR_CANON[k] ?? s;
}

/* ─── Severity ─────────────────────────────────────────────────────── */

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

const SEVERITY_MAP: Record<string, Severity> = {
  critical: 'CRITICAL',
  critico: 'CRITICAL',
  crit: 'CRITICAL',
  high: 'HIGH',
  alto: 'HIGH',
  alta: 'HIGH',
  medium: 'MEDIUM',
  medio: 'MEDIUM',
  media: 'MEDIUM',
  moderate: 'MEDIUM',
  low: 'LOW',
  bajo: 'LOW',
  baja: 'LOW',
};

export function normalizeSeverity(raw: string | null | undefined): Severity {
  return SEVERITY_MAP[key(clean(raw))] ?? 'UNKNOWN';
}

/* ─── helpers ──────────────────────────────────────────────────────── */

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- run src/components/threatintel/soc/categories.test.ts`
Expected: PASS — all describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/components/threatintel/soc/categories.ts src/components/threatintel/soc/categories.test.ts
git commit -m "feat(soc): category normalizer for sector/country/vendor/severity"
```

---

## Task 2: Donut small-slice grouping helper

**Files:**

- Create: `src/components/threatintel/soc/slices.ts`
- Test: `src/components/threatintel/soc/slices.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/threatintel/soc/slices.test.ts
import { describe, it, expect } from 'vitest';
import { groupSmallSlices } from './slices';

const S = (label: string, value: number) => ({ label, value, color: '#000' });

describe('groupSmallSlices', () => {
  it('folds sub-threshold slices into a single Other slice', () => {
    const out = groupSmallSlices([S('A', 90), S('B', 6), S('C', 3), S('D', 1)], 0.05);
    // total 100; threshold 5% => B(6%) kept, C(3%) + D(1%) folded => Other=4
    expect(out.map((s) => s.label)).toEqual(['A', 'B', 'Other']);
    expect(out.find((s) => s.label === 'Other')?.value).toBe(4);
  });
  it('returns slices unchanged when none are below threshold', () => {
    const out = groupSmallSlices([S('A', 50), S('B', 50)], 0.05);
    expect(out.map((s) => s.label)).toEqual(['A', 'B']);
  });
  it('never emits an Other slice of value 0', () => {
    const out = groupSmallSlices([S('A', 100)], 0.05);
    expect(out.some((s) => s.label === 'Other')).toBe(false);
  });
  it('sorts descending and keeps an existing Other merged', () => {
    const out = groupSmallSlices([S('A', 10), S('Other', 5), S('B', 80), S('C', 1)], 0.05);
    expect(out[0].label).toBe('B');
    // C(1%) folds into Other => Other = 5 + 1 = 6
    expect(out.find((s) => s.label === 'Other')?.value).toBe(6);
  });
  it('handles empty input', () => {
    expect(groupSmallSlices([], 0.05)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- run src/components/threatintel/soc/slices.test.ts`
Expected: FAIL — `Failed to resolve import "./slices"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/components/threatintel/soc/slices.ts
import type { DonutSlice } from './SocCharts';

const OTHER_COLOR = '#475569';

/**
 * Fold donut slices whose share of the total is below `threshold` (a fraction,
 * e.g. 0.02 = 2%) into a single "Other" slice. Eliminates the unreadable
 * "sliver" rings that appear when a donut has many tiny categories. Output is
 * sorted descending with "Other" forced last.
 */
export function groupSmallSlices(slices: DonutSlice[], threshold: number): DonutSlice[] {
  if (slices.length === 0) return [];
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return slices.slice();

  let otherValue = 0;
  const kept: DonutSlice[] = [];
  for (const s of slices) {
    if (s.label === 'Other' || s.value / total < threshold) {
      otherValue += s.value;
    } else {
      kept.push(s);
    }
  }
  kept.sort((a, b) => b.value - a.value);
  if (otherValue > 0) kept.push({ label: 'Other', value: otherValue, color: OTHER_COLOR });
  return kept;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- run src/components/threatintel/soc/slices.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/threatintel/soc/slices.ts src/components/threatintel/soc/slices.test.ts
git commit -m "feat(soc): groupSmallSlices donut helper to kill sliver rings"
```

---

## Task 3: Cyberpunk palette tokens

**Files:**

- Modify: `src/components/threatintel/soc/tone.ts` (append at end)

- [ ] **Step 1: Append the cyberpunk tokens**

Add to the end of `tone.ts`:

```ts
/* ─── Cyberpunk theme tokens ──────────────────────────────────────── */

/** Per-dashboard neon accent (hue identity for each SOC page). */
export const CYBER_ACCENT = {
  ioc: '#a855f7', // violet/magenta
  vulns: '#22d3ee', // cyan
  ransomware: '#f43f5e', // red
} as const;

export type CyberAccentKey = keyof typeof CYBER_ACCENT;

/** Near-black canvas + grid line colors for the cyberpunk shell. */
export const CYBER_CANVAS = '#05070d';
export const CYBER_GRID = 'rgba(148, 163, 184, 0.06)';

/** Severity → glow hex used for the oversized KPI numerals (text-shadow). */
export const CYBER_GLOW: Record<SocSeverity, string> = {
  critical: '#f43f5e',
  high: '#fb923c',
  medium: '#fbbf24',
  low: '#94a3b8',
  ok: '#34d399',
  info: '#22d3ee',
};

/** Map a SOC severity to a DEFCON-style status banner. Driven by REAL severity
 *  (never hardcoded) so the bold flavor text always reflects the data. */
export function defconFor(severity: SocSeverity, label: string): { defcon: string; label: string } {
  const defcon =
    severity === 'critical'
      ? 'DEFCON 1'
      : severity === 'high'
        ? 'DEFCON 2'
        : severity === 'medium'
          ? 'DEFCON 3'
          : severity === 'info'
            ? 'DEFCON 4'
            : 'DEFCON 5';
  return { defcon, label: label.toUpperCase() };
}
```

- [ ] **Step 2: Typecheck**

Run: `tsc -p tsconfig.json --noEmit`
Expected: PASS (the per-edit hook also runs this).

- [ ] **Step 3: Commit**

```bash
git add src/components/threatintel/soc/tone.ts
git commit -m "feat(soc): cyberpunk palette + DEFCON mapping tokens"
```

---

## Task 4: Cyberpunk shell — canvas, DEFCON banner, scanner-frame KPIs

**Files:**

- Modify: `src/components/threatintel/soc/SocShell.tsx`

This task is visual; verification is by running the app and screenshotting (Task 9). Each step shows the exact code.

- [ ] **Step 1: Add an `accent` prop + cyberpunk imports**

In `SocShell.tsx`, extend imports and the `SocShellProps` interface:

```tsx
// add to the tone import:
import {
  SEVERITY_DOT,
  SEVERITY_PILL,
  SEVERITY_TEXT,
  CYBER_CANVAS,
  CYBER_GRID,
  CYBER_GLOW,
  CYBER_ACCENT,
  defconFor,
  type SocSeverity,
  type CyberAccentKey,
} from './tone';
```

Add to `SocShellProps` (after `description`):

```tsx
/** Per-dashboard neon accent key. Drives glow + bracket hues. */
accent: CyberAccentKey;
```

Destructure `accent` in the `SocShell({ ... })` parameter list.

- [ ] **Step 2: Replace the outer canvas wrapper**

Replace the outermost `return (<div className="min-h-screen bg-slate-50 dark:bg-slate-950 ...">` wrapper (lines ~93-95) with the cyberpunk canvas:

```tsx
  const accentHex = CYBER_ACCENT[accent];
  return (
    <div
      className="min-h-screen text-slate-100 relative"
      style={{
        backgroundColor: CYBER_CANVAS,
        backgroundImage: `linear-gradient(${CYBER_GRID} 1px, transparent 1px), linear-gradient(90deg, ${CYBER_GRID} 1px, transparent 1px)`,
        backgroundSize: '40px 40px',
      }}
    >
      {/* vignette — cheap radial overlay, no blur filter */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(5,7,13,0) 40%, rgba(5,7,13,0.85) 100%)' }}
      />
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-12 relative">
        <BackLink />
        {/* ...existing header/controls/children... */}
```

Keep the existing header/controls/children markup inside, but change the `<h1>` text color usage to white and pass `accent` down where noted below. Close the two new wrapper `</div>`s at the end of the component.

- [ ] **Step 3: Recolor the h1 + render the DEFCON banner**

Replace the `<h1>` block and `<SocStatusBadge>` usage (lines ~99-103) with:

```tsx
          <h1 className="text-3xl sm:text-4xl font-display font-bold flex items-center gap-3 text-white uppercase tracking-wide">
            <span style={{ color: accentHex, filter: `drop-shadow(0 0 6px ${accentHex})` }} className="[&_svg]:shrink-0">
              {icon}
            </span>
            {title}
          </h1>
          <div className="mt-3">
            <SocDefconBanner status={status} />
          </div>
```

- [ ] **Step 4: Add the `SocDefconBanner` component**

Add near `SocStatusBadge` (you may delete `SocStatusBadge` if no longer referenced, or keep it):

```tsx
function SocDefconBanner({ status }: { status: SocStatus }): JSX.Element {
  const { defcon, label } = defconFor(status.severity, status.label);
  const glow = CYBER_GLOW[status.severity];
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1 rounded-sm text-mini font-mono uppercase tracking-[0.2em] border"
      style={{ color: glow, borderColor: `${glow}66`, backgroundColor: `${glow}14`, textShadow: `0 0 8px ${glow}88` }}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 rounded-full opacity-75 animate-ping" style={{ backgroundColor: glow }} />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: glow }} />
      </span>
      {defcon} · {label}
    </span>
  );
}
```

- [ ] **Step 5: Restyle controls to dark/neon**

In the controls block (lines ~111-163), swap the light tokens for dark ones: change `bg-white dark:bg-slate-900` → `bg-slate-900/60`, `border-slate-200 dark:border-slate-800` → `border-slate-700/60`, active window button → `style={{ borderColor: accentHex, color: accentHex }}`. Keep structure/handlers identical. (Mechanical class swap — match the dark palette; no behavior change.)

- [ ] **Step 6: Rebuild `SocKpi` as a scanner frame**

Replace the `SocKpi` function body (lines ~298-316) with the cyberpunk scanner frame. Add `accent`, `spark` props to its signature:

```tsx
export function SocKpi({
  label,
  value,
  severity = 'info',
  sub,
  delta,
  deltaDirection = 'up',
  icon,
  accent,
  spark,
}: {
  label: string;
  value: ReactNode;
  severity?: SocSeverity;
  sub?: ReactNode;
  delta?: string;
  deltaDirection?: 'up' | 'down' | 'flat';
  icon?: ReactNode;
  accent?: string;
  spark?: ReactNode;
}): JSX.Element {
  const deltaCls =
    deltaDirection === 'up' ? 'text-rose-400' : deltaDirection === 'down' ? 'text-emerald-400' : 'text-slate-400';
  const glow = CYBER_GLOW[severity];
  const bracket = accent ?? glow;
  return (
    <div className="relative rounded-sm border border-slate-700/50 bg-slate-950/40 p-4 sm:p-5 overflow-hidden">
      {/* corner brackets */}
      <span
        className="pointer-events-none absolute top-1 left-1 h-3 w-3 border-t-2 border-l-2"
        style={{ borderColor: bracket }}
      />
      <span
        className="pointer-events-none absolute bottom-1 right-1 h-3 w-3 border-b-2 border-r-2"
        style={{ borderColor: bracket }}
      />
      <div className="flex items-center justify-between mb-2">
        <span className="text-mini font-mono uppercase tracking-[0.18em] text-slate-400">{label}</span>
        {icon && <span className="text-slate-500">{icon}</span>}
      </div>
      <div
        className="font-mono font-extrabold leading-none tabular-nums text-3xl sm:text-4xl"
        style={{ color: glow, textShadow: `0 0 12px ${glow}99` }}
      >
        {value}
      </div>
      {spark && <div className="mt-2">{spark}</div>}
      <div className="mt-2 flex items-center justify-between gap-2 text-meta font-mono text-slate-400">
        <span className="truncate">{sub}</span>
        {delta && <span className={deltaCls}>{delta}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Restyle `SocPanel` + `SocSection`**

`SocPanel` (lines ~321-329): change container classes to `rounded-sm border border-slate-700/50 bg-slate-950/40 p-4 sm:p-5`. `SocSection` h2 (line ~261): change color to `text-slate-300` and keep the uppercase tracking; the `>` chevron prefix can be added as a literal `<span style={{color: accent}}>&gt;</span>` if desired (optional, skip if it complicates the shared signature).

- [ ] **Step 8: Typecheck**

Run: `tsc -p tsconfig.json --noEmit`
Expected: FAIL initially in the three pages — they don't yet pass `accent` to `SocShell`. That's expected; Tasks 6-8 fix the call sites. To keep this commit green, temporarily make `accent` optional? No — instead do Step 9 commit _after_ Tasks 6-8 wire the pages. Mark this task's commit as deferred.

> **Sequencing note:** `accent` is required on `SocShell`, so `SocShell.tsx` won't typecheck standalone until the pages pass it. Implement Tasks 4–8 as one logical unit and run the typecheck once after Task 8, then commit Tasks 4–8 together. (If you prefer per-task commits, make `accent` optional with a default of `'ioc'`, commit, then tighten — but the single-unit approach is cleaner.)

- [ ] **Step 9: Commit (after Task 8 wiring; see sequencing note)**

```bash
git add src/components/threatintel/soc/SocShell.tsx
git commit -m "feat(soc): cyberpunk shell — canvas, DEFCON banner, scanner-frame KPIs"
```

---

## Task 5: Cyberpunk chart restyle + donut grouping/legend

**Files:**

- Modify: `src/components/threatintel/soc/SocCharts.tsx`

- [ ] **Step 1: Donut — apply `groupSmallSlices` + force legend on**

In `SocDonut` (`SocCharts.tsx`), import the helper and group slices at the top of the component:

```tsx
import { groupSmallSlices } from './slices';
// ...
export function SocDonut({ slices: rawSlices, size = 200, thickness = 28, centerLabel, centerSub, legend = false, emptyText = 'No data in window.' }: SocDonutProps): JSX.Element {
  const slices = groupSmallSlices(rawSlices, 0.02); // fold <2% into "Other"
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  // ...rest unchanged, but default the inline (non-legend) branch to always show a legend list.
```

Change the donut so the legend is **always** rendered (remove the `legend ? ... : ...` split's "no legend" path — keep the richer legend list for both, since readability is the goal). Wrap with `legend`-style two-column grid always.

- [ ] **Step 2: Donut — add neon glow to slice strokes**

On each slice `<circle>` add a subtle glow via a filter-free technique — duplicate stroke with low opacity is too costly; instead use CSS `filter: drop-shadow` ONLY on the hovered slice:

```tsx
style={{
  transition: 'opacity 120ms ease',
  cursor: 'pointer',
  opacity: hover === s.label ? 1 : hover ? 0.4 : 1,
  filter: hover === s.label ? `drop-shadow(0 0 4px ${s.color})` : 'none',
}}
```

- [ ] **Step 3: Bars — neon fill + guaranteed-legible labels**

In `SocBar` horizontal branch (lines ~146-197): the track becomes `bg-slate-800`, the label text `text-slate-300`, the value `text-slate-400`. Bar fill keeps `it.color`. Add `boxShadow: 0 0 6px ${color}66` to the filled `<div>` style for glow. The `title={it.label}` tooltip already exists (fixes cut-off labels) — keep it. In the vertical branch, change grid line classes to `text-slate-800` and tick text to `fill-slate-500` (dark-appropriate); these are mechanical.

- [ ] **Step 4: Sparkline — accept and apply accent color (already supports `color`)**

`SocSparkline` already takes a `color` prop and renders fill+line+dots. No structural change; callers will pass the accent. Verify the grid/tick classes read on dark (`text-slate-800`, `fill-slate-500`) — adjust if needed.

- [ ] **Step 5: Typecheck**

Run: `tsc -p tsconfig.json --noEmit`
Expected: PASS for `SocCharts.tsx` itself (the page-level `accent` failures remain until Task 8).

- [ ] **Step 6: Re-run the slice tests (no regression)**

Run: `npm test -- run src/components/threatintel/soc/slices.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit (with Task 4, after Task 8 — see sequencing note)**

```bash
git add src/components/threatintel/soc/SocCharts.tsx
git commit -m "feat(soc): cyberpunk chart restyle + donut sliver grouping & legend"
```

---

## Task 6: Wire IOC page — accent, KPI sparkline, number audit

**Files:**

- Modify: `src/pages/threatintel/SocIocs.tsx`

- [ ] **Step 1: Pass the accent + import the sparkline**

Add `accent="ioc"` to the `<SocShell ...>` props. Import `SocSparkline` from `./SocCharts` and `CYBER_ACCENT` from `tone`.

- [ ] **Step 2: Add a sparkline to the "Total captured IOCs" KPI**

Build a per-day series from `dailyCounts` and pass it as `spark` + `accent`:

```tsx
<SocKpi
  label="Total captured IOCs"
  value={data ? formatNumber(data.total) : '—'}
  severity="info"
  sub={`${formatNumber(totalInWindow)} observed in last ${windowDays}d`}
  icon={<Database size={16} />}
  delta={totalDelta?.text}
  deltaDirection={totalDelta?.direction}
  accent={CYBER_ACCENT.ioc}
  spark={
    dailyCounts.length > 1 ? (
      <SocSparkline points={dailyCounts} height={36} showAxis={false} color={CYBER_ACCENT.ioc} />
    ) : undefined
  }
/>
```

Pass `accent={CYBER_ACCENT.ioc}` to the other three `SocKpi` cards (no spark).

- [ ] **Step 3: Number audit — verify in-window vs all-time framing**

Confirm: `buckets.critical / totalInWindow` (KPI %) uses the same denominator as `totalInWindow` (it does — both derive from `inWindowScoped`). The "Total captured IOCs" headline is the all-time `data.total` while its sub-line is the windowed count — this is intentional (label says "captured", sub says "observed in last Nd"). No code change; leave a one-line comment confirming the audit if anything is adjusted. Document result in the commit body.

- [ ] **Step 4: Typecheck**

Run: `tsc -p tsconfig.json --noEmit`
Expected: PASS for this file (other pages may still fail until wired).

- [ ] **Step 5: (commit folded into Task 8 sequencing commit)**

---

## Task 7: Wire Vulns page — vendor normalization, accent, delta + sparkline, audit

**Files:**

- Modify: `src/pages/threatintel/SocVulns.tsx`

- [ ] **Step 1: Route vendor names through `normalizeVendor`**

Import: `import { normalizeVendor } from '../../components/threatintel/soc/categories';` and `CYBER_ACCENT`, `SocSparkline`.

In `topVendors`, wrap the extracted vendor and drop junk:

```tsx
const topVendors: BarItem[] = useMemo(() => {
  if (inWindow.length === 0) return [];
  const counts = new Map<string, number>();
  for (const c of inWindow) {
    const v = normalizeVendor(extractVendorFromDescription(c.description));
    if (v === 'Unknown') continue; // don't rank the unclassified pile as a vendor
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const arr = Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  return arr.map((x, i) => ({
    label: x.label,
    value: x.value,
    hint: total ? `${Math.round((x.value / total) * 100)}%` : undefined,
    color: CHART_RANK[Math.min(i, CHART_RANK.length - 1)],
    href: `/threatintel/cve-list?vendor=${encodeURIComponent(x.label)}`,
  }));
}, [inWindow, total]);
```

Also apply `normalizeVendor(...)` in `KevTable`'s vendor cell (line ~500) and in the CSV export vendor column (line ~273).

- [ ] **Step 2: Add a delta + sparkline to "Discovered CVEs"**

Add a `prevTotal` capture mirroring the existing `prevKev` pattern (add `const [prevTotal, setPrevTotal] = useState<number | null>(null);` and capture `dataRef.current` count in the same `useEffect`). Compute a `totalDelta` like `kevDelta`. Then:

```tsx
<SocKpi
  label="Discovered CVEs"
  value={formatNumber(total)}
  severity="info"
  sub={`published in last ${windowDays} days`}
  icon={<Bug size={16} />}
  accent={CYBER_ACCENT.vulns}
  delta={totalDelta?.text}
  deltaDirection={totalDelta?.direction}
  spark={
    dailyCounts.length > 1 ? (
      <SocSparkline points={dailyCounts} height={36} showAxis={false} color={CYBER_ACCENT.vulns} />
    ) : undefined
  }
/>
```

Pass `accent={CYBER_ACCENT.vulns}` to the other three KPIs. Add `accent="vulns"` to `<SocShell>`.

- [ ] **Step 3: Number audit**

Confirm `criticalPct = counts.CRITICAL / total` and `highPct = counts.HIGH / total` share the windowed `total` denominator (they do). The "CISA KEV" KPI is intentionally **all-time** (`data.kev_count`) while others are windowed — its sub-line says "all-time", so it's honest. No change unless a discrepancy is found; document in commit body.

- [ ] **Step 4: Typecheck**

Run: `tsc -p tsconfig.json --noEmit`
Expected: PASS for this file.

- [ ] **Step 5: (commit folded into Task 8 sequencing commit)**

---

## Task 8: Wire Ransomware page — sector/country normalization, accent, audit

**Files:**

- Modify: `src/pages/threatintel/SocRansomware.tsx`

- [ ] **Step 1: Normalize sector + country before charting**

Import: `import { normalizeSector, normalizeCountry } from '../../components/threatintel/soc/categories';` and `CYBER_ACCENT`.

Change `colorForSector` to key off the normalized name, and normalize in the three places sector/country strings become labels:

- `sectorSlices` (line ~145): map `label: normalizeSector(s.sector)` and aggregate by normalized name (re-sum counts so two raw spellings that normalize to the same sector merge):

```tsx
const sectorSlices: DonutSlice[] = useMemo(() => {
  const agg = new Map<string, number>();
  for (const s of data?.sectors ?? []) {
    if (s.count <= 0) continue;
    const name = normalizeSector(s.sector);
    agg.set(name, (agg.get(name) ?? 0) + s.count);
  }
  return Array.from(agg.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value, color: colorForSector(label) }));
}, [data]);
```

- `countrySlices` (line ~152): normalize `v.country` via `normalizeCountry` when counting; the existing top-8 + Other logic stays, but "Unknown" from the normalizer folds into the existing unknown handling (treat `normalizeCountry(...) === 'Unknown'` as no-country).
- The "Top sector" KPI (line ~100) and "Sector breakdown" bar (line ~366) and CSV export (line ~195): use the normalized sector name. For the KPI's "skip Unknown/Other" filter, it already excludes `'Unknown'`/`'Other'` — now those buckets are produced by the normalizer, so the filter works correctly.

- [ ] **Step 2: Add the accent**

Add `accent="ransomware"` to `<SocShell>`. Pass `accent={CYBER_ACCENT.ransomware}` to all four `SocKpi` cards. (Ransomware already has a `delta` on Registered victims — keep it; optionally add a `timeline`-based sparkline to that KPI the same way as IOC.)

- [ ] **Step 3: Number audit**

Confirm `topShare = top.count / data.count` and `topSec.pct` come from the API's pre-computed `pct`. After normalization merges duplicate sectors, the donut center total still equals the sum of slice values (it's recomputed from slices). Verify the "Top sector" pct still reads from `topSec.pct` — if normalization merged buckets, recompute `topSectorPct` from the merged count / total instead of the stale API `pct`:

```tsx
    const totalSec = sectorSlices.reduce((s, x) => s + x.value, 0);
    const topSec = sectorSlices.find((s) => s.label !== 'Unknown' && s.label !== 'Other');
    // ...
    topSector: topSec?.label ?? '—',
    topSectorPct: topSec && totalSec ? `${Math.round((topSec.value / totalSec) * 100)}%` : null,
```

(Use `sectorSlices` for the KPI so the headline and the donut never disagree.)

- [ ] **Step 4: Typecheck all three projects**

Run:

```bash
tsc -p tsconfig.json --noEmit && tsc -p api/tsconfig.json --noEmit && tsc -p api/tsconfig.worker.json --noEmit
```

Expected: PASS — no `accent`-missing errors remain now that all three pages are wired.

- [ ] **Step 5: Commit Tasks 4–8 together**

```bash
git add src/components/threatintel/soc/SocShell.tsx src/components/threatintel/soc/SocCharts.tsx src/pages/threatintel/SocIocs.tsx src/pages/threatintel/SocVulns.tsx src/pages/threatintel/SocRansomware.tsx
git commit -m "feat(soc): cyberpunk theme across all three dashboards + category normalization + KPI context

- shell: black canvas/grid, DEFCON banner, scanner-frame KPIs with glow + sparkline
- charts: neon restyle, donut sliver grouping + always-on legend
- vulns: normalizeVendor drops Improper/Missing/Other junk
- ransomware: normalizeSector/Country, KPI pct recomputed from merged buckets
- audited KPI denominators (windowed vs all-time framing confirmed honest)"
```

---

## Task 9: Full verification

- [ ] **Step 1: Unit tests**

Run: `npm test -- run src/components/threatintel/soc/`
Expected: PASS — `categories.test.ts` and `slices.test.ts` green.

- [ ] **Step 2: Typecheck (all three) + lint + format**

Run:

```bash
tsc -p tsconfig.json --noEmit && tsc -p api/tsconfig.json --noEmit && tsc -p api/tsconfig.worker.json --noEmit
npm run lint
npm run format
```

Expected: all clean. Commit any format changes.

- [ ] **Step 3: Run the app + screenshot all three dashboards**

Use the `run` skill (or `npm run dev`) to launch, then visit `/threatintel/iocs`, `/threatintel/vulns`, `/threatintel/ransomware`. Use Playwright to screenshot each in dark mode at ~1500px width. Confirm against the reference + the goals:

- pure-black canvas + grid, glowing oversized KPI numerals, corner brackets, DEFCON banner present
- no donut slivers (sector/country donuts show "Other" grouping), every donut has a legend with value + %
- no cut-off/overlapping labels (hover tooltips work)
- no foreign-language or "Improper/Missing/Otros" labels anywhere
- KPI deltas + sparklines render

- [ ] **Step 4: Perf sanity**

Confirm no `backdrop-blur` on large areas and no animated `filter` was introduced (glows are `text-shadow`/`box-shadow`/hover-only `drop-shadow`). Optionally run `npm run build && npm run check:budgets` to confirm no bundle-budget regression.

- [ ] **Step 5: Final commit (if Step 2/3 produced fixes)**

```bash
git add -A
git commit -m "chore(soc): lint/format + screenshot-driven polish"
```

---

## Self-review notes

- **Spec coverage:** cyberpunk theme (Tasks 3-5), readable charts/donut grouping (Tasks 2,5), English categories (Tasks 1,7,8), number audit (Tasks 6,7,8), context deltas+sparklines (Tasks 6,7,8). All spec goals mapped.
- **Sequencing caveat:** `SocShell.accent` is required, so the shell + chart + 3 page edits (Tasks 4-8) form one typecheck-green unit committed together at Task 8 Step 5. Tasks 1-3 commit independently first.
- **Type consistency:** `DonutSlice` reused from `SocCharts` in `slices.ts`; `Severity` type exported from `categories.ts` is local to that module (the Vulns page keeps its own `Severity` for the NVD payload — no collision since they aren't cross-imported).
- **Honesty guard:** DEFCON banner and all "bold" flavor derive from real `status.severity`; KPI all-time-vs-windowed framing is left intact because each sub-line states which it is.
