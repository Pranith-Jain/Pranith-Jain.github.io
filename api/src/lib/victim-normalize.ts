/**
 * Normalize a ransomware victim name to a comparison key.
 *
 * Ransomlook's victim names are dirty: mixed case, domain forms ("acme.com"),
 * legal-entity suffixes ("Acme Corp., LLC"), masked variants ("Acm***"), and
 * sometimes full URLs. We collapse all of these to a stable lowercased
 * alphanumeric key so cross-group re-leak detection has something to join on.
 *
 * The key is intentionally lossy. The original strings are kept alongside so
 * the human can verify any match the normalizer surfaces.
 */

const LEGAL_SUFFIXES = [
  'inc',
  'llc',
  'ltd',
  'limited',
  'corp',
  'corporation',
  'co',
  'company',
  'gmbh',
  'sa',
  'sas',
  'ag',
  'plc',
  'pvt',
  'private',
  'pte',
  'srl',
  'bv',
  'oy',
  'ab',
  'as',
  'kk',
  'kg',
  'spa',
  'spzoo',
  'group',
  'holdings',
  'holding',
  'partners',
  'associates',
  'enterprises',
  'industries',
  'international',
  'global',
  'usa',
  'us',
  'uk',
  'eu',
];

const TLD_SUFFIXES = [
  'com',
  'net',
  'org',
  'io',
  'co',
  'us',
  'uk',
  'eu',
  'de',
  'fr',
  'es',
  'it',
  'jp',
  'au',
  'ca',
  'br',
  'in',
  'mx',
  'cn',
  'ru',
  'biz',
  'info',
  'gov',
];

export function normalizeVictim(raw: string): string {
  let s = raw.trim().toLowerCase();
  // Strip protocol + www.
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  // Strip trailing path/slash.
  s = s.replace(/\/.*$/, '');
  // If domain-shaped, strip the public-suffix portion: "acme.co.uk" → "acme"
  if (/^[a-z0-9\-.]+$/.test(s) && s.includes('.')) {
    const parts = s.split('.');
    while (parts.length > 1 && TLD_SUFFIXES.includes(parts[parts.length - 1]!)) {
      parts.pop();
    }
    s = parts.join('.');
  }
  // Replace commas / ampersands / slashes with spaces.
  s = s.replace(/[,&/+]/g, ' ');
  // Strip masking asterisks ("Acm***" → "acm")
  s = s.replace(/\*+/g, '');
  // Tokenize and drop legal suffixes.
  const tokens = s
    .split(/\s+/)
    .map((t) => t.replace(/[.,]+$/g, ''))
    .filter((t) => t.length > 0 && !LEGAL_SUFFIXES.includes(t));
  s = tokens.join(' ');
  // Strip non-alphanumeric (keep spaces while joining; collapse to a single key).
  s = s.replace(/[^a-z0-9]+/g, '');
  return s;
}
