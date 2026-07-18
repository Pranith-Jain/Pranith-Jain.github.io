import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Crosshair,
  ExternalLink,
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
  listTools,
  kgCluster,
  kgTimeline,
  listStixBundles,
  sanitizeKey,
  idForReport,
  getReportDetailsFlexible,
  getReportContent,
  type McpToolDef,
  type KgClusterResult,
  type KgTimelineResult,
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
  type ReportDetailsResult,
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
  const [tools, setTools] = useState<McpToolDef[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<KgEntity | null>(null);
  const [entityCluster, setEntityCluster] = useState<KgClusterResult | null>(null);
  const [entityTimeline, setEntityTimeline] = useState<KgTimelineResult | null>(null);
  const [entityDetailBusy, setEntityDetailBusy] = useState(false);
  const [selectedReport, setSelectedReport] = useState<TiReportSummary | null>(null);
  const [reportDetail, setReportDetail] = useState<ReportDetailsResult | null>(null);
  const [reportDetailBusy, setReportDetailBusy] = useState(false);
  const [reportContent, setReportContent] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Discover tools after connecting
  useEffect(() => {
    if (status === 'connected' && apiKey && tools.length === 0 && !toolsLoading) {
      setToolsLoading(true);
      listTools(apiKey)
        .then((t) => {
          setTools(t);
          setToolsLoading(false);
        })
        .catch(() => setToolsLoading(false));
    }
  }, [status, apiKey, tools.length, toolsLoading]);

  const toolsByCategory = useMemo(() => {
    const map: Record<string, McpToolDef[]> = {};
    const catOrder = ['reports', 'cves', 'iocs', 'briefings', 'stix', 'knowledge', 'platform'];
    const catNames: Record<string, string> = {
      reports: 'Reports',
      cves: 'CVE Intel',
      iocs: 'IOC Search',
      briefings: 'Briefings',
      stix: 'STIX Bundles',
      knowledge: 'Knowledge Graph',
      platform: 'Platform',
    };
    const nameToCat: Record<string, string> = {
      list_reports: 'reports',
      get_report_details: 'reports',
      get_report_content: 'reports',
      get_available_sources: 'reports',
      get_available_tags: 'reports',
      get_latest_briefing: 'briefings',
      list_briefings: 'briefings',
      get_briefing_by_date: 'briefings',
      search_ioc: 'iocs',
      search_cve: 'cves',
      search_cves_by_keyword: 'cves',
      list_cves: 'cves',
      get_cves_by_article: 'cves',
      get_cve_statistics: 'cves',
      get_stix_bundle: 'stix',
      list_stix_bundles: 'stix',
      get_stix_statistics: 'stix',
      get_statistics: 'platform',
      submit_article: 'platform',
      kg_stats: 'knowledge',
      kg_search: 'knowledge',
      kg_cluster: 'knowledge',
      kg_timeline: 'knowledge',
      kg_attack_path: 'knowledge',
      kg_cross_report: 'knowledge',
    };
    for (const t of tools) {
      const cat = nameToCat[t.name] ?? 'platform';
      if (!map[cat]) map[cat] = [];
      map[cat].push(t);
    }
    return catOrder.filter((c) => map[c]?.length).map((c) => ({ id: c, name: catNames[c] ?? c, tools: map[c]! }));
  }, [tools]);

  async function drillEntity(entity: KgEntity): Promise<void> {
    if (!apiKey) return;
    setSelectedEntity(entity);
    setEntityCluster(null);
    setEntityTimeline(null);
    setEntityDetailBusy(true);
    try {
      const [cluster, timeline] = await Promise.allSettled([
        kgCluster(apiKey, entity.canon_id, { depth: 1 }),
        kgTimeline(apiKey, entity.canon_id),
      ]);
      if (cluster.status === 'fulfilled') setEntityCluster(cluster.value);
      if (timeline.status === 'fulfilled') setEntityTimeline(timeline.value);
    } catch {
      /* ignore */
    }
    setEntityDetailBusy(false);
  }

  async function openReport(r: TiReportSummary): Promise<void> {
    if (!apiKey) return;
    const rid = idForReport(r);
    if (!rid) return;
    if (selectedReport === r) {
      setSelectedReport(null);
      setReportDetail(null);
      setReportContent(null);
      return;
    }
    setSelectedReport(r);
    setReportDetail(null);
    setReportContent(null);
    setReportDetailBusy(true);
    try {
      const detail = await getReportDetailsFlexible(apiKey, rid);
      setReportDetail(detail);
      try {
        const content = await getReportContent(apiKey, rid, 'summary');
        setReportContent(typeof content === 'string' ? content : null);
      } catch {
        // summary content may not be available for all reports
      }
    } catch (e) {
      // details fetch failed
    }
    setReportDetailBusy(false);
  }

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
    <div className="surface-card">
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

      {/* Tool Explorer (dynamic via tools/list) */}
      {tools.length > 0 && !hasResults && !err && (
        <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
          <div className="px-4 py-2 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
            <p className="text-micro font-mono uppercase tracking-wider text-slate-500">
              Discovered Tools · {tools.length} via MCP tools/list
            </p>
          </div>
          {toolsByCategory.map((cat) => (
            <div
              key={cat.id}
              className="border-b border-slate-200 dark:border-[rgb(var(--border-400))] last:border-b-0"
            >
              <div className="flex items-center gap-2 px-4 py-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{cat.name}</span>
                <span className="text-micro font-mono text-slate-500">{cat.tools.length}</span>
              </div>
              <div className="px-4 pb-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {cat.tools.map((t) => (
                  <div key={t.name} className="rounded px-2 py-1 bg-slate-50 dark:bg-[rgb(var(--input-200))]">
                    <p className="text-[11px] font-mono font-medium text-slate-800 dark:text-slate-200">{t.name}</p>
                    {t.description && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2">{t.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {toolsLoading && !hasResults && (
        <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] p-4 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Discovering available tools…
        </div>
      )}

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
                <ReportRow
                  key={idForReport(r) || r.title || ''}
                  r={r}
                  selected={selectedReport === r}
                  detail={selectedReport === r ? reportDetail : null}
                  detailBusy={selectedReport === r && reportDetailBusy}
                  content={selectedReport === r ? reportContent : null}
                  onSelect={() => openReport(r)}
                />
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
                <KgEntityRow key={e.canon_id || i} entity={e} onDrill={drillEntity} />
              ))}
            </Section>
          ) : null}
          {selectedEntity && (entityCluster || entityTimeline) && (
            <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] p-4">
              <div className="flex items-center gap-2 mb-2">
                <Map className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{selectedEntity.name}</span>
                <span className="text-[10px] font-mono text-slate-500">{selectedEntity.entity_type}</span>
                <button
                  onClick={() => {
                    setSelectedEntity(null);
                    setEntityCluster(null);
                    setEntityTimeline(null);
                  }}
                  className="ml-auto p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              {entityCluster?.entities != null && entityCluster.entities.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] font-mono uppercase text-slate-500 mb-1">
                    Local Graph — {entityCluster.entities.length} entities
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {entityCluster.entities.slice(0, 8).map((e) => (
                      <span
                        key={e.canon_id}
                        className="rounded border border-slate-300 dark:border-[rgb(var(--border-400))] px-1.5 py-0.5 text-[10px]"
                      >
                        <span className="font-mono text-slate-500">{e.entity_type}</span>{' '}
                        <span className="text-slate-800 dark:text-slate-200">{e.name}</span>
                      </span>
                    ))}
                    {entityCluster.entities.length > 8 && (
                      <span className="text-[10px] text-slate-500">+{entityCluster.entities.length - 8} more</span>
                    )}
                  </div>
                </div>
              )}
              {entityTimeline?.timeline?.length ? (
                <div>
                  <p className="text-[10px] font-mono uppercase text-slate-500 mb-1">Timeline</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {entityTimeline.timeline.slice(0, 6).map((entry, i) => (
                      <div key={i} className="text-[11px] text-slate-600 dark:text-slate-400">
                        <span className="font-mono text-slate-500">{entry.date ?? '?'}</span> {entry.title}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
          {entityDetailBusy && (
            <div className="border-t border-slate-200 dark:border-[rgb(var(--border-400))] p-3 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading entity details…
            </div>
          )}
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

function ReportRow({
  r,
  selected,
  detail,
  detailBusy,
  content,
  onSelect,
}: {
  r: TiReportSummary;
  selected: boolean;
  detail: ReportDetailsResult | null;
  detailBusy: boolean;
  content: string | null;
  onSelect: () => void;
}): JSX.Element {
  return (
    <div
      onClick={onSelect}
      className={`rounded border cursor-pointer px-2.5 py-1.5 transition-colors ${
        selected
          ? 'border-brand-400 dark:border-brand-600 bg-brand-50/60 dark:bg-brand-950/20'
          : 'border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-400/50'
      }`}
    >
      <p className="text-xs font-medium text-slate-800 dark:text-slate-200 line-clamp-2">{r.title || '-'}</p>
      <p className="mt-0.5 text-[10px] font-mono uppercase text-slate-500">
        {r.source ?? '?'}
        {r.published_at ? ` · ${r.published_at}` : ''}
        {r.actor && <span className="ml-2 text-rose-600 dark:text-rose-400">actor: {r.actor}</span>}
        {r.cves?.length ? <span className="ml-2 text-amber-600">cve: {r.cves.slice(0, 3).join(', ')}</span> : null}
        {r.ioc_count ? <span className="ml-2 text-cyan-600">{r.ioc_count} IOCs</span> : null}
        {r.ttp_count ? <span className="ml-2 text-violet-600">{r.ttp_count} TTPs</span> : null}
      </p>

      {selected && detailBusy && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading details...
        </div>
      )}

      {selected && detail && (
        <div className="mt-2 space-y-2 border-t border-slate-200 dark:border-[rgb(var(--border-400))] pt-2">
          {detail.summary && (
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{detail.summary}</p>
          )}

          {content && (
            <div className="rounded bg-slate-50 dark:bg-[rgb(var(--surface-300)/0.5)] p-2 max-h-40 overflow-y-auto">
              <pre className="text-[10px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap font-sans leading-relaxed">
                {content}
              </pre>
            </div>
          )}

          {detail.iocs?.length ? (
            <div>
              <p className="text-[10px] font-mono uppercase text-slate-500 mb-0.5">IOCs</p>
              <div className="flex flex-wrap gap-1">
                {detail.iocs.slice(0, 10).map((ioc, i) => (
                  <span
                    key={i}
                    className="rounded bg-rose-100 dark:bg-rose-950/30 px-1 py-0.5 text-[10px] font-mono text-rose-700 dark:text-rose-300"
                  >
                    {ioc.value}
                  </span>
                ))}
                {detail.iocs.length > 10 && (
                  <span className="text-[10px] text-slate-500">+{detail.iocs.length - 10} more</span>
                )}
              </div>
            </div>
          ) : null}

          {detail.ttps?.length ? (
            <div>
              <p className="text-[10px] font-mono uppercase text-slate-500 mb-0.5">TTPs</p>
              <div className="flex flex-wrap gap-1">
                {detail.ttps.slice(0, 6).map((ttp, i) => (
                  <span
                    key={i}
                    className="rounded bg-violet-100 dark:bg-violet-950/30 px-1 py-0.5 text-[10px] font-mono text-violet-700 dark:text-violet-300"
                  >
                    {ttp.name ?? ttp.id}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {detail.cves?.length ? (
            <div>
              <p className="text-[10px] font-mono uppercase text-slate-500 mb-0.5">CVEs</p>
              <div className="flex flex-wrap gap-1">
                {detail.cves.slice(0, 5).map((cve, i) => (
                  <span
                    key={i}
                    className="rounded bg-orange-100 dark:bg-orange-950/30 px-1 py-0.5 text-[10px] font-mono text-orange-700 dark:text-orange-300"
                  >
                    {cve}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {detail.malware?.length ? (
            <div>
              <p className="text-[10px] font-mono uppercase text-slate-500 mb-0.5">Malware</p>
              <div className="flex flex-wrap gap-1">
                {detail.malware.map((m, i) => (
                  <span
                    key={i}
                    className="rounded bg-emerald-100 dark:bg-emerald-950/30 px-1 py-0.5 text-[10px] font-mono text-emerald-700 dark:text-emerald-300"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2 pt-1">
            {detail.url && (
              <a
                href={detail.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-brand-600 dark:text-brand-400 hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> View on TI-Mindmap-Hub
              </a>
            )}
            {detail.severity && (
              <span className="text-[10px] font-mono text-slate-500">severity: {detail.severity}</span>
            )}
            {typeof detail.cvss === 'number' && (
              <span className="text-[10px] font-mono text-slate-500">CVSS {detail.cvss.toFixed(1)}</span>
            )}
          </div>
        </div>
      )}
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

function KgEntityRow({ entity, onDrill }: { entity: KgEntity; onDrill?: (e: KgEntity) => void }): JSX.Element {
  return (
    <div
      className={`rounded border border-slate-200 dark:border-[rgb(var(--border-400))] px-2.5 py-1.5 ${onDrill ? 'cursor-pointer hover:border-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-950/20' : ''}`}
      onClick={() => onDrill?.(entity)}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{entity.name}</span>
        <span className="text-[10px] font-mono text-slate-500">{entity.entity_type}</span>
        {onDrill && <span className="ml-auto text-[10px] text-brand-600 dark:text-brand-400">drill →</span>}
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
