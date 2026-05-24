import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, BookText, ExternalLink, Gauge } from 'lucide-react';
import { CopyButton } from '../../components/dfir/CopyButton';
import { prioritise, TIER_LABELS, TIER_STYLES, TIER_BARS } from '../../lib/dfir/cve-priority';
import { RelatedWikiArticles } from '../../components/dfir/RelatedWikiArticles';

const CVE_RE = /^CVE-\d{4}-\d{4,7}$/i;

interface CvssData {
  version: '3.1' | '3.0' | '2.0';
  base_score: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  vector: string;
}

interface KevData {
  in_kev: boolean;
  date_added?: string;
  vulnerability_name?: string;
  required_action?: string;
  due_date?: string;
  /** True when CISA flags it as used in known ransomware campaigns. */
  known_ransomware?: boolean;
}

interface EpssData {
  score: number;
  percentile: number;
  date: string;
}

interface ActorLink {
  slug: string;
  confidence: number;
  sources: string[];
}

interface CveLookupResult {
  cve_id: string;
  published?: string;
  last_modified?: string;
  description?: string;
  cvss?: CvssData;
  cwe?: string[];
  references?: Array<{ url: string; tags?: string[] }>;
  affected_products?: string[];
  kev: KevData;
  epss?: EpssData;
  actors?: string[];
  actor_links?: ActorLink[];
}

const ACTOR_LINK_SOURCE_LABEL: Record<string, string> = {
  curated: 'curated mapping',
  cisa_kev: 'CISA KEV text',
  nvd: 'NVD description',
  otx: 'OTX pulse',
  feed: 'feed mention',
};

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border-rose-300 dark:border-rose-700',
  HIGH: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300 dark:border-amber-700',
  MEDIUM: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300 border-cyan-300 dark:border-cyan-700',
  LOW: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-600',
};

export default function CveLookup(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = (searchParams.get('cve') ?? searchParams.get('q') ?? '').toUpperCase();
  const [input, setInput] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CveLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refTagFilter, setRefTagFilter] = useState<Set<string>>(new Set());
  const autoFetched = useRef(false);

  const valid = CVE_RE.test(input.trim());
  const canSubmit = valid && !loading;

  const runLookup = async (q: string) => {
    const id = q.trim().toUpperCase();
    if (!CVE_RE.test(id)) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setSearchParams({ cve: id }, { replace: true });
    try {
      const r = await fetch(`/api/v1/cve/search?id=${encodeURIComponent(id)}`);
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `HTTP ${r.status}`);
      }
      setResult((await r.json()) as CveLookupResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    void runLookup(input);
  };

  useEffect(() => {
    if (autoFetched.current) return;
    if (initialQuery && CVE_RE.test(initialQuery)) {
      autoFetched.current = true;
      void runLookup(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">CVE Lookup</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Query NVD for CVE details. Get CVSS score, EPSS exploit likelihood, CISA KEV status, and references.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mb-10">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="CVE-2021-44228"
              className="w-full px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            />
          </div>
          <button
            type="submit"
            disabled={!canSubmit}
            className="px-5 py-3 bg-brand-600 dark:bg-brand-500 text-white font-mono font-semibold rounded-lg disabled:opacity-30 hover:bg-brand-700 dark:hover:bg-brand-400"
          >
            <BookText size={16} className="inline mr-2" />
            Lookup
          </button>
        </div>
        {input && !valid && (
          <p className="mt-2 text-xs font-mono text-amber-600 dark:text-amber-400">
            Enter a valid CVE ID (e.g. CVE-2024-12345)
          </p>
        )}
      </form>

      {loading && <p className="font-mono text-slate-600 dark:text-slate-400">Querying NVD…</p>}
      {error && (
        <p role="alert" className="font-mono text-rose-600 dark:text-rose-400">
          error: {error}
        </p>
      )}

      {result && (
        <div className="space-y-6">
          {/* Header */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
            <div className="flex flex-wrap items-start gap-3 mb-3">
              <h2 className="font-display font-bold text-2xl font-mono">{result.cve_id}</h2>
              {result.kev.in_kev && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-300 dark:border-rose-700">
                  CISA KEV
                </span>
              )}
              {result.kev.in_kev && result.kev.known_ransomware && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-400 dark:border-amber-700"
                  title="CISA has tied this CVE to a known ransomware campaign — top remediation priority"
                >
                  Ransomware
                </span>
              )}
              {result.cvss && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider border ${SEVERITY_STYLES[result.cvss.severity] ?? SEVERITY_STYLES.LOW}`}
                >
                  {result.cvss.severity} {result.cvss.base_score}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-4 font-mono text-xs text-slate-500">
              {result.published && (
                <span>
                  Published: <span className="text-slate-700 dark:text-slate-300">{result.published.slice(0, 10)}</span>
                </span>
              )}
              {result.last_modified && (
                <span>
                  Modified:{' '}
                  <span className="text-slate-700 dark:text-slate-300">{result.last_modified.slice(0, 10)}</span>
                </span>
              )}
            </div>
          </section>

          {/* Patch priority — combined CVSS + EPSS + KEV */}
          {(() => {
            if (!result.cvss && !result.epss && !result.kev) return null;
            const p = prioritise({ cvss: result.cvss, epss: result.epss, kev: result.kev });
            const total = p.contributions.cvss + p.contributions.epss + p.contributions.kev;
            return (
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <h3 className="font-display font-semibold text-lg inline-flex items-center gap-2">
                    <Gauge size={18} className="text-brand-600 dark:text-brand-400" /> Patch priority
                  </h3>
                  <span
                    className={`text-xs font-mono uppercase tracking-wider px-2.5 py-1 rounded border ${TIER_STYLES[p.tier]}`}
                  >
                    {TIER_LABELS[p.tier]} · {p.score}/100
                  </span>
                </div>

                <div className="h-2 rounded bg-slate-200 dark:bg-slate-800 overflow-hidden mb-3">
                  <div
                    className={`h-full transition-all ${TIER_BARS[p.tier]}`}
                    style={{ width: `${Math.max(2, p.score)}%` }}
                  />
                </div>

                <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mb-4">
                  Combined signal across CVSS severity, EPSS exploit probability, and CISA KEV listing. SLA suggestion:{' '}
                  <strong className="text-slate-800 dark:text-slate-200">{p.sla}</strong>.
                </p>

                {/* Per-signal contribution bar */}
                {total > 0 && (
                  <div className="mb-4">
                    <div className="flex h-3 rounded overflow-hidden border border-slate-200 dark:border-slate-800">
                      {p.contributions.cvss > 0 && (
                        <div
                          className="bg-amber-500"
                          style={{ width: `${(p.contributions.cvss / 100) * 100}%` }}
                          title={`CVSS contribution: ${p.contributions.cvss}`}
                        />
                      )}
                      {p.contributions.epss > 0 && (
                        <div
                          className="bg-orange-500"
                          style={{ width: `${(p.contributions.epss / 100) * 100}%` }}
                          title={`EPSS contribution: ${p.contributions.epss}`}
                        />
                      )}
                      {p.contributions.kev > 0 && (
                        <div
                          className="bg-rose-500"
                          style={{ width: `${(p.contributions.kev / 100) * 100}%` }}
                          title={`KEV contribution: ${p.contributions.kev}`}
                        />
                      )}
                      <div className="bg-slate-300 dark:bg-slate-700" style={{ flex: 1 }} />
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] font-mono text-slate-500 dark:text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-2 h-2 bg-amber-500 rounded-sm" /> CVSS · {p.contributions.cvss}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-2 h-2 bg-orange-500 rounded-sm" /> EPSS · {p.contributions.epss}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block w-2 h-2 bg-rose-500 rounded-sm" /> KEV · {p.contributions.kev}
                      </span>
                    </div>
                  </div>
                )}

                <ul className="space-y-1 text-sm font-mono text-slate-700 dark:text-slate-300">
                  {p.rationale.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-slate-400 dark:text-slate-600 select-none">›</span>
                      <span
                        dangerouslySetInnerHTML={{
                          __html: r
                            // Escape any HTML in the upstream rationale string
                            // before pattern-replacing the markdown bold.
                            // KEV due-dates and similar fields flow in from
                            // CISA/NVD upstream and shouldn't be trusted as
                            // pre-escaped HTML.
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/"/g, '&quot;')
                            .replace(
                              /\*\*([^*]+)\*\*/g,
                              '<strong class="text-slate-900 dark:text-slate-100">$1</strong>'
                            ),
                        }}
                      />
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex">
                  <CopyButton
                    value={`${result.cve_id} — ${TIER_LABELS[p.tier]} (${p.score}/100, ${p.sla}).\n${p.rationale.map((r) => '- ' + r.replace(/\*\*/g, '')).join('\n')}`}
                  />
                  <span className="ml-2 self-center text-[11px] font-mono text-slate-500 dark:text-slate-500">
                    Copy ticket-ready rationale
                  </span>
                </div>
              </section>
            );
          })()}

          {/* Description */}
          {result.description && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-3">Description</h3>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{result.description}</p>
            </section>
          )}

          {/* CVSS */}
          {result.cvss && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-4">CVSS {result.cvss.version}</h3>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-3xl sm:text-4xl font-display font-bold">{result.cvss.base_score}</div>
                  <div className="text-xs font-mono text-slate-500">/ 10</div>
                </div>
                <div>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-sm font-bold border ${SEVERITY_STYLES[result.cvss.severity] ?? SEVERITY_STYLES.LOW}`}
                  >
                    {result.cvss.severity}
                  </span>
                  <div className="flex items-center mt-2 font-mono text-xs text-slate-500 break-all">
                    <span>{result.cvss.vector}</span>
                    <CopyButton value={result.cvss.vector} />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* EPSS */}
          {result.epss && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-3">EPSS, Exploit Prediction</h3>
              <div className="flex gap-8 font-mono">
                <div>
                  <div className="text-2xl font-bold">{(result.epss.score * 100).toFixed(2)}%</div>
                  <div className="text-xs text-slate-500">exploit probability</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{(result.epss.percentile * 100).toFixed(1)}th</div>
                  <div className="text-xs text-slate-500">percentile</div>
                </div>
                <div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">{result.epss.date}</div>
                  <div className="text-xs text-slate-500">data date</div>
                </div>
              </div>
            </section>
          )}

          {/* KEV Details */}
          {result.kev.in_kev && (
            <section
              className={`rounded-2xl border p-6 ${
                result.kev.known_ransomware
                  ? 'border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/15'
                  : 'border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-900/10'
              }`}
            >
              <h3
                className={`font-display font-semibold text-lg mb-3 ${
                  result.kev.known_ransomware
                    ? 'text-amber-900 dark:text-amber-300'
                    : 'text-rose-800 dark:text-rose-300'
                }`}
              >
                CISA KEV — Known Exploited
                {result.kev.known_ransomware && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-amber-200 dark:bg-amber-800/40 text-amber-900 dark:text-amber-200 border border-amber-400 dark:border-amber-700">
                    Ransomware
                  </span>
                )}
              </h3>
              {result.kev.known_ransomware && (
                <p className="text-xs font-mono text-amber-900 dark:text-amber-300 mb-3 leading-relaxed">
                  CISA has linked this CVE to known ransomware campaigns. Treat as top-of-queue remediation — patch
                  immediately and hunt for active exploitation indicators in your environment.
                </p>
              )}
              <div className="grid sm:grid-cols-3 gap-4 font-mono text-sm">
                {result.kev.date_added && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Date Added</div>
                    <div className="text-slate-800 dark:text-slate-200">{result.kev.date_added}</div>
                  </div>
                )}
                {result.kev.due_date && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Due Date</div>
                    <div className="text-slate-800 dark:text-slate-200">{result.kev.due_date}</div>
                  </div>
                )}
                {result.kev.required_action && (
                  <div className="sm:col-span-3">
                    <div className="text-xs text-slate-500 mb-1">Required Action</div>
                    <div className="text-slate-800 dark:text-slate-200">{result.kev.required_action}</div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Actor attribution panel — surfaces evidence-scored CVE→actor links */}
          {result.actor_links && result.actor_links.length > 0 && (
            <section className="rounded-2xl border border-violet-200 dark:border-violet-900/40 bg-violet-50/40 dark:bg-violet-900/10 p-6">
              <h3 className="font-display font-semibold text-lg mb-3 text-violet-900 dark:text-violet-300">
                Threat-actor attribution
              </h3>
              <p className="text-[11px] font-mono text-violet-800/70 dark:text-violet-300/70 mb-3 leading-relaxed">
                Multi-signal CVE → actor evidence chain. Curated mapping (confidence 100) is anchored to public CISA /
                vendor PSIRT attribution; heuristic signals (NVD description, CISA KEV text, OTX pulse) add independent
                corroboration with their own confidence weight. Sources are listed so analysts can pressure-test
                attribution rather than trust it blindly.
              </p>
              <ul className="space-y-2">
                {[...result.actor_links]
                  .sort((a, b) => b.confidence - a.confidence)
                  .map((link) => {
                    const conf = link.confidence;
                    const tier = conf >= 90 ? 'high' : conf >= 60 ? 'medium' : 'low';
                    const tierColor =
                      tier === 'high'
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : tier === 'medium'
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : 'border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-400';
                    return (
                      <li
                        key={link.slug}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-3"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5 flex-wrap">
                          <Link
                            to={`/dfir/actors/${encodeURIComponent(link.slug)}`}
                            className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
                          >
                            {link.slug}
                            <ExternalLink size={10} />
                          </Link>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${tierColor}`}
                              title={`confidence score ${conf}/100`}
                            >
                              {tier} · {conf}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                          <span className="text-slate-500">evidence:</span>
                          {link.sources.map((s) => (
                            <span
                              key={s}
                              className="rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-1.5 py-0.5 text-slate-700 dark:text-slate-300"
                              title={`Attribution sourced from ${ACTOR_LINK_SOURCE_LABEL[s] ?? s}`}
                            >
                              {ACTOR_LINK_SOURCE_LABEL[s] ?? s}
                            </span>
                          ))}
                        </div>
                      </li>
                    );
                  })}
              </ul>
              <details className="mt-3">
                <summary className="cursor-pointer text-[10px] font-mono text-violet-700/70 dark:text-violet-300/60 hover:text-violet-900 dark:hover:text-violet-200">
                  Confidence scale
                </summary>
                <ul className="mt-2 text-[10px] font-mono text-violet-800/70 dark:text-violet-300/70 leading-relaxed space-y-0.5 list-disc list-inside">
                  <li>
                    <b>100 — curated:</b> human-vetted attribution from CISA advisory, vendor PSIRT, or IR report.
                  </li>
                  <li>
                    <b>70 — OTX:</b> AlienVault pulse tagged both the actor and the CVE.
                  </li>
                  <li>
                    <b>65 — NVD:</b> NVD description text names a known actor.
                  </li>
                  <li>
                    <b>60 — CISA KEV:</b> KEV vulnerability name / required-action text mentions an actor.
                  </li>
                  <li>
                    <b>35 — feed:</b> news/blog feed item mentioned both the actor and the CVE.
                  </li>
                </ul>
              </details>
            </section>
          )}

          {/* CWEs */}
          {result.cwe && result.cwe.length > 0 && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-3">Weaknesses (CWE)</h3>
              <div className="flex flex-wrap gap-2">
                {result.cwe.map((id) => {
                  const num = id.replace('CWE-', '');
                  return (
                    <a
                      key={id}
                      href={`https://cwe.mitre.org/data/definitions/${num}.html`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono text-brand-600 dark:text-brand-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      {id}
                      <ExternalLink size={10} />
                    </a>
                  );
                })}
              </div>
            </section>
          )}

          {/* Affected Products */}
          {result.affected_products && result.affected_products.length > 0 && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <h3 className="font-display font-semibold text-lg mb-3">Affected Products</h3>
              <ul className="space-y-1">
                {result.affected_products.map((cpe) => (
                  <li key={cpe} className="font-mono text-xs text-slate-600 dark:text-slate-400 break-all">
                    {cpe}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* References — filterable by tag (Vendor Advisory / Exploit / Patch / Mitigation / Third Party Advisory). */}
          {result.references &&
            result.references.length > 0 &&
            (() => {
              const allTags = new Set<string>();
              for (const r of result.references) for (const t of r.tags ?? []) allTags.add(t);
              const tagList = [...allTags].sort();
              const filtered = result.references.filter((r) => {
                if (refTagFilter.size === 0) return true;
                return (r.tags ?? []).some((t) => refTagFilter.has(t));
              });
              const toggleTag = (t: string) =>
                setRefTagFilter((prev) => {
                  const next = new Set(prev);
                  if (next.has(t)) next.delete(t);
                  else next.add(t);
                  return next;
                });
              return (
                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                  <div className="flex items-baseline justify-between gap-2 mb-3">
                    <h3 className="font-display font-semibold text-lg">
                      References{' '}
                      <span className="text-slate-400 text-sm font-normal">
                        ({filtered.length} of {result.references.length})
                      </span>
                    </h3>
                    {refTagFilter.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setRefTagFilter(new Set())}
                        className="text-[11px] font-mono text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        clear filter
                      </button>
                    )}
                  </div>
                  {tagList.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <span className="text-[11px] font-mono text-slate-500 mr-1 self-center">filter by tag:</span>
                      {tagList.map((t) => {
                        const active = refTagFilter.has(t);
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => toggleTag(t)}
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                              active
                                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                                : 'border-slate-300 dark:border-slate-700 text-slate-500'
                            }`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <ul className="space-y-2">
                    {filtered.map(({ url, tags }) => (
                      <li key={url} className="flex items-start gap-2">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-brand-600 dark:text-brand-400 hover:underline break-all font-mono flex items-center gap-1"
                        >
                          {url}
                          <ExternalLink size={11} className="shrink-0" />
                        </a>
                        {tags && tags.length > 0 && (
                          <span className="text-xs font-mono text-slate-500 shrink-0">[{tags.join(', ')}]</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })()}
        </div>
      )}
      <RelatedWikiArticles />
    </div>
  );
}
