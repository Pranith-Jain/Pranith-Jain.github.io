/**
 * Hudson Rock Cavalier API v3 client.
 *
 * Typed wrapper around every public Cavalier endpoint. Requires an API key
 * (free tier: hudsonrock.com/free-api-key). When the key is missing, callers
 * get a clear error rather than a silent 401 from upstream.
 *
 * Base URL: https://api.hudsonrock.com/json/v3
 * Auth:     `api-key` header
 *
 * Rate limits (free tier): conservative — this module does NOT enforce its own
 * throttling; callers should cache aggressively (1 h TTL recommended).
 */
const HR_BASE = 'https://api.hudsonrock.com/json/v3';
const TIMEOUT_MS = 15_000;
function requireKey(env) {
  const key = env.HUDSONROCK_API_KEY;
  if (!key)
    throw new Error('HUDSONROCK_API_KEY is not set — get a free key at https://www.hudsonrock.com/free-api-key');
  return key;
}
async function hrPost(env, path, body) {
  const apiKey = requireKey(env);
  const res = await fetch(`${HR_BASE}${path}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Hudson Rock ${path} returned ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}
async function hrGet(env, path) {
  const apiKey = requireKey(env);
  const res = await fetch(`${HR_BASE}${path}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Hudson Rock ${path} returned ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}
// ─── Public API ────────────────────────────────────────────────────────────
/**
 * Search for domain-wide infostealer compromises.
 *
 * @see https://docs.hudsonrock.com/docs/domain-search
 */
export async function searchByDomain(env, domains, opts = {}) {
  return hrPost(env, '/search-by-domain', {
    domains,
    ...opts,
    filter_credentials: opts.filter_credentials ?? true,
  });
}
/**
 * Batch search for compromised credentials by email addresses (up to 50).
 *
 * @see https://docs.hudsonrock.com/docs/email-search
 */
export async function searchByEmails(env, emails, opts = {}) {
  return hrPost(env, '/search-by-login/emails', {
    logins: emails.slice(0, 50),
    ...opts,
    filter_credentials: opts.filter_credentials ?? true,
  });
}
/**
 * Search for compromised credentials by usernames.
 *
 * @see https://docs.hudsonrock.com/docs/username-search
 */
export async function searchByUsername(env, usernames, opts = {}) {
  return hrPost(env, '/search-by-login/usernames', {
    logins: usernames.slice(0, 50),
    ...opts,
    filter_credentials: opts.filter_credentials ?? true,
  });
}
/**
 * Search for compromises by IP address or CIDR range.
 *
 * @see https://docs.hudsonrock.com/docs/ipcidr-search
 */
export async function searchByIp(env, ips, opts = {}) {
  return hrPost(env, '/search-by-ip', {
    logins: ips.slice(0, 50),
    ...opts,
    filter_credentials: opts.filter_credentials ?? true,
  });
}
/**
 * Search for compromises by stealer ID.
 *
 * @see https://docs.hudsonrock.com/docs/stealer-search
 */
export async function searchByStealer(env, stealerId, opts = {}) {
  return hrPost(env, '/search-by-stealer', {
    stealer: stealerId,
    ...opts,
  });
}
/**
 * Get domain compromise overview statistics.
 *
 * @see https://docs.hudsonrock.com/docs/domain-overview
 */
export async function domainOverview(env, domains, opts = {}) {
  return hrPost(env, '/search-by-domain/overview', {
    domains,
    ...opts,
  });
}
/**
 * Discover all compromised URLs for a domain (attack surface mapping).
 *
 * @see https://docs.hudsonrock.com/docs/assets-discovery
 */
export async function assetsDiscovery(env, domains, opts = {}) {
  return hrPost(env, '/search-by-domain/discovery', {
    domains,
    ...opts,
  });
}
/**
 * Third-party / supply-chain risk assessment for a single domain.
 *
 * @see https://docs.hudsonrock.com/docs/third-party-risk-assessment
 */
export async function thirdPartyRiskAssessment(env, domain) {
  return hrPost(env, '/search-by-domain/assessment', { domain });
}
/**
 * AI-powered infection source analysis (works best with Lumma stealers).
 *
 * @see https://docs.hudsonrock.com/docs/ai-infection-analysis-new
 */
export async function infectionAnalysis(env, stealerId) {
  return hrPost(env, '/search-by-stealer/infection-analysis', {
    stealer: stealerId,
  });
}
/**
 * Advanced multi-filter search across domains, industries, countries.
 *
 * @see https://docs.hudsonrock.com/reference/advancedsearch
 */
export async function advancedSearch(env, opts) {
  return hrPost(env, '/advancedsearch', opts);
}
/**
 * Find domains by keyword (recon / external attack surface).
 *
 * @see https://docs.hudsonrock.com/reference/search-by-keyword
 */
export async function searchByKeyword(env, keyword, opts = {}) {
  return hrPost(env, '/search-by-keyword', { keyword, ...opts });
}
/**
 * Find URLs by keyword (external attack surface).
 *
 * @see https://docs.hudsonrock.com/reference/searchbykeywordurls
 */
export async function searchUrlsByKeyword(env, keyword, opts = {}) {
  return hrPost(env, '/searchbykeywordurls', { keyword, ...opts });
}
/**
 * Search for credentials based on password (password-reuse detection).
 *
 * @see https://docs.hudsonrock.com/docs/password-search
 */
export async function searchByPassword(env, password, opts = {}) {
  return hrPost(env, '/search-by-password', { password, ...opts });
}
/**
 * Search for credentials based on file names found on infected machines.
 *
 * @see https://docs.hudsonrock.com/reference/search-by-file
 */
export async function searchByFile(env, fileName, opts = {}) {
  return hrPost(env, '/search-by-file', { file_name: fileName, ...opts });
}
/**
 * Get the authenticated user's account info and permissions.
 *
 * @see https://docs.hudsonrock.com/reference/getmyaccount
 */
export async function getAccount(env) {
  return hrGet(env, '/getmyaccount');
}
/**
 * Check if the API key is valid by fetching account info.
 * Returns true if the key works, false if it's invalid/expired.
 */
export async function validateKey(env) {
  try {
    await getAccount(env);
    return true;
  } catch {
    return false;
  }
}
