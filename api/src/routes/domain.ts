import type { Context } from 'hono';
import type { Env } from '../env';
import { resolveAllStandard, resolveRecord } from '../lib/dns';
import { rdapLookup } from '../lib/rdap';
import { ctLogs } from '../lib/crt-sh';
import { parseSpf, parseDmarc, parseBimi, parseMtaSts, parseTlsRpt, evaluateEmailAuth } from '../lib/email-auth';
import { phishingArmy } from '../providers/phishingArmy';
import { pinnedFetch } from '../lib/ssrf-guard';
import { safeErrorMessage } from '../lib/error';
import { tweetfeed } from '../providers/tweetfeed';
import { threatfox } from '../providers/threatfox';
import { urlhaus } from '../providers/urlhaus';
import type { ProviderEnv, ProviderResult } from '../providers/types';

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const COMMON_DKIM_SELECTORS = [
  // Generic / catch-all
  'default',
  'dkim',
  'dkim1',
  'mail',
  // Numbered keys (Mailchimp, generic)
  'k1',
  'k2',
  's1',
  's2',
  // Microsoft 365
  'selector1',
  'selector2',
  // Google Workspace
  'google',
  // Cloudflare Email Routing (current year + previous year)
  'cf2024-1',
  'cf2024-2',
  'cf2025-1',
  'cf2025-2',
  'cf2026-1',
  'cf2026-2',
  // Postmark
  'pm',
  // Mailgun
  'mailgun',
  'mg',
  // Klaviyo
  'klaviyo',
];

export async function domainLookupHandler(c: Context<{ Bindings: Env }>) {
  const raw = c.req.query('domain')?.trim().toLowerCase();
  if (!raw) return c.json({ error: 'missing domain' }, 400);
  if (!DOMAIN_RE.test(raw)) return c.json({ error: 'invalid domain' }, 400);

  const dmarcDomain = `_dmarc.${raw}`;
  const bimiDomain = `default._bimi.${raw}`;
  const tlsRptDomain = `_smtp._tls.${raw}`;
  const mtaStsUrl = `https://mta-sts.${raw}/.well-known/mta-sts.txt`;

  // First batch: all non-DKIM parallel calls
  const [dns, rdap, ct, dmarcTxt, bimiTxt, tlsRptTxt, mtaStsBody] = await Promise.all([
    resolveAllStandard(raw),
    rdapLookup(raw),
    ctLogs(raw),
    resolveRecord(dmarcDomain, 'TXT'),
    resolveRecord(bimiDomain, 'TXT'),
    resolveRecord(tlsRptDomain, 'TXT'),
    // redirect:'manual' — RFC 8461 §3.3 forbids following redirects when
    // fetching the MTA-STS policy, and it also avoids redirect-SSRF via a
    // user-influenced mta-sts.<domain> host. A 3xx → r.ok false → '' (no policy).
    pinnedFetch(mtaStsUrl, { signal: AbortSignal.timeout(5000), redirect: 'manual' })
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => ''),
  ]);

  // Only probe DKIM selectors when MX records indicate email use (~8 fewer subrequests for non-mail domains)
  const dkimSelectorsFound: string[] = [];
  const hasMx = (dns.MX?.records?.length ?? 0) > 0;
  if (hasMx) {
    const dkimChecks = await Promise.all(
      COMMON_DKIM_SELECTORS.map((s) => resolveRecord(`${s}._domainkey.${raw}`, 'TXT'))
    );
    COMMON_DKIM_SELECTORS.forEach((sel, i) => {
      const r = dkimChecks[i];
      if (r && r.records.length > 0) dkimSelectorsFound.push(sel);
    });
  }

  const spf = parseSpf(dns.TXT?.records ?? []);
  const dmarc = parseDmarc(dmarcTxt.records);
  const bimi = parseBimi(bimiTxt.records);
  const tlsRpt = parseTlsRpt(tlsRptTxt.records);
  const mtaSts = parseMtaSts(mtaStsBody);

  const evaluation = evaluateEmailAuth({
    spf,
    dmarc,
    bimi,
    mtaSts,
    tlsRpt,
    dkimSelectorsFound,
  });

  // Threat intelligence cross-check (parallel, isolated from DNS / RDAP failures)
  const tiEnv: ProviderEnv = {
    VT_API_KEY: c.env.VT_API_KEY ?? '',
    ABUSEIPDB_API_KEY: c.env.ABUSEIPDB_API_KEY ?? '',
    SHODAN_API_KEY: c.env.SHODAN_API_KEY ?? '',
    CENSYS_PAT: c.env.CENSYS_PAT ?? '',
    CENSYS_ORG_ID: c.env.CENSYS_ORG_ID ?? '',
    NETLAS_API_KEY: c.env.NETLAS_API_KEY ?? '',
    OTX_API_KEY: c.env.OTX_API_KEY ?? '',
    URLSCAN_API_KEY: c.env.URLSCAN_API_KEY ?? '',
    HYBRID_ANALYSIS_API_KEY: c.env.HYBRID_ANALYSIS_API_KEY ?? '',
    ABUSECH_AUTH_KEY: c.env.ABUSECH_AUTH_KEY,
  };
  const tiSignal = AbortSignal.timeout(8000);
  const tiIndicator = { type: 'domain' as const, value: raw };
  const tiProviders = [phishingArmy, tweetfeed, threatfox, urlhaus];
  const tiResults: ProviderResult[] = await Promise.all(
    tiProviders.map((p) =>
      p(tiIndicator, tiEnv, tiSignal).catch(
        (err): ProviderResult => ({
          source: 'phishingArmy',
          status: 'error',
          score: 0,
          verdict: 'unknown',
          raw_summary: {},
          tags: [],
          error: safeErrorMessage(c.env, err),
          fetched_at: new Date().toISOString(),
          cached: false,
        })
      )
    )
  );
  const tiHits = tiResults.filter(
    (r) => r.status === 'ok' && (r.verdict === 'malicious' || r.verdict === 'suspicious')
  );
  const threat_intel = {
    queried: tiResults.length,
    responding: tiResults.filter((r) => r.status === 'ok').length,
    hits: tiHits.length,
    verdict:
      tiHits.length >= 2 ? ('malicious' as const) : tiHits.length === 1 ? ('suspicious' as const) : ('clean' as const),
    sources: tiResults.map((r) => ({
      source: r.source,
      status: r.status,
      verdict: r.verdict,
      tags: r.tags,
    })),
  };

  const anyError =
    !!rdap.error ||
    ['A', 'AAAA', 'NS', 'MX', 'TXT', 'CNAME', 'SOA', 'CAA'].some((t) => dns[t as keyof typeof dns]?.error);

  const cacheControl = anyError ? 'no-store' : 'public, max-age=300, s-maxage=600';

  return c.json(
    {
      domain: raw,
      score: evaluation.score,
      verdict: evaluation.verdict,
      dns,
      rdap,
      email_auth: {
        spf,
        dmarc,
        dkim: { selectors_found: dkimSelectorsFound },
        bimi,
        mta_sts: mtaSts,
        tls_rpt: tlsRpt,
        evaluation,
      },
      certificates: ct,
      threat_intel,
    },
    200,
    { 'Cache-Control': cacheControl }
  );
}
