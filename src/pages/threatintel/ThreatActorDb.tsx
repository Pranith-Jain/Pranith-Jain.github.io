import { useEffect, useState } from 'react';
import { Database, ExternalLink } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';

export default function ThreatActorDb(): JSX.Element {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let blobUrl: string | null = null;
    fetch('/data/threat-actor-db')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load (${r.status})`);
        return r.text();
      })
      .then((html) => {
        const blob = new Blob([html], { type: 'text/html' });
        blobUrl = URL.createObjectURL(blob);
        setSrc(blobUrl);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, []);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Database size={28} />}
      title="Threat Actor Username Index"
      loading={!src && !error}
      error={error}
      maxWidthClass="max-w-7xl"
      description={
        <>
          Search 102 threat-actor handles across 15 underground forums. Mindmap, 3D force-graph, infinite-scroll
          leaderboard, live vs seized status. Sample dataset from{' '}
          <a
            href="https://pages.sambent.dev/sam/ThreatActorDB/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            sambent.dev
            <ExternalLink size={12} />
          </a>
          .
        </>
      }
    >
      {src && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-lg">
          <iframe
            src={src}
            title="Threat Actor Username Index"
            className="w-full border-0 bg-black"
            style={{ height: 'calc(100vh - 300px)', minHeight: '600px' }}
          />
        </div>
      )}
    </DataPageLayout>
  );
}
