import { useState, useMemo } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Database, Search, ExternalLink, FileJson, X } from 'lucide-react';

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

const HIVE_COLORS = {
  NTUSER: 'text-green-400 bg-green-950/30 border-green-800/40',
  SOFTWARE: 'text-blue-400 bg-blue-950/30 border-blue-800/40',
  SYSTEM: 'text-amber-400 bg-amber-950/30 border-amber-800/40',
  SAM: 'text-red-400 bg-red-950/30 border-red-800/40',
  SECURITY: 'text-purple-400 bg-purple-950/30 border-purple-800/40',
  AMCACHE: 'text-teal-400 bg-teal-950/30 border-teal-800/40',
  USRCLASS: 'text-orange-400 bg-orange-950/30 border-orange-800/40',
  ALL: 'text-slate-400 bg-slate-950/30 border-slate-700/40',
} as const satisfies Record<string, string>;

function hiveColor(hive: string): string {
  const key = hive.toUpperCase().replace('.DAT', '').replace('.HVE', '');
  if (key in HIVE_COLORS) return HIVE_COLORS[key as keyof typeof HIVE_COLORS];
  return HIVE_COLORS.ALL;
}

function hiveLabel(hive: string): string {
  return hive.toUpperCase().replace('.DAT', '').replace('.HVE', '').slice(0, 10);
}

function ArtifactDetail({ body, onClose }: { body: ArtifactBody; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 pb-8 px-4 bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white pr-8">{body.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {body.keys.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Registry Keys</div>
              <div className="space-y-1">
                {body.keys.map((k, i) => (
                  <div key={i} className="font-mono text-xs text-cyan-300 bg-slate-950 border border-slate-800 rounded px-3 py-1.5 break-all">{k}</div>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Description</div>
            <p className="text-sm text-slate-300 leading-relaxed">{body.description}</p>
          </div>
          {body.forensic_value && (
            <div className="border-l-2 border-violet-500 pl-4 py-2 bg-violet-950/20 rounded-r-lg">
              <div className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-1">Forensic Value</div>
              <p className="text-sm text-slate-300 leading-relaxed">{body.forensic_value}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {body.hive.map((h) => (
              <span key={h} className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${hiveColor(h)}`}>{hiveLabel(h)}</span>
            ))}
          </div>
          {body.techniques.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">MITRE ATT&CK</div>
              <div className="flex flex-wrap gap-1.5">
                {body.techniques.map((t) => (
                  <a key={t} href={`https://attack.mitre.org/techniques/${t.replace('.', '/')}/`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-orange-400 bg-orange-950/30 border border-orange-800/40 px-2 py-0.5 rounded hover:bg-orange-950/50">
                    {t} <ExternalLink size={10} />
                  </a>
                ))}
              </div>
            </div>
          )}
          {body.parsers.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Parsers / Tools</div>
              <div className="flex flex-wrap gap-1.5">
                {body.parsers.map((p, i) => (
                  <span key={i} className="font-mono text-[10px] text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded">{p}</span>
                ))}
              </div>
            </div>
          )}
          <div className="text-[10px] text-slate-600 pt-2 border-t border-slate-800">
            Data from <a href={body.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">{body.source}</a> ({body.license})
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WinReg() {
  const { data: index, loading, error } = useDataFetch<WinRegIndex>({ url: '/api/v1/winreg/', ttl: 120_000 });
  const { data: artifactsData, loading: artsLoading } = useDataFetch<{ artifacts: ArtifactEntry[]; total: number }>({ url: '/api/v1/winreg/artifacts?limit=292', ttl: 120_000 });

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
    if (selectedHive) arts = arts.filter((a) => a.hive.some((h) => h.toUpperCase().includes(selectedHive.toUpperCase())));
    if (search.trim()) {
      const q = search.toLowerCase();
      arts = arts.filter((a) => `${a.name} ${a.categoryLabel} ${a.hive.join(' ')} ${a.techniques.join(' ')} ${a.tool.join(' ')}`.toLowerCase().includes(q));
    }
    return arts;
  }, [artifactsData, selectedCategory, selectedHive, search]);

  return (
    <DataPageLayout
      backTo="/"
      backLabel="Home"
      icon={<Database />}
      title="Windows Registry Forensic Artifacts"
      description={
        <span>
          Registry artifact reference from{' '}
          <a href="https://dfir-scripts.github.io/registry/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
            dfir-scripts.github.io/registry
          </a>{' '}
          — {index?.counts.artifacts ?? 292} artifacts across {index?.counts.categories ?? 16} categories, mapped to MITRE ATT&CK.
        </span>
      }
      loading={loading}
      error={error}
      accentClass="text-cyan-400"
      maxWidthClass="max-w-7xl"
    >
      <div className="space-y-4">
        {/* Search + stats bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search artifacts by name, key, technique..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-600"
            />
          </div>
          <div className="text-xs text-slate-500 font-mono">
            {filtered.length} / {artifactsData?.total ?? 0} artifacts
          </div>
        </div>

        {/* Category + Hive filter chips */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${!selectedCategory ? 'bg-cyan-900/40 border-cyan-600 text-cyan-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}
          >
            All Categories
          </button>
          {index?.categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(selectedCategory === cat.key ? null : cat.key)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${selectedCategory === cat.key ? 'bg-cyan-900/40 border-cyan-600 text-cyan-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'}`}
            >
              {cat.name} <span className="text-slate-500 ml-0.5">({cat.count})</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {['ALL', 'NTUSER', 'SOFTWARE', 'SYSTEM', 'SAM', 'SECURITY', 'AMCACHE', 'USRCLASS'].map((h) => (
            <button
              key={h}
              onClick={() => setSelectedHive(selectedHive === h ? null : h)}
              className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${selectedHive === h ? 'ring-1 ring-cyan-500' : ''} ${hiveColor(h)}`}
            >
              {h}
            </button>
          ))}
        </div>

        {/* Artifact grid */}
        {artsLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <div className="w-6 h-6 border-2 border-slate-600 border-t-cyan-500 rounded-full animate-spin mr-3" />
            Loading artifacts...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <FileJson size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No artifacts match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((art) => (
              <button
                key={art.slug}
                onClick={() => setDetailSlug(art.slug)}
                className="text-left bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-lg p-4 transition-colors group"
              >
                <div className="text-sm font-semibold text-slate-200 group-hover:text-white mb-2 leading-snug">{art.name}</div>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {art.hive.map((h) => (
                    <span key={h} className={`font-mono text-[9px] font-bold px-1.5 py-0.5 rounded border ${hiveColor(h)}`}>{hiveLabel(h)}</span>
                  ))}
                </div>
                {art.techniques.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {art.techniques.slice(0, 3).map((t) => (
                      <span key={t} className="font-mono text-[9px] text-orange-400/70 bg-orange-950/20 border border-orange-800/30 px-1.5 py-0.5 rounded">{t}</span>
                    ))}
                    {art.techniques.length > 3 && <span className="font-mono text-[9px] text-slate-500">+{art.techniques.length - 3}</span>}
                  </div>
                )}
                {art.tool.length > 0 && (
                  <div className="mt-2 text-[10px] text-slate-600 truncate">{art.tool.slice(0, 2).join(', ')}</div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Source footer */}
        <div className="text-center pt-6 pb-2 text-xs text-slate-600 border-t border-slate-800">
          Data sourced from{' '}
          <a href="https://dfir-scripts.github.io/registry/" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
            dfir-scripts.github.io
          </a>{' '}
          — Windows Registry Forensic Artifacts reference ({index?.license ?? 'MIT'}).<br />
          Artifact definitions derived from RegRipper 3.0/4.0, Sysinternals Autoruns, RECmd, SBECmd, AmcacheParser, and MITRE ATT&CK.<br />
          File hash enrichment via{' '}
          <a href="/traceix" className="text-cyan-400 hover:underline">Traceix</a>{' '}
          (PCEF /{' '}
          <a href="https://traceix.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">traceix.com</a>
          ).
        </div>
      </div>

      {/* Detail modal */}
      {detailBody && <ArtifactDetail body={detailBody} onClose={() => setDetailSlug(null)} />}
    </DataPageLayout>
  );
}
