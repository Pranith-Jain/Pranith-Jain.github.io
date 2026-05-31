import type { Context, Next } from 'hono';
import type { Env } from '../env';

/**
 * CSRF protection via origin / referer header validation.
 *
 * For every mutation request (POST, DELETE, PATCH, PUT), checks that the
 * request's `Origin` or `Referer` header matches the canonical origin.
 * This prevents a malicious site from tricking a logged-in operator's
 * browser into issuing a state-changing request (briefing build, admin
 * action, etc.) while they browse another tab.
 *
 * The `X-Admin-Token` header already authenticates mutation endpoints;
 * this middleware adds defence-in-depth against CSRF on top of that.
 *
 * Fail-closed: if the origin cannot be verified, the request is rejected
 * with 403. The only bypass is `Origin` header not being sent AND `Referer`
 * header not being sent, which is extremely rare for browser-initiated
 * mutations (browsers always send `Origin` on cross-origin POST and
 * `Referer` on same-origin mutations).
 *
 * Same-origin policy: for same-origin requests (Origin matches the
 * canonical domain), the request passes. For cross-origin requests
 * (which should never happen for our API since the frontend is on the
 * same domain), the request is rejected.
 */
const ALLOWED_ORIGINS = [
  'https://pranithjain.qzz.io',
  'http://localhost:5173', // vite dev server
  'http://localhost:8787', // wrangler dev
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8787',
];

export async function csrfGuard(c: Context<{ Bindings: Env }>, next: Next): Promise<Response | void> {
  const method = c.req.method;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const url = new URL(c.req.url);
  // Only apply to API routes
  if (!url.pathname.startsWith('/api/v1/') && !url.pathname.startsWith('/api/taxii2/')) {
    return next();
  }

  const origin = c.req.header('Origin');
  const referer = c.req.header('Referer');

  // Check origin first (more reliable), then fall back to referer.
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return next();
  }

  // Check referer as fallback (browsers always send one of the two).
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (ALLOWED_ORIGINS.includes(refererOrigin)) {
        return next();
      }
    } catch {
      // Malformed referer — reject.
    }
  }

  // No Origin AND no Referer → this is a server-to-server or CLI request,
  // not a browser-initiated mutation. Browsers always send at least one
  // of these headers on POST/DELETE/PATCH/PUT. Let it through — auth
  // (admin token, API key) provides the real protection for non-browser
  // callers; this guard is defence-in-depth against browser CSRF.
  //
  // NOTE: this is safe only because every mutation endpoint behind this
  // guard also requires authentication (authenticate('required') or
  // authenticate('external-only') which requires a key for POST/DELETE).
  // If a mutation endpoint is added WITHOUT auth, this bypass would
  // allow unauthenticated server-to-server mutations.
  if (!origin && !referer) {
    return next();
  }

  return c.json(
    {
      error: 'csrf_rejected',
      message: 'invalid origin',
    },
    403,
    { 'cache-control': 'no-store' }
  );
}
