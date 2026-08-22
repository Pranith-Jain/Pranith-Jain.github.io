import { useMemo, useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import {
  Radar,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface WdtbIndexEntry {
  date: string;
  title: string;
  tlp: string;
  kpiCount: number;
  campaignCount: number;
  movementCount: number;
  sizeBytes: number;
}

interface WdtbBrief {
  date: string;
  title: string;
  tlp: string;
  estate: { campaignsTracked: number; uniqueDomains: number; percentOnline: number } | null;
  kpis: { value: string; label: string }[];
  movements: { category: string; title: string; url: string | null; detail: string }[];
  campaigns: { name: string; url: string; summary: string }[];
  clusters: {
    summary: { total: number; critical: number; high: number } | null;
    entries: { type: string; domains: number; growth: number; sample: string }[];
  };
  sourceUrl: string;
}

const CATEGORY_CONFIG: Record<string, { icon: typeof TrendingUp; color: string; label: string }> = {
  growth: { icon: TrendingUp, color: 'text-red-500', label: 'Growth' },
  takedown: { icon: TrendingDown, color: 'text-green-500', label: 'Takedown' },
  'infra-rotation': { icon: RefreshCw, color: 'text-amber-500', label: 'Infra Rotation' },
  'lure-refresh': { icon: Sparkles, color: 'text-purple-500', label: 'Lure Refresh' },
};

function CollapsibleCard({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white"
      >
        {title}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="border-t border-slate-200 px-4 py-3 dark:border-[rgb(var(--border-400))]">{children}</div>
      )}
    </div>
  );
}

export default function WebamonDtb() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: indexData, loading: indexLoading } = useDataFetch<{
    total: number;
    returned: number;
    briefs: WdtbIndexEntry[];
  }>({
    url: '/api/v1/webamon-dtb/briefs',
  });

  const briefs = useMemo(() => indexData?.briefs ?? [], [indexData]);
  const currentDate = selectedDate ?? briefs[0]?.date ?? null;

  const { data: brief, loading: briefLoading } = useDataFetch<WdtbBrief>({
    url: currentDate ? `/api/v1/webamon-dtb/briefs/${currentDate}` : '',
  });

  const isLoading = indexLoading || briefLoading;

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="Threat Intel"
      icon={<Radar size={20} />}
      title="Webamon Daily Threat Brief"
      description="Daily campaign intelligence from Webamon — phishing/malware estate tracking, domain growth, takedowns, infrastructure rotation, and emerging clusters."
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Webamon Daily Threat Brief</h1>
          <p className="mt-1 text-sm text-muted">
            Source:{' '}
            <a
              href="https://github.com/webamon-org/Daily-Threat-Brief"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:underline dark:text-brand-400 transition-colors"
            >
              webamon-org/Daily-Threat-Brief
            </a>{' '}
            &middot; Apache-2.0 &middot; {indexData?.total ?? 0} briefs
          </p>
        </div>
        {briefs.length > 0 && (
          <select
            value={currentDate ?? ''}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] dark:text-white"
          >
            {briefs.map((b) => (
              <option key={b.date} value={b.date}>
                {b.date}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading && <div className="py-12 text-center text-sm text-slate-500">Loading...</div>}

      {!isLoading && brief && (
        <div className="space-y-6">
          {brief.estate && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {brief.estate.campaignsTracked.toLocaleString()}
                </div>
                <div className="text-xs text-muted">Campaigns Tracked</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">
                  {brief.estate.uniqueDomains.toLocaleString()}
                </div>
                <div className="text-xs text-muted">Unique Domains</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{brief.estate.percentOnline}%</div>
                <div className="text-xs text-muted">Online</div>
              </div>
            </div>
          )}

          {brief.kpis.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {brief.kpis.map((kpi, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-slate-200 bg-white p-3 text-center dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]"
                >
                  <div className="text-lg font-bold text-slate-900 dark:text-white">
                    {Number(kpi.value).toLocaleString()}
                  </div>
                  <div className="text-mini leading-tight text-muted">{kpi.label}</div>
                </div>
              ))}
            </div>
          )}

          {brief.movements.length > 0 && (
            <CollapsibleCard title={`What Moved Today (${brief.movements.length})`} defaultOpen>
              <div className="space-y-3">
                {brief.movements.map((m, i) => {
                  const cfg = CATEGORY_CONFIG[m.category] ?? {
                    icon: TrendingUp,
                    color: 'text-slate-500',
                    label: m.category,
                  };
                  const Icon = cfg.icon;
                  return (
                    <div key={i} className="flex gap-3">
                      <Icon size={16} className={`mt-0.5 shrink-0 ${cfg.color}`} />
                      <div>
                        <div className="text-sm font-medium text-slate-900 dark:text-white">
                          {m.url ? (
                            <a
                              href={m.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-600 hover:underline dark:text-brand-400 transition-colors"
                            >
                              {m.title}
                            </a>
                          ) : (
                            m.title
                          )}
                        </div>
                        <p className="text-xs text-muted">{m.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleCard>
          )}

          {brief.campaigns.length > 0 && (
            <CollapsibleCard title={`Campaigns Worth a Look (${brief.campaigns.length})`} defaultOpen>
              <div className="space-y-4">
                {brief.campaigns.map((c, i) => (
                  <div key={i}>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline dark:text-brand-400 transition-colors"
                    >
                      {c.name} <ExternalLink size={12} />
                    </a>
                    <p className="mt-1 text-xs text-muted">{c.summary}</p>
                  </div>
                ))}
              </div>
            </CollapsibleCard>
          )}

          {brief.clusters.entries.length > 0 && (
            <CollapsibleCard
              title={`Emerging Clusters${brief.clusters.summary ? ` (${brief.clusters.summary.total} live)` : ''}`}
            >
              {brief.clusters.summary && (
                <p className="mb-3 text-xs text-muted">
                  {brief.clusters.summary.critical} critical, {brief.clusters.summary.high} high
                </p>
              )}
              <div className="space-y-2">
                {brief.clusters.entries.map((cl, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-[rgb(var(--surface-300))/0.5]"
                  >
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{cl.type}</span>
                    <span className="text-xs text-muted">
                      {cl.domains.toLocaleString()} domains, +{cl.growth.toLocaleString()} ({cl.sample})
                    </span>
                  </div>
                ))}
              </div>
            </CollapsibleCard>
          )}

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>TLP:{brief.tlp}</span>
            <span>&middot;</span>
            <a
              href={brief.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-500 hover:underline transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </div>
      )}

      {!isLoading && !brief && <div className="py-12 text-center text-sm text-slate-500">No briefs available yet.</div>}
    </DataPageLayout>
  );
}
