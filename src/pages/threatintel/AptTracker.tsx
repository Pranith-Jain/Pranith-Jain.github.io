import { useMemo, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ExternalLink, Search, Shield, ChevronRight } from 'lucide-react';
import { APT_REGIONS, type AptGroup } from '../../data/threatintel/apt-tracker';

const SEVERITY_COLORS: Record<string, string> = {
  China: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  Russia: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  Iran: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  'North Korea': 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  NATO: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  'Middle East': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  Israel: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  Unknown: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  Others: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
};

function AptGroupCard({ group, onClick }: { group: AptGroup; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 hover:border-brand-500/40 hover:shadow-e2 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">{group.name}</h3>
        <ChevronRight size={14} className="text-slate-400 shrink-0 mt-0.5" />
      </div>
      {group.aliases.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {group.aliases.slice(0, 3).map((a) => (
            <span
              key={a}
              className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500"
            >
              {a}
            </span>
          ))}
          {group.aliases.length > 3 && (
            <span className="text-micro font-mono text-slate-400">+{group.aliases.length - 3}</span>
          )}
        </div>
      )}
      <p className="text-meta font-mono text-slate-500 dark:text-slate-400 line-clamp-2">{group.malware}</p>
    </button>
  );
}

function AptGroupDetail({ group, onClose }: { group: AptGroup; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <button
        type="button"
        className="fixed inset-0 z-50 bg-transparent border-0 p-0"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
        aria-label="Close"
      />
      <div className="relative bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-e2 max-w-2xl w-full max-h-[80vh] overflow-y-auto z-50">
        <div className="p-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">{group.name}</h2>
              <p className="text-sm font-mono text-slate-500 dark:text-slate-400 mt-1">{group.country}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none"
            >
              ×
            </button>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {group.aliases.length > 0 && (
            <div>
              <h4 className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-2">Aliases</h4>
              <div className="flex flex-wrap gap-1.5">
                {group.aliases.map((a) => (
                  <span
                    key={a}
                    className="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-muted"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}
          {group.operations.length > 0 && (
            <div>
              <h4 className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-2">Operations</h4>
              <div className="flex flex-wrap gap-1.5">
                {group.operations.map((o) => (
                  <span
                    key={o}
                    className="text-xs font-mono px-2 py-1 rounded bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
                  >
                    {o}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <h4 className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-2">Malware & Tools</h4>
            <p className="text-sm font-mono text-muted leading-relaxed">{group.malware}</p>
          </div>
          {group.targets && (
            <div>
              <h4 className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-2">Targets</h4>
              <p className="text-sm font-mono text-muted">{group.targets}</p>
            </div>
          )}
          {group.links.length > 0 && (
            <div>
              <h4 className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-2">References</h4>
              <div className="space-y-1">
                {group.links.map((l) => (
                  <a
                    key={l}
                    href={l}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1 break-all"
                  >
                    <ExternalLink size={10} /> {l}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AptTracker(): JSX.Element {
  const [query, setQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<AptGroup | null>(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return selectedRegion ? (APT_REGIONS.find((r) => r.name === selectedRegion)?.groups ?? []) : [];
    const q = query.toLowerCase();
    return APT_REGIONS.flatMap((r) => r.groups).filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.aliases.some((a) => a.toLowerCase().includes(q)) ||
        g.malware.toLowerCase().includes(q) ||
        g.operations.some((o) => o.toLowerCase().includes(q))
    );
  }, [query, selectedRegion]);

  const totalGroups = useMemo(() => APT_REGIONS.reduce((s, r) => s + r.groups.length, 0), []);
  const totalOps = useMemo(() => APT_REGIONS.reduce((s, r) => s + r.totalOperations, 0), []);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Shield size={28} />}
      title="APT Tracker"
      description="Open-source APT groups and operations database — 411 groups across 9 regions. Data from onuroktay14/APTTracker (CC BY 4.0)."
    >
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 text-center">
          <div className="text-2xl font-display font-bold text-brand-600 dark:text-brand-400">{totalGroups}</div>
          <div className="text-micro font-mono text-slate-500 uppercase">APT Groups</div>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 text-center">
          <div className="text-2xl font-display font-bold text-brand-600 dark:text-brand-400">{APT_REGIONS.length}</div>
          <div className="text-micro font-mono text-slate-500 uppercase">Regions</div>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 text-center">
          <div className="text-2xl font-display font-bold text-brand-600 dark:text-brand-400">{totalOps}</div>
          <div className="text-micro font-mono text-slate-500 uppercase">Operations</div>
        </div>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search APT groups, aliases, malware, operations..."
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          />
        </div>
      </div>

      {query.trim() && (
        <div className="mb-6">
          <p className="text-mini font-mono text-slate-500 mb-3">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{query}"
          </p>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((g) => (
              <AptGroupCard key={g.name} group={g} onClick={() => setSelectedGroup(g)} />
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="text-sm font-mono text-slate-500 text-center py-8">No groups match your search.</p>
          )}
        </div>
      )}

      {!query.trim() && !selectedRegion && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {APT_REGIONS.map((r) => (
            <button
              key={r.name}
              type="button"
              onClick={() => setSelectedRegion(r.name)}
              className={`text-left rounded-xl border bg-white dark:bg-slate-900 shadow-e1 p-6 hover:shadow-e2 transition-all ${SEVERITY_COLORS[r.name] ?? 'border-slate-200 dark:border-slate-800'}`}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{r.flag}</span>
                <div>
                  <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">{r.name}</h3>
                  <p className="text-micro font-mono text-slate-500">{r.groups.length} groups</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-meta font-mono text-slate-500">
                <span>{r.totalOperations} operations</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {!query.trim() && selectedRegion && (
        <div>
          <button
            type="button"
            onClick={() => setSelectedRegion(null)}
            className="text-sm font-mono text-brand-600 dark:text-brand-400 hover:underline mb-4"
          >
            ← Back to all regions
          </button>
          <h2 className="font-display font-bold text-xl text-slate-900 dark:text-slate-100 mb-4">
            {APT_REGIONS.find((r) => r.name === selectedRegion)?.flag} {selectedRegion}
          </h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(APT_REGIONS.find((r) => r.name === selectedRegion)?.groups ?? []).map((g) => (
              <AptGroupCard key={g.name} group={g} onClick={() => setSelectedGroup(g)} />
            ))}
          </div>
        </div>
      )}

      {selectedGroup && <AptGroupDetail group={selectedGroup} onClose={() => setSelectedGroup(null)} />}

      <div className="mt-8 text-center text-micro font-mono text-slate-500">
        Data from{' '}
        <a
          href="https://onuroktay14.github.io/APTTracker/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 dark:text-brand-400 hover:underline"
        >
          APT Tracker
        </a>{' '}
        by Onur Oktay · CC BY 4.0
      </div>
    </DataPageLayout>
  );
}
