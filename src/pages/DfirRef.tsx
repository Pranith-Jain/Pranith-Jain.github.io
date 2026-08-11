import { useState, useMemo } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Modal } from '../components/ui/Modal';
import { BookOpen, Search, ExternalLink, FileJson, ShieldAlert, Cpu, Globe, Scale } from 'lucide-react';

interface DfirRefIndex {
  source: string;
  sourceUrl: string;
  license: string;
  replicatedAt: string;
  counts: { eventIds: number; memoryCommands: number; browserArtifacts: number; evidencePhases: number };
  categories: Array<{ key: string; name: string; count: number }>;
  itemIndex: Array<{
    slug: string;
    id: string;
    name: string;
    category: string;
    categoryLabel: string;
    tags: string[];
    mitre: string | null;
  }>;
}

interface DfirRefBody {
  slug: string;
  section: string;
  sectionLabel: string;
  name?: string;
  mitre?: string | null;
  [key: string]: string | number | string[] | null | undefined;
}

const CATEGORY_ICONS: Record<string, JSX.Element> = {
  'event-ids': <ShieldAlert size={14} />,
  memory: <Cpu size={14} />,
  browser: <Globe size={14} />,
  evidence: <Scale size={14} />,
};

const CATEGORY_TONE: Record<string, string> = {
  'event-ids':
    'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
  memory:
    'text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/40 border-violet-300 dark:border-violet-800',
  browser: 'text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/40 border-sky-300 dark:border-sky-800',
  evidence:
    'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800',
};

const CARD = 'surface-card';

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
        {label}
      </div>
      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap font-mono">
        {value}
      </p>
    </div>
  );
}

function ListField({ label, items }: { label: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span
            key={i}
            className="font-mono text-micro text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded"
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

function DfirRefDetail({ body, onClose }: { body: DfirRefBody; onClose: () => void }) {
  const category = String(body.section ?? '');
  const isEvent = category === 'event-ids';
  const isMemory = category === 'memory';
  const isEvidence = category === 'evidence';
  return (
    <Modal open onClose={onClose} title={String(body.name ?? body.slug)} size="lg">
      <div className="space-y-5 max-h-[70vh] overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`font-mono text-micro font-bold px-2 py-0.5 rounded border ${CATEGORY_TONE[category] ?? ''}`}
          >
            {body.sectionLabel}
          </span>
          {body.mitre && (
            <a
              href={`https://attack.mitre.org/techniques/${String(body.mitre).replace('.', '/')}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-micro font-bold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border border-orange-300 dark:border-orange-800 px-2 py-0.5 rounded hover:bg-orange-100 dark:hover:bg-orange-950/60 transition-colors"
            >
              {body.mitre} <ExternalLink size={10} />
            </a>
          )}
        </div>

        {isEvent && (
          <>
            <Field label="Log Source" value={String(body.log ?? '')} />
            <Field label="Description" value={String(body.description ?? '')} />
            <Field label="Investigation Guidance" value={String(body.investigation ?? '')} />
            <ListField label="Indicators of Compromise" items={(body.indicators as string[]) ?? undefined} />
          </>
        )}

        {isMemory && (
          <>
            <Field label="Volatility Version" value={String(body.version ?? '')} />
            <Field label="Plugin Category" value={String(body.category ?? '')} />
            <Field label="Purpose" value={String(body.purpose ?? '')} />
            <Field label="Example" value={String(body.example ?? '')} />
            <Field label="Notes" value={String(body.notes ?? '')} />
            <ListField label="Indicators" items={(body.indicators as string[]) ?? undefined} />
          </>
        )}

        {category === 'browser' && (
          <>
            <Field label="Browser" value={String(body.browser ?? '')} />
            <Field label="Artifact" value={String(body.artifact ?? '')} />
            <Field label="Location" value={String(body.path ?? '')} />
            <Field label="Evidence" value={String(body.evidence ?? '')} />
            <Field label="Tools" value={String(body.tools ?? '')} />
            <Field label="Notes" value={String(body.note ?? '')} />
          </>
        )}

        {isEvidence && (
          <>
            <Field label="Phase" value={String(body.phase ?? '')} />
            <Field label="Description" value={String(body.name ?? '')} />
            <ListField label="Steps" items={(body.steps as string[]) ?? undefined} />
            <Field label="Tools" value={String(body.tools ?? '')} />
            <Field label="Notes" value={String(body.notes ?? '')} />
          </>
        )}

        <div className="text-micro text-slate-500 dark:text-slate-500 pt-2 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Authored reference data — verify against vendor documentation before use in production IR.
        </div>
      </div>
    </Modal>
  );
}

export default function DfirRef() {
  const { data: index, loading, error } = useDataFetch<DfirRefIndex>({ url: '/api/v1/dfir-ref/', ttl: 120_000 });
  const { data: listData, loading: listLoading } = useDataFetch<{ items: DfirRefIndex['itemIndex']; total: number }>({
    url: '/api/v1/dfir-ref/items?limit=200',
    ttl: 120_000,
  });

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [detailSlug, setDetailSlug] = useState<string | null>(null);

  const { data: detailBody } = useDataFetch<DfirRefBody>({
    url: detailSlug ? `/api/v1/dfir-ref/items/${detailSlug}` : null,
    ttl: 300_000,
  });

  const filtered = useMemo(() => {
    if (!listData?.items) return [];
    let items = listData.items;
    if (selectedCategory) items = items.filter((i) => i.category === selectedCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((i) => `${i.name} ${i.id} ${i.categoryLabel} ${i.tags.join(' ')}`.toLowerCase().includes(q));
    }
    return items;
  }, [listData, selectedCategory, search]);

  const catCount = (key: string) => index?.itemIndex.filter((i) => i.category === key).length ?? 0;

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="DFIR"
      icon={<BookOpen />}
      title="DFIR Reference"
      description={
        <span>
          Practitioner reference for incident response — {index?.counts.eventIds ?? 60} Windows Event IDs,{' '}
          {index?.counts.memoryCommands ?? 45} memory-forensics commands, browser artifact locations, and a{` `}
          {index?.counts.evidencePhases ?? 10}-phase evidence collection & chain-of-custody checklist.
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
              placeholder="Search event IDs, plugins, artifacts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-9 py-2 rounded-xl text-sm bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            {filtered.length} / {listData?.total ?? 0} items
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
            All Sections
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
              {cat.name} <span className="opacity-60 ml-0.5">({catCount(cat.key)})</span>
            </button>
          ))}
        </div>

        {listLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <div className="w-6 h-6 border-2 border-slate-300 dark:border-slate-600 border-t-brand-500 rounded-full animate-spin mr-3" />
            Loading reference...
          </div>
        ) : filtered.length === 0 ? (
          <div className={`${CARD} p-12 text-center`}>
            <FileJson size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No reference items match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((item) => (
              <button
                key={item.slug}
                onClick={() => setDetailSlug(item.slug)}
                className={`${CARD} text-left p-4 transition-colors hover:border-brand-400 dark:hover:border-brand-600 group`}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <span
                    className={`font-mono text-micro font-bold px-1.5 py-0.5 rounded border ${CATEGORY_TONE[item.category] ?? ''}`}
                  >
                    {CATEGORY_ICONS[item.category]} {item.categoryLabel}
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white mb-2 leading-snug">
                  {item.name}
                </div>
                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.tags.slice(0, 4).map((t, i) => (
                      <span
                        key={i}
                        className="font-mono text-micro text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded"
                      >
                        {t}
                      </span>
                    ))}
                    {item.tags.length > 4 && (
                      <span className="font-mono text-micro text-slate-500 dark:text-slate-400">
                        +{item.tags.length - 4}
                      </span>
                    )}
                  </div>
                )}
                {item.mitre && (
                  <div className="mt-2 font-mono text-micro text-orange-600 dark:text-orange-400/70">
                    MITRE {item.mitre}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="text-center pt-6 pb-2 text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Authored in-repo reference data — event IDs, Volatility plugins, browser artifact locations and evidence
          collection phases for day-to-day IR. Cross-check against vendor docs before triage decisions.
        </div>
      </div>

      {detailBody && <DfirRefDetail body={detailBody} onClose={() => setDetailSlug(null)} />}
    </DataPageLayout>
  );
}
