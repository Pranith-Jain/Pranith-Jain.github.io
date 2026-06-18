import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { detectIoc } from '../../lib/dfir/ioc-detect';
import {
  Search,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Globe,
  Monitor,
  Shield,
  FileText,
  BookOpen,
  Hash,
  Users,
  Bug,
  ChevronDown,
  ChevronRight,
  Download,
} from 'lucide-react';

interface ResolvedEntity {
  type: string;
  id: string;
  label: string;
  aliases: string[];
  confidence: number;
  source: string;
}

interface EntityLink {
  source_id: string;
  source_type: string;
  target_id: string;
  target_type: string;
  relationship: string;
  confidence: number;
}

interface EntityProfile {
  entity: ResolvedEntity;
  links: EntityLink[];
  techniques?: Array<{ id: string; name: string; tactic: string }>;
  cves?: string[];
  cross_references: Array<{ source_id: string; source_name: string; label: string }>;
}

interface WikiArticle {
  slug: string;
  title: string;
  category: string;
  description: string;
}

interface CachedIndicators {
  live_ioc_count: number;
  c2_count: number;
  malware_sample_count: number;
  breach_hits: number;
}

interface ObserveResponse {
  query: string;
  entity_type: string;
  entity?: ResolvedEntity;
  profile?: EntityProfile;
  wiki_articles: WikiArticle[];
  cached_indicators?: CachedIndicators;
  generated_at: string;
}

const ENTITY_ICONS: Record<string, typeof Shield> = {
  actor: Users,
  ransomware: Bug,
  cve: Shield,
  malware: Bug,
  ip: Monitor,
  domain: Globe,
  hash: Hash,
};

const ENTITY_COLORS: Record<string, string> = {
  actor: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800',
  ransomware:
    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  cve: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  malware:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  ip: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  domain: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
  hash: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-800',
};

export default function Observe(): JSX.Element {
  const [searchParams] = useSearchParams();
  const qParam = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(qParam);
  const [submittedQuery, setSubmittedQuery] = useState(qParam);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ObserveResponse | null>(null);
  const [showIocDetail, setShowIocDetail] = useState(false);
  const [iocVerdicts, setIocVerdicts] = useState<Array<{ source: string; score: number; verdict: string }> | null>(
    null
  );
  const [iocLoading, setIocLoading] = useState(false);

  const fetchObserve = async (q: string) => {
    if (!q.trim()) return;
    setSubmittedQuery(q.trim());
    setLoading(true);
    setError(null);
    setData(null);
    setIocVerdicts(null);
    try {
      const res = await fetch(`/api/v1/threat-intel/observe?q=${encodeURIComponent(q.trim())}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((err as { error?: string }).error ?? 'Observation failed');
      }
      setData((await res.json()) as ObserveResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (qParam) {
      setQuery(qParam);
      void fetchObserve(qParam);
    }
  }, [qParam]);

  const loadIocDetail = async () => {
    const ioc = submittedQuery;
    if (!ioc || iocLoading) return;
    setIocLoading(true);
    setShowIocDetail(true);
    setError(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`/api/v1/ioc/stream?indicator=${encodeURIComponent(ioc)}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`IOC check failed: ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      const verdicts: Array<{ source: string; score: number; verdict: string }> = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6)) as {
              type?: string;
              source?: string;
              score?: number;
              verdict?: string;
            };
            if (parsed.type === 'result' && parsed.source) {
              verdicts.push({ source: parsed.source, score: parsed.score ?? 0, verdict: parsed.verdict ?? 'unknown' });
            }
          } catch {
            /* skip malformed */
          }
        }
      }
      setIocVerdicts(verdicts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== 'The operation was aborted') {
        setError(`IOC check failed: ${msg}`);
      }
    } finally {
      setIocLoading(false);
    }
  };

  const entityType = data?.entity_type ?? (submittedQuery ? detectIoc(submittedQuery)?.type : null) ?? '';
  const EntityIcon = ENTITY_ICONS[entityType] ?? Search;
  const entityColor =
    ENTITY_COLORS[entityType] ??
    'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-[#1e2030]';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <Search size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Monitor className="text-brand-600 dark:text-brand-400" size={28} />
          Observable 360
        </h1>
        <p className="text-muted max-w-3xl leading-relaxed">
          Unified view of any IP, domain, hash, URL, email, CVE, or threat actor — enrichment, context, and related
          intelligence in one place.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-4 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            aria-label="Observable query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchObserve(query)}
            placeholder="IP, domain, hash, CVE, URL, email, or threat actor name..."
            className="w-full pl-9 pr-14 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-[#1e2030] rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            disabled={loading}
          />
          <button
            onClick={() => fetchObserve(query)}
            disabled={loading || !query.trim()}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded bg-brand-600 dark:bg-brand-500 hover:bg-brand-700 dark:hover:bg-brand-400 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
            aria-label="Look up"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          </button>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-lg mb-6">
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 size={24} className="animate-spin mr-3" />
          <span className="font-mono text-sm">Querying intelligence sources...</span>
        </div>
      )}

      {data && !loading && (
        <div className="space-y-6 animate-fade-in-up">
          {/* Entity header */}
          <div className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-5">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg border ${entityColor}`}>
                <EntityIcon size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xl font-bold font-mono truncate">{data.query}</h2>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${entityColor}`}>
                    {data.entity_type}
                  </span>
                </div>
                {data.entity && (
                  <p className="text-sm text-muted">
                    {data.entity.label}
                    {data.entity.aliases.length > 0 && (
                      <span className="ml-2 text-slate-400">aliases: {data.entity.aliases.join(', ')}</span>
                    )}
                  </p>
                )}
                {data.cached_indicators && (
                  <div className="flex flex-wrap gap-3 mt-3">
                    <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                      {data.cached_indicators.live_ioc_count} IOC sightings
                    </span>
                    <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                      {data.cached_indicators.c2_count} C2 hits
                    </span>
                    <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                      {data.cached_indicators.breach_hits} breach hits
                    </span>
                    {data.cached_indicators.malware_sample_count > 0 && (
                      <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                        {data.cached_indicators.malware_sample_count} malware samples
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* IOC Enrichment */}
            <div className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1">
              <button
                onClick={() => {
                  setShowIocDetail(!showIocDetail);
                  if (!showIocDetail && !iocVerdicts) loadIocDetail();
                }}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-brand-600 dark:text-brand-400" />
                  <span className="font-semibold text-sm">IOC Enrichment</span>
                </div>
                {showIocDetail ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              {showIocDetail && (
                <div className="px-4 pb-4 border-t border-slate-200 dark:border-[#1e2030] pt-3">
                  {iocLoading && (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Loader2 size={14} className="animate-spin" />
                      Checking 24+ threat intelligence sources...
                    </div>
                  )}
                  {iocVerdicts && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-slate-500 font-mono mb-2">{iocVerdicts.length} sources checked</p>
                      {iocVerdicts.slice(0, 15).map((v, i) => (
                        <div key={i} className="flex items-center justify-between text-xs font-mono">
                          <span className="truncate mr-2">{v.source}</span>
                          <span
                            className={`shrink-0 px-1.5 py-0.5 rounded ${
                              v.verdict === 'malicious'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                : v.verdict === 'suspicious'
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            }`}
                          >
                            {v.verdict}
                          </span>
                        </div>
                      ))}
                      {iocVerdicts.length > 15 && (
                        <p className="text-xs text-slate-400 mt-2">+{iocVerdicts.length - 15} more</p>
                      )}
                    </div>
                  )}
                  <Link
                    to={`/dfir/ioc-check?indicator=${encodeURIComponent(submittedQuery)}`}
                    className="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline mt-3"
                  >
                    <ExternalLink size={10} /> Full IOC check
                  </Link>
                </div>
              )}
            </div>

            {/* Entity Profile */}
            {data.profile && (
              <div className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1">
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-[#1e2030]">
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-brand-600 dark:text-brand-400" />
                    <span className="font-semibold text-sm">Entity Profile</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    confidence: {Math.round((data.profile.entity.confidence ?? 0) * 100)}%
                  </span>
                </div>
                <div className="p-4 space-y-3">
                  {data.profile.links.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">Relationships</p>
                      <div className="space-y-1">
                        {data.profile.links.slice(0, 8).map((link, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs font-mono text-muted">
                            <span className="text-slate-400">{link.relationship}</span>
                            <Link
                              to={`/threatintel/observe?q=${encodeURIComponent(link.target_id)}`}
                              className="text-brand-600 dark:text-brand-400 hover:underline"
                            >
                              {link.target_id}
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {data.profile.techniques && data.profile.techniques.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">MITRE ATT&CK</p>
                      <div className="flex flex-wrap gap-1">
                        {data.profile.techniques.slice(0, 6).map((t, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-muted"
                          >
                            {t.id}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {data.profile.cves && data.profile.cves.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-1.5">Related CVEs</p>
                      <div className="flex flex-wrap gap-1">
                        {data.profile.cves.slice(0, 5).map((c, i) => (
                          <Link
                            key={i}
                            to={`/dfir/cve?q=${c}`}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:underline"
                          >
                            {c}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                  <Link
                    to={`/threatintel/entity-resolution?q=${encodeURIComponent(submittedQuery)}`}
                    className="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    <ExternalLink size={10} /> Full entity detail
                  </Link>
                </div>
              </div>
            )}

            {/* Wiki Articles */}
            {data.wiki_articles.length > 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1">
                <div className="flex items-center gap-2 p-4 border-b border-slate-200 dark:border-[#1e2030]">
                  <BookOpen size={16} className="text-brand-600 dark:text-brand-400" />
                  <span className="font-semibold text-sm">Related Knowledge Base</span>
                </div>
                <div className="p-4 space-y-2">
                  {data.wiki_articles.slice(0, 5).map((a) => (
                    <Link
                      key={a.slug}
                      to={`/threatintel/wiki/${a.slug}`}
                      className="block p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{a.description}</p>
                      <span className="text-[10px] font-mono text-slate-400">{a.category}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1">
              <div className="flex items-center gap-2 p-4 border-b border-slate-200 dark:border-[#1e2030]">
                <FileText size={16} className="text-brand-600 dark:text-brand-400" />
                <span className="font-semibold text-sm">Quick Actions</span>
              </div>
              <div className="p-4 space-y-2">
                <Link
                  to={`/dfir/export-hub?q=${encodeURIComponent(submittedQuery)}`}
                  className="flex items-center gap-2 text-xs font-mono text-muted hover:text-brand-600 dark:hover:text-brand-400 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <Download size={12} />
                  Export as STIX / CSV / YARA / Sigma / Blocklist
                </Link>
                <Link
                  to={`/threatintel/search?q=${encodeURIComponent(submittedQuery)}`}
                  className="flex items-center gap-2 text-xs font-mono text-muted hover:text-brand-600 dark:hover:text-brand-400 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <Search size={12} />
                  Cross-source search
                </Link>
                <Link
                  to={`/threatintel/copilot-chat?q=${encodeURIComponent(submittedQuery)}`}
                  className="flex items-center gap-2 text-xs font-mono text-muted hover:text-brand-600 dark:hover:text-brand-400 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <Users size={12} />
                  Ask the CTI Copilot
                </Link>
                {entityType === 'domain' && (
                  <Link
                    to={`/dfir/domain?q=${encodeURIComponent(submittedQuery)}`}
                    className="flex items-center gap-2 text-xs font-mono text-muted hover:text-brand-600 dark:hover:text-brand-400 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <Globe size={12} />
                    Full domain analysis (WHOIS / DNS / email-auth)
                  </Link>
                )}
                {entityType === 'ip' && (
                  <Link
                    to={`/dfir/ip-geo?q=${encodeURIComponent(submittedQuery)}`}
                    className="flex items-center gap-2 text-xs font-mono text-muted hover:text-brand-600 dark:hover:text-brand-400 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <Monitor size={12} />
                    IP geolocation + reputation
                  </Link>
                )}
                {entityType === 'cve' && (
                  <Link
                    to={`/dfir/cve?q=${encodeURIComponent(submittedQuery)}`}
                    className="flex items-center gap-2 text-xs font-mono text-muted hover:text-brand-600 dark:hover:text-brand-400 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <Shield size={12} />
                    CVE details (EPSS, KEV, PoC)
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
