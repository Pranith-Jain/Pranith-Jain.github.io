import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ExternalLink, Search, Users, Bug, Globe, BookOpen, RefreshCw, Sparkles } from 'lucide-react';
import { type KbActor } from '../../data/dfir/actor-kb';
import { DataState } from '../../components/DataState';
import ActorOtxSweep from '../../components/threatintel/ActorOtxSweep';
import { sanitizeUrl } from '../../lib/sanitize-url';

interface SkeletonActor {
  slug: string;
  canonical_name: string;
  source_dataset: 'maltrail';
  maltrail_file: string;
  ioc_size_bytes?: number;
  discovered_at: string;
  last_seen: string;
  description: string;
}

interface MalpediaMatch {
  type: 'family' | 'actor';
  name: string;
  commonName?: string;
  description?: string;
}
interface MaltrailMatch {
  filename: string;
  displayName: string;
  size: number;
}
interface OtxPulse {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  created?: string;
  author?: string;
}
interface ActorEnrichment {
  malpedia: MalpediaMatch[];
  maltrail: MaltrailMatch[];
  otx: OtxPulse[];
}

/**
 * Threat-Actor Knowledge Base — MITRE ATT&CK intrusion-sets, fully
 * client-side (the dataset is built + committed by scripts/build-actor-kb.mjs,
 * no runtime fetch). Search by name / alias / ATT&CK id / technique →
 * actor profile: aliases, description, TTPs grouped by tactic, tooling.
 */

// ATT&CK kill-chain order for grouping techniques.
const TACTIC_ORDER = [
  'reconnaissance',
  'resource-development',
  'initial-access',
  'execution',
  'persistence',
  'privilege-escalation',
  'defense-evasion',
  'credential-access',
  'discovery',
  'lateral-movement',
  'collection',
  'command-and-control',
  'exfiltration',
  'impact',
  'other',
];
const tacticLabel = (t: string) => t.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function ActorKb(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const selectedId = params.get('g');
  const [skeletons, setSkeletons] = useState<SkeletonActor[]>([]);
  const [skeletonsLoading, setSkeletonsLoading] = useState(true);
  const [actorKb, setActorKb] = useState<KbActor[]>([]);
  const [kbLoading, setKbLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; matched: number; updated: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const loadSkeletons = async () => {
    setSkeletonsLoading(true);
    try {
      const r = await fetch('/api/v1/skeleton-actors');
      if (r.ok) {
        const data = (await r.json()) as { items?: SkeletonActor[] };
        setSkeletons(data.items ?? []);
      }
    } catch {
      /* swallow — empty list */
    } finally {
      setSkeletonsLoading(false);
    }
  };

  useEffect(() => {
    void loadSkeletons();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/data/actor-kb.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((data) => {
        if (!cancelled) setActorKb(data as KbActor[]);
      })
      .catch(() => {
        /* data stays empty */
      })
      .finally(() => {
        if (!cancelled) setKbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runMaltrailSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);
    try {
      const r = await fetch('/api/v1/maltrail-sync', { method: 'POST' });
      const data = (await r.json()) as {
        ok?: boolean;
        created_count?: number;
        matched_count?: number;
        updated_count?: number;
        error?: string;
      };
      if (data.ok) {
        setSyncResult({
          created: data.created_count ?? 0,
          matched: data.matched_count ?? 0,
          updated: data.updated_count ?? 0,
        });
        await loadSkeletons();
      } else {
        setSyncError(`Sync failed: ${data.error ?? 'unknown'}`);
      }
    } catch (e) {
      setSyncError(`Sync failed: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const skeletonMatches = useMemo(() => {
    if (!q.trim()) return skeletons;
    const s = q.trim().toLowerCase();
    return skeletons.filter(
      (sk) =>
        sk.canonical_name.toLowerCase().includes(s) || sk.slug.includes(s) || sk.maltrail_file.toLowerCase().includes(s)
    );
  }, [skeletons, q]);

  const filtered = useMemo<KbActor[]>(() => {
    const s = q.trim().toLowerCase();
    if (!s) return actorKb;
    return actorKb.filter(
      (a) =>
        a.name.toLowerCase().includes(s) ||
        a.attackId.toLowerCase().includes(s) ||
        a.aliases.some((al) => al.toLowerCase().includes(s)) ||
        a.software.some((sw) => sw.toLowerCase().includes(s)) ||
        a.techniques.some((t) => t.name.toLowerCase().includes(s) || t.id.toLowerCase().includes(s))
    );
  }, [actorKb, q]);

  const selected = useMemo(() => actorKb.find((a) => a.attackId === selectedId) ?? null, [actorKb, selectedId]);

  const techByTactic = useMemo(() => {
    if (!selected) return [];
    const m = new Map<string, typeof selected.techniques>();
    for (const t of selected.techniques) {
      const arr = m.get(t.tactic) ?? [];
      arr.push(t);
      m.set(t.tactic, arr);
    }
    return [...m.entries()].sort((a, b) => TACTIC_ORDER.indexOf(a[0]) - TACTIC_ORDER.indexOf(b[0]));
  }, [selected]);

  const [enrich, setEnrich] = useState<ActorEnrichment | null>(null);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) {
      setEnrich(null);
      return;
    }
    const query = new URLSearchParams({ name: selected.name });
    if (selected.aliases.length) query.set('aliases', selected.aliases.slice(0, 5).join(','));
    if (selected.software.length) query.set('software', selected.software.slice(0, 5).join(','));

    let cancelled = false;
    setEnrichLoading(true);
    setEnrichError(null);

    fetch(`/api/v1/actor-enrich?${query}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((json) => {
        if (!cancelled) setEnrich(json as ActorEnrichment);
      })
      .catch((err) => {
        if (!cancelled) setEnrichError(String(err));
      })
      .finally(() => {
        if (!cancelled) setEnrichLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const open = (id: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.set('g', id);
        if (q.trim()) n.set('q', q.trim());
        return n;
      },
      { replace: false }
    );

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-3 flex items-center gap-3">
          <Users size={28} className="text-brand-600 dark:text-brand-400" /> Threat-Actor Knowledge Base
        </h1>
        <p className="text-muted mb-6 max-w-2xl">
          {actorKb.length} MITRE ATT&amp;CK intrusion-sets — aliases, tradecraft (TTPs by tactic) and tooling.
        </p>
      </div>

      {kbLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 font-mono py-8">
          <RefreshCw size={12} className="animate-spin" /> Loading actor knowledge-base…
        </div>
      )}
      {!kbLoading && (
        <>
          <div className="relative mb-6 max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search actor, alias, Gxxxx, technique, malware…"
              aria-label="Search threat actors"
              className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-lg text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
            />
          </div>
          {selected && (
            <section className="mb-8 surface-card p-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-2xl font-display font-bold">{selected.name}</h2>
                <a
                  href={sanitizeUrl(selected.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-meta font-mono px-1.5 py-0.5 rounded border border-brand-500/30 bg-brand-500/5 text-brand-700 dark:text-brand-300 hover:bg-brand-500/10"
                >
                  {selected.attackId} <ExternalLink size={11} />
                </a>
              </div>
              {selected.aliases.length > 0 && (
                <p className="text-meta font-mono text-slate-500 dark:text-slate-400 mt-1">
                  aka {selected.aliases.join(' · ')}
                </p>
              )}
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-3 leading-relaxed">{selected.description}</p>

              {selected.software.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-mini font-mono uppercase tracking-wider text-slate-500 mb-1.5">
                    Tooling / malware ({selected.software.length})
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.software.map((s) => (
                      <span
                        key={s}
                        className="text-mini font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-muted"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {techByTactic.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-mini font-mono uppercase tracking-wider text-slate-500 mb-2">
                    Techniques ({selected.techniques.length}) by tactic
                  </h3>
                  <div className="space-y-3">
                    {techByTactic.map(([t, list]) => (
                      <div key={t}>
                        <div className="text-meta font-semibold text-brand-700 dark:text-brand-300 mb-1">
                          {tacticLabel(t)}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {list.map((tech) => (
                            <a
                              key={tech.id}
                              href={`https://attack.mitre.org/techniques/${tech.id.replace('.', '/')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={tech.name}
                              className="text-mini font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-slate-950 text-muted hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
                            >
                              {tech.id} {tech.name}
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Enrichment */}
              <div className="mt-5 pt-4 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
                <h3 className="text-mini font-mono uppercase tracking-wider text-slate-500 mb-3">
                  Enrichment · Malpedia / Maltrail / OTX
                </h3>
                <DataState loading={enrichLoading} error={enrichError} rows={3}>
                  {enrich && (
                    <div className="space-y-4">
                      {enrich.malpedia.length > 0 && (
                        <div>
                          <h4 className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
                            <BookOpen size={11} /> Malpedia ({enrich.malpedia.length})
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {enrich.malpedia.map((m) => (
                              <a
                                key={m.name}
                                href={`https://malpedia.caad.fkie.fraunhofer.de/details/${m.type === 'actor' ? 'actor' : 'win'}.${m.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-mini font-mono px-1.5 py-0.5 rounded border border-brand-500/30 text-brand-700 dark:text-brand-300 hover:bg-brand-500/10 inline-flex items-center gap-1"
                              >
                                {m.name} <ExternalLink size={10} />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {enrich.maltrail.length > 0 && (
                        <div>
                          <h4 className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
                            <Bug size={11} /> Maltrail ({enrich.maltrail.length})
                          </h4>
                          <div className="flex flex-wrap gap-1.5">
                            {enrich.maltrail.map((t) => (
                              <a
                                key={t.filename}
                                href={`/api/v1/maltrail/fetch?trail=${encodeURIComponent(t.filename)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-mini font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40 inline-flex items-center gap-1"
                              >
                                {t.displayName} <ExternalLink size={10} />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {enrich.otx.length > 0 && (
                        <div>
                          <h4 className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
                            <Globe size={11} /> OTX Pulses ({enrich.otx.length})
                          </h4>
                          <div className="space-y-1">
                            {enrich.otx.map((p) => (
                              <a
                                key={p.id}
                                href={`https://otx.alienvault.com/pulse/${p.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-mini font-mono px-1.5 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
                              >
                                <span className="text-slate-900 dark:text-slate-100">{p.name}</span>
                                {p.author && <span className="ml-2 text-slate-500">by {p.author}</span>}
                                {p.tags && p.tags.length > 0 && (
                                  <span className="ml-2 text-micro text-slate-500">
                                    {p.tags.slice(0, 4).join(' · ')}
                                  </span>
                                )}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {enrich.malpedia.length === 0 && enrich.maltrail.length === 0 && enrich.otx.length === 0 && (
                        <p className="text-mini font-mono text-slate-500 dark:text-slate-400">No enrichment found.</p>
                      )}
                    </div>
                  )}
                </DataState>
              </div>
            </section>
          )}

          <div className="mb-6">
            <ActorOtxSweep
              actors={filtered.slice(0, 200).map((a) => ({
                slug: a.attackId.toLowerCase(),
                name: a.name,
                aliases: a.aliases?.slice(0, 3),
              }))}
              limit={10}
            />
          </div>

          <div className="text-meta font-mono text-slate-500 dark:text-slate-400 mb-2">
            {filtered.length} of {actorKb.length} actors
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.slice(0, 240).map((a) => (
              <button
                key={a.attackId}
                type="button"
                onClick={() => open(a.attackId)}
                className={`text-left surface-card p-3 transition-colors ${
                  a.attackId === selectedId
                    ? 'border-brand-500/50 bg-brand-500/5 dark:bg-brand-500/5'
                    : 'hover:border-brand-500/40'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display font-semibold truncate">{a.name}</span>
                  <span className="text-micro font-mono text-slate-500 shrink-0">{a.attackId}</span>
                </div>
                {a.aliases.length > 0 && (
                  <p className="text-mini font-mono text-slate-500 mt-0.5 truncate">{a.aliases.join(' · ')}</p>
                )}
                <p className="text-mini text-slate-500 mt-1">
                  {a.techniques.length} TTPs · {a.software.length} tools
                </p>
              </button>
            ))}
          </div>
          {filtered.length > 240 && (
            <p className="text-meta text-slate-500 mt-3">Showing first 240 — refine the search to narrow.</p>
          )}
        </>
      )}

      {/* Maltrail-discovered skeleton actors. apt_*.txt files with no
          canonical-actor match are auto-promoted to skeleton profiles so
          their IOCs always have a home — a later MITRE/Malpedia
          enrichment can flesh them out. */}
      <section className="mt-12 surface-card p-5">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h2 className="text-lg font-display font-bold inline-flex items-center gap-2">
              <Sparkles size={16} className="text-brand-600 dark:text-brand-400" />
              Maltrail-discovered actors
              {!skeletonsLoading && skeletons.length > 0 && (
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">· {skeletons.length}</span>
              )}
            </h2>
            <p className="text-mini font-mono text-slate-500 dark:text-slate-400 mt-1 max-w-3xl">
              <code>apt_*.txt</code> files in stamparm/maltrail with no canonical MITRE / Malpedia match. Auto-created
              skeleton profiles so the IOC trail isn't dropped.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runMaltrailSync()}
            disabled={syncing}
            className="text-xs font-mono px-2.5 py-1 rounded border border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300 hover:bg-brand-500/20 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'syncing' : 'sync maltrail'}
          </button>
        </div>
        {syncResult && (
          <div className="rounded border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/40 p-2 mb-3 text-mini font-mono text-emerald-800 dark:text-emerald-300">
            sync complete — {syncResult.created} new skeleton{syncResult.created !== 1 ? 's' : ''}, {syncResult.matched}{' '}
            matched existing, {syncResult.updated} refreshed
          </div>
        )}
        {syncError && (
          <div
            role="alert"
            className="rounded border border-rose-300 dark:border-rose-800 bg-rose-50/60 dark:bg-rose-950/40 p-2 mb-3 text-mini font-mono text-rose-700 dark:text-rose-300"
          >
            {syncError}
          </div>
        )}
        {skeletonsLoading && (
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">Loading skeleton actors…</p>
        )}
        {!skeletonsLoading && skeletons.length === 0 && (
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
            No skeleton actors yet — click <span className="text-brand-600 dark:text-brand-400">sync maltrail</span> to
            discover unmatched apt_*.txt profiles.
          </p>
        )}
        {!skeletonsLoading && skeletons.length > 0 && skeletonMatches.length === 0 && q.trim() && (
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">No skeletons match the current search.</p>
        )}
        {skeletonMatches.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {skeletonMatches.slice(0, 60).map((sk) => (
              <div
                key={sk.slug}
                className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-slate-950 p-2.5"
              >
                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                  <span className="font-display font-semibold text-sm truncate" title={sk.canonical_name}>
                    {sk.canonical_name}
                  </span>
                  <span className="text-micro font-mono uppercase tracking-wider px-1 py-0.5 rounded border border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300 shrink-0">
                    skeleton
                  </span>
                </div>
                <p className="text-micro font-mono text-slate-500 truncate">{sk.slug}</p>
                <a
                  href={`/api/v1/maltrail/fetch?trail=${encodeURIComponent(sk.maltrail_file)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline"
                  title={`Maltrail trail file: ${sk.maltrail_file}`}
                >
                  <Bug size={9} /> {sk.maltrail_file}
                  {typeof sk.ioc_size_bytes === 'number' && (
                    <span className="text-slate-500"> · {Math.round(sk.ioc_size_bytes / 1024)}KB</span>
                  )}
                </a>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
