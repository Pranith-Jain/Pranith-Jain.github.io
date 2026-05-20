import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft } from 'lucide-react';
import { threatActors, type ActorStatus, type Sophistication } from '../../data/dfir/threat-actors';
import { ActorCard } from '../../components/dfir/ActorCard';
import { ActorFilterBar } from '../../components/dfir/ActorFilterBar';

export default function Actors(): JSX.Element {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | ActorStatus>('all');
  const [sophistication, setSophistication] = useState<'all' | Sophistication>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return threatActors.filter((a) => {
      if (status !== 'all' && a.status !== status) return false;
      if (sophistication !== 'all' && a.sophistication !== sophistication) return false;
      if (q) {
        const hay = (a.name + ' ' + a.aliases.join(' ')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [search, status, sophistication]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2">Threat Actors</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          A catalog of known APT groups, ransomware operators, and threat actors. Click any card for details.
        </p>
      </div>

      <ActorFilterBar
        search={search}
        setSearch={setSearch}
        status={status}
        setStatus={setStatus}
        sophistication={sophistication}
        setSophistication={setSophistication}
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((a) => (
          <ActorCard key={a.slug} actor={a} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="font-mono text-sm text-slate-600 dark:text-slate-400 mt-8">
          No actors match the current filters.
        </p>
      )}

      <p className="mt-12 text-xs font-mono text-slate-500">
        Showing {filtered.length} of {threatActors.length} actors.
      </p>

      <section className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-2">
          Have a STIX 2.1 bundle?
        </h2>
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          Open the{' '}
          <Link to="/dfir/stix" className="text-brand-600 dark:text-brand-400 hover:underline font-semibold">
            STIX Viewer
          </Link>{' '}
          to paste a bundle and explore the relationship graph in your browser.
        </p>
      </section>
    </div>
  );
}
