/**
 * OSV.dev proxy for the client-side dependency scanner.
 *
 * The browser can't call api.osv.dev directly (no CORS), so this forwards
 * a parsed package list to OSV's batch endpoint, then resolves vuln
 * details. Server-side, fixed upstream host (no SSRF surface), bounded
 * input, short-cached. POST { packages: [{ name, ecosystem, version }] }.
 */
import type { Context } from 'hono';
import type { Env } from '../env';

interface PkgQuery {
  name: string;
  ecosystem: string;
  version?: string;
}
const MAX_PKGS = 250;
const OSV_BATCH = 'https://api.osv.dev/v1/querybatch';
const OSV_VULN = 'https://api.osv.dev/v1/vulns/';

export async function osvScanHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: { packages?: PkgQuery[] };
  try {
    body = (await c.req.json()) as { packages?: PkgQuery[] };
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }
  const pkgs = Array.isArray(body.packages) ? body.packages.slice(0, MAX_PKGS) : [];
  if (pkgs.length === 0) return c.json({ error: 'no_packages' }, 400);

  // OSV batch: queries[] index-aligned with the response.
  const queries = pkgs.map((p) => ({
    package: { name: p.name, ecosystem: p.ecosystem },
    ...(p.version ? { version: p.version } : {}),
  }));

  let batch: { results?: Array<{ vulns?: Array<{ id: string }> }> };
  try {
    const r = await fetch(OSV_BATCH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'pranithjain-dfir/1.0' },
      body: JSON.stringify({ queries }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return c.json({ error: 'osv_upstream', status: r.status }, 502);
    batch = (await r.json()) as typeof batch;
  } catch {
    return c.json({ error: 'osv_unreachable' }, 502);
  }

  // Collect the unique vuln ids, resolve details once each (cap the fan-out).
  const idToPkgs = new Map<string, number[]>();
  (batch.results ?? []).forEach((res, i) => {
    for (const v of res.vulns ?? []) {
      const arr = idToPkgs.get(v.id) ?? [];
      arr.push(i);
      idToPkgs.set(v.id, arr);
    }
  });
  const ids = [...idToPkgs.keys()].slice(0, 400);

  const details = new Map<string, { summary?: string; severity?: string; aliases?: string[]; fixed?: string }>();
  const pool = async () => {
    let i = 0;
    const worker = async () => {
      while (i < ids.length) {
        const id = ids[i++]!;
        try {
          const dr = await fetch(OSV_VULN + encodeURIComponent(id), {
            headers: { 'user-agent': 'pranithjain-dfir/1.0' },
            signal: AbortSignal.timeout(8000),
          });
          if (!dr.ok) continue;
          const d = (await dr.json()) as Record<string, unknown>;
          const sev = Array.isArray(d.severity)
            ? (d.severity as { type?: string; score?: string }[]).find((s) => /CVSS/i.test(String(s.type)))?.score
            : undefined;
          // First "fixed" event across affected ranges.
          let fixed: string | undefined;
          for (const aff of (d.affected as Record<string, unknown>[]) ?? []) {
            for (const rng of (aff.ranges as Record<string, unknown>[]) ?? []) {
              for (const ev of (rng.events as Record<string, string>[]) ?? []) if (ev.fixed) fixed = ev.fixed;
            }
          }
          details.set(id, {
            summary: String(d.summary ?? d.details ?? '').slice(0, 240),
            severity: sev,
            aliases: Array.isArray(d.aliases) ? (d.aliases as string[]) : [],
            fixed,
          });
        } catch {
          /* skip a single failed detail lookup */
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, ids.length) }, worker));
  };
  await pool();

  const results = pkgs.map((p, i) => {
    const vulnIds = (batch.results?.[i]?.vulns ?? []).map((v) => v.id);
    return {
      package: p.name,
      version: p.version ?? '',
      ecosystem: p.ecosystem,
      vulns: vulnIds.map((id) => ({ id, ...(details.get(id) ?? {}) })),
    };
  });

  return c.json({ generated_at: new Date().toISOString(), total_packages: pkgs.length, results }, 200, {
    'cache-control': 'public, max-age=300',
  });
}
