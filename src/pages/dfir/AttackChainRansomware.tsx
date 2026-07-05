import { DataPageLayout } from '../../components/DataPageLayout';
import { Shield, Target, ArrowRight, Eye } from 'lucide-react';

const STAGES = [
  { label: 'Initial Access', mitre: 'T1566', chokepoint: 'Payload delivery interception' },
  { label: 'Credential Access', mitre: 'T1003', chokepoint: 'LSASS protection / EDR alert on dump' },
  { label: 'Lateral Movement', mitre: 'T1021', chokepoint: 'Network segmentation / unusual admin logons' },
  { label: 'Defense Evasion', mitre: 'T1562', chokepoint: 'Service tamper detection via Sysmon' },
  { label: 'Impact', mitre: 'T1486', chokepoint: 'Mass file rename / volume shadow deletion' },
];

const ACTORS = [
  { name: 'BlackBasta', notes: 'QakBot → ransomware pipeline', color: 'rose' },
  { name: 'LockBit 3.0', notes: 'RaaS, affiliate model', color: 'orange' },
  { name: 'Akira', notes: 'Cisco VPN exploitation', color: 'amber' },
  { name: 'Alphv/BlackCat', notes: 'Rust-based, double extortion', color: 'violet' },
  { name: 'Play', notes: 'N-able N-sight exploitation', color: 'sky' },
];

const TTP_MATRIX: Record<string, string[]> = {
  T1566: ['Phishing attachment', 'Spearphish', 'VBA macro', 'ISO/LNK', 'QR code'],
  T1003: ['LSASS dump', 'SAM/SECURITY', 'DPAPI', 'SAM hive', 'Mimikatz'],
  T1021: ['RDP hop', 'PsExec/SMB', 'RDAccess', 'SSH tunnel', 'WMI exec'],
  T1562: ['Disable defender', 'ETW patch', 'AMSI bypass', 'Process hollow', 'Signed binary'],
  T1486: ['AES-256 enc', 'RSA-2048', 'Double extort', 'Shadow delete', 'Safe boot lock'],
};

const ACTOR_TECHNIQUES: Record<string, Record<string, boolean>> = {
  BlackBasta: { T1566: true, T1003: true, T1021: true, T1562: true, T1486: true },
  'LockBit 3.0': { T1566: true, T1003: true, T1021: true, T1562: true, T1486: true },
  Akira: { T1566: true, T1003: true, T1021: true, T1562: true, T1486: true },
  'Alphv/BlackCat': { T1566: true, T1003: true, T1021: true, T1562: true, T1486: true },
  Play: { T1566: true, T1003: true, T1021: true, T1562: true, T1486: true },
};

const DETECTION_SIGNALS = [
  { stage: 'Initial Access', signal: 'Unusual macro execution from email attachment', severity: 'high' },
  { stage: 'Credential Access', signal: 'LSASS access by non-system process', severity: 'critical' },
  { stage: 'Lateral Movement', signal: 'Sequential RDP logons across 5+ hosts in <10 min', severity: 'high' },
  { stage: 'Defense Evasion', signal: 'Windows Defender disabled or TamperProtection event', severity: 'critical' },
  { stage: 'Impact', signal: 'Mass file rename operations (>500 files/min)', severity: 'critical' },
];

const CONVERGENCE_MAP = [
  { stage: 'User executes phishing payload', shared: 'All 5 actors' },
  { stage: 'Elevated process reads LSASS', shared: 'All 5 actors' },
  { stage: 'Valid admin + network path', shared: 'All 5 actors' },
  { stage: 'SYSTEM-level service stop/delete', shared: 'All 5 actors' },
  { stage: 'File encryption with key exchange', shared: 'All 5 actors' },
];

function CellHighlight({ active }: { active: boolean }) {
  return (
    <td
      className={`px-2 py-1.5 text-center font-mono text-xs ${active ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300' : 'text-slate-400'}`}
    >
      {active ? '●' : '—'}
    </td>
  );
}

function SeverityBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    critical: 'border-rose-400/50 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    high: 'border-amber-400/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  };
  return (
    <span className={`text-micro font-mono px-1.5 py-0.5 rounded border ${styles[level] ?? styles.high}`}>{level}</span>
  );
}

export default function AttackChainRansomware(): JSX.Element {
  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="dfir"
      icon={<Shield size={28} />}
      title="Ransomware Chain Detail"
      accentClass="text-rose-600 dark:text-rose-400"
      maxWidthClass="max-w-6xl"
    >
      <div className="animate-fade-in-up space-y-6">
        <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="font-display font-bold text-lg">Ransomware Kill Chain</h2>
            <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300">
              5 stages
            </span>
            <span className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400">
              avg TTR &lt;24 hrs
            </span>
          </div>
          <p className="text-sm font-mono text-slate-700 dark:text-slate-300 leading-relaxed mb-5">
            End-to-end ransomware intrusion from initial foothold through data exfiltration to encryption. Five
            documented chokepoints exist between credential theft and file encryption.
          </p>

          <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
            Kill Chain Progression
          </h3>
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {STAGES.map((s, i) => (
              <div key={s.label} className="flex items-center gap-2">
                <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-mono">
                  <span className="font-semibold">{s.label}</span>
                  <span className="ml-1.5 text-brand-600 dark:text-brand-400">{s.mitre}</span>
                </div>
                {i < STAGES.length - 1 && <ArrowRight size={12} className="text-slate-400 shrink-0" />}
              </div>
            ))}
          </div>

          <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-2">
            Threat Actors
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

        <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
          <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
            TTP Overlap Matrix
          </h2>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">
            Techniques shared across actors at each stage. Rows = MITRE technique, columns = actors.
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

        <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
          <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
            Actor Convergence Grid
          </h2>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">
            Convergence points where all actors share identical behavior at each stage.
          </p>
          <div className="space-y-2">
            {CONVERGENCE_MAP.map((c) => (
              <div
                key={c.stage}
                className="flex items-center gap-3 rounded border border-rose-300/40 dark:border-rose-800/40 bg-rose-50 dark:bg-rose-950/20 p-3"
              >
                <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                <div>
                  <p className="text-sm font-mono font-semibold text-rose-800 dark:text-rose-200">{c.stage}</p>
                  <p className="text-xs font-mono text-rose-600 dark:text-rose-400">{c.shared}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
          <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
            Chokepoints Per Stage
          </h2>
          <div className="space-y-2">
            {STAGES.map((s) => (
              <div
                key={s.label}
                className="flex items-start gap-3 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
              >
                <Target size={14} className="text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
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

        <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
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
