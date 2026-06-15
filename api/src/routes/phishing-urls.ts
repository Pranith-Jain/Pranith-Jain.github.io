import type { Context } from 'hono';
import type { Env } from '../env';
import { fetchResilient } from '../lib/fetch-resilient';
import { shouldWriteLastGood } from '../lib/lastgood-debounce';

/**
 * Recent phishing URLs (OpenPhish + optional PhishTank enrichment).
 *
 * PhishTank now requires an API key — when PHISHTANK_API_KEY is not set,
 * the system falls back to OpenPhish only. Our built-in brand-keyword
 * detection (brandFromUrl) provides target-brand attribution for OpenPhish
 * URLs, so PhishTank is purely optional enrichment.
 *
 * Source: OpenPhish public feed (https://openphish.com/feed.txt) — one URL
 * per line, refreshed every ~12h.
 *
 * Cached 1h server-side — these feeds update on the order of hours.
 */

/** Exported so /api/v1/feed-status can read the same cached payload directly. */
export const PHISHING_URLS_CACHE_KEY = 'https://phishing-urls-cache.internal/v11-500';
const CACHE_KEY = PHISHING_URLS_CACHE_KEY;
const CACHE_TTL_SECONDS = 3600;
/** OpenPhish is small (<1 MB) — short timeout is fine. */
const FETCH_TIMEOUT_MS_OPENPHISH = 15_000;
/** PhishTank is the verified-online dump — 10–12 MB. Bigger budget. */
const FETCH_TIMEOUT_MS_PHISHTANK = 25_000;
// 2026-05-23: was 100. OpenPhish + PhishTank together return thousands of
// fresh URLs; raise to 500 to align with the rest of the 500-item feeds.
const MAX_ITEMS = 500;

const OPENPHISH_URL = 'https://openphish.com/feed.txt';
/** PhishTank requires a registered API key — URL constructed at fetch time. */
const PHISHTANK_UA =
  'Mozilla/5.0 (compatible; pranithjain-dfir/1.0; +https://pranithjain.qzz.io/threatintel/phishing-urls)';

export interface PhishingUrl {
  url: string;
  source: 'openphish' | 'phishtank';
  /** ISO 8601 timestamp when this URL was first seen by the source. */
  first_seen?: string;
  /** PhishTank-only: target brand (e.g. "Microsoft", "Coinbase"). */
  target?: string;
  /** PhishTank-only: verified by their reviewer pool. */
  verified?: boolean;
}

export interface PhishingSource {
  id: string;
  ok: boolean;
  count: number;
  /** True when this source's data was restored from a last-good cache because upstream failed. */
  stale?: boolean;
}

export interface PhishingUrlsResponse {
  generated_at: string;
  sources: PhishingSource[];
  total: number;
  urls: PhishingUrl[];
}

/**
 * Last-good per-source slice caches. Stored in KV when available (global,
 * cross-colo) with a Cache-API fallback for backward compat with the older
 * deploys that wrote into Cache API directly.
 *
 * Why KV: Cloudflare's Cache API is per-colo, so a successful fetch in colo
 * A is invisible to colo B. Live-iocs and phishing-urls each kick off
 * independent fetches; with per-colo storage, an unlucky colo serves zero
 * indefinitely. KV gives both endpoints the same view.
 */
const PHISHTANK_LASTGOOD_KEY = 'phishing-urls/phishtank-lastgood/v1';
const OPENPHISH_LASTGOOD_KEY = 'phishing-urls/openphish-lastgood/v1';
const LASTGOOD_TTL_SECONDS = 24 * 60 * 60;
/** Legacy Cache-API keys — only read from on first migration, never written. */
const LEGACY_PHISHTANK_CACHE_KEY = 'https://phishing-urls-phishtank-lastgood.internal/v1';
const LEGACY_OPENPHISH_CACHE_KEY = 'https://phishing-urls-openphish-lastgood.internal/v1';

interface LastGoodSlice {
  urls: PhishingUrl[];
  refreshed_at: string;
}

async function readLastGood(
  kv: KVNamespace | undefined,
  kvKey: string,
  legacyCacheKey: string
): Promise<PhishingUrl[] | null> {
  if (kv) {
    try {
      const raw = await kv.get(kvKey);
      if (raw) {
        const parsed = JSON.parse(raw) as LastGoodSlice;
        if (Array.isArray(parsed.urls) && parsed.urls.length > 0) return parsed.urls;
      }
    } catch {
      /* fall through to legacy */
    }
  }
  const cache = (caches as unknown as { default: Cache }).default;
  const lgCached = await cache.match(new Request(legacyCacheKey));
  if (!lgCached) return null;
  try {
    const lg = (await lgCached.json()) as LastGoodSlice;
    return Array.isArray(lg.urls) && lg.urls.length > 0 ? lg.urls : null;
  } catch {
    return null;
  }
}

function writeLastGood(
  kv: KVNamespace | undefined,
  kvKey: string,
  urls: PhishingUrl[],
  executionCtx?: { waitUntil: (p: Promise<unknown>) => void }
): void {
  if (!kv) return;
  const payload: LastGoodSlice = { urls, refreshed_at: new Date().toISOString() };
  const body = JSON.stringify(payload);
  const opts = { expirationTtl: LASTGOOD_TTL_SECONDS };
  // Debounce: write at most once per 6h per key. Marker lives in
  // caches.default so the throttle costs no KV.
  const guarded = async () => {
    if (await shouldWriteLastGood(`phishing:${kvKey}`)) {
      await kv.put(kvKey, body, opts);
    }
  };
  if (executionCtx) executionCtx.waitUntil(guarded());
  else void guarded();
}

async function fetchOpenphish(): Promise<string | null> {
  try {
    const res = await fetchResilient(
      OPENPHISH_URL,
      {
        headers: { 'user-agent': 'pranithjain-dfir/1.0', accept: 'text/plain, text/csv' },
        cf: { cacheTtl: 1800, cacheEverything: true },
        redirect: 'follow',
      },
      { attempts: 3, timeoutMs: FETCH_TIMEOUT_MS_OPENPHISH }
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchPhishtank(apiKey?: string): Promise<string | null> {
  // PhishTank requires an API key — skip gracefully when not configured.
  // Register at https://phishtank.org/developer_info.php for a free key.
  if (!apiKey) return null;

  try {
    const url = `https://data.phishtank.com/data/${encodeURIComponent(apiKey)}/online-valid.csv`;
    const res = await fetchResilient(
      url,
      {
        headers: { 'user-agent': PHISHTANK_UA, accept: 'text/csv,*/*' },
        redirect: 'follow',
      },
      { attempts: 3, timeoutMs: FETCH_TIMEOUT_MS_PHISHTANK }
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Parse the PhishTank CSV — schema:
 *   phish_id, url, phish_detail_url, submission_time, verified,
 *   verification_time, online, target
 * We only keep `online == yes` AND `verified == yes`.
 */
function parsePhishtank(csv: string, max: number): PhishingUrl[] {
  const lines = csv.split('\n');
  const out: PhishingUrl[] = [];
  // Skip header row (lines[0]); CSV uses commas with no embedded quotes for our cols.
  for (let i = 1; i < lines.length && out.length < max; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < 8) continue;
    const url = cols[1];
    const submission_time = cols[3];
    const verified = cols[4] === 'yes';
    const online = cols[6] === 'yes';
    const target = cols[7]?.trim();
    if (!url || !online || !verified) continue;
    out.push({
      url,
      source: 'phishtank',
      first_seen: submission_time,
      target: target && target !== 'Other' ? target : undefined,
      verified: true,
    });
  }
  return out;
}

/**
 * Brand-keyword catalogue. Each entry maps a display name to lowercased
 * substrings to scan against a phishing URL's hostname + path. ~80 brands
 * grouped by category — the high-volume impersonation targets analysts
 * actually see (big tech, banks, crypto, shipping, streaming, telecom,
 * gov/tax, SaaS).
 *
 * Pattern hygiene: keep substrings ≥ 6 chars or include hyphen/dot anchors
 * (e.g. "ubs-bank" not "ubs-") so they don't accidentally match unrelated
 * URLs like "rubs-" or "matt-". When in doubt, prefer "<brand>.com." style
 * which only matches typo-squatted hostnames carrying the legit domain as
 * a subdomain prefix.
 */
const BRAND_KEYWORDS: Array<{ brand: string; patterns: string[] }> = [
  // ─── Big Tech ──────────────────────────────────────────────────────────
  {
    brand: 'Microsoft',
    patterns: [
      'microsoft',
      'office365',
      'outlook',
      'onedrive',
      'sharepoint',
      'msoffice',
      'msft',
      'office-365',
      'ms-login',
      'azure-login',
    ],
  },
  { brand: 'Google', patterns: ['google', 'gmail', 'g-suite', 'gsuite', 'googledrive', 'googleplay'] },
  { brand: 'Apple', patterns: ['apple', 'icloud', 'appleid', 'apple-id', 'apple.com.', 'itunes', 'applepay'] },
  { brand: 'Amazon', patterns: ['amazon', 'aws-', 'aws.com.', 'amaz0n', 'amazn'] },
  {
    brand: 'Meta / Facebook',
    patterns: [
      'facebook',
      'meta-',
      '-meta.',
      'meta-accounts',
      'meta-business',
      'instagram',
      'whatsapp',
      'fbmessenger',
      'metabusiness',
    ],
  },
  { brand: 'LinkedIn', patterns: ['linkedin-', 'linkedin.com.'] },
  { brand: 'Twitter / X', patterns: ['twitter-', 'twitter.com.', 'x-com-'] },
  { brand: 'GitHub', patterns: ['github-', 'github.com.', 'gh-login'] },
  { brand: 'Dropbox', patterns: ['dropbox-', 'dropbox.com.'] },
  { brand: 'Adobe', patterns: ['adobe-', 'adobe.com.', 'adobeid', 'adobesign'] },
  // ─── Webmail ───────────────────────────────────────────────────────────
  { brand: 'Yahoo', patterns: ['yahoo-', 'yahoo.com.', 'yahoomail', 'yahoo-mail'] },
  { brand: 'AOL', patterns: ['aol-mail', 'aol.com.', 'aol-login'] },
  { brand: 'ProtonMail', patterns: ['protonmail', 'proton-mail', 'proton.me.'] },
  // ─── Streaming / Entertainment ─────────────────────────────────────────
  { brand: 'Netflix', patterns: ['netflix', 'netflx', 'netflix-'] },
  { brand: 'Spotify', patterns: ['spotify-', 'spotify.com.'] },
  { brand: 'Disney+', patterns: ['disneyplus', 'disney-plus', 'disney+'] },
  { brand: 'HBO Max', patterns: ['hbomax', 'hbo-max'] },
  { brand: 'Hulu', patterns: ['hulu-', 'hulu.com.'] },
  { brand: 'Amazon Prime', patterns: ['primevideo', 'prime-video', 'amazonprime'] },
  // ─── PayPal + Payments ─────────────────────────────────────────────────
  { brand: 'PayPal', patterns: ['paypal', 'pay-pal', 'paypal-', 'paypal.com.', 'payp4l'] },
  { brand: 'Stripe', patterns: ['stripe-', 'stripe.com.'] },
  { brand: 'Cash App', patterns: ['cashapp', 'cash-app', 'cash.app.'] },
  { brand: 'Venmo', patterns: ['venmo-', 'venmo.com.'] },
  { brand: 'Zelle', patterns: ['zelle-', 'zellepay'] },
  // ─── Banks — US/Canada ─────────────────────────────────────────────────
  { brand: 'Bank of America', patterns: ['bankofamerica', 'bofa-', 'bank-of-america'] },
  { brand: 'Chase Bank', patterns: ['chase-', 'chase.com.', 'jpmchase'] },
  { brand: 'Wells Fargo', patterns: ['wellsfargo', 'wellsfargobank', 'wfargo'] },
  { brand: 'Citibank', patterns: ['citibank', 'citi-', 'citigroup'] },
  { brand: 'American Express', patterns: ['amex-', 'americanexpress', 'amex.com.'] },
  { brand: 'Capital One', patterns: ['capitalone', 'capital-one'] },
  { brand: 'Discover Card', patterns: ['discovercard', 'discover-card', 'discoverbank'] },
  { brand: 'US Bank', patterns: ['usbank-', 'usbank.com.', 'usbankreliacard'] },
  { brand: 'PNC Bank', patterns: ['pncbank', 'pnc-bank'] },
  { brand: 'TD Bank', patterns: ['tdbank', 'td-bank', 'tdcanadatrust'] },
  { brand: 'RBC', patterns: ['rbcroyalbank', 'rbc-royal', 'rbcbank'] },
  // ─── Banks — UK/EU ─────────────────────────────────────────────────────
  { brand: 'HSBC', patterns: ['hsbc-', 'hsbc.com.', 'hsbcdirect'] },
  { brand: 'Barclays', patterns: ['barclays-', 'barclays.com.'] },
  { brand: 'Lloyds Bank', patterns: ['lloydsbank', 'lloyds-'] },
  { brand: 'NatWest', patterns: ['natwest-', 'natwest.com.'] },
  { brand: 'Halifax', patterns: ['halifax-', 'halifax.co.uk.', 'halifaxonline'] },
  { brand: 'TSB Bank', patterns: ['tsbbank', 'tsb-bank'] },
  { brand: 'Monzo', patterns: ['monzo-', 'monzobank'] },
  { brand: 'Revolut', patterns: ['revolut-', 'revolut.com.'] },
  { brand: 'Starling Bank', patterns: ['starlingbank', 'starling-bank'] },
  { brand: 'N26', patterns: ['n26-', 'n26.com.', 'n26bank'] },
  { brand: 'ING', patterns: ['ingdirect', 'ing.com.', 'ingbank'] },
  { brand: 'Santander', patterns: ['santander-', 'santanderbank'] },
  { brand: 'BNP Paribas', patterns: ['bnpparibas', 'bnp-paribas'] },
  { brand: 'Société Générale', patterns: ['societegenerale', 'societe-generale'] },
  { brand: 'Crédit Agricole', patterns: ['creditagricole', 'credit-agricole'] },
  { brand: 'Deutsche Bank', patterns: ['deutsche-bank', 'deutschebank'] },
  { brand: 'Commerzbank', patterns: ['commerzbank'] },
  { brand: 'DKB', patterns: ['dkb-', 'dkb.de.', 'deutsche-kreditbank'] },
  { brand: 'Sparkasse', patterns: ['sparkasse', 'spar-kasse'] },
  { brand: 'UBS', patterns: ['ubs-bank', 'ubs.com.', 'ubsclient'] },
  // ─── Banks — APAC ──────────────────────────────────────────────────────
  { brand: 'ICICI Bank', patterns: ['icicibank', 'icici-bank'] },
  { brand: 'HDFC Bank', patterns: ['hdfcbank', 'hdfc-bank'] },
  { brand: 'SBI', patterns: ['onlinesbi', 'state-bank-india', 'sbi.co.in.'] },
  // ─── Crypto exchanges + wallets ────────────────────────────────────────
  { brand: 'Coinbase', patterns: ['coinbase', 'coin-base'] },
  { brand: 'Binance', patterns: ['binance', 'binanc'] },
  { brand: 'Crypto.com', patterns: ['crypto.com', 'cryptodotcom', 'crypto-com'] },
  { brand: 'Kraken', patterns: ['kraken-', 'krakenexchange'] },
  { brand: 'KuCoin', patterns: ['kucoin', 'ku-coin'] },
  { brand: 'OKX', patterns: ['okx-', 'okx.com.', 'okexchange'] },
  { brand: 'Bybit', patterns: ['bybit-', 'bybit.com.'] },
  { brand: 'MetaMask', patterns: ['metamask', 'meta-mask'] },
  { brand: 'Trust Wallet', patterns: ['trustwallet', 'trust-wallet'] },
  { brand: 'Ledger', patterns: ['ledger-', 'ledger.com.', 'mylledger'] },
  { brand: 'Phantom', patterns: ['phantom-wallet', 'phantom.app.'] },
  { brand: 'Exodus Wallet', patterns: ['exoduswallet', 'exodus-wallet'] },
  {
    brand: 'Trezor',
    patterns: ['trezor', 'tresor-suite', 'trezir', 'trzes', 'trexor', 'trexoz', 'trzesuite', 'tzesuite'],
  },
  { brand: 'Tezos', patterns: ['tezor', 'tezos-', 'tezos.com.'] },
  { brand: 'BitGo', patterns: ['bitgo-', 'bitgo.com.'] },
  { brand: 'Uniswap', patterns: ['uniswap-', 'uniswap.org.'] },
  // ─── Shipping / Delivery ───────────────────────────────────────────────
  { brand: 'DHL', patterns: ['dhl-', 'dhl.', '-dhl.', 'dhlexpress'] },
  { brand: 'FedEx', patterns: ['fedex', 'fed-ex'] },
  { brand: 'USPS', patterns: ['usps-', 'usps.', 'uspspackage'] },
  { brand: 'UPS', patterns: ['ups-', 'ups.com.', 'ups-delivery'] },
  { brand: 'Royal Mail', patterns: ['royal-mail', 'royalmail-', 'royalmail.com.'] },
  // ─── Retail / E-commerce ───────────────────────────────────────────────
  { brand: 'eBay', patterns: ['ebay-', 'ebay.com.', '-ebay-'] },
  { brand: 'Walmart', patterns: ['walmart-', 'walmart.com.'] },
  { brand: 'Etsy', patterns: ['etsy-', 'etsy.com.'] },
  { brand: 'Shopify', patterns: ['shopify-', 'shopify.com.', 'myshopify-'] },
  { brand: 'Costco', patterns: ['costco-', 'costco.com.'] },
  { brand: 'Best Buy', patterns: ['bestbuy-', 'bestbuy.com.'] },
  { brand: 'Target', patterns: ['target-redcard', 'target.com.'] },
  { brand: 'Allegro', patterns: ['allegro', 'allegrolokalnie'] },
  // ─── SaaS / Productivity ───────────────────────────────────────────────
  { brand: 'DocuSign', patterns: ['docusign', 'docu-sign'] },
  { brand: 'Salesforce', patterns: ['salesforce', 'sales-force', 'force.com.'] },
  { brand: 'Slack', patterns: ['slack-app', 'slack.com.', 'slackapi'] },
  { brand: 'Zoom', patterns: ['zoom.us.', 'zoom-meeting', 'zoom-login'] },
  { brand: 'Cisco Webex', patterns: ['webex-', 'webex.com.'] },
  // ─── Telecom ───────────────────────────────────────────────────────────
  { brand: 'AT&T', patterns: ['att.com.', 'att-login', 'att-mail', 'att-yahoo'] },
  { brand: 'Verizon', patterns: ['verizon-', 'verizon.com.', 'verizonwireless'] },
  { brand: 'T-Mobile', patterns: ['tmobile-', 't-mobile-', 'tmobile.com.'] },
  { brand: 'Vodafone', patterns: ['vodafone-', 'vodafone.com.'] },
  { brand: 'BT', patterns: ['bt-mail', 'btinternet', 'btopenworld'] },
  // ─── Gaming ────────────────────────────────────────────────────────────
  { brand: 'Steam', patterns: ['steamcommunity-', 'steampowered-', 'steam-login'] },
  { brand: 'Roblox', patterns: ['roblox', 'robiox', 'rob1ox'] },
  { brand: 'Epic Games', patterns: ['epicgames', 'epic-games'] },
  { brand: 'Riot Games', patterns: ['riotgames', 'riot-games', 'leagueoflegends'] },
  { brand: 'Blizzard', patterns: ['battle-net', 'battlenet', 'blizzard-'] },
  { brand: 'EA Games', patterns: ['easports', 'ea-account', 'origin.com.'] },
  // ─── Travel ────────────────────────────────────────────────────────────
  { brand: 'Booking.com', patterns: ['booking-', 'booking.com.'] },
  { brand: 'Airbnb', patterns: ['airbnb-', 'airbnb.com.'] },
  { brand: 'Expedia', patterns: ['expedia-', 'expedia.com.'] },
  { brand: 'Uber', patterns: ['uber-', 'uber.com.', 'uberlogin'] },
  // ─── Government / Tax ──────────────────────────────────────────────────
  { brand: 'IRS', patterns: ['irs-', 'irs.gov.', 'irs-refund'] },
  { brand: 'HMRC', patterns: ['hmrc-', 'hmrc.gov.uk.', 'gov-uk-tax'] },
  { brand: 'SSA (US)', patterns: ['ssa-gov', 'socialsecurity', 'ssa.gov.'] },
  { brand: 'CRA (Canada)', patterns: ['cra-arc', 'cra-canada', 'cra.gc.ca.'] },
  { brand: 'ATO (Australia)', patterns: ['ato-gov', 'ato.gov.au.', 'mygov-'] },
  { brand: 'TurboTax', patterns: ['turbotax', 'turbo-tax'] },
  { brand: 'H&R Block', patterns: ['hrblock', 'h-and-r-block'] },
];

/**
 * Derive a target brand from a phishing URL by matching curated keywords
 * against the hostname + path. Returns the brand name, or undefined when
 * no high-confidence match is found. This sidesteps PhishTank entirely —
 * OpenPhish gives us URLs with 100% reliability, brand keywords are static.
 */
export function brandFromUrl(rawUrl: string): string | undefined {
  let haystack: string;
  try {
    const u = new URL(rawUrl);
    haystack = `${u.hostname}${u.pathname}`.toLowerCase();
  } catch {
    haystack = rawUrl.toLowerCase();
  }
  for (const { brand, patterns } of BRAND_KEYWORDS) {
    for (const p of patterns) {
      if (haystack.includes(p)) return brand;
    }
  }
  return undefined;
}

function parseOpenphish(text: string, max: number): PhishingUrl[] {
  const out: PhishingUrl[] = [];
  for (const line of text.split('\n')) {
    const url = line.trim();
    if (!url || !url.startsWith('http')) continue;
    const target = brandFromUrl(url);
    out.push({ url, source: 'openphish', target });
    if (out.length >= max) break;
  }
  return out;
}

export async function fetchPhishingUrls(
  executionCtx?: { waitUntil: (p: Promise<unknown>) => void },
  kv?: KVNamespace,
  phishtankApiKey?: string
): Promise<PhishingUrlsResponse> {
  const [opText, ptText] = await Promise.all([fetchOpenphish(), fetchPhishtank(phishtankApiKey)]);

  let ptUrls = ptText ? parsePhishtank(ptText, MAX_ITEMS) : [];
  let opUrls = opText ? parseOpenphish(opText, MAX_ITEMS) : [];

  let ptStale = false;
  let opStale = false;

  if (ptUrls.length > 0) {
    writeLastGood(kv, PHISHTANK_LASTGOOD_KEY, ptUrls, executionCtx);
  } else {
    const restored = await readLastGood(kv, PHISHTANK_LASTGOOD_KEY, LEGACY_PHISHTANK_CACHE_KEY);
    if (restored) {
      ptUrls = restored;
      ptStale = true;
    }
  }

  if (opUrls.length > 0) {
    writeLastGood(kv, OPENPHISH_LASTGOOD_KEY, opUrls, executionCtx);
  } else {
    const restored = await readLastGood(kv, OPENPHISH_LASTGOOD_KEY, LEGACY_OPENPHISH_CACHE_KEY);
    if (restored) {
      opUrls = restored;
      opStale = true;
    }
  }

  // Dedup: PhishTank entries (which have richer metadata) win over OpenPhish.
  const seen = new Set(ptUrls.map((u) => u.url));
  const merged: PhishingUrl[] = [...ptUrls];
  for (const u of opUrls) {
    if (seen.has(u.url)) continue;
    merged.push(u);
    seen.add(u.url);
  }

  const hasPtKey = Boolean(phishtankApiKey);
  return {
    generated_at: new Date().toISOString(),
    sources: [
      {
        id: 'phishtank',
        ok: hasPtKey && (ptText !== null || ptUrls.length > 0),
        count: ptUrls.length,
        stale: ptStale || undefined,
      },
      { id: 'openphish', ok: opText !== null || opUrls.length > 0, count: opUrls.length, stale: opStale || undefined },
    ],
    total: merged.length,
    urls: merged.slice(0, MAX_ITEMS),
  };
}

/**
 * Cache-aware variant used by /api/v1/live-iocs (and any other internal
 * caller that shouldn't hammer upstream alongside the standalone handler).
 *
 * Reads from PHISHING_URLS_CACHE_KEY (1h TTL) first — same payload the
 * standalone handler serves — so live-iocs sees the same view as a direct
 * /phishing-urls hit, complete with last-good fallbacks. Falls through to
 * a fresh fetch only on cold cache.
 */
/** Short-TTL fallback when a response is degraded — prevents bad-luck snapshots
 * (e.g. transient upstream 403) from being locked in for the full 1h cache. */
const DEGRADED_TTL_SECONDS = 60;

function ttlFor(body: PhishingUrlsResponse): number {
  return body.sources.some((s) => s.count === 0) ? DEGRADED_TTL_SECONDS : CACHE_TTL_SECONDS;
}

export async function fetchPhishingUrlsCached(
  executionCtx?: { waitUntil: (p: Promise<unknown>) => void },
  kv?: KVNamespace,
  phishtankApiKey?: string
): Promise<PhishingUrlsResponse> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cached = await cache.match(new Request(PHISHING_URLS_CACHE_KEY));
  if (cached) {
    return (await cached.json()) as PhishingUrlsResponse;
  }
  const body = await fetchPhishingUrls(executionCtx, kv, phishtankApiKey);
  if (executionCtx) {
    const resp = new Response(JSON.stringify(body), {
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${ttlFor(body)}, stale-while-revalidate=${ttlFor(body) * 4}`,
      },
    });
    executionCtx.waitUntil(cache.put(new Request(PHISHING_URLS_CACHE_KEY), resp));
  }
  return body;
}

export async function phishingUrlsHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheReq = new Request(CACHE_KEY);
  const cached = await cache.match(cacheReq);
  if (cached) return new Response(cached.body, cached);

  const body = await fetchPhishingUrls(c.executionCtx, c.env.KV_CACHE, c.env.PHISHTANK_API_KEY);
  const response = new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': `public, max-age=${ttlFor(body)}, stale-while-revalidate=${ttlFor(body) * 4}`,
    },
  });
  c.executionCtx.waitUntil(cache.put(cacheReq, response.clone()));
  return response;
}
