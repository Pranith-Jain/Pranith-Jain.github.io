import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, RefreshCw, ExternalLink, Trash2, Wand2 } from 'lucide-react';
import { adminAuthHeaders } from '../../lib/admin-token';
import { DataPageLayout } from '../../components/DataPageLayout';

interface IndexEntry {
  id: string;
  name: string;
  confidence: 'low' | 'medium' | 'high';
  generated_at: string;
  saved_at: string;
  actor: string;
  sector: string;
  ioc_count: number;
  mitre_count: number;
}

const CONFIDENCE_COLOR: Record<IndexEntry['confidence'], string> = {
  high: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  medium: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  low: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

function formatTimeAgo(iso: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function Campaigns(): JSX.Element {
  const [items, setItems] = useState<IndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/v1/campaigns');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as { items: IndexEntry[] };
      setItems(data.items ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this campaign? This cannot be undone.')) return;
    try {
      const r = await fetch(`/api/v1/campaigns/${id}`, {
        method: 'DELETE',
        headers: adminAuthHeaders(),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setError(`Delete failed: ${(e as Error).message}`);
    }
  };

  const isEmpty = !loading && items.length === 0 && !error;

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Sparkles size={28} />}
      title="Campaigns"
      description={
        <span className="text-sm font-mono">
          Saved campaign hypotheses from the{' '}
          <Link to="/threatintel/campaign-generator" className="text-brand-600 dark:text-brand-400 hover:underline">
            AI Campaign Generator
          </Link>
          . Each entry is a structured brief with kill-chain mapping, MITRE techniques, hunting hypotheses, and IOC
          pivots — committed to KV so the analyst can return to it without re-running the prompt.
        </span>
      }
      headerExtra={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            to="/threatintel/campaign-generator"
            className="inline-flex items-center gap-1.5 rounded bg-brand-600 px-3 py-1.5 text-xs font-mono font-semibold text-white hover:bg-brand-500"
          >
            <Wand2 size={12} /> Generate new campaign
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> refresh
          </button>
        </div>
      }
      loading={loading}
      error={error}
      onRetry={() => void load()}
      empty={isEmpty}
      emptyMessage="No saved campaigns yet. Generate one with the AI Campaign Generator and click Save."
      emptyIcon={<Sparkles size={28} className="mx-auto text-slate-400" />}
    >
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={it.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-brand-500/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <Link
                  to={`/threatintel/campaigns/${it.id}`}
                  className="font-display font-bold text-base text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
                >
                  {it.name} <ExternalLink size={11} />
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${CONFIDENCE_COLOR[it.confidence]}`}
                  >
                    {it.confidence}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(it.id)}
                    title="Delete campaign"
                    className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-slate-500">
                {it.actor && (
                  <span>
                    actor: <span className="text-slate-700 dark:text-slate-300">{it.actor}</span>
                  </span>
                )}
                {it.sector && (
                  <span>
                    sector: <span className="text-slate-700 dark:text-slate-300">{it.sector}</span>
                  </span>
                )}
                <span>
                  · {it.mitre_count} ATT&amp;CK ID{it.mitre_count !== 1 ? 's' : ''}
                </span>
                <span>
                  · {it.ioc_count} IOC{it.ioc_count !== 1 ? 's' : ''}
                </span>
                <span>· saved {formatTimeAgo(it.saved_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DataPageLayout>
  );
}
