import type { Env } from '../../env';
import type { PlannedSource, ResolvedSubject, SourceItem, SourceResult } from './types';
import { readReportCache } from './cache';
import { RANSOMWARE_RECENT_CACHE_KEY } from '../../routes/ransomware-recent';
import { LIVE_IOCS_CACHE_KEY } from '../../routes/live-iocs';
import { ACTOR_TIMELINE_CACHE_KEY } from '../../routes/actor-timeline';
import { WRITEUPS_CACHE_KEY } from '../../routes/writeups';
import { DETECTIONS_CACHE_KEY } from '../../routes/detections';
import { CYBERCRIME_CACHE_KEY } from '../../routes/cybercrime';
import { NEGOTIATIONS_CACHE_KEY } from '../../routes/negotiations';
import { CVE_RECENT_CACHE_KEY } from '../../routes/cve-recent';
import { IOC_CORRELATION_CACHE_KEY } from '../../routes/ioc-correlation';
import { lookupCve } from '../cve-lookup';
import { queryCorpus } from '../rag-embedder';
import { fetchRlUpstream } from '../../routes/ransomwarelive';
import { virustotal } from '../../providers/virustotal';
import { abuseipdb } from '../../providers/abuseipdb';
import { otx } from '../../providers/otx';
import { greynoise } from '../../providers/greynoise';
import { urlscan } from '../../providers/urlscan';
import { malwarebazaar } from '../../providers/malwarebazaar';
import { vulncheck } from '../../providers/vulncheck';
import { vulncheckCve } from '../vulncheck';
import type { ProviderAdapter } from '../../providers/types';

export interface GatherContext {
  env: Env;
  subject: ResolvedSubject;
  signal: AbortSignal;
}

type Fetcher = (ctx: GatherContext, src: PlannedSource) => Promise<SourceResult>;

const MAX_ITEMS = 50;

function base(src: PlannedSource, status: SourceResult['status'], items: SourceItem[] = []): SourceResult {
  return {
    id: src.id,
    name: src.name,
    authority: src.authority,
    fetched_at: new Date().toISOString(),
    status,
    items: items.slice(0, MAX_ITEMS),
    total: items.length,
  };
}

const needle = (s: GatherContext) => s.subject.canonical.toLowerCase();
const has = (txt: unknown, q: string) => typeof txt === 'string' && txt.toLowerCase().includes(q);

/** Build a fetcher that reads a cache key and maps matching rows to SourceItems. */
function cacheFetcher(key: string, pick: (data: unknown, q: string) => SourceItem[]): Fetcher {
  return async (ctx, src) => {
    const data = await readReportCache<unknown>(key);
    if (!data) return base(src, 'empty');
    const items = pick(data, needle(ctx));
    return base(src, items.length ? 'ok' : 'empty', items);
  };
}

/** Build a fetcher that runs a provider adapter for ip/domain/hash subjects. */
function providerFetcher(adapter: ProviderAdapter): Fetcher {
  return async (ctx, src) => {
    const t = ctx.subject.type;
    const type = t === 'ip' ? 'ipv4' : t === 'domain' ? 'domain' : t === 'hash' ? 'sha256' : null;
    if (!type) return base(src, 'empty');
    try {
      const r = await adapter({ type, value: ctx.subject.canonical } as never, { ...ctx.env } as never, ctx.signal);
      if (r.status !== 'ok') return base(src, r.status === 'error' ? 'error' : 'empty');
      const item: SourceItem = {
        text: `${r.source}: ${r.verdict} (score ${r.score})${r.tags.length ? ' · ' + r.tags.join(', ') : ''}`,
        fields: r.raw_summary,
        observed_at: r.fetched_at,
      };
      return base(src, 'ok', [item]);
    } catch {
      return base(src, 'error');
    }
  };
}

// ---- row pickers (typed loosely; the cache shapes are heterogeneous) ----
type Row = Record<string, unknown>;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

export const FETCHERS: Record<string, Fetcher> = {
  'ransomware-recent': cacheFetcher(RANSOMWARE_RECENT_CACHE_KEY, (d, q) =>
    arr((d as Row).victims)
      .filter((v) => has(v.group, q) || has(v.victim, q))
      .map((v) => ({
        text: `${str(v.victim) ?? '?'} claimed by ${str(v.group) ?? '?'} (${str(v.discovered) ?? ''}) ${str(v.description) ?? ''}`.trim(),
        url: str(v.source_url),
        observed_at: str(v.discovered),
        fields: v,
      }))
  ),
  negotiations: cacheFetcher(NEGOTIATIONS_CACHE_KEY, (d, q) =>
    arr((d as Row).negotiations)
      .filter((n) => has(n.group, q))
      .map((n) => ({
        text: `${str(n.group)} negotiation: initial ${String(n.initial_ransom ?? '?')} → ${String(n.negotiated_ransom ?? '?')} (paid: ${String(n.paid)})`,
        observed_at: str(n.date),
        fields: n,
      }))
  ),
  'actor-timeline': cacheFetcher(ACTOR_TIMELINE_CACHE_KEY, (d, q) =>
    arr((d as Row).groups)
      .filter((g) => has(g.slug, q) || has(g.display_name, q))
      .map((g) => ({ text: `${str(g.display_name) ?? str(g.slug)}: ${str(g.description) ?? ''}`.trim(), fields: g }))
  ),
  writeups: cacheFetcher(WRITEUPS_CACHE_KEY, (d, q) =>
    arr((d as Row).items)
      .filter((w) => has(w.title, q) || has(w.description, q))
      .map((w) => ({
        text: `${str(w.title)} — ${str(w.source)}`,
        url: str(w.url),
        observed_at: str(w.published),
        fields: w,
      }))
  ),
  cybercrime: cacheFetcher(CYBERCRIME_CACHE_KEY, (d, q) =>
    arr((d as Row).items)
      .filter((i) => has(i.title, q) || has(i.description, q))
      .map((i) => ({
        text: `${str(i.title)} — ${str(i.source)}`,
        url: str(i.url),
        observed_at: str(i.published),
        fields: i,
      }))
  ),
  detections: cacheFetcher(DETECTIONS_CACHE_KEY, (d, q) =>
    arr((d as Row).detections)
      .filter((x) => has(x.rule_name, q) || has(x.description, q))
      .map((x) => ({ text: `Detection: ${str(x.rule_name) ?? str(x.rule_id)}`, fields: x }))
  ),
  'cve-recent': cacheFetcher(CVE_RECENT_CACHE_KEY, (d, q) =>
    arr((d as Row).cves)
      .filter((c) => has(c.id, q) || has(c.description, q))
      .map((c) => ({
        text: `${str(c.id)} (${str(c.severity) ?? ''} ${String(c.score ?? '')}): ${str(c.description) ?? ''}`.trim(),
        observed_at: str(c.published),
        fields: c,
      }))
  ),
  'breach-disclosures': cacheFetcher('https://breach-cache.internal/v6-hibp-only', (d, q) =>
    arr((d as Row).breaches)
      .filter((b) => has(b.title, q) || has(b.name, q) || has(b.domain, q))
      .map((b) => ({ text: `${str(b.title) ?? str(b.name) ?? '?'}: ${str(b.description) ?? ''}`.trim(), fields: b }))
  ),
  'live-iocs': cacheFetcher(LIVE_IOCS_CACHE_KEY, (d, q) =>
    arr((d as Row).items)
      .filter((i) => has(i.value, q) || has(i.context, q))
      .map((i) => ({
        text: `${str(i.value)} (${str(i.kind)}) — ${str(i.source)} ${str(i.context) ?? ''}`.trim(),
        url: str(i.reference_url),
        observed_at: str(i.observed_at),
        fields: i,
      }))
  ),
  'ioc-correlation': cacheFetcher(IOC_CORRELATION_CACHE_KEY, (d, q) => {
    const buckets = ['ips', 'urls', 'domains', 'hashes'] as const;
    const out: SourceItem[] = [];
    for (const b of buckets)
      for (const row of arr((d as Row)[b]))
        if (has(row.value, q))
          out.push({
            text: `${str(row.value)} seen in ${String(row.source_count ?? 0)} sources`,
            observed_at: str(row.last_seen),
            fields: row,
          });
    return out;
  }),

  // RAG
  'rag-corpus': async (ctx, src) => {
    try {
      const chunks = await queryCorpus(ctx.env, ctx.subject.canonical, 8);
      // Keep only chunks that actually mention the subject OR are a strong
      // semantic match (score ≥ 0.7). Loosely-similar chunks (e.g. unrelated
      // old CVEs surfaced for a brand-new CVE) only pad the report with noise.
      const q = ctx.subject.canonical.toLowerCase();
      const relevant = chunks.filter((c) => {
        const hay = `${c.metadata.text ?? ''} ${c.metadata.title ?? ''}`.toLowerCase();
        return hay.includes(q) || c.score >= 0.7;
      });
      const items: SourceItem[] = relevant.map((c) => ({
        text: c.metadata.text ?? c.metadata.title ?? '',
        url: c.metadata.url,
        observed_at: c.metadata.timestamp,
        fields: { score: c.score, source_type: c.metadata.source_type, title: c.metadata.title },
      }));
      return base(src, items.length ? 'ok' : 'empty', items);
    } catch {
      return base(src, 'error');
    }
  },

  // CVE live lookup (used by cve template ids nvd/epss/kev — one call covers all three)
  nvd: cveFetcher(),
  epss: cveFetcher(),
  kev: cveFetcher(),

  // ransomware.live group profile
  'ransomwarelive-profile': async (ctx, src) => {
    try {
      const rl = (await fetchRlUpstream(
        ctx.env,
        `/group/${encodeURIComponent(ctx.subject.canonical.toLowerCase())}`
      )) as {
        description?: string;
        ttps?: unknown[];
        vulnerabilities?: { CVE?: string }[];
        tools?: Record<string, string[]>;
        victims?: number;
      } | null;
      if (!rl) return base(src, 'empty');
      const items: SourceItem[] = [];
      if (rl.description) items.push({ text: rl.description, fields: { kind: 'description' } });
      if (typeof rl.victims === 'number')
        items.push({ text: `Victim count: ${rl.victims}`, fields: { kind: 'victims', victims: rl.victims } });
      for (const v of rl.vulnerabilities ?? [])
        if (v.CVE) items.push({ text: `Exploits ${v.CVE}`, fields: { kind: 'cve', cve: v.CVE } });
      for (const [tool, refs] of Object.entries(rl.tools ?? {}))
        items.push({ text: `Tool: ${tool}`, fields: { kind: 'tool', tool, refs } });
      return base(src, items.length ? 'ok' : 'empty', items);
    } catch {
      return base(src, 'error');
    }
  },

  // MITRE techniques for a known group
  'mitre-group': async (ctx, src) => {
    const { ACTOR_ALIASES } = await import('../../data/threat-actor-aliases');
    const { techniquesForGroup } = await import('../ransomware-group-techniques');
    const q = needle(ctx);
    const match = ACTOR_ALIASES.find(
      (a) =>
        a.mitreId && (a.slug === q || a.canonical.toLowerCase() === q || a.aliases.some((x) => x.toLowerCase() === q))
    );
    if (!match?.mitreId) return base(src, 'empty');
    const techs = techniquesForGroup(match.mitreId);
    return base(
      src,
      techs.length ? 'ok' : 'empty',
      techs.map((t) => ({ text: `${t.id} ${t.name} (${t.tactic})`, fields: { kind: 'mitre', ...t } }))
    );
  },

  // Providers (ioc template)
  virustotal: providerFetcher(virustotal),
  abuseipdb: providerFetcher(abuseipdb),
  otx: providerFetcher(otx),
  greynoise: providerFetcher(greynoise),
  urlscan: providerFetcher(urlscan),
  malwarebazaar: providerFetcher(malwarebazaar),
  vulncheck: providerFetcher(vulncheck),

  // VulnCheck CVE exploitation intel (cve template)
  'vulncheck-cve': async (ctx, src) => {
    if (ctx.subject.type !== 'cve') return base(src, 'empty');
    const token = ctx.env.VULNCHECK_API_TOKEN;
    if (!token) return base(src, 'empty');
    const vc = await vulncheckCve(token, ctx.subject.canonical, ctx.signal);
    if ('err' in vc) return base(src, 'error');
    if (!vc.ok.exploited) return base(src, 'empty');
    const text = `VulnCheck: ${vc.ok.cve} has real-world exploitation intel (${vc.ok.records} record(s))${vc.ok.reported.length ? ` · reported by ${vc.ok.reported.join(', ')}` : ''}.`;
    return base(src, 'ok', [
      { text, fields: { kind: 'vulncheck', exploited: true, records: vc.ok.records, reported: vc.ok.reported } },
    ]);
  },

  // Supply-chain incidents (supplychainattack.org) — for ransomware/actor subjects.
  // One live fetch of the upstream catalog, filtered to incidents matching the subject.
  'supply-chain-attacks': async (ctx, src) => {
    if (ctx.subject.type !== 'ransomware' && ctx.subject.type !== 'actor') return base(src, 'empty');
    const q = needle(ctx);
    try {
      const res = await fetch('https://supplychainattack.org/incidents.json', {
        headers: { 'User-Agent': 'pranithjain-dfir/1.0', accept: 'application/json' },
        cf: { cacheTtl: 900, cacheEverything: true },
        signal: ctx.signal,
      } as RequestInit);
      if (!res.ok) return base(src, 'error');
      const data = (await res.json()) as { incidents?: unknown };
      const items: SourceItem[] = [];
      for (const inc of arr(data.incidents)) {
        const iocs = (inc.iocs ?? {}) as Row;
        const packages = Array.isArray(iocs.packages) ? (iocs.packages as unknown[]) : [];
        const entities = arr(inc.affectedEntities);
        const match =
          has(inc.title, q) ||
          has(inc.summary, q) ||
          packages.some((p) => has(p, q)) ||
          entities.some((e) => has((e as Row).name, q));
        if (!match) continue;
        const ecosystems = Array.isArray(inc.ecosystems) ? (inc.ecosystems as string[]).join(', ') : '';
        items.push({
          text: `${str(inc.title) ?? 'Supply-chain incident'} (${str(inc.severity) ?? 'n/a'}, ${str(inc.status) ?? 'n/a'})${ecosystems ? ` · ${ecosystems}` : ''}`,
          url: str(inc.url),
          fields: { kind: 'supply-chain', ecosystems: inc.ecosystems, attack_vectors: inc.attackVectors, packages, status: inc.status },
        });
        if (items.length >= MAX_ITEMS) break;
      }
      return base(src, items.length ? 'ok' : 'empty', items);
    } catch {
      return base(src, 'error');
    }
  },
};

// Shared CVE fetcher (nvd/epss/kev all resolve from one lookupCve call).
function cveFetcher(): Fetcher {
  return async (ctx, src) => {
    if (ctx.subject.type !== 'cve') return base(src, 'empty');
    const r = await lookupCve(ctx.subject.canonical);
    if (!r.ok) return base(src, r.status === 404 ? 'empty' : 'error');
    const d = r.data;
    // Emit explicit, separately-citable facts so the writer states KEV/CVSS/
    // affected-product/actor correctly instead of guessing from a one-liner.
    const items: SourceItem[] = [];
    if (d.description)
      items.push({
        text: `${d.cve_id}: ${d.description}`,
        observed_at: d.published,
        fields: { kind: 'cve', cve: d.cve_id },
      });
    if (d.cvss) {
      items.push({
        text: `CVSS ${d.cvss.base_score} (${d.cvss.severity})${d.cvss.vector ? `, vector ${d.cvss.vector}` : ''}.`,
        fields: { kind: 'cve', cve: d.cve_id, cvss: d.cvss.base_score, severity: d.cvss.severity },
      });
    }
    items.push({
      text: d.kev?.in_kev
        ? `CISA KEV: LISTED${d.kev.date_added ? ` (added ${d.kev.date_added}` : ''}${d.kev.due_date ? `, remediation due ${d.kev.due_date})` : d.kev.date_added ? ')' : ''}${d.kev.known_ransomware ? ' · tied to known ransomware campaigns' : ''}.`
        : `CISA KEV: not listed.`,
      fields: { kind: 'cve', cve: d.cve_id, kev: !!d.kev?.in_kev },
    });
    if (d.epss)
      items.push({
        text: `EPSS: ${d.epss.score} (${Math.round((d.epss.percentile ?? 0) * 100)}th percentile).`,
        fields: { kind: 'cve', cve: d.cve_id, epss: d.epss.score },
      });
    if (d.affected_products?.length)
      items.push({
        text: `Affected: ${d.affected_products.slice(0, 8).join('; ')}.`,
        fields: { kind: 'cve', cve: d.cve_id },
      });
    if (d.actors?.length)
      items.push({
        text: `Reported threat actors: ${d.actors.join(', ')}.`,
        fields: { kind: 'cve', cve: d.cve_id, actors: d.actors },
      });
    return base(src, items.length ? 'ok' : 'empty', items);
  };
}

/** Run every fetcher in the given phase concurrently; missing fetchers → empty result. */
export async function gatherPhase(
  plan: { phases: PlannedSource[][] },
  phaseIndex: number,
  ctx: GatherContext
): Promise<SourceResult[]> {
  const phase = plan.phases[phaseIndex] ?? [];
  const settled = await Promise.allSettled(
    phase.map((src) => {
      const fetcher = FETCHERS[src.id];
      if (!fetcher) return Promise.resolve(base(src, 'empty'));
      return fetcher(ctx, src);
    })
  );
  return settled.map((s, i) => (s.status === 'fulfilled' ? s.value : base(phase[i] as PlannedSource, 'error')));
}
