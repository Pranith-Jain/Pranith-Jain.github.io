import type { DomainLookupResponse } from '../../lib/dfir/types';

const ORDER = ['A', 'AAAA', 'MX', 'NS', 'CNAME', 'TXT', 'SOA', 'CAA'] as const;

export function DnsRecordList({ dns }: { dns: DomainLookupResponse['dns'] }): JSX.Element {
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      <h3 className="font-display font-bold text-lg mb-3">DNS Records</h3>
      <div className="space-y-3">
        {ORDER.map((t) => {
          const r = dns[t];
          if (!r || r.records.length === 0) return null;
          return (
            <div key={t}>
              <span className="text-xs font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400">{t}</span>
              <ul className="mt-1 space-y-0.5">
                {r.records.map((rec, i) => (
                  <li key={i} className="text-sm font-mono text-slate-900 dark:text-slate-100 break-all">
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
