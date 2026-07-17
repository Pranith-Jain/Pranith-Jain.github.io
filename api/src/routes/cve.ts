import type { Context } from 'hono';
import type { Env } from '../env';
import { createCveController } from '../controllers';
import { createKvCveRepository } from '../infrastructure/persistence/kv-cve-repository';
import { vulncheckCve } from '../lib/vulncheck';
import { computeSsvcV } from '../lib/ssvc-v';

export async function cveSearchHandler(c: Context<{ Bindings: Env }>) {
  const repo = createKvCveRepository(c.env.KV_CACHE);
  const controller = createCveController(repo);
  const res = await controller.search(c);

  // Enrich with VulnCheck real-world exploitation intel (initial-access index)
  // when a token is configured and the base lookup succeeded.
  const token = c.env.VULNCHECK_API_TOKEN;
  const id = c.req.query('id');
  if (res.status === 200 && id) {
    let data: Record<string, unknown> | null = null;
    try {
      data = (await res.json()) as Record<string, unknown>;

      // VulnCheck enrichment
      if (token) {
        const vc = await vulncheckCve(token, id, AbortSignal.timeout(6000));
        if ('ok' in vc) data.vulncheck = vc.ok;
      }

      // SSVC-V decision engine enrichment
      const d = data as Record<string, Record<string, unknown> | boolean | string | null>;
      const cvssScore = (d?.cvss as { score?: number } | undefined)?.score ?? null;
      const epssScore = (d?.epss as { score?: number } | undefined)?.score ?? null;
      const kev = d?.kev === true;
      const ransomwareUse = d?.ransomware_use === 'Known' || d?.ransomware_use === 'Suspected';
      const exploitStatus = (d?.exploit_status as string | null) ?? null;

      const ssvc = computeSsvcV({
        cvssScore,
        epssScore,
        cisaKev: kev,
        ransomwareUse,
        exploitStatus:
          exploitStatus === 'in-the-wild'
            ? 'active'
            : exploitStatus === 'weaponized' || exploitStatus === 'poc-public'
              ? 'poc'
              : null,
      });
      data.ssvc = ssvc;

      return c.json(data, 200, { 'Cache-Control': 'public, max-age=1800, s-maxage=3600' });
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      if (data) return c.json(data, 200, { 'Cache-Control': 'public, max-age=1800, s-maxage=3600' });
    }
  }
  return res;
}
