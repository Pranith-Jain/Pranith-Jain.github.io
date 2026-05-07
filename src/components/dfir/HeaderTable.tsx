import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const PRIORITY_KEYS = [
  'from',
  'to',
  'subject',
  'date',
  'reply-to',
  'return-path',
  'message_id',
  'authentication-results',
];

interface HeaderTableProps {
  headers: Record<string, string | number | undefined>;
}

export function HeaderTable({ headers }: HeaderTableProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const priorityEntries: [string, string | number][] = [];
  const otherEntries: [string, string | number][] = [];

  for (const [k, v] of Object.entries(headers)) {
    if (k === '_received_hops') continue;
    if (v === undefined) continue;
    if (PRIORITY_KEYS.includes(k)) {
      priorityEntries.push([k, v]);
    } else {
      otherEntries.push([k, v]);
    }
  }

  // Sort priority entries by the PRIORITY_KEYS order
  priorityEntries.sort((a, b) => PRIORITY_KEYS.indexOf(a[0]) - PRIORITY_KEYS.indexOf(b[0]));

  const hops = headers['_received_hops'] as number | undefined;
  const displayEntries = expanded ? [...priorityEntries, ...otherEntries] : priorityEntries;

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      <h2 className="font-display font-bold text-xl mb-4">Email Headers</h2>
      {hops !== undefined && (
        <div className="mb-4 text-xs font-mono text-slate-600 dark:text-slate-400">
          Received hops:{' '}
          <span
            className={`font-semibold ${hops > 8 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'}`}
          >
            {hops}
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-mono">
          <tbody>
            {displayEntries.map(([key, value]) => (
              <tr key={key} className="border-b border-slate-200 dark:border-slate-800 last:border-0">
                <td className="py-2 pr-4 text-slate-600 dark:text-slate-400 align-top whitespace-nowrap w-40">{key}</td>
                <td className="py-2 text-slate-900 dark:text-slate-100 break-all whitespace-pre-wrap">
                  {String(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {otherEntries.length > 0 && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 flex items-center gap-1 text-xs font-mono text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Show less' : `Show ${otherEntries.length} more header${otherEntries.length > 1 ? 's' : ''}`}
        </button>
      )}
    </section>
  );
}
