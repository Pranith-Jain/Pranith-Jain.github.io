import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Search, Loader2, ExternalLink, Globe, BookOpen } from 'lucide-react';
import {
  checkIpBlacklists,
  checkDomainBlacklists,
  computeScore,
  IP_DNSBLS,
  DOMAIN_DNSBLS,
  EXTERNAL_REP_TOOLS,
  type BlacklistCheck,
} from '../../lib/dfir/reputation';
import { BlacklistBadge } from '../../components/dfir/BlacklistBadge';

interface ResolvedDomain {
  domain: string;
  ips: string[];
}

async function resolveDomain(domain: string, signal?: AbortSignal): Promise<ResolvedDomain | null> {
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`;
    const r = await fetch(url, { headers: { accept: 'application/dns-json' }, signal });
    if (!r.ok) return null;
    const j = (await r.json()) as { Answer?: Array<{ data: string }>; Status?: number };
    // CF DNS returns Status 0 = NOERROR, 3 = NXDOMAIN (domain doesn't exist)
    if (j.Status === 3) return null;
    const ips = (j.Answer ?? []).map((a) => a.data);
    return { domain, ips };
  } catch {
    return null;
  }
}

export default function DomainReputation(): JSX.Element {
  const [searchParams] = useSearchParams();
  const [input, setInput] = useState(searchParams.get('domain') ?? searchParams.get('q') ?? '');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    domain: BlacklistCheck[];
    ips: Array<{ ip: string; checks: BlacklistCheck[] }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const clean = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(clean);

  const run = useCallback(async () => {
    if (!clean) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setLoading(true);
    setError(null);
    setResults(null);
    try {
      if (isIp) {
        setProgress(`Checking IP against ${IP_DNSBLS.length} IP blacklists…`);
        const ipChecks = await checkIpBlacklists(clean);
        setResults({ domain: [], ips: [{ ip: clean, checks: ipChecks }] });
      } else {
        setProgress('Resolving domain…');
        const resolved = await resolveDomain(clean, signal);
        if (!resolved) {
          setError(
            `Could not resolve "${clean}" via DNS. The domain may not exist or DNS servers are unreachable. Try the Domain Lookup tool for WHOIS info.`
          );
          setLoading(false);
          return;
        }
        if (resolved.ips.length === 0) {
          setError(
            `"${clean}" resolved but has no A records. It may use only IPv6 or CNAME. Try the Domain Lookup tool.`
          );
          setLoading(false);
          return;
        }
        const totalSources = DOMAIN_DNSBLS.length + resolved.ips.length * IP_DNSBLS.length;
        setProgress(`Checking domain against ${totalSources} sources…`);

        const [domainChecks, ...ipResults] = await Promise.all([
          checkDomainBlacklists(clean),
          ...resolved.ips.map(async (ip) => {
            const checks = await checkIpBlacklists(ip);
            return { ip, checks };
          }),
        ]);
        if (signal.aborted) return;
        setResults({ domain: domainChecks, ips: ipResults });
      }
    } catch (e) {
      if (!signal.aborted) setError(e instanceof Error ? e.message : 'check failed');
    } finally {
      if (!signal.aborted) setLoading(false);
      setProgress('');
    }
  }, [clean, isIp]);

  useEffect(() => {
    if (searchParams.get('domain') || searchParams.get('q')) run();
    return () => abortRef.current?.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <Globe size={28} className="text-brand-600 dark:text-brand-400" /> Domain & IP Reputation
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Check a domain or IP against <strong>{IP_DNSBLS.length + DOMAIN_DNSBLS.length} DNSBL sources</strong>{' '}
          (Spamhaus, Barracuda, SORBS, URIBL, CBL, PSBL, UCEPROTECT, SpamCop, SpamEatingMonkey, SURBL, Invaluement,
          Hostkarma, SPFBL) via DNS-over-HTTPS. Resolves A records and checks every resolved IP against{' '}
          <strong>{IP_DNSBLS.length} IP blacklists</strong>. No API key required.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
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
              placeholder="example.com or 1.2.3.4"
              className="w-full pl-9 pr-3 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              aria-label="Domain or IP to check"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !clean}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin inline mr-1" />
            ) : (
              <Search size={16} className="inline mr-1" />
            )}{' '}
            Check
          </button>
        </div>
      </form>

      {loading && <p className="text-xs font-mono text-slate-500 animate-pulse mb-4">{progress}</p>}
      {error && (
        <p role="alert" className="text-xs font-mono text-rose-600 dark:text-rose-400 mb-4">
          {error}
        </p>
      )}

      {results && (
        <div className="space-y-6">
          {(() => {
            const allChecks = [...results.domain, ...results.ips.flatMap((r) => r.checks)];
            const { score, clean, listed, blocked, reachable } = computeScore(allChecks);
            const blockedRatio = allChecks.length > 0 ? blocked / allChecks.length : 0;
            return (
              <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
                  <h2 className="font-display font-bold text-xl">{clean}</h2>
                  <span
                    className={`text-xs font-mono uppercase tracking-wider px-2.5 py-1 rounded border ${score === 0 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' : score < 20 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'}`}
                  >
                    {score === 0 ? 'Clean' : score < 20 ? 'Low risk' : 'Listed'} · {score}/100
                  </span>
                </div>
                <div className="h-2 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden mb-3">
                  <div
                    className={`h-full transition-all ${score === 0 ? 'bg-emerald-500' : score < 20 ? 'bg-amber-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.max(2, score)}%` }}
                  />
                </div>
                <p className="text-sm font-mono text-slate-600 dark:text-slate-400">
                  {listed} of {reachable} reachable sources flag this domain/IP
                  {blocked > 0 && (
                    <>
                      {' '}
                      <span className="text-slate-500 dark:text-slate-400">
                        · {blocked} blocked our public-resolver query
                      </span>
                    </>
                  )}
                </p>
                {blockedRatio >= 0.25 && (
                  <div className="mt-3 rounded border border-amber-300/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-200">
                    <strong>
                      {blocked} DNSBL{blocked === 1 ? '' : 's'} refused our query.
                    </strong>{' '}
                    Spamhaus, URIBL, SURBL, and several others block lookups from public DNS resolvers like Cloudflare
                    DoH — we can&apos;t confirm listed/clean status for those sources. Cross-check with an authoritative
                    multi-RBL service:{' '}
                    <a
                      href={`https://multirbl.valli.org/lookup/${encodeURIComponent(clean)}.html`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:no-underline"
                    >
                      multirbl.valli.org
                    </a>{' '}
                    ·{' '}
                    <a
                      href={`https://hetrixtools.com/blacklist-check/${encodeURIComponent(clean)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:no-underline"
                    >
                      hetrixtools.com
                    </a>
                  </div>
                )}
              </section>
            );
          })()}

          {results.domain.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3">
                Domain blacklists ({results.domain.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {results.domain.map((bl) => (
                  <BlacklistBadge key={bl.source} bl={bl} />
                ))}
              </div>
            </section>
          )}

          {results.ips.map(({ ip, checks }) => {
            const { score, clean, listed, blocked, reachable } = computeScore(checks);
            return (
              <section
                key={ip}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
              >
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <h3 className="font-display font-semibold text-base inline-flex items-center gap-2">
                    <Globe size={14} className="text-brand-600 dark:text-brand-400" aria-hidden="true" /> {ip}
                  </h3>
                  <span
                    className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded border ${score === 0 ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' : 'bg-rose-500/15 text-rose-700 border-rose-500/30'}`}
                    title={blocked > 0 ? `${blocked} source(s) blocked our public-resolver query` : undefined}
                  >
                    {clean}/{reachable} clean{listed > 0 && ` · ${listed} listed`}
                    {blocked > 0 && ` · ${blocked} blocked`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {checks.map((bl) => (
                    <BlacklistBadge key={bl.source} bl={bl} />
                  ))}
                </div>
              </section>
            );
          })}

          <div className="flex gap-2 flex-wrap">
            <Link
              to={`/dfir/email-rep?domain=${encodeURIComponent(clean)}`}
              className="inline-flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
            >
              <ExternalLink size={10} /> Email Reputation
            </Link>
            <Link
              to={`/dfir/url-rep?url=${encodeURIComponent(isIp ? `http://${clean}` : `https://${clean}`)}`}
              className="inline-flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
            >
              <ExternalLink size={10} /> URL Reputation
            </Link>
            <Link
              to={`/dfir/ioc-check?indicator=${encodeURIComponent(clean)}`}
              className="inline-flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-brand-500/40"
            >
              <ExternalLink size={10} /> IOC Checker
            </Link>
          </div>

          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3 inline-flex items-center gap-2">
              <BookOpen size={12} aria-hidden="true" /> External reputation lookups
            </h3>
            <p className="text-[11px] font-mono text-slate-500 mb-3">
              For a second opinion, cross-check against these free tools:
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {EXTERNAL_REP_TOOLS.map((t) => (
                <a
                  key={t.url}
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${t.name} (opens in new tab)`}
                  className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 hover:border-brand-500/40 transition-colors block"
                >
                  <div className="font-display font-semibold text-xs text-slate-900 dark:text-slate-100 inline-flex items-center gap-1">
                    {t.name} <ExternalLink size={10} aria-hidden="true" />
                  </div>
                  <p className="text-[10px] font-mono text-slate-500 mt-0.5">{t.description}</p>
                </a>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
