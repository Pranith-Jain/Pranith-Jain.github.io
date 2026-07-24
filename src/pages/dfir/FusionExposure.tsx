import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import { SEVERITY_TONE, SEVERITY_BAR } from '../../components/severity';
import {
  AlertTriangle,
  ShieldAlert,
  ShieldX,
  Info,
  Loader2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Filter,
} from 'lucide-react';

interface ExposureDimension {
  name: string;
  score: number;
  weight: number;
  signals: string[];
}

interface FusionExposureItem {
  cve_id: string;
  description: string;
  published: string;
  cvss_score: number | null;
  cvss_severity: string;
  epss_score: number | null;
  epss_percentile: number | null;
  in_kev: boolean;
  kev_ransomware: boolean;
  has_exploit: boolean;
  exploit_count: number;
  actor_count: number;
  actors: string[];
  fusion_score: number;
  fusion_label: 'Critical' | 'High' | 'Medium' | 'Low';
  dimensions: ExposureDimension[];
}

interface FusionExposureResponse {
  generated_at: string;
  count: number;
  items: FusionExposureItem[];
  filters: {
    min_score: number;
    severity?: string;
    kev_only: boolean;
    exploit_only: boolean;
  };
}

const FUSION_STYLE: Record<string, { text: string; chip: string; bar: string; Icon: typeof ShieldAlert }> = {
  Critical: {
    text: 'text-rose-700 dark:text-rose-300',
    chip: SEVERITY_TONE.critical,
    bar: SEVERITY_BAR.critical,
    Icon: ShieldX,
  },
  High: {
    text: 'text-orange-700 dark:text-orange-300',
    chip: SEVERITY_TONE.high,
    bar: SEVERITY_BAR.high,
    Icon: ShieldAlert,
  },
  Medium: {
    text: 'text-amber-700 dark:text-amber-300',
    chip: SEVERITY_TONE.medium,
    bar: SEVERITY_BAR.medium,
    Icon: AlertTriangle,
  },
  Low: {
    text: 'text-slate-600 dark:text-slate-300',
    chip: SEVERITY_TONE.low,
    bar: SEVERITY_BAR.low,
    Icon: Info,
  },
};

function dimBar(score: number): string {
  if (score >= 80) return 'bg-rose-500';
  if (score >= 60) return 'bg-orange-500';
  if (score >= 40) return 'bg-amber-500';
  if (score >= 20) return 'bg-sky-500';
  return 'bg-slate-300 dark:bg-slate-600';
}

function dimBg(score: number): string {
  if (score >= 80) return 'bg-rose-50 dark:bg-rose-950/30';
  if (score >= 60) return 'bg-orange-50 dark:bg-orange-950/30';
  if (score >= 40) return 'bg-amber-50 dark:bg-amber-950/30';
  return 'bg-slate-50 dark:bg-[rgb(var(--surface-100))]/30';
}

export default function FusionExposure(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<FusionExposureResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [kevFilter, setKevFilter] = useState(searchParams.get('kev_only') === 'true');
  const [exploitFilter, setExploitFilter] = useState(searchParams.get('exploit_only') === 'true');
  const [sevFilter, setSevFilter] = useState(searchParams.get('severity') ?? '');
  const [minScore, setMinScore] = useState(Number(searchParams.get('min_score')) || 0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (sevFilter) params.set('severity', sevFilter);
    if (kevFilter) params.set('kev_only', 'true');
    if (exploitFilter) params.set('exploit_only', 'true');
    if (minScore > 0) params.set('min_score', String(minScore));
    setSearchParams(params, { replace: true });

    try {
      const r = await fetch(`/api/v1/fusion-exposure?${params.toString()}`);
      if (!r.ok) {
        const body = await r.json().catch(() => null);
        throw new Error(body?.error ?? `HTTP ${r.status}`);
      }
      setData((await r.json()) as FusionExposureResponse);
    } catch (e) {
      setError((e as Error).message);
      console.error('FusionExposure failed:', e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sevFilter, kevFilter, exploitFilter, minScore, setSearchParams]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const items = data?.items ?? [];
  const sev = FUSION_STYLE;

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<ShieldX size={28} />}
      title="Fusion Exposure"
      description={`Prioritized exposure worklist fusing CVSS, CISA KEV, EPSS, exploit availability, and threat actor associations into one score. ${data ? `${data.count} exposures ranked.` : ''}`}
      loading={loading}
      error={error}
      onRetry={fetchData}
      maxWidthClass="max-w-6xl"
    >
      {/* Filter bar */}
      <div className="mb-5 surface-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={14} className="text-slate-500 shrink-0" />
          <select
            value={sevFilter}
            onChange={(e) => setSevFilter(e.target.value)}
            className="text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))]"
            aria-label="Filter by severity"
          >
            <option value="">Any severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value) || 0)}
              className="w-16 text-xs font-mono px-2 py-1.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))]"
              placeholder="Min"
              aria-label="Minimum fusion score"
            />
            <span className="text-micro text-slate-500 font-mono">min score</span>
          </div>
          <label className="flex items-center gap-1.5 text-xs font-mono text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={kevFilter}
              onChange={(e) => setKevFilter(e.target.checked)}
              className="rounded border-slate-400"
            />
            KEV only
          </label>
          <label className="flex items-center gap-1.5 text-xs font-mono text-slate-600 dark:text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={exploitFilter}
              onChange={(e) => setExploitFilter(e.target.checked)}
              className="rounded border-slate-400"
            />
            Exploit only
          </label>
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="ml-auto text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            {loading ? 'loading' : 'refresh'}
          </button>
        </div>
      </div>

      {/* Summary */}
      {!loading && data && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-mini font-mono text-slate-500">
          <span>{data.count} exposures</span>
          {sevFilter && <span>severity: {sevFilter}</span>}
          {kevFilter && <span className="text-rose-500">KEV only</span>}
          {exploitFilter && <span className="text-orange-500">exploit only</span>}
          {minScore > 0 && <span>min score: {minScore}</span>}
          <span className="text-slate-400">· {data.generated_at.slice(0, 16).replace('T', ' ')}</span>
        </div>
      )}

      {/* Worklist */}
      <div className="space-y-2">
        {items.map((item) => {
          const style = sev[item.fusion_label] ?? sev.Low;
          const isOpen = expanded.has(item.cve_id);
          return (
            <div key={item.cve_id} className="surface-card overflow-hidden">
              {/* Header row */}
              <button
                type="button"
                onClick={() => toggleExpand(item.cve_id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
              >
                {/* Fusion score badge */}
                <div className="flex flex-col items-center shrink-0 w-12">
                  <span
                    className={`text-sm font-bold font-mono leading-none ${item.fusion_score >= 80 ? 'text-rose-600 dark:text-rose-400' : item.fusion_score >= 60 ? 'text-orange-600 dark:text-orange-400' : item.fusion_score >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`}
                  >
                    {item.fusion_score}
                  </span>
                  <span className="text-micro font-mono text-slate-400 uppercase mt-0.5">score</span>
                </div>

                {/* Fusion score bar */}
                <div className="hidden sm:flex items-center gap-1.5 w-32 shrink-0">
                  {item.dimensions.map((d) => (
                    <div
                      key={d.name}
                      className="h-4 w-full rounded-sm"
                      style={{
                        background: `linear-gradient(to top, ${d.score >= 80 ? '#f43f5e' : d.score >= 60 ? '#f97316' : d.score >= 40 ? '#f59e0b' : '#94a3b8'} ${d.score}%, transparent ${d.score}%)`,
                        opacity: 0.7,
                      }}
                      title={`${d.name}: ${d.score}/100 (weight ${(d.weight * 100).toFixed(0)}%)`}
                    />
                  ))}
                </div>

                {/* CVE ID + severity chip */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.cve_id}
                    </span>
                    <span
                      className={`text-micro font-mono px-1.5 py-0.5 rounded border ${style?.chip ?? 'border-slate-300 text-slate-500'} shrink-0`}
                    >
                      {item.fusion_label}
                    </span>
                    {item.in_kev && (
                      <span className="text-micro font-mono px-1.5 py-0.5 rounded border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 shrink-0">
                        KEV
                      </span>
                    )}
                    {item.has_exploit && (
                      <span className="text-micro font-mono px-1.5 py-0.5 rounded border border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300 shrink-0">
                        PoC
                      </span>
                    )}
                  </div>
                  <p className="text-micro text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    CVSS {item.cvss_score?.toFixed(1) ?? 'N/A'} · {item.cvss_severity}
                    {item.epss_score != null && ` · EPSS ${(item.epss_score * 100).toFixed(2)}%`}
                    {item.actor_count > 0 && ` · ${item.actor_count} actor(s)`}
                    {item.exploit_count > 0 && ` · ${item.exploit_count} exploit(s)`}
                  </p>
                </div>

                {isOpen ? (
                  <ChevronDown size={14} className="text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight size={14} className="text-slate-400 shrink-0" />
                )}
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] px-4 py-3 space-y-3 bg-slate-50/50 dark:bg-[rgb(var(--surface-100))]/50">
                  {/* Description */}
                  {item.description && (
                    <p className="text-meta font-mono text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                      {item.description}
                    </p>
                  )}

                  {/* Dimension breakdown */}
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {item.dimensions.map((d) => (
                      <div
                        key={d.name}
                        className={`rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-2.5 ${dimBg(d.score)}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-micro font-mono text-slate-600 dark:text-slate-400">{d.name}</span>
                          <span className="text-xs font-mono font-semibold">{d.score}/100</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 mb-1.5">
                          <div
                            className={`h-full rounded-full transition-all ${dimBar(d.score)}`}
                            style={{ width: `${d.score}%` }}
                          />
                        </div>
                        <p className="text-micro font-mono text-slate-500 dark:text-slate-400 truncate">
                          weight {(d.weight * 100).toFixed(0)}% · {d.signals[0] ?? ''}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Quick actions / tags */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <a
                      href={`https://nvd.nist.gov/vuln/detail/${item.cve_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-micro font-mono px-2 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-500/40 transition-colors"
                    >
                      NVD
                    </a>
                    <a
                      href={`https://cvefeed.io/vuln/detail/${item.cve_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-micro font-mono px-2 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-500/40 transition-colors"
                    >
                      cvefeed
                    </a>
                    {item.in_kev && (
                      <a
                        href={`https://www.cisa.gov/known-exploited-vulnerabilities-catalog`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-micro font-mono px-2 py-0.5 rounded border border-rose-300 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:border-rose-500 transition-colors"
                      >
                        CISA KEV
                      </a>
                    )}
                    {item.has_exploit && (
                      <a
                        href={`https://www.exploit-db.com/?cve=${item.cve_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-micro font-mono px-2 py-0.5 rounded border border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400 hover:border-orange-500 transition-colors"
                      >
                        Exploit-DB
                      </a>
                    )}
                    {item.actors.slice(0, 4).map((a) => (
                      <a
                        key={a}
                        href={`/threatintel/actor/${a}`}
                        className="text-micro font-mono px-2 py-0.5 rounded border border-violet-300 dark:border-violet-800 text-violet-600 dark:text-violet-400 hover:border-violet-500 transition-colors"
                      >
                        {a}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {!loading && items.length === 0 && (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400">
            <Info size={24} className="mx-auto mb-2 opacity-50" />
            <p className="font-mono text-sm">No exposures match the current filters.</p>
          </div>
        )}
      </div>
    </DataPageLayout>
  );
}
