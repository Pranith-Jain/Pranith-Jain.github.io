import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, ShieldAlert, Sparkles } from 'lucide-react';
import { threatActors } from '../../data/dfir/threat-actors';
import DiamondModelSection from './DiamondModelSection';

interface ActorCvesResponse {
  cves: string[];
  count: number;
}

interface ActorProfileResponse {
  name: string;
  aliases: string[];
  slug: string;
  profile: {
    malpedia?:
      { name?: string; description?: string; refs?: Array<{ url: string; title?: string }> } | { error?: string };
    maltrail?: Array<{ filename: string; displayName: string; size: number }>;
    otx_pulses?: Array<{ id: string; name: string; tags?: string[]; created?: string }>;
    timeline?: { events?: Array<{ date?: string; event: string; source?: string }> } | { events?: never[] } | unknown;
    dna?: {
      techniques?: Array<{ id: string; count?: number }>;
      software?: Array<{ name: string; count?: number }>;
      sectors?: Array<{ name: string; count?: number }>;
    };
    skeleton?: { canonical_name?: string; description?: string } | { skipped?: string };
    briefings?: unknown;
  };
  linked_cves: string[];
  sources: Array<{ source: string; ok: boolean; error?: string; ms: number }>;
}

export default function ActorDetail(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const actor = threatActors.find((a) => a.slug === slug);
  const [linkedCves, setLinkedCves] = useState<string[] | null>(null);
  const [cvesLoading, setCvesLoading] = useState(false);
  const [profile, setProfile] = useState<ActorProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    if (!actor) return;
    let cancelled = false;
    setCvesLoading(true);
    const aliases = encodeURIComponent(actor.aliases.join(','));
    fetch(`/api/v1/actor-cves?slug=${encodeURIComponent(actor.slug)}&aliases=${aliases}`)
      .then((r) => (r.ok ? (r.json() as Promise<ActorCvesResponse>) : null))
      .then((d) => {
        if (!cancelled) setLinkedCves(d?.cves ?? []);
      })
      .catch(() => {
        if (!cancelled) setLinkedCves([]);
      })
      .finally(() => {
        if (!cancelled) setCvesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [actor]);

  // Live enrichment from the aggregator — pulls Malpedia, OTX, Maltrail,
  // DNA, skeleton profile, and briefings in one call. Renders as a
  // "Live Intelligence" section below the curated content.
  useEffect(() => {
    if (!actor) return;
    let cancelled = false;
    setProfileLoading(true);
    const params = new URLSearchParams({ name: actor.name });
    if (actor.aliases.length > 0) params.set('aliases', actor.aliases.join(','));
    if (actor.malware.length > 0) params.set('software', actor.malware.join(','));
    fetch(`/api/v1/actor-profile?${params.toString()}`)
      .then((r) => (r.ok ? (r.json() as Promise<ActorProfileResponse>) : null))
      .then((d) => {
        if (!cancelled) setProfile(d);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [actor]);

  if (!actor) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12 sm:py-20 text-slate-900 dark:text-slate-100">
        <Link
          to="/threatintel/catalog?cat=actors"
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
        >
          <ArrowLeft size={14} /> back
        </Link>
        <h1 className="font-display font-bold text-3xl">Actor not found</h1>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel/catalog?cat=actors"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-5xl font-display font-bold mb-3">{actor.name}</h1>
        {actor.aliases.length > 0 && (
          <p className="text-base font-mono text-muted mb-4">aka {actor.aliases.join(', ')}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <span
            className={`text-xs font-mono px-2 py-1 rounded border ${
              actor.status === 'active'
                ? 'bg-emerald-500/15 dark:bg-emerald-400/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
                : 'bg-slate-200 dark:bg-[rgb(var(--surface-300))] text-slate-500 border-slate-300 dark:border-[rgb(var(--border-400))]'
            }`}
          >
            {actor.status}
          </span>
          <span className="text-xs font-mono px-2 py-1 rounded border bg-brand-500/15 dark:bg-brand-400/15 text-brand-600 dark:text-brand-400 border-brand-500/40">
            {actor.sophistication}
          </span>
          {actor.country && (
            <span className="text-xs font-mono px-2 py-1 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] text-muted">
              {actor.country}
            </span>
          )}
        </div>
      </div>

      <section className="mb-8 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-6">
        <p className="text-base text-muted leading-relaxed whitespace-pre-line">{actor.description}</p>
      </section>

      <div className="grid sm:grid-cols-2 gap-6 mb-8">
        <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-6">
          <h2 className="font-display font-bold text-lg mb-3">Motivation</h2>
          <p className="font-mono text-sm text-slate-900 dark:text-slate-100">{actor.motivation}</p>
          {actor.active_since && (
            <p className="mt-2 font-mono text-xs text-muted">active since: {actor.active_since}</p>
          )}
          {actor.last_activity && <p className="font-mono text-xs text-muted">last activity: {actor.last_activity}</p>}
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-6">
          <h2 className="font-display font-bold text-lg mb-3">Targets</h2>
          <ul className="space-y-1 text-sm font-mono text-muted">
            {actor.targets.map((t) => (
              <li key={t}>· {t}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mb-8 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-6">
        <h2 className="font-display font-bold text-lg mb-3">Malware &amp; Tools</h2>
        {actor.malware.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {actor.malware.map((m) => (
              <span
                key={m}
                className="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-[rgb(var(--border-400))]"
              >
                {m}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm font-mono text-slate-500">No specific malware attributed.</p>
        )}
      </section>

      <DiamondModelSection actor={actor} />

      <section className="mb-8 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-6">
        <h2 className="font-display font-bold text-lg mb-1 inline-flex items-center gap-2">
          <ShieldAlert size={18} className="text-rose-500" /> Linked CVEs
          {linkedCves && linkedCves.length > 0 && (
            <span className="text-xs font-mono text-slate-500">· {linkedCves.length}</span>
          )}
        </h2>
        <p className="text-mini font-mono text-slate-400 mb-3">
          CVEs publicly attributed to {actor.name} via CISA advisories, vendor PSIRT bulletins, and IR write-ups.
          Curated — narrow by design (does not include unattributed KEV entries).
        </p>
        {cvesLoading && <p className="text-xs font-mono text-slate-500">Loading attribution…</p>}
        {!cvesLoading && linkedCves && linkedCves.length === 0 && (
          <p className="text-xs font-mono text-slate-500">
            No CVEs are publicly attributed to this actor in our curated mapping. KEV-flagged exploits without
            named-actor attribution are not shown here.
          </p>
        )}
        {!cvesLoading && linkedCves && linkedCves.length > 0 && (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {linkedCves.map((cve) => (
              <Link
                key={cve}
                to={`/dfir/cve?id=${encodeURIComponent(cve)}`}
                className="block rounded border border-rose-400/30 hover:border-brand-500/40 bg-rose-50/40 dark:bg-rose-950/20 px-3 py-2 transition-colors font-mono text-sm text-slate-900 dark:text-slate-100"
              >
                {cve}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Live Intelligence — pulled from the /api/v1/actor-profile aggregator. */}
      <section className="mb-8 rounded-xl border border-brand-300/40 dark:border-brand-700/40 bg-brand-50/30 dark:bg-brand-950/20 p-6">
        <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-brand-500" /> Live Intelligence
          <span className="text-xs font-mono text-slate-500 ml-1">
            ·{' '}
            {profileLoading
              ? 'fetching…'
              : profile
                ? `${profile.sources.filter((s) => s.ok).length}/${profile.sources.length} sources`
                : 'offline'}
          </span>
        </h2>
        {!profile && !profileLoading && (
          <p className="text-xs font-mono text-slate-500">
            Live enrichment offline — curated data above still applies.
          </p>
        )}
        {profile && (
          <div className="space-y-4">
            {/* Malpedia */}
            {profile.profile.malpedia && !(profile.profile.malpedia as { error?: string }).error && (
              <div>
                <div className="text-mini font-mono uppercase tracking-wider text-slate-500 mb-1">Malpedia</div>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {(profile.profile.malpedia as { description?: string }).description ?? 'No description'}
                </p>
              </div>
            )}
            {/* OTX Pulses */}
            {profile.profile.otx_pulses && profile.profile.otx_pulses.length > 0 && (
              <div>
                <div className="text-mini font-mono uppercase tracking-wider text-slate-500 mb-1">
                  OTX Pulses ({profile.profile.otx_pulses.length})
                </div>
                <ul className="space-y-1 text-sm">
                  {profile.profile.otx_pulses.slice(0, 5).map((p) => (
                    <li key={p.id} className="font-mono text-slate-700 dark:text-slate-300">
                      <a
                        href={`https://otx.alienvault.com/pulse/${p.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        {p.name}
                      </a>
                      {p.tags && p.tags.length > 0 && (
                        <span className="text-xs text-slate-500 ml-2">[{p.tags.slice(0, 4).join(', ')}]</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Skeleton */}
            {profile.profile.skeleton && !(profile.profile.skeleton as { skipped?: string }).skipped && (
              <div>
                <div className="text-mini font-mono uppercase tracking-wider text-slate-500 mb-1">
                  Maltrail Skeleton
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {(profile.profile.skeleton as { description?: string }).description ?? 'Profile present'}
                </p>
              </div>
            )}
            {/* DNA top techniques */}
            {profile.profile.dna &&
              Array.isArray((profile.profile.dna as { techniques?: unknown[] }).techniques) &&
              (profile.profile.dna as { techniques: unknown[] }).techniques.length > 0 && (
                <div>
                  <div className="text-mini font-mono uppercase tracking-wider text-slate-500 mb-1">Top Techniques</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(profile.profile.dna as { techniques: Array<{ id: string; count?: number }> }).techniques
                      .slice(0, 10)
                      .map((t) => (
                        <a
                          key={t.id}
                          href={`https://attack.mitre.org/techniques/${t.id.replace('.', '/')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-brand-600 dark:text-brand-400 border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40"
                        >
                          {t.id}
                          {t.count ? ` (${t.count})` : ''}
                        </a>
                      ))}
                  </div>
                </div>
              )}
            {/* Union of curated + live CVEs */}
            {profile.linked_cves.length > 0 && (
              <div>
                <div className="text-mini font-mono uppercase tracking-wider text-slate-500 mb-1">
                  Live CVE Count: {profile.linked_cves.length} (curated + live)
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mb-8 rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-6">
        <h2 className="font-display font-bold text-lg mb-3">MITRE ATT&amp;CK Techniques</h2>
        <div className="flex flex-wrap gap-2">
          {actor.techniques.map((t) => (
            <a
              key={t}
              href={`https://attack.mitre.org/techniques/${t.replace('.', '/')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-brand-600 dark:text-brand-400 border border-slate-200 dark:border-[rgb(var(--border-400))] hover:border-brand-500/40"
            >
              {t}
            </a>
          ))}
        </div>
      </section>

      {actor.references && actor.references.length > 0 && (
        <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] p-6">
          <h2 className="font-display font-bold text-lg mb-3">References</h2>
          <ul className="space-y-2">
            {actor.references.map((r) => (
              <li key={r}>
                <a
                  href={r}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                >
                  {r} <ExternalLink size={10} />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
