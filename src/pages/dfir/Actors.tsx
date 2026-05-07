import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
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
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-6xl mx-auto px-8 py-12">
        <Link
          to="/dfir"
          className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-[#00fff9] mb-8 font-mono"
        >
          <ArrowLeft size={14} /> /dfir
        </Link>
        <h1 className="text-4xl font-display font-bold mb-2">Threat Actors</h1>
        <p className="text-[#a1a1aa] mb-8 max-w-2xl">
          A catalog of known APT groups, ransomware operators, and threat actors. Click any card for details.
        </p>

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
          <p className="font-mono text-sm text-[#a1a1aa] mt-8">No actors match the current filters.</p>
        )}

        <p className="mt-12 text-xs font-mono text-[#71717a]">
          Showing {filtered.length} of {threatActors.length} actors. Have a STIX 2.1 bundle to ingest? Use the parse API
          at <code>/api/v1/cti/parse</code>.
        </p>
      </div>
    </div>
  );
}
