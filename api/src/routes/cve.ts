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
      const cvssScore = (data as any)?.cvss?.score ?? null;
      const epssScore = (data as any)?.epss?.score ?? null;
      const kev = (data as any)?.kev === true;
      const ransomwareUse = (data as any)?.ransomware_use === 'Known' || (data as any)?.ransomware_use === 'Suspected';
      const exploitStatus = (data as any)?.exploit_status ?? null;

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
    } catch {
      if (data) return c.json(data, 200, { 'Cache-Control': 'public, max-age=1800, s-maxage=3600' });
    }
  }
  return res;
}
