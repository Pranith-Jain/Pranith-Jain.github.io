import type { Context } from 'hono';
import type { Env } from '../env';

interface CertEntry {
  name_value: string;
  issuer_ca_id: number;
  issuer_name: string;
  not_before: string;
  not_after: string;
  serial_number: string;
}

interface CertTransparencyResult {
  domain: string;
  subdomains: string[];
  total_certs: number;
  entries: CertEntry[];
  source: string;
  fetched_at: string;
}

/**
 * Cert Transparency lookup via crt.sh — free, no API key.
 * Equivalent to metabigor's `cert` command.
 */
export async function certTransparencyHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const domain = c.req.query('domain');
  if (!domain) return c.json({ error: 'missing domain' }, 400);

  const clean = domain
    .replace(/^(https?:\/\/)/, '')
    .replace(/\/.*$/, '')
    .trim();
  if (!clean || clean.includes(' ')) return c.json({ error: 'invalid domain' }, 400);

  try {
    const url = `https://crt.sh/?q=${encodeURIComponent(clean)}&output=json`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DFIR-Portfolio/1.0)' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`crt.sh returned ${res.status}`);

    const data = (await res.json()) as CertEntry[];
    const subdomains = new Set<string>();
    for (const entry of data) {
      const names = entry.name_value.split('\n').map((n) => n.trim().toLowerCase());
      for (const n of names) {
        if (n === clean || n === `*.${clean}`) continue;
        if (n.endsWith(`.${clean}`) || n === clean) {
          subdomains.add(n.replace(/^\*\./, ''));
        }
      }
    }

    const result: CertTransparencyResult = {
      domain: clean,
      subdomains: [...subdomains].sort(),
      total_certs: data.length,
      entries: data.slice(0, 50),
      source: 'crt.sh',
      fetched_at: new Date().toISOString(),
    };

    return c.json(result, 200, { 'Cache-Control': 'public, max-age=3600' });
  } catch (err) {
    return c.json(
      { error: `cert transparency lookup failed: ${err instanceof Error ? err.message : String(err)}` },
      502
    );
  }
}
