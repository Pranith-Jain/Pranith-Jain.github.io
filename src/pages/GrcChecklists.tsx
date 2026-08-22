import { useState, useMemo } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { ClipboardCheck, Search, ShieldCheck, GitMerge } from 'lucide-react';

interface GrcFrameworkBrief {
  key: string;
  name: string;
  year: string;
  description: string;
  themes: string[];
  categories: Array<{ key: string; name: string; count: number }>;
  controlCount: number;
}

interface GrcIndex {
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  counts: { frameworks: number; controls: number; mapperThemes: number };
  frameworks: GrcFrameworkBrief[];
  mapper: { title: string; description: string; themes: Array<Record<string, string | string[]>> };
}

interface GrcControl {
  id: string;
  name: string;
  req: string;
}

interface GrcFrameworkBody {
  key: string;
  name: string;
  year: string;
  description: string;
  themes: string[];
  categories: Array<{ key: string; name: string; controls: GrcControl[] }>;
  source: string;
  sourceUrl: string;
  license: string;
}

interface MapperTheme {
  theme: string;
  [framework: string]: string | string[];
}

const FRAMEWORK_LABELS: Record<string, string> = {
  iso: 'ISO 27001',
  certin: 'CERT-In',
  sebi: 'SEBI',
  rbi: 'RBI',
  soc2: 'SOC 2',
  pci: 'PCI DSS',
  dpdp: 'DPDP',
};

const CARD = 'surface-card';

export default function GrcChecklists() {
  const { data: index, loading, error } = useDataFetch<GrcIndex>({ url: '/data/grc/index.json', ttl: 120_000 });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<'frameworks' | 'mapper'>('frameworks');
  const [search, setSearch] = useState('');

  const {
    data: framework,
    loading: fwLoading,
    error: fwError,
  } = useDataFetch<GrcFrameworkBody>({
    url: selectedKey ? `/data/grc/frameworks/${selectedKey}.json` : null,
    ttl: 300_000,
  });

  const filteredControls = useMemo(() => {
    if (!framework) return [];
    const q = search.toLowerCase();
    return framework.categories
      .flatMap((cat) => cat.controls.map((ctl) => ({ cat, ctl })))
      .filter(({ ctl }) => !q || `${ctl.id} ${ctl.name} ${ctl.req}`.toLowerCase().includes(q));
  }, [framework, search]);

  return (
    <DataPageLayout
      backTo="/dfir/grc"
      backLabel="GRC"
      icon={<ClipboardCheck />}
      title="Compliance Checklists"
      description={
        <span>
          Regulatory + standards checklists — {index?.counts.frameworks ?? 7} frameworks,{' '}
          {index?.counts.controls ?? 232} controls, plus a cross-framework control mapper (
          {index?.counts.mapperThemes ?? 19} themes). India-focused (CERT-In / SEBI / RBI) + ISO 27001 / SOC 2 / PCI DSS
          v4 / DPDP 2023 with AI controls.
        </span>
      }
      loading={loading}
      error={error}
      maxWidthClass="max-w-6xl"
    >
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTab('frameworks')}
            className={`text-sm font-mono px-3 py-1.5 rounded border transition-colors ${
              tab === 'frameworks'
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'
            }`}
          >
            <ShieldCheck size={13} className="inline mr-1" />
            Frameworks
          </button>
          <button
            onClick={() => setTab('mapper')}
            className={`text-sm font-mono px-3 py-1.5 rounded border transition-colors ${
              tab === 'mapper'
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'
            }`}
          >
            <GitMerge size={13} className="inline mr-1" />
            Cross-Framework Mapper
          </button>
        </div>

        {tab === 'frameworks' && (
          <>
            {/* Framework picker */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {index?.frameworks.map((fw) => (
                <button
                  key={fw.key}
                  onClick={() => setSelectedKey(selectedKey === fw.key ? null : fw.key)}
                  className={`text-left rounded-xl border p-3 transition-colors ${
                    selectedKey === fw.key
                      ? 'border-brand-500/60 bg-brand-500/5'
                      : 'border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] hover:border-brand-500/40'
                  }`}
                >
                  <div className="text-xs font-mono uppercase tracking-[0.15em] text-brand-600 dark:text-brand-400 mb-0.5">
                    {fw.name}
                  </div>
                  <div className="text-micro font-mono text-muted mb-1.5">
                    {fw.year} · {fw.controlCount} controls
                  </div>
                  <div className="text-mini font-mono text-muted leading-relaxed line-clamp-3">{fw.description}</div>
                </button>
              ))}
            </div>

            {/* Control list */}
            {selectedKey && (
              <div className={`${CARD} p-4`}>
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="text"
                      placeholder="Search controls by ID, name, requirement..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full px-9 py-1.5 rounded-lg text-sm bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-heading placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div className="text-xs text-muted font-mono">
                    {filteredControls.length} / {framework?.categories.reduce((n, c) => n + c.controls.length, 0) ?? 0}
                  </div>
                </div>

                {fwLoading ? (
                  <div className="flex items-center justify-center py-12 text-slate-500">
                    <div className="w-6 h-6 border-2 border-slate-300 dark:border-[rgb(var(--border-400))] border-t-brand-500 rounded-full animate-spin mr-3" />
                    Loading framework...
                  </div>
                ) : fwError ? (
                  <p className="text-sm text-rose-500">{fwError}</p>
                ) : (
                  <div className="space-y-4">
                    {framework?.categories.map((cat) => {
                      const controls = cat.controls.filter((ctl) => {
                        const q = search.toLowerCase();
                        return !q || `${ctl.id} ${ctl.name} ${ctl.req}`.toLowerCase().includes(q);
                      });
                      if (controls.length === 0) return null;
                      return (
                        <div key={cat.key}>
                          <h3 className="font-display font-semibold text-sm text-heading mb-2">
                            {cat.key} — {cat.name}
                          </h3>
                          <div className="space-y-1.5">
                            {controls.map((ctl) => (
                              <div
                                key={ctl.id}
                                className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-2.5"
                              >
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                                    {ctl.id}
                                  </span>
                                  <span className="font-display font-semibold text-xs text-heading">{ctl.name}</span>
                                </div>
                                <p className="text-mini font-mono text-muted leading-relaxed">{ctl.req}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {tab === 'mapper' && (
          <div className="space-y-3">
            <p className="text-xs font-mono text-muted">
              {index?.mapper.description} — every theme maps equivalent controls across all seven frameworks, so one gap
              analysis answers for every regulator.
            </p>
            {index?.mapper.themes.map((themeRaw, i) => {
              const theme = themeRaw as MapperTheme;
              return (
                <div key={theme.theme} className={`${CARD} p-4`}>
                  <h3 className="font-display font-semibold text-sm text-heading mb-3">
                    {i + 1}. {theme.theme}
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {Object.entries(theme)
                      .filter(([k]) => k !== 'theme')
                      .map(([fw, controls]) => {
                        const list = Array.isArray(controls) ? controls : [];
                        return (
                          <div
                            key={fw}
                            className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-2.5"
                          >
                            <div className="text-micro font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-1.5">
                              {FRAMEWORK_LABELS[fw] ?? fw}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {list.length === 0 && <span className="text-micro font-mono text-slate-400">—</span>}
                              {list.map((c) => (
                                <span
                                  key={c}
                                  className="font-mono text-micro px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-body"
                                >
                                  {c}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-center pt-6 pb-2 text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Summarized from public standards & regulations — not a substitute for the official texts. Pairs with the GRC
          Toolkit (self-assessment) and the DPDP AI controls for AI-risk coverage.
        </div>
      </div>
    </DataPageLayout>
  );
}
