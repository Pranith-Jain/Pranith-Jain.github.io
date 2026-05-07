interface AuthChipProps {
  label: string;
  verdict: string;
}

const STYLES: Record<string, string> = {
  pass: 'bg-emerald-500/15 dark:bg-emerald-400/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40',
  fail: 'bg-rose-500/15 dark:bg-rose-400/15 text-rose-600 dark:text-rose-400 border-rose-500/40',
  softfail: 'bg-amber-500/15 dark:bg-amber-400/15 text-amber-600 dark:text-amber-400 border-amber-500/40',
  neutral: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700',
  none: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700',
  unknown: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700',
};

function AuthChip({ label, verdict }: AuthChipProps): JSX.Element {
  const style = STYLES[verdict.toLowerCase()] ?? STYLES.unknown;
  return (
    <div className={`flex flex-col items-center gap-1 px-4 py-3 rounded-xl border ${style}`}>
      <span className="text-xs font-mono uppercase tracking-widest opacity-70">{label}</span>
      <span className="text-sm font-mono font-bold uppercase">{verdict}</span>
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
    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      <h2 className="font-display font-bold text-xl mb-4">Authentication Results</h2>
      <div className="flex flex-wrap gap-3">
        <AuthChip label="SPF" verdict={auth.spf} />
        <AuthChip label="DKIM" verdict={auth.dkim} />
        <AuthChip label="DMARC" verdict={auth.dmarc} />
      </div>
    </section>
  );
}
