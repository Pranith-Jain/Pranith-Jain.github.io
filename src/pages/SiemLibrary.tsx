import { useState, useMemo } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Modal } from '../components/ui/Modal';
import { Radar, Search, Copy, Check, FileJson } from 'lucide-react';

interface SiemIndex {
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  counts: { useCases: number; categories: number; techniques: number };
  categories: Array<{ name: string; count: number }>;
  severities: Record<string, number>;
  techniques: Record<string, number>;
  useCaseIndex: Array<{ id: string; name: string; category: string; mitre: string; severity: string }>;
}

interface SiemBody {
  id: string;
  name: string;
  category: string;
  description?: string;
  severity: string;
  mitre: string;
  mitreName?: string;
  kql: string;
  spl?: string;
  sigma?: string;
  dataSource?: string;
  fpRate?: string;
  tuning?: string;
  falsePositives?: string[] | string;
  apt?: string;
  references?: string[];
}

const SEVERITY_TONE: Record<string, string> = {
  critical: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
  high: 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800',
  medium: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
  low: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800',
};

const CARD = 'surface-card';

function QueryBlock({ label, query }: { label: string; query?: string }) {
  const [copied, setCopied] = useState(false);
  if (!query) return null;
  const copy = () => {
    navigator.clipboard?.writeText(query).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => undefined
    );
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</div>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="font-mono text-mini leading-relaxed text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded p-3 overflow-x-auto whitespace-pre-wrap">
        {query}
      </pre>
    </div>
  );
}

function UseCaseDetail({ body, onClose }: { body: SiemBody; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={body.name} size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`font-mono text-micro font-bold px-2 py-0.5 rounded border ${SEVERITY_TONE[body.severity.toLowerCase()] ?? ''}`}
          >
            {body.severity}
          </span>
          <span className="font-mono text-micro font-bold px-2 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-300">
            {body.category}
          </span>
          <a
            href={`https://attack.mitre.org/techniques/${body.mitre.replace('.', '/')}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-micro font-bold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-800 px-2 py-0.5 rounded hover:bg-orange-100 dark:hover:bg-orange-950/60 transition-colors"
          >
            {body.mitre}
            {body.mitreName ? ` · ${body.mitreName}` : ''}
          </a>
          {body.apt && (
            <span className="font-mono text-micro font-bold px-2 py-0.5 rounded border border-violet-300 dark:border-violet-800 text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40">
              APT: {body.apt}
            </span>
          )}
        </div>
        {body.description && (
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{body.description}</p>
        )}
        <QueryBlock label="KQL (Microsoft Sentinel)" query={body.kql} />
        <QueryBlock label="SPL (Splunk)" query={body.spl} />
        <QueryBlock label="Sigma" query={body.sigma} />
        {body.tuning && (
          <div className="border-l-2 border-amber-500 pl-4 py-2 bg-amber-50 dark:bg-amber-950/20 rounded-r-lg">
            <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">
              Tuning
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{body.tuning}</p>
          </div>
        )}
        {(body.falsePositives || body.fpRate) && (
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              False Positives
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
              {Array.isArray(body.falsePositives)
                ? body.falsePositives.join(' · ')
                : body.falsePositives || body.fpRate}
            </p>
          </div>
        )}
        {body.references && body.references.length > 0 && (
          <div className="text-mini font-mono text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
            Refs: {body.references.join(' · ')}
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function SiemLibrary() {
  const {
    data: index,
    loading,
    error,
  } = useDataFetch<SiemIndex>({ url: '/data/siem-library/index.json', ttl: 120_000 });

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSeverity, setSelectedSeverity] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: detailBody } = useDataFetch<SiemBody>({
    url: detailId ? `/data/siem-library/use-cases/${detailId}.json` : null,
    ttl: 300_000,
  });

  const filtered = useMemo(() => {
    if (!index?.useCaseIndex) return [];
    let items = index.useCaseIndex;
    if (selectedCategory) items = items.filter((u) => u.category === selectedCategory);
    if (selectedSeverity) items = items.filter((u) => u.severity.toLowerCase() === selectedSeverity.toLowerCase());
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((u) => `${u.id} ${u.name} ${u.category} ${u.mitre}`.toLowerCase().includes(q));
    }
    return items;
  }, [index, selectedCategory, selectedSeverity, search]);

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="DFIR"
      icon={<Radar />}
      title="SIEM Use-Case Library"
      description={
        <span>
          {index?.counts.useCases ?? 60} detection use-cases across {index?.counts.categories ?? 16} categories — each
          with KQL + SPL, MITRE ATT&CK mapping, tuning guidance and APT attribution. Ready to drop into Sentinel or
          Splunk.
        </span>
      }
      loading={loading}
      error={error}
      maxWidthClass="max-w-7xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
            <input
              type="text"
              placeholder="Search use-cases, techniques..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-9 py-2 rounded-xl text-sm bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            {filtered.length} / {index?.useCaseIndex.length ?? 0} use-cases
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
              !selectedCategory
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400'
            }`}
          >
            All
          </button>
          {index?.categories.map((cat) => (
            <button
              key={cat.name}
              onClick={() => setSelectedCategory(selectedCategory === cat.name ? null : cat.name)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                selectedCategory === cat.name
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                  : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400'
              }`}
            >
              {cat.name} <span className="opacity-60 ml-0.5">({cat.count})</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {Object.keys(index?.severities ?? {}).map((sev) => (
            <button
              key={sev}
              onClick={() => setSelectedSeverity(selectedSeverity === sev ? null : sev)}
              className={`font-mono text-micro font-bold px-2 py-0.5 rounded border transition-colors ${
                selectedSeverity === sev ? 'ring-1 ring-brand-500' : ''
              } ${SEVERITY_TONE[sev.toLowerCase()] ?? ''}`}
            >
              {sev} ({index?.severities[sev]})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <div className="w-6 h-6 border-2 border-slate-300 dark:border-[rgb(var(--border-400))] border-t-brand-500 rounded-full animate-spin mr-3" />
            Loading use-cases...
          </div>
        ) : filtered.length === 0 ? (
          <div className={`${CARD} p-12 text-center`}>
            <FileJson size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No use-cases match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((uc) => (
              <button
                key={uc.id}
                onClick={() => setDetailId(uc.id)}
                className={`${CARD} text-left p-4 transition-colors hover:border-brand-400 dark:hover:border-brand-600 group`}
              >
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <span
                    className={`font-mono text-micro font-bold px-1.5 py-0.5 rounded border ${SEVERITY_TONE[uc.severity.toLowerCase()] ?? ''}`}
                  >
                    {uc.severity}
                  </span>
                  <span className="font-mono text-micro text-slate-400 dark:text-slate-500">{uc.category}</span>
                </div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white mb-2 leading-snug">
                  {uc.name}
                </div>
                <div className="font-mono text-micro text-orange-600 dark:text-orange-400/70">{uc.mitre}</div>
              </button>
            ))}
          </div>
        )}

        <div className="text-center pt-6 pb-2 text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Authored detection library. Queries reference MITRE ATT&CK technique IDs; validate queries in your environment
          before enabling as alerts.
        </div>
      </div>

      {detailBody && <UseCaseDetail body={detailBody} onClose={() => setDetailId(null)} />}
    </DataPageLayout>
  );
}
