import { DataPageLayout } from '../../components/DataPageLayout';
import { Shield, Target, ArrowRight, Eye } from 'lucide-react';

const STAGES = [
  { label: 'Initial Access', mitre: 'T1566', chokepoint: 'Phishing + credential theft from endpoint' },
  { label: 'Credential Access', mitre: 'T1556', chokepoint: 'Kerberos / NTLM / SAML abuse detection' },
  { label: 'Privilege Escalation', mitre: 'T1078', chokepoint: 'Abnormal admin group membership change' },
  { label: 'Lateral Movement', mitre: 'T1021', chokepoint: 'Pass-the-hash / Overpass-the-Hash detection' },
  { label: 'Persistence', mitre: 'T1136', chokepoint: 'Golden ticket / SID history injection' },
  { label: 'Impact', mitre: 'T1486', chokepoint: 'Domain-wide ransomware deployment' },
];

const ACTORS = [
  { name: 'APT29', notes: 'Golden SAML, cloud persistence' },
  { name: 'Storm-0501', notes: 'Hybrid AD + cloud compromise' },
  { name: 'Storm-2372', notes: 'LDAP relay + NTLM relay' },
  { name: 'Scattered Spider', notes: 'Social engineering + help desk' },
  { name: 'Ransomware Operators', notes: 'Domain-wide encryption' },
];

const TTP_MATRIX: Record<string, string[]> = {
  T1566: ['Spearphish', 'OAuth phish', 'Help desk SE', 'SIM swap', 'MFA fatigue'],
  T1556: ['DCSync', 'Golden SAML', 'Kerberoast', 'NTLM relay', 'LSASS dump'],
  T1078: ['Domain admin', 'Entra ID admin', 'Tier 0 access', 'Help desk bypass', 'SSO hijack'],
  T1021: ['Pass-the-hash', 'Overpass-the-Hash', 'RDP hop', 'LDAP relay', 'SMB exec'],
  T1136: ['Golden ticket', 'SID history', 'Entra app', 'SID injection', 'Cloud role'],
  T1486: ['Domain encrypt', 'Tenant lock', 'GPO deploy', 'Double extort', 'Backup delete'],
};

const ACTOR_TECHNIQUES: Record<string, Record<string, boolean>> = {
  APT29: { T1566: true, T1556: true, T1078: true, T1021: true, T1136: true, T1486: true },
  'Storm-0501': { T1566: true, T1556: true, T1078: true, T1021: true, T1136: true, T1486: true },
  'Storm-2372': { T1566: true, T1556: true, T1078: true, T1021: true, T1136: false, T1486: false },
  'Scattered Spider': { T1566: true, T1556: true, T1078: true, T1021: true, T1136: true, T1486: true },
  'Ransomware Operators': { T1566: true, T1556: true, T1078: true, T1021: true, T1136: true, T1486: true },
};

const DETECTION_SIGNALS = [
  { stage: 'Initial Access', signal: 'MFA fatigue / push spam to user device', severity: 'high' },
  { stage: 'Credential Access', signal: 'DCSync replication request from non-DC host', severity: 'critical' },
  { stage: 'Privilege Escalation', signal: 'User added to Domain Admins or Entra Global Admin', severity: 'critical' },
  {
    stage: 'Lateral Movement',
    signal: 'Pass-the-hash / Overpass-the-Hash event (Event 4624 Type 3)',
    severity: 'critical',
  },
  { stage: 'Persistence', signal: 'SID History attribute modified on account (Event 4765)', severity: 'critical' },
  { stage: 'Impact', signal: 'GPO modified to deploy ransomware to all domain-joined machines', severity: 'critical' },
];

const CONVERGENCE_MAP = [
  { stage: 'Credential theft from endpoint', shared: 'All 5 actors' },
  { stage: 'Kerberos / NTLM / SAML abuse', shared: '4 of 5 (Storm-2372 focuses LDAP relay)' },
  { stage: 'Privilege escalation to domain admin', shared: 'All 5 actors' },
  { stage: 'Lateral movement via pass-the-hash', shared: 'All 5 actors' },
  { stage: 'Persistence in AD / cloud IAM', shared: '4 of 5 (Storm-2372 not persistence-focused)' },
  { stage: 'Domain-wide or tenant-wide impact', shared: '4 of 5 (Storm-2372 not ransomware)' },
];

function CellHighlight({ active }: { active: boolean }) {
  return (
    <td
      className={`px-2 py-1.5 text-center font-mono text-xs ${active ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'text-slate-400'}`}
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

export default function AttackChainIdentity(): JSX.Element {
  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="dfir"
      icon={<Shield size={28} />}
      title="AD & Identity Chain Detail"
      accentClass="text-emerald-600 dark:text-emerald-400"
      maxWidthClass="max-w-6xl"
    >
      <div className="animate-fade-in-up space-y-6">
        <section className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="font-display font-bold text-lg">Identity Kill Chain</h2>
            <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
              AD + Entra ID
            </span>
            <span className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400">
              6 stages
            </span>
          </div>
          <p className="text-sm font-mono text-slate-700 dark:text-slate-300 leading-relaxed mb-5">
            Active Directory and Entra ID identity chain — from credential theft through Golden SAML, DCSync, or cloud
            token abuse to full domain or tenant compromise.
          </p>

          <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
            Kill Chain Progression
          </h3>
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {STAGES.map((s, i) => (
              <div key={s.label} className="flex items-center gap-2">
                <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-mono">
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
            Convergence points where actors share behavior at each stage.
          </p>
          <div className="space-y-2">
            {CONVERGENCE_MAP.map((c) => (
              <div
                key={c.stage}
                className="flex items-center gap-3 rounded border border-emerald-300/40 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20 p-3"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm font-mono font-semibold text-emerald-800 dark:text-emerald-200">{c.stage}</p>
                  <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">{c.shared}</p>
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
                <Target size={14} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
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
