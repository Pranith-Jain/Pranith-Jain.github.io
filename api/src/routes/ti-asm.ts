/**
 * Attack Surface Monitor
 *
 * Monitors subdomains, IPs, certificates, and暴露 for an organization.
 * Provides continuous monitoring with change detection and alerting.
 *
 * GET  /api/v1/ti/asm/scan — Trigger a surface scan
 * GET  /api/v1/ti/asm/domains — List monitored domains
 * POST /api/v1/ti/asm/domains — Add domain to monitor
 * GET  /api/v1/ti/asm/changes — Get recent changes
 * GET  /api/v1/ti/asm/assets — Get discovered assets
 * GET  /api/v1/ti/asm/summary — Get attack surface summary
 */

import { Hono } from 'hono';
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';

interface AsmEnv {
  BRIEFINGS_DB: D1Database;
  KV_CACHE: KVNamespace;
}

interface MonitoredDomain {
  id: string;
  domain: string;
  added_at: string;
  last_scan: string;
  status: 'active' | 'paused' | 'error';
  asset_count: number;
  change_count: number;
}

interface Asset {
  id: string;
  domain: string;
  type: 'subdomain' | 'ip' | 'certificate' | 'port' | 'technology';
  value: string;
  metadata: Record<string, unknown>;
  first_seen: string;
  last_seen: string;
  status: 'new' | 'changed' | 'removed' | 'stable';
}

interface SurfaceChange {
  id: string;
  domain: string;
  type: 'asset_added' | 'asset_removed' | 'asset_changed' | 'new_subdomain' | 'cert_expiry' | 'dns_change';
  description: string;
  severity: 'high' | 'medium' | 'low';
  timestamp: string;
  details: Record<string, unknown>;
}

const asm = new Hono<{ Bindings: AsmEnv }>();

// Simple DNS resolution helper (uses fetch to resolve)
async function resolveSubdomains(domain: string): Promise<string[]> {
  const commonPrefixes = [
    'www', 'mail', 'ftp', 'smtp', 'pop', 'imap', 'webmail',
    'api', 'dev', 'staging', 'test', 'admin', 'portal',
    'cdn', 'static', 'assets', 'media', 'images', 'img',
    'app', 'mobile', 'm', 'beta', 'alpha', 'demo',
    'vpn', 'remote', 'ssh', 'rdp', 'jump', 'bastion',
    'db', 'mysql', 'postgres', 'redis', 'mongo', 'elastic',
    'k8s', 'docker', 'registry', 'ci', 'jenkins', 'gitlab',
    'grafana', 'prometheus', 'monitor', 'logs', 'kibana',
    'auth', 'sso', 'oauth', 'login', 'accounts',
    'cloud', 'aws', 'azure', 'gcp', 's3',
    'status', 'health', 'uptime', 'metrics',
    'docs', 'wiki', 'kb', 'help', 'support',
    'blog', 'news', 'press', 'media',
    'shop', 'store', 'pay', 'checkout', 'billing',
  ];

  const subdomains: string[] = [];

  for (const prefix of commonPrefixes) {
    try {
      const response = await fetch(`https://dns.google/resolve?name=${prefix}.${domain}&type=A`, {
        headers: { 'Accept': 'application/json' },
      });
      const data = await response.json() as { Status: number; Answer?: Array<{ data: string }> };
      if (data.Status === 0 && data.Answer?.length) {
        subdomains.push(`${prefix}.${domain}`);
      }
    } catch {
      // DNS resolution failed, skip
    }
  }

  return subdomains;
}

asm.get('/domains', async (c) => {
  const db = c.env.BRIEFINGS_DB;

  const { results } = await db.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM asm_assets WHERE domain_id = d.id) as asset_count,
      (SELECT COUNT(*) FROM asm_changes WHERE domain_id = d.id AND created_at > datetime('now', '-7 days')) as change_count
    FROM asm_domains d
    ORDER BY d.last_scan DESC
  `).all<MonitoredDomain>();

  return c.json({ domains: results || [] });
});

asm.post('/domains', async (c) => {
  const db = c.env.BRIEFINGS_DB;
  const body = await c.req.json<{ domain: string }>();

  if (!body.domain || !/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(body.domain)) {
    return c.json({ error: 'Invalid domain' }, 400);
  }

  // Check if already exists
  const existing = await db.prepare('SELECT id FROM asm_domains WHERE domain = ?')
    .bind(body.domain.toLowerCase())
    .first<{ id: string }>();

  if (existing) {
    return c.json({ error: 'Domain already monitored' }, 409);
  }

  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO asm_domains (id, domain, added_at, last_scan, status)
    VALUES (?, ?, datetime('now'), datetime('now'), 'active')
  `).bind(id, body.domain.toLowerCase()).run();

  return c.json({ domain: { id, domain: body.domain.toLowerCase(), status: 'active' } }, 201);
});

asm.get('/scan', async (c) => {
  const db = c.env.BRIEFINGS_DB;
  const kv = c.env.KV_CACHE;
  const domain = c.req.query('domain');

  if (!domain) {
    return c.json({ error: 'domain parameter required' }, 400);
  }

  // Get or create domain record
  let domainRecord = await db.prepare('SELECT id FROM asm_domains WHERE domain = ?')
    .bind(domain.toLowerCase())
    .first<{ id: string }>();

  if (!domainRecord) {
    const id = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO asm_domains (id, domain, added_at, last_scan, status)
      VALUES (?, ?, datetime('now'), datetime('now'), 'active')
    `).bind(id, domain.toLowerCase()).run();
    domainRecord = { id };
  }

  // Scan for subdomains
  const subdomains = await resolveSubdomains(domain.toLowerCase());
  const assets: Asset[] = [];

  for (const sub of subdomains) {
    const id = crypto.randomUUID();
    assets.push({
      id,
      domain: domain.toLowerCase(),
      type: 'subdomain',
      value: sub,
      metadata: {},
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      status: 'new',
    });
  }

  // Check for existing assets to determine new vs known
  const existingAssets = await db.prepare('SELECT value FROM asm_assets WHERE domain_id = ?')
    .bind(domainRecord.id)
    .all<{ value: string }>();

  const existingValues = new Set((existingAssets.results || []).map((a) => a.value));

  const newAssets: Asset[] = [];
  const changes: SurfaceChange[] = [];

  for (const asset of assets) {
    if (existingValues.has(asset.value)) {
      asset.status = 'stable';
      await db.prepare('UPDATE asm_assets SET last_seen = datetime(\'now\') WHERE domain_id = ? AND value = ?')
        .bind(domainRecord.id, asset.value).run();
    } else {
      newAssets.push(asset);
      changes.push({
        id: crypto.randomUUID(),
        domain: domain.toLowerCase(),
        type: 'new_subdomain',
        description: `New subdomain discovered: ${asset.value}`,
        severity: 'medium',
        timestamp: new Date().toISOString(),
        details: { subdomain: asset.value },
      });
    }
  }

  // Insert new assets
  for (const asset of newAssets) {
    await db.prepare(`
      INSERT INTO asm_assets (id, domain_id, type, value, metadata, first_seen, last_seen, status)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), 'new')
    `).bind(asset.id, domainRecord.id, asset.type, asset.value, JSON.stringify(asset.metadata)).run();
  }

  // Record changes
  for (const change of changes) {
    await db.prepare(`
      INSERT INTO asm_changes (id, domain_id, type, description, severity, created_at, details)
      VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
    `).bind(change.id, domainRecord.id, change.type, change.description, change.severity, JSON.stringify(change.details)).run();
  }

  // Update last scan
  await db.prepare('UPDATE asm_domains SET last_scan = datetime(\'now\') WHERE id = ?')
    .bind(domainRecord.id).run();

  return c.json({
    domain: domain.toLowerCase(),
    subdomains_found: subdomains.length,
    new_assets: newAssets.length,
    changes: changes.length,
    assets: newAssets.map((a) => a.value),
    scan_time: new Date().toISOString(),
  });
});

asm.get('/changes', async (c) => {
  const db = c.env.BRIEFINGS_DB;
  const domain = c.req.query('domain');
  const hours = parseInt(c.req.query('hours') || '168');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);

  const since = new Date(Date.now() - hours * 3600000).toISOString();

  let query = `
    SELECT c.*, d.domain
    FROM asm_changes c
    JOIN asm_domains d ON c.domain_id = d.id
    WHERE c.created_at > ?
  `;
  const params: unknown[] = [since];

  if (domain) {
    query += ' AND d.domain = ?';
    params.push(domain.toLowerCase());
  }

  query += ' ORDER BY c.created_at DESC LIMIT ?';
  params.push(limit);

  const { results } = await db.prepare(query).bind(...params).all<SurfaceChange>();

  return c.json({ changes: results || [], period_hours: hours });
});

asm.get('/assets', async (c) => {
  const db = c.env.BRIEFINGS_DB;
  const domain = c.req.query('domain');
  const type = c.req.query('type');
  const status = c.req.query('status');
  const limit = Math.min(parseInt(c.req.query('limit') || '100'), 500);

  let query = `
    SELECT a.*, d.domain
    FROM asm_assets a
    JOIN asm_domains d ON a.domain_id = d.id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (domain) {
    query += ' AND d.domain = ?';
    params.push(domain.toLowerCase());
  }
  if (type) {
    query += ' AND a.type = ?';
    params.push(type);
  }
  if (status) {
    query += ' AND a.status = ?';
    params.push(status);
  }

  query += ' ORDER BY a.last_seen DESC LIMIT ?';
  params.push(limit);

  const { results } = await db.prepare(query).bind(...params).all<Asset>();

  return c.json({ assets: results || [], total: results?.length || 0 });
});

asm.get('/summary', async (c) => {
  const db = c.env.BRIEFINGS_DB;

  const stats = await Promise.all([
    db.prepare('SELECT COUNT(*) as cnt FROM asm_domains').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    db.prepare('SELECT COUNT(*) as cnt FROM asm_assets').first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    db.prepare("SELECT COUNT(*) as cnt FROM asm_changes WHERE created_at > datetime('now', '-24 hours')").first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    db.prepare("SELECT COUNT(*) as cnt FROM asm_changes WHERE severity = 'high' AND created_at > datetime('now', '-24 hours')").first<{ cnt: number }>().catch(() => ({ cnt: 0 })),
    db.prepare('SELECT type, COUNT(*) as cnt FROM asm_assets GROUP BY type ORDER BY cnt DESC').all<{ type: string; cnt: number }>().catch(() => ({ results: [] })),
  ]);

  return c.json({
    domains_monitored: stats[0]?.cnt ?? 0,
    total_assets: stats[1]?.cnt ?? 0,
    changes_24h: stats[2]?.cnt ?? 0,
    high_severity_changes: stats[3]?.cnt ?? 0,
    assets_by_type: stats[4]?.results || [],
    generated_at: new Date().toISOString(),
  });
});

export default asm;
