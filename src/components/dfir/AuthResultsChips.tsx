interface AuthChipProps {
  label: string;
  verdict: string;
}

const STYLES: Record<string, string> = {
  pass: 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/40',
  fail: 'bg-[#ef4444]/15 text-[#ef4444] border-[#ef4444]/40',
  softfail: 'bg-[#f59e0b]/15 text-[#f59e0b] border-[#f59e0b]/40',
  neutral: 'bg-[#71717a]/15 text-[#a1a1aa] border-[#71717a]/40',
  none: 'bg-[#71717a]/15 text-[#a1a1aa] border-[#71717a]/40',
  unknown: 'bg-[#71717a]/15 text-[#a1a1aa] border-[#71717a]/40',
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
    <section className="rounded-2xl border border-[#1f1f23] bg-[#111113] p-6">
      <h2 className="font-display font-bold text-xl mb-4">Authentication Results</h2>
      <div className="flex flex-wrap gap-3">
        <AuthChip label="SPF" verdict={auth.spf} />
        <AuthChip label="DKIM" verdict={auth.dkim} />
        <AuthChip label="DMARC" verdict={auth.dmarc} />
      </div>
    </section>
  );
}
