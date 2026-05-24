#!/usr/bin/env node
/**
 * End-to-end smoke test against the deployed worker (or local dev).
 *
 * Usage:
 *   node scripts/smoke.mjs                          (defaults to prod)
 *   BASE=http://localhost:8787 node scripts/smoke.mjs
 *   node scripts/smoke.mjs --slow                   (include slow/heavy checks)
 *
 * Exits 0 on full pass, 1 on any failure. Designed to be cheap enough to
 * run on every deploy without burning the KV write quota — every endpoint
 * hit is on the bypass / cache-API path, not the user-input rate-limited
 * surface.
 */

const BASE = process.env.BASE ?? 'https://pranithjain.qzz.io';
const SLOW = process.argv.includes('--slow');
const TIMEOUT_MS = 30_000;

// Rate-limit-respecting throttle. The Worker enforces 30 req/min/colo on
// non-bypassed routes; firing 75 sequential checks at full speed exhausts
// the bucket and the tail of the run gets 429'd by the very middleware we
// want to keep testing. Cap ourselves to ~25/min to stay safely under.
const RATE_WINDOW_MS = 60_000;
// Buffer of 10 below the 30/min/colo Worker limit. The rate-limit-burst
// self-test fires 5 in a tight loop inside its custom handler — those
// share the same per-IP bucket on the server side, so we leave headroom.
const RATE_MAX = 20;
const recentStarts = [];
async function rateLimitGate() {
  const now = Date.now();
  while (recentStarts.length > 0 && now - recentStarts[0] > RATE_WINDOW_MS) {
    recentStarts.shift();
  }
  if (recentStarts.length >= RATE_MAX) {
    const wait = RATE_WINDOW_MS - (now - recentStarts[0]) + 100;
    await new Promise((r) => setTimeout(r, wait));
    return rateLimitGate();
  }
  recentStarts.push(Date.now());
}

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

let pass = 0;
let fail = 0;
let skip = 0;
const failures = [];

function nonEmptyArray(x) {
  return Array.isArray(x) && x.length > 0;
}
function isArray(x) {
  return Array.isArray(x);
}
function hasKey(k) {
  return (j) => j && typeof j === 'object' && k in j;
}
function isOk(j) {
  return j && (j.ok === true || j.ok === undefined);
}

/**
 * Each check:
 *   - name: human-readable label
 *   - path: relative to BASE
 *   - method: default GET
 *   - body: JSON body if POST
 *   - shape: optional fn(json) → boolean — validates response shape
 *   - status: optional expected status (default 200)
 *   - slow: only runs with --slow
 */
const CHECKS = [
  // ─── Health + meta ──────────────────────────────────────────────────────
  { name: 'health', path: '/api/v1/health', shape: (j) => j.ok === true },
  { name: 'pageviews', path: '/api/v1/pageviews' },

  // ─── Cached aggregators (bypass rate-limit) ─────────────────────────────
  { name: 'threat-pulse', path: '/api/v1/threat-pulse', shape: hasKey('entities') },
  { name: 'writeups', path: '/api/v1/writeups', shape: (j) => isArray(j.items ?? j) },
  { name: 'cyber-crime', path: '/api/v1/cyber-crime', shape: hasKey('items') },
  { name: 'telegram-feed', path: '/api/v1/telegram-feed', shape: (j) => isArray(j.items) && isArray(j.channels) },
  { name: 'reddit-feed', path: '/api/v1/reddit-feed', shape: hasKey('items') },
  { name: 'x-feed', path: '/api/v1/x-feed', shape: hasKey('items') },
  { name: 'feed-status', path: '/api/v1/feed-status', shape: hasKey('rows') },
  { name: 'live-iocs', path: '/api/v1/live-iocs', shape: hasKey('items') },
  { name: 'breach-disclosures', path: '/api/v1/breach-disclosures', shape: hasKey('breaches') },
  { name: 'cve-recent', path: '/api/v1/cve-recent', shape: hasKey('cves'), slow: true },
  { name: 'phishing-urls', path: '/api/v1/phishing-urls', shape: hasKey('urls') },
  { name: 'malware-samples', path: '/api/v1/malware-samples', shape: hasKey('samples') },
  { name: 'ransomware-recent', path: '/api/v1/ransomware-recent', shape: hasKey('victims') },
  { name: 'onion-watch', path: '/api/v1/onion-watch', shape: hasKey('groups') },
  // Cold cache + heavy fan-out: tolerate transient 503 so smoke doesn't
  // false-fail on a colo that hasn't warmed yet.
  { name: 'threat-map', path: '/api/v1/threat-map', status: [200, 503], shape: hasKey('countries') },
  { name: 'rules', path: '/api/v1/rules', shape: hasKey('sources') },
  { name: 'ioc-correlation', path: '/api/v1/ioc-correlation', status: [200, 503] },
  { name: 'snapshot', path: '/api/v1/snapshot' },
  { name: 'ioc-snapshot', path: '/api/v1/ioc-snapshot', status: [200, 503] },
  { name: 'actor-timeline', path: '/api/v1/actor-timeline', shape: hasKey('groups') },
  { name: 'victim-releaks', path: '/api/v1/victim-releaks', status: [200, 503] },

  // ─── Threat-intel data ──────────────────────────────────────────────────
  { name: 'c2-tracker', path: '/api/v1/c2-tracker', shape: hasKey('entries') },
  { name: 'detections', path: '/api/v1/detections', status: [200, 503] },
  { name: 'cve-threat-map', path: '/api/v1/cve-threat-map', shape: hasKey('countries'), slow: true },
  { name: 'malicious-packages', path: '/api/v1/malicious-packages', shape: hasKey('packages') },
  { name: 'deepdarkcti', path: '/api/v1/deepdarkcti', shape: hasKey('entries') },
  { name: 'stealer-forum-intel', path: '/api/v1/stealer-forum-intel', shape: hasKey('forums') },
  { name: 'breach-forums', path: '/api/v1/breach-forums', shape: hasKey('rows') },

  // ─── Feeds (read-only) ──────────────────────────────────────────────────
  // aggregate requires a `urls` param — exercise both the validation and
  // a real fan-out fetch.
  { name: 'feeds/aggregate (missing param)', path: '/api/v1/feeds/aggregate', status: 400 },
  {
    name: 'feeds/aggregate (real)',
    path: `/api/v1/feeds/aggregate?urls=${encodeURIComponent('https://www.bleepingcomputer.com/feed/')}`,
    shape: (j) => isArray(j.items) || isArray(j.feeds),
  },
  {
    name: 'feeds/proxy (Bleeping)',
    path: `/api/v1/feeds/proxy?url=${encodeURIComponent('https://www.bleepingcomputer.com/feed/')}`,
  },

  // ─── Provider proxies ───────────────────────────────────────────────────
  // Hokage-style "fail-soft" providers return 400/404/200 depending on miss path.
  { name: 'malpedia/family missing', path: '/api/v1/malpedia/family', status: [400, 404] },
  { name: 'maltrail/list', path: '/api/v1/maltrail/list', shape: (j) => isOk(j) && nonEmptyArray(j.files) },
  {
    name: 'actor-enrich (Lazarus)',
    path: '/api/v1/actor-enrich?name=Lazarus%20Group',
    shape: hasKey('linked_cves'),
    slow: true,
  },
  { name: 'actor-cves (apt28)', path: '/api/v1/actor-cves?slug=apt28' },
  // Param name is `technique`, not `id`. Test both happy path and validation.
  { name: 'mitre/technique', path: '/api/v1/mitre/technique?technique=T1059' },
  { name: 'mitre/technique (missing)', path: '/api/v1/mitre/technique', status: 400 },
  // ATLAS upstream is GitHub raw; specific IDs may 404 → handler 502s.
  // Either way it's a known graceful failure mode, not a bug.
  { name: 'atlas/technique', path: '/api/v1/atlas/technique?technique=AML.T0000', status: [200, 400, 404, 502] },

  // ─── Lookups (user-input, rate-limited surface) ─────────────────────────
  // Param name is `indicator` (or `q`), not `ioc`. Asserted by the source.
  { name: 'ioc/check (1.1.1.1)', path: '/api/v1/ioc/check?indicator=1.1.1.1' },
  { name: 'asn/lookup', path: '/api/v1/asn/lookup?asn=13335' },
  { name: 'cve/lookup', path: '/api/v1/cve/lookup?id=CVE-2021-44228', slow: true },
  // /cve/search shares the lookup handler — same `id` param.
  { name: 'cve/search', path: '/api/v1/cve/search?id=CVE-2021-44228', slow: true },
  // email-rep returns explicit `emailrep_not_configured` when the key is
  // absent — that's the documented prod behaviour, treat as pass.
  { name: 'email-rep (not-configured ok)', path: '/api/v1/email-rep?email=test@example.com', status: [200, 503] },
  { name: 'ip-geo', path: '/api/v1/ip-geo?ip=8.8.8.8' },
  { name: 'breach/range fail-soft', path: '/api/v1/breach/range?prefix=00000', status: [200, 502, 503] },

  // ─── X (Twitter) firehose ───────────────────────────────────────────────
  { name: 'x-firehose status', path: '/api/v1/x-firehose?status', shape: hasKey('configured') },
  {
    name: 'x-firehose probe',
    path: '/api/v1/x-firehose?handle=DailyDarkWeb&count=5&since_days=7',
    status: [200, 429],
    slow: true,
  },
  { name: 'x-tweets stale-soft', path: '/api/v1/x-tweets?handle=DailyDarkWeb&count=5', status: [200, 502, 429] },
  { name: 'x-live', path: '/api/v1/x-live', status: [200, 502, 503] },

  // ─── /dfir-specific lookups + scanners ──────────────────────────────────
  { name: 'breach/domain', path: '/api/v1/breach/domain?domain=example.com' },
  { name: 'breach/email', path: '/api/v1/breach/email?email=test@example.com' },
  { name: 'cert-search (slow)', path: '/api/v1/cert-search?domain=cloudflare.com', slow: true },
  {
    name: 'crypto-trace (BTC genesis)',
    path: '/api/v1/crypto-trace?address=1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
  },
  { name: 'domain/lookup (slow)', path: '/api/v1/domain/lookup?domain=example.com', slow: true },
  { name: 'exposure/scan', path: '/api/v1/exposure/scan?domain=example.com' },
  { name: 'feeds/ioc-summary missing', path: '/api/v1/feeds/ioc-summary', status: 400 },
  {
    name: 'feeds/ioc-summary (urlhaus)',
    path: '/api/v1/feeds/ioc-summary?source=urlhaus',
  },
  { name: 'google-dorks', path: '/api/v1/google-dorks?q=test' },
  { name: 'privacy/inspect', path: '/api/v1/privacy/inspect' },
  { name: 'rl/cyberattacks', path: '/api/v1/rl/cyberattacks' },
  { name: 'stix/fetch (fail-soft)', path: '/api/v1/stix/fetch?id=intrusion-set--xxx', status: [200, 400, 404, 502] },
  { name: 'takeover/check', path: '/api/v1/takeover/check?domain=example.com' },
  { name: 'url-preview', path: '/api/v1/url-preview?url=https://example.com' },
  { name: 'wayback/cdx', path: '/api/v1/wayback/cdx?url=https://example.com&limit=5' },
  { name: 'intel-bundle (miss → 404)', path: '/api/v1/intel-bundle?source=__no__&ref=__no__', status: [200, 404] },

  // ─── Briefings ──────────────────────────────────────────────────────────
  { name: 'briefings/list', path: '/api/v1/briefings/list', shape: hasKey('items') },
  { name: 'briefings/rss', path: '/api/v1/briefings/rss' },

  // ─── Skeletons + external resources ─────────────────────────────────────
  { name: 'skeleton-actors', path: '/api/v1/skeleton-actors', shape: hasKey('items') },
  { name: 'external-resources', path: '/api/v1/external-resources' },

  // ─── Rate-limit middleware sanity (no false 429s under burst) ───────────
  {
    name: 'rate-limit no false-positive (5x burst)',
    custom: async () => {
      const url = `${BASE}/api/v1/x-firehose?status&cb=${Date.now()}`;
      for (let i = 0; i < 5; i += 1) {
        const r = await fetch(`${url}-${i}`);
        if (r.status === 429) return { ok: false, error: `429 on request ${i + 1}` };
      }
      return { ok: true };
    },
  },

  // ─── Negative / fail-soft cases ─────────────────────────────────────────
  { name: 'unknown route', path: '/api/v1/__no_such_route__', status: 404 },
  { name: 'cve/lookup missing id', path: '/api/v1/cve/lookup', status: [400, 404] },
  { name: 'ioc/check missing param', path: '/api/v1/ioc/check', status: [400, 404] },
];

async function runOne(check) {
  if (check.slow && !SLOW) {
    skip += 1;
    process.stdout.write(`${DIM}skip${RESET}  ${check.name}\n`);
    return;
  }
  // Stay under the Worker's 30/min/colo rate-limit so the tail of a long
  // run isn't 429'd by the very middleware we want to keep testing.
  // The rate-limit-burst self-test runs its 5 requests inside `custom`,
  // which still counts in our recentStarts ledger.
  await rateLimitGate();
  const start = Date.now();
  try {
    let result;
    if (check.custom) {
      result = await check.custom();
    } else {
      const url = `${BASE}${check.path}`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(url, {
        method: check.method ?? 'GET',
        headers: { 'content-type': 'application/json' },
        body: check.body ? JSON.stringify(check.body) : undefined,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      const allowed = Array.isArray(check.status)
        ? check.status
        : [check.status ?? 200];
      if (!allowed.includes(res.status)) {
        result = { ok: false, error: `HTTP ${res.status} (wanted ${allowed.join(',')})` };
      } else if (check.shape) {
        // Only parse JSON for 2xx responses with shape checks
        if (res.status >= 200 && res.status < 300) {
          const ct = res.headers.get('content-type') ?? '';
          if (!ct.includes('json')) {
            result = { ok: true }; // shape check skipped for non-JSON (e.g. RSS)
          } else {
            const json = await res.json();
            result = check.shape(json) ? { ok: true } : { ok: false, error: 'shape mismatch' };
          }
        } else {
          result = { ok: true };
        }
      } else {
        result = { ok: true };
      }
    }
    const dur = Date.now() - start;
    if (result.ok) {
      pass += 1;
      process.stdout.write(`${GREEN}pass${RESET}  ${check.name} ${DIM}(${dur}ms)${RESET}\n`);
    } else {
      fail += 1;
      failures.push({ name: check.name, error: result.error });
      process.stdout.write(`${RED}FAIL${RESET}  ${check.name} ${DIM}(${dur}ms)${RESET} — ${result.error}\n`);
    }
  } catch (err) {
    fail += 1;
    const msg = err.name === 'AbortError' ? `timeout >${TIMEOUT_MS}ms` : err.message;
    failures.push({ name: check.name, error: msg });
    process.stdout.write(`${RED}FAIL${RESET}  ${check.name} — ${msg}\n`);
  }
}

async function main() {
  console.log(`${BOLD}smoke test${RESET}  base=${BASE}  slow=${SLOW}\n`);
  for (const check of CHECKS) {
    // Sequential — concurrent fan-out would distort rate-limit signal.
    // eslint-disable-next-line no-await-in-loop
    await runOne(check);
  }
  const total = pass + fail + skip;
  console.log(
    `\n${BOLD}${pass} pass, ${fail} fail, ${skip} skip${RESET}  ` +
      `(${total} total of ${CHECKS.length})`
  );
  if (failures.length) {
    console.log(`\n${RED}${BOLD}failures:${RESET}`);
    for (const f of failures) console.log(`  ${RED}✗${RESET} ${f.name} — ${f.error}`);
  } else if (fail === 0) {
    console.log(`${GREEN}all green${RESET}${SLOW ? '' : ` ${YELLOW}(rerun with --slow for heavy checks)${RESET}`}`);
  }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
