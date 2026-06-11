/**
 * Build the CSP value. When `nonce` is provided (HTML responses only),
 * `script-src` switches from the legacy `'unsafe-inline'` to nonce-based
 * — the one inline `<script>` in index.html (the theme-flash preventer)
 * gets a matching `nonce` attribute injected, and every other inline
 * script (i.e. anything an attacker manages to inject) is blocked.
 *
 * `style-src 'unsafe-inline'` is retained because React components ship
 * inline `style={...}` attributes throughout the SPA — removing it would
 * require a much bigger refactor (CSS-in-JS extraction, no inline style
 * props) than the threat warrants given XSS is multi-layer-blocked
 * (server regex sanitiser → client DOMPurify → blocked by script-src).
 */
// NOTE: script-src does NOT include 'unsafe-inline'. API responses are JSON or
// server-built HTML (briefing print, RSS, OG image) that never need inline
// scripts, so disallowing them means an injected inline <script> cannot execute
// even if an output-escaping gap is reintroduced (defence-in-depth for CSP-1).
const CSP_API =
  "default-src 'self';script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com;style-src 'self' 'unsafe-inline';img-src 'self' data: https:;connect-src 'self' https://api.cloudflare.com https://cloudflare-dns.com https://cloudflareinsights.com https://*.cloudflareinsights.com https://unpkg.com https://mr-akuma.github.io https://nominatim.openstreetmap.org;font-src 'self' data:;frame-ancestors 'none';base-uri 'self';form-action 'self';object-src 'none'";

export function cspHeader(nonce?: string): string {
  if (!nonce) return CSP_API;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://static.cloudflareinsights.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.cloudflare.com https://cloudflare-dns.com https://cloudflareinsights.com https://*.cloudflareinsights.com https://unpkg.com https://mr-akuma.github.io https://nominatim.openstreetmap.org",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join(';');
}

export function withSecurityHeaders(response: Response, nonce?: string): Response {
  // ASSETS binding returns responses with immutable headers. Clone into
  // a mutable Headers object so we can add CSP and other security headers.
  const h = new Headers(response.headers);
  h.set('content-security-policy', cspHeader(nonce));
  if (!h.has('x-content-type-options')) h.set('x-content-type-options', 'nosniff');
  if (!h.has('x-frame-options')) h.set('x-frame-options', 'DENY');
  if (!h.has('referrer-policy')) h.set('referrer-policy', 'strict-origin-when-cross-origin');
  if (!h.has('permissions-policy'))
    h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  if (!h.has('strict-transport-security'))
    h.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
  if (!h.has('cross-origin-opener-policy')) h.set('cross-origin-opener-policy', 'same-origin');
  if (!h.has('cross-origin-embedder-policy')) h.set('cross-origin-embedder-policy', 'require-corp');
  // Remove the default Cloudflare server header but don't replace it with
  // a custom value — no need to advertise the server identity.
  h.delete('server');
  // Bodyless statuses (101 switching-protocols, 204/205/304) are defined to
  // carry a null body — passing response.body for one throws RangeError. The
  // current call graph never emits these here, but guarding keeps
  // withSecurityHeaders total in case a route later adds ETag/304 support.
  const status = response.status;
  const bodyless = status === 101 || status === 204 || status === 205 || status === 304;
  return new Response(bodyless ? null : response.body, {
    status,
    statusText: response.statusText,
    headers: h,
  });
}

/**
 * Generate a CSP nonce. 128 random bits → base64url-encoded (≈22 chars).
 * Single-pass: no intermediate strings from chained replace() calls.
 */
export function generateNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode.apply(null, b as unknown as number[])).replace(/[=+/]/g, (c) =>
    c === '=' ? '' : c === '+' ? '-' : '_'
  );
}

/**
 * Inject `nonce="…"` into the one inline `<script>` in our index.html
 * (the theme-flash preventer). External scripts (`<script type="module"
 * crossorigin src="…">`) don't need a nonce — they're covered by
 * `script-src 'self'`. Matching `<script>` with no attributes scopes
 * the rewrite to the inline tag only. Idempotent (the cache stores the
 * nonce-less HTML; this runs per request).
 */
export function injectScriptNonce(html: string, nonce: string): string {
  return html.replace(/<script>/g, `<script nonce="${nonce}">`);
}
