/**
 * Threat Intel edge tools — REST surface for CVE/KEV/IOC/sector data.
 *
 * Endpoints (all under /api/v1/threat-intel/):
 *   GET  /threat-intel/                — slim index
 *   GET  /threat-intel/cves            — list CVEs with filters (severity, kevOnly, vendor, etc.)
 *   GET  /threat-intel/cves/:cveId     — full CVE body
 *   GET  /threat-intel/kev             — CISA KEV snapshot (all entries)
 *   GET  /threat-intel/iocs            — list IOC families with filters
 *   GET  /threat-intel/iocs/:slug      — full IOC family body
 *   GET  /threat-intel/sectors         — list available sectors
 *   GET  /threat-intel/sectors/:sector — sector brief
 *   GET  /threat-intel/stats           — cache + manifest stats
 *
 * The actual logic lives in worker/lib/threat-intel-manifest.ts (symlinked).
 * Routes read from env.ASSETS — no D1, no KV, no public fetch.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { badRequest, internalError, notFound } from '../lib/api-error';

async function loadTiMod() {
  return await import('../lib/threat-intel-manifest');
}

export const threatIntelRouter = new Hono<{ Bindings: Env }>();

// ─── Slim index ────────────────────────────────────────────────────────
threatIntelRouter.get('/threat-intel/', async (c) => {
  try {
    const mod = await loadTiMod();
    const idx = await mod.loadTiIndex(c.env.ASSETS);
    return c.json({
      source: idx.source,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      lastSyncedAt: idx.lastSyncedAt,
      counts: idx.counts,
    });
  } catch (e) {
    console.error('loadTiMod failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `ti_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List CVEs ──────────────────────────────────────────────────────────
threatIntelRouter.get('/threat-intel/cves', async (c) => {
  try {
    const mod = await loadTiMod();
    const idx = await mod.loadTiIndex(c.env.ASSETS);
    const severity = c.req.query('severity');
    const kevOnly = c.req.query('kev_only') === 'true';
    const vendor = c.req.query('vendor');
    const daysBack = c.req.query('days_back')
      ? Math.min(365, Math.max(1, Number(c.req.query('days_back'))))
      : undefined;
    const minPriority = c.req.query('min_priority') ? Number(c.req.query('min_priority')) : undefined;
    const keyword = c.req.query('q');
    const limit = c.req.query('limit') ? Math.min(200, Math.max(1, Number(c.req.query('limit')))) : undefined;

    const cves = mod.filterCves(idx, {
      severity: severity as any,
      kevOnly: kevOnly || undefined,
      vendor: vendor || undefined,
      daysBack,
      minPriority,
      keyword: keyword || undefined,
      limit,
    });
    return c.json({ total: idx.counts.cves, returned: cves.length, cves });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `ti_cves_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single CVE ─────────────────────────────────────────────────────────
threatIntelRouter.get('/threat-intel/cves/:cveId', async (c) => {
  const cveId = c.req.param('cveId');
  try {
    const mod = await loadTiMod();
    const body = await mod.getTiCve(c.env.ASSETS, cveId);
    if (!body) return notFound(c, `cve_not_found: ${cveId}`);
    return c.json(body);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `ti_cve_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── KEV snapshot ──────────────────────────────────────────────────────
threatIntelRouter.get('/threat-intel/kev', async (c) => {
  try {
    const mod = await loadTiMod();
    const kev = await mod.loadKevSnapshot(c.env.ASSETS);
    const vendor = c.req.query('vendor');
    const limit = c.req.query('limit') ? Math.min(500, Math.max(1, Number(c.req.query('limit')))) : undefined;
    const needle = vendor?.toLowerCase();
    const out = needle ? kev.filter((e: { vendor: string }) => e.vendor.toLowerCase().includes(needle)) : kev;
    const sliced = limit ? out.slice(0, limit) : out;
    return c.json({ total: kev.length, returned: sliced.length, entries: sliced });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `ti_kev_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List IOCs ─────────────────────────────────────────────────────────
threatIntelRouter.get('/threat-intel/iocs', async (c) => {
  try {
    const mod = await loadTiMod();
    const idx = await mod.loadTiIndex(c.env.ASSETS);
    const category = c.req.query('category');
    const keyword = c.req.query('q');
    const limit = c.req.query('limit') ? Math.min(100, Math.max(1, Number(c.req.query('limit')))) : undefined;

    const iocs = mod.filterIocs(idx, {
      category: (category as any) || undefined,
      keyword: keyword || undefined,
      limit,
    });
    return c.json({ total: idx.counts.iocs, returned: iocs.length, iocs });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `ti_iocs_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single IOC family ─────────────────────────────────────────────────
threatIntelRouter.get('/threat-intel/iocs/:slug', async (c) => {
  const slug = c.req.param('slug');
  try {
    const mod = await loadTiMod();
    const body = await mod.getTiIoc(c.env.ASSETS, slug);
    if (!body) return notFound(c, `ioc_family_not_found: ${slug}`);
    return c.json(body);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `ti_ioc_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List sectors ──────────────────────────────────────────────────────
threatIntelRouter.get('/threat-intel/sectors', async (c) => {
  try {
    const mod = await loadTiMod();
    const idx = await mod.loadTiIndex(c.env.ASSETS);
    return c.json({ sectors: idx.sectors });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `ti_sectors_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single sector brief ───────────────────────────────────────────────
threatIntelRouter.get('/threat-intel/sectors/:sector', async (c) => {
  const sector = c.req.param('sector').toLowerCase();
  if (!['financial', 'healthcare', 'government'].includes(sector)) {
    return badRequest(c, `invalid_sector: ${sector} — must be financial, healthcare, or government`);
  }
  try {
    const mod = await loadTiMod();
    const body = await mod.getTiSector(c.env.ASSETS, sector);
    if (!body) return notFound(c, `sector_not_found: ${sector}`);
    return c.json(body);
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `ti_sector_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Stats ─────────────────────────────────────────────────────────────
threatIntelRouter.get('/threat-intel/stats', async (c) => {
  try {
    const mod = await loadTiMod();
    const idx = await mod.loadTiIndex(c.env.ASSETS);
    const cache = mod.tiCacheStats();
    return c.json({
      counts: idx.counts,
      source: idx.source,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      lastSyncedAt: idx.lastSyncedAt,
      cache,
    });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return internalError(c, `ti_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Live enrichment search routes ──────────────────────────────────────
const SEARCH_TIMEOUT_MS = 20_000;

threatIntelRouter.get('/threat-intel/search/otx', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'missing q parameter' }, 400);
  const apiKey = c.env.OTX_API_KEY;
  if (!apiKey) return c.json({ error: 'OTX_API_KEY not configured', results: [] });
  try {
    const res = await fetch(`https://otx.alienvault.com/api/v1/search/pulses?q=${encodeURIComponent(q)}&limit=20`, {
      headers: { 'X-OTX-API-KEY': apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) return c.json({ error: `OTX returned ${res.status}` }, 502);
    const data = (await res.json()) as {
      results?: Array<{
        id: string;
        name: string;
        description: string;
        tags: string[];
        indicator_count: number;
        malware_families: unknown[];
        attack_ids: Array<{ display_name: string }>;
      }>;
    };
    const pulses = (data.results ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      tags: p.tags,
      indicator_count: p.indicator_count,
      malware_families: (p.malware_families ?? [])
        .map((m) => (typeof m === 'string' ? m : ((m as Record<string, string>)?.display_name ?? '')))
        .filter(Boolean),
      attack_ids: (p.attack_ids ?? []).map((a) => a.display_name ?? '').filter(Boolean),
    }));
    return c.json({ query: q, total: pulses.length, pulses });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

threatIntelRouter.get('/threat-intel/search/threatfox', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'missing q parameter' }, 400);
  try {
    const res = await fetch('https://threatfox-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'search_ioc', search_term: q }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) return c.json({ error: `ThreatFox returned ${res.status}` }, 502);
    const data = (await res.json()) as {
      query_status: string;
      data?: Array<{
        ioc_type: string;
        ioc: string;
        malware_printable: string;
        confidence_level: number;
        first_seen: string;
        last_seen: string;
        tags: string[];
        reporter: string;
      }>;
    };
    if (data.query_status === 'no_data') return c.json({ query: q, total: 0, iocs: [] });
    if (data.query_status !== 'ok') return c.json({ error: `query_status: ${data.query_status}` }, 502);
    const iocs = (data.data ?? []).slice(0, 100).map((i) => ({
      ioc_type: i.ioc_type,
      ioc_value: i.ioc,
      malware: i.malware_printable,
      confidence: i.confidence_level != null ? i.confidence_level / 100 : 0,
      first_seen: i.first_seen,
      last_seen: i.last_seen,
      tags: i.tags,
      reporter: i.reporter,
    }));
    return c.json({ query: q, total: iocs.length, iocs });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

threatIntelRouter.get('/threat-intel/search/malwarebazaar', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'missing q parameter' }, 400);
  try {
    let res = await fetch('https://mb-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query: 'get_taginfo', tag: q, limit: '50' }),
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
    let data = (await res.json()) as {
      query_status: string;
      data?: Array<{ sha256_hash: string; file_name: string; signature: string; tags: string[]; first_seen: string }>;
    };
    let mode = 'tag';
    if (data.query_status === 'no_results' || !data.data?.length) {
      mode = 'signature';
      res = await fetch('https://mb-api.abuse.ch/api/v1/', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ query: 'get_siginfo', signature: q, limit: '50' }),
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      });
      data = (await res.json()) as typeof data;
    }
    if (data.query_status === 'no_results') return c.json({ query: q, search_mode: mode, total: 0, samples: [] });
    if (data.query_status !== 'ok') return c.json({ error: `query_status: ${data.query_status}` }, 502);
    const samples = (data.data ?? []).map((s) => ({
      sha256: s.sha256_hash,
      file_name: s.file_name,
      signature: s.signature,
      tags: s.tags,
      first_seen: s.first_seen,
    }));
    return c.json({ query: q, search_mode: mode, total: samples.length, samples });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

threatIntelRouter.get('/threat-intel/search/ransomware-live', async (c) => {
  const q = c.req.query('q');
  if (!q) return c.json({ error: 'missing q parameter' }, 400);
  const headers = { 'User-Agent': 'pranithjain-dfir/1.0', accept: 'application/json' };
  try {
    const groupsRes = await fetch('https://api.ransomware.live/v2/groups', {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!groupsRes.ok) return c.json({ error: `ransomware.live returned ${groupsRes.status}` }, 502);
    const allGroups = (await groupsRes.json()) as Array<{ name: string }>;
    const matched = allGroups.filter((g) => (g.name ?? '').toLowerCase().includes(q.toLowerCase())).slice(0, 5);
    if (!matched.length) return c.json({ query: q, total: 0, groups: [] });
    const fetchDetail = async (name: string) => {
      try {
        const r = await fetch(`https://api.ransomware.live/v2/group/${encodeURIComponent(name)}`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        });
        const text = await r.text();
        if (!text.trim().startsWith('{')) return null;
        const d = JSON.parse(text) as {
          name: string;
          description?: string;
          locations?: Array<{ fqdn?: string }>;
          ttps?: string[];
          tools?: string[];
          _victim_count?: number;
        };
        return {
          name: d.name ?? name,
          description: d.description ?? '',
          onion_urls: (d.locations ?? []).filter((l) => l.fqdn?.includes('.onion')).map((l) => l.fqdn!),
          ttps: d.ttps ?? [],
          tools: d.tools ?? [],
          victim_count: d._victim_count ?? 0,
        };
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        return null;
      }
    };
    const details = (await Promise.all(matched.map((g) => fetchDetail(g.name)))).filter(Boolean);
    return c.json({ query: q, total: details.length, groups: details });
  } catch (e) {
    console.error('handler failed:', e instanceof Error ? e.message : String(e));
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
