/**
 * Web infrastructure pivoting — extract favicon mmh3 hash, analytics/tracker
 * IDs (GA, GTM, AdSense), crypto wallets, and SaaS-operator tokens from
 * HTML content. These artifacts enable same-operator correlation: two sites
 * sharing the same favicon hash or GA ID are almost certainly run by the
 * same entity.
 *
 * Ported from cti-expert's /webpivot concept (7onez/cti-expert).
 */

export interface WebPivotArtifact {
  type:
    | 'favicon_hash'
    | 'google_analytics'
    | 'google_tag_manager'
    | 'google_adsense'
    | 'crypto_wallet'
    | 'saas_token'
    | 'phone'
    | 'email';
  value: string;
  confidence: 'exact' | 'strong' | 'weak';
  context: string;
}

export interface WebPivotResult {
  url: string;
  artifacts: WebPivotArtifact[];
  pivotQueries: string[];
  sameOperatorSignals: number;
}

const GA_RE = /(?:UA-\d{4,10}-\d{1,3}|G-[A-Z0-9]{6,14})/g;
const GTM_RE = /GTM-[A-Z0-9]{4,8}/g;
const ADSENSE_RE = /(?:ca-pub-\d{10,16}|pub-\d{10,16})/g;
const BTC_RE = /\b(?:bc1[a-z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g;
const ETH_RE = /\b0x[a-fA-F0-9]{40}\b/g;
const XMR_RE = /\b4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}\b/g;
const PHONE_RE = /\btel:([+\d][\d\s\-().]{6,18})\b/g;
const EMAIL_RE = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;

const SAAS_TOKEN_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'Intercom', re: /intercom-settings[\s\S]{0,200}?app_id["\s:=]+["']?([a-z0-9]{6,10})/gi },
  { name: 'Segment', re: /analytics\.load\(["']([A-Za-z0-9]{20,30})["']\)/g },
  { name: 'Mixpanel', re: /mixpanel\.init\(["']([a-f0-9]{32})["']\)/g },
  { name: 'Amplitude', re: /amplitude\.getInstance\(\)\.init\(["']([a-f0-9]{32})["']\)/g },
  { name: 'Sentry', re: /dsn["\s:=]+["']https:\/\/[a-f0-9]{32}@[^"']+["']/g },
  { name: 'Hotjar', re: /hj\.bootstrap\((\d{5,8})/g },
  { name: 'Zendesk', re: /([\w-]+)\.zendesk\.com/g },
  { name: 'Freshdesk', re: /([\w-]+)\.freshdesk\.com/g },
];

export function extractWebPivotArtifacts(url: string, html: string): WebPivotResult {
  const artifacts: WebPivotArtifact[] = [];
  const seen = new Set<string>();

  const add = (
    type: WebPivotArtifact['type'],
    value: string,
    confidence: WebPivotArtifact['confidence'],
    context: string
  ) => {
    const key = `${type}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    artifacts.push({ type, value, confidence, context });
  };

  for (const m of html.matchAll(GA_RE)) add('google_analytics', m[0], 'exact', 'Google Analytics tracking ID');
  for (const m of html.matchAll(GTM_RE)) add('google_tag_manager', m[0], 'exact', 'Google Tag Manager container ID');
  for (const m of html.matchAll(ADSENSE_RE)) add('google_adsense', m[0], 'exact', 'Google AdSense publisher ID');
  for (const m of html.matchAll(BTC_RE)) add('crypto_wallet', m[0], 'exact', 'Bitcoin address');
  for (const m of html.matchAll(ETH_RE)) add('crypto_wallet', m[0], 'exact', 'Ethereum address');
  for (const m of html.matchAll(XMR_RE)) add('crypto_wallet', m[0], 'exact', 'Monero address');

  for (const m of html.matchAll(PHONE_RE)) {
    const phone = m[1]?.replace(/[\s\-().]/g, '') ?? '';
    if (phone.length >= 7) add('phone', phone, 'strong', 'Phone number from tel: link');
  }

  for (const m of html.matchAll(EMAIL_RE)) add('email', m[0].toLowerCase(), 'strong', 'Email address in page content');

  for (const { name, re } of SAAS_TOKEN_PATTERNS) {
    for (const m of html.matchAll(re)) add('saas_token', m[1] ?? m[0], 'strong', `${name} operator token`);
  }

  const faviconMatch =
    html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i) ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i);
  if (faviconMatch?.[1]) {
    const faviconPath = faviconMatch[1];
    const faviconUrl = faviconPath.startsWith('http') ? faviconPath : new URL(faviconPath, url).href;
    add('favicon_hash', faviconUrl, 'weak', 'Favicon URL — compute mmh3 hash of the .ico bytes for Shodan/FOFA pivot');
  }

  const pivotQueries: string[] = [];
  for (const a of artifacts) {
    if (a.type === 'favicon_hash') pivotQueries.push(`http.favicon.hash:<mmh3-of-${a.value}>`);
    if (a.type === 'google_analytics') pivotQueries.push(`"${a.value}" (Shodan http.html / FOFA body)`);
    if (a.type === 'google_tag_manager') pivotQueries.push(`"${a.value}" (Shodan http.html)`);
    if (a.type === 'google_adsense') pivotQueries.push(`"${a.value}" (Shodan http.html / urlscan)`);
    if (a.type === 'crypto_wallet') pivotQueries.push(`"${a.value}" (blockchain explorer / Shodan http.html)`);
    if (a.type === 'saas_token')
      pivotQueries.push(`"${a.value}" (${a.context} — search for same token on other hosts)`);
  }

  const sameOperatorSignals = artifacts.filter(
    (a) =>
      a.type === 'favicon_hash' ||
      a.type === 'google_analytics' ||
      a.type === 'google_tag_manager' ||
      a.type === 'google_adsense' ||
      a.type === 'saas_token'
  ).length;

  return { url, artifacts, pivotQueries, sameOperatorSignals };
}
