# deepdarkCTI Dark-Web Source Index — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated `/threatintel/deepdarkcti` page backed by a runtime fetch+parse of 18 `fastfire/deepdarkCTI` markdown source-list files.

**Architecture:** A pure parser module (`deepdarkcti-parser.ts`) turns each file's markdown table into normalized `DDCEntry[]`. A route (`deepdarkcti.ts`, modeled on `detection-rules.ts`) fetches all 18 files in parallel, caches 12h in Cache API, keeps per-file last-good in KV (48h), and isolates per-file failures. A new React page renders a searchable/filterable index; onion entries are copy-only.

**Tech Stack:** Cloudflare Workers, TypeScript, Hono, Vitest (`@cloudflare/vitest-pool-workers`), React 18 + React Router + Tailwind.

**Spec:** `docs/superpowers/specs/2026-05-15-deepdarkcti-integration-design.md`

**Branch note:** This is independent of the AF work. Recommend implementing on a new branch off `main` (e.g. `feat/deepdarkcti`). The spec commit currently lives on `feat/andreafortuna-cti-feeds`; cherry-pick `0e5a09c` onto the new branch first, or branch from it. The controller will decide branch setup before dispatch.

---

## File Structure

**Create:**

- `api/src/lib/deepdarkcti-parser.ts` — types, per-file config, pure `parseDDCFile`
- `api/test/lib/deepdarkcti-parser.test.ts` — parser unit tests
- `api/src/routes/deepdarkcti.ts` — fetch orchestration, KV last-good, cache, handler
- `api/test/routes/deepdarkcti.test.ts` — route integration tests (stubbed fetch)
- `src/pages/threatintel/DeepDarkCTI.tsx` — frontend page

**Modify:**

- `api/src/index.ts` — register `GET /api/v1/deepdarkcti` (worker/index.ts delegates here; no separate worker registration needed)
- `api/src/routes/feed-status.ts` — add `deepdarkcti` probe row + bump cache version
- `src/App.tsx` — lazy import + route
- `src/pages/threatintel/Home.tsx` — add tile under "Curated Catalogs"

**Working dir:** repo root `/Users/pranith/Documents/portfolio`. API tests: `cd api && npx vitest run <path>`. Frontend: `npm run lint` / `npm run build` from root.

---

## Task 1: Parser module (TDD)

**Files:**

- Create: `api/src/lib/deepdarkcti-parser.ts`
- Create: `api/test/lib/deepdarkcti-parser.test.ts`

- [ ] **Step 1: Write the failing parser tests**

Create `api/test/lib/deepdarkcti-parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseDDCFile, DDC_FILES, PER_FILE_CAP, type DDCFileConfig } from '../../src/lib/deepdarkcti-parser';

const cfg = (file: string): DDCFileConfig => {
  const c = DDC_FILES.find((f) => f.file === file);
  if (!c) throw new Error(`no config for ${file}`);
  return c;
};

describe('DDC_FILES config', () => {
  it('covers exactly the 18 in-scope files', () => {
    expect(DDC_FILES).toHaveLength(18);
    expect(DDC_FILES.map((f) => f.file)).toContain('ransomware_gang.md');
    expect(DDC_FILES.map((f) => f.file)).not.toContain('cve_most_exploited.md');
    expect(DDC_FILES.map((f) => f.file)).not.toContain('methods.md');
  });
});

describe('parseDDCFile — link-first', () => {
  const md = [
    '|Name|Status|Description|',
    '| ------ | ------ | ------ |',
    '|[0x00sec](https://0x00sec.org/)| ONLINE | A forum |',
    '|[DarkMkt](http://abcdefghijklmnop234567.onion/index.php)|OFFLINE||',
    '|broken row no link|ONLINE||',
  ].join('\n');

  it('extracts name+url from the markdown link, scans status, builds notes', () => {
    const out = parseDDCFile(md, cfg('forum.md'));
    expect(out).toHaveLength(2); // broken row skipped
    expect(out[0]).toEqual({
      name: '0x00sec',
      url: 'https://0x00sec.org/',
      onion: false,
      status: 'online',
      category: 'Criminal Forums',
      source_file: 'forum.md',
      notes: 'A forum',
    });
  });

  it('detects onion + offline status', () => {
    const out = parseDDCFile(md, cfg('forum.md'));
    expect(out[1]!.onion).toBe(true);
    expect(out[1]!.status).toBe('offline');
    expect(out[1]!.notes).toBeUndefined();
  });
});

describe('parseDDCFile — raw-url-first (infostealer)', () => {
  const md = [
    '|Telegram|Status|Name|',
    '| ------ | ------ | ------ |',
    '|https://t.me/berserklogs|ONLINE|Redline Stealer|',
    '|not-a-url|VALID|junk|',
  ].join('\n');

  it('uses cell0 as url and nameCol for the name; skips non-url rows', () => {
    const out = parseDDCFile(md, cfg('telegram_infostealer.md'));
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      name: 'Redline Stealer',
      url: 'https://t.me/berserklogs',
      onion: false,
      status: 'online',
      category: 'Infostealer Telegram',
      source_file: 'telegram_infostealer.md',
    });
  });
});

describe('parseDDCFile — raw-url-first actor (telegram_threat_actors)', () => {
  const md = [
    '|Telegram|Status|Threat Actor Name|Type of attacks|',
    '|------|------|------|------|',
    '|https://t.me/+B3LXsqUjJcs4ZGI0|EXPIRED|NoName057(16)|DDoS|',
    '|https://t.me/+xy|VALID||',
  ].join('\n');

  it('captures actor + attack_type structured fields', () => {
    const out = parseDDCFile(md, cfg('telegram_threat_actors.md'));
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      name: 'NoName057(16)',
      url: 'https://t.me/+B3LXsqUjJcs4ZGI0',
      onion: false,
      status: 'expired',
      category: 'Threat-Actor Telegram',
      source_file: 'telegram_threat_actors.md',
      actor: 'NoName057(16)',
      attack_type: 'DDoS',
    });
  });

  it('falls back to URL last-segment when actor name is blank', () => {
    const out = parseDDCFile(md, cfg('telegram_threat_actors.md'));
    expect(out[1]!.name).toBe('+xy');
    expect(out[1]!.actor).toBeUndefined();
  });
});

describe('parseDDCFile — raw-url-first actor (twitter_threat_actors)', () => {
  const md = [
    '|Link| Description | Category | Status |',
    '| ------ | ------ | ------ | ------ |',
    '|https://x.com/lockbitsupp| LockBit | Ransomware | |',
    '|https://x.com/DarkstormTeam1| Dark Storm | DDoS | OFFLINE |',
  ].join('\n');

  it('maps Description→actor, Category→attack_type, scans Status anywhere', () => {
    const out = parseDDCFile(md, cfg('twitter_threat_actors.md'));
    expect(out[0]).toEqual({
      name: 'LockBit',
      url: 'https://x.com/lockbitsupp',
      onion: false,
      status: 'unknown',
      category: 'Threat-Actor Twitter',
      source_file: 'twitter_threat_actors.md',
      actor: 'LockBit',
      attack_type: 'Ransomware',
    });
    expect(out[1]!.status).toBe('offline');
  });
});

describe('parseDDCFile — caps + edge cases', () => {
  it(`caps at PER_FILE_CAP (${PER_FILE_CAP})`, () => {
    const rows = Array.from({ length: PER_FILE_CAP + 25 }, (_, i) => `|[s${i}](https://s${i}.example.com)|ONLINE||`);
    const md = ['|Name|Status|Description|', '|---|---|---|', ...rows].join('\n');
    expect(parseDDCFile(md, cfg('forum.md'))).toHaveLength(PER_FILE_CAP);
  });

  it('returns [] for content with a header but no data rows', () => {
    expect(parseDDCFile('|Name|Status|\n|---|---|', cfg('search_engines.md'))).toEqual([]);
  });

  it('returns [] for empty / non-table content', () => {
    expect(parseDDCFile('', cfg('forum.md'))).toEqual([]);
    expect(parseDDCFile('just prose, no pipes', cfg('forum.md'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd api && npx vitest run test/lib/deepdarkcti-parser.test.ts
```

Expected: FAIL — `Cannot find module '../../src/lib/deepdarkcti-parser'`.

- [ ] **Step 3: Implement the parser module**

Create `api/src/lib/deepdarkcti-parser.ts`:

```ts
export type DDCStatus = 'online' | 'offline' | 'valid' | 'expired' | 'unknown';

export interface DDCEntry {
  name: string;
  url: string;
  onion: boolean;
  status: DDCStatus;
  category: string;
  source_file: string;
  notes?: string;
  actor?: string;
  attack_type?: string;
}

export interface DDCFileConfig {
  file: string;
  label: string;
  shape: 'link-first' | 'raw-url-first';
  /** raw-url-first: 0-based column holding the display name. */
  nameCol?: number;
  /** raw-url-first actor files: 0-based columns for actor + attack type. */
  actorCol?: number;
  attackTypeCol?: number;
}

export const PER_FILE_CAP = 500;

export const DDC_FILES: DDCFileConfig[] = [
  { file: 'ransomware_gang.md', label: 'Ransomware Gangs', shape: 'link-first' },
  {
    file: 'telegram_threat_actors.md',
    label: 'Threat-Actor Telegram',
    shape: 'raw-url-first',
    nameCol: 2,
    actorCol: 2,
    attackTypeCol: 3,
  },
  { file: 'telegram_infostealer.md', label: 'Infostealer Telegram', shape: 'raw-url-first', nameCol: 2 },
  { file: 'forum.md', label: 'Criminal Forums', shape: 'link-first' },
  { file: 'markets.md', label: 'Dark Markets', shape: 'link-first' },
  { file: 'search_engines.md', label: 'Dark-Web Search Engines', shape: 'link-first' },
  { file: 'phishing.md', label: 'Phishing Resources', shape: 'link-first' },
  { file: 'maas.md', label: 'Malware-as-a-Service', shape: 'link-first' },
  { file: 'rat.md', label: 'RAT Tooling', shape: 'link-first' },
  { file: 'exploits.md', label: 'Exploit Sources', shape: 'link-first' },
  { file: 'malware_samples.md', label: 'Malware Sample Repos', shape: 'link-first' },
  { file: 'discord.md', label: 'Discord Servers', shape: 'link-first' },
  { file: 'twitter.md', label: 'Researcher Twitter', shape: 'raw-url-first', nameCol: 1 },
  {
    file: 'twitter_threat_actors.md',
    label: 'Threat-Actor Twitter',
    shape: 'raw-url-first',
    nameCol: 1,
    actorCol: 1,
    attackTypeCol: 2,
  },
  { file: 'counterfeit_goods.md', label: 'Counterfeit Goods', shape: 'link-first' },
  { file: 'commercial_services.md', label: 'Commercial CTI Services', shape: 'link-first' },
  { file: 'defacement.md', label: 'Defacement Archives', shape: 'link-first' },
  { file: 'others.md', label: 'Other Sources', shape: 'link-first' },
];

const STATUS_TOKENS = new Set<DDCStatus>(['online', 'offline', 'valid', 'expired']);
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/;

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function isOnion(url: string): boolean {
  return /\.onion(?:[/:?#]|$)/i.test(url);
}

function lastSegment(url: string): string {
  const m = url.replace(/\/+$/, '').match(/\/([^/]+)$/);
  return m ? m[1]! : url;
}

/** Split a markdown table row on `|`, dropping the two bounding-pipe empties. */
function splitRow(line: string): string[] {
  const parts = line.split('|');
  if (parts.length && parts[0]!.trim() === '') parts.shift();
  if (parts.length && parts[parts.length - 1]!.trim() === '') parts.pop();
  return parts.map((c) => c.trim());
}

function isSeparator(line: string): boolean {
  return /^\|?[\s:-]*-{2,}[\s|:-]*$/.test(line.trim()) && line.includes('-');
}

export function parseDDCFile(content: string, cfg: DDCFileConfig): DDCEntry[] {
  const lines = content.split(/\r?\n/);
  let i = 0;
  // Find the header (first pipe line).
  while (i < lines.length && !lines[i]!.trim().startsWith('|')) i++;
  if (i >= lines.length) return [];
  i++; // consume header
  // Consume the separator line if present.
  if (i < lines.length && isSeparator(lines[i]!)) i++;

  const out: DDCEntry[] = [];
  for (; i < lines.length && out.length < PER_FILE_CAP; i++) {
    const raw = lines[i]!;
    if (!raw.trim().startsWith('|')) continue;
    const cells = splitRow(raw);
    if (cells.length === 0) continue;

    let name = '';
    let url = '';
    const consumed = new Set<number>();

    if (cfg.shape === 'link-first') {
      const m = cells[0]!.match(LINK_RE);
      if (m) {
        name = m[1]!.trim();
        url = m[2]!.trim();
      } else if (isUrl(cells[0]!)) {
        url = cells[0]!.trim();
        try {
          name = new URL(url).host;
        } catch {
          name = url;
        }
      } else {
        continue; // no link → skip row
      }
      consumed.add(0);
    } else {
      if (!isUrl(cells[0]!)) continue;
      url = cells[0]!.trim();
      consumed.add(0);
      const nameIdx = cfg.actorCol ?? cfg.nameCol;
      const nm = nameIdx != null ? (cells[nameIdx] ?? '').trim() : '';
      name = nm || lastSegment(url);
    }

    // Status: scan every cell for a recognized token (first match wins).
    let status: DDCStatus = 'unknown';
    for (let k = 0; k < cells.length; k++) {
      const tok = cells[k]!.trim().toLowerCase();
      if (STATUS_TOKENS.has(tok as DDCStatus)) {
        status = tok as DDCStatus;
        consumed.add(k);
        break;
      }
    }

    const entry: DDCEntry = {
      name,
      url,
      onion: isOnion(url),
      status,
      category: cfg.label,
      source_file: cfg.file,
    };

    if (cfg.actorCol != null) {
      const a = (cells[cfg.actorCol] ?? '').trim();
      if (a) {
        entry.actor = a;
        consumed.add(cfg.actorCol);
      }
    }
    if (cfg.attackTypeCol != null) {
      const at = (cells[cfg.attackTypeCol] ?? '').trim();
      if (at) {
        entry.attack_type = at;
        consumed.add(cfg.attackTypeCol);
      }
    }
    if (cfg.nameCol != null) consumed.add(cfg.nameCol);

    const notes = cells
      .filter((_, k) => !consumed.has(k))
      .map((c) => c.trim())
      .filter(Boolean)
      .join(' · ');
    if (notes) entry.notes = notes;

    out.push(entry);
  }
  return out;
}
```

- [ ] **Step 4: Run the test, verify pass**

```bash
cd api && npx vitest run test/lib/deepdarkcti-parser.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Typecheck**

```bash
cd api && npm run typecheck
```

Expected: PASS (pre-existing unrelated errors, if any, are acceptable; no NEW errors from these two files).

- [ ] **Step 6: Commit**

```bash
git add api/src/lib/deepdarkcti-parser.ts api/test/lib/deepdarkcti-parser.test.ts
git commit -m "feat(deepdarkcti): add markdown table parser + per-file config"
```

---

## Task 2: Route — fetch orchestration + KV last-good (TDD)

**Files:**

- Create: `api/src/routes/deepdarkcti.ts`
- Create: `api/test/routes/deepdarkcti.test.ts`
- Modify: `api/src/index.ts`

- [ ] **Step 1: Inspect how `detection-rules` is registered**

```bash
cd api && grep -n "detectionRulesHandler\|detection-rules" src/index.ts
```

Note the import line and the `app.get(...)` line — you'll mirror this exactly for deepdarkcti.

- [ ] **Step 2: Write the failing route test**

Create `api/test/routes/deepdarkcti.test.ts`:

```ts
import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const FORUM_MD = [
  '|Name|Status|Description|',
  '|---|---|---|',
  '|[0x00sec](https://0x00sec.org/)|ONLINE|A forum|',
].join('\n');

describe('GET /api/v1/deepdarkcti', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(globalThis, 'fetch');
    // Any deepdarkCTI raw URL → forum fixture; everything else → 404.
    spy.mockImplementation(async (input: RequestInfo | URL) => {
      const u = String(input instanceof Request ? input.url : input);
      if (u.includes('raw.githubusercontent.com/fastfire/deepdarkCTI')) {
        return new Response(FORUM_MD, { status: 200, headers: { 'content-type': 'text/plain' } });
      }
      return new Response('not found', { status: 404 });
    });
  });

  afterEach(() => spy.mockRestore());

  it('returns assembled response with per-file sources + categories', async () => {
    const res = await SELF.fetch('https://example.com/api/v1/deepdarkcti?cb=' + Date.now());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sources: Array<{ source_file: string; ok: boolean; count: number }>;
      categories: Array<{ id: string; label: string; count: number }>;
      total: number;
      entries: Array<{ name: string; url: string; category: string }>;
    };
    expect(body.sources.length).toBe(18);
    expect(body.sources.every((s) => s.ok)).toBe(true);
    expect(body.total).toBeGreaterThan(0);
    expect(body.entries.some((e) => e.url === 'https://0x00sec.org/')).toBe(true);
    expect(body.categories.some((c) => c.label === 'Criminal Forums')).toBe(true);
  });

  it('isolates a failing file: ok:false for it, others still parse', async () => {
    spy.mockImplementation(async (input: RequestInfo | URL) => {
      const u = String(input instanceof Request ? input.url : input);
      if (u.includes('/forum.md')) return new Response('boom', { status: 500 });
      if (u.includes('raw.githubusercontent.com/fastfire/deepdarkCTI')) {
        return new Response(FORUM_MD, { status: 200 });
      }
      return new Response('nf', { status: 404 });
    });
    const res = await SELF.fetch('https://example.com/api/v1/deepdarkcti?cb=' + Date.now());
    const body = (await res.json()) as { sources: Array<{ source_file: string; ok: boolean }> };
    const forum = body.sources.find((s) => s.source_file === 'forum.md');
    expect(forum!.ok).toBe(false);
    expect(body.sources.filter((s) => s.ok).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the test, verify it fails**

```bash
cd api && npx vitest run test/routes/deepdarkcti.test.ts
```

Expected: FAIL — 404 (route not registered).

- [ ] **Step 4: Implement the route**

Create `api/src/routes/deepdarkcti.ts`:

```ts
import type { Context } from 'hono';
import type { Env } from '../env';
import { DDC_FILES, parseDDCFile, type DDCEntry, type DDCFileConfig } from '../lib/deepdarkcti-parser';

/** Exported so /api/v1/feed-status can read the same cached payload directly. */
export const DEEPDARKCTI_CACHE_KEY = 'https://deepdarkcti-cache.internal/v1';
const CACHE_KEY = DEEPDARKCTI_CACHE_KEY;
const CACHE_TTL_SECONDS = 12 * 60 * 60;
const DEGRADED_TTL_SECONDS = 60;
const FETCH_TIMEOUT_MS = 10_000;
const LASTGOOD_TTL_SECONDS = 48 * 60 * 60;
const RAW_BASE = 'https://raw.githubusercontent.com/fastfire/deepdarkCTI/main';

interface DDCFileResult {
  source_file: string;
  ok: boolean;
  count: number;
  total_seen: number;
  stale?: boolean;
}

interface DDCResponse {
  generated_at: string;
  sources: DDCFileResult[];
  categories: Array<{ id: string; label: string; count: number }>;
  total: number;
  entries: DDCEntry[];
}

interface LastGoodSlice {
  entries: DDCEntry[];
  refreshed_at: string;
}

function lastGoodKey(file: string): string {
  return `ddc/${file}-lastgood/v1`;
}

async function fetchFile(cfg: DDCFileConfig): Promise<string | null> {
  try {
    const res = await fetch(`${RAW_BASE}/${cfg.file}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: 'text/plain, */*' },
      cf: { cacheTtl: CACHE_TTL_SECONDS, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function resolveFile(
  cfg: DDCFileConfig,
  kv: KVNamespace | undefined,
  executionCtx?: { waitUntil: (p: Promise<unknown>) => void }
): Promise<{ entries: DDCEntry[]; result: DDCFileResult }> {
  const text = await fetchFile(cfg);
  let entries: DDCEntry[] = [];
  let ok = false;
  if (text) {
    entries = parseDDCFile(text, cfg);
    ok = entries.length > 0;
  }

  if (ok) {
    if (kv) {
      const payload: LastGoodSlice = { entries, refreshed_at: new Date().toISOString() };
      const put = kv.put(lastGoodKey(cfg.file), JSON.stringify(payload), {
        expirationTtl: LASTGOOD_TTL_SECONDS,
      });
      if (executionCtx) executionCtx.waitUntil(put);
      else void put;
    }
    return {
      entries,
      result: { source_file: cfg.file, ok: true, count: entries.length, total_seen: entries.length },
    };
  }

  // Failed/empty → restore last-good if present.
  if (kv) {
    try {
      const rawLg = await kv.get(lastGoodKey(cfg.file));
      if (rawLg) {
        const lg = JSON.parse(rawLg) as LastGoodSlice;
        if (Array.isArray(lg.entries) && lg.entries.length > 0) {
          return {
            entries: lg.entries,
            result: {
              source_file: cfg.file,
              ok: false,
              count: lg.entries.length,
              total_seen: lg.entries.length,
              stale: true,
            },
          };
        }
      }
    } catch {
      /* fall through */
    }
  }
  return { entries: [], result: { source_file: cfg.file, ok: false, count: 0, total_seen: 0 } };
}

export async function buildDeepDarkCti(
  kv: KVNamespace | undefined,
  executionCtx?: { waitUntil: (p: Promise<unknown>) => void }
): Promise<DDCResponse> {
  const resolved = await Promise.all(DDC_FILES.map((c) => resolveFile(c, kv, executionCtx)));
  const entries = resolved.flatMap((r) => r.entries);
  const sources = resolved.map((r) => r.result);

  const catMap = new Map<string, number>();
  for (const e of entries) catMap.set(e.category, (catMap.get(e.category) ?? 0) + 1);
  const categories = DDC_FILES.filter((f) => catMap.has(f.label)).map((f) => ({
    id: f.file.replace(/\.md$/, ''),
    label: f.label,
    count: catMap.get(f.label) ?? 0,
  }));

  entries.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  return {
    generated_at: new Date().toISOString(),
    sources,
    categories,
    total: entries.length,
    entries,
  };
}

function ttlFor(body: DDCResponse): number {
  const anyHardFail = body.sources.some((s) => !s.ok && !s.stale);
  return anyHardFail ? DEGRADED_TTL_SECONDS : CACHE_TTL_SECONDS;
}

export async function deepDarkCtiHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) return cached;

  const body = await buildDeepDarkCti(c.env.KV_CACHE, c.executionCtx);
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${ttlFor(body)}`,
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
```

- [ ] **Step 5: Register the route in `api/src/index.ts`**

Add the import next to the `detection-rules` import:

```ts
import { deepDarkCtiHandler } from './routes/deepdarkcti';
```

Add the route next to `app.get('/api/v1/rules', detectionRulesHandler);`:

```ts
app.get('/api/v1/deepdarkcti', deepDarkCtiHandler);
```

- [ ] **Step 6: Run the test, verify pass**

```bash
cd api && npx vitest run test/routes/deepdarkcti.test.ts
```

Expected: PASS (both tests).

> ⚠️ If the first test fails because the cached response from a prior run is served, note the test already appends `?cb=`+Date.now() — but the route's Cache-API key is the fixed internal `CACHE_KEY`, not the request URL, so a warm cache from the first test can bleed into the second. If the second test sees stale data, add `await caches.default.delete(new Request(DEEPDARKCTI_CACHE_KEY))` at the top of the second test (import `caches` is global in the workers pool). Only add this if the failure actually manifests.

- [ ] **Step 7: Typecheck**

```bash
cd api && npm run typecheck
```

Expected: PASS (no new errors).

- [ ] **Step 8: Commit**

```bash
git add api/src/routes/deepdarkcti.ts api/test/routes/deepdarkcti.test.ts api/src/index.ts
git commit -m "feat(deepdarkcti): add route with parallel fetch + KV last-good"
```

---

## Task 3: Feed-status probe row

**Files:**

- Modify: `api/src/routes/feed-status.ts`

- [ ] **Step 1: Find the probe array + the cache-version constant**

```bash
cd api && grep -n "FEED_STATUS_CACHE_KEY\|cache_key:\|FeedProbeSpec\|DETECTION_RULES_CACHE_KEY" src/routes/feed-status.ts | head
```

Note: the import block, the probe-spec array, and the `FEED_STATUS_CACHE_KEY` line.

- [ ] **Step 2: Add the import**

Next to the other `*_CACHE_KEY` imports at the top of `feed-status.ts`:

```ts
import { DEEPDARKCTI_CACHE_KEY } from './deepdarkcti';
```

- [ ] **Step 3: Add the probe spec**

Append to the probe-spec array (match the existing entry shape — adjust property names to whatever the array actually uses; the AF feed-status rows added earlier in `f4849ca`/cherry-picked `4cf8e83` are a working precedent to copy):

```ts
{
  id: 'deepdarkcti',
  label: 'deepdarkCTI Index',
  page_path: '/threatintel/deepdarkcti',
  api_path: '/api/v1/deepdarkcti',
  cache_key: DEEPDARKCTI_CACHE_KEY,
  evaluate: (body) => {
    const b = body as {
      sources?: Array<{ ok?: boolean; stale?: boolean }>;
      total?: number;
    };
    if (!b || !Array.isArray(b.sources)) {
      return { status: 'cold' as const, reason: 'no cached payload (visit the page once to warm the cache)' };
    }
    const total = b.total ?? 0;
    const files = b.sources.length;
    if (total === 0) return { status: 'down' as const, reason: 'all sources empty' };
    const anyStale = b.sources.some((s) => s.stale);
    const anyHardFail = b.sources.some((s) => !s.ok && !s.stale);
    if (anyHardFail || anyStale) {
      return {
        status: 'degraded' as const,
        reason: anyStale ? 'serving stale slices (last-good)' : 'some sources failed',
        metrics: { files, entries: total },
      };
    }
    return { status: 'ok' as const, reason: `${total} entries`, metrics: { files, entries: total } };
  },
},
```

- [ ] **Step 4: Bump the feed-status cache version**

Find the `FEED_STATUS_CACHE_KEY` line (currently ends `v3-af-feeds` on the AF branch, or `v2-cachereads` if branched fresh from main). Bump its trailing version token, e.g. append `-ddc`:

```ts
const FEED_STATUS_CACHE_KEY = 'https://feed-status-cache.internal/v4-ddc';
```

(Use whatever the current value is + a new suffix; the point is a fresh key so the new row surfaces immediately.)

- [ ] **Step 5: Typecheck + smoke the route tests**

```bash
cd api && npm run typecheck && npx vitest run test/routes/deepdarkcti.test.ts
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/feed-status.ts
git commit -m "feat(feed-status): add deepdarkcti probe row"
```

---

## Task 4: Frontend page + route + Home tile

**Files:**

- Create: `src/pages/threatintel/DeepDarkCTI.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/threatintel/Home.tsx`

- [ ] **Step 1: Create the page component**

Create `src/pages/threatintel/DeepDarkCTI.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, Globe, Search, ShieldAlert } from 'lucide-react';

interface DDCEntry {
  name: string;
  url: string;
  onion: boolean;
  status: 'online' | 'offline' | 'valid' | 'expired' | 'unknown';
  category: string;
  source_file: string;
  notes?: string;
  actor?: string;
  attack_type?: string;
}

interface DDCResponse {
  generated_at: string;
  sources: Array<{ source_file: string; ok: boolean; count: number; total_seen: number; stale?: boolean }>;
  categories: Array<{ id: string; label: string; count: number }>;
  total: number;
  entries: DDCEntry[];
}

const STATUS_STYLE: Record<DDCEntry['status'], string> = {
  online: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  valid: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  offline: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  expired: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  unknown: 'border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-400',
};

export default function DeepDarkCTI(): JSX.Element {
  const [data, setData] = useState<DDCResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [hideDown, setHideDown] = useState(true);
  const [onionOnly, setOnionOnly] = useState<'all' | 'onion' | 'clearnet'>('all');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/v1/deepdarkcti')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: DDCResponse) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.entries.filter((e) => {
      if (cat !== 'all' && e.category !== cat) return false;
      if (hideDown && (e.status === 'offline' || e.status === 'expired')) return false;
      if (onionOnly === 'onion' && !e.onion) return false;
      if (onionOnly === 'clearnet' && e.onion) return false;
      if (!q) return true;
      return `${e.name} ${e.notes ?? ''} ${e.actor ?? ''} ${e.attack_type ?? ''}`.toLowerCase().includes(q);
    });
  }, [data, query, cat, hideDown, onionOnly]);

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(text);
    window.setTimeout(() => setCopied((c) => (c === text ? null : c)), 1200);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl flex items-center gap-2">
          <Globe size={22} className="text-brand-600 dark:text-brand-400" />
          deepdarkCTI Index
        </h1>
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1">
          Parsed mirror of{' '}
          <a
            href="https://github.com/fastfire/deepdarkCTI"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            fastfire/deepdarkCTI
          </a>{' '}
          — ransomware leak sites, dark markets, criminal forums, infostealer & threat-actor channels. Onion addresses
          are copy-only (clearnet browsers can't open <code>.onion</code>).
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 font-mono text-sm text-rose-700 dark:text-rose-300">
          Failed to load: {error}
        </div>
      )}

      {data && data.total === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center font-mono text-sm text-slate-500">
          deepdarkCTI temporarily unavailable — upstream fetch failed and no cached copy exists yet.
        </div>
      )}

      {data && data.total > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, notes, actor…"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                aria-label="Search deepdarkCTI"
              />
            </div>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white py-2 px-3 font-mono text-[12px] dark:border-slate-800 dark:bg-slate-900"
              aria-label="Category filter"
            >
              <option value="all">All categories ({data.total})</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.label}>
                  {c.label} ({c.count})
                </option>
              ))}
            </select>
            <select
              value={onionOnly}
              onChange={(e) => setOnionOnly(e.target.value as typeof onionOnly)}
              className="rounded-lg border border-slate-200 bg-white py-2 px-3 font-mono text-[12px] dark:border-slate-800 dark:bg-slate-900"
              aria-label="Network filter"
            >
              <option value="all">Onion + clearnet</option>
              <option value="onion">Onion only</option>
              <option value="clearnet">Clearnet only</option>
            </select>
            <label className="flex items-center gap-1.5 font-mono text-[12px] text-slate-600 dark:text-slate-400">
              <input type="checkbox" checked={hideDown} onChange={(e) => setHideDown(e.target.checked)} />
              hide offline/expired
            </label>
          </div>

          <p className="font-mono text-[11px] text-slate-500 mb-3">
            {filtered.length} shown · {data.total} total ·{' '}
            {data.sources.filter((s) => s.stale).length > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {data.sources.filter((s) => s.stale).length} source(s) cached
              </span>
            )}
          </p>

          <ul className="grid gap-2 md:grid-cols-2">
            {filtered.map((e, idx) => (
              <li
                key={`${e.source_file}:${e.url}:${idx}`}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-display font-semibold text-sm truncate">{e.name}</span>
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${STATUS_STYLE[e.status]}`}
                      >
                        {e.status}
                      </span>
                      {e.attack_type && (
                        <span className="shrink-0 rounded border border-brand-500/40 bg-brand-500/10 px-1.5 py-0.5 font-mono text-[9px] text-brand-700 dark:text-brand-300">
                          {e.attack_type}
                        </span>
                      )}
                    </div>
                    {e.actor && <div className="font-mono text-[11px] text-slate-500 mt-0.5">actor: {e.actor}</div>}
                    {e.onion ? (
                      <code className="block mt-1 font-mono text-[11px] text-slate-600 dark:text-slate-400 break-all">
                        {e.url}
                      </code>
                    ) : (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 font-mono text-[11px] text-brand-600 dark:text-brand-400 hover:underline break-all"
                      >
                        {e.url}
                        <ExternalLink size={10} className="shrink-0" />
                      </a>
                    )}
                    {e.notes && <p className="font-mono text-[11px] text-slate-500 mt-1">{e.notes}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => copy(e.url)}
                    className="shrink-0 rounded border border-slate-200 dark:border-slate-700 p-1.5 text-slate-500 hover:text-brand-600 dark:hover:text-brand-400"
                    aria-label="Copy URL"
                  >
                    <Copy size={12} />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-slate-400">{e.category}</span>
                  <a
                    href={`https://github.com/fastfire/deepdarkCTI/blob/main/${e.source_file}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[9px] text-slate-400 hover:text-brand-500"
                  >
                    {e.source_file}
                  </a>
                  {copied === e.url && (
                    <span className="font-mono text-[9px] text-emerald-600 dark:text-emerald-400">copied</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {!data && !error && (
        <div className="flex items-center gap-2 font-mono text-sm text-slate-500">
          <ShieldAlert size={16} /> loading deepdarkCTI index…
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the route in `src/App.tsx`**

Find the lazy-import block (around line 101-116) and add:

```tsx
const DeepDarkCTI = lazy(() => import('./pages/threatintel/DeepDarkCTI'));
```

Find the `/threatintel/rules` route (around line 705-712) and add a sibling route after it, matching the exact ErrorBoundary+Suspense pattern used there:

```tsx
<Route
  path="/threatintel/deepdarkcti"
  element={
    <ErrorBoundary>
      <Suspense fallback={<SectionLoader />}>
        <DeepDarkCTI />
      </Suspense>
    </ErrorBoundary>
  }
/>
```

- [ ] **Step 3: Add the Home tile**

In `src/pages/threatintel/Home.tsx`, find the section with `id: 'catalogs'` (label "Curated Catalogs"). Add this tile object to its `tools` array (place it after the `external-resources` tile to group reference indexes):

```tsx
{
  to: '/threatintel/deepdarkcti',
  label: 'deepdarkCTI Index',
  desc: 'Parsed mirror of fastfire/deepdarkCTI — ransomware leak sites, dark markets, criminal forums, infostealer & threat-actor Telegram/Twitter channels, dark-web search engines. 18 source lists, filterable, onion-aware.',
  icon: Globe,
},
```

`Globe` is already imported in `Home.tsx` (verify with `grep -n "Globe" src/pages/threatintel/Home.tsx`; if only `Globe2` is imported, add `Globe` to the lucide-react import list).

- [ ] **Step 4: Lint + typecheck + build**

```bash
npm run lint && npm run build
```

Expected: lint PASS (0 new warnings — repo enforces `--max-warnings 0`; pre-existing baseline aside, introduce none), build completes (prerender may or may not include the new route; that's fine — it's an SPA route with a data fetch).

> ⚠️ If `build` fails in the prerender step referencing a missing route list entry, find the prerender route list (`grep -rn "threatintel/rules\|PRERENDER" scripts/ src/ vite.config.ts`) and add `/threatintel/deepdarkcti` alongside the other threatintel routes. If prerender doesn't enumerate routes explicitly, no action needed.

- [ ] **Step 5: Commit**

```bash
git add src/pages/threatintel/DeepDarkCTI.tsx src/App.tsx src/pages/threatintel/Home.tsx
git commit -m "feat(deepdarkcti): add frontend page, route, and home tile"
```

---

## Task 5: Final verification

- [ ] **Step 1: Full API test suite**

```bash
cd api && npm test
```

Expected: all PASS (no regressions; the 2 new test files green).

- [ ] **Step 2: Frontend lint + build**

```bash
npm run lint && npm run build
```

Expected: both PASS.

- [ ] **Step 3: Frontend test suite**

```bash
npm run test:run
```

Expected: PASS (no regressions; this feature adds no frontend tests — the page is exercised manually post-deploy).

- [ ] **Step 4: Self-review the diff**

```bash
git log --oneline main..HEAD && git diff --stat main..HEAD
```

Confirm: 4 feature commits, exactly the files in the File Structure section, no stray files, no unused imports. Fix anything found with a follow-up commit.

- [ ] **Step 5: Confirm clean tree**

```bash
git status --short
```

Expected: clean (the unrelated `src/data/dfir/wiki-meta.ts` working-tree edit may persist — leave it; it is not part of this work and must not be staged).

- [ ] **Step 6: Post-deploy manual check (after the controller deploys)**

```bash
curl -s "https://<host>/api/v1/deepdarkcti" | jq '{total, files: (.sources|length), cats: (.categories|length), stale: [.sources[]|select(.stale)]|length}'
curl -s "https://<host>/api/v1/feed-status" | jq '.rows[]|select(.id=="deepdarkcti")'
```

Expected: `total` in the thousands, `files: 18`, `cats` ≈ 18, feed-status row `ok` (or `degraded` if some upstream files were transiently unreachable).

---

## Self-Review Notes

- **Spec coverage:** Task 1 → spec §4 (parser, config table, parsing rules incl. cell-scan status detection, 500-cap, actor/attack fields). Task 2 → spec §3 + §5 (upstream contract, route, 12h cache, per-file KV last-good 48h, failure isolation, degraded TTL). Task 3 → spec §7 (feed-status). Task 4 → spec §6 (page, filters, onion copy-only, actor pills, attribution chip, Home tile). Task 5 → spec §8 (verification).
- **Status detection:** implemented as cell-scan (spec §4.3 rule 6 revised), not a per-file `statusCol` — consistent with the spec's final form; `DDCFileConfig` intentionally has no `statusCol`.
- **`total_seen`:** spec §4.3 rule 8 wants "showing 500 of N". The parser caps at 500 and the route currently sets `total_seen = entries.length`. This means the UI cannot show the true pre-cap count. **Known limitation, accepted for v1** — surfacing true pre-cap totals would require `parseDDCFile` to also return a count of skipped-by-cap rows. Left out to keep the parser signature simple (YAGNI); the category counts still reflect what's displayed. If the user wants true totals later, that's a small follow-up: change `parseDDCFile` to return `{ entries, totalSeen }`.
- **Type consistency:** `DDCEntry`, `DDCFileConfig`, `DDC_FILES`, `PER_FILE_CAP`, `parseDDCFile`, `DEEPDARKCTI_CACHE_KEY`, `buildDeepDarkCti`, `deepDarkCtiHandler` are used consistently across Tasks 1–4. The frontend redeclares `DDCEntry`/`DDCResponse` locally (frontend can't import from `api/`) — fields match the backend shape exactly.
- **Branch:** controller sets up the branch before dispatch (recommend `feat/deepdarkcti` off `main`, cherry-pick spec `0e5a09c`).
