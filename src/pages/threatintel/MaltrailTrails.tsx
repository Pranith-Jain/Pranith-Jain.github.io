import { useEffect, useRef, useState } from 'react';
import { FileText, Search, Users } from 'lucide-react';
import { IocChip } from '../../components/dfir/IocChip';
import { DataPageLayout } from '../../components/DataPageLayout';

interface TrailFile {
  name: string;
  path: string;
  size: number;
  actors: string[];
}

interface MaltrailResponse {
  ok: boolean;
  total: number;
  files: TrailFile[];
}

interface TrailContent {
  ok: boolean;
  filename: string;
  actors: string[];
  total_iocs: number;
  by_type: Record<string, number>;
  iocs: Array<{ value: string; type: string }>;
  truncated: boolean;
}

export default function MaltrailTrails(): JSX.Element {
  const [files, setFiles] = useState<TrailFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<TrailContent | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const reqRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/v1/maltrail/list')
      .then((r) => (r.ok ? r.json() : Promise.reject(String(r.status))))
      .then((d: MaltrailResponse) => {
        if (alive && d.ok) setFiles(d.files);
        else if (alive) setError('Failed to load trail list');
      })
      .catch((e: unknown) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const fetchTrail = (name: string) => {
    reqRef.current = name;
    setSelected(name);
    setContent(null);
    setContentLoading(true);
    fetch(`/api/v1/maltrail/fetch?trail=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(String(r.status))))
      .then((d: TrailContent) => {
        if (reqRef.current !== name) return; // stale response, a newer trail was clicked
        if (d.ok) setContent(d);
      })
      .catch(() => {
        /* silent */
      })
      .finally(() => {
        if (reqRef.current === name) setContentLoading(false);
      });
  };

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Users size={28} />}
      title="Maltrail APT Trails"
      maxWidthClass="max-w-6xl"
      loading={loading}
      error={error}
      headerExtra={
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400 max-w-3xl">
          Curated APT IOC trail files from{' '}
          <a
            href="https://github.com/stamparm/maltrail"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            stamparm/maltrail
          </a>{' '}
          — per-actor indicator lists maintained by Miroslav Stampar. Each file contains known IPs, domains, and hashes
          associated with a specific APT group.
        </p>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar — trail file list */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h2 className="font-display font-semibold text-sm mb-3 flex items-center gap-2">
              <FileText size={15} className="text-brand-600 dark:text-brand-400" />
              Trail files ({files?.length ?? '…'})
            </h2>
            {files && (
              <div className="space-y-1 max-h-[70vh] overflow-y-auto">
                {files.map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    onClick={() => fetchTrail(f.name)}
                    className={`w-full text-left px-2.5 py-2 rounded text-xs font-mono transition-colors truncate ${
                      selected === f.name
                        ? 'bg-brand-500/10 border border-brand-500/30 text-brand-700 dark:text-brand-300'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-950 border border-transparent text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="font-semibold truncate">{f.name.replace(/\.txt$/i, '')}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {f.actors?.[0] ?? '—'} · {(f.size / 1024).toFixed(1)} KB
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main — trail content */}
        <div className="lg:col-span-2">
          {!selected && !contentLoading && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
              <Search size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-mono text-slate-500">Select a trail file from the list to view its IOCs.</p>
            </div>
          )}

          {contentLoading && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
              <p role="status" aria-live="polite" className="text-xs font-mono text-slate-500 animate-pulse">
                fetching trail file…
              </p>
            </div>
          )}

          {content && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display font-semibold text-base">{content.filename}</h2>
                  <div className="flex items-center gap-3 text-[11px] font-mono text-slate-500">
                    <span>{content.total_iocs} IOCs</span>
                    {Object.entries(content.by_type).map(([t, c]) => (
                      <span key={t} className="text-[10px] uppercase">
                        {t}: {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[11px] font-mono text-slate-500">Actors: {content.actors.join(', ')}</span>
                </div>
                {content.truncated && (
                  <p className="text-[11px] font-mono text-amber-600 dark:text-amber-400 mt-2">
                    Showing first 5000 IOCs — file contains more.
                  </p>
                )}
              </div>
              <div className="max-h-[65vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-950 sticky top-0">
                    <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-slate-500">
                      <th scope="col" className="px-4 py-2">
                        Value
                      </th>
                      <th scope="col" className="px-4 py-2 w-20">
                        Type
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {content.iocs.map((ioc, i) => (
                      <tr
                        key={i}
                        className="border-t border-slate-100 dark:border-slate-800 font-mono text-[12px] hover:bg-slate-50 dark:hover:bg-slate-950"
                      >
                        <td className="px-4 py-1.5">
                          <IocChip value={ioc.value} bare size="sm" pivots={false} className="min-w-0" />
                        </td>
                        <td className="px-4 py-1.5">
                          <span className="text-[10px] uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded px-1 py-0.5">
                            {ioc.type}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </DataPageLayout>
  );
}
