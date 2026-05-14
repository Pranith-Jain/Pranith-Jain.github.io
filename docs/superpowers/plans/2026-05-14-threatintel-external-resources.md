# Threat-Intel External Resources Catalog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/threatintel/external-resources` catalog page (16 entries, multi-kind filter, search), delete the inline External Sources block from the `/threatintel` landing, and replace it with a single tile linking to the new page.

**Architecture:** Pure-client React page mirroring `src/pages/dfir/AwesomeLists.tsx`. Static `RESOURCES` array imported from a new data file. Filtering and search live entirely in the component; state preserved in the URL via `useSearchParams`. No API change, no KV, no fetch.

**Tech Stack:** Vite 6 + React 18 + react-router-dom v6 + Tailwind v3 + lucide-react + Vitest + Testing Library.

---

## Spec reference

`docs/superpowers/specs/2026-05-14-threatintel-external-resources-design.md`.

## File map

**New:**

- `src/data/threatintel/external-resources.ts` — types + `RESOURCES` array + label/pill constants.
- `src/pages/threatintel/ExternalResources.tsx` — page component.

**Modified:**

- `src/App.tsx` — add lazy import + `<Route>` for the new path.
- `src/pages/threatintel/Home.tsx` — delete `external` section (lines 308–385), drop unused icon imports `Github` and `Microscope`, add one tile inside the `catalogs` section.
- `worker/index.ts` — add `/threatintel/external-resources` entry to `OG_OVERRIDES`.
- `src/components/__tests__/DfirRoutes.test.tsx` — append a `subRoutes` entry.

---

## Task 1: Create the data file

**Files:**

- Create: `src/data/threatintel/external-resources.ts`

- [ ] **Step 1: Verify the parent directory does not exist yet**

Run: `ls src/data/threatintel/ 2>&1`
Expected: `ls: src/data/threatintel/: No such file or directory` (or similar).

- [ ] **Step 2: Create the data file**

```ts
// src/data/threatintel/external-resources.ts
/**
 * External resources catalog — sites and dashboards I cross-reference outside
 * this repo. Mixed kinds (training, lab, tool, dashboard, directory, samples,
 * community, research) so a single pill row drives the filter.
 *
 * Each entry has ONE `kind`. Sites that legitimately span multiple categories
 * (e.g. OpenSourceMalware: samples AND community) are tagged by their dominant
 * artefact; the description mentions the secondary aspect.
 *
 * Last verified 2026-05-14.
 */

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
  id: string;
  name: string;
  url: string;
  kind: ResourceKind;
  description: string;
  why?: string;
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

export const KIND_BLURB: Record<ResourceKind, string> = {
  training: 'Structured courses and learning paths.',
  lab: 'Interactive hands-on environments and playgrounds.',
  tool: 'Off-site utilities you run against an indicator or asset.',
  dashboard: 'Hosted dashboards and visual feeds you read.',
  directory: 'Curated indexes pointing at other resources.',
  samples: 'Datasets, malware corpora, and credential dumps.',
  community: 'Forums, Discords, and practitioner hubs.',
  research: 'Methodology, whitepapers, and adversarial-testing frameworks.',
};

export const KIND_PILL: Record<ResourceKind, string> = {
  training: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  lab: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  tool: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  dashboard: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  directory: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  samples: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
  community: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  research: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
};

export const RESOURCES: ExternalResource[] = [
  // Migrated from src/pages/threatintel/Home.tsx (External Sources block, 2026-05-14).
  // Descriptions copied verbatim — no rewriting in this commit.
  {
    id: 'my-threat-intel',
    name: 'My Threat Intel',
    url: 'https://www.mythreatintel.com/?lang=en',
    kind: 'dashboard',
    description:
      'Live ransomware dashboard · country / sector / timeline charts · 180+ ransomware groups with ransom-note transcripts and leak-site screenshots',
  },
  {
    id: 'deepdark-cti',
    name: 'deepdarkCTI',
    url: 'https://github.com/fastfire/deepdarkCTI',
    kind: 'directory',
    description: 'Continuously updated repository of dark-web and CTI sources, by fastfire',
  },
  {
    id: 'threat-landscape-free-tools',
    name: 'Threat Landscape Free Tools',
    url: 'https://threatlandscape.io/free-tools',
    kind: 'directory',
    description: 'Curated free DFIR and threat-intel tools directory',
  },
  {
    id: 'vecert-analyzer',
    name: 'Vecert Analyzer',
    url: 'https://analyzer.vecert.io/index',
    kind: 'tool',
    description: 'Free file and indicator analyzer for incident response',
  },
  {
    id: 'world-monitor',
    name: 'World Monitor',
    url: 'https://www.worldmonitor.app',
    kind: 'dashboard',
    description: 'Real-time OSINT dashboard, news, markets, ADS-B and AIS tracking across 435+ sources',
  },
  {
    id: 'osint-tools',
    name: 'OSINT Tools',
    url: 'https://osinttools.io/tools',
    kind: 'directory',
    description: 'Curated OSINT directory',
  },
  {
    id: 'osintrack',
    name: 'OSINTrack',
    url: 'https://osintrack.com/',
    kind: 'tool',
    description: 'OSINT investigation tracker',
  },
  {
    id: 'ai-soc',
    name: 'AI SOC',
    url: 'https://aisoc.pplx.app/',
    kind: 'lab',
    description: 'AI-assisted SOC playground by Perplexity Labs.',
  },
  {
    id: 'leakradar',
    name: 'LeakRadar',
    url: 'https://leakradar.io/en/leaks',
    kind: 'tool',
    description:
      '290B+ leaked credentials indexed from stealer logs, combolists, and database dumps. REST API + Telegram/Slack/webhook alerts.',
  },
  {
    id: 'serus',
    name: 'Serus',
    url: 'https://serus.ai',
    kind: 'tool',
    description:
      'AI-powered data-exposure monitoring and dark-web surveillance for individuals and orgs. Combines breach search with takedown automation.',
  },

  // New entries (2026-05-14). Descriptions verified against each site.
  {
    id: 'opensourcemalware',
    name: 'OpenSourceMalware',
    url: 'https://opensourcemalware.com/',
    kind: 'samples',
    description: 'Community-driven platform for sharing and analysing malware samples and threat intelligence.',
  },
  {
    id: 'ai-goat',
    name: 'AI Goat',
    url: 'https://aigoat.co.in/learn/',
    kind: 'lab',
    description:
      'Open-source AI security playground for hands-on LLM red teaming — prompt injection, RAG poisoning, OWASP LLM Top 10 — runs fully offline.',
  },
  {
    id: 'vulnos',
    name: 'VulnOS',
    url: 'https://learn.vulnos.tech/index.html',
    kind: 'training',
    description: 'Cybersecurity learning platform with practical, interactive labs for hands-on skill building.',
  },
  {
    id: 'black-ledger-security',
    name: 'Black Ledger Security',
    url: 'https://blackledgersecurity.ai/',
    kind: 'research',
    description:
      'Research portfolio publishing AI/LLM security findings and the SPECTRA framework for context-aware adversarial testing of production AI deployments.',
  },
  {
    id: 'webverse-labs-pro',
    name: 'WebVerse Labs Pro',
    url: 'https://webverselabs-pro.com/',
    kind: 'lab',
    description:
      'Web-app pentest training platform — 36 labs across 5 difficulty tiers with XP, leaderboards, and vulnerability-chaining scenarios.',
  },
  {
    id: 'redteam-community',
    name: 'Red Team Community',
    url: 'https://www.redteam.community/',
    kind: 'community',
    description: 'Red-team practitioner community hub.',
  },
];
```

- [ ] **Step 3: Lint the new file**

Run: `npx eslint src/data/threatintel/external-resources.ts`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add src/data/threatintel/external-resources.ts
git commit -m "feat(threatintel): data file for External Resources catalog"
```

---

## Task 2: Write the failing route render test

**Files:**

- Modify: `src/components/__tests__/DfirRoutes.test.tsx` (append one entry to the `subRoutes` array)

- [ ] **Step 1: Append the new entry to `subRoutes`**

Add this object as the last entry of the `subRoutes` array (after the `/dfir/url-preview` entry):

```ts
  { path: '/threatintel/external-resources', heading: 'External Resources', skipComingSoon: true },
```

The array now looks like (last few lines):

```ts
  { path: '/dfir/url-preview', heading: 'URL Preview', skipComingSoon: true },
  { path: '/threatintel/external-resources', heading: 'External Resources', skipComingSoon: true },
];
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -- src/components/__tests__/DfirRoutes.test.tsx --run 2>&1 | tail -25`
Expected: the test for `/threatintel/external-resources` FAILS with a "Unable to find an accessible element with the role 'heading' and name 'External Resources'" timeout. All other entries still pass.

If the failing test passes anyway, something else in the app is rendering an "External Resources" H1; stop and investigate before proceeding.

- [ ] **Step 3: Do not commit yet**

This step intentionally leaves the test red. Task 3 turns it green.

---

## Task 3: Build the page component and wire the route

**Files:**

- Create: `src/pages/threatintel/ExternalResources.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the page component**

```tsx
// src/pages/threatintel/ExternalResources.tsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Compass, ExternalLink, Search } from 'lucide-react';
import {
  RESOURCES,
  KIND_LABELS,
  KIND_BLURB,
  KIND_PILL,
  type ResourceKind,
} from '../../data/threatintel/external-resources';

const ALL_KINDS = Object.keys(KIND_LABELS) as ResourceKind[];

export default function ExternalResources(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');

  const initialKinds = (searchParams.get('kind')?.split(',').filter(Boolean) ?? []) as ResourceKind[];
  const [activeKinds, setActiveKinds] = useState<Set<ResourceKind>>(
    new Set(initialKinds.filter((k) => (ALL_KINDS as string[]).includes(k)))
  );

  // Keep filter state in the URL so a curated view is shareable.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const out = new URLSearchParams(prev);
        if (query.trim()) out.set('q', query.trim());
        else out.delete('q');
        if (activeKinds.size > 0) out.set('kind', [...activeKinds].join(','));
        else out.delete('kind');
        return out;
      },
      { replace: true }
    );
  }, [query, activeKinds, setSearchParams]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return RESOURCES.filter((r) => {
      if (activeKinds.size > 0 && !activeKinds.has(r.kind)) return false;
      if (!q) return true;
      const hay = `${r.name} ${r.description} ${r.why ?? ''}`.toLowerCase();
      return q
        .split(/\s+/)
        .filter(Boolean)
        .every((tok) => hay.includes(tok));
    });
  }, [query, activeKinds]);

  const kindCounts = useMemo(() => {
    const map = new Map<ResourceKind, number>();
    for (const r of filtered) map.set(r.kind, (map.get(r.kind) ?? 0) + 1);
    return map;
  }, [filtered]);

  const toggleKind = (k: ResourceKind) =>
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const clearAll = () => {
    setQuery('');
    setActiveKinds(new Set());
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /threatintel
      </Link>

      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Compass size={28} className="text-brand-600 dark:text-brand-400" /> External Resources
        </h1>
        <p className="text-slate-600 dark:text-slate-400 font-mono mb-2 max-w-3xl">
          {RESOURCES.length} off-site sources I cross-reference: dashboards, OSINT directories, training labs, malware
          samples, and research portfolios. Filter by kind or search across name and description.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500 font-mono mb-8">
          External sites change ownership and quality over time. Verify a specific link before relying on it.
        </p>
      </div>

      {/* Search */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, description (e.g. 'osint', 'ransomware', 'llm')"
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            aria-label="Search external resources"
          />
        </div>
        {(query || activeKinds.size > 0) && (
          <div className="mt-3 text-right">
            <button
              type="button"
              onClick={clearAll}
              className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline"
            >
              clear filters
            </button>
          </div>
        )}
      </section>

      {/* Kind pills */}
      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-mono text-slate-500 mr-1">kind:</span>
          {ALL_KINDS.map((k) => {
            const count = kindCounts.get(k) ?? 0;
            const active = activeKinds.has(k);
            const cls = active ? KIND_PILL[k] : 'border-slate-300 dark:border-slate-700 text-slate-500';
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                className={`text-[11px] font-mono px-2 py-1 rounded border ${cls} ${count === 0 ? 'opacity-30' : ''}`}
                title={KIND_BLURB[k]}
                disabled={count === 0 && !active}
              >
                {KIND_LABELS[k]} <span className="opacity-70">· {count}</span>
              </button>
            );
          })}
        </div>
      </section>

      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-500 mb-4">
        Showing {filtered.length} of {RESOURCES.length}
      </p>

      <ul className="grid gap-3 md:grid-cols-2">
        {filtered.map((r) => (
          <li
            key={r.id}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
          >
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
              >
                {r.name} <ExternalLink size={12} className="opacity-60" />
              </a>
              <button
                type="button"
                onClick={() => toggleKind(r.kind)}
                className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${KIND_PILL[r.kind]}`}
                title={`Filter by ${KIND_LABELS[r.kind]}`}
              >
                {KIND_LABELS[r.kind]}
              </button>
            </div>
            <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed mb-2">
              {r.description}
            </p>
            {r.why && (
              <p className="text-[12px] font-mono italic text-slate-500 dark:text-slate-500 leading-relaxed">
                <span className="text-slate-400 dark:text-slate-600 not-italic">why:</span> {r.why}
              </p>
            )}
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="text-sm font-mono text-slate-500 dark:text-slate-500 mt-6">
          Nothing matches the current filters.{' '}
          <button onClick={clearAll} className="underline text-brand-600 dark:text-brand-400">
            Clear all
          </button>
          ?
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the lazy import to `src/App.tsx`**

Find this line (currently around line 100):

```ts
const AwesomeLists = lazy(() => import('./pages/dfir/AwesomeLists'));
```

Add directly below it:

```ts
const ExternalResources = lazy(() => import('./pages/threatintel/ExternalResources'));
```

- [ ] **Step 3: Add the route in `src/App.tsx`**

Find the existing `/threatintel/awesome-lists` route (currently around lines 1021–1028):

```tsx
<Route
  path="/threatintel/awesome-lists"
  element={
    <Suspense fallback={<SectionLoader />}>
      <AwesomeLists />
    </Suspense>
  }
/>
```

Add directly below it (and above the `/threatintel` parent route):

```tsx
<Route
  path="/threatintel/external-resources"
  element={
    <Suspense fallback={<SectionLoader />}>
      <ExternalResources />
    </Suspense>
  }
/>
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm test -- src/components/__tests__/DfirRoutes.test.tsx --run 2>&1 | tail -15`
Expected: all subRoutes tests pass, including `/threatintel/external-resources`.

- [ ] **Step 5: Lint the new and modified files**

Run: `npx eslint src/pages/threatintel/ExternalResources.tsx src/App.tsx src/components/__tests__/DfirRoutes.test.tsx`
Expected: no output (exit 0).

- [ ] **Step 6: Commit**

```bash
git add src/pages/threatintel/ExternalResources.tsx src/App.tsx src/components/__tests__/DfirRoutes.test.tsx
git commit -m "feat(threatintel): External Resources catalog page + route + render test"
```

---

## Task 4: Replace the External Sources block on the landing

**Files:**

- Modify: `src/pages/threatintel/Home.tsx`

- [ ] **Step 1: Add the catalog tile to the `catalogs` section**

Find this block in `src/pages/threatintel/Home.tsx` (currently around lines 252–257):

```ts
      {
        to: '/threatintel/awesome-lists',
        label: 'Awesome Lists',
        desc: 'GitHub awesome-lists for OSINT, threat intel, IR, and MCP / AI security. Filterable by stars and focus area.',
        icon: Sparkles,
      },
```

Insert directly below it (still inside the `tools` array of the `catalogs` section):

```ts
      {
        to: '/threatintel/external-resources',
        label: 'External Resources',
        desc: '16 off-site cross-references — dashboards, OSINT directories, training labs, malware samples, and research portfolios. Filter by kind.',
        icon: ExternalLink,
      },
```

- [ ] **Step 2: Delete the entire `external` section**

Find this block (currently lines 308–385) and delete it in full — from the leading `{` of the section through its trailing `},` (inclusive):

```ts
  {
    id: 'external',
    label: 'External Sources',
    blurb: 'Off-site catalogues and dashboards I cross-reference.',
    tools: [
      // ... all 10 entries (My Threat Intel through Serus) ...
    ],
  },
```

After deletion, the `SECTIONS` array's last element is the `catalogs` section.

- [ ] **Step 3: Remove the two icon imports that became unused**

Find the lucide-react import block (currently lines 3–34). Remove these two lines:

```ts
  Github,
  Microscope,
```

The remaining lucide imports in that block stay untouched.

- [ ] **Step 4: Run lint to confirm no unused-import or shadowing errors**

Run: `npx eslint src/pages/threatintel/Home.tsx`
Expected: no output (exit 0). If eslint flags any other lucide import as unused, that import was only used in the deleted block — delete it the same way.

- [ ] **Step 5: Run the route test again to confirm nothing regressed**

Run: `npm test -- src/components/__tests__/DfirRoutes.test.tsx --run 2>&1 | tail -10`
Expected: all subRoutes tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/pages/threatintel/Home.tsx
git commit -m "feat(threatintel): replace inline External Sources block with catalog tile"
```

---

## Task 5: Add OG override for the new path

**Files:**

- Modify: `worker/index.ts`

- [ ] **Step 1: Add the override entry**

Find the existing `'/threatintel'` entry in `OG_OVERRIDES` in `worker/index.ts` (currently around lines 71–75):

```ts
  '/threatintel': {
    title: 'Threat Intel Platform · pranithjain.qzz.io',
    description:
      'A working CTI surface on the edge. Live ransomware leak claims, CVE merged with CISA KEV, cross-source IOC correlation across 18 feeds, an actor-activity Gantt joined with MITRE Group profiles, victim re-leak detection, ten-panel metrics, STIX 2.1 export, and a writeups aggregator across 18 analyst blogs.',
  },
```

Add directly below it (still inside the `OG_OVERRIDES` object literal):

```ts
  '/threatintel/external-resources': {
    title: 'External Resources Catalog · pranithjain.qzz.io',
    description:
      '16 off-site cross-references for threat-intel work — dashboards (My Threat Intel, World Monitor), OSINT directories, training labs (AI Goat, WebVerse, VulnOS), malware samples, and AI-security research. Filterable by kind, searchable by name/description.',
  },
```

- [ ] **Step 2: Lint the worker file**

Run: `npx eslint worker/index.ts`
Expected: no output (exit 0).

- [ ] **Step 3: Commit**

```bash
git add worker/index.ts
git commit -m "feat(seo): OG override for /threatintel/external-resources"
```

---

## Task 6: Full project verification

**Files:** none (verification only)

- [ ] **Step 1: Full lint**

Run: `npm run lint 2>&1 | tail -10`
Expected: exits 0 with no warnings (the eslint config is `--max-warnings 0`).

- [ ] **Step 2: Run the full test suite**

Run: `npm run test:run 2>&1 | tail -20`
Expected: all tests pass. Confirm the new `/threatintel/external-resources` entry shows up in the DFIR sub-routes test output.

- [ ] **Step 3: Production build**

Run: `npm run build 2>&1 | tail -25`
Expected: build completes. Look for an emitted asset matching `ExternalResources-*.js` confirming the lazy chunk was produced.

- [ ] **Step 4: Manual dev-server smoke check (optional but recommended)**

Run: `npm run dev` and open `http://localhost:5173/threatintel/external-resources`. Verify:

- Page renders with H1 "External Resources" and 16 cards.
- Clicking a kind pill filters the grid and adds `?kind=...` to the URL.
- Clicking a card's kind pill on the card itself toggles that filter.
- Typing in the search box narrows the grid and the URL updates `?q=...`.
- The landing at `http://localhost:5173/threatintel` shows the "External Resources" tile in the Catalogues section and no longer shows the old External Sources block.

Stop the dev server with Ctrl-C when done.

- [ ] **Step 5: Final summary**

The feature is now complete on the local branch. The four commits from Tasks 1, 3, 4, 5 plus any pre-existing commits remain on `main`. Deploy with `npm run deploy` (the user runs this — do not auto-deploy).

---

## Self-review checklist (filled in during plan authoring)

- **Spec coverage:**
  - §3 UX & route → Task 3 (component + route).
  - §4 Data model → Task 1 (data file).
  - §5 Catalog entries → Task 1 (full 16-entry array inlined verbatim).
  - §6 Files touched → Tasks 1, 3, 4, 5 cover all 5 files (2 new + 3 modified). The 4th modified file (`DfirRoutes.test.tsx`) is added by this plan; the spec's §8 test plan is satisfied.
  - §7 Error handling → Task 6 step 4 verifies empty filter result and unknown URL kinds (the component drops unknown kinds in Task 3 step 1).
  - §8 Testing → Task 2 + Task 3 (TDD red→green via DfirRoutes.test.tsx).
  - §9 Acceptance criteria 1–6 → covered by Tasks 1+3+4 (entries render, filters work, landing replaced) and Task 6 (lint + build + OG).
- **Placeholders:** none. Every code step contains complete code; every command step has an exact command and expected output.
- **Type consistency:** `ResourceKind` defined in Task 1, used by `RESOURCES` (Task 1) and the page component (Task 3 imports it). `KIND_LABELS`, `KIND_BLURB`, `KIND_PILL` all exported from the same file and consumed by the component. No drift.
- **Scope discipline:** prerender, two-dimension filters, stars/badges, and Awesome Lists migration are explicitly out of scope per the spec and remain out of scope in this plan.
