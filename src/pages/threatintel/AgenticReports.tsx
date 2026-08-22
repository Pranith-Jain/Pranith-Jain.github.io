import { useMemo, useState } from 'react';
import { AlertTriangle, Bug, ExternalLink, FileText, Link2, Search, Shield, Target, Zap } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable';
import { AGENTIC_REPORTS, AGENTIC_BY_ID, type AgenticReport } from '../../data/threatintel/agentic-reports';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
  high: 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800',
  medium: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
  low: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
};

const CONFIDENCE_STYLES: Record<string, string> = {
  HIGH: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800',
  MEDIUM: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
  LOW: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
};

export default function AgenticReports(): JSX.Element {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return AGENTIC_REPORTS;
    const q = query.toLowerCase();
    return AGENTIC_REPORTS.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q)) ||
        r.attribution.actor.toLowerCase().includes(q) ||
        r.summary.toLowerCase().includes(q)
    );
  }, [query]);

  const selected = selectedId ? AGENTIC_BY_ID[selectedId] : null;

  if (selected) {
    return <ReportDetail report={selected} />;
  }

  return (
    <DataPageLayout
      backTo="/threatintel"
      backLabel="back to threat intel"
      icon={<Zap className="h-6 w-6" />}
      title="Agentic Reports"
      description="Cross-source correlated threat intelligence analyses. Each report synthesizes multiple upstream sources into a single analysis with executive summary, detection rules, IOCs, TTPs, and recommended actions."
      maxWidthClass="max-w-6xl"
    >
      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reports, actors, tags…"
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl font-mono text-sm focus:outline-none focus:border-rose-500 dark:focus:border-rose-400"
          />
        </div>
      </div>

      {/* Report cards */}
      <div className="space-y-3">
        {filtered.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setSelectedId(r.id)}
            className="w-full text-left surface-card p-4 hover:border-rose-400/60 hover:shadow-e2 transition-all"
          >
            <div className="flex flex-wrap items-start gap-2 mb-2">
              <span
                className={`text-micro font-mono uppercase tracking-wider rounded border px-1.5 py-0.5 shrink-0 ${SEVERITY_STYLES[r.severity]}`}
              >
                {r.severity}
              </span>
              <span className="text-micro font-mono text-muted shrink-0">{r.tlp}</span>
              <h3 className="text-sm font-semibold text-heading flex-1 min-w-0">{r.title}</h3>
            </div>
            <p className="text-xs text-muted font-mono mb-2">
              {r.publishedAt} · {r.sources.length} source{r.sources.length === 1 ? '' : 's'} · {r.attribution.actor}
            </p>
            <p className="text-xs text-body line-clamp-2 mb-2">{r.summary}</p>
            <div className="flex flex-wrap gap-1">
              {r.tags.slice(0, 5).map((t) => (
                <span
                  key={t}
                  className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] text-muted"
                >
                  {t}
                </span>
              ))}
              {r.tags.length > 5 && <span className="text-micro font-mono text-muted">+{r.tags.length - 5}</span>}
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-8 text-center text-sm text-muted">
            No reports match your search.
          </div>
        )}
      </div>
    </DataPageLayout>
  );
}

// ── Detail View ────────────────────────────────────────────────────────

function ReportDetail({ report }: { report: AgenticReport }) {
  return (
    <DataPageLayout
      backTo="/threatintel/research-hub/agentic"
      backLabel="back to agentic reports"
      icon={<Zap className="h-6 w-6" />}
      title={report.title}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <span
            className={`text-micro font-mono uppercase tracking-wider rounded border px-1.5 py-0.5 ${SEVERITY_STYLES[report.severity]}`}
          >
            {report.severity}
          </span>
          <span className="text-micro font-mono text-muted">{report.tlp}</span>
          <span className="text-micro font-mono text-muted">{report.publishedAt}</span>
          {report.externalUrl && (
            <a
              href={report.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-micro font-mono text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1 transition-colors"
            >
              source <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </span>
      }
      maxWidthClass="max-w-5xl"
    >
      {/* Sources Table */}
      {report.sources.length > 0 && (
        <Section title="Source Reports" icon={<FileText className="h-4 w-4" />} count={report.sources.length}>
          <div className="overflow-x-auto">
            <DataTable
              columns={
                [
                  {
                    key: 'num',
                    header: '#',
                    render: (_s: (typeof report.sources)[number], i: number) => (
                      <span className="font-mono text-muted">{i + 1}</span>
                    ),
                  },
                  {
                    key: 'title',
                    header: 'Title',
                    sortValue: (s: (typeof report.sources)[number]) => s.title,
                    render: (s: (typeof report.sources)[number]) => (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-rose-600 dark:text-rose-400 hover:underline inline-flex items-center gap-1 transition-colors"
                      >
                        {s.title} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    ),
                  },
                  {
                    key: 'source',
                    header: 'Source',
                    sortValue: (s: (typeof report.sources)[number]) => s.source ?? '',
                    render: (s: (typeof report.sources)[number]) => (
                      <span className="font-mono text-muted">{s.source}</span>
                    ),
                  },
                  {
                    key: 'date',
                    header: 'Date',
                    sortValue: (s: (typeof report.sources)[number]) => s.publishedAt ?? '',
                    render: (s: (typeof report.sources)[number]) => (
                      <span className="font-mono text-muted">{s.publishedAt}</span>
                    ),
                  },
                ] as DataTableColumn<(typeof report.sources)[number]>[]
              }
              rows={report.sources}
              rowKey={(s, i) => `${s.title}-${i}`}
            />
          </div>
        </Section>
      )}

      {/* Executive Summary */}
      <Section title="Executive Summary" icon={<FileText className="h-4 w-4" />}>
        <div className="text-sm text-body leading-relaxed whitespace-pre-wrap">{report.summary}</div>
      </Section>

      {/* Attribution */}
      <Section title="Attribution & Threat Actor" icon={<Target className="h-4 w-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label: 'Actor', value: report.attribution.actor },
            { label: 'Type', value: report.attribution.type },
            { label: 'Motivation', value: report.attribution.motivation },
            { label: 'Language', value: report.attribution.language },
            { label: 'Infrastructure', value: report.attribution.infrastructure },
          ]
            .filter((f) => f.value)
            .map((f) => (
              <div
                key={f.label}
                className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] px-2 py-1.5"
              >
                <div className="text-micro font-mono uppercase tracking-wider text-muted">{f.label}</div>
                <div className="text-xs text-heading mt-0.5">{f.value}</div>
              </div>
            ))}
        </div>
      </Section>

      {/* Technical Details */}
      <Section title="Technical Details" icon={<Bug className="h-4 w-4" />}>
        <div className="text-sm text-body leading-relaxed whitespace-pre-wrap">{report.technicalDetails}</div>
      </Section>

      {/* Detection Opportunities */}
      {report.detection.length > 0 && (
        <Section title="Detection Opportunities" icon={<Shield className="h-4 w-4" />} count={report.detection.length}>
          <div className="space-y-2">
            {report.detection.map((d, i) => (
              <div
                key={i}
                className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-heading">{d.title}</span>
                  <span
                    className={`text-micro font-mono uppercase tracking-wider rounded border px-1.5 py-0.5 ${SEVERITY_STYLES[d.severity] ?? SEVERITY_STYLES.medium}`}
                  >
                    {d.severity}
                  </span>
                  {d.mitreId && (
                    <span className="text-micro font-mono text-violet-600 dark:text-violet-400">{d.mitreId}</span>
                  )}
                </div>
                <p className="text-xs text-body mb-1">{d.description}</p>
                {d.query && (
                  <pre className="text-xs font-mono text-heading bg-slate-100 dark:bg-[rgb(var(--surface-200))] rounded p-2 overflow-x-auto mt-2">
                    {d.query}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* IOCs */}
      {report.iocs.length > 0 && (
        <Section title="Indicators of Compromise" icon={<Link2 className="h-4 w-4" />} count={report.iocs.length}>
          <div className="overflow-x-auto">
            <DataTable
              columns={
                [
                  {
                    key: 'type',
                    header: 'Type',
                    sortValue: (ioc: (typeof report.iocs)[number]) => ioc.type,
                    render: (ioc) => <span className="font-mono text-sky-600 dark:text-sky-400">{ioc.type}</span>,
                  },
                  {
                    key: 'value',
                    header: 'Value',
                    sortValue: (ioc: (typeof report.iocs)[number]) => ioc.value,
                    render: (ioc) => <span className="font-mono text-heading break-all">{ioc.value}</span>,
                  },
                  {
                    key: 'description',
                    header: 'Description',
                    render: (ioc) => <span className="text-body">{ioc.description}</span>,
                  },
                  {
                    key: 'confidence',
                    header: 'Confidence',
                    sortValue: (ioc: (typeof report.iocs)[number]) => ioc.confidence,
                    render: (ioc) => (
                      <span
                        className={`text-micro font-mono uppercase rounded border px-1.5 py-0.5 ${CONFIDENCE_STYLES[ioc.confidence]}`}
                      >
                        {ioc.confidence}
                      </span>
                    ),
                  },
                ] as DataTableColumn<(typeof report.iocs)[number]>[]
              }
              rows={report.iocs}
              rowKey={(ioc, i) => `${ioc.value}-${i}`}
            />
          </div>
        </Section>
      )}

      {/* MITRE ATT&CK */}
      {report.ttps.length > 0 && (
        <Section title="MITRE ATT&CK Techniques" icon={<Bug className="h-4 w-4" />} count={report.ttps.length}>
          <div className="overflow-x-auto">
            <DataTable
              columns={
                [
                  {
                    key: 'id',
                    header: 'ID',
                    sortValue: (t: (typeof report.ttps)[number]) => t.id,
                    render: (t) => (
                      <a
                        href={`https://attack.mitre.org/techniques/${t.id}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-rose-600 dark:text-rose-400 hover:underline transition-colors"
                      >
                        {t.id}
                      </a>
                    ),
                  },
                  {
                    key: 'technique',
                    header: 'Technique',
                    sortValue: (t: (typeof report.ttps)[number]) => t.name,
                    render: (t) => <span className="text-heading">{t.name}</span>,
                  },
                  {
                    key: 'tactic',
                    header: 'Tactic',
                    sortValue: (t: (typeof report.ttps)[number]) => t.tactic,
                    render: (t) => <span className="text-muted">{t.tactic}</span>,
                  },
                  {
                    key: 'description',
                    header: 'Description',
                    render: (t) => <span className="text-body">{t.description}</span>,
                  },
                ] as DataTableColumn<(typeof report.ttps)[number]>[]
              }
              rows={report.ttps}
              rowKey={(t) => t.id}
            />
          </div>
        </Section>
      )}

      {/* Metrics */}
      {report.metrics.length > 0 && (
        <Section title="Victimology & Scale" icon={<Target className="h-4 w-4" />}>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {report.metrics.map((m) => (
              <div
                key={m.label}
                className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] px-2 py-1.5"
              >
                <div className="text-micro font-mono uppercase tracking-wider text-muted">{m.label}</div>
                <div className="text-sm font-semibold text-heading">{m.value}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Conclusion */}
      <Section title="Conclusion & Recommended Actions" icon={<AlertTriangle className="h-4 w-4" />}>
        <div className="space-y-3">
          <ul className="space-y-1.5">
            {report.conclusion.takeaways.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-body">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
                {t}
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] pt-3">
            <div className="text-micro font-mono uppercase tracking-wider text-muted mb-2">Recommended Actions</div>
            <div className="space-y-1.5">
              {report.conclusion.actions.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-body">
                  <span
                    className={`text-micro font-mono uppercase rounded border px-1.5 py-0.5 shrink-0 mt-0.5 ${SEVERITY_STYLES[a.priority] ?? SEVERITY_STYLES.low}`}
                  >
                    {a.priority}
                  </span>
                  <span>{a.action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </DataPageLayout>
  );
}

// ── Shared Section component ───────────────────────────────────────────

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card p-4 mb-3">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-rose-600 dark:text-rose-400">{icon}</span>
        <h3 className="text-sm font-semibold text-heading">{title}</h3>
        {typeof count === 'number' && (
          <span className="ml-auto text-micro font-mono uppercase text-slate-500">{count}</span>
        )}
      </div>
      {children}
    </section>
  );
}
