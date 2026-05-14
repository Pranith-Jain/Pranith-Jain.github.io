import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Activity, Crosshair, Shield, Bug, Hash, Copy, Check, Layers } from 'lucide-react';

interface PulseEntity {
  label: string;
  kind: 'cve' | 'actor' | 'technique' | 'malware';
  source_count: number;
  sources: string[];
}

interface PulseResponse {
  generated_at: string;
  entities: PulseEntity[];
}

const KIND_ICONS = {
  cve: Hash,
  actor: Shield,
  technique: Crosshair,
  malware: Bug,
} as const;

const KIND_LABEL = {
  cve: 'CVE',
  actor: 'Actor',
  technique: 'Technique',
  malware: 'Malware',
} as const;

/**
 * Per-kind pill colour. Sourced from Tailwind defaults so dark mode works
 * without any custom token mapping — every class lists an explicit
 * `dark:` variant.
 */
const KIND_COLOR = {
  cve: 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400',
  actor: 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400',
  technique:
    'border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-400',
  malware:
    'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400',
} as const;

const SURFACE_LABEL: Record<string, string> = {
  writeups: 'CTI Writeups',
  cybercrime: 'Cyber Crime',
};

function surfaceLabel(s: string): string {
  if (s.startsWith('reddit:')) return `Reddit r/${s.slice(7)}`;
  if (s.startsWith('bsky:')) return `Bluesky @${s.slice(5)}`;
  if (s.startsWith('mastodon:')) return `Mastodon @${s.slice(9)}`;
  if (s.startsWith('tg:')) return `Telegram @${s.slice(3)}`;
  return SURFACE_LABEL[s] ?? s;
}

/**
 * Coarse platform-type taxonomy: which surface family does each source
 * identifier belong to? An entity that shows up across multiple distinct
 * platform types is a stronger signal than the same count of mentions all
 * inside one platform (e.g. 3 Reddit subs == one community echoing itself;
 * 1 Reddit + 1 Telegram + 1 writeup == genuine cross-platform corroboration).
 */
function platformType(s: string): string {
  if (s.startsWith('reddit:')) return 'reddit';
  if (s.startsWith('bsky:')) return 'bluesky';
  if (s.startsWith('mastodon:')) return 'mastodon';
  if (s.startsWith('tg:')) return 'telegram';
  return s; // 'writeups', 'cybercrime' etc are already platform-type level.
}

export default function ThreatPulse(): JSX.Element {
  const [data, setData] = useState<PulseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [minSources, setMinSources] = useState(2);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/v1/threat-pulse');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as PulseResponse;
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.entities
      .filter((e) => e.source_count >= minSources)
      .filter((e) => !kindFilter || e.kind === kindFilter)
      .sort((a, b) => b.source_count - a.source_count);
  }, [data, minSources, kindFilter]);

  const kindCounts = useMemo(() => {
    if (!data) return {};
    const counts: Record<string, number> = {};
    for (const e of data.entities) {
      counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    }
    return counts;
  }, [data]);

  // Highest threshold that still yields at least one entity under the current
  // kind filter — used to power the "lower the threshold for me" recovery
  // button in the empty state instead of dead-ending the analyst on a
  // "try lowering it yourself" instruction.
  const recovery = useMemo(() => {
    if (!data) return null;
    const eligible = kindFilter ? data.entities.filter((e) => e.kind === kindFilter) : data.entities;
    if (eligible.length === 0) return null;
    const bestThreshold = Math.max(...eligible.map((e) => e.source_count));
    if (bestThreshold >= minSources) return null;
    const matchCount = eligible.filter((e) => e.source_count >= bestThreshold).length;
    return { threshold: bestThreshold, count: matchCount };
  }, [data, kindFilter, minSources]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-6 font-mono transition-colors"
      >
        <ArrowLeft size={14} /> /threatintel
      </Link>

      <header className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <Activity size={24} className="text-brand-600 dark:text-brand-400" />
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
            Threat Pulse
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-display font-bold leading-tight mb-2 text-slate-900 dark:text-white">
          Cross-source threat pulse
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-3xl">
          Entities mentioned across multiple independent intelligence surfaces simultaneously. Higher cross-source count
          = higher confidence that this is a real, active threat. Scans Reddit (16 subs), Bluesky (16 researchers),
          Mastodon (infosec.exchange — 8 accounts), Telegram (curated cybersec channels), CTI writeups (35+ blogs), and
          cybercrime news in real time.
        </p>
      </header>

      {/* Kind summary — at-a-glance counts before the filter row.
          Computed off the entire entities array so the numbers reflect the
          full snapshot regardless of active filter / threshold. */}
      {data && data.entities.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {(['cve', 'actor', 'technique', 'malware'] as const).map((k) => {
            const Icon = KIND_ICONS[k];
            const n = kindCounts[k] ?? 0;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(kindFilter === k ? null : k)}
                aria-pressed={kindFilter === k}
                className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  kindFilter === k
                    ? 'border-brand-500/60 bg-brand-500/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-500/40'
                }`}
              >
                <Icon size={18} className="shrink-0 text-brand-600 dark:text-brand-400" />
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{KIND_LABEL[k]}s</div>
                  <div className="text-xl font-display font-bold tabular-nums">{n.toLocaleString()}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex flex-wrap gap-2">
          {[
            { id: null, label: 'All' },
            { id: 'cve', label: 'CVEs' },
            { id: 'actor', label: 'Actors' },
            { id: 'technique', label: 'Techniques' },
            { id: 'malware', label: 'Malware' },
          ].map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => setKindFilter(f.id)}
              className={`px-3 py-1 text-xs font-mono uppercase tracking-wider border transition-colors ${
                kindFilter === f.id
                  ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300 border-brand-300 dark:border-brand-700'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-brand-500/40'
              }`}
            >
              {f.label}
              {f.id && kindCounts[f.id] !== undefined && <span className="ml-1 opacity-60">({kindCounts[f.id]})</span>}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label
            htmlFor="pulse-min-sources"
            className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-500"
          >
            Min. sources
          </label>
          <select
            id="pulse-min-sources"
            value={minSources}
            onChange={(e) => setMinSources(Number(e.target.value))}
            className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-brand-500/60"
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}+
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-12 justify-center text-slate-600 dark:text-slate-400">
          <div className="animate-spin w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full" />
          <span className="font-mono text-sm">Pulsing threat surfaces…</span>
        </div>
      )}

      {error && (
        <div className="border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/20 p-6 text-center rounded-lg">
          <p className="font-mono text-sm text-rose-600 dark:text-rose-400">error: {error}</p>
        </div>
      )}

      {data && filtered.length === 0 && (
        <div className="border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center rounded-lg">
          <Activity size={32} className="mx-auto mb-3 text-slate-400 dark:text-slate-600" />
          <p className="font-mono text-sm text-slate-600 dark:text-slate-400">
            No entities at ≥{minSources} source{minSources > 1 ? 's' : ''}
            {kindFilter ? ` in ${KIND_LABEL[kindFilter as keyof typeof KIND_LABEL]}` : ''}.
          </p>
          {data.entities.length > 0 && (
            <p className="text-xs font-mono text-slate-500 dark:text-slate-500 mt-1.5">
              {data.entities.length} total entit{data.entities.length === 1 ? 'y' : 'ies'} across all surfaces.
            </p>
          )}
          {(recovery || kindFilter) && (
            <div className="mt-5 flex flex-wrap gap-2 justify-center">
              {recovery && (
                <button
                  type="button"
                  onClick={() => setMinSources(recovery.threshold)}
                  className="inline-flex items-center gap-1.5 border border-brand-500 bg-brand-500/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-brand-700 dark:text-brand-400 transition-colors hover:bg-brand-500 hover:text-white rounded"
                >
                  Show {recovery.count} at ≥{recovery.threshold} source{recovery.threshold > 1 ? 's' : ''}
                </button>
              )}
              {kindFilter && (
                <button
                  type="button"
                  onClick={() => setKindFilter(null)}
                  className="inline-flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded"
                >
                  Clear {KIND_LABEL[kindFilter as keyof typeof KIND_LABEL]} filter
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((entity) => {
            const Icon = KIND_ICONS[entity.kind];
            const platformCount = new Set(entity.sources.map(platformType)).size;
            const isCrossPlatform = platformCount >= 2;
            return (
              <div
                key={`${entity.kind}:${entity.label}`}
                className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-brand-500/40 dark:hover:border-brand-400/40 transition-colors rounded-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Icon size={18} className="shrink-0 text-brand-600 dark:text-brand-400" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 break-all">
                          {entity.label}
                        </span>
                        <span
                          className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${KIND_COLOR[entity.kind]}`}
                        >
                          {KIND_LABEL[entity.kind]}
                        </span>
                        {/* Platform-diversity badge — same source_count means
                            different things when all from one platform vs
                            spread across many. The badge separates the two
                            without needing more screen space than a pill. */}
                        {isCrossPlatform ? (
                          <span
                            className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            title={`${platformCount} distinct platform types — cross-platform corroboration, stronger signal than same-platform mentions`}
                          >
                            <Layers size={9} aria-hidden="true" />
                            {platformCount} platforms
                          </span>
                        ) : entity.source_count > 1 ? (
                          <span
                            className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-500"
                            title="All mentions on a single platform — same-platform corroboration, weaker signal than cross-platform"
                          >
                            same-platform
                          </span>
                        ) : null}
                        <CopyEntityButton entity={entity} />
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {entity.sources.map((s) => (
                          <span
                            key={s}
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400"
                          >
                            {surfaceLabel(s)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div
                    className={`shrink-0 px-3 py-1.5 text-center rounded ${
                      entity.source_count >= 3
                        ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                        : entity.source_count === 2
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                          : 'bg-brand-500/10 text-brand-700 dark:text-brand-400'
                    }`}
                  >
                    <span className="text-lg font-bold">{entity.source_count}</span>
                    <p className="text-[9px] uppercase tracking-wider font-mono">sources</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data && (
        <p className="mt-6 text-[11px] font-mono text-slate-500 dark:text-slate-500 text-center">
          Generated {data.generated_at.slice(0, 16).replace('T', ' ')} UTC · {data.entities.length} total entities
        </p>
      )}
    </div>
  );
}

/**
 * Inline copy-to-clipboard for an entity. Formats as
 *   "<kind>: <label> [<sources>]"
 * so the analyst can paste straight into a ticket / Slack with full
 * context. Uses the standard transient-check feedback pattern.
 */
function CopyEntityButton({ entity }: { entity: PulseEntity }): JSX.Element {
  const [done, setDone] = useState(false);
  const onClick = async () => {
    const line = `${KIND_LABEL[entity.kind]}: ${entity.label} [${entity.sources.map(surfaceLabel).join(', ')}]`;
    try {
      await navigator.clipboard.writeText(line);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      /* clipboard blocked — silent */
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Copy ${entity.label} with sources`}
      title="Copy entity + sources for tickets / Slack"
      className="inline-flex items-center justify-center min-h-[22px] min-w-[22px] rounded text-slate-400 hover:text-brand-500 transition-colors"
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}
