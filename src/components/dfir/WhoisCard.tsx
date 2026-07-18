import type { DomainLookupResponse } from '../../lib/dfir/types';
import { ExternalLink } from 'lucide-react';

export function WhoisCard({ rdap }: { rdap: DomainLookupResponse['rdap'] }): JSX.Element {
  if (rdap.error) {
    return (
      <section className="surface-card p-6">
        <h3 className="font-display font-bold text-lg mb-3">WHOIS / RDAP</h3>
        <p className="font-mono text-sm text-rose-600 dark:text-rose-400">error: {rdap.error}</p>
      </section>
    );
  }
  const fmt = (s?: string) => (s ? new Date(s).toISOString().slice(0, 10) : '—');
  const fmtDateTime = (s?: string) => (s ? new Date(s).toISOString().replace('T', ' ').slice(0, 19) + 'Z' : '—');
  return (
    <section className="surface-card p-6">
      <h3 className="font-display font-bold text-lg mb-3">WHOIS / RDAP</h3>

      {/* Registration Details */}
      <div className="mb-4">
        <span className="text-xs text-muted font-mono uppercase tracking-wider">Registration Details</span>
        <dl className="mt-2 grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 text-sm font-mono">
          {rdap.registry_domain_id && (
            <>
              <dt className="text-muted">Domain ID</dt>
              <dd className="text-slate-900 dark:text-slate-100">{rdap.registry_domain_id}</dd>
            </>
          )}
          <dt className="text-muted">Created</dt>
          <dd className="text-slate-900 dark:text-slate-100">{fmtDateTime(rdap.created)}</dd>
          <dt className="text-muted">Updated</dt>
          <dd className="text-slate-900 dark:text-slate-100">{fmtDateTime(rdap.updated)}</dd>
          <dt className="text-muted">Expires</dt>
          <dd className="text-slate-900 dark:text-slate-100">{fmt(rdap.expires)}</dd>
          {rdap.dnssec && (
            <>
              <dt className="text-muted">DNSSEC</dt>
              <dd
                className={
                  rdap.dnssec === 'signed'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-900 dark:text-slate-100'
                }
              >
                {rdap.dnssec}
              </dd>
            </>
          )}
        </dl>
      </div>

      {/* Registrar Details */}
      <div className="mb-4">
        <span className="text-xs text-muted font-mono uppercase tracking-wider">Registrar</span>
        <dl className="mt-2 grid grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 text-sm font-mono">
          <dt className="text-muted">Name</dt>
          <dd className="text-slate-900 dark:text-slate-100">{rdap.registrar ?? '—'}</dd>
          {rdap.registrar_iana_id && (
            <>
              <dt className="text-muted">IANA ID</dt>
              <dd className="text-slate-900 dark:text-slate-100">{rdap.registrar_iana_id}</dd>
            </>
          )}
          {rdap.registrar_abuse_email && (
            <>
              <dt className="text-muted">Abuse Email</dt>
              <dd>
                <a
                  href={`mailto:${rdap.registrar_abuse_email}`}
                  className="text-brand-600 dark:text-brand-400 hover:underline"
                >
                  {rdap.registrar_abuse_email}
                </a>
              </dd>
            </>
          )}
          {rdap.registrar_abuse_phone && (
            <>
              <dt className="text-muted">Abuse Phone</dt>
              <dd className="text-slate-900 dark:text-slate-100">{rdap.registrar_abuse_phone}</dd>
            </>
          )}
          {rdap.registrar_url && (
            <>
              <dt className="text-muted">Info</dt>
              <dd>
                <a
                  href={rdap.registrar_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
                >
                  ICANN Registrar <ExternalLink size={10} />
                </a>
              </dd>
            </>
          )}
        </dl>
      </div>

      {/* Name Servers */}
      {rdap.nameservers.length > 0 && (
        <div className="mb-4">
          <span className="text-xs text-muted font-mono uppercase tracking-wider">Name Servers</span>
          <ul className="mt-1 space-y-0.5 text-sm font-mono text-slate-900 dark:text-slate-100">
            {rdap.nameservers.map((ns) => (
              <li key={ns}>{ns.toLowerCase()}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Domain Status */}
      {rdap.status.length > 0 && (
        <div>
          <span className="text-xs text-muted font-mono uppercase tracking-wider">Domain Status</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {rdap.status.map((s) => {
              // Parse status URL if present (e.g., "ok https://icann.org/epp#ok")
              const parts = s.split(' ');
              const statusName = parts[0];
              const statusUrl = parts.length > 1 ? parts[1] : undefined;
              return (
                <span
                  key={s}
                  className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-muted border border-slate-200 dark:border-[rgb(var(--border-400))]"
                >
                  {statusUrl ? (
                    <a
                      href={statusUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                      title={statusUrl}
                    >
                      {statusName}
                    </a>
                  ) : (
                    statusName
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
