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

function errName(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'name' in err
    ? ((err as { name: unknown }).name as string)
    : undefined;
}

function isTimeout(err: unknown): boolean {
  // AbortSignal.timeout() throws TimeoutError; other AbortController aborts
  // throw AbortError. The combined signal in the handler above can fire
  // either path — we treat both as a 504 (the bridge took too long or the
  // request was forcibly cancelled by the runtime).
  const name = errName(err);
  return name === 'TimeoutError' || name === 'AbortError';
}

function isClientAbort(err: unknown): boolean {
  // A client disconnect surfaces as an AbortError whose `cause` or message
  // references the request signal. `AbortSignal.timeout()` timeouts don't
  // have that marker, so we can tell them apart and skip writing a response
  // (499 = nginx "client closed request", conventional for this case).
  if (errName(err) !== 'AbortError') return false;
  if (err instanceof Error) {
    const m = err.message ?? '';
    if (m.includes('timeout')) return false;
  }
  return true;
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
    // Combine the 120s timeout with the request's own abort signal so a
    // client disconnect cancels the in-flight bridge call (otherwise the
    // recon CLI keeps running on the operator's box for the full timeout
    // window — a real resource leak, not just a cosmetic one).
    const signal = AbortSignal.any([AbortSignal.timeout(RECON_TIMEOUT_MS), c.req.raw.signal]);
    const result = await runRecon(c.env, { tool, target }, signal);
    return c.json(result, 200);
  } catch (err) {
    if (err instanceof ReconUnconfiguredError) {
      return c.json({ error: 'recon bridge not configured', setup: SETUP_HINT }, 503);
    }
    // Client disconnected before the bridge finished — nothing to report.
    if (isClientAbort(err)) return c.body(null, 499);
    if (isTimeout(err)) return c.json({ error: 'recon bridge timed out' }, 504);
    if (err instanceof ReconBridgeError) return c.json({ error: err.message }, 502);
    // Generic for unknown errors — avoids leaking an internal bridge hostname
    // that might appear in a raw fetch/abort message.
    return c.json({ error: 'recon bridge error' }, 502);
  }
}
