import type { ExposureScanResponse } from '../../lib/dfir/types';

export function SubdomainTree({ subdomains }: { subdomains: ExposureScanResponse['subdomains'] }): JSX.Element {
  if (subdomains.length === 0) {
    return <p className="font-mono text-sm text-[#a1a1aa]">No subdomains seen in CT logs.</p>;
  }
  return (
    <ul className="space-y-2">
      {subdomains.map((s) => (
        <li key={s.name} className="rounded-lg border border-[#1f1f23] bg-[#111113] p-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm text-[#fafafa]">{s.name}</span>
            <span className="font-mono text-xs text-[#a1a1aa]">
              {s.ips.length} IP{s.ips.length === 1 ? '' : 's'}
            </span>
          </div>
          {s.ips.length > 0 && <div className="mt-1 font-mono text-xs text-[#71717a]">{s.ips.join(' · ')}</div>}
          {s.shodan?.status === 'ok' && (
            <div className="mt-2 font-mono text-xs">
              <span className="text-[#a1a1aa]">ports: </span>
              <span className="text-[#fafafa]">{(s.shodan.raw_summary.ports ?? []).slice(0, 8).join(', ') || '—'}</span>
              {(s.shodan.raw_summary.vulns?.length ?? 0) > 0 && (
                <span className="ml-3 text-[#ef4444]">vulns: {s.shodan.raw_summary.vulns!.length}</span>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
