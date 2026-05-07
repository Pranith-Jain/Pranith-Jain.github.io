import type { DomainLookupResponse } from '../../lib/dfir/types';

interface ChipProps {
  label: string;
  ok: boolean;
  detail?: string;
  warn?: boolean;
}

function Chip({ label, ok, detail, warn }: ChipProps): JSX.Element {
  const cls = !ok
    ? 'border-rose-500/40 text-rose-600 dark:text-rose-400'
    : warn
      ? 'border-amber-500/40 text-amber-600 dark:text-amber-400'
      : 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400';
  return (
    <div className={`flex flex-col gap-0.5 px-3 py-2 rounded-lg border ${cls}`}>
      <span className="text-xs font-mono uppercase tracking-wider">{label}</span>
      <span className="text-sm font-mono">{detail ?? (ok ? 'configured' : 'missing')}</span>
    </div>
  );
}

export function EmailAuthCard({ auth }: { auth: DomainLookupResponse['email_auth'] }): JSX.Element {
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-display font-bold text-lg">Email Authentication</h3>
        <span className="font-mono text-sm text-slate-600 dark:text-slate-400">
          {auth.evaluation.score}/100 ·{' '}
          <span
            className={
              auth.evaluation.verdict === 'strong'
                ? 'text-emerald-600 dark:text-emerald-400'
                : auth.evaluation.verdict === 'partial'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400'
            }
          >
            {auth.evaluation.verdict}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        <Chip
          label="SPF"
          ok={auth.spf.present}
          detail={auth.spf.policy}
          warn={auth.spf.policy && auth.spf.policy !== 'fail' ? true : undefined}
        />
        <Chip
          label="DMARC"
          ok={auth.dmarc.present}
          detail={auth.dmarc.policy}
          warn={auth.dmarc.policy === 'none' ? true : undefined}
        />
        <Chip
          label="DKIM"
          ok={auth.dkim.selectors_found.length > 0}
          detail={auth.dkim.selectors_found.join(', ') || undefined}
        />
        <Chip
          label="MTA-STS"
          ok={auth.mta_sts.present}
          detail={auth.mta_sts.mode}
          warn={auth.mta_sts.mode !== 'enforce' ? true : undefined}
        />
        <Chip label="TLS-RPT" ok={auth.tls_rpt.present} />
        <Chip label="BIMI" ok={auth.bimi.present} />
      </div>
      {auth.evaluation.weaknesses.length > 0 && (
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Weaknesses
          </span>
          <ul className="mt-1 space-y-0.5 list-disc list-inside text-sm text-slate-600 dark:text-slate-400">
            {auth.evaluation.weaknesses.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
