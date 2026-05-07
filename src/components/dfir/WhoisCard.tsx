import type { DomainLookupResponse } from '../../lib/dfir/types';

export function WhoisCard({ rdap }: { rdap: DomainLookupResponse['rdap'] }): JSX.Element {
  if (rdap.error) {
    return (
      <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
        <h3 className="font-display font-bold text-lg mb-3">WHOIS</h3>
        <p className="font-mono text-sm text-[#ef4444]">error: {rdap.error}</p>
      </section>
    );
  }
  const fmt = (s?: string) => (s ? new Date(s).toISOString().slice(0, 10) : '—');
  return (
    <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
      <h3 className="font-display font-bold text-lg mb-3">WHOIS</h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm font-mono">
        <dt className="text-[#a1a1aa]">Registrar</dt>
        <dd className="text-[#fafafa]">{rdap.registrar ?? '—'}</dd>
        <dt className="text-[#a1a1aa]">Created</dt>
        <dd className="text-[#fafafa]">{fmt(rdap.created)}</dd>
        <dt className="text-[#a1a1aa]">Expires</dt>
        <dd className="text-[#fafafa]">{fmt(rdap.expires)}</dd>
        <dt className="text-[#a1a1aa]">Updated</dt>
        <dd className="text-[#fafafa]">{fmt(rdap.updated)}</dd>
      </dl>
      {rdap.nameservers.length > 0 && (
        <div className="mt-4">
          <span className="text-xs text-[#a1a1aa] font-mono uppercase tracking-wider">Name servers</span>
          <ul className="mt-1 space-y-0.5 text-sm font-mono text-[#fafafa]">
            {rdap.nameservers.map((ns) => (
              <li key={ns}>{ns.toLowerCase()}</li>
            ))}
          </ul>
        </div>
      )}
      {rdap.status.length > 0 && (
        <div className="mt-4">
          <span className="text-xs text-[#a1a1aa] font-mono uppercase tracking-wider">Status</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {rdap.status.map((s) => (
              <span
                key={s}
                className="text-xs font-mono px-1.5 py-0.5 rounded bg-[#0a0a0a] text-[#a1a1aa] border border-[#1f1f23]"
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
