import { useMemo, useState } from 'react';
import { FileText, Zap, User, ShieldAlert, Crosshair, Package, Link, ExternalLink } from 'lucide-react';
import { useDataFetch } from '../hooks/useDataFetch';

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
  { id: 'sources', label: 'Sources', icon: Link },
];

function impactClass(impact: string): string {
  const s = impact.toLowerCase();
  if (s.includes('critical')) return 'bg-red-900/60 text-red-300 border-red-800';
  if (s.includes('high')) return 'bg-orange-900/60 text-orange-300 border-orange-800';
  if (s.includes('medium')) return 'bg-yellow-900/60 text-yellow-300 border-yellow-800';
  return 'bg-gray-800 text-gray-400 border-gray-700';
}

function severityClass(severity: string): string {
  const s = severity.toLowerCase();
  if (s === 'critical') return 'bg-red-900/60 text-red-300 border-red-800';
  if (s === 'high') return 'bg-orange-900/60 text-orange-300 border-orange-800';
  if (s === 'medium') return 'bg-yellow-900/60 text-yellow-300 border-yellow-800';
  return 'bg-gray-800 text-gray-400 border-gray-700';
}

function cvssClass(score: number): string {
  if (score >= 9) return 'text-red-400';
  if (score >= 7) return 'text-orange-400';
  if (score >= 4) return 'text-yellow-400';
  return 'text-green-400';
}

function exploitClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('active')) return 'bg-red-900/60 text-red-300';
  if (s.includes('functional') || s.includes('confirmed')) return 'bg-orange-900/60 text-orange-300';
  return 'bg-gray-800 text-gray-400';
}

export default function TiDashboard() {
  const [tab, setTab] = useState<Tab>('brief');
  const [expandedStories, setExpandedStories] = useState<Record<number, boolean>>({});
  const [sourceSearch, setSourceSearch] = useState('');

  const {
    data: report,
    loading,
    error,
  } = useDataFetch<TiDashboardReport>({
    url: '/api/v1/ti-dashboard/',
    ttl: 60000,
  });

  const toggleStory = (idx: number) => {
    setExpandedStories((prev) => ({ ...prev, [idx]: !prev[idx] }));
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

  const getSourceTitle = (id: number) => {
    return report?.sources.find((s) => s.id === id)?.title ?? `Source #${id}`;
  };

  const getSourceUrl = (id: number) => {
    return report?.sources.find((s) => s.id === id)?.url ?? '#';
  };

  const filteredSources = useMemo(() => {
    if (!report?.sources) return [];
    if (!sourceSearch) return report.sources;
    const q = sourceSearch.toLowerCase();
    return report.sources.filter((s) => s.title.toLowerCase().includes(q) || s.source_type.toLowerCase().includes(q));
  }, [report, sourceSearch]);

  if (loading) {
    return (
      <div className="min-h-screen [background:rgb(var(--surface-100))] text-slate-100 dark:text-slate-200 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[rgb(var(--border-500))] border-t-brand-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted text-sm">Loading threat intelligence report...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen [background:rgb(var(--surface-100))] text-slate-100 dark:text-slate-200 flex items-center justify-center">
        <div className="text-center">
          <p className="text-severity-critical mb-4">Failed to load report</p>
          <p className="text-muted text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen [background:rgb(var(--surface-100))] text-slate-100 dark:text-slate-200 flex items-center justify-center">
        <p className="text-muted">No dashboard report available. Run a build first.</p>
      </div>
    );
  }

  const scStats = (ecosystem: string) => {
    const count = report.supply_chain_incidents.filter((s) => s.ecosystem === ecosystem).length;
    return count;
  };

  return (
    <div className="min-h-screen [background:rgb(var(--surface-100))] text-slate-100 dark:text-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <header className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-6 bg-brand-500 rounded" />
            <div>
              <h1 className="text-lg font-bold tracking-wider text-slate-100 dark:text-white">TI DASHBOARD</h1>
              <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-muted">
                THREAT INTELLIGENCE REPORT
              </p>
            </div>
          </div>
        </header>

        {/* Meta */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <span>{formatDate(report.generated_at)}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs [background:rgb(var(--hover-100))] text-muted px-2 py-1 rounded">
              {report.metadata.documents_analyzed} sources
            </span>
            <span className="text-xs [background:rgb(var(--hover-100))] text-muted px-2 py-1 rounded">
              {report.metadata.time_period_days} day window
            </span>
          </div>
        </div>

        {/* Metrics strip */}
        <div className="grid grid-cols-5 max-sm:grid-cols-3 gap-px [background:rgb(var(--border-400))] rounded-lg overflow-hidden mb-5">
          {[
            { value: report.sources.length, label: 'Sources' },
            { value: report.threat_stories.length, label: 'Threat Stories' },
            { value: report.actor_profiles.length, label: 'Threat Actors' },
            { value: report.critical_vulnerabilities.length, label: 'Critical Vulns' },
            { value: report.hunting_leads.length, label: 'Hunting Leads' },
          ].map((m) => (
            <div key={m.label} className="surface-card p-4 text-center">
              <div className="text-2xl font-bold text-slate-100 dark:text-white">{m.value}</div>
              <div className="text-[0.65rem] font-semibold tracking-widest uppercase text-muted mt-1">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Nav tabs */}
        <nav className="flex gap-px border-b border-[rgb(var(--border-400))] mb-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.id ? 'border-brand-500 text-brand-400' : 'border-transparent text-muted hover:text-slate-300'
              }`}
            >
              <t.icon className="w-4 h-4" />
              <span className="max-sm:hidden">{t.label}</span>
            </button>
          ))}
        </nav>

        {/* Brief tab */}
        {tab === 'brief' && (
          <div className="surface-card p-8 text-sm text-muted leading-relaxed">
            {report.executive_brief ? (
              report.executive_brief.split('\n').map((p, i) => (
                <p key={i} className="mb-4 last:mb-0">
                  {p}
                </p>
              ))
            ) : (
              <p className="text-muted italic">No executive brief available. Run an LLM enrichment build.</p>
            )}
          </div>
        )}

        {/* Stories tab */}
        {tab === 'stories' && (
          <div className="space-y-3">
            {report.threat_stories.length === 0 && (
              <p className="text-gray-500 text-sm">No threat stories available.</p>
            )}
            {report.threat_stories.map((story, idx) => (
              <div key={idx} className="surface-card overflow-hidden">
                <div
                  className="flex items-start gap-4 p-5 cursor-pointer hover:[background:rgb(var(--hover-100))] transition-colors"
                  onClick={() => toggleStory(idx)}
                >
                  <span className="font-mono text-xs text-muted pt-0.5 shrink-0">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-100 dark:text-slate-100 mb-1">{story.headline}</h3>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded border ${impactClass(story.impact_assessment)}`}
                    >
                      {story.impact_assessment}
                    </span>
                  </div>
                </div>
                {expandedStories[idx] && (
                  <div className="px-5 pb-5 border-t border-[rgb(var(--border-400))]">
                    <div className="pt-4 text-sm text-muted leading-relaxed space-y-3">
                      {story.narrative.split('\n').map((p, i) => p.trim() && <p key={i}>{p}</p>)}
                    </div>
                    {story.timeline && story.timeline.length > 0 && (
                      <div className="mt-5 pt-4 border-t border-[rgb(var(--border-400))]">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-muted mb-3">Timeline</h4>
                        <div className="space-y-3">
                          {story.timeline.map((evt, ei) => (
                            <div key={ei} className="flex gap-3">
                              <div className="w-2 h-2 mt-1.5 rounded-full bg-brand-500 shrink-0" />
                              <div>
                                <div className="text-xs font-semibold text-muted">{evt.date}</div>
                                <div className="text-sm text-slate-300">{evt.event}</div>
                                <div className="text-xs text-muted">{evt.significance}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-5 pt-4 border-t border-[rgb(var(--border-400))]">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-muted mb-2">Action Required</h4>
                      <p className="text-sm text-muted">{story.action_required}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[rgb(var(--border-400))] flex-wrap">
                      <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">Sources:</span>
                      {story.sources.map((srcId) => (
                        <a
                          key={srcId}
                          href={getSourceUrl(srcId)}
                          target="_blank"
                          rel="noopener"
                          className="text-xs font-mono text-brand-400 [background:rgb(var(--color-brand-500)/0.15)] px-2 py-0.5 rounded hover:opacity-80"
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.actor_profiles.length === 0 && (
              <p className="text-muted text-sm col-span-full">No actor profiles available.</p>
            )}
            {report.actor_profiles.map((actor, idx) => (
              <div key={idx} className="surface-card p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-900/60 text-purple-400 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100 dark:text-slate-100">{actor.name}</h3>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded border ${
                        actor.motivation.toLowerCase().includes('espionage')
                          ? 'bg-purple-900/60 text-purple-300 border-purple-800'
                          : actor.motivation.toLowerCase().includes('financial')
                            ? 'bg-green-900/60 text-green-300 border-green-800'
                            : 'bg-red-900/60 text-red-300 border-red-800'
                      }`}
                    >
                      {actor.motivation}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted mb-4">{actor.recent_activity}</p>
                <div className="space-y-3 pt-3 border-t border-[rgb(var(--border-400))]">
                  {actor.aliases.length > 0 && (
                    <div>
                      <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">Aliases</span>
                      <p className="text-sm text-muted">{actor.aliases.join(', ')}</p>
                    </div>
                  )}
                  {actor.targets.length > 0 && (
                    <div>
                      <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">Targets</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {actor.targets.map((t, ti) => (
                          <span
                            key={ti}
                            className="text-xs text-muted [background:rgb(var(--hover-100))] px-2 py-0.5 rounded"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {actor.ttps.length > 0 && (
                    <div>
                      <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted">TTPs</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {actor.ttps.map((t, ti) => (
                          <code
                            key={ti}
                            className="text-xs font-mono text-muted [background:rgb(var(--hover-100))] px-1.5 py-0.5 rounded"
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
                      rel="noopener"
                      className="text-xs font-mono text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded hover:opacity-80"
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
            {report.critical_vulnerabilities.length === 0 && (
              <p className="text-muted text-sm">No critical vulnerabilities this week.</p>
            )}
            {report.critical_vulnerabilities.length > 0 && (
              <div className="overflow-x-auto border border-[rgb(var(--border-400))] rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="surface-card text-[0.65rem] font-bold uppercase tracking-wider text-muted">
                      <th className="text-left p-3 border-b border-[rgb(var(--border-400))]">CVE / ID</th>
                      <th className="text-left p-3 border-b border-[rgb(var(--border-400))]">Product</th>
                      <th className="text-left p-3 border-b border-[rgb(var(--border-400))]">CVSS</th>
                      <th className="text-left p-3 border-b border-[rgb(var(--border-400))]">Severity</th>
                      <th className="text-left p-3 border-b border-[rgb(var(--border-400))]">Status</th>
                      <th className="text-left p-3 border-b border-[rgb(var(--border-400))]">Remediation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.critical_vulnerabilities.map((vuln, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-[rgb(var(--border-400))] last:border-0 hover:[background:rgb(var(--hover-100))]"
                      >
                        <td className="p-3">
                          <code className="text-xs font-mono text-brand-400">{vuln.cve}</code>
                        </td>
                        <td className="p-3">
                          <div className="text-slate-200 font-medium">{vuln.product}</div>
                          <div className="text-xs text-muted">{vuln.vendor}</div>
                        </td>
                        <td className="p-3">
                          <span className={`font-mono font-bold ${cvssClass(vuln.cvss)}`}>{vuln.cvss}</span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded border ${severityClass(vuln.severity)}`}
                          >
                            {vuln.severity}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded ${exploitClass(vuln.exploitation_status)}`}
                          >
                            {vuln.exploitation_status}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-muted max-w-[280px]">{vuln.remediation}</td>
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
          <div className="space-y-4">
            {report.hunting_leads.length === 0 && <p className="text-muted text-sm">No hunting leads available.</p>}
            {report.hunting_leads.map((lead, idx) => (
              <div key={idx} className="surface-card p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-orange-900/60 text-orange-400 flex items-center justify-center shrink-0">
                    <Crosshair className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100 dark:text-slate-100">{lead.title}</h3>
                    <p className="text-sm text-muted">{lead.context}</p>
                  </div>
                </div>
                <div className="[background:rgb(var(--surface-100))] border border-[rgb(var(--border-400))] rounded-md p-4 mb-4 overflow-x-auto">
                  <code className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-all">{lead.query}</code>
                </div>
                {lead.indicators.length > 0 && (
                  <div className="flex items-start gap-2 mb-3 flex-wrap">
                    <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted pt-1">
                      Indicators
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {lead.indicators.map((ind, ii) => (
                        <span
                          key={ii}
                          className="text-xs text-muted [background:rgb(var(--hover-100))] px-2 py-0.5 rounded"
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
                      rel="noopener"
                      className="text-xs font-mono text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded hover:opacity-80"
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
            {/* Supply chain metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-6">
              {[
                { label: 'npm', value: scStats('npm'), color: 'text-red-400' },
                { label: 'PyPI', value: scStats('PyPI'), color: 'text-yellow-400' },
                { label: 'Maven', value: scStats('Maven'), color: 'text-blue-400' },
                { label: 'Go', value: scStats('Go'), color: 'text-cyan-400' },
                { label: 'Other', value: scStats('other'), color: 'text-gray-400' },
              ].map((s) => (
                <div key={s.label} className="surface-card p-3 text-center">
                  <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-muted mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {report.supply_chain_incidents.length === 0 && (
                <p className="text-muted text-sm">No supply chain incidents collected.</p>
              )}
              {report.supply_chain_incidents.map((inc, idx) => (
                <div key={idx} className="surface-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <a
                        href={inc.url}
                        target="_blank"
                        rel="noopener"
                        className="text-sm font-semibold text-slate-100 dark:text-slate-100 hover:text-brand-400 transition-colors"
                      >
                        {inc.title}
                      </a>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className="text-[0.6rem] font-semibold uppercase tracking-wider [background:rgb(var(--hover-100))] text-muted px-1.5 py-0.5 rounded">
                          {inc.ecosystem}
                        </span>
                        <span className="text-[0.6rem] font-semibold uppercase tracking-wider [background:rgb(var(--hover-100))] text-muted px-1.5 py-0.5 rounded">
                          {inc.attack_vector}
                        </span>
                        <span
                          className={`text-[0.6rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            inc.severity === 'critical'
                              ? 'bg-red-900/60 text-red-300'
                              : inc.severity === 'high'
                                ? 'bg-orange-900/60 text-orange-300'
                                : '[background:rgb(var(--hover-100))] text-muted'
                          }`}
                        >
                          {inc.severity}
                        </span>
                        <span
                          className={`text-[0.6rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            inc.status === 'active'
                              ? 'bg-red-900/60 text-red-300'
                              : inc.status === 'contained'
                                ? 'bg-yellow-900/60 text-yellow-300'
                                : inc.status === 'resolved'
                                  ? 'bg-green-900/60 text-green-300'
                                  : '[background:rgb(var(--hover-100))] text-muted'
                          }`}
                        >
                          {inc.status}
                        </span>
                        {inc.threat_actor && (
                          <span className="text-[0.6rem] font-semibold uppercase tracking-wider bg-purple-900/60 text-purple-300 px-1.5 py-0.5 rounded">
                            {inc.threat_actor}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {inc.summary && <p className="text-xs text-muted mt-2 line-clamp-2">{inc.summary}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sources tab */}
        {tab === 'sources' && (
          <div>
            <div className="mb-4">
              <input
                type="text"
                placeholder="Filter sources..."
                value={sourceSearch}
                onChange={(e) => setSourceSearch(e.target.value)}
                className="w-full max-w-xs px-3 py-2 surface-card text-sm text-slate-200 placeholder:text-muted focus:outline-none focus:border-brand-500"
              />
            </div>
            <div className="space-y-0.5">
              {filteredSources.map((src) => (
                <a
                  key={src.id}
                  href={src.url}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-3 px-4 py-2.5 rounded-md hover:[background:rgb(var(--hover-100))] transition-colors text-sm"
                >
                  <span className="font-mono text-xs text-muted shrink-0">{src.id}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-slate-200 font-medium truncate block">{src.title}</span>
                    <span className="text-xs text-muted">{formatDate(src.published_date)}</span>
                  </div>
                  <span className="text-xs [background:rgb(var(--hover-100))] text-muted px-1.5 py-0.5 rounded shrink-0">
                    {src.source_type}
                  </span>
                  <ExternalLink className="w-3 h-3 text-gray-600 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
