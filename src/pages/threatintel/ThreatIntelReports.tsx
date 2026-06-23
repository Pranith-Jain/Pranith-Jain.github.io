import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink, FileText, Search, Shield } from 'lucide-react';
import {
  REPORTS,
  SEVERITY_COLORS,
  type Severity,
  type TIntelReport,
} from '../../data/threatintel/hunters-ledger-reports';
import { sanitizeUrl } from '../../lib/sanitize-url';

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

export default function ThreatIntelReports(): JSX.Element {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const initialSev = (searchParams.get('sev') as Severity | null) ?? null;
  const [activeSev, setActiveSev] = useState<Severity | null>(initialSev);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let list = REPORTS;
    if (activeSev) list = list.filter((r) => r.severity === activeSev);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.summary.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [query, activeSev]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sevCounts = useMemo(() => {
    const c: Record<string, number> = {};
    REPORTS.forEach((r) => {
      c[r.severity] = (c[r.severity] || 0) + 1;
    });
    return c;
  }, []);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<FileText size={28} />}
      title="Threat Intel Reports"
      maxWidthClass="max-w-5xl"
      description="Original threat intelligence reports with structured IOCs, detection rules, and severity scoring. Aggregated from research sources including The Hunter's Ledger."
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reports, tags, IOCs…"
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
        </div>
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{filtered.length} reports</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-6">
        <button
          onClick={() => setActiveSev(null)}
          className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${
            !activeSev
              ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
              : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-slate-300 dark:hover:border-[rgb(var(--border-400))]'
          }`}
        >
          All ({REPORTS.length})
        </button>
        {SEVERITIES.map((sev) => (
          <button
            key={sev}
            onClick={() => setActiveSev(activeSev === sev ? null : sev)}
            className={`text-xs font-mono px-3 py-1.5 rounded-lg border transition-colors ${
              activeSev === sev
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 hover:border-slate-300 dark:hover:border-[rgb(var(--border-400))]'
            }`}
          >
            {sev.toUpperCase()} ({sevCounts[sev] || 0})
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((report) => (
          <ReportCard
            key={report.id}
            report={report}
            expanded={expanded.has(report.id)}
            onToggle={() => toggle(report.id)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-sm font-mono text-slate-500">No reports match your search.</div>
      )}
    </DataPageLayout>
  );
}

function ReportCard({
  report,
  expanded,
  onToggle,
}: {
  report: TIntelReport;
  expanded: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] overflow-hidden transition-all hover:border-slate-300 dark:hover:border-[rgb(var(--border-400))]">
      <button type="button" onClick={onToggle} className="w-full text-left p-4 flex items-start gap-4">
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-1 rounded border uppercase tracking-wider ${SEVERITY_COLORS[report.severity]}`}
        >
          {report.severity === 'critical' && <AlertTriangle size={10} />}
          {report.severity === 'high' && <Shield size={10} />}
          {report.severity}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="font-mono font-semibold text-sm text-slate-900 dark:text-slate-100 leading-snug mb-1">
            {report.title}
          </h3>
          <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
            <span>{report.date}</span>
            <span>·</span>
            <span>{report.source}</span>
            {report.iocs && (
              <>
                <span>·</span>
                <span>{report.iocs.length} IOCs</span>
              </>
            )}
            {report.detections && (
              <>
                <span>·</span>
                <span>{report.detections.length} detections</span>
              </>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-slate-400 flex-shrink-0 mt-1" />
        ) : (
          <ChevronDown size={16} className="text-slate-400 flex-shrink-0 mt-1" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 dark:border-[rgb(var(--border-400))]">
          <p className="text-sm text-muted leading-relaxed mt-3 mb-4">{report.summary}</p>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {report.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500"
              >
                {tag}
              </span>
            ))}
          </div>

          {report.iocs && report.iocs.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Indicators
              </h4>
              <div className="bg-slate-50 dark:bg-[rgb(var(--input-200))] rounded-lg p-3 font-mono text-xs space-y-1">
                {report.iocs.map((ioc, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-slate-400 w-16 shrink-0">{ioc.type}</span>
                    <span className="text-slate-700 dark:text-slate-300 break-all">{ioc.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.detections && report.detections.length > 0 && (
            <div className="mb-4">
              <h4 className="text-[10px] font-mono font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Detection Rules
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {report.detections.map((det, i) => (
                  <span
                    key={i}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                      det.type === 'sigma'
                        ? 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300'
                        : det.type === 'yara'
                          ? 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    }`}
                  >
                    {det.type.toUpperCase()}: {det.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <a
            href={sanitizeUrl(report.sourceUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
          >
            Read full report <ExternalLink size={11} />
          </a>
        </div>
      )}
    </div>
  );
}
