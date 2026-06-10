# Crypto Fund-Flow Tracer — Phase D (OSINT Pivot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a selected tracer node into investigation leads — an in-Tracer "OSINT pivots" panel with address-driven Google dorks + unified-search, and ENS/domain-derived leak/breach pivots.

**Architecture:** Pure builders (`osint-pivots.ts`) generate dork/unified-search/Tier-2 links from a node's address + label; a panel in `Tracer.tsx` renders them. No backend, no persistence — reuses the existing OSINT routes.

**Tech Stack:** React + TypeScript, vitest. No new deps.

**Spec:** `docs/superpowers/specs/2026-06-11-crypto-tracer-phase-d-design.md`
**Base branch:** `feat/crypto-tracer-de` (off current `origin/main`, A+B+C live).

---

## Conventions

- Branch automation moves HEAD; `git branch --show-current` before each commit; commit on the checked-out branch; no new branch/stash; only `git add` the named files.
- Frontend tests: repo root, `npx vitest run <path>`. Typecheck: `npx tsc -p tsconfig.json --noEmit` (ignore only pre-existing `src/.../osint/` errors if any).

---

### Task PD-1: Pure OSINT-pivot builders

**Files:** Create `src/lib/dfir/osint-pivots.ts`, `src/lib/dfir/osint-pivots.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/dfir/osint-pivots.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDorkQueries, deriveOsintTargets, tier2Pivots } from './osint-pivots';

describe('osint-pivots', () => {
  it('buildDorkQueries emits site-scoped dorks with the quoted address', () => {
    const qs = buildDorkQueries('0xABC');
    expect(qs.length).toBeGreaterThanOrEqual(6);
    const etherscan = qs.find((q) => /etherscan/i.test(q.label))!;
    expect(etherscan.q).toBe('"0xABC" site:etherscan.io');
    expect(etherscan.webUrl).toContain('google.com/search?q=');
    expect(etherscan.webUrl).toContain(encodeURIComponent('"0xABC" site:etherscan.io'));
    expect(etherscan.apiPath).toBe(`/api/v1/google-dorks?q=${encodeURIComponent('"0xABC" site:etherscan.io')}`);
  });

  it('deriveOsintTargets extracts a username from an ENS name', () => {
    const t = deriveOsintTargets('vitalik.eth');
    expect(t.ens).toBe('vitalik.eth');
    expect(t.usernames).toContain('vitalik');
  });

  it('deriveOsintTargets extracts a domain from a domain-shaped label', () => {
    expect(deriveOsintTargets('lazarus-group.io').domains).toContain('lazarus-group.io');
  });

  it('deriveOsintTargets returns no targets for a bare hex address', () => {
    const t = deriveOsintTargets('0x28c6c06298d514db089934071355e5743bf21d60');
    expect(t.ens).toBeNull();
    expect(t.domains).toHaveLength(0);
    expect(t.usernames).toHaveLength(0);
  });

  it('tier2Pivots maps a domain target to leak/breach links and is empty with no targets', () => {
    const links = tier2Pivots({ ens: null, domains: ['foo.com'], usernames: [] });
    expect(links.some((l) => /breach/i.test(l.label))).toBe(true);
    expect(tier2Pivots({ ens: null, domains: [], usernames: [] })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/lib/dfir/osint-pivots.test.ts`.

- [ ] **Step 3: Implement**

`src/lib/dfir/osint-pivots.ts`:

```ts
export interface DorkQuery {
  label: string;
  q: string;
  webUrl: string;
  apiPath: string;
}

const DORK_SITES: { label: string; tmpl: (a: string) => string }[] = [
  { label: 'Etherscan', tmpl: (a) => `"${a}" site:etherscan.io` },
  { label: 'GitHub', tmpl: (a) => `"${a}" site:github.com` },
  { label: 'Twitter/X', tmpl: (a) => `"${a}" (site:twitter.com OR site:x.com)` },
  { label: 'Telegram', tmpl: (a) => `"${a}" site:t.me` },
  { label: 'Reddit', tmpl: (a) => `"${a}" site:reddit.com` },
  { label: 'Paste sites', tmpl: (a) => `"${a}" (site:pastebin.com OR site:ghostbin.com OR site:throwbin.io)` },
  { label: 'Web (broad)', tmpl: (a) => `"${a}"` },
];

export function buildDorkQueries(address: string): DorkQuery[] {
  return DORK_SITES.map(({ label, tmpl }) => {
    const q = tmpl(address);
    const enc = encodeURIComponent(q);
    return { label, q, webUrl: `https://www.google.com/search?q=${enc}`, apiPath: `/api/v1/google-dorks?q=${enc}` };
  });
}

export interface OsintTargets {
  ens: string | null;
  domains: string[];
  usernames: string[];
}

/** ENS-label-only derivation (no email pattern-guessing). Pure. */
export function deriveOsintTargets(label: string | null, ensName?: string | null): OsintTargets {
  const candidate = (ensName ?? label ?? '').trim();
  const ens = /\.eth$/i.test(candidate) ? candidate : (ensName ?? null);
  const domains: string[] = [];
  const usernames: string[] = [];
  if (/\.eth$/i.test(candidate)) {
    usernames.push(candidate.replace(/\.eth$/i, ''));
  } else if (/^[a-z0-9-]+\.[a-z]{2,}$/i.test(candidate)) {
    domains.push(candidate.toLowerCase());
  } else if (/^[a-z0-9_]{3,30}$/i.test(candidate)) {
    usernames.push(candidate);
  }
  return { ens, domains, usernames };
}

export interface PivotLink {
  label: string;
  apiPath: string;
}

/**
 * Map derived targets to existing OSINT route deep-links. The apiPaths below are
 * best-effort; the implementer MUST confirm each route's path + query-param name
 * against `api/src/index.ts` registration and adjust (breach/hudsonrock/leakix/
 * threat-hunt/proxynova). Report any path corrections.
 */
export function tier2Pivots(t: OsintTargets): PivotLink[] {
  const out: PivotLink[] = [];
  for (const d of t.domains) {
    const e = encodeURIComponent(d);
    out.push({ label: `Breach search: ${d}`, apiPath: `/api/v1/breach/domain?domain=${e}` });
    out.push({ label: `Infostealer logs: ${d}`, apiPath: `/api/v1/hudsonrock?domain=${e}` });
    out.push({ label: `LeakIX: ${d}`, apiPath: `/api/v1/leakix?q=${e}` });
  }
  for (const u of t.usernames) {
    const e = encodeURIComponent(u);
    out.push({ label: `Threat hunt: ${u}`, apiPath: `/api/v1/threat-hunt?q=${e}` });
    out.push({ label: `Combolist: ${u}`, apiPath: `/api/v1/proxynova?q=${e}` });
  }
  return out;
}
```

- [ ] **Step 4: Run → PASS** — `npx vitest run src/lib/dfir/osint-pivots.test.ts`.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc -p tsconfig.json --noEmit
git add src/lib/dfir/osint-pivots.ts src/lib/dfir/osint-pivots.test.ts
git commit -m "feat(tracer): pure OSINT-pivot builders (dorks + ENS-derived targets)"
```

---

### Task PD-2: OSINT pivots panel in Tracer.tsx

**Files:** Modify `src/pages/dfir/Tracer.tsx`

(Frontend; typecheck + manual smoke. No new unit test.)

- [ ] **Step 1: Add imports + state + handler**

Add the import:

```ts
import { buildDorkQueries, deriveOsintTargets, tier2Pivots } from '../../lib/dfir/osint-pivots';
```

Add state near the other `useState`s:

```ts
const [unifiedResult, setUnifiedResult] = useState<string | null>(null);
const [ensName, setEnsName] = useState<string | null>(null);
```

Add handlers (inside the component):

```ts
const runUnifiedSearch = useCallback(async (q: string) => {
  setUnifiedResult('searching…');
  try {
    const res = await fetch(`/api/v1/unified-search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return setUnifiedResult('search unavailable');
    const data = (await res.json()) as { results?: unknown[]; total?: number };
    const n = data.total ?? data.results?.length ?? 0;
    setUnifiedResult(`${n} result${n === 1 ? '' : 's'} — open in Unified Search`);
  } catch {
    setUnifiedResult('search unavailable');
  }
}, []);

const resolveEns = useCallback(async (address: string) => {
  try {
    const res = await fetch(`/api/v1/crypto-trace?address=${encodeURIComponent(address)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { context?: { ens_name?: string | null } };
    if (data.context?.ens_name) setEnsName(data.context.ens_name);
  } catch {
    /* ignore — Tier-1 unaffected */
  }
}, []);
```

NOTE: confirm `GET /api/v1/unified-search` response shape (key for count) and `GET /api/v1/crypto-trace` response shape (`context.ens_name`) against the handlers; adjust the destructures to match and report what you found.

- [ ] **Step 2: Reset ENS on node change** — in the `onNodeClick`/`onSeed` handlers (wherever `setSelected` is called), also `setUnifiedResult(null); setEnsName(null);` so the panel reflects the current node. (Find the `setSelected(tn)` line in `onNodeClick` and add the resets next to it.)

- [ ] **Step 3: Add the OSINT pivots panel** in the detail panel, after the existing cluster/calldata sections (inside the `selected ? (...)` block, before its closing `</>`):

```tsx
{
  /* OSINT pivots */
}
<div className="border-t border-gray-700 pt-2">
  <span className="text-gray-400">OSINT pivots</span>
  <div className="mt-1 flex flex-wrap gap-1">
    {buildDorkQueries(selected.address).map((d) => (
      <a
        key={d.label}
        href={d.webUrl}
        target="_blank"
        rel="noreferrer"
        className="rounded border border-gray-600 px-1 text-[10px] hover:bg-gray-800"
      >
        {d.label}
      </a>
    ))}
  </div>
  <button
    className="mt-1 w-full rounded border border-gray-600 p-1 text-[10px] hover:bg-gray-800"
    onClick={() => void runUnifiedSearch(selected.address)}
  >
    Run unified search
  </button>
  {unifiedResult ? <p className="mt-1 text-[10px] text-gray-400">{unifiedResult}</p> : null}
  {selected.chain === 'evm' && !selected.label && !ensName ? (
    <button
      className="mt-1 w-full rounded border border-gray-600 p-1 text-[10px] hover:bg-gray-800"
      onClick={() => void resolveEns(selected.address)}
    >
      Resolve ENS
    </button>
  ) : null}
  {(() => {
    const targets = deriveOsintTargets(selected.label, ensName);
    const links = tier2Pivots(targets);
    return links.length ? (
      <div className="mt-1">
        <span className="text-gray-500">
          Identity pivots ({targets.ens ?? targets.domains[0] ?? targets.usernames[0]})
        </span>
        <ul className="mt-1 space-y-1">
          {links.map((l) => (
            <li key={l.label}>
              <a
                className="text-[10px] text-blue-400 hover:underline"
                href={l.apiPath}
                target="_blank"
                rel="noreferrer"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    ) : null;
  })()}
</div>;
```

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc -p tsconfig.json --noEmit
git add src/pages/dfir/Tracer.tsx
git commit -m "feat(tracer): OSINT pivots panel (dorks, unified search, ENS-derived leaks)"
```

- [ ] **Step 5: Manual smoke** — `/dfir/tracer`: select a node → "OSINT pivots" shows dork links (open Google), "Run unified search" returns a count, and for an ENS-labeled node the identity pivots appear.

---

## Self-Review (completed during planning)

**Spec coverage:** §1 Tier-1 dorks + unified-search → PD-1 (`buildDorkQueries`) + PD-2 (panel + `runUnifiedSearch`). §1 Tier-2 ENS-gated → PD-1 (`deriveOsintTargets`/`tier2Pivots`) + PD-2 (gated render + `resolveEns`). §2 components → PD-1/PD-2. §5 error handling → search-unavailable + ENS-resolve-ignore in PD-2. §6 testing → PD-1 unit tests. Non-goals respected (no OsintMapper, no email-guessing, no auto-fan).

**Placeholders:** none — two verify-against-reality notes (Tier-2 route paths in PD-1; unified-search/crypto-trace response shapes in PD-2) instruct the engineer to confirm live shapes, which is correct.

**Type consistency:** `DorkQuery`/`OsintTargets`/`PivotLink` defined in PD-1 and consumed in PD-2; `deriveOsintTargets(label, ensName?)` signature consistent; node fields `selected.address`/`selected.label`/`selected.chain` match the client `TracerNode`.
