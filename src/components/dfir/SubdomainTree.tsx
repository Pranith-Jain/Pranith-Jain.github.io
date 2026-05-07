import type { ExposureScanResponse } from '../../lib/dfir/types';

export function SubdomainTree({ subdomains }: { subdomains: ExposureScanResponse['subdomains'] }): JSX.Element {
  if (subdomains.length === 0) {
    return <p className="font-mono text-sm text-slate-600 dark:text-slate-400">No subdomains seen in CT logs.</p>;
  }
  return (
    <ul className="space-y-2">
      {subdomains.map((s) => (
        <li
          key={s.name}
          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm text-slate-900 dark:text-slate-100">{s.name}</span>
            <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
              {s.ips.length} IP{s.ips.length === 1 ? '' : 's'}
            </span>
          </div>
          {s.ips.length > 0 && <div className="mt-1 font-mono text-xs text-slate-500">{s.ips.join(' · ')}</div>}
          {s.shodan?.status === 'ok' && (
            <div className="mt-2 font-mono text-xs">
              <span className="text-slate-600 dark:text-slate-400">ports: </span>
              <span className="text-slate-900 dark:text-slate-100">
                {(s.shodan.raw_summary.ports ?? []).slice(0, 8).join(', ') || '—'}
              </span>
              {(s.shodan.raw_summary.vulns?.length ?? 0) > 0 && (
                <span className="ml-3 text-rose-600 dark:text-rose-400">
                  vulns: {s.shodan.raw_summary.vulns!.length}
                </span>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
