import { useState } from 'react';
import { ChevronRight, FileText, Folder } from 'lucide-react';

/** Mirrors api/src/lib/host-intel.ts HostArtifact. */
export interface HostArtifact {
  name: string;
  kind: 'file' | 'service' | 'leak';
  type: string;
  size?: number;
  http_status?: number;
  last_seen?: string;
  source: string;
  tags: string[];
}

const TAG_COLORS: Record<string, string> = {
  'git-exposure': 'text-rose-600 dark:text-rose-400 border-rose-300/50 dark:border-rose-500/30',
  credentials: 'text-rose-600 dark:text-rose-400 border-rose-300/50 dark:border-rose-500/30',
  c2: 'text-rose-600 dark:text-rose-400 border-rose-300/50 dark:border-rose-500/30',
  exploit: 'text-rose-600 dark:text-rose-400 border-rose-300/50 dark:border-rose-500/30',
  'active-directory': 'text-amber-600 dark:text-amber-400 border-amber-300/50 dark:border-amber-500/30',
  mitm: 'text-amber-600 dark:text-amber-400 border-amber-300/50 dark:border-amber-500/30',
  database: 'text-amber-600 dark:text-amber-400 border-amber-300/50 dark:border-amber-500/30',
  config: 'text-amber-600 dark:text-amber-400 border-amber-300/50 dark:border-amber-500/30',
  tunnel: 'text-sky-600 dark:text-sky-400 border-sky-300/50 dark:border-sky-500/30',
  scanner: 'text-sky-600 dark:text-sky-400 border-sky-300/50 dark:border-sky-500/30',
  history: 'text-slate-600 dark:text-slate-400 border-slate-300/50 dark:border-slate-600/40',
  'source-code': 'text-slate-600 dark:text-slate-400 border-slate-300/50 dark:border-slate-600/40',
  archive: 'text-slate-600 dark:text-slate-400 border-slate-300/50 dark:border-slate-600/40',
};

/** Map a risk tag to the most relevant MITRE ATT&CK technique. */
const TAG_MITRE: Record<string, { id: string; name: string }> = {
  'git-exposure': { id: 'T1213', name: 'Data from Information Repositories' },
  credentials: { id: 'T1552', name: 'Unsecured Credentials' },
  c2: { id: 'T1071', name: 'Application Layer Protocol' },
  exploit: { id: 'T1203', name: 'Exploitation for Client Execution' },
  'active-directory': { id: 'T1087', name: 'Account Discovery' },
  mitm: { id: 'T1557', name: 'Adversary-in-the-Middle' },
  database: { id: 'T1213', name: 'Data from Information Repositories' },
  tunnel: { id: 'T1572', name: 'Protocol Tunneling' },
  scanner: { id: 'T1595', name: 'Active Scanning' },
  history: { id: 'T1552.003', name: 'Bash History' },
};

function formatSize(bytes?: number): string {
  if (bytes === undefined || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}

function TagBadge({ tag }: { tag: string }): JSX.Element {
  const color = TAG_COLORS[tag] ?? 'text-slate-600 dark:text-slate-400 border-slate-300/50 dark:border-slate-600/40';
  return <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${color}`}>{tag}</span>;
}

function ArtifactRow({ artifact }: { artifact: HostArtifact }): JSX.Element {
  const [open, setOpen] = useState(false);
  const isDir = artifact.type === 'DIR';
  const mitre = artifact.tags.map((t) => TAG_MITRE[t]).find(Boolean);

  return (
    <>
      <tr
        onClick={() => setOpen((o) => !o)}
        className="border-t border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
      >
        <td className="py-2.5 pl-2 pr-3">
          <div className="flex items-center gap-2">
            <ChevronRight
              size={12}
              className={`text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
            />
            {isDir ? (
              <Folder size={14} className="text-amber-500 dark:text-amber-400 shrink-0" />
            ) : (
              <FileText size={14} className="text-slate-400 shrink-0" />
            )}
            <span className="font-mono text-sm text-slate-900 dark:text-slate-100 truncate">{artifact.name}</span>
            {artifact.tags.map((t) => (
              <TagBadge key={t} tag={t} />
            ))}
          </div>
        </td>
        <td className="py-2.5 px-3 font-mono text-xs text-slate-500 dark:text-slate-400">{artifact.type}</td>
        <td className="py-2.5 px-3 font-mono text-xs text-slate-500 dark:text-slate-400 text-right">
          {formatSize(artifact.size)}
        </td>
        <td className="py-2.5 px-3 text-right">
          {artifact.http_status ? (
            <span className="font-mono text-xs text-amber-600 dark:text-amber-400 border border-amber-300/50 dark:border-amber-500/30 rounded px-1.5 py-0.5">
              {artifact.http_status}
            </span>
          ) : (
            <span className="font-mono text-xs text-slate-400 dark:text-slate-600">—</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50/60 dark:bg-slate-800/20">
          <td colSpan={4} className="px-9 py-3">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 font-mono text-xs">
              <div className="flex gap-2">
                <dt className="text-slate-400 dark:text-slate-500 w-24">kind</dt>
                <dd className="text-slate-700 dark:text-slate-300">{artifact.kind}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-400 dark:text-slate-500 w-24">source</dt>
                <dd className="text-slate-700 dark:text-slate-300">{artifact.source}</dd>
              </div>
              {artifact.last_seen && (
                <div className="flex gap-2">
                  <dt className="text-slate-400 dark:text-slate-500 w-24">last seen</dt>
                  <dd className="text-slate-700 dark:text-slate-300">{artifact.last_seen}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-slate-400 dark:text-slate-500 w-24">classification</dt>
                <dd className="text-slate-700 dark:text-slate-300">
                  {artifact.tags.length ? artifact.tags.join(', ') : 'unclassified'}
                </dd>
              </div>
              {mitre && (
                <div className="flex gap-2">
                  <dt className="text-slate-400 dark:text-slate-500 w-24">MITRE</dt>
                  <dd>
                    <span className="text-rose-600 dark:text-rose-400 border border-rose-300/50 dark:border-rose-500/30 rounded px-1.5 py-0.5">
                      {mitre.id}
                    </span>{' '}
                    <span className="text-slate-600 dark:text-slate-400">{mitre.name}</span>
                  </dd>
                </div>
              )}
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

export function ArtifactTable({ artifacts }: { artifacts: HostArtifact[] }): JSX.Element {
  if (artifacts.length === 0) {
    return <p className="font-mono text-sm text-slate-500 dark:text-slate-400">No artifacts found.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-left">
            <th className="py-2 pl-2 pr-3 font-mono text-xs uppercase text-slate-400 dark:text-slate-500">Name</th>
            <th className="py-2 px-3 font-mono text-xs uppercase text-slate-400 dark:text-slate-500">Type</th>
            <th className="py-2 px-3 font-mono text-xs uppercase text-slate-400 dark:text-slate-500 text-right">Size</th>
            <th className="py-2 px-3 font-mono text-xs uppercase text-slate-400 dark:text-slate-500 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {artifacts.map((a, i) => (
            <ArtifactRow key={`${a.source}:${a.name}:${i}`} artifact={a} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
