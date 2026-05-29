/**
 * Validate a URL for use in an `href`/`src`. Threat-intel feeds (breach dumps,
 * dark-web, IOC feeds, telegram/X/reddit) are attacker-influenced, so any value
 * rendered into a link must be scheme-checked: a `javascript:` or `data:` URL
 * in an anchor is a phishing / (CSP-permitting) script-execution vector.
 *
 * Returns the normalized URL when the scheme is in the allowlist, else `''`
 * (callers should treat an empty result as "no link" — render plain text).
 */
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];

export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = String(url).trim();
  try {
    const parsed = new URL(trimmed);
    return SAFE_SCHEMES.includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}
