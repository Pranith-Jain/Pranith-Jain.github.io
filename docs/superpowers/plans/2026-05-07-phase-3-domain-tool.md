# Phase 3: Domain Lookup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver `/dfir/domain` working end-to-end. The user enters a domain, the API Worker queries free public sources in parallel (RDAP for WHOIS, Cloudflare DoH for DNS, crt.sh for Certificate Transparency, HTTPS GETs for MTA-STS / TLS-RPT), returns a single JSON payload (no SSE — domain lookup is request/response), and the UI renders WHOIS info, DNS records, email-auth status (SPF/DKIM/DMARC/BIMI), CT log certs, and a composite "domain health" score in the dfir-lab.ch dark/cyan aesthetic.

**Architecture:** Vertical slice — backend, frontend, and cleanup all in one plan. **No API keys required** — all data sources are free public APIs reachable over HTTPS from Cloudflare Workers. Ports/raw TLS sockets are NOT available in Workers, so legacy features that needed those (direct SSL handshake, DNSSEC chain validation, DANE) are deferred or done via the public APIs that already do them.

**Tech Stack:**

- Backend: TypeScript + Hono (existing from Plan 2)
- Frontend: React 18, react-router (existing)
- Public free APIs:
  - **RDAP** — `https://rdap.org/domain/<value>` (auto-redirects to authoritative RDAP server; gives registrar, dates, name servers)
  - **Cloudflare DoH** — `https://cloudflare-dns.com/dns-query?name=<value>&type=<TYPE>` with header `Accept: application/dns-json` (gives A/AAAA/MX/NS/TXT/CNAME/SOA/CAA)
  - **crt.sh** — `https://crt.sh/?q=<value>&output=json` (gives Certificate Transparency log entries)
  - **MTA-STS** — `https://mta-sts.<domain>/.well-known/mta-sts.txt` (GET; presence + valid policy = configured)

**Out of scope for Plan 3 (deferred):**

- DNSSEC chain validation (complex; defer)
- DANE record verification (depends on full DNSSEC; defer)
- Direct TLS handshake / cert chain inspection (Workers can't open raw TCP)
- DNSBL / RBL lookups (legacy used a python lib that hit ~30 blacklists; can do via DNS later)
- Subdomain enumeration UI (we already query crt.sh — show it as "subdomains seen in CT" but no separate scanner)

---

## Prerequisites

- Plan 2 main work complete (branch `feature/dfir-integration`)
- API Worker tests baseline: 81 passing
- Frontend tests baseline: 131 passing / 5 known-failing

---

## File Structure

After Plan 3:

```
api/src/
├── lib/
│   ├── dns.ts                 NEW: DoH client for record lookups
│   ├── rdap.ts                NEW: RDAP client + parser
│   ├── crt-sh.ts              NEW: crt.sh query helper
│   ├── email-auth.ts          NEW: SPF/DKIM/DMARC/BIMI/MTA-STS/TLS-RPT parsers
│   └── domain-score.ts        NEW: composite health score
└── routes/
    └── domain.ts              NEW: GET /api/v1/domain/lookup

api/test/
├── lib/
│   ├── dns.test.ts
│   ├── rdap.test.ts
│   ├── email-auth.test.ts
│   └── domain-score.test.ts
└── routes/
    └── domain.test.ts

src/pages/dfir/
├── Domain.tsx                 NEW: real page replacing DomainPlaceholder
└── DomainPlaceholder.tsx      DELETED

src/components/dfir/
├── DnsRecordList.tsx          NEW
├── EmailAuthCard.tsx          NEW
├── CertList.tsx               NEW
├── WhoisCard.tsx              NEW
└── (existing) VerdictChip.tsx, IocResultRow.tsx

src/lib/dfir/
└── types.ts                   MODIFIED: add DomainLookupResponse type

src/App.tsx                    MODIFIED: swap lazy import + route
src/pages/DFIR.tsx             MODIFIED: strip 'domain' tab content
src/components/DFIRNavigation.tsx  MODIFIED: drop or relabel 'domain' tab
```

---

## Task 1: DoH (DNS over HTTPS) helper

**Goal:** typed wrapper around Cloudflare's DoH endpoint. Returns A/AAAA/MX/NS/TXT/CNAME/SOA/CAA records with proper parsing.

**Files:**

- Create: `api/src/lib/dns.ts`
- Create: `api/test/lib/dns.test.ts`

- [ ] **Step 1: Write failing test**

Path: `/Users/pranith/Documents/portfolio/api/test/lib/dns.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveRecord, resolveAllStandard } from '../../src/lib/dns';

beforeEach(() => vi.restoreAllMocks());

describe('resolveRecord', () => {
  it('parses successful A record response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          Status: 0,
          Answer: [{ name: 'example.com.', type: 1, TTL: 300, data: '93.184.216.34' }],
        })
      )
    );
    const r = await resolveRecord('example.com', 'A');
    expect(r.records).toEqual(['93.184.216.34']);
    expect(r.error).toBeUndefined();
  });

  it('returns empty records on NXDOMAIN', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          Status: 3, // NXDOMAIN
          Answer: [],
        })
      )
    );
    const r = await resolveRecord('does-not-exist-xyz123.example', 'A');
    expect(r.records).toEqual([]);
  });

  it('strips trailing-dot quotes from TXT', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          Status: 0,
          Answer: [{ name: 'example.com.', type: 16, TTL: 300, data: '"v=spf1 -all"' }],
        })
      )
    );
    const r = await resolveRecord('example.com', 'TXT');
    expect(r.records).toEqual(['v=spf1 -all']);
  });

  it('returns error on non-200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('boom', { status: 500 }));
    const r = await resolveRecord('example.com', 'A');
    expect(r.records).toEqual([]);
    expect(r.error).toMatch(/500/);
  });
});

describe('resolveAllStandard', () => {
  it('returns map keyed by record type', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          Status: 0,
          Answer: [{ name: 'x.', type: 1, TTL: 60, data: '1.2.3.4' }],
        })
      )
    );
    const r = await resolveAllStandard('example.com');
    // 8 standard record types in parallel
    expect(Object.keys(r).sort()).toEqual(['A', 'AAAA', 'CAA', 'CNAME', 'MX', 'NS', 'SOA', 'TXT']);
  });
});
```

- [ ] **Step 2: Verify failing**

```bash
cd /Users/pranith/Documents/portfolio/api && npm test -- --run dns
```

- [ ] **Step 3: Write `api/src/lib/dns.ts`**

```typescript
const DOH = 'https://cloudflare-dns.com/dns-query';

const TYPE_NUM: Record<string, number> = {
  A: 1,
  AAAA: 28,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  MX: 15,
  TXT: 16,
  CAA: 257,
};

export type RecordType = keyof typeof TYPE_NUM;

export interface ResolveResult {
  records: string[];
  error?: string;
}

interface DoHAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

interface DoHResponse {
  Status: number;
  Answer?: DoHAnswer[];
}

function clean(data: string, type: RecordType): string {
  let v = data.trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (type === 'MX') {
    // MX records come as "<priority> <host>"; keep as-is, caller can parse
    return v;
  }
  return v;
}

export async function resolveRecord(name: string, type: RecordType): Promise<ResolveResult> {
  try {
    const url = `${DOH}?name=${encodeURIComponent(name)}&type=${type}`;
    const res = await fetch(url, { headers: { accept: 'application/dns-json' } });
    if (!res.ok) return { records: [], error: `${res.status} ${res.statusText}`.trim() };
    const json = (await res.json()) as DoHResponse;
    const answers = json.Answer ?? [];
    return { records: answers.map((a) => clean(a.data, type)) };
  } catch (err) {
    return { records: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function resolveAllStandard(name: string): Promise<Record<RecordType, ResolveResult>> {
  const types = Object.keys(TYPE_NUM) as RecordType[];
  const entries = await Promise.all(types.map(async (t) => [t, await resolveRecord(name, t)] as const));
  return Object.fromEntries(entries) as Record<RecordType, ResolveResult>;
}
```

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/dns.ts api/test/lib/dns.test.ts
git commit -m "feat(api): add DoH (DNS over HTTPS) record resolver"
```

---

## Task 2: RDAP / WHOIS helper

**Goal:** RDAP-based WHOIS replacement. RDAP is a JSON-over-HTTPS protocol (the modern WHOIS) that works in Workers.

**Files:**

- Create: `api/src/lib/rdap.ts`
- Create: `api/test/lib/rdap.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rdapLookup } from '../../src/lib/rdap';

beforeEach(() => vi.restoreAllMocks());

describe('rdapLookup', () => {
  it('extracts registrar, creation/expiration dates, name servers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          handle: 'EXAMPLE-COM',
          ldhName: 'EXAMPLE.COM',
          events: [
            { eventAction: 'registration', eventDate: '1995-08-14T04:00:00Z' },
            { eventAction: 'expiration', eventDate: '2030-08-13T04:00:00Z' },
            { eventAction: 'last changed', eventDate: '2024-08-14T07:01:34Z' },
          ],
          entities: [
            {
              roles: ['registrar'],
              vcardArray: ['vcard', [['fn', {}, 'text', 'RESERVED-Internet Assigned Numbers Authority']]],
            },
          ],
          nameservers: [{ ldhName: 'A.IANA-SERVERS.NET' }, { ldhName: 'B.IANA-SERVERS.NET' }],
          status: ['client transfer prohibited'],
        })
      )
    );

    const r = await rdapLookup('example.com');
    expect(r.registrar).toMatch(/IANA/i);
    expect(r.created).toBe('1995-08-14T04:00:00Z');
    expect(r.expires).toBe('2030-08-13T04:00:00Z');
    expect(r.nameservers).toEqual(['A.IANA-SERVERS.NET', 'B.IANA-SERVERS.NET']);
    expect(r.status).toContain('client transfer prohibited');
  });

  it('returns error on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('not found', { status: 404 }));
    const r = await rdapLookup('does-not-exist.invalid');
    expect(r.error).toMatch(/404/);
  });
});
```

- [ ] **Step 2: See fail**

- [ ] **Step 3: Write `api/src/lib/rdap.ts`**

```typescript
export interface RdapResult {
  registrar?: string;
  created?: string;
  expires?: string;
  updated?: string;
  nameservers: string[];
  status: string[];
  error?: string;
}

interface RdapEvent {
  eventAction: string;
  eventDate: string;
}
interface RdapEntity {
  roles?: string[];
  vcardArray?: [string, Array<[string, Record<string, unknown>, string, string]>];
}
interface RdapNameserver {
  ldhName: string;
}
interface RdapResponse {
  events?: RdapEvent[];
  entities?: RdapEntity[];
  nameservers?: RdapNameserver[];
  status?: string[];
}

function vcardName(entity: RdapEntity): string | undefined {
  const arr = entity.vcardArray?.[1] ?? [];
  const fn = arr.find((p) => p[0] === 'fn');
  return fn ? fn[3] : undefined;
}

export async function rdapLookup(domain: string): Promise<RdapResult> {
  const empty: RdapResult = { nameservers: [], status: [] };
  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { accept: 'application/rdap+json' },
      redirect: 'follow',
    });
    if (!res.ok) return { ...empty, error: `${res.status} ${res.statusText}`.trim() };
    const j = (await res.json()) as RdapResponse;

    const eventBy = (action: string) => j.events?.find((e) => e.eventAction === action)?.eventDate;
    const registrarEntity = j.entities?.find((e) => e.roles?.includes('registrar'));
    return {
      registrar: registrarEntity ? vcardName(registrarEntity) : undefined,
      created: eventBy('registration'),
      expires: eventBy('expiration'),
      updated: eventBy('last changed'),
      nameservers: (j.nameservers ?? []).map((n) => n.ldhName),
      status: j.status ?? [],
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 4: Pass**

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/rdap.ts api/test/lib/rdap.test.ts
git commit -m "feat(api): add RDAP/WHOIS lookup via rdap.org"
```

---

## Task 3: Email authentication parsers (SPF/DKIM/DMARC/BIMI/MTA-STS)

**Goal:** parse TXT records into structured email-auth status. Each parser is pure (text-in, struct-out) and trivially unit-testable.

**Files:**

- Create: `api/src/lib/email-auth.ts`
- Create: `api/test/lib/email-auth.test.ts`

- [ ] **Step 1: Test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSpf, parseDmarc, parseBimi, parseMtaSts, parseTlsRpt, evaluateEmailAuth } from '../../src/lib/email-auth';

beforeEach(() => vi.restoreAllMocks());

describe('parseSpf', () => {
  it('detects strict policy with -all', () => {
    expect(parseSpf(['v=spf1 ip4:1.2.3.4 -all'])).toEqual({
      present: true,
      policy: 'fail',
      record: 'v=spf1 ip4:1.2.3.4 -all',
    });
  });
  it('detects soft-fail', () => {
    expect(parseSpf(['v=spf1 ~all']).policy).toBe('softfail');
  });
  it('detects neutral', () => {
    expect(parseSpf(['v=spf1 ?all']).policy).toBe('neutral');
  });
  it('absent when no v=spf1 found', () => {
    expect(parseSpf(['random text'])).toEqual({ present: false });
  });
});

describe('parseDmarc', () => {
  it('extracts policy + percentage', () => {
    expect(parseDmarc(['v=DMARC1; p=reject; pct=100; rua=mailto:dmarc@example.com'])).toMatchObject({
      present: true,
      policy: 'reject',
      pct: 100,
    });
  });
  it('returns absent when no v=DMARC1', () => {
    expect(parseDmarc(['v=spf1 -all'])).toEqual({ present: false });
  });
});

describe('parseBimi', () => {
  it('detects valid record with logo URI', () => {
    expect(parseBimi(['v=BIMI1; l=https://example.com/logo.svg'])).toEqual({
      present: true,
      logo: 'https://example.com/logo.svg',
    });
  });
});

describe('parseMtaSts', () => {
  it('parses valid policy', () => {
    const policy = 'version: STSv1\nmode: enforce\nmx: mail.example.com\nmax_age: 86400';
    expect(parseMtaSts(policy)).toEqual({ present: true, mode: 'enforce', maxAge: 86400 });
  });
});

describe('evaluateEmailAuth', () => {
  it('all-green when SPF -all + DMARC reject + DKIM present', () => {
    const e = evaluateEmailAuth({
      spf: { present: true, policy: 'fail' },
      dmarc: { present: true, policy: 'reject', pct: 100 },
      dkimSelectorsFound: ['default'],
      bimi: { present: false },
      mtaSts: { present: true, mode: 'enforce' },
      tlsRpt: { present: true },
    });
    expect(e.score).toBeGreaterThanOrEqual(85);
    expect(e.verdict).toBe('strong');
  });
});
```

- [ ] **Step 2: See fail**

- [ ] **Step 3: Write `api/src/lib/email-auth.ts`**

```typescript
export interface SpfResult {
  present: boolean;
  policy?: 'fail' | 'softfail' | 'neutral' | 'pass' | 'unknown';
  record?: string;
}
export interface DmarcResult {
  present: boolean;
  policy?: 'reject' | 'quarantine' | 'none';
  pct?: number;
  record?: string;
}
export interface BimiResult {
  present: boolean;
  logo?: string;
}
export interface MtaStsResult {
  present: boolean;
  mode?: 'enforce' | 'testing' | 'none';
  maxAge?: number;
}
export interface TlsRptResult {
  present: boolean;
  rua?: string;
}

export interface EmailAuthInputs {
  spf: SpfResult;
  dmarc: DmarcResult;
  dkimSelectorsFound: string[];
  bimi: BimiResult;
  mtaSts: MtaStsResult;
  tlsRpt: TlsRptResult;
}

export interface EmailAuthEvaluation {
  score: number; // 0-100, higher = better email security
  verdict: 'strong' | 'partial' | 'weak';
  weaknesses: string[];
}

export function parseSpf(txts: string[]): SpfResult {
  const rec = txts.find((t) => t.toLowerCase().startsWith('v=spf1'));
  if (!rec) return { present: false };
  const lower = rec.toLowerCase();
  let policy: SpfResult['policy'] = 'unknown';
  if (lower.includes('-all')) policy = 'fail';
  else if (lower.includes('~all')) policy = 'softfail';
  else if (lower.includes('?all')) policy = 'neutral';
  else if (lower.includes('+all') || lower.endsWith(' all')) policy = 'pass';
  return { present: true, policy, record: rec };
}

export function parseDmarc(txts: string[]): DmarcResult {
  const rec = txts.find((t) => t.toLowerCase().startsWith('v=dmarc1'));
  if (!rec) return { present: false };
  const tags: Record<string, string> = {};
  rec.split(';').forEach((part) => {
    const [k, v] = part.trim().split('=');
    if (k && v) tags[k.toLowerCase()] = v.trim();
  });
  const policy = (tags.p as DmarcResult['policy']) ?? 'none';
  const pct = tags.pct ? Number(tags.pct) : 100;
  return { present: true, policy, pct, record: rec };
}

export function parseBimi(txts: string[]): BimiResult {
  const rec = txts.find((t) => t.toLowerCase().startsWith('v=bimi1'));
  if (!rec) return { present: false };
  const m = rec.match(/l=([^\s;]+)/i);
  return { present: true, logo: m?.[1] };
}

export function parseMtaSts(body: string): MtaStsResult {
  if (!body.includes('STSv1')) return { present: false };
  const lines = body.split(/\r?\n/);
  const get = (key: string) =>
    lines
      .find((l) => l.toLowerCase().startsWith(`${key.toLowerCase()}:`))
      ?.split(':')[1]
      ?.trim();
  const mode = (get('mode') as MtaStsResult['mode']) ?? 'none';
  const maxAge = Number(get('max_age') ?? 0);
  return { present: true, mode, maxAge };
}

export function parseTlsRpt(txts: string[]): TlsRptResult {
  const rec = txts.find((t) => t.toLowerCase().startsWith('v=tlsrptv1'));
  if (!rec) return { present: false };
  const m = rec.match(/rua=([^\s;]+)/i);
  return { present: true, rua: m?.[1] };
}

export function evaluateEmailAuth(i: EmailAuthInputs): EmailAuthEvaluation {
  let score = 0;
  const weaknesses: string[] = [];

  if (i.spf.present) {
    score += i.spf.policy === 'fail' ? 25 : i.spf.policy === 'softfail' ? 15 : 5;
    if (i.spf.policy !== 'fail') weaknesses.push('SPF policy is weaker than -all');
  } else weaknesses.push('SPF missing');

  if (i.dmarc.present) {
    score += i.dmarc.policy === 'reject' ? 30 : i.dmarc.policy === 'quarantine' ? 18 : 6;
    if ((i.dmarc.pct ?? 100) < 100) weaknesses.push(`DMARC pct < 100 (${i.dmarc.pct})`);
    if (i.dmarc.policy === 'none') weaknesses.push('DMARC policy is none (monitoring only)');
  } else weaknesses.push('DMARC missing');

  if (i.dkimSelectorsFound.length > 0) score += 10;
  else weaknesses.push('No common DKIM selector found');

  if (i.mtaSts.present) {
    score += i.mtaSts.mode === 'enforce' ? 15 : 5;
    if (i.mtaSts.mode !== 'enforce') weaknesses.push('MTA-STS not in enforce mode');
  } else weaknesses.push('MTA-STS missing');

  if (i.tlsRpt.present) score += 5;
  if (i.bimi.present) score += 5;

  score = Math.max(0, Math.min(100, score));
  const verdict: EmailAuthEvaluation['verdict'] = score >= 80 ? 'strong' : score >= 50 ? 'partial' : 'weak';

  return { score, verdict, weaknesses };
}
```

- [ ] **Step 4: Pass**

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/email-auth.ts api/test/lib/email-auth.test.ts
git commit -m "feat(api): add SPF/DMARC/BIMI/MTA-STS/TLS-RPT parsers + scoring"
```

---

## Task 4: crt.sh Certificate Transparency helper

**Files:**

- Create: `api/src/lib/crt-sh.ts`
- Create: `api/test/lib/crt-sh.test.ts`

- [ ] **Step 1: Test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ctLogs } from '../../src/lib/crt-sh';

beforeEach(() => vi.restoreAllMocks());

describe('ctLogs', () => {
  it('returns deduped entries with most recent first', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 1,
            common_name: 'example.com',
            name_value: 'example.com\nwww.example.com',
            issuer_name: "C=US, O=Let's Encrypt, CN=R3",
            not_before: '2024-01-01T00:00:00',
            not_after: '2024-04-01T00:00:00',
          },
          {
            id: 2,
            common_name: 'example.com',
            name_value: 'example.com',
            issuer_name: "C=US, O=Let's Encrypt, CN=R10",
            not_before: '2024-04-01T00:00:00',
            not_after: '2024-07-01T00:00:00',
          },
        ])
      )
    );
    const r = await ctLogs('example.com');
    expect(r.length).toBeLessThanOrEqual(50);
    expect(r[0].not_before > r[r.length - 1].not_before).toBe(true);
    // Subdomains aggregated from name_value
    expect(r[0].subjects).toEqual(expect.arrayContaining(['example.com']));
  });

  it('returns [] on empty/error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('[]'));
    expect(await ctLogs('x.invalid')).toEqual([]);
  });
});
```

- [ ] **Step 2-4: Implement, pass, commit**

`api/src/lib/crt-sh.ts`:

```typescript
export interface CtEntry {
  id: number;
  issuer: string;
  not_before: string;
  not_after: string;
  subjects: string[]; // unique CN + SANs
}

interface CrtShRow {
  id: number;
  common_name: string;
  name_value: string;
  issuer_name: string;
  not_before: string;
  not_after: string;
}

export async function ctLogs(domain: string): Promise<CtEntry[]> {
  try {
    const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`);
    if (!res.ok) return [];
    const rows = (await res.json()) as CrtShRow[];
    return rows
      .map((r) => ({
        id: r.id,
        issuer: r.issuer_name?.match(/CN=([^,]+)/)?.[1] ?? r.issuer_name ?? 'unknown',
        not_before: r.not_before,
        not_after: r.not_after,
        subjects: Array.from(new Set([r.common_name, ...r.name_value.split('\n')].filter(Boolean))),
      }))
      .sort((a, b) => b.not_before.localeCompare(a.not_before))
      .slice(0, 50);
  } catch {
    return [];
  }
}
```

Commit: `feat(api): add crt.sh certificate transparency helper`

---

## Task 5: `/api/v1/domain/lookup` route

**Files:**

- Create: `api/src/routes/domain.ts`
- Modify: `api/src/index.ts` (mount route)
- Create: `api/test/routes/domain.test.ts`

- [ ] **Step 1: Test**

```typescript
import { SELF } from 'cloudflare:test';
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => vi.restoreAllMocks());

describe('GET /api/v1/domain/lookup', () => {
  it('rejects missing domain', async () => {
    const r = await SELF.fetch('https://x/api/v1/domain/lookup');
    expect(r.status).toBe(400);
  });

  it('rejects invalid domain', async () => {
    const r = await SELF.fetch('https://x/api/v1/domain/lookup?domain=not--a--domain');
    expect(r.status).toBe(400);
  });

  it('aggregates DNS, RDAP, email-auth, CT', async () => {
    // Mock all outgoing fetches generically
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          Status: 0,
          Answer: [{ name: 'example.com.', type: 16, TTL: 60, data: '"v=spf1 -all"' }],
          events: [],
          entities: [],
          nameservers: [],
          status: [],
        }),
        { status: 200 }
      )
    );

    const r = await SELF.fetch('https://x/api/v1/domain/lookup?domain=example.com');
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.domain).toBe('example.com');
    expect(body.dns).toBeDefined();
    expect(body.rdap).toBeDefined();
    expect(body.email_auth).toBeDefined();
    expect(body.score).toBeDefined();
  });
});
```

- [ ] **Step 2-4: Implement**

`api/src/routes/domain.ts`:

```typescript
import type { Context } from 'hono';
import type { Env } from '../env';
import { resolveAllStandard, resolveRecord } from '../lib/dns';
import { rdapLookup } from '../lib/rdap';
import { ctLogs } from '../lib/crt-sh';
import { parseSpf, parseDmarc, parseBimi, parseMtaSts, parseTlsRpt, evaluateEmailAuth } from '../lib/email-auth';

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const COMMON_DKIM_SELECTORS = ['default', 'google', 'k1', 'mail', 'selector1', 'selector2', 's1', 's2'];

export async function domainLookupHandler(c: Context<{ Bindings: Env }>) {
  const raw = c.req.query('domain')?.trim().toLowerCase();
  if (!raw) return c.json({ error: 'missing domain' }, 400);
  if (!DOMAIN_RE.test(raw)) return c.json({ error: 'invalid domain' }, 400);

  const dmarcDomain = `_dmarc.${raw}`;
  const bimiDomain = `default._bimi.${raw}`;
  const tlsRptDomain = `_smtp._tls.${raw}`;
  const mtaStsUrl = `https://mta-sts.${raw}/.well-known/mta-sts.txt`;

  const [dns, rdap, ct, dmarcTxt, bimiTxt, tlsRptTxt, mtaStsBody, ...dkimChecks] = await Promise.all([
    resolveAllStandard(raw),
    rdapLookup(raw),
    ctLogs(raw),
    resolveRecord(dmarcDomain, 'TXT'),
    resolveRecord(bimiDomain, 'TXT'),
    resolveRecord(tlsRptDomain, 'TXT'),
    fetch(mtaStsUrl)
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => ''),
    ...COMMON_DKIM_SELECTORS.map((s) => resolveRecord(`${s}._domainkey.${raw}`, 'TXT')),
  ]);

  const dkimSelectorsFound: string[] = [];
  COMMON_DKIM_SELECTORS.forEach((sel, i) => {
    const r = dkimChecks[i];
    if (r && r.records.length > 0) dkimSelectorsFound.push(sel);
  });

  const spf = parseSpf(dns.TXT.records);
  const dmarc = parseDmarc(dmarcTxt.records);
  const bimi = parseBimi(bimiTxt.records);
  const tlsRpt = parseTlsRpt(tlsRptTxt.records);
  const mtaSts = parseMtaSts(mtaStsBody);

  const evaluation = evaluateEmailAuth({
    spf,
    dmarc,
    bimi,
    mtaSts,
    tlsRpt,
    dkimSelectorsFound,
  });

  return c.json({
    domain: raw,
    score: evaluation.score,
    verdict: evaluation.verdict,
    dns,
    rdap,
    email_auth: {
      spf,
      dmarc,
      dkim: { selectors_found: dkimSelectorsFound },
      bimi,
      mta_sts: mtaSts,
      tls_rpt: tlsRpt,
      evaluation,
    },
    certificates: ct,
  });
}
```

In `api/src/index.ts`, add:

```typescript
import { domainLookupHandler } from './routes/domain';
// ...
app.get('/api/v1/domain/lookup', domainLookupHandler);
```

- [ ] **Step 5: Pass + Commit**

```bash
git add api/src/routes/domain.ts api/src/index.ts api/test/routes/domain.test.ts
git commit -m "feat(api): add /api/v1/domain/lookup route"
```

---

## Task 6: Frontend `Domain.tsx` page

**Files:**

- Create: `src/lib/dfir/types.ts` (modify, add `DomainLookupResponse`)
- Create: `src/components/dfir/WhoisCard.tsx`
- Create: `src/components/dfir/DnsRecordList.tsx`
- Create: `src/components/dfir/EmailAuthCard.tsx`
- Create: `src/components/dfir/CertList.tsx`
- Create: `src/pages/dfir/Domain.tsx`
- Modify: `src/App.tsx` (swap lazy import + route)
- Delete: `src/pages/dfir/DomainPlaceholder.tsx`
- Modify: `src/components/__tests__/DfirRoutes.test.tsx` (mark `/dfir/domain` `skipComingSoon: true`)

- [ ] **Step 1: Add types to `src/lib/dfir/types.ts`**

Append:

```typescript
export interface DomainLookupResponse {
  domain: string;
  score: number;
  verdict: 'strong' | 'partial' | 'weak';
  dns: Record<'A' | 'AAAA' | 'NS' | 'CNAME' | 'SOA' | 'MX' | 'TXT' | 'CAA', { records: string[]; error?: string }>;
  rdap: {
    registrar?: string;
    created?: string;
    expires?: string;
    updated?: string;
    nameservers: string[];
    status: string[];
    error?: string;
  };
  email_auth: {
    spf: { present: boolean; policy?: string; record?: string };
    dmarc: { present: boolean; policy?: string; pct?: number; record?: string };
    dkim: { selectors_found: string[] };
    bimi: { present: boolean; logo?: string };
    mta_sts: { present: boolean; mode?: string; maxAge?: number };
    tls_rpt: { present: boolean; rua?: string };
    evaluation: { score: number; verdict: 'strong' | 'partial' | 'weak'; weaknesses: string[] };
  };
  certificates: Array<{
    id: number;
    issuer: string;
    not_before: string;
    not_after: string;
    subjects: string[];
  }>;
}
```

- [ ] **Step 2: Build the page**

`src/pages/dfir/Domain.tsx`:

```tsx
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import type { DomainLookupResponse } from '../../lib/dfir/types';
import { WhoisCard } from '../../components/dfir/WhoisCard';
import { DnsRecordList } from '../../components/dfir/DnsRecordList';
import { EmailAuthCard } from '../../components/dfir/EmailAuthCard';
import { CertList } from '../../components/dfir/CertList';

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export default function Domain(): JSX.Element {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DomainLookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = DOMAIN_RE.test(input.trim());

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch(`/api/v1/domain/lookup?domain=${encodeURIComponent(input.trim())}`);
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `${r.status}`);
      }
      setResult((await r.json()) as DomainLookupResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'lookup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-5xl mx-auto px-8 py-12">
        <Link
          to="/dfir"
          className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-[#00fff9] mb-8 font-mono"
        >
          <ArrowLeft size={14} /> /dfir
        </Link>
        <h1 className="text-4xl font-display font-bold mb-2">Domain Lookup</h1>
        <p className="text-[#a1a1aa] mb-8 max-w-2xl">
          WHOIS, DNS, SPF / DMARC / DKIM / BIMI / MTA-STS, and Certificate Transparency — one query.
        </p>

        <form onSubmit={onSubmit} className="mb-10">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="example.com"
              className="flex-1 px-4 py-3 bg-[#111113] border border-[#1f1f23] rounded-lg font-mono text-[#fafafa] placeholder:text-[#71717a] focus:outline-none focus:border-[#00fff9]/50"
            />
            <button
              type="submit"
              disabled={!valid || loading}
              className="px-5 py-3 bg-[#00fff9] text-[#0a0a0a] font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-[#22d3ee]"
            >
              <Search size={16} className="inline mr-2" />
              Look up
            </button>
          </div>
          {input && !valid && <p className="mt-2 text-xs font-mono text-[#f59e0b]">Not a valid domain.</p>}
        </form>

        {loading && <p className="font-mono text-[#a1a1aa]">Looking up…</p>}
        {error && <p className="font-mono text-[#ef4444]">error: {error}</p>}

        {result && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display font-bold text-2xl">{result.domain}</h2>
                <span className="font-mono text-sm">
                  health: <span className="text-[#fafafa]">{result.score}/100</span>{' '}
                  <span
                    className={
                      result.verdict === 'strong'
                        ? 'text-[#10b981]'
                        : result.verdict === 'partial'
                          ? 'text-[#f59e0b]'
                          : 'text-[#ef4444]'
                    }
                  >
                    ({result.verdict})
                  </span>
                </span>
              </div>
            </section>

            <WhoisCard rdap={result.rdap} />
            <EmailAuthCard auth={result.email_auth} />
            <DnsRecordList dns={result.dns} />
            <CertList certs={result.certificates} />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build the 4 sub-components**

Each is a small dark-styled card. Implementation pattern:

`WhoisCard.tsx` — shows registrar, dates, name servers, status. Renders as a labeled grid.

`DnsRecordList.tsx` — accordion or grouped list of A / AAAA / MX / NS / TXT records. Empty groups hidden.

`EmailAuthCard.tsx` — 6 chips (SPF, DMARC, DKIM, BIMI, MTA-STS, TLS-RPT) each green/yellow/red based on presence and quality. Below: weaknesses list.

`CertList.tsx` — table of last 10 CT certs (issuer, valid range, subjects). "see more" link at the bottom.

(Each component is ~30–50 lines. Full code follows the same dark/cyan pattern as `IocResultRow.tsx`.)

- [ ] **Step 4: Wire route in App.tsx**

Replace `DomainPlaceholder` lazy import + route element with `Domain`.

```tsx
const Domain = lazy(() => import('./pages/dfir/Domain'));
// ...
<Route
  path="/dfir/domain"
  element={
    <Suspense fallback={<SectionLoader />}>
      <Domain />
    </Suspense>
  }
/>;
```

- [ ] **Step 5: Update `DfirRoutes.test.tsx`**

```tsx
{ path: '/dfir/domain', heading: 'Domain Lookup', skipComingSoon: true },
```

- [ ] **Step 6: Delete placeholder**

```bash
rm /Users/pranith/Documents/portfolio/src/pages/dfir/DomainPlaceholder.tsx
```

- [ ] **Step 7: Run all tests, lint, build**

Expected: 131 → 131 still passing, baseline preserved. Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/lib/dfir/types.ts src/components/dfir/WhoisCard.tsx src/components/dfir/DnsRecordList.tsx src/components/dfir/EmailAuthCard.tsx src/components/dfir/CertList.tsx src/pages/dfir/Domain.tsx src/App.tsx src/components/__tests__/DfirRoutes.test.tsx
git rm src/pages/dfir/DomainPlaceholder.tsx
git commit -m "feat(dfir): /dfir/domain page with WHOIS/DNS/email-auth/CT"
```

---

## Task 7: Strip the `domain` tab from `DFIR.tsx` + nav

**Files:**

- Modify: `src/pages/DFIR.tsx`
- Modify: `src/components/DFIRNavigation.tsx`

- [ ] **Step 1: Remove the `activeTab === 'domain'` JSX block** in `DFIR.tsx` (large block around line ~1308 in the pre-Plan-2 numbering, may have shifted).

- [ ] **Step 2: Remove `domainInput`, `domainResult`, `domainLoading` state and the `checkDomain` (or similarly named) handler.**

- [ ] **Step 3: Remove the `domain` nav item** from `DFIRNavigation.tsx` (or relabel — but since the new page is at `/dfir/domain`, removing the in-tab option is cleanest; users navigate via the route).

- [ ] **Step 4: Verify with grep that nothing references the removed state.**

- [ ] **Step 5: Test + lint + build**

Same baseline preserved.

- [ ] **Step 6: Commit**

```bash
git commit -m "refactor(dfir): remove domain tab from DFIR.tsx (migrated to /dfir/domain)"
```

---

## Task 8: Final verification + push

- [ ] All API tests pass (~95+ total: 81 + dns + rdap + email-auth + crt-sh + domain route ≈ 14 new)
- [ ] All frontend tests pass (131 + the route test still works)
- [ ] Lint clean
- [ ] Build clean
- [ ] Branch pushed

```bash
git push
```

---

## Plan 3 exit criteria

- [ ] `/dfir/domain` works against the locally-running Worker
- [ ] WHOIS, DNS, email-auth (SPF/DMARC/etc.), CT logs all visible in UI
- [ ] Health score reflects email-auth strength
- [ ] No API keys needed
- [ ] Old `domain` tab in `DFIR.tsx` removed
- [ ] DomainPlaceholder.tsx deleted

## Notes for Plan 4 (Phishing analyzer)

Similar vertical slice. The phishing analyzer parses raw email source (headers, URLs, attachments). Backend port from `docs/dfir-legacy/api-reference/main.py`'s phishing endpoint. URL extraction → call IOC checker per URL via internal route (cross-tool reuse). This will be where the IOC tool first proves its value as a building block.
