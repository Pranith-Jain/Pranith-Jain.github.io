import type { Context } from 'hono';
import type { Env } from '../env';
import { requireAdmin } from '../lib/admin-auth';
import {
  isReconConfigured,
  isReconTool,
  runRecon,
  ReconBridgeError,
  ReconUnconfiguredError,
} from '../lib/recon-bridge';

/**
 * Admin-gated proxy to a self-hosted recon bridge (see lib/recon-bridge.ts).
 *
 * Active recon (Subfinder/Amass/theHarvester/SpiderFoot) against arbitrary
 * targets is an abuse vector — running it from the operator's infrastructure
 * could implicate them in scanning third parties — so the route is gated on
 * `ADMIN_TOKEN` and the target is restricted to a safe charset. Returns 503
 * when `RECON_BRIDGE_URL` is unset.
 */

const RECON_TIMEOUT_MS = 120_000; // passive recon over many sources can be slow
const MAX_TARGET_LEN = 253;
// Domain / IP / email charset only — excludes whitespace and shell
// metacharacters. Anchored so the first and last chars are alphanumeric: this
// blocks a leading-dash target (e.g. "-config", "-rf") from being parsed as a
// CLI *flag* by the recon tool on the bridge (argument injection — execFile's
// arg array stops shell injection but NOT argument injection).
const TARGET_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._:@-]*[a-zA-Z0-9])?$/;

const SETUP_HINT =
  'Set RECON_BRIDGE_URL (and optionally RECON_BRIDGE_TOKEN) to a self-hosted recon service reached through a Cloudflare Tunnel. See docs/self-hosted/recon-bridge.md.';

type Ctx = Context<{ Bindings: Env }>;

function isTimeout(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    ((err as { name: unknown }).name === 'TimeoutError' || (err as { name: unknown }).name === 'AbortError')
  );
}

export async function reconScanHandler(c: Ctx): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;
  if (!isReconConfigured(c.env)) {
    return c.json({ error: 'recon bridge not configured', setup: SETUP_HINT }, 503);
  }

  let body: { tool?: unknown; target?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  const tool = typeof body.tool === 'string' ? body.tool : '';
  const target = typeof body.target === 'string' ? body.target.trim() : '';
  if (!isReconTool(tool)) {
    return c.json({ error: 'unsupported tool (expected: subfinder, amass, theharvester, spiderfoot)' }, 400);
  }
  if (!target || target.length > MAX_TARGET_LEN || !TARGET_RE.test(target)) {
    return c.json({ error: 'invalid target (expected a domain/host/email; no spaces or special characters)' }, 400);
  }

  try {
    const result = await runRecon(c.env, { tool, target }, AbortSignal.timeout(RECON_TIMEOUT_MS));
    return c.json(result, 200);
  } catch (err) {
    if (err instanceof ReconUnconfiguredError) {
      return c.json({ error: 'recon bridge not configured', setup: SETUP_HINT }, 503);
    }
    if (isTimeout(err)) return c.json({ error: 'recon bridge timed out' }, 504);
    if (err instanceof ReconBridgeError) return c.json({ error: err.message }, 502);
    // Generic for unknown errors — avoids leaking an internal bridge hostname
    // that might appear in a raw fetch/abort message.
    return c.json({ error: 'recon bridge error' }, 502);
  }
}
