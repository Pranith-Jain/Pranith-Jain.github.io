import { CheckCircle2, XCircle, AlertTriangle, HelpCircle, type LucideIcon } from 'lucide-react';

interface AuthChipProps {
  label: string;
  verdict: string;
}

const STYLES: Record<string, string> = {
  pass: 'bg-emerald-500/15 dark:bg-emerald-400/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40',
  fail: 'bg-rose-500/15 dark:bg-rose-400/15 text-rose-600 dark:text-rose-400 border-rose-500/40',
  softfail: 'bg-amber-500/15 dark:bg-amber-400/15 text-amber-600 dark:text-amber-400 border-amber-500/40',
  neutral: 'bg-slate-200 dark:bg-slate-800 text-muted border-slate-300 dark:border-slate-700',
  none: 'bg-slate-200 dark:bg-slate-800 text-muted border-slate-300 dark:border-slate-700',
  unknown: 'bg-slate-200 dark:bg-slate-800 text-muted border-slate-300 dark:border-slate-700',
};

// Pair each verdict with an icon so pass/fail is not conveyed by color alone
// (WCAG 1.4.1 — colorblind users + screen readers get the meaning too).
const ICONS: Record<string, LucideIcon> = {
  pass: CheckCircle2,
  fail: XCircle,
  softfail: AlertTriangle,
  neutral: HelpCircle,
  none: HelpCircle,
  unknown: HelpCircle,
};

function AuthChip({ label, verdict }: AuthChipProps): JSX.Element {
  const key = verdict.toLowerCase();
  const style = STYLES[key] ?? STYLES.unknown;
  const Icon = ICONS[key] ?? HelpCircle;
  return (
    <div
      className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl border ${style}`}
      role="group"
      aria-label={`${label}: ${verdict}`}
    >
      <span className="text-xs font-mono uppercase tracking-widest opacity-70">{label}</span>
      <span className="flex items-center gap-1.5 text-sm font-mono font-bold uppercase">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {verdict}
      </span>
    </div>
  );
}

interface AuthResultsChipsProps {
  auth: {
    spf: string;
    dkim: string;
    dmarc: string;
    raw?: string;
  };
}

export function AuthResultsChips({ auth }: AuthResultsChipsProps): JSX.Element {
  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      <h2 className="font-display font-bold text-xl mb-4">Authentication Results</h2>
      <div className="flex flex-wrap gap-3">
        <AuthChip label="SPF" verdict={auth.spf} />
        <AuthChip label="DKIM" verdict={auth.dkim} />
        <AuthChip label="DMARC" verdict={auth.dmarc} />
      </div>
    </section>
  );
}
