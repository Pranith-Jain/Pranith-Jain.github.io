import { useState, useEffect, useMemo } from 'react';
import { Shield, Search, X, ExternalLink, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

interface TaxonomyNode {
  id: string;
  code: string;
  title: string;
  description: string;
  delivery: 'direct' | 'indirect' | 'both';
  local?: boolean;
  aliases?: string[];
  ideas?: string[];
  examples?: string[];
}

interface TaxonomyData {
  intents: TaxonomyNode[];
  techniques: TaxonomyNode[];
  evasions: TaxonomyNode[];
  inputs: TaxonomyNode[];
}

type Category = 'intents' | 'techniques' | 'evasions' | 'inputs';

const CAT: Record<
  Category,
  {
    label: string;
    title: string;
    subtitle: string;
    dot: string;
    badge: string;
    cardBorder: string;
    cardHover: string;
    icon: string;
  }
> = {
  techniques: {
    label: 'Techniques',
    title: 'Attack Techniques',
    subtitle: 'Methods used to execute prompt injection attacks',
    dot: 'bg-orange-400',
    badge: 'bg-orange-500/10 text-orange-500 border-orange-500/30',
    cardBorder: 'border-l-orange-500',
    cardHover: 'hover:bg-orange-500/5 hover:shadow-[0_0_20px_rgba(249,115,22,0.15)]',
    icon: 'T',
  },
  evasions: {
    label: 'Evasions',
    title: 'Attack Evasions',
    subtitle: 'Obfuscation methods to avoid detection',
    dot: 'bg-purple-400',
    badge: 'bg-purple-500/10 text-purple-500 border-purple-500/30',
    cardBorder: 'border-l-purple-500',
    cardHover: 'hover:bg-purple-500/5 hover:shadow-[0_0_20px_rgba(139,92,246,0.15)]',
    icon: 'E',
  },
  intents: {
    label: 'Intents',
    title: 'Attack Intents',
    subtitle: 'Goals and objectives of prompt injection attacks',
    dot: 'bg-red-400',
    badge: 'bg-red-500/10 text-red-500 border-red-500/30',
    cardBorder: 'border-l-red-500',
    cardHover: 'hover:bg-red-500/5 hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]',
    icon: 'I',
  },
  inputs: {
    label: 'Inputs',
    title: 'Attack Inputs',
    subtitle: 'Attack surfaces and input vectors for injection',
    dot: 'bg-teal-400',
    badge: 'bg-teal-500/10 text-teal-500 border-teal-500/30',
    cardBorder: 'border-l-teal-500',
    cardHover: 'hover:bg-teal-500/5 hover:shadow-[0_0_20px_rgba(20,184,166,0.15)]',
    icon: 'In',
  },
};

const DELIVERY_DOT: Record<string, string> = {
  direct: 'bg-emerald-500',
  indirect: 'bg-yellow-500',
  both: 'bg-gradient-to-r from-emerald-500 to-yellow-500',
};

export default function PiTaxonomy() {
  const [data, setData] = useState<TaxonomyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<Category | 'all'>('all');
  const [selected, setSelected] = useState<{ cat: Category; node: TaxonomyNode } | null>(null);

  useEffect(() => {
    fetch('/data/pi-taxonomy/taxonomy.json')
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const visibleCards = useMemo(() => {
    if (!data) return [];
    const cats: Category[] = ['intents', 'techniques', 'evasions', 'inputs'];
    const results: { cat: Category; node: TaxonomyNode }[] = [];
    for (const c of cats) {
      if (activeCat !== 'all' && activeCat !== c) continue;
      for (const node of data[c]) {
        const q = search.toLowerCase();
        if (
          !q ||
          node.title.toLowerCase().includes(q) ||
          node.description.toLowerCase().includes(q) ||
          node.code.toLowerCase().includes(q) ||
          node.aliases?.some((a) => a.toLowerCase().includes(q))
        ) {
          results.push({ cat: c, node });
        }
      }
    }
    return results;
  }, [data, search, activeCat]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, intents: 0, techniques: 0, evasions: 0, inputs: 0 };
    return {
      total: data.intents.length + data.techniques.length + data.evasions.length + data.inputs.length,
      ...Object.fromEntries(Object.keys(data).map((k) => [k, data[k as Category].length])),
    } as { total: number; intents: number; techniques: number; evasions: number; inputs: number };
  }, [data]);

  if (loading) {
    return (
      <DataPageLayout
        backTo="/dfir"
        icon={<Shield size={28} />}
        title="PI Taxonomy"
        description="Loading..."
        maxWidthClass="max-w-7xl"
      >
        <div className="h-64 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
      </DataPageLayout>
    );
  }

  const cats: Category[] = ['intents', 'techniques', 'evasions', 'inputs'];

  return (
    <DataPageLayout
      backTo="/dfir"
      icon={<Shield size={28} />}
      title="PI Taxonomy"
      description="Arcanum Prompt Injection Taxonomy — 172 classified attack nodes for AI red teaming. Based on the work by Jason Haddix, Arcanum Information Security."
      maxWidthClass="max-w-7xl"
    >
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <div className="surface-card p-3 text-center">
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">{stats.total}</div>
          <div className="text-mini text-slate-500 uppercase">Total</div>
        </div>
        {cats.map((c) => (
          <div key={c} className={`surface-card p-3 text-center border-l-2 ${CAT[c].cardBorder}`}>
            <div className={`text-xl font-bold font-mono ${CAT[c].dot.replace('bg-', 'text-')}`}>{stats[c]}</div>
            <div className="text-mini text-slate-500 uppercase">{CAT[c].label}</div>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search taxonomy..."
            className="w-full pl-10 pr-4 py-2.5 text-tool font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:border-brand-500/50"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setActiveCat('all')}
            className={`px-3 py-2 text-xs font-mono rounded-xl border transition-colors ${activeCat === 'all' ? 'bg-brand-500/15 border-brand-500/40 text-brand-600 dark:text-brand-400' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
          >
            All ({stats.total})
          </button>
          {cats.map((c) => (
            <button
              key={c}
              onClick={() => setActiveCat(c)}
              className={`px-3 py-2 text-xs font-mono rounded-xl border transition-colors flex items-center gap-1.5 ${activeCat === c ? 'bg-brand-500/15 border-brand-500/40 text-brand-600 dark:text-brand-400' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
            >
              <span className={`w-2 h-2 rounded-full ${CAT[c].dot}`} />
              {CAT[c].label} ({stats[c]})
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4 text-mini text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Direct
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> Indirect
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-yellow-500" /> Either
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-amber-500 font-bold text-xs border border-amber-500 rounded px-1">LOCAL</span> Requires
          model weights
        </span>
      </div>

      {/* Cards */}
      {activeCat === 'all' ? (
        cats.map((c) => (
          <section key={c} className="mb-8">
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${CAT[c].badge} border`}>
                {CAT[c].icon}
              </div>
              <div>
                <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white">{CAT[c].title}</h2>
                <p className="text-tool text-slate-500">{CAT[c].subtitle}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data![c]
                .sort((a, b) => a.title.localeCompare(b.title))
                .map((node) => (
                  <Card key={node.code} cat={c} node={node} onClick={() => setSelected({ cat: c, node })} />
                ))}
            </div>
          </section>
        ))
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCards.map(({ cat, node }) => (
            <Card key={node.code} cat={cat} node={node} onClick={() => setSelected({ cat, node })} />
          ))}
        </div>
      )}

      {visibleCards.length === 0 && <div className="text-center py-12 text-slate-400">No results for "{search}"</div>}

      {/* Footer */}
      <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 text-center">
        <p className="text-tool text-slate-500">
          Based on the{' '}
          <a
            href="https://github.com/Arcanum-Sec/arc_pi_taxonomy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            Arcanum PI Taxonomy
          </a>{' '}
          by Jason Haddix
        </p>
        <p className="text-mini text-slate-400 mt-1">CC BY 4.0 · arcanum-sec.com/pitax</p>
      </div>

      {/* Modal */}
      {selected && <DetailModal cat={selected.cat} node={selected.node} onClose={() => setSelected(null)} />}
    </DataPageLayout>
  );
}

function Card({ cat, node, onClick }: { cat: Category; node: TaxonomyNode; onClick: () => void }) {
  const c = CAT[cat];
  return (
    <div
      onClick={onClick}
      className={`surface-card p-4 cursor-pointer border-l-3 ${c.cardBorder} transition-all ${c.cardHover}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <span className="text-mini font-mono text-brand-500 dark:text-brand-400">{node.code}</span>
          <h3 className={`text-tool font-semibold ${c.dot.replace('bg-', 'text-')}`}>{node.title}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {node.local && (
            <span className="text-mini font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/30">
              <Lock size={9} className="inline mr-0.5" />
              LOCAL
            </span>
          )}
          <span className={`w-2.5 h-2.5 rounded-full ${DELIVERY_DOT[node.delivery]}`} />
        </div>
      </div>
      <p className="text-tool text-slate-600 dark:text-slate-400 line-clamp-2">{node.description}</p>
      {node.aliases && node.aliases.length > 0 && (
        <p className="text-mini text-slate-400 mt-2 font-mono line-clamp-1">
          <span className="text-cyan-500 font-semibold">aka</span> {node.aliases.join(' · ')}
        </p>
      )}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 dark:border-slate-700/50">
        <span className="text-mini text-slate-400">{node.ideas?.length ?? 0} ideas</span>
        {cat !== 'inputs' && <span className="text-mini text-slate-400">{node.examples?.length ?? 0} prompts</span>}
        <span className="text-mini text-brand-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          View →
        </span>
      </div>
    </div>
  );
}

function DetailModal({ cat, node, onClose }: { cat: Category; node: TaxonomyNode; onClose: () => void }) {
  const c = CAT[cat];
  const [showIdeas, setShowIdeas] = useState(true);
  const [showExamples, setShowExamples] = useState(true);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold px-2 py-1 rounded-xl ${c.badge} border`}>{c.label}</span>
            <span className="text-xs font-mono text-brand-500 dark:text-brand-400 border border-slate-200 dark:border-slate-700 rounded px-2 py-0.5">
              {node.code}
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <span className={`w-2.5 h-2.5 rounded-full ${DELIVERY_DOT[node.delivery]}`} />
              {node.delivery === 'direct' ? 'Direct' : node.delivery === 'indirect' ? 'Indirect' : 'Either'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white mb-1">{node.title}</h2>
          {node.local && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-4">
              <Lock size={16} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-tool text-slate-600 dark:text-slate-300">
                <strong className="text-amber-500">Local access required.</strong> This is a white-box attack that only
                works with model weights, gradients, or decoding internals.
              </p>
            </div>
          )}
          <p className="text-tool text-slate-600 dark:text-slate-400 leading-relaxed mb-6">{node.description}</p>
          {node.aliases && node.aliases.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Also Known As</h3>
              <div className="flex flex-wrap gap-2">
                {node.aliases.map((a, i) => (
                  <span
                    key={i}
                    className="text-xs font-mono px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 border-l-2 border-l-cyan-500"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
          {node.ideas && node.ideas.length > 0 && (
            <div className="mb-6">
              <button
                onClick={() => setShowIdeas(!showIdeas)}
                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 hover:text-slate-700 dark:hover:text-slate-300"
              >
                General Ideas ({node.ideas.length}) {showIdeas ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showIdeas && (
                <ul className="space-y-2">
                  {node.ideas.map((idea, i) => (
                    <li
                      key={i}
                      className="text-tool text-slate-600 dark:text-slate-300 pl-3 border-l-2 border-l-cyan-500 bg-slate-50 dark:bg-slate-800/50 py-2 px-3 rounded-r-lg"
                    >
                      {idea}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {node.examples && node.examples.length > 0 && (
            <div className="mb-6">
              <button
                onClick={() => setShowExamples(!showExamples)}
                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Example Prompts ({node.examples.length}){' '}
                {showExamples ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showExamples && (
                <div className="space-y-2">
                  {node.examples.map((ex, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 font-mono text-xs text-slate-600 dark:text-slate-300 break-all border border-slate-200 dark:border-slate-700"
                    >
                      {ex}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <a
              href="https://github.com/Arcanum-Sec/arc_pi_taxonomy"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-brand-500 hover:underline"
            >
              <ExternalLink size={12} /> View on GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
