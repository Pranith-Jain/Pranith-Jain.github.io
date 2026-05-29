import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';

/**
 * GET /api/v1/sandbox/lookup?hash=<hash>
 * Query multiple sandbox platforms for a file hash.
 * Returns consensus verdict across all responding sources.
 */

interface SandboxResult {
  source: string;
  status: 'malicious' | 'suspicious' | 'clean' | 'unknown';
  score?: number;
  verdict?: string;
  summary?: string;
  link?: string;
  families?: string[];
  tags?: string[];
  behaviors?: Array<{ severity: string; category: string; description: string }>;
}

const HASH_RE = /^[a-fA-F0-9]{32,64}$/;

async function queryMalwareBazaar(hash: string): Promise<SandboxResult | null> {
  try {
    const res = await fetchResilient('https://mb-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `query=get_info&hash=${hash}`,
    }, { attempts: 2, timeoutMs: 8000 });
    if (!res.ok) return null;
    const data = (await res.json()) as { query_status?: string; data?: Array<{ signature?: string; tags?: string[]; file_type?: string }> };
    if (data.query_status !== 'ok' || !data.data?.length) return null;
    const sample = data.data[0];
    if (!sample) return null;
    return {
      source: 'MalwareBazaar',
      status: 'malicious',
      score: 90,
      verdict: sample.signature ?? 'Known malware sample',
      families: sample.signature ? [sample.signature] : [],
      tags: sample.tags ?? [],
      link: `https://bazaar.abuse.ch/browse/sha256/${hash}`,
    };
  } catch { return null; }
}

async function queryThreatFox(hash: string): Promise<SandboxResult | null> {
  try {
    const res = await fetchResilient('https://threatfox-api.abuse.ch/api/v1/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'search_ioc', search_term: hash }),
    }, { attempts: 2, timeoutMs: 8000 });
    if (!res.ok) return null;
    const data = (await res.json()) as { query_status?: string; data?: Array<{ malware?: string; threat_type?: string; confidence_level?: number }> };
    if (data.query_status !== 'ok' || !data.data?.length) return null;
    const ioc = data.data[0];
    if (!ioc) return null;
    return {
      source: 'ThreatFox',
      status: 'malicious',
      score: ioc.confidence_level ?? 75,
      verdict: ioc.malware ? `Associated with ${ioc.malware}` : 'Known IOC',
      families: ioc.malware ? [ioc.malware] : [],
      tags: ioc.threat_type ? [ioc.threat_type] : [],
      link: `https://threatfox.abuse.ch/browse/malware/${hash}`,
    };
  } catch { return null; }
}

async function queryUrlhaus(hash: string): Promise<SandboxResult | null> {
  try {
    const res = await fetchResilient(`https://urlhaus-api.abuse.ch/v1/payload/${hash}`, {
      method: 'GET',
    }, { attempts: 2, timeoutMs: 8000 });
    if (!res.ok) return null;
    const data = (await res.json()) as { query_status?: string; urls?: Array<{ url?: string; threat?: string }> };
    if (data.query_status !== 'ok' || !data.urls?.length) return null;
    return {
      source: 'URLhaus',
      status: 'malicious',
      score: 80,
      verdict: `Found in ${data.urls.length} malicious URLs`,
      tags: [...new Set(data.urls.map((u) => u.threat).filter(Boolean) as string[])],
      link: `https://urlhaus.abuse.ch/browse/payload/${hash}`,
    };
  } catch { return null; }
}

export async function sandboxLookupHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const hash = c.req.query('hash')?.trim();
  if (!hash || !HASH_RE.test(hash)) {
    return c.json({ error: 'bad_request', message: 'valid MD5, SHA-1, or SHA-256 hash required' }, 400);
  }

  const results = await Promise.all([
    queryMalwareBazaar(hash),
    queryThreatFox(hash),
    queryUrlhaus(hash),
  ]);

  const valid = results.filter((r): r is SandboxResult => r !== null);

  // Compute consensus
  const malicious = valid.filter((r) => r.status === 'malicious').length;
  const suspicious = valid.filter((r) => r.status === 'suspicious').length;
  const total = valid.length;

  let verdict = 'unknown';
  let confidence = 0;
  if (total > 0) {
    if (malicious >= Math.ceil(total * 0.6)) {
      verdict = 'malicious';
      confidence = Math.min(100, Math.round((malicious / total) * 100));
    } else if (malicious + suspicious >= Math.ceil(total * 0.5)) {
      verdict = 'suspicious';
      confidence = Math.min(100, Math.round(((malicious + suspicious) / total) * 100));
    } else if (malicious === 0 && suspicious === 0) {
      verdict = 'clean';
      confidence = Math.min(100, Math.round((total / 3) * 50));
    }
  }

  return c.json({
    hash,
    results: valid,
    consensus: { verdict, confidence, sources_agreeing: malicious },
  }, 200, { 'cache-control': 'public, max-age=3600' });
}
