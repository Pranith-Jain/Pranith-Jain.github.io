import { useState, useMemo } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Modal } from '../components/ui/Modal';
import { Grid3X3, RefreshCw, ShieldAlert, ExternalLink } from 'lucide-react';

interface RiskMatrixRow {
  id: string;
  published: string;
  severity: string;
  cvss: number | null;
  epss: number | null;
  epssPercentile: number | null;
  kev: boolean;
  kevRansomware: boolean;
  recencyScore: number;
  ctiScore: number;
  quadrant: 'critical' | 'high' | 'medium' | 'low';
  ssvc: { decision: string; rationale: string };
  description: string;
  reference?: string;
}

interface RiskMatrixResponse {
  generated_at: string;
  source: string;
  params: { days: number; limit: number };
  count: number;
  quadrants: { critical: number; high: number; medium: number; low: number };
  rows: RiskMatrixRow[];
  note?: string;
}

type RiskQuadrant = 'critical' | 'high' | 'medium' | 'low';

const QUADRANT_META: Record<RiskQuadrant, { label: string; cls: string; bar: string; explainer: string }> = {
  critical: {
    label: 'Critical',
    cls: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
    bar: 'bg-rose-500',
    explainer: '≥70 — act now: exploited or near-certain to be, high CVSS, high EPSS.',
  },
  high: {
    label: 'High',
    cls: 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800',
    bar: 'bg-orange-500',
    explainer: '50–69 — prioritize this sprint: strong EPSS and/or KEV presence.',
  },
  medium: {
    label: 'Medium',
    cls: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
    bar: 'bg-amber-500',
    explainer: '30–49 — track and patch on the normal cadence.',
  },
  low: {
    label: 'Low',
    cls: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800',
    bar: 'bg-emerald-500',
    explainer: '<30 — monitor; unlikely to be exploited in the next 30 days.',
  },
};

const CARD = 'surface-card';

export default function CveRiskMatrix() {
  const [days, setDays] = useState(30);
  const [quadrant, setQuadrant] = useState<string | null>(null);
  const [sort, setSort] = useState<'score' | 'cvss' | 'epss'>('score');
  const [detailId, setDetailId] = useState<string | null>(null);

  const url = `/api/v1/cve/risk-matrix?days=${days}&limit=100&sort=${sort}`;
  const { data, loading, error, refetch } = useDataFetch<RiskMatrixResponse>({
    url,
    ttl: 300_000,
    staleWhileRevalidate: true,
  });

  const rows = useMemo(() => {
    if (!data?.rows) return [];
    return quadrant ? data.rows.filter((r) => r.quadrant === quadrant) : data.rows;
  }, [data, quadrant]);

  const detail = useMemo(() => rows.find((r) => r.id === detailId) ?? null, [rows, detailId]);

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="DFIR"
      icon={<Grid3X3 />}
      title="CVE Risk Matrix"
      description={
        <span>
          CVSS × EPSS × KEV × recency, blended into a 0–100 CTI priority score: CVSS 30% + EPSS 35% + KEV / ransomware
          25% + recency 10%. SSVC-V decisions ride along for decision-based triage. Data: cve-recent payload + FIRST
          EPSS + CISA KEV.
        </span>
      }
      loading={loading}
      error={error}
      maxWidthClass="max-w-7xl"
    >
      <div className="space-y-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {[7, 14, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`font-mono text-micro font-bold px-2 py-0.5 rounded border transition-colors ${
                  days === d ? 'ring-1 ring-brand-500' : ''
                } border-slate-300 dark:border-[rgb(var(--border-400))] text-muted`}
              >
                {d}d
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(['score', 'cvss', 'epss'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`font-mono text-micro font-bold px-2 py-0.5 rounded border transition-colors ${
                  sort === s ? 'ring-1 ring-brand-500' : ''
                } border-slate-300 dark:border-[rgb(var(--border-400))] text-muted`}
              >
                sort: {s}
              </button>
            ))}
          </div>
          <button
            onClick={refetch}
            className="inline-flex items-center gap-1 font-mono text-micro px-2 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40"
          >
            <RefreshCw size={11} /> refresh
          </button>
          <div className="text-xs text-muted font-mono ml-auto">
            {data?.count ?? 0} rows · {data?.params.limit ?? 100} cap
          </div>
        </div>

        {/* Quadrant summary */}
        <div className="grid gap-3 sm:grid-cols-4">
          {(['critical', 'high', 'medium', 'low'] as const).map((q) => {
            const meta = QUADRANT_META[q];
            const count = data?.quadrants[q] ?? 0;
            return (
              <button
                key={q}
                onClick={() => setQuadrant(quadrant === q ? null : q)}
                className={`text-left rounded-xl border p-3 transition-colors ${
                  quadrant === q
                    ? 'border-brand-500/60 bg-brand-500/5'
                    : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] hover:border-brand-500/40'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-mono text-micro font-bold px-1.5 py-0.5 rounded border ${meta.cls}`}>
                    {meta.label}
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">{count}</span>
                </div>
                <div className="h-1 rounded bg-slate-200 dark:bg-[rgb(var(--surface-300))] overflow-hidden mb-1.5">
                  <div
                    className={`h-full ${meta.bar}`}
                    style={{ width: `${Math.max(2, (count / Math.max(1, data?.count ?? 1)) * 100)}%` }}
                  />
                </div>
                <p className="text-micro font-mono text-slate-400 dark:text-slate-400 leading-relaxed">
                  {meta.explainer}
                </p>
              </button>
            );
          })}
        </div>

        {data?.note && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300 font-mono">
            {data.note}
          </div>
        )}

        {/* Scatter plot: EPSS (x) vs CVSS (y), colored by quadrant */}
        {rows.length > 0 && (
          <div className={`${CARD} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                Exploitation likelihood scatter — EPSS (x) vs CVSS (y)
              </span>
              <span className="text-micro font-mono text-slate-400 ml-auto">
                {rows.filter((r) => r.epss != null || r.cvss != null).length} plotted
              </span>
            </div>
            <div className="relative w-full h-64 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] overflow-hidden">
              {rows
                .filter((r) => r.epss != null || r.cvss != null)
                .map((r) => {
                  const x = ((r.epss ?? 0) / 1) * 92 + 4;
                  const y = 96 - ((r.cvss ?? 0) / 10) * 90;
                  const color =
                    r.quadrant === 'critical'
                      ? 'bg-rose-500'
                      : r.quadrant === 'high'
                        ? 'bg-orange-500'
                        : r.quadrant === 'medium'
                          ? 'bg-amber-400'
                          : 'bg-emerald-400';
                  return (
                    <button
                      key={r.id}
                      onClick={() => setDetailId(r.id)}
                      title={`${r.id} · CTI ${r.ctiScore} · EPSS ${((r.epss ?? 0) * 100).toFixed(1)}% · CVSS ${r.cvss ?? '—'}`}
                      className={`absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full ${color} hover:ring-2 ring-brand-500 cursor-pointer transition-transform hover:scale-150`}
                      style={{ left: `${x}%`, top: `${y}%` }}
                    />
                  );
                })}
              <div className="absolute inset-x-0 bottom-0.5 text-center text-micro font-mono text-slate-400">
                EPSS score → 100%
              </div>
              <div className="absolute left-1 top-1/2 -translate-y-1/2 -rotate-90 text-micro font-mono text-slate-400">
                CVSS → 10.0
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                <th className="py-2 pr-3 text-micro font-mono uppercase tracking-wider text-muted">CVE</th>
                <th className="py-2 pr-3 text-micro font-mono uppercase tracking-wider text-muted">CTI Score</th>
                <th className="py-2 pr-3 text-micro font-mono uppercase tracking-wider text-muted">Quadrant</th>
                <th className="py-2 pr-3 text-micro font-mono uppercase tracking-wider text-muted">CVSS</th>
                <th className="py-2 pr-3 text-micro font-mono uppercase tracking-wider text-muted">EPSS</th>
                <th className="py-2 pr-3 text-micro font-mono uppercase tracking-wider text-muted">KEV</th>
                <th className="py-2 pr-3 text-micro font-mono uppercase tracking-wider text-muted">SSVC</th>
                <th className="py-2 text-micro font-mono uppercase tracking-wider text-muted">Published</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = QUADRANT_META[r.quadrant];
                return (
                  <tr
                    key={r.id}
                    onClick={() => setDetailId(r.id)}
                    className="border-b border-slate-100 dark:border-[rgb(var(--border-400))] align-top cursor-pointer hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-200))] transition-colors"
                  >
                    <td className="py-2 pr-3">
                      <div className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{r.id}</div>
                      <div className="text-micro font-mono text-slate-400 max-w-[220px] truncate">{r.description}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                        {r.ctiScore}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`font-mono text-micro font-bold px-1.5 py-0.5 rounded border ${meta.cls}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-600 dark:text-slate-300">{r.cvss ?? '—'}</td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {r.epss != null ? `${(r.epss * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 pr-3">
                      {r.kev ? (
                        <span
                          className={`font-mono text-micro font-bold px-1.5 py-0.5 rounded border ${r.kevRansomware ? 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800' : 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800'}`}
                        >
                          {r.kevRansomware ? 'ransomware' : 'listed'}
                        </span>
                      ) : (
                        <span className="text-micro font-mono text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-micro uppercase text-muted">{r.ssvc.decision}</td>
                    <td className="py-2 font-mono text-xs text-muted">{r.published.slice(0, 10)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="text-center pt-4 pb-2 text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Score = CVSS 30% + EPSS 35% + KEV/ransomware 25% + recency 10%. Weights mirror ThreadHub's prioritization
          approach; adjust to your environment's reality.
        </div>
      </div>

      {detail && (
        <Modal open onClose={() => setDetailId(null)} title={detail.id} size="lg">
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`font-mono text-micro font-bold px-2 py-0.5 rounded border ${QUADRANT_META[detail.quadrant].cls}`}
              >
                {detail.quadrant} · CTI {detail.ctiScore}/100
              </span>
              <span className="font-mono text-micro font-bold px-2 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-300">
                SSVC: {detail.ssvc.decision}
              </span>
              {detail.reference && (
                <a
                  href={detail.reference}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-micro text-brand-600 dark:text-brand-400 hover:underline"
                >
                  NVD <ExternalLink size={10} />
                </a>
              )}
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{detail.description}</p>
            <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
              {[
                ['CVSS', detail.cvss != null ? String(detail.cvss) : '—'],
                ['EPSS', detail.epss != null ? `${(detail.epss * 100).toFixed(1)}%` : '—'],
                ['EPSS pctile', detail.epssPercentile != null ? `${(detail.epssPercentile * 100).toFixed(1)}%` : '—'],
                ['Recency', `${Math.round(detail.recencyScore * 100)}%`],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
                >
                  <div className="text-micro font-mono uppercase tracking-wider text-slate-400 mb-0.5">{label}</div>
                  <div className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">{value}</div>
                </div>
              ))}
            </div>
            <div className="border-l-2 border-violet-500 pl-4 py-2 bg-violet-50 dark:bg-violet-950/20 rounded-r-lg">
              <div className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">
                <ShieldAlert size={11} className="inline mr-1" />
                SSVC rationale
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{detail.ssvc.rationale}</p>
            </div>
          </div>
        </Modal>
      )}
    </DataPageLayout>
  );
}
