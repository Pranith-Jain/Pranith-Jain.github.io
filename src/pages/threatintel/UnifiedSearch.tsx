import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Search, ExternalLink, AlertTriangle, Skull, Globe, Shield, Bug, FileText, Database, Fingerprint } from 'lucide-react';

interface SearchItem {
  label: string;
  description?: string;
  url?: string;
  source: string;
  subkind?: string;
}

interface SearchSection {
  label: string;
  kind: string;
  total: number;
  items: SearchItem[];
}

interface UnifiedSearchResponse {
  q: string;
  generated_at: string;
  total: number;
  sections: SearchSection[];
}

const SECTION_ICONS: Record<string, typeof Search> = {
  ransomware: Skull,
  c2: AlertTriangle,
  iocs: Shield,
  detections: Bug,
  actors: Globe,
  cves: FileText,
  writeups: FileText,
  cybercrime: Database,
  correlation: Fingerprint,
  breaches: Database,
};

const SECTION_COLORS: Record<string, string> = {
  ransomware: 'text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-500/10',
  c2: 'text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10',
  iocs: 'text-sky-600 dark:text-sky-400 border-sky-500/30 bg-sky-500/10',
  detections: 'text-violet-600 dark:text-violet-400 border-violet-500/30 bg-violet-500/10',
  actors: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  cves: 'text-orange-600 dark:text-orange-400 border-orange-500/30 bg-orange-500/10',
  writeups: 'text-indigo-600 dark:text-indigo-400 border-indigo-500/30 bg-indigo-500/10',
  cybercrime: 'text-pink-600 dark:text-pink-400 border-pink-500/30 bg-pink-500/10',
  correlation: 'text-teal-600 dark:text-teal-400 border-teal-500/30 bg-teal-500/10',
  breaches: 'text-blue-600 dark:text-blue-400 border-blue-500/30 bg-blue-500/10',
};

export default function UnifiedSearch(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const initialQ = params.get('q') ?? '';
  const [query, setQuery] = useState(initialQ);
  const [data, setData] = useState<UnifiedSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSearch = async (q: string) => {
    setQuery(q);
    setParams((p) => { const n = new URLSearchParams(p); if (q.trim()) n.set('q', q.trim()); else n.delete('q'); return n; }, { replace: true });
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const r = await fetch(`/api/v1/unified-search?q=${encodeURIComponent(q.trim())}`);
      if (!r.ok) throw new Error(`${r.status}`);
      const d = (await r.json()) as UnifiedSearchResponse;
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'search failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialQ.trim()) void doSearch(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  const total = data?.total ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Search size={28} className="text-brand-600 dark:text-brand-400" /> Unified Search
        </h1>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl">
          Cross-source search across ransomware victims, C2 IPs, live IOCs, detections, actor timelines, CVEs,
          writeups, cybercrime forums, and breach disclosures — all from one endpoint.
        </p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void doSearch(query); }}
        className="relative mb-6 max-w-2xl"
      >
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search threat intelligence — e.g. LockBit, 185.234.72.0, CVE-2026-1234, RedLine…"
          aria-label="Search across all intelligence sources"
          className="w-full pl-11 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400 font-mono"
        />
      </form>

      {loading && (
        <p role="status" className="font-mono text-sm text-slate-500 py-8">
          Searching intelligence sources + live IOC/CVE check…
        </p>
      )}

      {error && (
        <p role="alert" className="font-mono text-sm text-rose-600 dark:text-rose-400">
          search error: {error}
        </p>
      )}

      {data && total === 0 && (
        <div className="py-12 text-center">
          <Search size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="font-mono text-sm text-slate-500">
            No results for &ldquo;{data.q}&rdquo; across any intelligence source.
          </p>
        </div>
      )}

      {data && total > 0 && (
        <div className="space-y-4">
          <p className="text-[12px] font-mono text-slate-500">
            {total} result{total === 1 ? '' : 's'} for &ldquo;{data.q}&rdquo;
          </p>
          {data.sections.map((section) => {
            const Icon = SECTION_ICONS[section.kind] ?? Search;
            const color = SECTION_COLORS[section.kind] ?? 'text-slate-600 border-slate-300 bg-slate-50';
            return (
              <section
                key={section.kind}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
              >
                <div className={`flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 ${color.split(' ').slice(0, 1).join(' ')}`}>
                  <Icon size={14} />
                  <span className="font-display font-semibold text-sm">{section.label}</span>
                  <span className="text-[11px] font-mono opacity-70">· {section.total}</span>
                </div>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {(section.items ?? []).slice(0, 30).map((item, i) => (
                    <li key={`${item.label}:${i}`} className="px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-950/50">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start justify-between gap-2 group"
                        >
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 truncate block">
                              {item.label}
                            </span>
                            {item.description && (
                              <span className="text-[11px] font-mono text-slate-500 mt-0.5 block truncate">
                                {item.description}
                              </span>
                            )}
                          </div>
                          <ExternalLink size={12} className="shrink-0 mt-1 text-slate-400 group-hover:text-brand-500" />
                        </a>
                      ) : (
                        <div>
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate block">
                            {item.label}
                          </span>
                          {item.description && (
                            <span className="text-[11px] font-mono text-slate-500 mt-0.5 block truncate">
                              {item.description}
                            </span>
                          )}
                        </div>
                      )}
                      <span className="text-[10px] font-mono text-slate-400 mt-1 block">
                        {item.source}{item.subkind ? ` · ${item.subkind}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                {(section.items ?? []).length > 30 && (
                  <div className="px-4 py-2 text-[11px] font-mono text-slate-500 border-t border-slate-100 dark:border-slate-800/50">
                    + {(section.items ?? []).length - 30} more
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

    </div>
  );
}
