import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bug,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode,
  Globe,
  Hash,
  MapPin,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldAlert,
  Terminal,
  Users,
} from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ClusterTabs, RANSOMWARE_TABS } from '../../components/threatintel/ClusterTabs';
import { useSearchParams } from 'react-router-dom';

/**
 * ransomware.live PRO surface — 7 purpose-built tabs consuming the
 * server-side authenticated proxy at /api/v1/rl/* plus the KQL scraper
 * and the existing ransomware-map country aggregation.
 *
 * PRO API response shapes aren't fully documented, so every view renders
 * defensively: known fields when present, compact JSON fallback otherwise.
 */

type TabId = 'stats' | 'groups' | 'infostealer' | 'yara' | 'iocs' | 'kql' | 'countrymap';

const TABS: Array<{ id: TabId; label: string; icon: typeof Activity; blurb: string }> = [
  { id: 'stats', label: 'Stats', icon: Activity, blurb: 'High-level victim / group / activity counts.' },
  { id: 'groups', label: 'Groups', icon: Users, blurb: 'Tracked ransomware groups with TTPs, tools & CVEs.' },
  {
    id: 'infostealer',
    label: 'Infostealer',
    icon: Bug,
    blurb: 'Recent victims enriched with HudsonRock infostealer data.',
  },
  { id: 'yara', label: 'YARA', icon: FileCode, blurb: 'YARA detection rules per ransomware group.' },
  { id: 'iocs', label: 'IoC', icon: Hash, blurb: 'Indicators of Compromise by group and type.' },
  { id: 'kql', label: 'KQL', icon: Terminal, blurb: 'Sentinel / Defender hunting queries per group.' },
  { id: 'countrymap', label: 'Country Map', icon: Globe, blurb: 'Ransomware victim distribution by country.' },
];

// ── helpers ──────────────────────────────────────────────────────────

interface ProxyEnvelope {
  resource: string;
  arg: string | null;
  fetched_at: string;
  data: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pick(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

function asArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (isRecord(data)) {
    for (const k of ['results', 'groups', 'data', 'victims', 'items', 'chats']) {
      if (Array.isArray(data[k])) return data[k] as unknown[];
    }
  }
  return [];
}

function useCopy(): [string | null, (text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(text.slice(0, 20));
      setTimeout(() => setCopied(null), 1500);
    });
  }, []);
  return [copied, copy];
}

function CodeBlock({ code, lang }: { code: string; lang?: string }): JSX.Element {
  const [copied, copy] = useCopy();
  return (
    <div className="relative group">
      <button
        type="button"
        onClick={() => copy(code)}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-100))] px-2 py-1 text-micro font-mono inline-flex items-center gap-1 hover:border-rose-500/40"
      >
        {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
        {copied ? 'copied' : 'copy'}
      </button>
      <pre className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] p-3 overflow-auto font-mono text-mini text-slate-700 dark:text-slate-300 max-h-[50vh]">
        {lang && <div className="text-micro text-slate-400 mb-1">{lang}</div>}
        {code}
      </pre>
    </div>
  );
}

function RawJson({ value }: { value: unknown }): JSX.Element {
  return (
    <pre className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] p-3 overflow-auto font-mono text-mini text-slate-700 dark:text-slate-300 max-h-[60vh]">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Pill({
  children,
  tone = 'slate',
}: {
  children: React.ReactNode;
  tone?: 'slate' | 'brand' | 'amber' | 'green' | 'red';
}): JSX.Element {
  const tones: Record<string, string> = {
    slate:
      'border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-100 dark:bg-[rgb(var(--surface-200))] text-slate-600 dark:text-slate-300',
    brand: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    amber: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    green: 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300',
    red: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-micro ${tones[tone]}`}>
      {children}
    </span>
  );
}

// ── data fetching hook ───────────────────────────────────────────────

function useFetch<T>(
  url: string | null,
  deps: unknown[]
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!url) return;
    if (fetchedRef.current && tick === 0) {
      setError(null);
      setLoading(false);
      return;
    }
    let alive = true;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(url, { signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(20_000)]) })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          const detail =
            (j as { error?: string }).error === 'not_configured'
              ? 'ransomware.live PRO key is not configured on the server.'
              : `${(j as { error?: string }).error ?? 'request failed'} (HTTP ${r.status})`;
          throw new Error(detail);
        }
        return j as T;
      })
      .then((d) => {
        if (alive) {
          fetchedRef.current = true;
          setData(d);
        }
      })
      .catch((e: { name?: string; message?: string }) => {
        if (alive && e.name !== 'AbortError') setError(e.message ?? String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick, ...deps]);

  const refresh = useCallback(() => {
    fetchedRef.current = false;
    setData(null);
    setTick((t) => t + 1);
  }, []);

  return { data, loading, error, refresh };
}

// ── Stats tab ────────────────────────────────────────────────────────

function StatsView({ data }: { data: unknown }): JSX.Element {
  const root = isRecord(data) && isRecord(data.stats) ? data.stats : data;
  if (!isRecord(root)) return <RawJson value={data} />;
  const entries = Object.entries(root).filter(([, v]) => typeof v === 'number' || typeof v === 'string');
  if (entries.length === 0) return <RawJson value={data} />;
  const lastUpdate = isRecord(data) ? pick(data, ['last_update', 'lastupdate', 'updated']) : undefined;
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {entries.map(([k, v]) => (
          <div key={k} className="surface-card p-4">
            <div className="text-micro font-mono uppercase tracking-wider text-slate-500">{k.replace(/_/g, ' ')}</div>
            <div className="font-display font-bold text-xl text-slate-900 dark:text-slate-100">{String(v)}</div>
          </div>
        ))}
      </div>
      {lastUpdate && <p className="font-mono text-micro text-slate-400 mt-3">last update: {lastUpdate}</p>}
    </div>
  );
}

// ── Groups tab ───────────────────────────────────────────────────────

function GroupsView({ data }: { data: unknown }): JSX.Element {
  const rows = asArray(data).filter(isRecord);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const filtered = rows.filter((r) => {
    if (!search) return true;
    const g = pick(r, ['group', 'name'])?.toLowerCase() ?? '';
    return g.includes(search.toLowerCase());
  });

  if (rows.length === 0) return <RawJson value={data} />;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filter groups…"
            className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-transparent text-sm font-mono focus:border-rose-500/40 outline-none"
          />
        </div>
        <span className="font-mono text-micro text-slate-400">{filtered.length} groups</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((r, i) => {
          const name = pick(r, ['group', 'name']) ?? `#${i + 1}`;
          const victims = pick(r, ['victims', 'count']);
          const alt = pick(r, ['altname', 'alt_name']);
          const isOpen = selected === name;
          return (
            <div key={name} className="surface-card">
              <button
                type="button"
                onClick={() => setSelected(isOpen ? null : name)}
                className="w-full flex items-center justify-between gap-2 p-3 text-left"
              >
                <span className="flex items-center gap-2 min-w-0">
                  {isOpen ? (
                    <ChevronDown size={14} className="shrink-0 text-slate-400" />
                  ) : (
                    <ChevronRight size={14} className="shrink-0 text-slate-400" />
                  )}
                  <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                    {name}
                  </span>
                </span>
                {victims && <Pill tone="brand">{victims} victims</Pill>}
              </button>
              {alt && <div className="px-3 pb-1 font-mono text-micro text-slate-400">aka {alt}</div>}
              {isOpen && <GroupDetail group={name} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GroupDetail({ group }: { group: string }): JSX.Element | null {
  const { data, loading, error } = useFetch<ProxyEnvelope>(`/api/v1/rl/group/${encodeURIComponent(group)}`, [group]);
  if (loading) return <div className="p-3 font-mono text-mini text-slate-400">loading group detail…</div>;
  if (error) return <div className="p-3 font-mono text-mini text-red-500">{error}</div>;
  if (!data || !isRecord(data.data)) return null;
  const d = data.data as Record<string, unknown>;
  const desc = pick(d, ['description', 'desc']);
  const firstseen = pick(d, ['firstseen', 'first_seen']);
  const lastseen = pick(d, ['lastseen', 'last_seen']);
  const locations = asArray(d.locations).filter(isRecord);
  const ttps = asArray(d.ttps).filter(isRecord);
  const vulns = asArray(d.vulnerabilities).filter(isRecord);
  const tools = asArray(d.tools);
  const hasNego = d.has_negotiations === true || Boolean(d.negotiation_count);
  const hasYara = d.has_yara === true || Boolean(d.yara_count);
  const hasRansomnote = d.has_ransomnote === true || Boolean(d.ransomnotes_count);

  return (
    <div className="px-3 pb-3 space-y-3 border-t border-slate-200 dark:border-[rgb(var(--border-400))] pt-2">
      {desc && <p className="font-mono text-mini text-muted line-clamp-4">{desc}</p>}
      <div className="flex flex-wrap gap-1.5">
        {firstseen && <Pill>first: {firstseen}</Pill>}
        {lastseen && <Pill>last: {lastseen}</Pill>}
        {hasNego && (
          <Pill tone="amber">
            <MessageSquare size={10} /> {String(d.negotiation_count ?? '?')} nego
          </Pill>
        )}
        {hasYara && (
          <Pill tone="green">
            <FileCode size={10} /> YARA
          </Pill>
        )}
        {hasRansomnote && (
          <Pill tone="red">
            <AlertTriangle size={10} /> notes
          </Pill>
        )}
      </div>
      {tools.length > 0 && (
        <div>
          <div className="text-micro font-mono uppercase text-slate-400 mb-1">Tools</div>
          <div className="flex flex-wrap gap-1">
            {tools.slice(0, 20).map((t, i) => (
              <Pill key={i} tone="slate">
                {typeof t === 'string' ? t : (pick(t as Record<string, unknown>, ['name', 'tool']) ?? String(t))}
              </Pill>
            ))}
          </div>
        </div>
      )}
      {vulns.length > 0 && (
        <div>
          <div className="text-micro font-mono uppercase text-slate-400 mb-1">CVEs</div>
          <div className="flex flex-wrap gap-1">
            {vulns.slice(0, 15).map((v, i) => {
              const cve = pick(v, ['cve', 'id', 'name']) ?? `#${i}`;
              const cvss = pick(v, ['cvss', 'cvss_score']);
              return (
                <Pill key={i} tone="red">
                  {cve}
                  {cvss ? ` (${cvss})` : ''}
                </Pill>
              );
            })}
          </div>
        </div>
      )}
      {ttps.length > 0 && (
        <div>
          <div className="text-micro font-mono uppercase text-slate-400 mb-1">MITRE TTPs</div>
          <div className="flex flex-wrap gap-1">
            {ttps.slice(0, 20).map((t, i) => {
              const tid = pick(t, ['id', 'technique', 'tactic']) ?? String(t);
              return (
                <Pill key={i} tone="brand">
                  {tid}
                </Pill>
              );
            })}
          </div>
        </div>
      )}
      {locations.length > 0 && (
        <div>
          <div className="text-micro font-mono uppercase text-slate-400 mb-1">Locations</div>
          <div className="space-y-1">
            {locations.slice(0, 5).map((l, i) => {
              const url = pick(l, ['url', 'onion', 'clearweb', 'location']) ?? '';
              return url ? (
                <div key={i} className="font-mono text-micro text-slate-500 truncate">
                  <MapPin size={9} className="inline mr-1" />
                  {url}
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Infostealer tab ──────────────────────────────────────────────────

function InfostealerView({ data }: { data: unknown }): JSX.Element {
  const rows = asArray(data).filter(isRecord);
  const [search, setSearch] = useState('');
  const filtered = rows.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (pick(r, ['victim', 'post_title'])?.toLowerCase() ?? '').includes(q) ||
      (pick(r, ['group', 'group_name'])?.toLowerCase() ?? '').includes(q)
    );
  });

  if (rows.length === 0) return <RawJson value={data} />;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filter victims…"
            className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-transparent text-sm font-mono focus:border-rose-500/40 outline-none"
          />
        </div>
        <span className="font-mono text-micro text-slate-400">{filtered.length} victims</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {filtered.slice(0, 100).map((r, i) => {
          const victim = pick(r, ['victim', 'post_title']) ?? `#${i + 1}`;
          const group = pick(r, ['group', 'group_name']);
          const country = pick(r, ['country']);
          const activity = pick(r, ['activity', 'sector']);
          const discovered = pick(r, ['discovered', 'attackdate', 'published']);
          const website = pick(r, ['website']);
          const screenshot = pick(r, ['screenshot']);
          const infostealer = r.infostealer;
          const hasInfostealer =
            Boolean(infostealer) &&
            (typeof infostealer === 'object' ? Object.keys(infostealer as object).length > 0 : true);
          return (
            <div key={i} className="surface-card p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                  {victim}
                </span>
                {group && <Pill tone="brand">{group}</Pill>}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {country && (
                  <Pill>
                    <Globe size={9} /> {country}
                  </Pill>
                )}
                {activity && <Pill tone="slate">{activity}</Pill>}
                {discovered && <Pill tone="slate">{discovered}</Pill>}
                {hasInfostealer && (
                  <Pill tone="amber">
                    <Bug size={9} /> infostealer
                  </Pill>
                )}
              </div>
              {website && (
                <a
                  href={website.startsWith('http') ? website : `https://${website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-micro text-rose-600 dark:text-rose-400 hover:underline mt-1 block truncate"
                >
                  {website}
                </a>
              )}
              {screenshot && (
                <a href={screenshot} target="_blank" rel="noopener noreferrer" className="block mt-2">
                  <img
                    src={screenshot}
                    alt={`${victim} leak screenshot`}
                    loading="lazy"
                    className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] max-h-32 w-full object-cover"
                  />
                </a>
              )}
              {hasInfostealer && isRecord(infostealer) && (
                <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2">
                  <div className="text-micro font-mono text-amber-700 dark:text-amber-300 mb-1">
                    HudsonRock Infostealer
                  </div>
                  <pre className="font-mono text-micro text-slate-600 dark:text-slate-400 overflow-auto max-h-24">
                    {JSON.stringify(infostealer, null, 1).slice(0, 400)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── YARA tab ─────────────────────────────────────────────────────────

function YaraView({ data }: { data: unknown }): JSX.Element {
  const rows = asArray(data).filter(isRecord);
  const [selected, setSelected] = useState<string | null>(null);

  if (rows.length === 0) return <RawJson value={data} />;

  if (selected) {
    return <YaraRules group={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((r, i) => {
          const name = pick(r, ['group', 'name']) ?? `#${i + 1}`;
          const count = pick(r, ['rules', 'count', 'total']);
          return (
            <button
              key={name}
              type="button"
              onClick={() => setSelected(name)}
              className="surface-card p-3 text-left hover:border-rose-500/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">{name}</span>
                {count && (
                  <Pill tone="green">
                    <FileCode size={10} /> {count} rules
                  </Pill>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function YaraRules({ group, onBack }: { group: string; onBack: () => void }): JSX.Element | null {
  const { data, loading, error } = useFetch<ProxyEnvelope>(`/api/v1/rl/yara/${encodeURIComponent(group)}`, [group]);
  const rules = asArray(data?.data).filter(isRecord);
  const [activeRule, setActiveRule] = useState(0);

  if (loading) return <div className="font-mono text-mini text-slate-400">loading YARA rules for {group}…</div>;
  if (error) return <div className="font-mono text-mini text-red-500">{error}</div>;
  if (rules.length === 0) return <div className="font-mono text-mini text-slate-400">no rules found</div>;

  const rule = rules[activeRule]!;
  const filename = pick(rule, ['filename', 'name', 'file']) ?? `rule-${activeRule}`;
  const content = pick(rule, ['content', 'rule', 'text']) ?? '';

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="font-mono text-mini text-rose-600 dark:text-rose-400 hover:underline mb-2"
      >
        ← back to groups
      </button>
      <div className="flex flex-wrap gap-1 mb-3">
        {rules.map((r, i) => {
          const fn = pick(r, ['filename', 'name', 'file']) ?? `rule-${i}`;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setActiveRule(i)}
              className={`px-2 py-1 rounded font-mono text-micro border ${i === activeRule ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              {fn}
            </button>
          );
        })}
      </div>
      <CodeBlock code={content} lang={`YARA - ${filename}`} />
    </div>
  );
}

// ── IoC tab ──────────────────────────────────────────────────────────

function IocView({ data }: { data: unknown }): JSX.Element {
  const rows = asArray(data).filter(isRecord);
  const [selected, setSelected] = useState<string | null>(null);

  if (rows.length === 0) return <RawJson value={data} />;

  if (selected) {
    return <IocValues group={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((r, i) => {
          const name = pick(r, ['group', 'name']) ?? `#${i + 1}`;
          const typeEntries = Object.entries(r).filter(
            ([k, v]) => k !== 'group' && k !== 'name' && (typeof v === 'number' || Array.isArray(v))
          );
          const total = typeEntries.reduce(
            (s, [, v]) => s + (typeof v === 'number' ? v : Array.isArray(v) ? v.length : 0),
            0
          );
          return (
            <button
              key={name}
              type="button"
              onClick={() => setSelected(name)}
              className="surface-card p-3 text-left hover:border-rose-500/40 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">{name}</span>
                {total > 0 && (
                  <Pill tone="red">
                    <Hash size={10} /> {total} IoCs
                  </Pill>
                )}
              </div>
              {typeEntries.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {typeEntries.slice(0, 6).map(([k, v]) => (
                    <Pill key={k} tone="slate">
                      {k}: {typeof v === 'number' ? v : (v as unknown[]).length}
                    </Pill>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IocValues({ group, onBack }: { group: string; onBack: () => void }): JSX.Element | null {
  const { data, loading, error } = useFetch<ProxyEnvelope>(`/api/v1/rl/iocs/${encodeURIComponent(group)}`, [group]);
  const [copied, copy] = useCopy();

  if (loading) return <div className="font-mono text-mini text-slate-400">loading IoCs for {group}…</div>;
  if (error) return <div className="font-mono text-mini text-red-500">{error}</div>;
  if (!data || !isRecord(data.data)) return <div className="font-mono text-mini text-slate-400">no IoCs found</div>;

  const d = data.data as Record<string, unknown>;
  const types = Object.entries(d).filter(([, v]) => Array.isArray(v) && v.length > 0);

  if (types.length === 0) return <div className="font-mono text-mini text-slate-400">no IoCs found</div>;

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="font-mono text-mini text-rose-600 dark:text-rose-400 hover:underline mb-2"
      >
        ← back to groups
      </button>
      <div className="space-y-4">
        {types.map(([type, values]) => {
          const arr = values as unknown[];
          return (
            <div key={type}>
              <div className="flex items-center gap-2 mb-1">
                <Pill tone="red">{type}</Pill>
                <span className="font-mono text-micro text-slate-400">{arr.length} indicators</span>
                <button
                  type="button"
                  onClick={() => copy(arr.map(String).join('\n'))}
                  className="font-mono text-micro text-slate-400 hover:text-rose-500 inline-flex items-center gap-1"
                >
                  {copied ? <Check size={10} /> : <Copy size={10} />} copy all
                </button>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] p-2 max-h-48 overflow-auto">
                {arr.slice(0, 200).map((v, i) => (
                  <div key={i} className="font-mono text-mini text-slate-600 dark:text-slate-400 py-0.5 break-all">
                    {typeof v === 'string' ? v : JSON.stringify(v)}
                  </div>
                ))}
                {arr.length > 200 && (
                  <div className="font-mono text-micro text-slate-400 mt-1">… {arr.length - 200} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── KQL tab ──────────────────────────────────────────────────────────

interface KqlIndex {
  total_queries: number;
  total_groups: number;
  queries: Array<{ id: string; title: string; group: string; category: string; mitre: string }>;
}
interface KqlDetail {
  id: string;
  title: string;
  group: string;
  mitre: string;
  tactic: string;
  data_source: string;
  date_added: string;
  description: string;
  query: string;
}

function KqlView(): JSX.Element | null {
  const { data, loading, error } = useFetch<KqlIndex>('/api/v1/rl/kql', []);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (loading) return <div className="font-mono text-mini text-slate-400">loading KQL index…</div>;
  if (error) return <div className="font-mono text-mini text-red-500">{error}</div>;
  if (!data) return null;

  if (selectedId) {
    return <KqlDetail2 id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  const filtered = data.queries.filter((q) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      q.title.toLowerCase().includes(s) ||
      q.group.includes(s) ||
      q.mitre.toLowerCase().includes(s) ||
      q.category.toLowerCase().includes(s)
    );
  });

  const byGroup = new Map<string, typeof data.queries>();
  for (const q of filtered) {
    const arr = byGroup.get(q.group) ?? [];
    arr.push(q);
    byGroup.set(q.group, arr);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filter by title, group, MITRE…"
            className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-transparent text-sm font-mono focus:border-rose-500/40 outline-none"
          />
        </div>
        <span className="font-mono text-micro text-slate-400">
          {filtered.length} queries · {byGroup.size} groups
        </span>
      </div>
      <div className="space-y-3">
        {[...byGroup.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([group, queries]) => (
            <div key={group}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">{group}</span>
                <Pill tone="slate">{queries.length}</Pill>
              </div>
              <div className="space-y-1">
                {queries.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setSelectedId(q.id)}
                    className="block w-full text-left surface-card p-2 hover:border-rose-500/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-mini text-slate-700 dark:text-slate-300 truncate">{q.title}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {q.category && <Pill tone="slate">{q.category}</Pill>}
                        {q.mitre && <Pill tone="brand">{q.mitre}</Pill>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function KqlDetail2({ id, onBack }: { id: string; onBack: () => void }): JSX.Element | null {
  const { data, loading, error } = useFetch<KqlDetail>(`/api/v1/rl/kql/${id}`, [id]);

  if (loading) return <div className="font-mono text-mini text-slate-400">loading KQL query…</div>;
  if (error) return <div className="font-mono text-mini text-red-500">{error}</div>;
  if (!data) return null;

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="font-mono text-mini text-rose-600 dark:text-rose-400 hover:underline mb-2"
      >
        ← back to KQL index
      </button>
      <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100 mb-2">{data.title}</h3>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {data.group && <Pill tone="brand">{data.group}</Pill>}
        {data.mitre && <Pill tone="amber">{data.mitre}</Pill>}
        {data.tactic && <Pill tone="slate">{data.tactic}</Pill>}
        {data.data_source && (
          <Pill tone="slate">
            <Terminal size={9} /> {data.data_source}
          </Pill>
        )}
        {data.date_added && <Pill tone="slate">added: {data.date_added}</Pill>}
      </div>
      {data.description && <p className="font-mono text-mini text-muted mb-3">{data.description}</p>}
      <CodeBlock code={data.query} lang="Kusto (Sentinel / Defender)" />
    </div>
  );
}

// ── Country Map tab ──────────────────────────────────────────────────

interface CountryMapData {
  total_victims: number;
  total_countries: number;
  countries: Array<{
    country: string;
    countryCode: string;
    victim_count: number;
    groups: string[];
    top_victims: string[];
  }>;
}

function CountryMapView(): JSX.Element | null {
  const { data, loading, error } = useFetch<CountryMapData>('/api/v1/ransomware-map', []);
  const [search, setSearch] = useState('');

  if (loading) return <div className="font-mono text-mini text-slate-400">loading country data…</div>;
  if (error) return <div className="font-mono text-mini text-red-500">{error}</div>;
  if (!data) return null;

  const filtered = data.countries.filter(
    (c) =>
      !search ||
      c.country.toLowerCase().includes(search.toLowerCase()) ||
      c.countryCode.toLowerCase().includes(search.toLowerCase())
  );
  const maxCount = Math.max(...data.countries.map((c) => c.victim_count), 1);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="surface-card p-3">
          <div className="text-micro font-mono uppercase text-slate-500">Victims</div>
          <div className="font-display font-bold text-xl">{data.total_victims}</div>
        </div>
        <div className="surface-card p-3">
          <div className="text-micro font-mono uppercase text-slate-500">Countries</div>
          <div className="font-display font-bold text-xl">{data.total_countries}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filter countries…"
            className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-slate-300 dark:border-[rgb(var(--border-400))] bg-transparent text-sm font-mono focus:border-rose-500/40 outline-none"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        {filtered.map((c) => (
          <div key={c.countryCode} className="surface-card p-3">
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-2">
                <img
                  src={`https://images.ransomware.live/flags/${c.countryCode}.svg`}
                  alt={c.countryCode}
                  className="w-5 h-3.5 rounded-sm"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
                  {c.country}
                </span>
                <span className="font-mono text-micro text-slate-400">{c.countryCode}</span>
              </div>
              <Pill tone="brand">{c.victim_count} victims</Pill>
            </div>
            <div className="h-1.5 rounded-full bg-slate-200 dark:bg-[rgb(var(--surface-300))] overflow-hidden">
              <div
                className="h-full bg-rose-500 rounded-full"
                style={{ width: `${(c.victim_count / maxCount) * 100}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {c.groups.slice(0, 8).map((g) => (
                <Pill key={g} tone="slate">
                  {g}
                </Pill>
              ))}
              {c.groups.length > 8 && <Pill tone="slate">+{c.groups.length - 8}</Pill>}
            </div>
            {c.top_victims.length > 0 && (
              <div className="font-mono text-micro text-slate-400 mt-1 truncate">
                recent: {c.top_victims.join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────

export default function RansomwareLive(): JSX.Element {
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab: TabId = TABS.some((t) => t.id === requestedTab) ? (requestedTab as TabId) : 'stats';
  const [tab, setTab] = useState<TabId>(initialTab);

  const active = TABS.find((t) => t.id === tab) ?? TABS[0]!;

  const proxyResource =
    tab === 'stats'
      ? 'stats'
      : tab === 'groups'
        ? 'groups'
        : tab === 'infostealer'
          ? 'infostealer'
          : tab === 'yara'
            ? 'yara'
            : tab === 'iocs'
              ? 'iocs'
              : null;

  const proxyUrl = proxyResource ? `/api/v1/rl/${proxyResource}` : null;
  const { data: proxyData, loading, error, refresh } = useFetch<ProxyEnvelope>(proxyUrl, [tab]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<ShieldAlert size={28} />}
      title="ransomware.live PRO"
      maxWidthClass="max-w-6xl"
      description={
        <span className="text-sm font-mono">
          Server-proxied, key-injected, edge-cached view of the{' '}
          <a
            href="https://www.ransomware.live"
            target="_blank"
            rel="noopener noreferrer"
            className="text-rose-600 dark:text-rose-400 hover:underline"
          >
            ransomware.live
          </a>{' '}
          PRO API + KQL scraper. Cyberattacks carry HudsonRock infostealer enrichment inline.
        </span>
      }
      headerExtra={
        <div className="space-y-4">
          <ClusterTabs tabs={RANSOMWARE_TABS} ariaLabel="Ransomware intel" />
          <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 font-mono text-meta border-b-2 -mb-px ${tab === t.id ? 'border-rose-500 text-rose-700 dark:text-rose-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                >
                  <Icon size={13} />
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-mini text-slate-500">{active.blurb}</p>
            {proxyUrl && (
              <button
                type="button"
                onClick={refresh}
                disabled={loading}
                className="text-mini font-mono px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] hover:border-rose-500/40 inline-flex items-center gap-1 disabled:opacity-50"
                aria-label={`Refresh ${active.label}`}
              >
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> refresh
              </button>
            )}
          </div>
        </div>
      }
      loading={loading}
      error={error}
      onRetry={refresh}
    >
      {tab === 'kql' ? (
        <KqlView />
      ) : tab === 'countrymap' ? (
        <CountryMapView />
      ) : proxyData ? (
        <>
          {tab === 'stats' ? (
            <StatsView data={proxyData.data} />
          ) : tab === 'groups' ? (
            <GroupsView data={proxyData.data} />
          ) : tab === 'infostealer' ? (
            <InfostealerView data={proxyData.data} />
          ) : tab === 'yara' ? (
            <YaraView data={proxyData.data} />
          ) : tab === 'iocs' ? (
            <IocView data={proxyData.data} />
          ) : (
            <RawJson value={proxyData.data} />
          )}
          <p className="font-mono text-micro text-slate-400 mt-3">
            fetched{' '}
            {(() => {
              const d = new Date(proxyData.fetched_at);
              return isNaN(d.getTime()) ? 'unknown' : d.toLocaleString();
            })()}
          </p>
        </>
      ) : null}
    </DataPageLayout>
  );
}
