import type { Context } from 'hono';
import type { Env } from '../env';
import { isCapeConfigured } from '../lib/cape-bridge';
import { isReconConfigured } from '../lib/recon-bridge';

/**
 * GET /api/v1/features
 *
 * Public, unauthenticated boolean map of which optional self-hosted
 * bridges this deployment has configured. The frontend probes this once
 * on load to hide dormant tools (CAPE sandbox, recon bridge) from nav +
 * search until an operator sets the matching `*_BRIDGE_URL` secret — a
 * tool that can only return a 503 setup hint shouldn't be advertised.
 *
 * Returns only booleans — never the URLs or tokens themselves — so it's
 * safe to expose without auth. Short edge-cache: the flags flip within a
 * minute of setting/clearing a secret (which takes effect on the next
 * request without a redeploy).
 */
export function featuresHandler(c: Context<{ Bindings: Env }>): Response {
  return c.json(
    {
      cape: isCapeConfigured(c.env),
      recon: isReconConfigured(c.env),
    },
    200,
    { 'Cache-Control': 'public, max-age=60' }
  );
}
