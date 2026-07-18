import { useState, useMemo } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Modal } from '../components/ui/Modal';
import { Database, Search, ExternalLink, FileJson } from 'lucide-react';

interface WinRegIndex {
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  counts: { artifacts: number; categories: number; hives: number; tactics: number; techniques: number };
  categories: Array<{ key: string; name: string; description: string; count: number }>;
  hives: string[];
  tactics: string[];
  techniques: string[];
}

interface ArtifactEntry {
  slug: string;
  name: string;
  category: string;
  categoryLabel: string;
  hive: string[];
  techniques: string[];
  mitre: string | null;
  tool: string[];
}

interface ArtifactBody {
  slug: string;
  name: string;
  category: string;
  categoryLabel: string;
  categoryDescription: string;
  hive: string[];
  keys: string[];
  description: string;
  forensic_value: string;
  mitre: string | null;
  techniques: string[];
  parsers: string[];
  source: string;
  sourceUrl: string;
  license: string;
}

const HIVE_COLORS: Record<string, string> = {
  NTUSER: 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 border-green-300 dark:border-green-800',
  SOFTWARE: 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800',
  SYSTEM: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
  SAM: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
  SECURITY:
    'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800',
  AMCACHE: 'text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800',
  USRCLASS:
    'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800',
  ALL: 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/40 border-slate-300 dark:border-slate-700',
};

function hiveColor(hive: string): string {
  const key = hive.toUpperCase().replace('.DAT', '').replace('.HVE', '');
  return HIVE_COLORS[key] ?? HIVE_COLORS.ALL!;
}

function hiveLabel(hive: string): string {
  return hive.toUpperCase().replace('.DAT', '').replace('.HVE', '').slice(0, 10);
}

const CARD = 'surface-card';

function ArtifactDetail({ body, onClose }: { body: ArtifactBody; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={body.name} size="lg">
      <div className="space-y-5 max-h-[70vh] overflow-y-auto">
        {body.keys.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Registry Keys
            </div>
            <div className="space-y-1">
              {body.keys.map((k, i) => (
                <div
                  key={i}
                  className="font-mono text-xs text-brand-600 dark:text-brand-400 bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded px-3 py-1.5 break-all"
                >
                  {k}
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Description
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{body.description}</p>
        </div>
        {body.forensic_value && (
          <div className="border-l-2 border-violet-500 pl-4 py-2 bg-violet-50 dark:bg-violet-950/20 rounded-r-lg">
            <div className="text-xs font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider mb-1">
              Forensic Value
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{body.forensic_value}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {body.hive.map((h) => (
            <span key={h} className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${hiveColor(h)}`}>
              {hiveLabel(h)}
            </span>
          ))}
        </div>
        {body.techniques.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              MITRE ATT&CK
            </div>
            <div className="flex flex-wrap gap-1.5">
              {body.techniques.map((t) => (
                <a
                  key={t}
                  href={`https://attack.mitre.org/techniques/${t.replace('.', '/')}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-800 px-2 py-0.5 rounded hover:bg-orange-100 dark:hover:bg-orange-950/60"
                >
                  {t} <ExternalLink size={10} />
                </a>
              ))}
            </div>
          </div>
        )}
        {body.parsers.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Parsers / Tools
            </div>
            <div className="flex flex-wrap gap-1.5">
              {body.parsers.map((p, i) => (
                <span
                  key={i}
                  className="font-mono text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="text-[10px] text-slate-500 dark:text-slate-500 pt-2 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Data from{' '}
          <a
            href={body.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            {body.source}
          </a>{' '}
          ({body.license})
        </div>
      </div>
    </Modal>
  );
}

export default function WinReg() {
  const { data: index, loading, error } = useDataFetch<WinRegIndex>({ url: '/api/v1/winreg/', ttl: 120_000 });
  const { data: artifactsData, loading: artsLoading } = useDataFetch<{ artifacts: ArtifactEntry[]; total: number }>({
    url: '/api/v1/winreg/artifacts?limit=292',
    ttl: 120_000,
  });

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedHive, setSelectedHive] = useState<string | null>(null);
  const [detailSlug, setDetailSlug] = useState<string | null>(null);

  const { data: detailBody } = useDataFetch<ArtifactBody>({
    url: detailSlug ? `/api/v1/winreg/artifacts/${detailSlug}` : null,
    ttl: 300_000,
  });

  const filtered = useMemo(() => {
    if (!artifactsData?.artifacts) return [];
    let arts = artifactsData.artifacts;
    if (selectedCategory) arts = arts.filter((a) => a.category === selectedCategory);
    if (selectedHive)
      arts = arts.filter((a) => a.hive.some((h) => h.toUpperCase().includes(selectedHive.toUpperCase())));
    if (search.trim()) {
      const q = search.toLowerCase();
      arts = arts.filter((a) =>
        `${a.name} ${a.categoryLabel} ${a.hive.join(' ')} ${a.techniques.join(' ')} ${a.tool.join(' ')}`
          .toLowerCase()
          .includes(q)
      );
    }
    return arts;
  }, [artifactsData, selectedCategory, selectedHive, search]);

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="DFIR"
      icon={<Database />}
      title="Windows Registry Forensic Artifacts"
      description={
        <span>
          Registry artifact reference from{' '}
          <a
            href="https://dfir-scripts.github.io/registry/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            dfir-scripts.github.io/registry
          </a>{' '}
          — {index?.counts.artifacts ?? 292} artifacts across {index?.counts.categories ?? 16} categories, mapped to
          MITRE ATT&CK.
        </span>
      }
      loading={loading}
      error={error}
      maxWidthClass="max-w-7xl"
    >
      <div className="space-y-4">
        {/* Search + stats bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search artifacts by name, key, technique..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-9 py-2 rounded-xl text-sm bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            {filtered.length} / {artifactsData?.total ?? 0} artifacts
          </div>
        </div>

        {/* Category filter chips */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
              !selectedCategory
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400'
            }`}
          >
            All Categories
          </button>
          {index?.categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(selectedCategory === cat.key ? null : cat.key)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                selectedCategory === cat.key
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                  : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400 hover:border-slate-400'
              }`}
            >
              {cat.name} <span className="opacity-60 ml-0.5">({cat.count})</span>
            </button>
          ))}
        </div>

        {/* Hive filter */}
        <div className="flex flex-wrap gap-1.5">
          {['ALL', 'NTUSER', 'SOFTWARE', 'SYSTEM', 'SAM', 'SECURITY', 'AMCACHE', 'USRCLASS'].map((h) => (
            <button
              key={h}
              onClick={() => setSelectedHive(selectedHive === h ? null : h)}
              className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${selectedHive === h ? 'ring-1 ring-brand-500' : ''} ${hiveColor(h)}`}
            >
              {h}
            </button>
          ))}
        </div>

        {/* Artifact grid */}
        {artsLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <div className="w-6 h-6 border-2 border-slate-300 dark:border-slate-600 border-t-brand-500 rounded-full animate-spin mr-3" />
            Loading artifacts...
          </div>
        ) : filtered.length === 0 ? (
          <div className={`${CARD} p-12 text-center`}>
            <FileJson size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No artifacts match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((art) => (
              <button
                key={art.slug}
                onClick={() => setDetailSlug(art.slug)}
                className={`${CARD} text-left p-4 transition-colors hover:border-brand-400 dark:hover:border-brand-600 group`}
              >
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white mb-2 leading-snug">
                  {art.name}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {art.hive.map((h) => (
                    <span
                      key={h}
                      className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border ${hiveColor(h)}`}
                    >
                      {hiveLabel(h)}
                    </span>
                  ))}
                </div>
                {art.techniques.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {art.techniques.slice(0, 3).map((t) => (
                      <span
                        key={t}
                        className="font-mono text-[9px] text-orange-600 dark:text-orange-400/70 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/30 px-1.5 py-0.5 rounded"
                      >
                        {t}
                      </span>
                    ))}
                    {art.techniques.length > 3 && (
                      <span className="font-mono text-[9px] text-slate-400">+{art.techniques.length - 3}</span>
                    )}
                  </div>
                )}
                {art.tool.length > 0 && (
                  <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 truncate">
                    {art.tool.slice(0, 2).join(', ')}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Source footer */}
        <div className="text-center pt-6 pb-2 text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Data sourced from{' '}
          <a
            href="https://dfir-scripts.github.io/registry/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            dfir-scripts.github.io
          </a>{' '}
          — Windows Registry Forensic Artifacts reference ({index?.license ?? 'MIT'}).
          <br />
          Artifact definitions derived from RegRipper 3.0/4.0, Sysinternals Autoruns, RECmd, SBECmd, AmcacheParser, and
          MITRE ATT&CK.
          <br />
          File hash enrichment via{' '}
          <a href="/dfir/traceix" className="text-brand-600 dark:text-brand-400 hover:underline">
            Traceix
          </a>{' '}
          (PCEF /{' '}
          <a
            href="https://traceix.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            traceix.com
          </a>
          ).
        </div>
      </div>

      {/* Detail modal */}
      {detailBody && <ArtifactDetail body={detailBody} onClose={() => setDetailSlug(null)} />}
    </DataPageLayout>
  );
}
