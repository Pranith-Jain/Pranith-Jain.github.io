import { useState } from 'react';
import type { DomainLookupResponse } from '../../lib/dfir/types';

export function CertList({ certs }: { certs: DomainLookupResponse['certificates'] }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? certs : certs.slice(0, 10);
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      <h3 className="font-display font-bold text-lg mb-3">
        Certificate Transparency{' '}
        <span className="text-sm font-mono text-slate-600 dark:text-slate-400">({certs.length} entries)</span>
      </h3>
      <div className="space-y-2">
        {visible.map((c) => (
          <div key={c.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-display font-semibold text-slate-900 dark:text-slate-100">{c.issuer}</span>
              <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
                {c.not_before.slice(0, 10)} → {c.not_after.slice(0, 10)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {c.subjects.slice(0, 4).map((s) => (
                <span
                  key={s}
                  className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 break-all"
                >
                  {s}
                </span>
              ))}
              {c.subjects.length > 4 && (
                <span className="text-xs font-mono text-slate-500">+{c.subjects.length - 4} more</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {certs.length > 10 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-xs font-mono text-brand-600 dark:text-brand-400 hover:underline"
        >
          {expanded ? 'show less' : `show all ${certs.length}`}
        </button>
      )}
    </section>
  );
}
