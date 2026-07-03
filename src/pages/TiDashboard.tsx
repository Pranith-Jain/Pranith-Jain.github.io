import { useMemo, useState, useCallback } from 'react';
import {
  FileText,
  Zap,
  User,
  ShieldAlert,
  Crosshair,
  Package,
  Link2,
  ExternalLink,
  Loader2,
  Search,
} from 'lucide-react';
import { useDataFetch } from '../hooks/useDataFetch';
import { api } from '../lib/api-client';
import { memoryCache } from '../infrastructure/cache/memory-cache';
import { DataPageLayout } from '../components/DataPageLayout';

interface ArticleSource {
  id: number;
  title: string;
  url: string;
  published_date: string;
  source_type: string;
}

interface TimelineEntry {
  date: string;
  event: string;
  significance: string;
}

interface ThreatStory {
  headline: string;
  narrative: string;
  impact_assessment: string;
  action_required: string;
  timeline?: TimelineEntry[];
  sources: number[];
}

interface ActorProfile {
  name: string;
  motivation: string;
  recent_activity: string;
  aliases: string[];
  targets: string[];
  ttps: string[];
  sources: number[];
}

interface DashboardCve {
  cve: string;
  product: string;
  vendor: string;
  cvss: number;
  severity: string;
  exploitation_status: string;
  remediation: string;
}

interface HuntingLead {
  title: string;
  context: string;
  query: string;
  indicators: string[];
  sources: number[];
}

interface SupplyChainIncident {
  title: string;
  ecosystem: string;
  attack_vector: string;
  severity: string;
  status: string;
  threat_actor: string | null;
  url: string;
  summary: string;
}

interface DashboardStats {
  top_actors: [string, number][];
  top_targeted_industries: [string, number][];
  emerging_trends: string[];
  declining_threats: string[];
  key_changes: string;
}

interface TiDashboardReport {
  slug: string;
  week_start: string;
  week_end: string;
  generated_at: string;
  metadata: {
    documents_analyzed: number;
    reading_time_minutes: number;
    time_period_days: number;
  };
  sources: ArticleSource[];
  executive_brief: string;
  threat_stories: ThreatStory[];
  actor_profiles: ActorProfile[];
  critical_vulnerabilities: DashboardCve[];
  hunting_leads: HuntingLead[];
  supply_chain_incidents: SupplyChainIncident[];
  statistics: DashboardStats;
}

type Tab = 'brief' | 'stories' | 'actors' | 'vulns' | 'hunting' | 'supplychain' | 'sources';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'brief', label: 'Brief', icon: FileText },
  { id: 'stories', label: 'Stories', icon: Zap },
  { id: 'actors', label: 'Actors', icon: User },
  { id: 'vulns', label: 'Vulnerabilities', icon: ShieldAlert },
  { id: 'hunting', label: 'Hunting', icon: Crosshair },
  { id: 'supplychain', label: 'Supply Chain', icon: Package },
  { id: 'sources', label: 'Sources', icon: Link2 },
];

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
  high: 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800',
  medium: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
  low: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
};

const SEV_DEFAULT = 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800';

function cvssColor(score: number): string {
  if (score >= 9) return 'text-rose-600 dark:text-rose-400';
  if (score >= 7) return 'text-orange-600 dark:text-orange-400';
  if (score >= 4) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

function exploitColor(status: string): string {
  const s = (status ?? '').toLowerCase();
  if (s.includes('active')) return SEVERITY_STYLES['critical'] ?? SEV_DEFAULT;
  if (s.includes('functional') || s.includes('confirmed')) return SEVERITY_STYLES['high'] ?? SEV_DEFAULT;
  return 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/40 border-slate-300 dark:border-slate-700';
}

function severityPill(s: string): string {
  return SEVERITY_STYLES[s?.toLowerCase() ?? ''] ?? SEV_DEFAULT;
}

const CARD =
  'rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1';

export default function TiDashboard() {
  const [tab, setTab] = useState<Tab>('brief');
  const [expandedStories, setExpandedStories] = useState<Record<number, boolean>>({});
  const [sourceSearch, setSourceSearch] = useState('');
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string[]>([]);
  const [keywordSearch, setKeywordSearch] = useState('');

  const {
    data: report,
    loading,
    error,
    refetch,
  } = useDataFetch<TiDashboardReport>({
    url: '/api/v1/ti-dashboard/',
    ttl: 60000,
  });

  const handleBuild = useCallback(async () => {
    setBuilding(true);
    setBuildError(null);
    try {
      await api.post<{ ok: boolean; slug: string; sources: number }>('/api/v1/ti-dashboard/build', undefined, {
        timeoutMs: 120000,
      });
      memoryCache.delete('/api/v1/ti-dashboard/');
      refetch();
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuilding(false);
    }
  }, [refetch]);

  const toggleStory = (idx: number) => {
    setExpandedStories((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const toggleSeverity = (sev: string) => {
    setSeverityFilter((prev) => (prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev]));
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getSourceTitle = (id: number) => report?.sources.find((s) => s.id === id)?.title ?? `Source #${id}`;
  const getSourceUrl = (id: number) => report?.sources.find((s) => s.id === id)?.url ?? '#';

  const SEVERITY_LEVELS = ['Critical', 'High', 'Medium', 'Low'];

  const filteredSources = useMemo(() => {
    if (!report?.sources) return [];
    if (!sourceSearch) return report.sources;
    const q = sourceSearch.toLowerCase();
    return report.sources.filter((s) => s.title.toLowerCase().includes(q) || s.source_type.toLowerCase().includes(q));
  }, [report, sourceSearch]);

  const matchKeyword = (text: string) => {
    if (!keywordSearch) return true;
    return text.toLowerCase().includes(keywordSearch.toLowerCase());
  };

  const filteredStories = useMemo(() => {
    if (!report?.threat_stories) return [];
    return report.threat_stories.filter((s) => {
      const text = `${s.headline} ${s.impact_assessment} ${s.narrative}`;
      if (severityFilter.length > 0 && !severityFilter.some((sev) => text.toLowerCase().includes(sev.toLowerCase())))
        return false;
      if (!matchKeyword(text)) return false;
      return true;
    });
  }, [report, severityFilter, keywordSearch]);

  const filteredActors = useMemo(() => {
    if (!report?.actor_profiles) return [];
    return report.actor_profiles.filter((a) => {
      const text = `${a.name} ${a.recent_activity} ${a.motivation} ${a.aliases.join(' ')} ${a.targets.join(' ')}`;
      if (severityFilter.length > 0 && !severityFilter.some((sev) => text.toLowerCase().includes(sev.toLowerCase())))
        return false;
      if (!matchKeyword(text)) return false;
      return true;
    });
  }, [report, severityFilter, keywordSearch]);

  const filteredSupplyChain = useMemo(() => {
    if (!report?.supply_chain_incidents) return [];
    return report.supply_chain_incidents.filter((s) => {
      const text = `${s.title} ${s.ecosystem} ${s.attack_vector} ${s.severity} ${s.threat_actor ?? ''} ${s.summary}`;
      if (severityFilter.length > 0 && !severityFilter.some((sev) => s.severity.toLowerCase() === sev.toLowerCase()))
        return false;
      if (!matchKeyword(text)) return false;
      return true;
    });
  }, [report, severityFilter, keywordSearch]);

  const filteredVulns = useMemo(() => {
    if (!report?.critical_vulnerabilities) return [];
    return report.critical_vulnerabilities.filter((v) => {
      const text = `${v.cve} ${v.product} ${v.vendor} ${v.severity} ${v.exploitation_status} ${v.remediation}`;
      if (severityFilter.length > 0 && !severityFilter.some((sev) => v.severity.toLowerCase() === sev.toLowerCase()))
        return false;
      if (!matchKeyword(text)) return false;
      return true;
    });
  }, [report, severityFilter, keywordSearch]);

  const showFilter = tab === 'stories' || tab === 'actors' || tab === 'supplychain' || tab === 'vulns';

  const errorMsg = error && !error.includes('no_dashboard_found') && !error.includes('404') ? error : null;

  const isEmpty = !loading && !report && !errorMsg;

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<ShieldAlert className="h-6 w-6" />}
      title="TI Dashboard"
      description="Weekly threat intelligence report — IOCs, threat stories, actor profiles, critical vulnerabilities, hunting leads, and supply chain incidents."
      maxWidthClass="max-w-6xl"
      loading={loading}
      error={errorMsg}
      onRetry={refetch}
      empty={isEmpty}
      emptyMessage="No report available yet. The first build runs on Monday at 00:45 UTC."
      headerExtra={
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {report && (
            <>
              <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 font-mono">
                {report.metadata.documents_analyzed} sources
              </span>
              <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 font-mono">
                {report.metadata.time_period_days}d window
              </span>
              <span className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1 font-mono">
                {formatDate(report.generated_at)}
              </span>
            </>
          )}
          <button
            type="button"
            onClick={handleBuild}
            disabled={building}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2.5 py-1 text-xs font-mono text-slate-500 dark:text-slate-400 hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400 transition-colors disabled:opacity-50"
          >
            {building ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {building ? 'Building…' : 'Build now'}
          </button>
          {buildError && <span className="text-rose-600 dark:text-rose-400 text-xs">{buildError}</span>}
        </div>
      }
    >
      {!report ? (
        <div className="text-center py-12">
          <button
            type="button"
            onClick={handleBuild}
            disabled={building}
            className="inline-flex items-center gap-2 rounded-lg border border-brand-500 bg-brand-500 text-white px-4 py-2 text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50"
          >
            {building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {building ? 'Building…' : 'Build Report'}
          </button>
        </div>
      ) : (
        <>
          {/* Metrics strip */}
          <div className="grid grid-cols-5 max-sm:grid-cols-3 gap-2 mb-4">
            {[
              { value: report.sources.length, label: 'Sources' },
              { value: report.threat_stories.length, label: 'Threat Stories' },
              { value: report.actor_profiles.length, label: 'Actors' },
              { value: report.critical_vulnerabilities.length, label: 'Critical Vulns' },
              { value: report.hunting_leads.length, label: 'Hunting Leads' },
            ].map((m) => (
              <div key={m.label} className={`${CARD} p-3 text-center`}>
                <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{m.value}</div>
                <div className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-0.5">
                  {m.label}
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 text-mini font-mono rounded-full border px-2.5 py-1 transition-colors ${
                    tab === t.id
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                      : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> <span className="max-sm:hidden">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Severity filter bar */}
          {showFilter && (
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search keywords…"
                  value={keywordSearch}
                  onChange={(e) => setKeywordSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 w-48"
                />
                {keywordSearch && (
                  <button
                    onClick={() => setKeywordSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="w-px h-5 bg-slate-200 dark:bg-[rgb(var(--border-400))]" />
              <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Severity:
              </span>
              {SEVERITY_LEVELS.map((sev) => {
                const active = severityFilter.includes(sev);
                return (
                  <button
                    key={sev}
                    onClick={() => toggleSeverity(sev)}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-mono transition-colors border ${
                      active
                        ? severityPill(sev)
                        : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-slate-400'
                    }`}
                  >
                    {sev}
                  </button>
                );
              })}
              {(severityFilter.length > 0 || keywordSearch) && (
                <button
                  onClick={() => {
                    setSeverityFilter([]);
                    setKeywordSearch('');
                  }}
                  className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ml-1"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Brief tab */}
          {tab === 'brief' && (
            <section className={`${CARD} p-6`}>
              {report.executive_brief ? (
                <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed space-y-3">
                  {report.executive_brief.split('\n').map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                  No executive brief available. Run an LLM enrichment build.
                </p>
              )}
            </section>
          )}

          {/* Stories tab */}
          {tab === 'stories' && (
            <div className="space-y-3">
              {filteredStories.length === 0 && <EmptyMsg message="No threat stories match the current filters." />}
              {filteredStories.map((story, idx) => (
                <div key={idx} className={`${CARD} overflow-hidden`}>
                  <button
                    type="button"
                    className="w-full flex items-start gap-4 p-4 text-left hover:bg-slate-50 dark:hover:bg-[rgb(var(--hover-100))] transition-colors"
                    onClick={() => toggleStory(idx)}
                  >
                    <span className="font-mono text-xs text-slate-400 pt-0.5 shrink-0">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
                        {story.headline}
                      </h3>
                      <span
                        className={`text-xs font-mono px-2 py-0.5 rounded border ${severityPill(story.impact_assessment)}`}
                      >
                        {story.impact_assessment}
                      </span>
                    </div>
                    <span className="text-slate-400 shrink-0 mt-1">{expandedStories[idx] ? '▲' : '▼'}</span>
                  </button>
                  {expandedStories[idx] && (
                    <div className="px-5 pb-5 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                      <div className="pt-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-3">
                        {story.narrative.split('\n').map((p, i) => p.trim() && <p key={i}>{p}</p>)}
                      </div>
                      {story.timeline && story.timeline.length > 0 && (
                        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                          <h4 className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                            Timeline
                          </h4>
                          <div className="space-y-3">
                            {story.timeline.map((evt, ei) => (
                              <div key={ei} className="flex gap-3">
                                <div className="w-2 h-2 mt-1.5 rounded-full bg-brand-500 shrink-0" />
                                <div>
                                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {evt.date}
                                  </div>
                                  <div className="text-sm text-slate-700 dark:text-slate-200">{evt.event}</div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400">{evt.significance}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-5 pt-4 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                        <h4 className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                          Action Required
                        </h4>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{story.action_required}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))] flex-wrap">
                        <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Sources:
                        </span>
                        {story.sources.map((srcId) => (
                          <a
                            key={srcId}
                            href={getSourceUrl(srcId)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-mono text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 px-2 py-0.5 rounded hover:opacity-80"
                            title={getSourceTitle(srcId)}
                          >
                            {srcId}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actors tab */}
          {tab === 'actors' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredActors.length === 0 && <EmptyMsg message="No actor profiles match the current filters." />}
              {filteredActors.map((actor, idx) => (
                <div key={idx} className={`${CARD} p-4`}>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0 border border-violet-200 dark:border-violet-800">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{actor.name}</h3>
                      <span
                        className={`text-xs font-mono px-2 py-0.5 rounded border ${severityPill(actor.motivation.includes('espionage') ? 'high' : actor.motivation.includes('financial') ? 'medium' : 'critical')}`}
                      >
                        {actor.motivation}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{actor.recent_activity}</p>
                  <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                    {actor.aliases.length > 0 && (
                      <div>
                        <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Aliases
                        </span>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{actor.aliases.join(', ')}</p>
                      </div>
                    )}
                    {actor.targets.length > 0 && (
                      <div>
                        <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Targets
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {actor.targets.map((t, ti) => (
                            <span
                              key={ti}
                              className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {actor.ttps.length > 0 && (
                      <div>
                        <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          TTPs
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {actor.ttps.map((t, ti) => (
                            <code
                              key={ti}
                              className="text-xs font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded"
                            >
                              {t}
                            </code>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 mt-3 flex-wrap">
                    {actor.sources.map((srcId) => (
                      <a
                        key={srcId}
                        href={getSourceUrl(srcId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 px-2 py-0.5 rounded hover:opacity-80"
                      >
                        {srcId}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Vulnerabilities tab */}
          {tab === 'vulns' && (
            <div>
              {filteredVulns.length === 0 && <EmptyMsg message="No vulnerabilities match the current filters." />}
              {filteredVulns.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-[rgb(var(--surface-200))] text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <th className="text-left p-3 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                          CVE
                        </th>
                        <th className="text-left p-3 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                          Product
                        </th>
                        <th className="text-left p-3 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                          CVSS
                        </th>
                        <th className="text-left p-3 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                          Severity
                        </th>
                        <th className="text-left p-3 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                          Status
                        </th>
                        <th className="text-left p-3 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                          Remediation
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVulns.map((vuln, idx) => (
                        <tr
                          key={idx}
                          className="border-b border-slate-100 dark:border-[rgb(var(--border-400))]/60 last:border-0 hover:bg-slate-50 dark:hover:bg-[rgb(var(--hover-100))]"
                        >
                          <td className="p-3">
                            <code className="text-xs font-mono text-brand-600 dark:text-brand-400">{vuln.cve}</code>
                          </td>
                          <td className="p-3">
                            <div className="text-slate-900 dark:text-slate-100 font-medium">{vuln.product}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">{vuln.vendor}</div>
                          </td>
                          <td className="p-3">
                            <span className={`font-mono font-bold ${cvssColor(vuln.cvss)}`}>{vuln.cvss}</span>
                          </td>
                          <td className="p-3">
                            <span
                              className={`text-xs font-mono px-2 py-0.5 rounded border ${severityPill(vuln.severity)}`}
                            >
                              {vuln.severity}
                            </span>
                          </td>
                          <td className="p-3">
                            <span
                              className={`text-xs font-mono px-2 py-0.5 rounded border ${exploitColor(vuln.exploitation_status)}`}
                            >
                              {vuln.exploitation_status}
                            </span>
                          </td>
                          <td className="p-3 text-xs text-slate-500 dark:text-slate-400 max-w-[280px]">
                            {vuln.remediation}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Hunting leads tab */}
          {tab === 'hunting' && (
            <div className="space-y-3">
              {report.hunting_leads.length === 0 && <EmptyMsg message="No hunting leads available." />}
              {report.hunting_leads.map((lead, idx) => (
                <div key={idx} className={`${CARD} p-4`}>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0 border border-orange-200 dark:border-orange-800">
                      <Crosshair className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{lead.title}</h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{lead.context}</p>
                    </div>
                  </div>
                  <div className="bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-md p-3 mb-3 overflow-x-auto">
                    <code className="text-xs font-mono text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-all">
                      {lead.query}
                    </code>
                  </div>
                  {lead.indicators.length > 0 && (
                    <div className="flex items-start gap-2 mb-2 flex-wrap">
                      <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 pt-0.5">
                        Indicators
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {lead.indicators.map((ind, ii) => (
                          <span
                            key={ii}
                            className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded"
                          >
                            {ind}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-1 flex-wrap">
                    {lead.sources.map((srcId) => (
                      <a
                        key={srcId}
                        href={getSourceUrl(srcId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-950/40 px-2 py-0.5 rounded hover:opacity-80"
                      >
                        {srcId}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Supply Chain tab */}
          {tab === 'supplychain' && (
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-4">
                {[
                  { label: 'npm', ecosystem: 'npm' },
                  { label: 'PyPI', ecosystem: 'PyPI' },
                  { label: 'Maven', ecosystem: 'Maven' },
                  { label: 'Go', ecosystem: 'Go' },
                  { label: 'Other', ecosystem: 'other' },
                ].map((s) => {
                  const count = report.supply_chain_incidents.filter((inc) => inc.ecosystem === s.ecosystem).length;
                  return (
                    <div key={s.label} className={`${CARD} p-3 text-center`}>
                      <div className="text-xl font-bold text-slate-900 dark:text-slate-100">{count}</div>
                      <div className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-0.5">
                        {s.label}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-2">
                {filteredSupplyChain.length === 0 && (
                  <EmptyMsg message="No supply chain incidents match the current filters." />
                )}
                {filteredSupplyChain.map((inc, idx) => (
                  <div key={idx} className={`${CARD} p-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <a
                          href={inc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 transition-colors inline-flex items-center gap-1"
                        >
                          {inc.title} <ExternalLink className="h-3 w-3" />
                        </a>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span className="text-micro font-mono uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">
                            {inc.ecosystem}
                          </span>
                          <span className="text-micro font-mono uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded">
                            {inc.attack_vector}
                          </span>
                          <span
                            className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${severityPill(inc.severity)}`}
                          >
                            {inc.severity}
                          </span>
                          <span
                            className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${exploitColor(inc.status)}`}
                          >
                            {inc.status}
                          </span>
                          {inc.threat_actor && (
                            <span className="text-micro font-mono uppercase tracking-wider bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 px-1.5 py-0.5 rounded">
                              {inc.threat_actor}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {inc.summary && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">{inc.summary}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sources tab */}
          {tab === 'sources' && (
            <div>
              <div className="mb-4">
                <div className="relative max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Filter sources…"
                    value={sourceSearch}
                    onChange={(e) => setSourceSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>
              <div className={`${CARD} divide-y divide-slate-100 dark:divide-[rgb(var(--border-400))]/60`}>
                {filteredSources.map((src) => (
                  <a
                    key={src.id}
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-[rgb(var(--hover-100))] transition-colors text-sm"
                  >
                    <span className="font-mono text-xs text-slate-400 shrink-0">{src.id}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-slate-900 dark:text-slate-100 font-medium truncate block">{src.title}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {formatDate(src.published_date)}
                      </span>
                    </div>
                    <span className="text-micro font-mono uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded shrink-0">
                      {src.source_type}
                    </span>
                    <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </DataPageLayout>
  );
}

function EmptyMsg({ message }: { message: string }) {
  return <div className={`${CARD} p-8 text-center text-sm text-slate-500 dark:text-slate-400`}>{message}</div>;
}
