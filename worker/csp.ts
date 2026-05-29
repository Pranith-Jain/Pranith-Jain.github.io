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
const CSP_API =
  "default-src 'self';script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://static.cloudflareinsights.com;style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;img-src 'self' data: https:;connect-src 'self' https://api.cloudflare.com https://cloudflare-dns.com https://cloudflareinsights.com https://*.cloudflareinsights.com;font-src 'self' data: https://fonts.gstatic.com;frame-ancestors 'none';base-uri 'self';form-action 'self';object-src 'none'";

export function cspHeader(nonce?: string): string {
  if (!nonce) return CSP_API;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval' https://static.cloudflareinsights.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.cloudflare.com https://cloudflare-dns.com https://cloudflareinsights.com https://*.cloudflareinsights.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join(';');
}

export function withSecurityHeaders(response: Response, nonce?: string): Response {
  response.headers.set('content-security-policy', cspHeader(nonce));
  const h = response.headers;
  if (!h.has('x-content-type-options')) h.set('x-content-type-options', 'nosniff');
  if (!h.has('x-frame-options')) h.set('x-frame-options', 'DENY');
  if (!h.has('referrer-policy')) h.set('referrer-policy', 'strict-origin-when-cross-origin');
  if (!h.has('permissions-policy'))
    h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  if (!h.has('strict-transport-security'))
    h.set('strict-transport-security', 'max-age=63072000; includeSubDomains; preload');
  if (!h.has('cross-origin-opener-policy')) h.set('cross-origin-opener-policy', 'same-origin');
  if (!h.has('cross-origin-embedder-policy')) h.set('cross-origin-embedder-policy', 'require-corp');
  if (!h.has('server')) h.set('server', 'PranithJain');
  return response;
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
