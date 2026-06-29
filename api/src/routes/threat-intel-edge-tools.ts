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
    const idx = await mod.loadTiIndex((c.env as any).ASSETS);
    return c.json({
      source: idx.source,
      license: idx.license,
      replicatedAt: idx.replicatedAt,
      lastSyncedAt: idx.lastSyncedAt,
      counts: idx.counts,
    });
  } catch (e) {
    return internalError(c, `ti_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List CVEs ──────────────────────────────────────────────────────────
threatIntelRouter.get('/threat-intel/cves', async (c) => {
  try {
    const mod = await loadTiMod();
    const idx = await mod.loadTiIndex((c.env as any).ASSETS);
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
    return internalError(c, `ti_cves_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single CVE ─────────────────────────────────────────────────────────
threatIntelRouter.get('/threat-intel/cves/:cveId', async (c) => {
  const cveId = c.req.param('cveId');
  try {
    const mod = await loadTiMod();
    const body = await mod.getTiCve((c.env as any).ASSETS, cveId);
    if (!body) return notFound(c, `cve_not_found: ${cveId}`);
    return c.json(body);
  } catch (e) {
    return internalError(c, `ti_cve_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── KEV snapshot ──────────────────────────────────────────────────────
threatIntelRouter.get('/threat-intel/kev', async (c) => {
  try {
    const mod = await loadTiMod();
    const kev = await mod.loadKevSnapshot((c.env as any).ASSETS);
    const vendor = c.req.query('vendor');
    const limit = c.req.query('limit') ? Math.min(500, Math.max(1, Number(c.req.query('limit')))) : undefined;
    const needle = vendor?.toLowerCase();
    const out = needle ? kev.filter((e: { vendor: string }) => e.vendor.toLowerCase().includes(needle)) : kev;
    const sliced = limit ? out.slice(0, limit) : out;
    return c.json({ total: kev.length, returned: sliced.length, entries: sliced });
  } catch (e) {
    return internalError(c, `ti_kev_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List IOCs ─────────────────────────────────────────────────────────
threatIntelRouter.get('/threat-intel/iocs', async (c) => {
  try {
    const mod = await loadTiMod();
    const idx = await mod.loadTiIndex((c.env as any).ASSETS);
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
    return internalError(c, `ti_iocs_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Single IOC family ─────────────────────────────────────────────────
threatIntelRouter.get('/threat-intel/iocs/:slug', async (c) => {
  const slug = c.req.param('slug');
  try {
    const mod = await loadTiMod();
    const body = await mod.getTiIoc((c.env as any).ASSETS, slug);
    if (!body) return notFound(c, `ioc_family_not_found: ${slug}`);
    return c.json(body);
  } catch (e) {
    return internalError(c, `ti_ioc_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── List sectors ──────────────────────────────────────────────────────
threatIntelRouter.get('/threat-intel/sectors', async (c) => {
  try {
    const mod = await loadTiMod();
    const idx = await mod.loadTiIndex((c.env as any).ASSETS);
    return c.json({ sectors: idx.sectors });
  } catch (e) {
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
    const body = await mod.getTiSector((c.env as any).ASSETS, sector);
    if (!body) return notFound(c, `sector_not_found: ${sector}`);
    return c.json(body);
  } catch (e) {
    return internalError(c, `ti_sector_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// ─── Stats ─────────────────────────────────────────────────────────────
threatIntelRouter.get('/threat-intel/stats', async (c) => {
  try {
    const mod = await loadTiMod();
    const idx = await mod.loadTiIndex((c.env as any).ASSETS);
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
    return internalError(c, `ti_stats_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});
