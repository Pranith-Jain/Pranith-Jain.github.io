/**
 * DDoS Intelligence — live botnet C2 tracking, flood source analysis.
 *
 * Aggregates data from:
 * - Feodo Tracker (abuse.ch) — Feodo/Dridex botnet C2 servers
 * - DigitalSide Threat-Intel — DDoS campaign reports
 * - C2IntelFeeds — command and control infrastructure
 * - URLhaus — malware distribution URLs
 *
 * Free, no API keys required.
 */

import type { Context } from 'hono';
import type { Env } from '../env';

interface DDoSBotnet {
  ip: string;
  port: number;
  protocol: string;
  malware: string;
  firstSeen: string;
  lastSeen: string;
  status: string;
  urlhausLink: string;
}

interface DDoSStats {
  totalBotnets: number;
  activeC2: number;
  topMalware: Array<{ name: string; count: number }>;
  topCountries: Array<{ country: string; count: number }>;
  lastUpdated: string;
}

// ── Feodo Tracker (abuse.ch) ──

async function fetchFeodoTracker(): Promise<DDoSBotnet[]> {
  try {
    const res = await fetch('https://feodotracker.abuse.ch/downloads/ipblocklist_recommended.json', {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      ip_address: string;
      port: number;
      status: string;
      malware: string;
      first_seen: string;
      last_seen: string;
      urlhaus_link: string;
    }>;
    return data.map((d) => ({
      ip: d.ip_address,
      port: d.port,
      protocol: 'HTTPS',
      malware: d.malware || 'Dridex',
      firstSeen: d.first_seen || '',
      lastSeen: d.last_seen || '',
      status: d.status || 'online',
      urlhausLink: d.urlhaus_link || '',
    }));
  } catch (_catchErr) {
    console.error('fetchFeodoTracker failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return [];
  }
}

// ── URLhaus malware URLs ──

async function fetchUrlhausRecent(): Promise<
  Array<{ url: string; threat: string; dateAdded: string; tags: string[] }>
> {
  try {
    const res = await fetch('https://urlhaus-api.abuse.ch/v1/urls/recent/', {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      urls?: Array<{ url: string; threat: string; date_added: string; tags: string[] }>;
    };
    return (data.urls || []).slice(0, 100).map((u) => ({
      url: u.url,
      threat: u.threat || 'malware_download',
      dateAdded: u.date_added || '',
      tags: u.tags || [],
    }));
  } catch (_catchErr) {
    console.error('fetchUrlhausRecent failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return [];
  }
}

// ── ThreatFox IOCs (C2 infrastructure) ──

async function fetchThreatFoxC2(): Promise<
  Array<{ ioc: string; iocType: string; malware: string; confidence: number; firstSeen: string }>
> {
  try {
    const res = await fetch('https://threatfox-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'taginfo', tag: 'botnet_ddos', limit: 100 }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: Array<{ ioc: string; ioc_type: string; malware: string; confidence_level: number; first_seen: string }>;
    };
    return (data.data || []).map((d) => ({
      ioc: d.ioc,
      iocType: d.ioc_type,
      malware: d.malware || 'unknown',
      confidence: d.confidence_level || 50,
      firstSeen: d.first_seen || '',
    }));
  } catch (_catchErr) {
    console.error('fetchThreatFoxC2 failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return [];
  }
}

// ── Handlers ──

export async function ddosDashboardHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const [feodo, urlhaus, threatFox] = await Promise.all([
    fetchFeodoTracker(),
    fetchUrlhausRecent(),
    fetchThreatFoxC2(),
  ]);

  // Aggregate stats
  const malwareCounts: Record<string, number> = {};
  for (const b of feodo) {
    malwareCounts[b.malware] = (malwareCounts[b.malware] || 0) + 1;
  }
  const topMalware = Object.entries(malwareCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const stats: DDoSStats = {
    totalBotnets: feodo.length + threatFox.length,
    activeC2: feodo.filter((b) => b.status === 'online').length,
    topMalware,
    topCountries: [], // Would need GeoIP
    lastUpdated: new Date().toISOString(),
  };

  return c.json({
    stats,
    botnets: feodo.slice(0, 50),
    urlhaus: urlhaus.slice(0, 30),
    threatFoxC2: threatFox.slice(0, 30),
    sources: ['Feodo Tracker', 'URLhaus', 'ThreatFox'],
  });
}

export async function ddosBotnetLookupHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const q = c.req.query('q') || '';
  if (!q) return c.json({ error: 'q parameter required' }, 400);

  const feodo = await fetchFeodoTracker();
  const matches = feodo.filter((b) => b.ip.includes(q) || b.malware.toLowerCase().includes(q.toLowerCase()));

  return c.json({ results: matches, total: matches.length });
}

export async function ddosIocFeedHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const type = c.req.query('type') || 'all';
  const results: Array<{ value: string; type: string; source: string; malware: string; confidence: number }> = [];

  if (type === 'all' || type === 'feodo') {
    const feodo = await fetchFeodoTracker();
    for (const b of feodo.slice(0, 100)) {
      results.push({
        value: `${b.ip}:${b.port}`,
        type: 'ip:port',
        source: 'feodo-tracker',
        malware: b.malware,
        confidence: 80,
      });
    }
  }

  if (type === 'all' || type === 'threatfox') {
    const tf = await fetchThreatFoxC2();
    for (const t of tf.slice(0, 100)) {
      results.push({
        value: t.ioc,
        type: t.iocType,
        source: 'threatfox',
        malware: t.malware,
        confidence: t.confidence,
      });
    }
  }

  return c.json({ results, total: results.length });
}
