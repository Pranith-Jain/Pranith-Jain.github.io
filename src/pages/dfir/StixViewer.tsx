import { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import { FileJson, Trash2, Copy, Check, Filter, Globe2, Loader2, ExternalLink } from 'lucide-react';
import {
  type StixBundle,
  type StixObject,
  type StixObjectType,
  STIX_TYPE_COLOR,
  bundleStats,
  bundleToGraph,
} from '../../lib/dfir/stix-graph';
import { RelatedWikiArticles } from '../../components/dfir/RelatedWikiArticles';

// Lazy-loaded — @xyflow/react is ~133KB. Only mount once the user has a parsed
// bundle so the route's initial chunk stays slim.
const StixGraph = lazy(() => import('./StixGraph'));

// Minimal local type shapes. We deliberately do NOT `import type { Node, Edge }`
// from '@xyflow/react' — Rollup's module-graph pass registers even type-only
// static imports as edges, which then emits a `<link rel="modulepreload">` for
// vendor-xyflow on every page. The whole point of the lazy split was to keep
// that 178KB chunk off the entry path until a user actually visits /dfir/stix.
type FlowNode = { id: string; [k: string]: unknown };
type FlowEdge = { id: string; [k: string]: unknown };

const SAMPLE_BUNDLE: StixBundle = {
  type: 'bundle',
  id: 'bundle--demo-pranithjain',
  spec_version: '2.1',
  objects: [
    {
      type: 'threat-actor',
      id: 'threat-actor--apt-demo',
      name: 'APT Demo',
      labels: ['nation-state', 'espionage'],
      created: '2026-01-01T00:00:00Z',
      modified: '2026-05-01T00:00:00Z',
      description: 'Demo threat actor for portfolio walkthrough.',
    },
    {
      type: 'campaign',
      id: 'campaign--phish-wave-2026',
      name: 'Phish Wave 2026',
      description: 'Hypothetical phishing campaign targeting fintech inboxes.',
    },
    {
      type: 'malware',
      id: 'malware--demo-loader',
      name: 'DemoLoader',
      labels: ['loader', 'trojan'],
    },
    {
      type: 'attack-pattern',
      id: 'attack-pattern--T1566.001',
      name: 'Spearphishing Attachment',
      description: 'MITRE ATT&CK T1566.001',
    },
    {
      type: 'indicator',
      id: 'indicator--ip-1',
      name: 'C2 IP 198.51.100.7',
      pattern: "[ipv4-addr:value = '198.51.100.7']",
      labels: ['malicious-activity'],
    },
    {
      type: 'indicator',
      id: 'indicator--domain-1',
      name: 'phish-demo.example',
      pattern: "[domain-name:value = 'phish-demo.example']",
    },
    {
      type: 'vulnerability',
      id: 'vulnerability--cve-2026-99999',
      name: 'CVE-2026-99999',
      description: 'Hypothetical demo vulnerability used by the campaign.',
    },
    {
      type: 'tool',
      id: 'tool--cobalt-demo',
      name: 'CobaltDemoStrike',
    },
    {
      type: 'relationship',
      id: 'relationship--ta-uses-malware',
      source_ref: 'threat-actor--apt-demo',
      target_ref: 'malware--demo-loader',
      relationship_type: 'uses',
    },
    {
      type: 'relationship',
      id: 'relationship--ta-attributed-campaign',
      source_ref: 'campaign--phish-wave-2026',
      target_ref: 'threat-actor--apt-demo',
      relationship_type: 'attributed-to',
    },
    {
      type: 'relationship',
      id: 'relationship--campaign-uses-attack-pattern',
      source_ref: 'campaign--phish-wave-2026',
      target_ref: 'attack-pattern--T1566.001',
      relationship_type: 'uses',
    },
    {
      type: 'relationship',
      id: 'relationship--ind-indicates-campaign',
      source_ref: 'indicator--ip-1',
      target_ref: 'campaign--phish-wave-2026',
      relationship_type: 'indicates',
    },
    {
      type: 'relationship',
      id: 'relationship--ind-domain-indicates-malware',
      source_ref: 'indicator--domain-1',
      target_ref: 'malware--demo-loader',
      relationship_type: 'indicates',
    },
    {
      type: 'relationship',
      id: 'relationship--malware-targets-vuln',
      source_ref: 'malware--demo-loader',
      target_ref: 'vulnerability--cve-2026-99999',
      relationship_type: 'targets',
    },
    {
      type: 'relationship',
      id: 'relationship--ta-uses-tool',
      source_ref: 'threat-actor--apt-demo',
      target_ref: 'tool--cobalt-demo',
      relationship_type: 'uses',
    },
  ],
};

export default function StixViewer(): JSX.Element {
  const [input, setInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<StixObject | null>(null);
  const [copied, setCopied] = useState(false);
  const [stixId, setStixId] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchedFrom, setFetchedFrom] = useState<{ collection: string; attackId?: string } | null>(null);

  /**
   * Fetch a single STIX object by ID from the MITRE TAXII server. The
   * returned object is wrapped in a synthetic bundle so the existing
   * parse + graph pipeline lights up unchanged.
   */
  const fetchById = async () => {
    const id = stixId.trim();
    if (!id) return;
    setFetching(true);
    setFetchError(null);
    setFetchedFrom(null);
    try {
      const res = await fetch(`/api/v1/stix/fetch?id=${encodeURIComponent(id)}`);
      if (res.status === 404) throw new Error(`Not found in MITRE ATT&CK collections: ${id}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        found: boolean;
        object?: Record<string, unknown>;
        collection?: string;
        attack_id?: string;
      };
      if (!data.found || !data.object) throw new Error(`Not found: ${id}`);
      const synthetic = {
        type: 'bundle',
        id: `bundle--fetched-${id}`,
        spec_version: '2.1',
        objects: [data.object],
      };
      setInput(JSON.stringify(synthetic, null, 2));
      setSelected(null);
      setFilterTypes(new Set());
      setFetchedFrom({ collection: data.collection ?? 'unknown', attackId: data.attack_id });
    } catch (e) {
      setFetchError((e as Error).message);
    } finally {
      setFetching(false);
    }
  };

  const bundle = useMemo<StixBundle | null>(() => {
    if (!input.trim()) return null;
    try {
      const parsed = JSON.parse(input) as unknown;
      if (typeof parsed !== 'object' || parsed === null) throw new Error('Top-level must be an object');
      const obj = parsed as Record<string, unknown>;
      const objects = Array.isArray(obj.objects) ? (obj.objects as StixObject[]) : null;
      if (!objects) throw new Error('Bundle has no "objects" array');
      setParseError(null);
      return {
        type: typeof obj.type === 'string' ? obj.type : 'bundle',
        id: typeof obj.id === 'string' ? obj.id : undefined,
        spec_version: typeof obj.spec_version === 'string' ? obj.spec_version : undefined,
        objects,
      };
    } catch (e) {
      setParseError((e as Error).message);
      return null;
    }
  }, [input]);

  const stats = useMemo(() => (bundle ? bundleStats(bundle) : {}), [bundle]);
  const types = useMemo(() => Object.keys(stats).sort(), [stats]);

  const { nodes, edges } = useMemo(() => {
    if (!bundle) return { nodes: [] as FlowNode[], edges: [] as FlowEdge[] };
    const g = bundleToGraph(bundle, filterTypes);
    return { nodes: g.nodes as unknown as FlowNode[], edges: g.edges as unknown as FlowEdge[] };
  }, [bundle, filterTypes]);

  const onNodeClick = useCallback((_e: unknown, node: FlowNode) => {
    const raw = (node.data as { raw?: StixObject } | undefined)?.raw ?? null;
    setSelected(raw);
  }, []);

  const toggleType = (t: string) => {
    setFilterTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const loadSample = () => {
    setInput(JSON.stringify(SAMPLE_BUNDLE, null, 2));
    setSelected(null);
    setFilterTypes(new Set());
  };

  const clearAll = () => {
    setInput('');
    setSelected(null);
    setFilterTypes(new Set());
  };

  const copySelected = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">STIX Viewer</h1>
        <p className="text-muted mb-8 max-w-3xl">
          Paste a STIX 2.1 bundle and explore the relationship graph between threat actors, campaigns, malware, attack
          patterns, indicators, and more. Everything parses in your browser. Nothing is uploaded.
        </p>
      </div>

      <div className="grid lg:grid-cols-[400px_1fr] gap-6">
        {/* Left: input + filter + selected detail */}
        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Globe2 size={12} className="text-brand-600 dark:text-brand-400" />
              <label htmlFor="stix-id" className="text-xs font-mono uppercase tracking-wider text-slate-500">
                Fetch by STIX ID
              </label>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void fetchById();
              }}
              className="flex gap-1.5"
            >
              <input
                id="stix-id"
                type="text"
                value={stixId}
                onChange={(e) => setStixId(e.target.value)}
                placeholder="T1566.001 · S0001 · G0016 — or attack-pattern--<uuid>"
                className="flex-1 min-w-0 px-2 py-1.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-[#1e2030] rounded font-mono text-mini focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
                spellCheck={false}
              />
              <button
                type="submit"
                disabled={fetching || !stixId.trim()}
                className="px-2 py-1.5 rounded bg-brand-600 hover:bg-brand-700 text-white font-mono text-xs disabled:opacity-50 inline-flex items-center gap-1"
              >
                {fetching ? <Loader2 size={11} className="animate-spin" /> : 'fetch'}
              </button>
            </form>
            <p className="text-micro font-mono text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              Enter a MITRE ATT&amp;CK id (T1566.001, S0001, G0016, M1049, TA0001, DS0009, C0001) or a raw STIX id
              (&lt;type&gt;--&lt;uuid&gt;). Public MITRE ATT&amp;CK TAXII 2.1 — Enterprise / ICS / Mobile, cached 7d.
              Other STIX feeds need auth — paste a bundle below for those.
            </p>
            {fetchError && <p className="mt-2 text-mini font-mono text-rose-600 dark:text-rose-400">{fetchError}</p>}
            {fetchedFrom && !fetchError && (
              <p className="mt-2 text-mini font-mono text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
                ✓ {fetchedFrom.collection}
                {fetchedFrom.attackId && (
                  <a
                    href={`https://attack.mitre.org/techniques/${fetchedFrom.attackId.replace(/\./, '/')}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline inline-flex items-center gap-0.5"
                  >
                    · {fetchedFrom.attackId} <ExternalLink size={9} />
                  </a>
                )}
              </p>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="stix-input" className="text-xs font-mono uppercase tracking-wider text-slate-500">
                STIX 2.1 Bundle (JSON)
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={loadSample}
                  className="inline-flex items-center gap-1 text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
                >
                  <FileJson size={12} /> sample
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="inline-flex items-center gap-1 text-xs font-mono text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
                >
                  <Trash2 size={12} /> clear
                </button>
              </div>
            </div>
            <textarea
              id="stix-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='{ "type": "bundle", "objects": [...] }'
              rows={12}
              className="w-full px-3 py-2 bg-white dark:bg-[#12121a] border border-slate-200 dark:border-[#1e2030] rounded-lg font-mono text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
              spellCheck={false}
            />
            {parseError && <p className="mt-2 text-xs font-mono text-rose-600 dark:text-rose-400">{parseError}</p>}
          </section>

          {bundle && (
            <section className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-4">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-500 mb-3">
                <Filter size={12} /> Types ({types.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {types.map((t) => {
                  const active = filterTypes.size === 0 || filterTypes.has(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleType(t)}
                      className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
                        active
                          ? 'border-brand-500/50 text-slate-900 dark:text-slate-100 bg-brand-50 dark:bg-brand-900/20'
                          : 'border-slate-200 dark:border-[#1e2030] text-slate-500'
                      }`}
                    >
                      {t} <span className="text-slate-500">{stats[t]}</span>
                    </button>
                  );
                })}
              </div>
              {filterTypes.size > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterTypes(new Set())}
                  className="mt-3 text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
                >
                  reset filters
                </button>
              )}
            </section>
          )}

          {selected && (
            <section className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-white dark:bg-[#12121a] shadow-e1 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-mono uppercase tracking-wider text-slate-500">Selected object</div>
                <button
                  type="button"
                  onClick={() => void copySelected()}
                  className="inline-flex items-center gap-1 text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'copied' : 'copy json'}
                </button>
              </div>
              <div
                className="text-micro uppercase tracking-wider font-bold mb-1"
                style={{ color: STIX_TYPE_COLOR[selected.type as StixObjectType] ?? '#94a3b8' }}
              >
                {selected.type}
              </div>
              <div className="font-display font-semibold text-slate-900 dark:text-slate-100 mb-2 break-words">
                {selected.name ?? selected.value ?? selected.id}
              </div>
              <pre className="font-mono text-mini text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap break-all max-h-96">
                {JSON.stringify(selected, null, 2)}
              </pre>
            </section>
          )}
        </aside>

        {/* Right: graph */}
        <div
          className="rounded-lg border border-slate-200 dark:border-[#1e2030] bg-slate-50 dark:bg-slate-950 overflow-hidden"
          style={{ height: '70vh', minHeight: 520 }}
        >
          {bundle && nodes.length > 0 ? (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-slate-500 font-mono text-xs gap-2">
                  <Loader2 size={14} className="animate-spin" /> loading graph viewer…
                </div>
              }
            >
              <StixGraph nodes={nodes} edges={edges} onNodeClick={onNodeClick} />
            </Suspense>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-slate-500 font-mono text-sm gap-3 p-8 text-center">
              {bundle ? (
                <>
                  <div>No nodes match the current filter.</div>
                  <button
                    type="button"
                    onClick={() => setFilterTypes(new Set())}
                    className="text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    reset filters
                  </button>
                </>
              ) : (
                <>
                  <div>Paste a STIX 2.1 bundle on the left, or load the sample.</div>
                  <button
                    type="button"
                    onClick={loadSample}
                    className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    <FileJson size={14} /> load demo bundle
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <RelatedWikiArticles />
    </div>
  );
}
