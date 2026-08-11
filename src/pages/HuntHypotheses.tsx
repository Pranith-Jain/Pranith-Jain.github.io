import { useState, useMemo } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Modal } from '../components/ui/Modal';
import { Crosshair, Search, FileJson, Copy, Check } from 'lucide-react';

interface HuntIndex {
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  counts: { hypotheses: number; tactics: number };
  tactics: Array<{ name: string; count: number }>;
  hypothesisIndex: Array<{ id: string; tactic: string; technique: string; title: string }>;
}

interface HuntBody {
  id: string;
  tactic: string;
  technique: string;
  title: string;
  hypothesis: string;
  rationale: string;
  queries: string[];
}

const CARD = 'surface-card';

function QueryBlock({ query }: { query: string }) {
  const [copied, setCopied] = useState(false);
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
    <div className="relative">
      <button
        onClick={copy}
        className="absolute top-2 right-2 inline-flex items-center gap-1 text-micro font-mono text-slate-400 hover:text-brand-500"
      >
        {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'copied' : 'copy'}
      </button>
      <pre className="font-mono text-[11px] leading-relaxed text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded p-3 pr-16 overflow-x-auto whitespace-pre-wrap">
        {query}
      </pre>
    </div>
  );
}

function HuntDetail({ body, onClose }: { body: HuntBody; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={body.title} size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-micro font-bold px-2 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-600 dark:text-slate-300">
            {body.id}
          </span>
          <span className="font-mono text-micro font-bold px-2 py-0.5 rounded border border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40">
            {body.tactic}
          </span>
          <a
            href={`https://attack.mitre.org/techniques/${body.technique.replace('.', '/')}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-micro font-bold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-800 px-2 py-0.5 rounded hover:bg-orange-100 dark:hover:bg-orange-950/60 transition-colors"
          >
            {body.technique}
          </a>
        </div>

        <div className="border-l-2 border-violet-500 pl-4 py-2 bg-violet-50 dark:bg-violet-950/20 rounded-r-lg">
          <div className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">
            Hypothesis
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{body.hypothesis}</p>
        </div>

        <div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Rationale
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{body.rationale}</p>
        </div>

        {body.queries.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Starter Queries
            </div>
            <div className="space-y-2">
              {body.queries.map((q, i) => (
                <QueryBlock key={i} query={q} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function HuntHypotheses() {
  const {
    data: index,
    loading,
    error,
  } = useDataFetch<HuntIndex>({ url: '/data/hunt-hypotheses/index.json', ttl: 120_000 });

  const [search, setSearch] = useState('');
  const [selectedTactic, setSelectedTactic] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: detailBody } = useDataFetch<HuntBody>({
    url: detailId ? `/data/hunt-hypotheses/hypotheses/${detailId}.json` : null,
    ttl: 300_000,
  });

  const filtered = useMemo(() => {
    if (!index?.hypothesisIndex) return [];
    let items = index.hypothesisIndex;
    if (selectedTactic) items = items.filter((h) => h.tactic === selectedTactic);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((h) => `${h.id} ${h.tactic} ${h.technique} ${h.title}`.toLowerCase().includes(q));
    }
    return items;
  }, [index, selectedTactic, search]);

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="DFIR"
      icon={<Crosshair />}
      title="Hunting Hypothesis Library"
      description={
        <span>
          {index?.counts.hypotheses ?? 154} structured hypotheses across {index?.counts.tactics ?? 12} ATT&CK tactics —
          each with a testable premise, true/false outcomes and starter queries. Run hypothesis-driven hunts instead of
          checklist scans.
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
              placeholder="Search hypotheses, techniques..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-9 py-2 rounded-xl text-sm bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            {filtered.length} / {index?.hypothesisIndex.length ?? 0} hypotheses
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedTactic(null)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
              !selectedTactic
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400'
            }`}
          >
            All Tactics
          </button>
          {index?.tactics.map((t) => (
            <button
              key={t.name}
              onClick={() => setSelectedTactic(selectedTactic === t.name ? null : t.name)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                selectedTactic === t.name
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                  : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400'
              }`}
            >
              {t.name} <span className="opacity-60 ml-0.5">({t.count})</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <div className="w-6 h-6 border-2 border-slate-300 dark:border-slate-600 border-t-brand-500 rounded-full animate-spin mr-3" />
            Loading hypotheses...
          </div>
        ) : filtered.length === 0 ? (
          <div className={`${CARD} p-12 text-center`}>
            <FileJson size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No hypotheses match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((h) => (
              <button
                key={h.id}
                onClick={() => setDetailId(h.id)}
                className={`${CARD} text-left p-4 transition-colors hover:border-brand-400 dark:hover:border-brand-600 group`}
              >
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <span className="font-mono text-micro font-bold text-slate-400 dark:text-slate-500">{h.id}</span>
                  <span className="font-mono text-micro font-bold px-1.5 py-0.5 rounded border border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40">
                    {h.tactic}
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white mb-2 leading-snug">
                  {h.title}
                </div>
                <div className="font-mono text-micro text-orange-600 dark:text-orange-400/70">{h.technique}</div>
              </button>
            ))}
          </div>
        )}

        <div className="text-center pt-6 pb-2 text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Authored hypothesis library grounded in MITRE ATT&CK — adapt queries to your own telemetry before running.
        </div>
      </div>

      {detailBody && <HuntDetail body={detailBody} onClose={() => setDetailId(null)} />}
    </DataPageLayout>
  );
}
