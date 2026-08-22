import { useState, useMemo } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Modal } from '../components/ui/Modal';
import { Cloud, Search, FileJson, Copy, Check } from 'lucide-react';

interface CloudRefIndex {
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  counts: { domains: number; queries: number; providers: number };
  providerCounts: Record<string, number>;
  srm: {
    title: string;
    description: string;
    stakeholders: string[];
    domains: Array<{
      id: string;
      name: string;
      description: string;
      iaas: { aws: string; azure: string; gcp: string };
      paas: { aws: string; azure: string; gcp: string };
      saas: { aws: string; azure: string; gcp: string };
    }>;
  };
  queryIndex: Array<{ id: string; name: string; provider: string; mitre?: string | null }>;
}

interface CloudQueryBody {
  id: string;
  name: string;
  provider: string;
  mitre?: string | null;
  desc: string;
  kql: string;
}

const PROVIDER_TONE: Record<string, string> = {
  AWS: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
  Azure: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
  GCP: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
  K8s: 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800',
};

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
      <pre className="font-mono text-mini leading-relaxed text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded p-3 pr-16 overflow-x-auto whitespace-pre-wrap">
        {query}
      </pre>
    </div>
  );
}

function QueryDetail({ body, onClose }: { body: CloudQueryBody; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={body.name} size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`font-mono text-micro font-bold px-2 py-0.5 rounded border ${PROVIDER_TONE[body.provider] ?? ''}`}
          >
            {body.provider}
          </span>
          {body.mitre && (
            <a
              href={`https://attack.mitre.org/techniques/${body.mitre.replace('.', '/')}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-micro font-bold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-800 px-2 py-0.5 rounded hover:bg-orange-100 dark:hover:bg-orange-950/60 transition-colors"
            >
              {body.mitre}
            </a>
          )}
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{body.desc}</p>
        <QueryBlock query={body.kql} />
      </div>
    </Modal>
  );
}

export default function CloudReference() {
  const {
    data: index,
    loading,
    error,
  } = useDataFetch<CloudRefIndex>({ url: '/data/cloud-ref/index.json', ttl: 120_000 });

  const [tab, setTab] = useState<'srm' | 'queries'>('srm');
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: detailBody } = useDataFetch<CloudQueryBody>({
    url: detailId ? `/data/cloud-ref/queries/${detailId}.json` : null,
    ttl: 300_000,
  });

  const filteredQueries = useMemo(() => {
    if (!index?.queryIndex) return [];
    let items = index.queryIndex;
    if (provider) items = items.filter((q) => q.provider.toLowerCase() === provider.toLowerCase());
    if (search.trim()) {
      const needle = search.toLowerCase();
      items = items.filter((q) => `${q.id} ${q.name} ${q.provider}`.toLowerCase().includes(needle));
    }
    return items;
  }, [index, provider, search]);

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="DFIR"
      icon={<Cloud />}
      title="Cloud Security Reference"
      description={
        <span>
          Shared responsibility matrix ({index?.counts.domains ?? 16} domains across AWS / Azure / GCP × IaaS / PaaS /
          SaaS) + {index?.counts.queries ?? 40} cloud hunt queries for AWS, Azure, GCP and Kubernetes.
        </span>
      }
      loading={loading}
      error={error}
      maxWidthClass="max-w-7xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTab('srm')}
            className={`text-sm font-mono px-3 py-1.5 rounded border transition-colors ${
              tab === 'srm'
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'
            }`}
          >
            Shared Responsibility
          </button>
          <button
            onClick={() => setTab('queries')}
            className={`text-sm font-mono px-3 py-1.5 rounded border transition-colors ${
              tab === 'queries'
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'
            }`}
          >
            Hunt Queries ({index?.counts.queries ?? 40})
          </button>
        </div>

        {tab === 'srm' && (
          <>
            <p className="text-xs font-mono text-muted">
              {index?.srm.description} Stakeholders: {index?.srm.stakeholders.join(', ')}.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                    <th className="py-2 pr-4 text-micro font-mono uppercase tracking-wider text-muted w-56">Domain</th>
                    <th className="py-2 pr-4 text-micro font-mono uppercase tracking-wider text-muted">
                      IaaS (customer-managed)
                    </th>
                    <th className="py-2 pr-4 text-micro font-mono uppercase tracking-wider text-muted">PaaS</th>
                    <th className="py-2 text-micro font-mono uppercase tracking-wider text-muted">SaaS</th>
                  </tr>
                </thead>
                <tbody>
                  {index?.srm.domains.map((d) => (
                    <tr key={d.id} className="border-b border-slate-100 dark:border-[rgb(var(--border-400))] align-top">
                      <td className="py-3 pr-4">
                        <div className="font-display font-semibold text-xs text-slate-900 dark:text-slate-100 mb-0.5">
                          {d.name}
                        </div>
                        <div className="text-micro font-mono text-slate-400 dark:text-slate-500 leading-relaxed">
                          {d.description}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-mini font-mono text-slate-600 dark:text-slate-300 leading-relaxed">
                        {d.iaas.aws} <span className="text-slate-400">|</span> {d.iaas.azure}{' '}
                        <span className="text-slate-400">|</span> {d.iaas.gcp}
                      </td>
                      <td className="py-3 pr-4 text-mini font-mono text-slate-600 dark:text-slate-300 leading-relaxed">
                        {d.paas.aws} <span className="text-slate-400">|</span> {d.paas.azure}{' '}
                        <span className="text-slate-400">|</span> {d.paas.gcp}
                      </td>
                      <td className="py-3 text-mini font-mono text-slate-600 dark:text-slate-300 leading-relaxed">
                        {d.saas.aws} <span className="text-slate-400">|</span> {d.saas.azure}{' '}
                        <span className="text-slate-400">|</span> {d.saas.gcp}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'queries' && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Search hunt queries..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-9 py-2 rounded-xl text-sm bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                />
              </div>
              <div className="text-xs text-muted font-mono">
                {filteredQueries.length} / {index?.queryIndex.length ?? 0}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(index?.providerCounts ?? {}).map(([p, n]) => (
                <button
                  key={p}
                  onClick={() => setProvider(provider === p ? null : p)}
                  className={`font-mono text-micro font-bold px-2 py-0.5 rounded border transition-colors ${
                    provider === p ? 'ring-1 ring-brand-500' : ''
                  } ${PROVIDER_TONE[p] ?? ''}`}
                >
                  {p} ({n})
                </button>
              ))}
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <div className="w-6 h-6 border-2 border-slate-300 dark:border-[rgb(var(--border-400))] border-t-brand-500 rounded-full animate-spin mr-3" />
                Loading queries...
              </div>
            ) : filteredQueries.length === 0 ? (
              <div className={`${CARD} p-12 text-center`}>
                <FileJson size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                <p className="text-sm text-muted">No queries match your filters.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredQueries.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => setDetailId(q.id)}
                    className={`${CARD} text-left p-4 transition-colors hover:border-brand-400 dark:hover:border-brand-600 group`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <span
                        className={`font-mono text-micro font-bold px-1.5 py-0.5 rounded border ${PROVIDER_TONE[q.provider] ?? ''}`}
                      >
                        {q.provider}
                      </span>
                      {q.mitre && (
                        <span className="font-mono text-micro text-orange-600 dark:text-orange-400/70">{q.mitre}</span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white mb-2 leading-snug">
                      {q.name}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div className="text-center pt-6 pb-2 text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          SRM summarized from vendor documentation — verify against your cloud provider's current model before contract
          decisions.
        </div>
      </div>

      {detailBody && <QueryDetail body={detailBody} onClose={() => setDetailId(null)} />}
    </DataPageLayout>
  );
}
