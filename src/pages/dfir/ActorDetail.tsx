import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, ShieldAlert } from 'lucide-react';
import { threatActors } from '../../data/dfir/threat-actors';
import DiamondModelSection from './DiamondModelSection';

interface ActorCvesResponse {
  cves: string[];
  count: number;
}

export default function ActorDetail(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const actor = threatActors.find((a) => a.slug === slug);
  const [linkedCves, setLinkedCves] = useState<string[] | null>(null);
  const [cvesLoading, setCvesLoading] = useState(false);

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

  if (!actor) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-20 text-slate-900 dark:text-slate-100">
        <Link
          to="/threatintel/actors"
          className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
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
        to="/threatintel/actors"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>

      <div className="animate-fade-in-up mb-8">
        <h1 className="text-5xl font-display font-bold mb-3">{actor.name}</h1>
        {actor.aliases.length > 0 && (
          <p className="text-base font-mono text-slate-600 dark:text-slate-400 mb-4">aka {actor.aliases.join(', ')}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <span
            className={`text-xs font-mono px-2 py-1 rounded border ${
              actor.status === 'active'
                ? 'bg-emerald-500/15 dark:bg-emerald-400/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700'
            }`}
          >
            {actor.status}
          </span>
          <span className="text-xs font-mono px-2 py-1 rounded border bg-brand-500/15 dark:bg-brand-400/15 text-brand-600 dark:text-brand-400 border-brand-500/40">
            {actor.sophistication}
          </span>
          {actor.country && (
            <span className="text-xs font-mono px-2 py-1 rounded border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
              {actor.country}
            </span>
          )}
        </div>
      </div>

      <section className="mb-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <p className="text-base text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-line">
          {actor.description}
        </p>
      </section>

      <div className="grid sm:grid-cols-2 gap-6 mb-8">
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="font-display font-bold text-lg mb-3">Motivation</h2>
          <p className="font-mono text-sm text-slate-900 dark:text-slate-100">{actor.motivation}</p>
          {actor.active_since && (
            <p className="mt-2 font-mono text-xs text-slate-600 dark:text-slate-400">
              active since: {actor.active_since}
            </p>
          )}
          {actor.last_activity && (
            <p className="font-mono text-xs text-slate-600 dark:text-slate-400">last activity: {actor.last_activity}</p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h2 className="font-display font-bold text-lg mb-3">Targets</h2>
          <ul className="space-y-1 text-sm font-mono text-slate-600 dark:text-slate-400">
            {actor.targets.map((t) => (
              <li key={t}>· {t}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mb-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <h2 className="font-display font-bold text-lg mb-3">Malware &amp; Tools</h2>
        {actor.malware.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {actor.malware.map((m) => (
              <span
                key={m}
                className="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800"
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

      <section className="mb-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <h2 className="font-display font-bold text-lg mb-1 inline-flex items-center gap-2">
          <ShieldAlert size={18} className="text-rose-500" /> Linked CVEs
          {linkedCves && linkedCves.length > 0 && (
            <span className="text-xs font-mono text-slate-500">· {linkedCves.length}</span>
          )}
        </h2>
        <p className="text-[11px] font-mono text-slate-500 mb-3">
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

      <section className="mb-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <h2 className="font-display font-bold text-lg mb-3">MITRE ATT&amp;CK Techniques</h2>
        <div className="flex flex-wrap gap-2">
          {actor.techniques.map((t) => (
            <a
              key={t}
              href={`https://attack.mitre.org/techniques/${t.replace('.', '/')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-brand-600 dark:text-brand-400 border border-slate-200 dark:border-slate-800 hover:border-brand-500/40"
            >
              {t}
            </a>
          ))}
        </div>
      </section>

      {actor.references && actor.references.length > 0 && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
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
