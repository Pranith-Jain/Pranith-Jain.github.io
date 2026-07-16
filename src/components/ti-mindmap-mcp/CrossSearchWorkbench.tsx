import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Crosshair,
  FileText,
  Layers,
  Loader2,
  Map,
  Search,
  Shield,
  X,
} from 'lucide-react';
import { useMcp, McpError } from './McpContext';
import {
  searchIoc,
  searchCve,
  listReports,
  listBriefings,
  searchCvesByKeyword,
  kgSearch,
  listStixBundles,
  sanitizeKey,
  idForReport,
  type TiReportSummary,
  type IocSearchResult,
  type CveSearchResult,
  type ListReportsResult,
  type BriefingSummary,
  type CveSummary,
  type CveListResult,
  type KgSearchResult,
  type KgEntity,
  type StixBundleSummary,
  type StixBundleListResult,
} from '../../lib/ti-mindmap-mcp';

interface CrossSearchResult {
  reports?: ListReportsResult;
  cves?: CveListResult;
  cveDetail?: CveSearchResult;
  ioc?: IocSearchResult;
  kg?: KgSearchResult;
  briefings?: BriefingSummary[];
  latestBriefing?: BriefingSummary | null;
  stix?: StixBundleListResult;
}

const CAT_COLORS: Record<string, string> = {
  reports: 'text-blue-600 dark:text-blue-400',
  cves: 'text-orange-600 dark:text-orange-400',
  iocs: 'text-rose-600 dark:text-rose-400',
  briefings: 'text-purple-600 dark:text-purple-400',
  stix: 'text-emerald-600 dark:text-emerald-400',
  knowledge: 'text-cyan-600 dark:text-cyan-400',
  stats: 'text-slate-600 dark:text-slate-400',
};

function guessMode(query: string): 'ioc' | 'cve' | 'general' {
  const q = query.trim();
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(q)) return 'ioc';
  if (/^[a-f0-9]{32}$|^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(q)) return 'ioc';
  if (/^(cve|CVE)-\d{4}-\d{4,}$/.test(q)) return 'cve';
  if (/^https?:\/\//.test(q)) return 'ioc';
  if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.[a-z]{2,}/i.test(q)) return 'ioc';
  return 'general';
}

const MODE_LABEL: Record<string, string> = { ioc: 'IOC mode', cve: 'CVE mode', general: 'Cross-search mode' };

export function CrossSearchWorkbench(props: { showHeader?: boolean }): JSX.Element {
  const { apiKey, status, saveKey } = useMcp();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CrossSearchResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['reports', 'cves']));
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const mode = useMemo(() => guessMode(q), [q]);

  const toggleSection = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const run = useCallback(
    async (queryArg?: string) => {
      if (status !== 'connected' || !apiKey) return;
      const query = (queryArg ?? q).trim();
      if (!query) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setQ(query);
      setBusy(true);
      setErr(null);
      setResult(null);

      const m = guessMode(query);
      const calls: Array<[string, Promise<unknown>]> = [];

      if (m === 'ioc') {
        calls.push(['ioc', searchIoc(apiKey, query)]);
      } else if (m === 'cve') {
        calls.push(['cve', searchCve(apiKey, query.toUpperCase())]);
      } else {
        calls.push(['reports', listReports(apiKey, { search: query, limit: 8 })]);
        calls.push(['cves', searchCvesByKeyword(apiKey, query, 8)]);
        calls.push(['kg', kgSearch(apiKey, query, { limit: 6 })]);
        calls.push(['briefings', listBriefings(apiKey, 3)]);
        calls.push(['stix', listStixBundles(apiKey, { limit: 3 })]);
      }

      try {
        const settled = await Promise.allSettled(calls.map(([, p]) => p));
        const res: CrossSearchResult = {};
        for (let i = 0; i < calls.length; i++) {
          const [key] = calls[i]!;
          const s = settled[i]!;
          if (s.status === 'fulfilled') {
            (res as Record<string, unknown>)[key] = s.value;
          }
        }
        if (!ctrl.signal.aborted) {
          setResult(res);
        }
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setErr(e instanceof McpError ? e.message : e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!ctrl.signal.aborted) setBusy(false);
      }
    },
    [apiKey, status, q]
  );

  function handleSaveKey() {
    const { key: clean } = sanitizeKey(keyInput);
    if (clean) {
      saveKey(clean);
      setShowKeyInput(false);
      setKeyInput('');
    }
  }

  const disabled = status !== 'connected' || busy || !q.trim();

  const hasResults =
    result &&
    (result.reports?.reports?.length ||
      result.cves?.cves?.length ||
      result.kg?.entities?.length ||
      result.ioc ||
      result.cveDetail ||
      result.briefings?.length ||
      result.stix?.bundles?.length);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1">
      <div className="p-4">
        {props.showHeader !== false && (
          <div className="flex items-center gap-2 mb-3">
            <Search className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">TI-Mindmap-Hub Search</h3>
            <span className="ml-auto text-micro font-mono uppercase text-slate-500">25 tools</span>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <div className="flex-1 relative">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search reports, CVEs, IOCs, actors, malware…"
              className="w-full rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] pl-8 pr-2.5 py-1.5 font-mono text-sm text-slate-800 dark:text-slate-200"
              autoComplete="off"
              spellCheck={false}
            />
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          </div>
          <button
            type="submit"
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded border border-brand-300 dark:border-brand-700 bg-brand-600 dark:bg-brand-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Search
          </button>
          {(result || err) && (
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setErr(null);
                setQ('');
              }}
              className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300"
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </form>

        {q && (
          <p className="mt-1.5 text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400">
            {MODE_LABEL[mode]} — fires {mode === 'general' ? '5 parallel' : '1'} tool call
            {mode === 'general' ? 's' : ''}
          </p>
        )}

        {status === 'unconfigured' && !showKeyInput && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">Add your TI-Mindmap-Hub API key:</p>
            <button
              onClick={() => setShowKeyInput(true)}
              className="rounded border border-brand-300 bg-brand-50 dark:bg-brand-950/40 px-2.5 py-1 text-xs font-medium text-brand-700 dark:text-brand-300 hover:bg-brand-100"
            >
              + Add Key
            </button>
          </div>
        )}
        {showKeyInput && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="tim_your_api_key"
              className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--input-200))] px-2.5 py-1 font-mono text-xs flex-1 min-w-[12rem]"
            />
            <button
              onClick={handleSaveKey}
              className="rounded bg-brand-600 dark:bg-brand-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700"
            >
              Save
            </button>
            <button onClick={() => setShowKeyInput(false)} className="text-xs text-slate-500 hover:text-slate-700">
              Cancel
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="mt-3 flex items-start gap-2 rounded border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">MCP connection error</p>
              <p className="mt-0.5 text-[11px] break-words">Add a valid API key above or re-enter your key.</p>
            </div>
          </div>
        )}

        {err && (
          <div className="mt-3 rounded border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-2.5 text-xs text-rose-700 dark:text-rose-300">
            <AlertTriangle className="inline h-3.5 w-3.5 mr-1" /> {err}
          </div>
        )}
      </div>

      {/* Results */}
      {hasResults && (
        <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          {result!.reports?.reports?.length ? (
            <Section
              icon={FileText}
              title="Reports"
              count={result!.reports.reports.length}
              cat="reports"
              expanded={expanded}
              onToggle={toggleSection}
            >
              {result!.reports.reports.map((r) => (
                <ReportRow key={idForReport(r) || r.title || ''} r={r} />
              ))}
            </Section>
          ) : null}
          {result!.cves?.cves?.length ? (
            <Section
              icon={Shield}
              title="CVEs"
              count={result!.cves.cves.length}
              cat="cves"
              expanded={expanded}
              onToggle={toggleSection}
            >
              {result!.cves.cves.map((c, i) => (
                <CveRow key={c.cve_id || i} cve={c} />
              ))}
            </Section>
          ) : null}
          {result!.cveDetail ? (
            <Section icon={Shield} title="CVE Detail" count={1} cat="cves" expanded={expanded} onToggle={toggleSection}>
              <CveDetailRow hit={result!.cveDetail} />
            </Section>
          ) : null}
          {result!.ioc ? (
            <Section
              icon={Crosshair}
              title="IOC Search"
              count={1}
              cat="iocs"
              expanded={expanded}
              onToggle={toggleSection}
            >
              <IocRow hit={result!.ioc} />
            </Section>
          ) : null}
          {result!.kg?.entities?.length ? (
            <Section
              icon={Map}
              title="Knowledge Graph"
              count={result!.kg.entities.length}
              cat="knowledge"
              expanded={expanded}
              onToggle={toggleSection}
            >
              {result!.kg.entities.map((e, i) => (
                <KgEntityRow key={e.canon_id || i} entity={e} />
              ))}
            </Section>
          ) : null}
          {result!.latestBriefing ? (
            <Section
              icon={BookOpen}
              title="Latest Briefing"
              count={1}
              cat="briefings"
              expanded={expanded}
              onToggle={toggleSection}
            >
              <BriefingRow hit={result!.latestBriefing} />
            </Section>
          ) : null}
          {result!.briefings?.length ? (
            <Section
              icon={BookOpen}
              title="Briefings"
              count={result!.briefings.length}
              cat="briefings"
              expanded={expanded}
              onToggle={toggleSection}
            >
              {result!.briefings.map((b, i) => (
                <BriefingRow key={b.briefing_id || i} hit={b} />
              ))}
            </Section>
          ) : null}
          {result!.stix?.bundles?.length ? (
            <Section
              icon={Layers}
              title="STIX Bundles"
              count={result!.stix.bundles.length}
              cat="stix"
              expanded={expanded}
              onToggle={toggleSection}
            >
              {result!.stix.bundles.map((b, i) => (
                <StixRow key={b.article_id || i} bundle={b} />
              ))}
            </Section>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────

function Section(props: {
  icon: typeof FileText;
  title: string;
  count: number;
  cat: string;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}): JSX.Element {
  const Icon = props.icon;
  const isOpen = props.expanded.has(props.cat);
  return (
    <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] first:border-t-0">
      <button
        onClick={() => props.onToggle(props.cat)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-[rgb(var(--surface-300))]"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        )}
        <Icon className={`h-4 w-4 ${CAT_COLORS[props.cat] ?? 'text-slate-500'}`} />
        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{props.title}</span>
        <span className="text-micro font-mono text-slate-500 dark:text-slate-400">{props.count}</span>
      </button>
      {isOpen && <div className="px-4 pb-3 space-y-1.5">{props.children}</div>}
    </div>
  );
}

// ── Row components ─────────────────────────────────────────────────

function ReportRow({ r }: { r: TiReportSummary }): JSX.Element {
  return (
    <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] px-2.5 py-1.5">
      <p className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-2">{r.title || '-'}</p>
      <p className="mt-0.5 text-[10px] font-mono uppercase text-slate-500">
        {r.source ?? '?'}
        {r.published_at ? ` · ${r.published_at}` : ''}
        {r.actor && <span className="ml-2 text-rose-600 dark:text-rose-400">actor: {r.actor}</span>}
        {r.cves?.length ? <span className="ml-2 text-amber-600">cve: {r.cves.slice(0, 3).join(', ')}</span> : null}
        {r.ioc_count ? <span className="ml-2 text-cyan-600">{r.ioc_count} IOCs</span> : null}
        {r.ttp_count ? <span className="ml-2 text-violet-600">{r.ttp_count} TTPs</span> : null}
      </p>
    </div>
  );
}

function CveRow({ cve }: { cve: CveSummary }): JSX.Element {
  return (
    <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200">{cve.cve_id}</span>
        {cve.severity && <SeverityBadge severity={cve.severity} />}
        {typeof cve.cvss_score === 'number' && (
          <span className="text-[10px] font-mono text-slate-500">CVSS {cve.cvss_score.toFixed(1)}</span>
        )}
        {cve.exploited && <span className="text-[10px] font-mono text-rose-600 dark:text-rose-400">KEV</span>}
      </div>
      {cve.description && (
        <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">{cve.description}</p>
      )}
    </div>
  );
}

function CveDetailRow({ hit }: { hit: CveSearchResult }): JSX.Element {
  return (
    <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200">{hit.cve_id}</span>
        {hit.severity && <SeverityBadge severity={hit.severity} />}
        {typeof hit.cvss_score === 'number' && (
          <span className="text-[10px] font-mono">CVSS {hit.cvss_score.toFixed(1)}</span>
        )}
        {typeof hit.epss_score === 'number' && (
          <span className="text-[10px] font-mono text-slate-500">EPSS {(hit.epss_score * 100).toFixed(1)}%</span>
        )}
        {hit.exploited && <span className="text-[10px] text-rose-600 dark:text-rose-400 font-mono">KEV</span>}
      </div>
      {hit.description && (
        <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400 line-clamp-3">{hit.description}</p>
      )}
      {hit.affected_products?.length ? (
        <p className="mt-0.5 text-[10px] font-mono text-slate-500">
          affected: {hit.affected_products.slice(0, 4).join(', ')}
        </p>
      ) : null}
      {hit.references?.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {hit.references.slice(0, 2).map((ref, i) => (
            <a
              key={i}
              href={ref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline truncate max-w-[16rem]"
            >
              {ref}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function IocRow({ hit }: { hit: IocSearchResult }): JSX.Element {
  const reports = hit.reports ?? [];
  return (
    <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200">{hit.ioc_value}</span>
        {hit.ioc_type && <span className="text-[10px] font-mono text-slate-500">{hit.ioc_type}</span>}
        <span className="text-[10px] font-mono text-slate-500">{reports.length} reports</span>
        {hit.last_seen && <span className="text-[10px] text-slate-500">last {hit.last_seen}</span>}
      </div>
      {reports.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {reports.slice(0, 4).map((r) => (
            <li key={idForReport(r)} className="text-[10px] text-slate-600 dark:text-slate-400 truncate">
              {r.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KgEntityRow({ entity }: { entity: KgEntity }): JSX.Element {
  return (
    <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{entity.name}</span>
        <span className="text-[10px] font-mono text-slate-500">{entity.entity_type}</span>
      </div>
      {entity.description && (
        <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">{entity.description}</p>
      )}
      {entity.aliases?.length ? (
        <p className="mt-0.5 text-[10px] font-mono text-slate-500">aliases: {entity.aliases.slice(0, 4).join(', ')}</p>
      ) : null}
    </div>
  );
}

function BriefingRow({ hit }: { hit: BriefingSummary }): JSX.Element {
  return (
    <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] px-2.5 py-1.5">
      <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{hit.title ?? hit.briefing_id}</p>
      <p className="text-[10px] font-mono text-slate-500">
        {hit.type ?? 'briefing'}
        {hit.date ? ` · ${hit.date}` : ''}
      </p>
      {hit.summary && (
        <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2">{hit.summary}</p>
      )}
    </div>
  );
}

function StixRow({ bundle }: { bundle: StixBundleSummary }): JSX.Element {
  return (
    <div className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] px-2.5 py-1.5">
      <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{bundle.title ?? bundle.article_id}</p>
      <p className="text-[10px] font-mono text-slate-500">
        {bundle.stix_size ? `${bundle.stix_size} objects` : ''}
        {bundle.created_at ? ` · ${bundle.created_at}` : ''}
      </p>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }): JSX.Element {
  const s = severity.toLowerCase();
  const cls =
    s === 'critical'
      ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
      : s === 'high'
        ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-800'
        : s === 'medium'
          ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
          : 'bg-slate-100 dark:bg-slate-950/40 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700';
  return <span className={`rounded px-1 py-0.5 text-[10px] font-mono border ${cls}`}>{severity}</span>;
}
