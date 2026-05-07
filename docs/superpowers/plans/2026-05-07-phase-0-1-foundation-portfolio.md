# Phase 0 + 1: Foundation & DFIR Consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the unified Vite + React 18 portfolio repo with a separate Cloudflare API Worker scaffold bound at `/api/v1/*`, and add `/dfir/*` placeholder sub-routes ready for tool implementation in Phase 2.

**Architecture:** Two Cloudflare Workers under one domain `pranithjain.qzz.io`. The existing static-asset Worker keeps serving the SPA from `./dist`. A new API Worker lives at `api/` in the same repo, deployed independently, bound to `pranithjain.qzz.io/api/v1/*`. KV namespaces, R2 bucket, and threat-intel API secrets live on the API Worker only.

**Tech Stack:** Vite 6, React 18, react-router-dom v6, Tailwind v3, framer-motion, vitest (existing). New: `wrangler` 3.x (for API Worker), Hono router (lightweight, Worker-native), `@cloudflare/vitest-pool-workers` for Worker tests.

**Deliverables when this plan is complete:**

1. Unified repo cloned to `/Users/pranith/Documents/portfolio`
2. `api/` Worker scaffold with `/api/v1/health` returning `{ "ok": true }`
3. KV namespaces (`KV_CACHE`, `KV_SHARES`) and R2 bucket (`R2_FILES`) provisioned in Cloudflare
4. `pranithjain.qzz.io/api/v1/health` reachable in production
5. New child routes `/dfir/ioc-check`, `/dfir/phishing`, `/dfir/domain`, `/dfir/exposure`, `/dfir/file`, `/dfir/wiki`, `/dfir/dashboard` rendering "Coming soon" placeholders without breaking existing tests
6. DFIR legacy planning docs and FastAPI reference code archived under `docs/dfir-legacy/`

---

## Prerequisites

The engineer must have all of these before starting Task 1. Stop and confirm with the user if any are missing.

- **Node.js ≥ 18** (`node -v`)
- **git** with credentials configured for `Pranith-Jain` GitHub
- **Cloudflare account** that already owns `pranithjain.qzz.io` (existing portfolio is deployed here)
- **wrangler CLI** logged in: `npx wrangler login` once, then `npx wrangler whoami` should print the user
- Read access to existing `dfir` repo at `/Users/pranith/Documents/dfir/` (for legacy artifacts)

---

## File Structure

After this plan completes, the unified repo at `/Users/pranith/Documents/portfolio/` looks like:

```
portfolio/
├── package.json                     existing (Vite SPA)
├── wrangler.json                    existing (SPA Worker; renamed `name` for clarity)
├── vite.config.ts                   existing
├── tailwind.config.js               existing
├── src/                             existing portfolio source
│   ├── App.tsx                      MODIFIED: new /dfir/* child routes
│   ├── pages/
│   │   ├── DFIR.tsx                 existing (kept as-is for now; landing)
│   │   └── dfir/                    NEW directory for sub-tool pages
│   │       ├── IocCheckPlaceholder.tsx       NEW
│   │       ├── PhishingPlaceholder.tsx       NEW
│   │       ├── DomainPlaceholder.tsx         NEW
│   │       ├── ExposurePlaceholder.tsx       NEW
│   │       ├── FilePlaceholder.tsx           NEW
│   │       ├── WikiPlaceholder.tsx           NEW
│   │       └── DashboardPlaceholder.tsx      NEW
│   └── components/__tests__/
│       └── DfirRoutes.test.tsx               NEW: smoke tests for placeholder routes
├── api/                             NEW: API Worker
│   ├── package.json
│   ├── tsconfig.json
│   ├── wrangler.toml
│   ├── src/
│   │   ├── index.ts                 router entry, /api/v1/health
│   │   └── env.ts                   typed Env interface for bindings & secrets
│   └── test/
│       └── health.test.ts           vitest test for /api/v1/health
├── docs/
│   ├── superpowers/
│   │   ├── specs/                   moved from dfir/docs/superpowers/specs/
│   │   └── plans/                   moved from dfir/docs/superpowers/plans/
│   └── dfir-legacy/
│       ├── DFIR-PLATFORM-PLAN.md    copied from dfir/
│       └── api-reference/           copied from dfir/api/ (Python; reference only)
│           ├── main.py
│           ├── providers.py
│           ├── domain.py
│           ├── wiki_data.py
│           └── requirements.txt
└── README.md                        existing
```

---

## Task 1: Clone unified repo locally

**Files:**

- Create: `/Users/pranith/Documents/portfolio/` (clone target)

- [ ] **Step 1: Clone the portfolio repo as the unified working tree**

```bash
git clone https://github.com/Pranith-Jain/Pranith-Jain.github.io.git /Users/pranith/Documents/portfolio
```

Expected: clone succeeds with a `Cloning into '/Users/pranith/Documents/portfolio'...` message.

- [ ] **Step 2: Verify it's the right repo**

```bash
ls /Users/pranith/Documents/portfolio/
```

Expected output includes: `package.json`, `vite.config.ts`, `wrangler.json`, `src/`, `public/`.

- [ ] **Step 3: Capture current commit SHA as baseline**

```bash
git -C /Users/pranith/Documents/portfolio rev-parse HEAD
```

Save the SHA. If anything goes wrong, `git reset --hard <SHA>` rolls back.

- [ ] **Step 4: Commit checkpoint marker file (optional safety net)**

```bash
git -C /Users/pranith/Documents/portfolio checkout -b feature/dfir-integration
```

All work for this plan stays on `feature/dfir-integration` until phase 6 cutover. No commits to `main` yet.

---

## Task 2: Verify portfolio baseline (build + tests)

**Goal:** establish a green baseline so any later regression is unambiguous.

**Files:** none modified.

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/pranith/Documents/portfolio && npm install
```

Expected: completes without errors. Some peer-dep warnings are OK; failures are not.

- [ ] **Step 2: Run existing tests**

```bash
npm test -- --run
```

Expected: all tests pass. If any fail, **STOP** and surface the failure to the user — we don't want to start work on a broken baseline.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: `0 problems`. Warnings are tolerated; errors are not.

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: produces `dist/` directory. Note the bundle sizes printed at the end — they're our regression budget.

- [ ] **Step 5: Smoke-run the dev server (manual)**

```bash
npm run dev
```

Open the printed URL (typically `http://localhost:5173/`). Click through `/`, `/about`, `/skills`, `/experience`, `/projects`, `/dfir`. Verify each renders without a console error. Stop the dev server (`Ctrl+C`).

- [ ] **Step 6: No commit needed** — nothing changed.

---

## Task 3: Add `api/` Worker scaffold (package + TS config)

**Files:**

- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/.gitignore`

- [ ] **Step 1: Create `api/` directory**

```bash
mkdir -p /Users/pranith/Documents/portfolio/api/src /Users/pranith/Documents/portfolio/api/test
```

- [ ] **Step 2: Write `api/package.json`**

Path: `/Users/pranith/Documents/portfolio/api/package.json`

```json
{
  "name": "pranithjain-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "@cloudflare/workers-types": "^4.20240909.0",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0",
    "wrangler": "^3.78.0"
  }
}
```

- [ ] **Step 3: Write `api/tsconfig.json`**

Path: `/Users/pranith/Documents/portfolio/api/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-pool-workers"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 4: Write `api/.gitignore`**

Path: `/Users/pranith/Documents/portfolio/api/.gitignore`

```
node_modules
.wrangler
.dev.vars
dist
```

- [ ] **Step 5: Install API Worker dependencies**

```bash
cd /Users/pranith/Documents/portfolio/api && npm install
```

Expected: completes without errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/pranith/Documents/portfolio
git add api/package.json api/package-lock.json api/tsconfig.json api/.gitignore
git commit -m "feat(api): scaffold API Worker package and TypeScript config"
```

---

## Task 4: Health endpoint with TDD

**Files:**

- Create: `api/src/env.ts`
- Create: `api/src/index.ts`
- Create: `api/test/health.test.ts`
- Create: `api/vitest.config.ts`
- Create: `api/wrangler.toml` (minimal, expanded in Task 5)

- [ ] **Step 1: Write the failing test**

Path: `/Users/pranith/Documents/portfolio/api/test/health.test.ts`

```typescript
import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('GET /api/v1/health', () => {
  it('returns 200 with { ok: true }', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/health');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true });
  });

  it('returns 404 for unknown routes', async () => {
    const response = await SELF.fetch('https://example.com/api/v1/nope');

    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 2: Write `api/vitest.config.ts`**

Path: `/Users/pranith/Documents/portfolio/api/vitest.config.ts`

```typescript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});
```

- [ ] **Step 3: Write minimal `api/wrangler.toml` (just enough for tests)**

Path: `/Users/pranith/Documents/portfolio/api/wrangler.toml`

```toml
name = "pranithjain-api"
main = "src/index.ts"
compatibility_date = "2025-04-01"
compatibility_flags = ["nodejs_compat"]
```

KV/R2/secrets get added in Task 5.

- [ ] **Step 4: Run the test to verify it fails (no `index.ts` yet)**

```bash
cd /Users/pranith/Documents/portfolio/api && npm test
```

Expected: FAIL with an error mentioning that `src/index.ts` is missing or has no default export.

- [ ] **Step 5: Write `api/src/env.ts`**

Path: `/Users/pranith/Documents/portfolio/api/src/env.ts`

```typescript
export interface Env {
  KV_CACHE: KVNamespace;
  KV_SHARES: KVNamespace;
  R2_FILES: R2Bucket;
}
```

Only declares bindings actually used in this phase. Provider API key secrets and the rate-limit binding (`RL_API`) get added in later phases when they're consumed. KV and R2 are declared early because the test pool requires the matching `wrangler.toml` declarations to boot cleanly in Task 5.

- [ ] **Step 6: Write minimal `api/src/index.ts` that uses Hono**

Path: `/Users/pranith/Documents/portfolio/api/src/index.ts`

```typescript
import { Hono } from 'hono';
import type { Env } from './env';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/v1/health', (c) => c.json({ ok: true }));

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
```

- [ ] **Step 7: Run the test, verify it passes**

```bash
cd /Users/pranith/Documents/portfolio/api && npm test
```

Expected: both tests pass.

- [ ] **Step 8: Typecheck**

```bash
cd /Users/pranith/Documents/portfolio/api && npm run typecheck
```

Expected: no output (clean).

- [ ] **Step 9: Commit**

```bash
cd /Users/pranith/Documents/portfolio
git add api/src api/test api/wrangler.toml api/vitest.config.ts
git commit -m "feat(api): add /api/v1/health endpoint with worker test harness"
```

---

## Task 5: Provision Cloudflare bindings (KV, R2)

**Goal:** create the actual KV namespaces and R2 bucket in the user's Cloudflare account, then declare them in `wrangler.toml` so future code can use them.

**Files:**

- Modify: `api/wrangler.toml`

- [ ] **Step 1: Create the cache KV namespace (production)**

```bash
cd /Users/pranith/Documents/portfolio/api && npx wrangler kv namespace create KV_CACHE
```

Expected output includes a line like:

```
[[kv_namespaces]]
binding = "KV_CACHE"
id = "abc123..."
```

Copy the printed `id` value. Note it down — call it `<KV_CACHE_PROD_ID>`.

- [ ] **Step 2: Create the cache KV namespace (preview / dev)**

```bash
npx wrangler kv namespace create KV_CACHE --preview
```

Save the printed `preview_id` — call it `<KV_CACHE_PREVIEW_ID>`.

- [ ] **Step 3: Create the shares KV namespace (production + preview)**

```bash
npx wrangler kv namespace create KV_SHARES
npx wrangler kv namespace create KV_SHARES --preview
```

Save both ids: `<KV_SHARES_PROD_ID>` and `<KV_SHARES_PREVIEW_ID>`.

- [ ] **Step 4: Create the R2 bucket**

```bash
npx wrangler r2 bucket create pranithjain-dfir-files
```

Expected: `Created bucket pranithjain-dfir-files`.

- [ ] **Step 5: Update `api/wrangler.toml` with bindings**

Replace the entire contents of `/Users/pranith/Documents/portfolio/api/wrangler.toml` with:

```toml
name = "pranithjain-api"
main = "src/index.ts"
compatibility_date = "2025-04-01"
compatibility_flags = ["nodejs_compat"]

# === Bindings ===

[[kv_namespaces]]
binding = "KV_CACHE"
id = "<KV_CACHE_PROD_ID>"
preview_id = "<KV_CACHE_PREVIEW_ID>"

[[kv_namespaces]]
binding = "KV_SHARES"
id = "<KV_SHARES_PROD_ID>"
preview_id = "<KV_SHARES_PREVIEW_ID>"

[[r2_buckets]]
binding = "R2_FILES"
bucket_name = "pranithjain-dfir-files"
preview_bucket_name = "pranithjain-dfir-files"
```

Replace the four `<...>` placeholders with the IDs captured in Steps 1–3. The R2 preview reuses the prod bucket — Cloudflare doesn't separate preview R2 by default. (The rate-limit binding `RL_API` is declared in a later phase when `/api/v1/*` routes that need throttling exist.)

- [ ] **Step 6: Confirm bindings parse**

```bash
cd /Users/pranith/Documents/portfolio/api && npx wrangler types
```

Expected: produces a `worker-configuration.d.ts` next to `wrangler.toml` reflecting the bindings. Delete that file (we have our own `env.ts`):

```bash
rm worker-configuration.d.ts
```

- [ ] **Step 7: Re-run tests to confirm bindings don't break the test pool**

```bash
npm test
```

Expected: still passes. (`@cloudflare/vitest-pool-workers` provisions in-memory fakes for KV/R2/RateLimit.)

- [ ] **Step 8: Commit**

```bash
cd /Users/pranith/Documents/portfolio
git add api/wrangler.toml
git commit -m "feat(api): declare KV, R2, and rate-limit bindings"
```

---

## Task 6: Deploy API Worker + bind production route

**Files:** none modified (Cloudflare-side configuration only).

- [ ] **Step 1: First deploy of the API Worker**

```bash
cd /Users/pranith/Documents/portfolio/api && npx wrangler deploy
```

Expected output ends with: `Deployed pranithjain-api triggers (... time)` and prints a URL like `https://pranithjain-api.<account>.workers.dev`.

- [ ] **Step 2: Sanity check the deployed Worker**

```bash
curl -s https://pranithjain-api.<account>.workers.dev/api/v1/health
```

Replace `<account>` with the subdomain printed above. Expected: `{"ok":true}`.

- [ ] **Step 3: Bind the route on `pranithjain.qzz.io`**

In the Cloudflare dashboard:

1. Go to Workers & Pages → `pranithjain-api` → Settings → Triggers
2. Click "Add Custom Domain" or "Add Route"
3. Add route: `pranithjain.qzz.io/api/v1/*` to zone `qzz.io` (or whichever zone hosts the domain)

If the dashboard step is unfamiliar, equivalent CLI:

```bash
cd /Users/pranith/Documents/portfolio/api
# View the existing zone the apex is on:
npx wrangler whoami
# Add the route declaratively in wrangler.toml:
```

If using the wrangler.toml route declaration, append:

```toml
[[routes]]
pattern = "pranithjain.qzz.io/api/v1/*"
zone_name = "qzz.io"
```

Then redeploy: `npx wrangler deploy`.

- [ ] **Step 4: Verify production route**

```bash
curl -s https://pranithjain.qzz.io/api/v1/health
```

Expected: `{"ok":true}`. If it returns the SPA's HTML instead, the route binding hasn't taken effect — wait 30s and retry, or recheck dashboard precedence (the API route must be more specific than the SPA fallback).

- [ ] **Step 5: Confirm SPA still works**

```bash
curl -sI https://pranithjain.qzz.io/ | head -1
curl -sI https://pranithjain.qzz.io/about | head -1
```

Expected: both return `HTTP/2 200`.

- [ ] **Step 6: Commit (if `wrangler.toml` was edited)**

```bash
cd /Users/pranith/Documents/portfolio
git add api/wrangler.toml
git commit -m "feat(api): bind production route pranithjain.qzz.io/api/v1/*" || echo "nothing to commit"
```

---

## Task 7: Pull DFIR legacy artifacts into unified repo

**Goal:** preserve the planning docs and FastAPI reference code where they're useful for porting in later phases. The standalone `dfir` repo will be archived once Phase 6 completes.

**Files:**

- Create: `docs/dfir-legacy/DFIR-PLATFORM-PLAN.md`
- Create: `docs/dfir-legacy/api-reference/main.py`
- Create: `docs/dfir-legacy/api-reference/providers.py`
- Create: `docs/dfir-legacy/api-reference/domain.py`
- Create: `docs/dfir-legacy/api-reference/wiki_data.py`
- Create: `docs/dfir-legacy/api-reference/requirements.txt`
- Create: `docs/dfir-legacy/README.md`
- Move: existing `docs/superpowers/specs/` and `docs/superpowers/plans/` from the dfir repo into the unified repo

- [ ] **Step 1: Create the legacy directories**

```bash
mkdir -p /Users/pranith/Documents/portfolio/docs/dfir-legacy/api-reference
mkdir -p /Users/pranith/Documents/portfolio/docs/superpowers
```

- [ ] **Step 2: Copy the planning markdown**

```bash
cp /Users/pranith/Documents/dfir/DFIR-PLATFORM-PLAN.md \
   /Users/pranith/Documents/portfolio/docs/dfir-legacy/DFIR-PLATFORM-PLAN.md
```

- [ ] **Step 3: Copy the FastAPI reference code**

```bash
cp /Users/pranith/Documents/dfir/api/main.py \
   /Users/pranith/Documents/dfir/api/providers.py \
   /Users/pranith/Documents/dfir/api/domain.py \
   /Users/pranith/Documents/dfir/api/wiki_data.py \
   /Users/pranith/Documents/dfir/api/requirements.txt \
   /Users/pranith/Documents/portfolio/docs/dfir-legacy/api-reference/
```

- [ ] **Step 4: Copy the spec + plan docs (current and future ones)**

```bash
cp -R /Users/pranith/Documents/dfir/docs/superpowers/specs \
      /Users/pranith/Documents/portfolio/docs/superpowers/specs
cp -R /Users/pranith/Documents/dfir/docs/superpowers/plans \
      /Users/pranith/Documents/portfolio/docs/superpowers/plans
```

From here on, all spec/plan edits happen in the unified repo. The dfir repo is read-only.

- [ ] **Step 5: Add a legacy README**

Path: `/Users/pranith/Documents/portfolio/docs/dfir-legacy/README.md`

```markdown
# DFIR Legacy Artifacts

This directory contains reference material from the original standalone `dfir`
repo (https://github.com/Pranith-Jain/DFIR-PLATFORM). It is **read-only** and
exists only to support porting work during phase 2 of the integration plan.

## Contents

- `DFIR-PLATFORM-PLAN.md` — original 2026-04-19 platform plan
- `api-reference/*.py` — original FastAPI implementation. Use only as a
  reference when porting providers and scoring logic to the API Worker. Do
  not run this code; it has no Worker runtime.

After phase 2 ships and the TypeScript ports are validated, this entire
directory should be removed.
```

- [ ] **Step 6: Commit**

```bash
cd /Users/pranith/Documents/portfolio
git add docs/
git commit -m "chore(legacy): import DFIR planning docs and FastAPI reference code"
```

---

## Task 8: Add `/dfir/*` placeholder routes — TDD

**Goal:** create one shared placeholder component and seven thin route components, wire them into `react-router`, and add a smoke test that asserts each route renders without crashing.

**Files:**

- Create: `src/pages/dfir/IocCheckPlaceholder.tsx`
- Create: `src/pages/dfir/PhishingPlaceholder.tsx`
- Create: `src/pages/dfir/DomainPlaceholder.tsx`
- Create: `src/pages/dfir/ExposurePlaceholder.tsx`
- Create: `src/pages/dfir/FilePlaceholder.tsx`
- Create: `src/pages/dfir/WikiPlaceholder.tsx`
- Create: `src/pages/dfir/DashboardPlaceholder.tsx`
- Create: `src/pages/dfir/ComingSoon.tsx` (shared component)
- Create: `src/components/__tests__/DfirRoutes.test.tsx`
- Modify: `src/App.tsx` (add child routes)

- [ ] **Step 1: Refactor `src/App.tsx` to export `AppContent` so it can be tested with a custom router**

Open `/Users/pranith/Documents/portfolio/src/App.tsx`. Find the line that declares the inner content function — it currently reads:

```tsx
function AppContent() {
```

Change that single line to:

```tsx
export function AppContent() {
```

No other change yet — the default `App` export keeps working for production. This single edit makes `AppContent` importable in tests so we can wrap it in `MemoryRouter`.

- [ ] **Step 2: Confirm nothing broke**

```bash
cd /Users/pranith/Documents/portfolio && npm test -- --run && npm run lint && npm run build
```

Expected: all tests still pass, lint clean, build succeeds.

- [ ] **Step 3: Write the failing test**

Path: `/Users/pranith/Documents/portfolio/src/components/__tests__/DfirRoutes.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { AppContent } from '../../App';

const subRoutes = [
  { path: '/dfir/ioc-check', heading: 'IOC Checker' },
  { path: '/dfir/phishing', heading: 'Phishing Email Analyzer' },
  { path: '/dfir/domain', heading: 'Domain Lookup' },
  { path: '/dfir/exposure', heading: 'Exposure Scanner' },
  { path: '/dfir/file', heading: 'File Analyzer' },
  { path: '/dfir/wiki', heading: 'DFIR Knowledge Base' },
  { path: '/dfir/dashboard', heading: 'Recent Lookups' },
];

describe('DFIR sub-routes', () => {
  it.each(subRoutes)('renders placeholder for $path', async ({ path, heading }) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AppContent />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the test, verify it fails**

```bash
cd /Users/pranith/Documents/portfolio && npm test -- --run DfirRoutes
```

Expected: 7 tests fail, message like "Unable to find role 'heading' with name 'IOC Checker'" — the routes don't exist yet, react-router falls through.

- [ ] **Step 5: Create the shared `ComingSoon` component (dfir-lab.ch aesthetic)**

Path: `/Users/pranith/Documents/portfolio/src/pages/dfir/ComingSoon.tsx`

This component is the first piece of UI in the new dfir-lab-inspired design language (spec §12). Dark background, cyan accent using existing `neon.cyan` token, monospace for the indicator-style label, generous whitespace.

```tsx
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface Props {
  title: string;
  description: string;
}

export function ComingSoon({ title, description }: Props): JSX.Element {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <section className="max-w-3xl mx-auto px-8 py-20">
        <Link
          to="/dfir"
          className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-[#00fff9] transition-colors mb-12 font-mono"
        >
          <ArrowLeft size={14} />
          /dfir
        </Link>

        <span className="inline-block text-xs uppercase tracking-[0.2em] text-[#00fff9] font-mono mb-4">
          Coming soon
        </span>

        <h1 className="text-4xl sm:text-5xl font-display font-bold mb-6 leading-tight">{title}</h1>

        <p className="text-lg text-[#a1a1aa] leading-relaxed max-w-2xl">{description}</p>

        <div className="mt-12 pt-8 border-t border-[#1f1f23]">
          <p className="text-sm text-[#71717a] font-mono">
            Status: <span className="text-[#00fff9]">scheduled · phase 2</span>
          </p>
        </div>
      </section>
    </div>
  );
}
```

> The hard-coded hex colors (`#0a0a0a`, `#00fff9`, etc.) are placeholders that will be promoted to a `dfir.*` Tailwind theme namespace in Phase 2. Inline hex is fine for this single placeholder component to avoid touching `tailwind.config.js` until we have a UI to validate it against.

- [ ] **Step 6: Create the seven route components**

Path: `/Users/pranith/Documents/portfolio/src/pages/dfir/IocCheckPlaceholder.tsx`

```tsx
import { ComingSoon } from './ComingSoon';

export default function IocCheckPlaceholder(): JSX.Element {
  return (
    <ComingSoon
      title="IOC Checker"
      description="Look up IPs, domains, URLs, and file hashes across VirusTotal, AbuseIPDB, Shodan, GreyNoise, OTX, URLScan, Hybrid Analysis, and Pulsedive in one query."
    />
  );
}
```

Path: `/Users/pranith/Documents/portfolio/src/pages/dfir/PhishingPlaceholder.tsx`

```tsx
import { ComingSoon } from './ComingSoon';

export default function PhishingPlaceholder(): JSX.Element {
  return (
    <ComingSoon
      title="Phishing Email Analyzer"
      description="Paste raw email source. We parse SPF, DKIM, DMARC, headers, URLs, and attachment hashes to score phishing risk."
    />
  );
}
```

Path: `/Users/pranith/Documents/portfolio/src/pages/dfir/DomainPlaceholder.tsx`

```tsx
import { ComingSoon } from './ComingSoon';

export default function DomainPlaceholder(): JSX.Element {
  return (
    <ComingSoon
      title="Domain Lookup"
      description="WHOIS, DNS records, SPF/DMARC/BIMI, SSL certificates, and Certificate Transparency history for any domain."
    />
  );
}
```

Path: `/Users/pranith/Documents/portfolio/src/pages/dfir/ExposurePlaceholder.tsx`

```tsx
import { ComingSoon } from './ComingSoon';

export default function ExposurePlaceholder(): JSX.Element {
  return (
    <ComingSoon
      title="Exposure Scanner"
      description="Subdomain enumeration, exposed services, and SSL/TLS issues sourced from Shodan and passive DNS."
    />
  );
}
```

Path: `/Users/pranith/Documents/portfolio/src/pages/dfir/FilePlaceholder.tsx`

```tsx
import { ComingSoon } from './ComingSoon';

export default function FilePlaceholder(): JSX.Element {
  return (
    <ComingSoon
      title="File Analyzer"
      description="Hash-based lookups across VirusTotal and Hybrid Analysis with detection ratios and MITRE ATT&CK mapping."
    />
  );
}
```

Path: `/Users/pranith/Documents/portfolio/src/pages/dfir/WikiPlaceholder.tsx`

```tsx
import { ComingSoon } from './ComingSoon';

export default function WikiPlaceholder(): JSX.Element {
  return (
    <ComingSoon
      title="DFIR Knowledge Base"
      description="Concepts, attack types, detection patterns, and response playbooks across Email Security, Threat Intel, Forensics, Detection, and Attack Types."
    />
  );
}
```

Path: `/Users/pranith/Documents/portfolio/src/pages/dfir/DashboardPlaceholder.tsx`

```tsx
import { ComingSoon } from './ComingSoon';

export default function DashboardPlaceholder(): JSX.Element {
  return (
    <ComingSoon
      title="Recent Lookups"
      description="Your last 20 lookups, kept anonymously via a browser cookie. No login required."
    />
  );
}
```

- [ ] **Step 7: Modify `src/App.tsx` to register the new routes**

First, read the current `App.tsx` to find the `<Routes>` block. Locate the line that defines the existing `<Route path="/dfir" element={<DFIR />} />` and the import that pulls `DFIR` from `./pages`.

Apply two edits:

**7a. Add lazy imports** at the top of the file, alongside the existing `import { Home, About, ... } from './pages';` line. After that line, add:

```tsx
const IocCheckPlaceholder = lazy(() => import('./pages/dfir/IocCheckPlaceholder'));
const PhishingPlaceholder = lazy(() => import('./pages/dfir/PhishingPlaceholder'));
const DomainPlaceholder = lazy(() => import('./pages/dfir/DomainPlaceholder'));
const ExposurePlaceholder = lazy(() => import('./pages/dfir/ExposurePlaceholder'));
const FilePlaceholder = lazy(() => import('./pages/dfir/FilePlaceholder'));
const WikiPlaceholder = lazy(() => import('./pages/dfir/WikiPlaceholder'));
const DashboardPlaceholder = lazy(() => import('./pages/dfir/DashboardPlaceholder'));
```

`lazy` is already imported from React at the top of `App.tsx`. If not, add it: `import { useEffect, Suspense, lazy } from 'react';`.

**7b. Insert the new `<Route>` elements** immediately after the existing `<Route path="/dfir" element={<DFIR />} />`:

```tsx
<Route
  path="/dfir/ioc-check"
  element={<Suspense fallback={<SectionLoader />}><IocCheckPlaceholder /></Suspense>}
/>
<Route
  path="/dfir/phishing"
  element={<Suspense fallback={<SectionLoader />}><PhishingPlaceholder /></Suspense>}
/>
<Route
  path="/dfir/domain"
  element={<Suspense fallback={<SectionLoader />}><DomainPlaceholder /></Suspense>}
/>
<Route
  path="/dfir/exposure"
  element={<Suspense fallback={<SectionLoader />}><ExposurePlaceholder /></Suspense>}
/>
<Route
  path="/dfir/file"
  element={<Suspense fallback={<SectionLoader />}><FilePlaceholder /></Suspense>}
/>
<Route
  path="/dfir/wiki"
  element={<Suspense fallback={<SectionLoader />}><WikiPlaceholder /></Suspense>}
/>
<Route
  path="/dfir/dashboard"
  element={<Suspense fallback={<SectionLoader />}><DashboardPlaceholder /></Suspense>}
/>
```

- [ ] **Step 8: Run the placeholder tests, expect green**

```bash
cd /Users/pranith/Documents/portfolio && npm test -- --run DfirRoutes
```

Expected: 7 tests pass.

- [ ] **Step 9: Run the full test suite to confirm no regression**

```bash
npm test -- --run
```

Expected: all existing tests still pass.

- [ ] **Step 10: Run lint and build**

```bash
npm run lint
npm run build
```

Expected: lint reports 0 errors, build completes.

- [ ] **Step 11: Manual smoke test**

```bash
npm run dev
```

Visit each new route in the browser:

- `http://localhost:5173/dfir/ioc-check`
- `http://localhost:5173/dfir/phishing`
- `http://localhost:5173/dfir/domain`
- `http://localhost:5173/dfir/exposure`
- `http://localhost:5173/dfir/file`
- `http://localhost:5173/dfir/wiki`
- `http://localhost:5173/dfir/dashboard`

Each should render the heading + "Coming soon" message + back link. Check the back link returns to `/dfir`. Stop the dev server.

- [ ] **Step 12: Commit**

```bash
cd /Users/pranith/Documents/portfolio
git add src/App.tsx src/pages/dfir/ src/components/__tests__/DfirRoutes.test.tsx
git commit -m "feat(dfir): add /dfir/* placeholder routes with smoke tests"
```

---

## Task 9: Cross-link new routes from existing DFIR landing

**Goal:** make the new sub-routes discoverable from the existing `/dfir` page so a user clicking around finds them. Minimal addition; full nav redesign is Phase 2 work.

**Files:**

- Modify: `src/pages/DFIR.tsx` (add a small "Tools" grid linking to sub-routes)

- [ ] **Step 1: Read the existing DFIR.tsx to find a good insertion point**

```bash
sed -n '1,80p' /Users/pranith/Documents/portfolio/src/pages/DFIR.tsx
```

Identify the location near the top of the rendered tree, after `<Breadcrumbs ... />`, where a "Tools" section can be inserted without disturbing the existing tab interface.

- [ ] **Step 2: Insert a `ToolGrid` element (dfir-lab.ch aesthetic, scoped)**

The existing `DFIR.tsx` lives within the portfolio's existing visual language. The new `ToolGrid` introduces the new dfir-lab-style cards as a single bridging block — dark cards on the existing page background. Phase 2 will fully migrate `/dfir` to the dark shell from spec §12.3; for now, isolated styling keeps regressions contained.

In `src/pages/DFIR.tsx`, near the existing imports add (if not already present):

```tsx
import { Link } from 'react-router-dom';
```

Then add this near the top of the file, after the existing imports:

```tsx
const dfirTools = [
  { path: '/dfir/ioc-check', label: 'IOC Checker', desc: 'IPs · domains · URLs · hashes', icon: Hash },
  { path: '/dfir/phishing', label: 'Phishing Analyzer', desc: 'Email headers + content', icon: ShieldAlert },
  { path: '/dfir/domain', label: 'Domain Lookup', desc: 'WHOIS · DNS · SSL', icon: Globe },
  { path: '/dfir/exposure', label: 'Exposure Scanner', desc: 'Subdomains + open ports', icon: Radar },
  { path: '/dfir/file', label: 'File Analyzer', desc: 'Hash-based lookups', icon: FileSearch },
  { path: '/dfir/wiki', label: 'Knowledge Base', desc: 'Concepts + playbooks', icon: FileText },
  { path: '/dfir/dashboard', label: 'Recent Lookups', desc: 'Your last 20 queries', icon: Clock },
];

function ToolGrid(): JSX.Element {
  return (
    <section className="my-10 rounded-2xl bg-[#0a0a0a] p-6 sm:p-8 border border-[#1f1f23]">
      <header className="flex items-baseline justify-between mb-6">
        <h2 className="text-xl font-display font-bold text-[#fafafa]">DFIR Tools</h2>
        <span className="text-xs font-mono text-[#a1a1aa]">7 tools · live in phase 2</span>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {dfirTools.map(({ path, label, desc, icon: Icon }) => (
          <Link
            key={path}
            to={path}
            className="group block rounded-lg border border-[#1f1f23] bg-[#111113] p-4 hover:border-[#00fff9]/40 hover:bg-[#161618] transition-colors"
          >
            <div className="flex items-center gap-3 mb-2">
              <Icon size={18} className="text-[#00fff9]" aria-hidden="true" />
              <span className="font-semibold text-[#fafafa] group-hover:text-[#00fff9] transition-colors">{label}</span>
            </div>
            <p className="text-sm font-mono text-[#a1a1aa] leading-relaxed">{desc}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

All icons used (`Hash`, `ShieldAlert`, `Globe`, `Radar`, `FileSearch`, `FileText`, `Clock`) are already imported in `DFIR.tsx` — verify this in the existing import block. If any are missing, add them to the existing `lucide-react` import.

Render `<ToolGrid />` once near the top of the JSX returned by `DFIR`, just below `<Breadcrumbs />`. The hard-coded hex values match spec §12.1 and will be promoted to Tailwind tokens in Phase 2.

- [ ] **Step 3: Run tests**

```bash
cd /Users/pranith/Documents/portfolio && npm test -- --run
```

Expected: all pass.

- [ ] **Step 4: Lint + build**

```bash
npm run lint && npm run build
```

Expected: clean.

- [ ] **Step 5: Manual smoke test**

```bash
npm run dev
```

Visit `http://localhost:5173/dfir`. Verify the tool grid renders with all 7 cards and each link navigates to the corresponding placeholder page. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
cd /Users/pranith/Documents/portfolio
git add src/pages/DFIR.tsx
git commit -m "feat(dfir): cross-link new sub-routes from DFIR landing page"
```

---

## Task 10: Push branch + final verification

- [ ] **Step 1: Push the branch**

```bash
cd /Users/pranith/Documents/portfolio
git push -u origin feature/dfir-integration
```

- [ ] **Step 2: Build and check bundle delta vs baseline (Task 2 Step 4)**

```bash
npm run build
```

Compare the printed bundle sizes to the baseline. New JS for the placeholder pages should add < 5KB gzipped each (lazy chunks). Total `dist/assets/index-*.js` should not grow by more than ~20KB. If it grew more, investigate before merging.

- [ ] **Step 3: Verify production API health one more time**

```bash
curl -s https://pranithjain.qzz.io/api/v1/health
```

Expected: `{"ok":true}`.

- [ ] **Step 4: Verify production SPA still works**

```bash
curl -s https://pranithjain.qzz.io/ -o /dev/null -w '%{http_code}\n'
```

Expected: `200`.

- [ ] **Step 5: Stop. Hand back to user for review before merging to `main` and before starting Plan 2 (Phase 2 — Provider Adapters + IOC Tool).**

---

## Phase exit criteria — all must be true

- [ ] `feature/dfir-integration` branch pushed
- [ ] `pranithjain.qzz.io/api/v1/health` returns `{"ok": true}` (production)
- [ ] All 7 `/dfir/*` placeholder routes render in production preview / dev
- [ ] All existing portfolio tests still pass
- [ ] Build size budget respected
- [ ] `docs/dfir-legacy/` contains the FastAPI reference and original plan
- [ ] No secrets committed to git

---

## Notes for Phase 2 (next plan, not now)

When this plan completes, the next plan (`2026-05-07-phase-2-providers-ioc-tool.md`) will:

1. Set the threat-intel API secrets via `wrangler secret put` (VT, AbuseIPDB, GreyNoise minimum for Phase 2 acceptance)
2. Port `docs/dfir-legacy/api-reference/providers.py` into TypeScript Worker modules
3. Build the IOC checker UI replacing `IocCheckPlaceholder.tsx`
4. Add SSE streaming and KV cache logic

Do not start Phase 2 until this plan's exit criteria are met and the user has reviewed.
