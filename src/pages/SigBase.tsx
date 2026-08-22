import { useState, useMemo } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Modal } from '../components/ui/Modal';
import { ShieldAlert, Search, ExternalLink, FileJson, Hash } from 'lucide-react';

interface SigBaseIndex {
  source: string;
  license: string;
  replicatedAt: string;
  counts: {
    yaraFiles: number;
    yaraRules: number;
    iocFiles: number;
    iocEntries: number;
    externalVarFiles: number;
  };
}

interface YaraEntry {
  slug: string;
  filename: string;
  identifier: string | null;
  ruleCount: number;
  tags: string[];
  author: string | null;
  date: string | null;
  score: number | null;
  externalVars: boolean;
}

interface YaraRule {
  name: string;
  meta: Record<string, string>;
}

interface YaraBody extends YaraEntry {
  source: string;
  license: string;
  headerComment: string;
  rules: YaraRule[];
  body: string;
}

interface IocEntry {
  slug: string;
  title: string;
  type: string;
  entryCount: number;
}

const CARD = 'surface-card';

const TAG_COLORS: Record<string, string> = {
  apt: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800',
  malware: 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800',
  expl: 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800',
  gen: 'text-brand-700 dark:text-brand-300 bg-blue-50 dark:bg-blue-950/40 border-brand-300 dark:border-blue-800',
  thr: 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 border-purple-300 dark:border-purple-800',
  cve: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800',
  webshell: 'text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800',
  yara_mixed:
    'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800',
  vuln: 'text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950/40 border-yellow-300 dark:border-yellow-800',
};

function tagColor(tag: string): string {
  return TAG_COLORS[tag] ?? 'text-muted bg-slate-50 dark:bg-slate-950/40 border-slate-300 dark:border-slate-700';
}

function RuleDetail({ body, onClose }: { body: YaraBody; onClose: () => void }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const copyYara = async () => {
    await navigator.clipboard.writeText(body.body);
    setCopyState('copied');
    setTimeout(() => setCopyState('idle'), 2000);
  };
  return (
    <Modal open onClose={onClose} title={body.filename} size="lg">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2">
          {(body.tags ?? []).map((t) => (
            <span key={t} className={`font-mono text-micro font-bold px-2 py-0.5 rounded border ${tagColor(t)}`}>
              {t}
            </span>
          ))}
          {body.externalVars && (
            <span className="font-mono text-micro font-bold px-2 py-0.5 rounded border text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800">
              needs LOKI/THOR external vars
            </span>
          )}
          {body.score != null && (
            <span className="font-mono text-micro font-bold px-2 py-0.5 rounded border text-muted bg-slate-100 dark:bg-[rgb(var(--surface-200))] border-slate-200 dark:border-[rgb(var(--border-400))]">
              score {body.score}
            </span>
          )}
        </div>
        {body.author && (
          <p className="text-sm text-muted">
            by <span className="text-body">{body.author}</span>
            {body.date ? ` · ${body.date}` : ''}
          </p>
        )}
        <div className="space-y-2">
          {(body.rules ?? []).map((r) => (
            <div key={r.name} className="border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg p-3">
              <div className="font-mono text-xs font-semibold text-brand-600 dark:text-brand-400 mb-1">{r.name}</div>
              {r.meta.description && <p className="text-sm text-body leading-relaxed">{r.meta.description}</p>}
              {r.meta.reference && (
                <a
                  href={r.meta.reference}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline mt-1 transition-colors"
                >
                  {r.meta.reference.slice(0, 80)}
                  {r.meta.reference.length > 80 ? '…' : ''} <ExternalLink size={10} />
                </a>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={copyYara}
          className="w-full px-4 py-2 rounded-xl text-sm font-semibold bg-brand-600 dark:bg-brand-500 text-white hover:bg-brand-700 dark:hover:bg-brand-600 transition-colors"
        >
          {copyState === 'copied' ? 'Copied!' : `Copy full YARA source (${(body.body.length / 1024).toFixed(1)} KB)`}
        </button>
        <div>
          <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">YARA Source</div>
          <pre className="font-mono text-xs text-body bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg p-4 overflow-x-auto whitespace-pre-wrap break-all max-h-80 overflow-y-auto">
            {body.body}
          </pre>
        </div>
        <div className="text-micro text-slate-500 dark:text-slate-500 pt-2 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Data from{' '}
          <a
            href="https://github.com/Neo23x0/signature-base"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline transition-colors"
          >
            {body.source}
          </a>{' '}
          ({body.license})
        </div>
      </div>
    </Modal>
  );
}

export default function SigBase() {
  const { data: index, loading, error } = useDataFetch<SigBaseIndex>({ url: '/api/v1/sigbase/', ttl: 120_000 });
  const { data: rulesData, loading: rulesLoading } = useDataFetch<{ rules: YaraEntry[]; total: number }>({
    url: '/api/v1/sigbase/rules?limit=746',
    ttl: 120_000,
  });
  const { data: iocsData } = useDataFetch<{ lists: IocEntry[] }>({
    url: '/api/v1/sigbase/iocs',
    ttl: 120_000,
  });

  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [detailSlug, setDetailSlug] = useState<string | null>(null);

  const { data: detailBody } = useDataFetch<YaraBody>({
    url: detailSlug ? `/api/v1/sigbase/rules/${detailSlug}` : null,
    ttl: 300_000,
  });

  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rulesData?.rules ?? []) {
      for (const t of r.tags) m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [rulesData]);

  const filtered = useMemo(() => {
    if (!rulesData?.rules) return [];
    let rules = rulesData.rules;
    if (selectedTag) rules = rules.filter((r) => r.tags.includes(selectedTag));
    if (search.trim()) {
      const q = search.toLowerCase();
      rules = rules.filter((r) =>
        `${r.filename} ${r.identifier ?? ''} ${r.author ?? ''} ${r.tags.join(' ')} ${r.slug}`.toLowerCase().includes(q)
      );
    }
    return rules;
  }, [rulesData, selectedTag, search]);

  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="DFIR"
      icon={<ShieldAlert />}
      title="Signature-Base"
      description={
        <span>
          YARA rule set + IOC lists from{' '}
          <a
            href="https://github.com/Neo23x0/signature-base"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline transition-colors"
          >
            Neo23x0/signature-base
          </a>{' '}
          - the database behind LOKI and THOR Lite ({index?.counts.yaraFiles ?? 746} rule files,{' '}
          {index?.counts.yaraRules ?? 5784} rules, {index?.counts.iocEntries ?? 8962} IOC entries).
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
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search rules by filename, family, author..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-9 py-2 rounded-xl text-sm bg-slate-50 dark:bg-[rgb(var(--input-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] text-heading placeholder:text-slate-400 focus:outline-none focus:border-brand-500"
            />
          </div>
          <div className="text-xs text-muted font-mono">
            {filtered.length} / {rulesData?.total ?? 0} rule files
          </div>
        </div>

        {/* Tag filter chips */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedTag(null)}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
              !selectedTag
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-slate-400'
            }`}
          >
            All Tags
          </button>
          {tags.map(([tag, count]) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`font-mono text-micro font-bold px-2.5 py-1 rounded-full border transition-colors ${tagColor(tag)} ${
                selectedTag === tag ? 'ring-1 ring-brand-500' : ''
              }`}
            >
              {tag} ({count})
            </button>
          ))}
        </div>

        {/* IOC list strip */}
        {iocsData?.lists && (
          <div className="flex flex-wrap gap-2">
            {iocsData.lists.map((i) => (
              <a
                key={i.slug}
                href={`/api/v1/sigbase/iocs/${i.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${CARD} inline-flex items-center gap-2 px-3 py-2 text-xs hover:border-brand-400 dark:hover:border-brand-600 transition-colors`}
              >
                <Hash size={12} className="text-brand-500" />
                <span className="font-semibold text-body">{i.title}</span>
                <span className="text-muted font-mono">{i.entryCount.toLocaleString()} entries</span>
              </a>
            ))}
          </div>
        )}

        {/* Rule grid */}
        {rulesLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <div className="w-6 h-6 border-2 border-slate-300 dark:border-[rgb(var(--border-400))] border-t-brand-500 rounded-full animate-spin mr-3" />
            Loading rules...
          </div>
        ) : filtered.length === 0 ? (
          <div className={`${CARD} p-12 text-center`}>
            <FileJson size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-muted">No rules match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((r) => (
              <button
                key={r.slug}
                onClick={() => setDetailSlug(r.slug)}
                className={`${CARD} text-left p-4 transition-colors hover:border-brand-400 dark:hover:border-brand-600 group`}
              >
                <div className="text-sm font-semibold text-body group-hover:text-slate-900 dark:group-hover:text-white mb-2 leading-snug break-all font-mono">
                  {r.filename}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {r.tags.map((t) => (
                    <span
                      key={t}
                      className={`font-mono text-micro font-bold px-1.5 py-0.5 rounded border ${tagColor(t)}`}
                    >
                      {t}
                    </span>
                  ))}
                  {r.externalVars && (
                    <span className="font-mono text-micro font-bold px-1.5 py-0.5 rounded border text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40">
                      ext vars
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-micro text-muted">
                  <span>
                    {r.ruleCount} rule{r.ruleCount === 1 ? '' : 's'}
                  </span>
                  {r.author && <span className="truncate max-w-[55%]">{r.author.split(' (')[0]}</span>}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Source footer */}
        <div className="text-center pt-6 pb-2 text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          Data sourced from{' '}
          <a
            href="https://github.com/Neo23x0/signature-base"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline transition-colors"
          >
            Neo23x0/signature-base
          </a>{' '}
          - the signature database for{' '}
          <a
            href="https://github.com/Neo23x0/Loki"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline transition-colors"
          >
            LOKI
          </a>{' '}
          and THOR Lite ({index?.license ?? 'DRL 1.1'}).
          <br />
          Rules flagged "ext vars" need LOKI/THOR external variables and will error under plain YARA.
        </div>
      </div>

      {/* Detail modal */}
      {detailBody && <RuleDetail body={detailBody} onClose={() => setDetailSlug(null)} />}
    </DataPageLayout>
  );
}
