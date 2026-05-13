import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Activity, Crosshair, Shield, Bug, Hash } from 'lucide-react';

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

const KIND_COLOR = {
  cve: 'border-warn/30 bg-warn/10 text-warn',
  actor: 'border-threat/30 bg-threat/10 text-threat',
  technique: 'border-accent/30 bg-accent/10 text-accent',
  malware: 'border-safe/30 bg-safe/10 text-safe',
} as const;

const SURFACE_LABEL: Record<string, string> = {
  writeups: 'CTI Writeups',
  cybercrime: 'Cyber Crime',
};

function surfaceLabel(s: string): string {
  if (s.startsWith('reddit:')) return `Reddit r/${s.slice(7)}`;
  if (s.startsWith('bsky:')) return `Bluesky @${s.slice(5)}`;
  return SURFACE_LABEL[s] ?? s;
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

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 text-ink-1">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-ink-2 hover:text-accent mb-6 font-mono transition-colors"
      >
        <ArrowLeft size={14} /> /threatintel
      </Link>

      <header className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <Activity size={24} className="text-accent" />
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Threat Pulse</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-bold leading-tight mb-2">Cross-source threat pulse</h1>
        <p className="text-sm text-ink-2 leading-relaxed max-w-3xl">
          Entities mentioned across multiple independent intelligence surfaces simultaneously. Higher cross-source count
          = higher confidence that this is a real, active threat. Scans Reddit (24 subs), Bluesky (12 researchers), CTI
          writeups (35+ blogs), and cybercrime news in real time.
        </p>
      </header>

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
                  ? 'bg-accent-soft text-accent border-rule'
                  : 'bg-surface-page text-ink-2 border-rule hover:border-ink-1'
              }`}
            >
              {f.label}
              {f.id && kindCounts[f.id] !== undefined && <span className="ml-1 opacity-60">({kindCounts[f.id]})</span>}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label htmlFor="pulse-min-sources" className="text-[10px] font-mono uppercase tracking-wider text-ink-3">
            Min. sources
          </label>
          <select
            id="pulse-min-sources"
            value={minSources}
            onChange={(e) => setMinSources(Number(e.target.value))}
            className="border border-rule bg-surface-page px-2 py-1 text-xs font-mono text-ink-1 focus:outline-none"
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
        <div className="flex items-center gap-2 py-12 justify-center text-ink-2">
          <div className="animate-spin w-5 h-5 border-2 border-accent border-t-transparent rounded-full" />
          <span className="font-mono text-sm">Pulsing threat surfaces…</span>
        </div>
      )}

      {error && (
        <div className="border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 p-6 text-center">
          <p className="font-mono text-sm text-rose-600 dark:text-rose-400">error: {error}</p>
        </div>
      )}

      {data && filtered.length === 0 && (
        <div className="border border-dashed border-rule p-12 text-center">
          <Activity size={32} className="mx-auto mb-3 text-ink-3" />
          <p className="font-mono text-sm text-ink-2">
            No entities found at or above {minSources} source{minSources > 1 ? 's' : ''}. Try lowering the minimum
            source threshold.
          </p>
          {data.entities.length > 0 && (
            <p className="text-xs font-mono text-ink-3 mt-2">
              {data.entities.length} total entities found across all sources.
            </p>
          )}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((entity) => {
            const Icon = KIND_ICONS[entity.kind];
            return (
              <div
                key={`${entity.kind}:${entity.label}`}
                className="border border-rule bg-surface-page p-4 hover:border-ink-2 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Icon size={18} className="shrink-0 text-accent" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-serif font-semibold text-base">{entity.label}</span>
                        <span
                          className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${KIND_COLOR[entity.kind]}`}
                        >
                          {KIND_LABEL[entity.kind]}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {entity.sources.map((s) => (
                          <span
                            key={s}
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-rule bg-surface-raised text-ink-2"
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
                          : 'bg-accent-soft text-accent'
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
        <p className="mt-6 text-[11px] font-mono text-ink-3 text-center">
          Generated {new Date(data.generated_at).toUTCString()} · {data.entities.length} total entities
        </p>
      )}
    </div>
  );
}
