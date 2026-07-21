import { useMemo, useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Shield, AlertTriangle, Cloud, ExternalLink } from 'lucide-react';

type Tab = 'cyber' | 'deepfake' | 'disaster';

interface DbIndexSummary {
  counts: { cyber: number; deepfake: number; disaster: number };
  source: string;
  license: string;
  generatedAt: string;
}

interface BriefEntry {
  type: string;
  date: string;
  sizeBytes: number;
}

interface CyberBrief {
  type: string;
  date: string;
  threatLevel: string;
  executiveSummary: string;
  keyFindings: { title: string; summary: string }[];
  dashboard: {
    kpis: { value: string; label: string }[];
    activelyExploited: string[];
    vendors: string[];
    sectors: string[];
  };
  topThreats: { title: string; action: string }[];
  events: {
    title: string;
    severity: string;
    text: string;
    chips: string[];
    sources: { url: string; label: string }[];
  }[];
  ttps: { descriptions: string[]; mitreIds: string[] };
  outlook72h: string;
}

interface DeepfakeBrief {
  type: string;
  date: string;
  riskOutlook: string;
  executiveSummary: string;
  keyFindings: { title: string; summary: string }[];
  incidents: {
    title: string;
    badges: string[];
    fields: Record<string, string>;
    summary: string;
    sources: { url: string; label: string }[];
  }[];
  emergingTrends: string[];
  geographicObservations: string[];
  detectionDevelopments: string[];
}

interface DisasterBrief {
  type: string;
  date: string;
  overallThreat: string;
  executiveSummary: string;
  dashboard: { kpis: { value: string; label: string }[] };
  topEvents: { title: string; severity: string; text: string; sources: { url: string; label: string }[] }[];
  escalateEvents: { title: string; severity: string; text: string; sources: { url: string; label: string }[] }[];
  monitorEvents: { title: string; severity: string; text: string; sources: { url: string; label: string }[] }[];
  outlook72h: string;
  regionalTrends: string[];
}

const SEV_STYLES: Record<string, string> = {
  red: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
  escalate: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
  orange:
    'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800',
  monitor:
    'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800',
  green:
    'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800',
};

function sevPill(s: string): string {
  return (
    SEV_STYLES[s?.toLowerCase() ?? ''] ??
    'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/40 border-slate-300 dark:border-slate-700'
  );
}

const TAB_CONFIG: { id: Tab; label: string; icon: typeof Shield; color: string }[] = [
  { id: 'cyber', label: 'OT/ICS Cyber', icon: Shield, color: 'text-rose-600 dark:text-rose-400' },
  { id: 'deepfake', label: 'Deepfake & GenAI', icon: AlertTriangle, color: 'text-violet-600 dark:text-violet-400' },
  { id: 'disaster', label: 'Global Disaster', icon: Cloud, color: 'text-amber-600 dark:text-amber-400' },
];

export default function DailyBriefs() {
  const [tab, setTab] = useState<Tab>('cyber');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: indexData } = useDataFetch<DbIndexSummary>({ url: '/api/v1/daily-briefs/' });
  const { data: cyberList, loading: cyberLoading } = useDataFetch<{ briefs: BriefEntry[] }>({
    url: '/api/v1/daily-briefs/cyber',
  });
  const { data: deepfakeList, loading: deepfakeLoading } = useDataFetch<{ briefs: BriefEntry[] }>({
    url: '/api/v1/daily-briefs/deepfake',
  });
  const { data: disasterList, loading: disasterLoading } = useDataFetch<{ briefs: BriefEntry[] }>({
    url: '/api/v1/daily-briefs/disaster',
  });

  const currentDate = useMemo(() => {
    const list = tab === 'cyber' ? cyberList : tab === 'deepfake' ? deepfakeList : disasterList;
    if (selectedDate) return selectedDate;
    return list?.briefs?.[0]?.date ?? null;
  }, [tab, selectedDate, cyberList, deepfakeList, disasterList]);

  const { data: brief, loading: briefLoading } = useDataFetch<CyberBrief | DeepfakeBrief | DisasterBrief>({
    url: currentDate ? `/api/v1/daily-briefs/${tab}/${currentDate}` : '',
  });

  const availableDates = useMemo(() => {
    const list = tab === 'cyber' ? cyberList : tab === 'deepfake' ? deepfakeList : disasterList;
    return list?.briefs?.map((b: BriefEntry) => b.date) ?? [];
  }, [tab, cyberList, deepfakeList, disasterList]);

  const isLoading = tab === 'cyber' ? cyberLoading : tab === 'deepfake' ? deepfakeLoading : disasterLoading;

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="Threat Intel"
      icon={<Shield size={20} />}
      title="Daily Intelligence Briefs"
      description="AI-generated daily intelligence assessments covering OT/ICS cyber threats, deepfake/GenAI risks, and global disaster monitoring."
    >
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Daily Intelligence Briefs</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Source: {indexData?.source ?? 'agentic-ai-daily-reports.netlify.app'} &middot; Generated{' '}
            {indexData?.generatedAt ?? '—'}
          </p>
        </div>
        <div className="flex gap-2">
          {Object.entries(indexData?.counts ?? {}).map(([type, count]) => (
            <span
              key={type}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              {type}: {count}
            </span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
        {TAB_CONFIG.map(({ id, label, icon: Icon, color }) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              setSelectedDate(null);
            }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Icon size={16} className={tab === id ? color : ''} />
            {label}
          </button>
        ))}
      </div>

      {/* Date selector */}
      {availableDates.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
          {availableDates.map((d: string) => (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                currentDate === d
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {briefLoading || isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">Loading brief...</div>
      ) : !brief ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <AlertTriangle size={40} className="mb-3 opacity-40" />
          <p>
            No brief available for {tab} on {currentDate ?? '—'}
          </p>
          <p className="mt-1 text-xs">Run the sync pipeline to populate data.</p>
        </div>
      ) : tab === 'cyber' ? (
        <CyberBriefView brief={brief as CyberBrief} />
      ) : tab === 'deepfake' ? (
        <DeepfakeBriefView brief={brief as DeepfakeBrief} />
      ) : (
        <DisasterBriefView brief={brief as DisasterBrief} />
      )}
    </DataPageLayout>
  );
}

// ─── Cyber Brief ──────────────────────────────────────────────────────

function CyberBriefView({ brief }: { brief: CyberBrief }) {
  return (
    <div className="space-y-6">
      {/* Threat Level */}
      {brief.threatLevel && (
        <div className={`rounded-lg border p-4 ${sevPill('red')}`}>
          <span className="text-sm font-semibold">{brief.threatLevel}</span>
        </div>
      )}

      {/* Executive Summary */}
      <section className="surface-card rounded-xl p-5">
        <h2 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">Executive Summary</h2>
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{brief.executiveSummary}</p>
      </section>

      {/* KPIs */}
      {brief.dashboard?.kpis?.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {brief.dashboard.kpis.map((kpi, i) => (
            <div key={i} className="surface-card rounded-xl p-4 text-center">
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white">{kpi.value}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{kpi.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Key Findings */}
      {brief.keyFindings?.length > 0 && (
        <section className="surface-card rounded-xl p-5">
          <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Key Findings</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {brief.keyFindings.map((f, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{f.title}</h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{f.summary}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Actively Exploited */}
      {brief.dashboard?.activelyExploited?.length > 0 && (
        <section className="surface-card rounded-xl p-5">
          <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Actively Exploited</h2>
          <div className="flex flex-wrap gap-2">
            {brief.dashboard.activelyExploited.map((item, i) => (
              <span
                key={i}
                className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
              >
                {item}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Events */}
      {brief.events?.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Event Cards</h2>
          <div className="space-y-3">
            {brief.events.map((ev, i) => (
              <div key={i} className="surface-card rounded-xl overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{ev.title}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${sevPill(ev.severity)}`}
                  >
                    {ev.severity}
                  </span>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {ev.text.slice(0, 300)}
                    {ev.text.length > 300 ? '...' : ''}
                  </p>
                  {ev.chips?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {ev.chips.slice(0, 5).map((c, j) => (
                        <span
                          key={j}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  {ev.sources?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ev.sources.slice(0, 3).map((s, j) => (
                        <a
                          key={j}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {s.label || s.url.slice(0, 40)} <ExternalLink size={10} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Outlook */}
      {brief.outlook72h && (
        <section className="surface-card rounded-xl p-5">
          <h2 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">Next 72-Hour Outlook</h2>
          <p className="text-sm text-slate-700 dark:text-slate-300">{brief.outlook72h}</p>
        </section>
      )}
    </div>
  );
}

// ─── Deepfake Brief ──────────────────────────────────────────────────

function DeepfakeBriefView({ brief }: { brief: DeepfakeBrief }) {
  return (
    <div className="space-y-6">
      {/* Risk Outlook */}
      {brief.riskOutlook && (
        <div
          className={`rounded-lg border p-4 ${brief.riskOutlook.toLowerCase() === 'worsening' ? sevPill('red') : sevPill('orange')}`}
        >
          <span className="text-sm font-semibold">Overall Outlook: {brief.riskOutlook}</span>
        </div>
      )}

      {/* Executive Summary */}
      <section className="surface-card rounded-xl p-5">
        <h2 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">Executive Summary</h2>
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{brief.executiveSummary}</p>
      </section>

      {/* Key Findings */}
      {brief.keyFindings?.length > 0 && (
        <section className="surface-card rounded-xl p-5">
          <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Key Findings</h2>
          <ul className="space-y-2">
            {brief.keyFindings.map((f, i) => (
              <li key={i} className="text-sm text-slate-700 dark:text-slate-300">
                <span className="font-semibold">{f.title}:</span> {f.summary}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Incidents */}
      {brief.incidents?.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">
            Priority Incidents ({brief.incidents.length})
          </h2>
          <div className="space-y-3">
            {brief.incidents.slice(0, 15).map((inc, i) => (
              <div key={i} className="surface-card rounded-xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{inc.title}</h3>
                  <div className="flex gap-1">
                    {inc.badges.map((b, j) => (
                      <span
                        key={j}
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${sevPill(b.toLowerCase())}`}
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
                {inc.fields && Object.keys(inc.fields).length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {Object.entries(inc.fields).map(([k, v]) => (
                      <div key={k}>
                        <span className="text-slate-400">{k}:</span>{' '}
                        <span className="text-slate-600 dark:text-slate-300">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                {inc.summary && (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                    {inc.summary.slice(0, 200)}
                    {inc.summary.length > 200 ? '...' : ''}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Emerging Trends */}
      {brief.emergingTrends?.length > 0 && (
        <section className="surface-card rounded-xl p-5">
          <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Emerging Trends</h2>
          <ul className="space-y-1">
            {brief.emergingTrends.map((t, i) => (
              <li key={i} className="text-sm text-slate-700 dark:text-slate-300">
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ─── Disaster Brief ──────────────────────────────────────────────────

function DisasterBriefView({ brief }: { brief: DisasterBrief }) {
  return (
    <div className="space-y-6">
      {/* Threat Level */}
      {brief.overallThreat && (
        <div
          className={`rounded-lg border p-4 ${sevPill(brief.overallThreat.toLowerCase() === 'high' ? 'red' : 'orange')}`}
        >
          <span className="text-sm font-semibold">Overall Threat: {brief.overallThreat}</span>
        </div>
      )}

      {/* Executive Summary */}
      <section className="surface-card rounded-xl p-5">
        <h2 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">Executive Summary</h2>
        <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{brief.executiveSummary}</p>
      </section>

      {/* KPIs */}
      {brief.dashboard?.kpis?.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {brief.dashboard.kpis.map((kpi, i) => (
            <div key={i} className="surface-card rounded-xl p-4 text-center">
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white">{kpi.value}</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{kpi.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Top Events */}
      {brief.topEvents?.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Top Critical Events</h2>
          <div className="space-y-3">
            {brief.topEvents.map((ev, i) => (
              <div key={i} className="surface-card rounded-xl overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{ev.title}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${sevPill(ev.severity)}`}
                  >
                    {ev.severity}
                  </span>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-slate-600 dark:text-slate-400">{ev.text}</p>
                  {ev.sources?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {ev.sources.map((s, j) => (
                        <a
                          key={j}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {s.label || s.url.slice(0, 40)} <ExternalLink size={10} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Escalate Events */}
      {brief.escalateEvents?.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">
            All Escalate Events ({brief.escalateEvents.length})
          </h2>
          <div className="space-y-2">
            {brief.escalateEvents.map((ev, i) => (
              <div key={i} className="surface-card rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${ev.severity === 'escalate' ? 'bg-rose-500' : 'bg-orange-500'}`}
                  />
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{ev.title}</span>
                </div>
                {ev.text && <p className="mt-1 ml-4 text-xs text-slate-500 dark:text-slate-400">{ev.text}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Outlook */}
      {brief.outlook72h && (
        <section className="surface-card rounded-xl p-5">
          <h2 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">Next 72-Hour Outlook</h2>
          <p className="text-sm text-slate-700 dark:text-slate-300">{brief.outlook72h}</p>
        </section>
      )}
    </div>
  );
}
