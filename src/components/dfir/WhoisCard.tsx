import type { DomainLookupResponse } from '../../lib/dfir/types';

export function WhoisCard({ rdap }: { rdap: DomainLookupResponse['rdap'] }): JSX.Element {
  if (rdap.error) {
    return (
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <h3 className="font-display font-bold text-lg mb-3">WHOIS</h3>
        <p className="font-mono text-sm text-rose-600 dark:text-rose-400">error: {rdap.error}</p>
      </section>
    );
  }
  const fmt = (s?: string) => (s ? new Date(s).toISOString().slice(0, 10) : '—');
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      <h3 className="font-display font-bold text-lg mb-3">WHOIS</h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm font-mono">
        <dt className="text-slate-600 dark:text-slate-400">Registrar</dt>
        <dd className="text-slate-900 dark:text-slate-100">{rdap.registrar ?? '—'}</dd>
        <dt className="text-slate-600 dark:text-slate-400">Created</dt>
        <dd className="text-slate-900 dark:text-slate-100">{fmt(rdap.created)}</dd>
        <dt className="text-slate-600 dark:text-slate-400">Expires</dt>
        <dd className="text-slate-900 dark:text-slate-100">{fmt(rdap.expires)}</dd>
        <dt className="text-slate-600 dark:text-slate-400">Updated</dt>
        <dd className="text-slate-900 dark:text-slate-100">{fmt(rdap.updated)}</dd>
      </dl>
      {rdap.nameservers.length > 0 && (
        <div className="mt-4">
          <span className="text-xs text-slate-600 dark:text-slate-400 font-mono uppercase tracking-wider">
            Name servers
          </span>
          <ul className="mt-1 space-y-0.5 text-sm font-mono text-slate-900 dark:text-slate-100">
            {rdap.nameservers.map((ns) => (
              <li key={ns}>{ns.toLowerCase()}</li>
            ))}
          </ul>
        </div>
      )}
      {rdap.status.length > 0 && (
        <div className="mt-4">
          <span className="text-xs text-slate-600 dark:text-slate-400 font-mono uppercase tracking-wider">Status</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {rdap.status.map((s) => (
              <span
                key={s}
                className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
