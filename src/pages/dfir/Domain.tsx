import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Search, ExternalLink, Globe, ChevronDown, ChevronRight, Fingerprint, Shield } from 'lucide-react';
import type { DomainLookupResponse } from '../../lib/dfir/types';
import { WhoisCard } from '../../components/dfir/WhoisCard';
import { DnsRecordList } from '../../components/dfir/DnsRecordList';
import { EmailAuthCard } from '../../components/dfir/EmailAuthCard';
import { RelatedWikiArticles } from '../../components/dfir/RelatedWikiArticles';
import { CertList } from '../../components/dfir/CertList';
import { recordHistory } from '../../lib/dfir/history';
import { RelatedActors } from '../../components/dfir/RelatedActors';

const DOMAIN_RE = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

interface WebamonHit {
  'domain.name'?: string;
  page_title?: string;
  date?: string;
  resolved_url?: string;
  tag?: string;
  meta?: { risk_score?: number; report_id?: string; script_count?: number; submission_url?: string };
  fingerprint?: Record<string, string>;
}

interface WebamonData {
  total_hits: number;
  results: WebamonHit[];
}

export default function Domain(): JSX.Element {
  const [searchParams] = useSearchParams();
  const initialInput = searchParams.get('domain') ?? '';
  const [input, setInput] = useState(initialInput);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DomainLookupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [webamon, setWebamon] = useState<WebamonData | null>(null);
  const [webamonLoading, setWebamonLoading] = useState(false);
  const webamonExpanded = useRef(true);
  const valid = DOMAIN_RE.test(input.trim());

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setWebamon(null);
    try {
      const r = await fetch(`/api/v1/domain/lookup?domain=${encodeURIComponent(input.trim())}`);
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        let msg = `${r.status}`;
        try {
          const parsed = JSON.parse(body) as { error?: string };
          msg = parsed.error ?? msg;
        } catch {
          /* use default */
        }
        throw new Error(msg);
      }
      const ct = r.headers.get('content-type') ?? '';
      if (!ct.includes('json')) throw new Error('Server returned non-JSON response');
      const r2 = (await r.json()) as DomainLookupResponse;
      setResult(r2);
      recordHistory({ tool: 'domain', indicator: r2.domain, verdict: r2.verdict, score: r2.score });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'lookup failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!result?.domain) return;
    const domain = result.domain;
    setWebamonLoading(true);
    fetch(`/api/v1/webamon/search?search=${encodeURIComponent(`domain.name:${domain}`)}&size=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWebamon(d as WebamonData | null))
      .catch(() => {})
      .finally(() => setWebamonLoading(false));
  }, [result?.domain]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">Domain Lookup</h1>
        <p className="text-muted mb-8 max-w-2xl">
          WHOIS, DNS, SPF, DMARC, DKIM, BIMI, MTA-STS, and Certificate Transparency, all from one query.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mb-10">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="example.com"
            className="flex-1 px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
          <button
            type="submit"
            disabled={!valid || loading}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            <Search size={16} className="inline mr-2" />
            Look up
          </button>
        </div>
        {input && !valid && (
          <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400">Not a valid domain.</p>
        )}
      </form>

      {loading && <p className="font-mono text-muted">Looking up…</p>}
      {error && (
        <p role="alert" className="font-mono text-rose-600 dark:text-rose-400">
          error: {error}
        </p>
      )}

      {result && (
        <div className="space-y-6">
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display font-bold text-2xl min-w-0 break-all">{result.domain}</h2>
              <span className="font-mono text-sm shrink-0">
                health: <span className="text-slate-900 dark:text-slate-100">{result.score}/100</span>{' '}
                <span
                  className={
                    result.verdict === 'strong'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : result.verdict === 'partial'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400'
                  }
                >
                  ({result.verdict})
                </span>
              </span>
            </div>
          </section>
          <WhoisCard rdap={result.rdap} />
          <EmailAuthCard auth={result.email_auth} />
          <DnsRecordList dns={result.dns} />
          <CertList certs={result.certificates} />

          {webamonLoading && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <div className="flex items-center gap-2 text-sm text-slate-500 font-mono">
                <div className="animate-spin w-3 h-3 border-2 border-brand-500 border-t-transparent rounded-full" />
                Checking Webamon scan data…
              </div>
            </section>
          )}

          {webamon && webamon.total_hits > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <button
                onClick={() => (webamonExpanded.current = !webamonExpanded.current)}
                className="w-full flex items-center gap-2 text-left"
              >
                {webamonExpanded.current ? (
                  <ChevronDown size={16} className="text-slate-400" />
                ) : (
                  <ChevronRight size={16} className="text-slate-400" />
                )}
                <h2 className="font-display font-bold text-lg flex items-center gap-2">
                  <Globe size={18} className="text-brand-600 dark:text-brand-400" /> Webamon Scan Data
                </h2>
                <span className="text-sm font-mono text-slate-500 font-normal">
                  ({webamon.total_hits} scan{webamon.total_hits !== 1 ? 's' : ''})
                </span>
              </button>
              {webamonExpanded.current &&
                webamon.results.map((hit, i) => (
                  <div key={hit.meta?.report_id ?? i} className="mt-4 grid grid-cols-2 gap-4 text-tool">
                    <div>
                      <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                        <Shield size={13} /> Scan Summary
                      </h4>
                      <div className="space-y-1.5">
                        {hit.page_title && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Page Title</span>
                            <span className="text-slate-700 dark:text-slate-300 truncate ml-2">{hit.page_title}</span>
                          </div>
                        )}
                        {hit.meta?.risk_score !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Risk Score</span>
                            <span
                              className={`font-mono font-semibold ${hit.meta.risk_score >= 7 ? 'text-red-500' : hit.meta.risk_score >= 4 ? 'text-yellow-500' : 'text-green-500'}`}
                            >
                              {hit.meta.risk_score}
                            </span>
                          </div>
                        )}
                        {hit.meta?.script_count !== undefined && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Scripts</span>
                            <span className="font-mono text-slate-700 dark:text-slate-300">
                              {hit.meta.script_count}
                            </span>
                          </div>
                        )}
                        {hit.date && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Scanned</span>
                            <span className="font-mono text-slate-700 dark:text-slate-300">{hit.date}</span>
                          </div>
                        )}
                        {hit.resolved_url && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Resolved</span>
                            <a
                              href={hit.resolved_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-brand-600 dark:text-brand-400 hover:underline truncate ml-2 inline-flex items-center gap-1"
                            >
                              {hit.resolved_url} <ExternalLink size={10} />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                    {hit.fingerprint && Object.values(hit.fingerprint).some((v) => v) && (
                      <div>
                        <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                          <Fingerprint size={13} /> Fingerprints
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(hit.fingerprint).map(([key, val]) => {
                            if (!val || val === '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945')
                              return null;
                            return (
                              <a
                                key={key}
                                href={`/threatintel/webamon?q=${encodeURIComponent(`fingerprint.${key}:${val}`)}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-mini font-mono bg-slate-100 dark:bg-slate-800 text-muted hover:bg-brand-100 dark:hover:bg-brand-900/30 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                                title={`Search by ${key} fingerprint`}
                              >
                                <Fingerprint size={10} />
                                {key}:{val.substring(0, 10)}…
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <a
                  href={`/threatintel/webamon?q=${encodeURIComponent(`domain.name:${result.domain}`)}`}
                  className="text-meta text-brand-600 dark:text-brand-400 hover:underline font-mono inline-flex items-center gap-1"
                >
                  <Search size={11} /> Full Webamon search <ExternalLink size={10} />
                </a>
              </div>
            </section>
          )}

          <RelatedActors
            hints={{
              free_text: [result.rdap.registrar, ...result.rdap.nameservers].filter((s): s is string => !!s),
              tags: [
                ...(result.email_auth.bimi.present ? [] : ['phishing']),
                ...(result.email_auth.dmarc.policy === 'none' ? ['phishing'] : []),
              ],
            }}
          />
        </div>
      )}
      <RelatedWikiArticles />
    </div>
  );
}
