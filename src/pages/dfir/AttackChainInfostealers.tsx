import { DataPageLayout } from '../../components/DataPageLayout';
import { Shield, Target, ArrowRight, Eye } from 'lucide-react';

const STAGES = [
  { label: 'Distribution', mitre: 'T1566', chokepoint: 'Malicious attachment / link delivery' },
  { label: 'Execution', mitre: 'T1204', chokepoint: 'User triggers payload execution' },
  { label: 'Collection', mitre: 'T1555', chokepoint: 'Browser DB + DPAPI access detection' },
  { label: 'Exfiltration', mitre: 'T1041', chokepoint: 'Outbound HTTP/S to known C2 endpoint' },
  { label: 'Monetization', mitre: 'T1657', chokepoint: 'Credential marketplace posting detected' },
];

const ACTORS = [
  { name: 'RedLine', notes: 'Java-based, .NET loader' },
  { name: 'LummaC2', notes: 'C2 panel, Chrome cookie theft' },
  { name: 'Vidar', notes: 'Raccoon fork, Telegram bot exfil' },
  { name: 'StealC', notes: 'Chromium + Firefox targeted' },
  { name: 'Raccoon', notes: 'MaaS stealer-as-a-service' },
];

const TTP_MATRIX: Record<string, string[]> = {
  T1566: ['Email attach', 'Cracked SW', 'SEO poison', 'Drive-by', 'Telegram link'],
  T1204: ['User click', 'Macro enable', 'DLL sideload', 'ISO mount', 'LNK execution'],
  T1555: ['Browser DBs', 'Chrome cookies', 'DPAPI master', 'Wallet files', 'Session tokens'],
  T1041: ['HTTP POST', 'Telegram API', 'Discord webhook', 'FTP upload', 'SMTP exfil'],
  T1657: ['Marketplace', 'Genesis store', 'Privex bot', 'Direct sale', 'Ramp forum'],
};

const ACTOR_TECHNIQUES: Record<string, Record<string, boolean>> = {
  RedLine: { T1566: true, T1204: true, T1555: true, T1041: true, T1657: true },
  LummaC2: { T1566: true, T1204: true, T1555: true, T1041: true, T1657: true },
  Vidar: { T1566: true, T1204: true, T1555: true, T1041: true, T1657: true },
  StealC: { T1566: true, T1204: true, T1555: true, T1041: true, T1657: true },
  Raccoon: { T1566: true, T1204: true, T1555: true, T1041: true, T1657: true },
};

const DETECTION_SIGNALS = [
  { stage: 'Distribution', signal: 'Suspicious archive from unknown sender', severity: 'medium' },
  { stage: 'Execution', signal: 'PowerShell / MSHTA spawned from Office', severity: 'high' },
  { stage: 'Collection', signal: 'Process reading Chrome/Login Data SQLite DB', severity: 'critical' },
  { stage: 'Exfiltration', signal: 'Outbound POST to Telegram / Discord webhook', severity: 'high' },
  { stage: 'Monetization', signal: 'Credential appears in breach marketplace feed', severity: 'high' },
];

const CONVERGENCE_MAP = [
  { stage: 'Delivery reaches endpoint', shared: 'All 5 families' },
  { stage: 'User triggers payload execution', shared: 'All 5 families' },
  { stage: 'File access to browser DBs + DPAPI', shared: 'All 5 families' },
  { stage: 'Outbound network to exfil endpoint', shared: 'All 5 families' },
  { stage: 'Creds have market value', shared: 'All 5 families' },
];

function CellHighlight({ active }: { active: boolean }) {
  return (
    <td
      className={`px-2 py-1.5 text-center font-mono text-xs ${active ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'text-slate-400'}`}
    >
      {active ? '●' : '—'}
    </td>
  );
}

function SeverityBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    critical: 'border-rose-400/50 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    high: 'border-amber-400/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    medium: 'border-sky-400/50 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  };
  return (
    <span className={`text-micro font-mono px-1.5 py-0.5 rounded border ${styles[level] ?? styles.medium}`}>
      {level}
    </span>
  );
}

export default function AttackChainInfostealers(): JSX.Element {
  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="dfir"
      icon={<Shield size={28} />}
      title="Infostealer Chain Detail"
      accentClass="text-amber-600 dark:text-amber-400"
      maxWidthClass="max-w-6xl"
    >
      <div className="animate-fade-in-up space-y-6">
        <section className="surface-card p-5">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="font-display font-bold text-lg">Infostealer Kill Chain</h2>
            <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
              15M+ infections/yr
            </span>
          </div>
          <p className="text-sm font-mono text-slate-700 dark:text-slate-300 leading-relaxed mb-5">
            Commodity infostealer pipeline targeting browser credentials, crypto wallets, and session cookies. 15M+
            infections/year — the primary feeder for initial access brokers.
          </p>

          <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
            Kill Chain Progression
          </h3>
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {STAGES.map((s, i) => (
              <div key={s.label} className="flex items-center gap-2">
                <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-mono">
                  <span className="font-semibold">{s.label}</span>
                  <span className="ml-1.5 text-brand-600 dark:text-brand-400">{s.mitre}</span>
                </div>
                {i < STAGES.length - 1 && <ArrowRight size={12} className="text-slate-400 shrink-0" />}
              </div>
            ))}
          </div>

          <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-2">
            Threat Actors / Families
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ACTORS.map((a) => (
              <div
                key={a.name}
                className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-2.5"
              >
                <span className="font-display font-semibold text-sm">{a.name}</span>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">{a.notes}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-card p-5">
          <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
            TTP Overlap Matrix
          </h2>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">
            Techniques shared across families at each stage. Rows = MITRE technique, columns = families.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
                  <th className="text-left px-2 py-1.5 text-slate-500 dark:text-slate-400">Technique</th>
                  {ACTORS.map((a) => (
                    <th key={a.name} className="px-2 py-1.5 text-center text-slate-500 dark:text-slate-400">
                      {a.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STAGES.map((stage) =>
                  Object.entries(TTP_MATRIX).map(([mitre]) => (
                    <tr
                      key={`${stage.label}-${mitre}`}
                      className="border-b border-slate-100 dark:border-[rgb(var(--border-400))]/30"
                    >
                      <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        <span className="text-brand-600 dark:text-brand-400">{mitre}</span>
                        <span className="ml-1 text-slate-500 dark:text-slate-400">{stage.label}</span>
                      </td>
                      {ACTORS.map((a) => (
                        <CellHighlight key={`${a.name}-${mitre}`} active={ACTOR_TECHNIQUES[a.name]?.[mitre] ?? false} />
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="surface-card p-5">
          <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
            Actor Convergence Grid
          </h2>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">
            Convergence points where all families share identical behavior at each stage.
          </p>
          <div className="space-y-2">
            {CONVERGENCE_MAP.map((c) => (
              <div
                key={c.stage}
                className="flex items-center gap-3 rounded border border-amber-300/40 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 p-3"
              >
                <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <div>
                  <p className="text-sm font-mono font-semibold text-amber-800 dark:text-amber-200">{c.stage}</p>
                  <p className="text-xs font-mono text-amber-600 dark:text-amber-400">{c.shared}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-card p-5">
          <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
            Chokepoints Per Stage
          </h2>
          <div className="space-y-2">
            {STAGES.map((s) => (
              <div
                key={s.label}
                className="flex items-start gap-3 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
              >
                <Target size={14} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-mono font-semibold">
                    {s.label} <span className="text-brand-600 dark:text-brand-400">{s.mitre}</span>
                  </p>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">{s.chokepoint}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-card p-5">
          <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
            <Eye size={14} /> Detection Signals
          </h2>
          <div className="space-y-2">
            {DETECTION_SIGNALS.map((d) => (
              <div
                key={d.signal}
                className="flex items-center justify-between rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
              >
                <div>
                  <p className="text-sm font-mono">{d.signal}</p>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">{d.stage}</p>
                </div>
                <SeverityBadge level={d.severity} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </DataPageLayout>
  );
}
