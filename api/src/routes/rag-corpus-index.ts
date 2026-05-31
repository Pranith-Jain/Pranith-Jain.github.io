import type { Env } from '../env';
import { indexDocument } from '../lib/rag-embedder';

const FETCH_TIMEOUT = 15_000;

// ── CVE Indexer ──────────────────────────────────────────────────────────

interface NvdCveItem {
  id: string;
  descriptions?: Array<{ lang: string; value: string }>;
  metrics?: {
    cvssMetricV31?: Array<{ cvssData: { baseScore: number; baseSeverity: string } }>;
    cvssMetricV30?: Array<{ cvssData: { baseScore: number; baseSeverity: string } }>;
    cvssMetricV2?: Array<{ cvssData: { baseScore: number; baseSeverity: string } }>;
  };
  published?: string;
  lastModified?: string;
  references?: Array<{ url: string; tags?: string[] }>;
  weaknesses?: Array<{ description: Array<{ value: string }> }>;
  configurations?: Array<{ nodes?: Array<{ cpeMatch?: Array<{ criteria: string }> }> }>;
}

export async function indexCveCorpus(env: Env): Promise<{ indexed: number; errors: number }> {
  let indexed = 0;
  let errors = 0;

  try {
    const res = await fetch('https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=50&startIndex=0', {
      headers: { 'User-Agent': 'pranithjain.qzz.io DFIR toolkit' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return { indexed, errors: errors + 1 };

    const body = (await res.json()) as {
      vulnerabilities?: Array<{ cve: NvdCveItem }>;
    };
    const items = body.vulnerabilities ?? [];

    for (const item of items) {
      const cve = item.cve;
      const desc = cve.descriptions?.find((d) => d.lang === 'en')?.value ?? '';
      if (!desc || desc.length < 20) continue;

      // Extract CVSS from any available metric version
      const cvssV31 = cve.metrics?.cvssMetricV31?.[0]?.cvssData;
      const cvssV30 = cve.metrics?.cvssMetricV30?.[0]?.cvssData;
      const cvssV2 = cve.metrics?.cvssMetricV2?.[0]?.cvssData;
      const cvss = cvssV31 ?? cvssV30 ?? cvssV2;
      const sev = cvss?.baseSeverity ?? 'UNKNOWN';

      const affectedProducts = (cve.configurations ?? [])
        .flatMap((c) => c.nodes ?? [])
        .flatMap((n) => n.cpeMatch ?? [])
        .map((m) => m.criteria)
        .filter((c, i, a) => a.indexOf(c) === i)
        .slice(0, 10);

      const cweList = (cve.weaknesses ?? [])
        .flatMap((w) => w.description ?? [])
        .map((d) => d.value)
        .filter((c, i, a) => a.indexOf(c) === i);

      const refUrls = (cve.references ?? []).map((r) => r.url).filter(Boolean);

      const text = [
        `CVE: ${cve.id}`,
        `Description: ${desc}`,
        affectedProducts.length ? `Affected Products: ${affectedProducts.join(', ')}` : null,
        cweList.length ? `CWE: ${cweList.join(', ')}` : null,
        cvss ? `CVSS Score: ${cvss.baseScore} (${cvss.baseSeverity})` : null,
        refUrls.length ? `References: ${refUrls.slice(0, 5).join(', ')}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      try {
        const n = await indexDocument(env, {
          source_id: `cve-${cve.id}`,
          source_type: 'cve',
          title: `[${sev}] ${cve.id} — ${desc.slice(0, 120)}`,
          text,
          timestamp: cve.published ?? new Date().toISOString(),
          tags: ['cve', sev.toLowerCase(), ...cweList.map((c) => c.toLowerCase().replace(/\s+/g, '-'))],
        });
        indexed += n;
      } catch {
        errors++;
      }
    }
  } catch {
    errors++;
  }

  return { indexed, errors };
}

// ── Actor KB Indexer ─────────────────────────────────────────────────────

export async function indexActorKb(env: Env): Promise<{ indexed: number; errors: number }> {
  let indexed = 0;
  let errors = 0;

  try {
    // Index local ACTOR_DNA data for behavioral patterns
    const { getAllActorsDNA } = await import('./actor-dna');
    const db = getAllActorsDNA() as unknown as Array<{
      actor_id: string;
      actor_name: string;
      aliases: string[];
      ttp_signature: Record<string, string[]>;
      victimology: Record<string, string[]>;
      first_seen: string;
      last_seen: string;
    }>;

    for (const a of db) {
      // victimology mixes string[] (sectors, regions) with plain strings
      // (organization_size, ransom_range) — guard so a non-array value doesn't
      // throw `.join is not a function` and abort the whole actor loop.
      const fmt = (obj: Record<string, unknown>): string =>
        Object.entries(obj)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
          .join('\n');
      const ttpText = a.ttp_signature ? fmt(a.ttp_signature as Record<string, unknown>) : '';
      const vicText = a.victimology ? fmt(a.victimology as Record<string, unknown>) : '';
      const text = [
        `Actor: ${a.actor_name} (${a.actor_id})`,
        a.aliases?.length ? `Aliases: ${a.aliases.join(', ')}` : null,
        ttpText ? `TTP Signature:\n${ttpText}` : null,
        vicText ? `Victimology:\n${vicText}` : null,
        a.first_seen ? `First seen: ${a.first_seen}` : null,
        a.last_seen ? `Last seen: ${a.last_seen}` : null,
      ]
        .filter(Boolean)
        .join('\n\n');

      if (text.length < 30) continue;
      try {
        const n = await indexDocument(env, {
          source_id: `actor-dna-${a.actor_id}`,
          source_type: 'actor_kb',
          title: `${a.actor_name} — Behavioral DNA Profile`,
          text,
          timestamp: a.last_seen ?? new Date().toISOString(),
          tags: ['actor', 'dna', a.actor_id],
        });
        indexed += n;
      } catch {
        errors++;
      }
    }
  } catch {
    errors++;
  }

  return { indexed, errors };
}

// ── Ransomware Claims Indexer ────────────────────────────────────────────

export async function indexRansomwareClaims(env: Env): Promise<{ indexed: number; errors: number }> {
  let indexed = 0;
  let errors = 0;

  // Pull from the internal /api/v1/ransomware-recent endpoint rather than
  // hitting ransomlook directly — the direct fetch routinely exceeded the 15s
  // timeout (ransomlook is slow) and the ransomwatch posts.json body is large
  // enough to abort mid-read. The internal handler is resilient + edge-cached.
  try {
    const apiApp = (await import('../index')).default;
    // Pass a stub executionCtx — the target handlers call c.executionCtx.waitUntil
    // for cache writes, which throws (→ 500) if ctx is absent. waitUntil becomes a
    // no-op here; we only need the response body.
    const stubCtx = { waitUntil: () => {}, passThroughOnException: () => {} } as ExecutionContext;
    const res = await apiApp.fetch(new Request('https://internal/api/v1/ransomware-recent'), env, stubCtx);
    if (!res.ok) return { indexed, errors: errors + 1 };
    const body = (await res.json()) as {
      victims?: Array<{ victim?: string; group?: string; discovered?: string; description?: string }>;
    };
    const entries = body.victims ?? [];

    for (const entry of entries.slice(0, 100)) {
      const victim = entry.victim ?? '';
      const group = entry.group ?? 'unknown';
      const discovered = entry.discovered ?? new Date().toISOString();
      const desc = entry.description ?? '';
      if (!victim || victim.length < 2) continue;
      const text = [
        `Ransomware Group: ${group}`,
        `Victim: ${victim}`,
        desc ? `Details: ${desc}` : null,
        `Discovered: ${discovered}`,
      ]
        .filter(Boolean)
        .join('\n');

      try {
        const n = await indexDocument(env, {
          source_id: `ransomware-${group}-${victim.replace(/[^a-zA-Z0-9]/g, '_')}-${discovered.slice(0, 10)}`,
          source_type: 'ransomware_claim',
          title: `${group} claims attack on ${victim}`,
          text,
          timestamp: discovered,
          tags: ['ransomware', group.toLowerCase()],
        });
        indexed += n;
      } catch {
        errors++;
      }
    }
  } catch {
    errors++;
  }

  return { indexed, errors };
}

// ── Breach Disclosures Indexer ───────────────────────────────────────────

export async function indexBreachCorpus(env: Env): Promise<{ indexed: number; errors: number }> {
  let indexed = 0;
  let errors = 0;

  // HIBP API v3 requires an API key. Delegate to the existing breach-disclosures
  // internal handler which serves edge-cached data and works without an API key.
  try {
    const apiApp = (await import('../index')).default;
    const internalReq = new Request('https://internal/api/v1/breach-disclosures', { method: 'GET' });
    // Stub executionCtx — see indexRansomwareClaims; the handler's waitUntil cache
    // write throws without it (→ 500 → errors:1).
    const stubCtx = { waitUntil: () => {}, passThroughOnException: () => {} } as ExecutionContext;
    const res = await apiApp.fetch(internalReq, env, stubCtx);
    if (!res.ok) return { indexed, errors: errors + 1 };
    const body = (await res.json()) as {
      breaches?: Array<{
        name: string;
        title?: string;
        domain?: string;
        breach_date?: string;
        added_date?: string;
        pwn_count?: number;
        description?: string;
        data_classes?: string[];
        verified?: boolean;
      }>;
    };
    const raw = body.breaches ?? [];
    const seen = new Set<string>();

    for (const b of raw) {
      const key = b.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      const desc = (b.description ?? '').trim();
      if (!desc || desc.length < 20) continue;

      const text = [
        `Breach: ${b.title ?? b.name}`,
        b.domain ? `Domain: ${b.domain}` : null,
        b.breach_date ? `Date: ${b.breach_date}` : null,
        b.pwn_count != null ? `Affected accounts: ${b.pwn_count.toLocaleString()}` : null,
        b.data_classes?.length ? `Data exposed: ${b.data_classes.join(', ')}` : null,
        `Description: ${desc}`,
      ]
        .filter(Boolean)
        .join('\n');

      try {
        const n = await indexDocument(env, {
          source_id: `breach-${b.name}`,
          source_type: 'breach',
          title: `${b.title ?? b.name}${b.pwn_count != null ? ` — ${b.pwn_count.toLocaleString()} accounts` : ''}`,
          text,
          timestamp: b.added_date ?? b.breach_date ?? new Date().toISOString(),
          tags: ['breach', ...(b.data_classes ?? []).map((c) => c.toLowerCase().replace(/\s+/g, '-'))],
        });
        indexed += n;
      } catch {
        errors++;
      }
    }
  } catch {
    errors++;
  }

  return { indexed, errors };
}

// ── Combined Indexer ─────────────────────────────────────────────────────

export async function indexAllCorpora(env: Env): Promise<{
  cve: { indexed: number; errors: number };
  actor_kb: { indexed: number; errors: number };
  ransomware: { indexed: number; errors: number };
  breach: { indexed: number; errors: number };
}> {
  // Run corpora SEQUENTIALLY (not in parallel) — each indexer embeds many docs,
  // and 4 concurrent embed loops overwhelm the Workers AI rate limit. One at a
  // time keeps concurrent AI load to a single in-flight embed.
  const safe = async (fn: () => Promise<{ indexed: number; errors: number }>) => {
    try {
      return await fn();
    } catch {
      return { indexed: 0, errors: 1 };
    }
  };
  const cve = await safe(() => indexCveCorpus(env));
  const actor_kb = await safe(() => indexActorKb(env));
  const ransomware = await safe(() => indexRansomwareClaims(env));
  const breach = await safe(() => indexBreachCorpus(env));

  return { cve, actor_kb, ransomware, breach };
}
