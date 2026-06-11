import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Mail, Search, Loader2, ExternalLink, Globe } from 'lucide-react';
import {
  checkIpBlacklists,
  checkDomainBlacklists,
  queryDoh,
  IP_DNSBLS,
  DOMAIN_DNSBLS,
} from '../../lib/dfir/reputation';
import { BlacklistBadge } from '../../components/dfir/BlacklistBadge';
import type { BlacklistCheck } from '../../lib/dfir/reputation';

export default function EmailReputation(): JSX.Element {
  const [searchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get('domain') ?? searchParams.get('q') ?? '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    domain: string;
    mx: Array<{ exchange: string; priority: number }>;
    score: number;
    verdict: 'safe' | 'suspicious' | 'poor';
    spf: string;
    dmarc: string;
    dkim: string;
    bimi: string;
    mta_sts: string;
    tls_rpt: string;
    domainBl: BlacklistCheck[];
    mxBl: Array<{ exchange: string; ip: string; checks: BlacklistCheck[] }>;
    truncated: boolean;
    emailRep?: {
      email: string;
      ok: boolean;
      verdict?: 'malicious' | 'suspicious' | 'clean' | 'unknown';
      score?: number;
      reputation?: 'high' | 'medium' | 'low' | 'unknown';
      tags?: string[];
      references?: number;
      details?: {
        domain_exists?: boolean;
        free_provider?: boolean;
        disposable?: boolean;
        deliverable?: boolean;
        first_seen?: string;
        last_seen?: string;
      };
      error?: string;
    };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Preserve the original input form so we can run emailrep.io when the
  // user gave us a full email address. `clean` keeps the domain-only form
  // for the existing DNSBL/auth checks.
  const trimmed = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  const emailAddress = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(trimmed) ? trimmed : null;
  const clean = trimmed.replace(/^.*@/, '');

  const lookup = async () => {
    if (!clean) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setProgress('Fetching email auth records…');
      const r = await fetch(`/api/v1/domain/lookup?domain=${encodeURIComponent(clean)}`, { signal });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        throw new Error(body ? `API ${r.status}: ${body.slice(0, 100)}` : `API ${r.status}`);
      }
      const ct = r.headers.get('content-type') ?? '';
      if (!ct.includes('json')) throw new Error('Server returned non-JSON response');
      const data = (await r.json()) as {
        email_auth: {
          spf: { present: boolean; policy?: string };
          dmarc: { present: boolean; policy?: string };
          dkim: { selectors_found: string[] };
          bimi: { present: boolean };
          mta_sts: { present: boolean; mode?: string };
          tls_rpt: { present: boolean; rua?: string };
        };
        dns?: { mx?: Array<{ exchange: string; priority: number }> };
      };
      if (signal.aborted) return;

      const mx = data.dns?.mx ?? [];
      const truncated = mx.length > 5;
      const mxSlice = mx.slice(0, 5);
      setProgress(`Resolving ${mxSlice.length} mail server(s) against ${IP_DNSBLS.length} IP blacklists…`);

      const [domainBl, ...mxNested] = await Promise.all([
        checkDomainBlacklists(clean),
        ...mxSlice.map(async (mxRecord) => {
          const ips = await queryDoh(mxRecord.exchange, 'A');
          const ipChecks = await Promise.all(ips.slice(0, 2).map((ip) => checkIpBlacklists(ip)));
          return ips.slice(0, 2).map((ip, i) => ({ exchange: mxRecord.exchange, ip, checks: ipChecks[i] }));
        }),
      ]);
      const mxResults = mxNested.flat();
      if (signal.aborted) return;

      const spf = data.email_auth.spf;
      const dmarc = data.email_auth.dmarc;
      const dkim = data.email_auth.dkim;
      let scoreValue = 0;
      if (!spf.present) scoreValue += 25;
      else if (spf.policy !== 'fail') scoreValue += 10;
      if (!dmarc.present) scoreValue += 30;
      else if (dmarc.policy !== 'reject') scoreValue += 15;
      if (dkim.selectors_found.length === 0) scoreValue += 10;
      if (mx.length === 0) scoreValue += 20;
      const allDnsbl = [...domainBl, ...mxResults.flatMap((r) => r.checks)];
      const listedCount = allDnsbl.filter((b) => b.listed).length;
      scoreValue += Math.min(25, listedCount * 5);

      // Fan out the emailrep.io call only when the input was a full email
      // address. emailrep is per-address — it doesn't have a useful
      // domain-level lookup, and calling it with a bare domain just wastes
      // the rate limit on a guaranteed miss.
      let emailRepResult: NonNullable<typeof result>['emailRep'] | undefined;
      if (emailAddress) {
        try {
          setProgress('Looking up address reputation (emailrep.io)…');
          const rr = await fetch(`/api/v1/email-rep?email=${encodeURIComponent(emailAddress)}`, { signal });
          const rj = (await rr.json()) as {
            ok: boolean;
            verdict?: 'malicious' | 'suspicious' | 'clean' | 'unknown';
            score?: number;
            reputation?: 'high' | 'medium' | 'low' | 'unknown';
            tags?: string[];
            references?: number;
            details?: Record<string, unknown>;
            error?: string;
          };
          emailRepResult = {
            email: emailAddress,
            ok: rj.ok,
            verdict: rj.verdict,
            score: rj.score,
            reputation: rj.reputation,
            tags: rj.tags,
            references: rj.references,
            details: rj.details as NonNullable<typeof result>['emailRep'] extends infer T
              ? T extends { details?: infer D }
                ? D
                : never
              : never,
            error: rj.error,
          };
          // Roll the email-level score into the page composite. The DNSBL
          // score is domain-level; emailrep specifically flags the address.
          if (rj.ok && rj.verdict === 'malicious') scoreValue = Math.max(scoreValue, 75);
          else if (rj.ok && rj.verdict === 'suspicious') scoreValue = Math.max(scoreValue, 50);
        } catch (e) {
          if ((e as { name?: string }).name !== 'AbortError') {
            emailRepResult = {
              email: emailAddress,
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            };
          }
        }
      }
      if (signal.aborted) return;

      // Recompute verdict if emailrep bumped the score.
      const finalVerdict = scoreValue < 20 ? 'safe' : scoreValue < 50 ? 'suspicious' : 'poor';

      setResult({
        domain: clean,
        mx,
        score: scoreValue,
        verdict: finalVerdict,
        spf: spf.present ? (spf.policy === 'fail' ? '-all' : (spf.policy ?? 'present')) : 'missing',
        dmarc: dmarc.present ? (dmarc.policy ?? 'present') : 'missing',
        dkim: dkim.selectors_found.length > 0 ? dkim.selectors_found.join(', ') : 'none',
        bimi: data.email_auth.bimi.present ? 'published' : 'missing',
        mta_sts: data.email_auth.mta_sts.present ? (data.email_auth.mta_sts.mode ?? 'present') : 'missing',
        tls_rpt: data.email_auth.tls_rpt.present ? 'configured' : 'missing',
        domainBl,
        mxBl: mxResults,
        truncated,
        emailRep: emailRepResult,
      });
    } catch (e) {
      if (!signal.aborted) setError(e instanceof Error ? e.message : 'lookup failed');
    } finally {
      if (!signal.aborted) setLoading(false);
      setProgress('');
    }
  };

  useEffect(() => {
    if (searchParams.get('domain') || searchParams.get('q')) lookup();
    return () => abortRef.current?.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — Intentional: mount-only effect

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Mail size={28} className="text-brand-600 dark:text-brand-400" /> Email Reputation
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Full email infrastructure health check — MX, SPF, DKIM, DMARC, BIMI, MTA-STS, TLS-RPT <strong>plus</strong>{' '}
          real-time DNSBL checks of your mail server IPs against <strong>{IP_DNSBLS.length} IP blacklists</strong>{' '}
          (Spamhaus, Barracuda, SORBS, CBL, SpamCop, PSBL, SpamEatingMonkey, UCEPROTECT, Hostkarma, SPFBL) and the
          domain against <strong>{DOMAIN_DNSBLS.length} domain blacklists</strong> (Spamhaus DBL, URIBL, SURBL,
          Invaluement). No API key required.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup();
        }}
        className="mb-6"
      >
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="example.com or user@example.com"
              className="w-full pl-9 pr-3 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Domain or email to check"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !clean}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400 inline-flex items-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}{' '}
            {loading ? 'Checking' : 'Check'}
          </button>
        </div>
      </form>

      {loading && <p className="text-xs font-mono text-slate-500 animate-pulse mb-4">{progress}</p>}
      {error && (
        <p role="alert" className="text-xs font-mono text-rose-600 dark:text-rose-400 mb-4">
          {error}
        </p>
      )}

      {result && (
        <div className="space-y-4">
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-display font-bold text-xl">{result.domain}</h2>
              <span
                className={`text-xs font-mono uppercase tracking-wider px-2.5 py-1 rounded border ${result.verdict === 'safe' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' : result.verdict === 'suspicious' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'}`}
              >
                {result.verdict} · {result.score}/100
              </span>
            </div>
            <div className="h-2 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden mb-4">
              <div
                className={`h-full transition-all ${result.verdict === 'safe' ? 'bg-emerald-500' : result.verdict === 'suspicious' ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${Math.max(2, result.score)}%` }}
              />
            </div>
            <p className="text-sm font-mono text-slate-600 dark:text-slate-400">
              Lower score = better email infrastructure health. 0 means well-configured for deliverability.
            </p>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Fact
              label="MX records"
              value={result.mx.length > 0 ? result.mx.map((m) => `${m.exchange} (${m.priority})`).join(', ') : 'none'}
              good={result.mx.length > 0}
            />
            <Fact label="SPF" value={result.spf} good={result.spf === '-all'} />
            <Fact label="DMARC" value={result.dmarc} good={result.dmarc === 'reject'} />
            <Fact label="DKIM" value={result.dkim} good={result.dkim !== 'none'} />
            <Fact label="BIMI" value={result.bimi} good={result.bimi === 'published'} />
            <Fact label="MTA-STS" value={result.mta_sts} good={result.mta_sts === 'enforce'} />
            <Fact label="TLS-RPT" value={result.tls_rpt} good={result.tls_rpt === 'configured'} />
          </div>

          {result.emailRep && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3 inline-flex items-center gap-2">
                <Mail size={12} aria-hidden="true" /> Address reputation (emailrep.io){' '}
                <span className="font-normal text-slate-500 normal-case">· {result.emailRep.email}</span>
              </h3>
              {result.emailRep.ok ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {result.emailRep.verdict && (
                      <span
                        className={`text-micro font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${
                          result.emailRep.verdict === 'malicious'
                            ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                            : result.emailRep.verdict === 'suspicious'
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                              : result.emailRep.verdict === 'clean'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                : 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30'
                        }`}
                      >
                        {result.emailRep.verdict}
                        {result.emailRep.score !== undefined ? ` · ${result.emailRep.score}/100` : ''}
                      </span>
                    )}
                    {result.emailRep.reputation && (
                      <span className="text-micro font-mono uppercase tracking-wider px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700">
                        rep: {result.emailRep.reputation}
                      </span>
                    )}
                    {result.emailRep.references !== undefined && result.emailRep.references > 0 && (
                      <span className="text-micro font-mono text-slate-500">
                        {result.emailRep.references} references
                      </span>
                    )}
                  </div>
                  {result.emailRep.tags && result.emailRep.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {result.emailRep.tags.map((t) => (
                        <span
                          key={t}
                          className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-mini font-mono text-slate-500 dark:text-slate-400">
                    {result.emailRep.details?.first_seen && `first seen ${result.emailRep.details.first_seen} · `}
                    {result.emailRep.details?.last_seen && `last seen ${result.emailRep.details.last_seen} · `}
                    {result.emailRep.details?.deliverable !== undefined &&
                      `deliverable: ${result.emailRep.details.deliverable ? 'yes' : 'no'}`}
                  </p>
                </>
              ) : (
                <p className="text-xs font-mono text-amber-700 dark:text-amber-300">
                  {result.emailRep.error === 'emailrep_not_configured'
                    ? 'EmailRep enrichment is currently disabled.'
                    : `emailrep lookup failed: ${result.emailRep.error ?? 'unknown error'}`}
                </p>
              )}
            </section>
          )}

          {result.domainBl.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3 inline-flex items-center gap-2">
                <Globe size={12} aria-hidden="true" /> Domain blacklist status ({result.domainBl.length} sources)
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.domainBl.map((bl) => (
                  <BlacklistBadge key={bl.source} bl={bl} />
                ))}
              </div>
            </section>
          )}

          {result.mxBl.map(({ exchange, ip, checks }) => {
            const { score: blScore } = checks.reduce(
              (a, c) => ({ score: a.score + (c.listed ? 1 : 0), total: a.total + 1 }),
              { score: 0, total: 0 }
            );
            const cleanCount = checks.length - blScore;
            return (
              <section
                key={ip}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4"
              >
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono inline-flex items-center gap-2">
                    <Mail size={12} aria-hidden="true" /> {exchange}{' '}
                    <span className="text-slate-500 normal-case text-micro">({ip})</span>
                  </h3>
                  <span
                    className={`text-micro font-mono px-2 py-0.5 rounded border ${blScore === 0 ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' : blScore < 2 ? 'bg-amber-500/15 text-amber-700 border-amber-500/30' : 'bg-rose-500/15 text-rose-700 border-rose-500/30'}`}
                  >
                    {cleanCount}/{checks.length} clean
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {checks.map((bl) => (
                    <BlacklistBadge key={bl.source} bl={bl} compact={true} showName={false} />
                  ))}
                </div>
              </section>
            );
          })}

          {result.truncated && (
            <p className="text-xs font-mono text-slate-500">
              First 5 of {result.mx.length} MX servers shown. Check the full list on Domain Lookup.
            </p>
          )}

          <div className="flex gap-2 flex-wrap">
            <Link
              to={`/dfir/email-defense?domain=${encodeURIComponent(result.domain)}`}
              className="inline-flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
            >
              <ExternalLink size={10} /> BEC Score
            </Link>
            <Link
              to={`/dfir/domain?domain=${encodeURIComponent(result.domain)}`}
              className="inline-flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
            >
              <ExternalLink size={10} /> Domain Lookup
            </Link>
            <Link
              to={`/dfir/url-rep?url=${encodeURIComponent('https://' + result.domain)}`}
              className="inline-flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
            >
              <ExternalLink size={10} /> URL Reputation
            </Link>
            <Link
              to={`/dfir/domain-rep?domain=${encodeURIComponent(result.domain)}`}
              className="inline-flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
            >
              <ExternalLink size={10} /> Full Blacklist
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value, good }: { label: string; value: string; good: boolean }): JSX.Element {
  return (
    <div
      className={`rounded-lg border p-3 ${good ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}`}
    >
      <div className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1">
        {label}
      </div>
      <div
        className={`text-sm font-mono ${good ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-800 dark:text-slate-200'}`}
      >
        {value}
      </div>
    </div>
  );
}
