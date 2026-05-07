import type { Context } from 'hono';
import type { Env } from '../env';
import { resolveAllStandard, resolveRecord } from '../lib/dns';
import { rdapLookup } from '../lib/rdap';
import { ctLogs } from '../lib/crt-sh';
import { parseSpf, parseDmarc, parseBimi, parseMtaSts, parseTlsRpt, evaluateEmailAuth } from '../lib/email-auth';

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
const COMMON_DKIM_SELECTORS = ['default', 'google', 'k1', 'mail', 'selector1', 'selector2', 's1', 's2'];

export async function domainLookupHandler(c: Context<{ Bindings: Env }>) {
  const raw = c.req.query('domain')?.trim().toLowerCase();
  if (!raw) return c.json({ error: 'missing domain' }, 400);
  if (!DOMAIN_RE.test(raw)) return c.json({ error: 'invalid domain' }, 400);

  const dmarcDomain = `_dmarc.${raw}`;
  const bimiDomain = `default._bimi.${raw}`;
  const tlsRptDomain = `_smtp._tls.${raw}`;
  const mtaStsUrl = `https://mta-sts.${raw}/.well-known/mta-sts.txt`;

  const [dns, rdap, ct, dmarcTxt, bimiTxt, tlsRptTxt, mtaStsBody, ...dkimChecks] = await Promise.all([
    resolveAllStandard(raw),
    rdapLookup(raw),
    ctLogs(raw),
    resolveRecord(dmarcDomain, 'TXT'),
    resolveRecord(bimiDomain, 'TXT'),
    resolveRecord(tlsRptDomain, 'TXT'),
    fetch(mtaStsUrl)
      .then((r) => (r.ok ? r.text() : ''))
      .catch(() => ''),
    ...COMMON_DKIM_SELECTORS.map((s) => resolveRecord(`${s}._domainkey.${raw}`, 'TXT')),
  ]);

  const dkimSelectorsFound: string[] = [];
  COMMON_DKIM_SELECTORS.forEach((sel, i) => {
    const r = dkimChecks[i];
    if (r && r.records.length > 0) dkimSelectorsFound.push(sel);
  });

  const spf = parseSpf(dns.TXT.records);
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

  return c.json({
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
  });
}
