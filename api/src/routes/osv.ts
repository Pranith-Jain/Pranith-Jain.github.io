/**
 * OSV.dev proxy for the client-side dependency scanner.
 *
 * The browser can't call api.osv.dev directly (no CORS), so this forwards
 * a parsed package list to the shared OSV client (lib/supply-chain/osv.ts),
 * then re-shapes its normalized envelope into the frozen wire contract the
 * client scanner + scan_dependencies agent tool depend on. Server-side, fixed
 * upstream host (no SSRF surface), bounded input, short-cached in the response.
 * POST { packages: [{ name, ecosystem, version }] }.
 */
import type { Context } from 'hono';
import type { Env } from '../env';
import { safeJsonBody } from '../lib/safe-body';
import { queryOsvBatch, type OsvPkgQuery } from '../lib/supply-chain/osv';

const MAX_PKGS = 250;

export async function osvScanHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  // 250 packages × ~120 bytes each ≈ 30 KB. 128 KB is comfortable headroom
  // for verbose package names / version strings; depth 5 covers {packages:[{...}]}.
  const parsed = await safeJsonBody<{ packages?: OsvPkgQuery[] }>(c, { maxBytes: 128 * 1024, maxDepth: 5 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;
  const pkgs = Array.isArray(body.packages) ? body.packages.slice(0, MAX_PKGS) : [];
  if (pkgs.length === 0) return c.json({ error: 'no_packages' }, 400);

  const batch = await queryOsvBatch(pkgs, { signal: AbortSignal.timeout(25_000) });
  // Upstream-unreachable: the shared client returns every package with status 'error'.
  if (pkgs.length > 0 && batch.results.every((r) => r.status === 'error')) {
    return c.json({ error: 'osv_unreachable' }, 502);
  }

  // Re-shape the normalized envelope back to the FROZEN wire contract (legacy
  // keys: vuln.severity carries the CVSS score string; no malicious/cvss keys).
  const results = batch.results.map((r) => ({
    package: r.package,
    version: r.version ?? '',
    ecosystem: r.ecosystem,
    vulns: r.findings.map((f) => ({
      id: f.id,
      ...(f.summary ? { summary: f.summary } : {}),
      ...(f.cvss ? { severity: f.cvss } : {}),
      aliases: f.aliases,
      ...(f.fixed ? { fixed: f.fixed } : {}),
    })),
  }));

  return c.json(
    {
      generated_at: batch.fetched_at,
      total_packages: pkgs.length,
      detailed_capped: batch.detailed_capped,
      results,
    },
    200,
    {
      // private: the request body lists a dependency graph (reveals tech stack).
      'cache-control': 'private, max-age=300',
    }
  );
}
