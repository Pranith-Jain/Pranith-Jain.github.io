import { DataPageLayout } from '../../components/DataPageLayout';
import { Shield, Target, ArrowRight, Eye } from 'lucide-react';

const STAGES = [
  { label: 'Initial Access', mitre: 'T1190', chokepoint: 'vCenter/ESXi exposed to internet' },
  { label: 'Mgmt Plane Takeover', mitre: 'T1610', chokepoint: 'vCenter API call from non-console IP' },
  { label: 'Credential Theft', mitre: 'T1003', chokepoint: 'ESXi host credential extraction' },
  { label: 'Persistence', mitre: 'T1136', chokepoint: 'New ESXi account or cron job creation' },
  { label: 'Lateral Movement', mitre: 'T1021', chokepoint: 'vMotion / SSH across hosts' },
  { label: 'Impact', mitre: 'T1486', chokepoint: 'ESXi VM encryption / snapshot deletion' },
];

const ACTORS = [
  { name: 'BRICKSTORM/UNC5221', notes: 'VMware vSphere exploitation' },
  { name: 'UNC3886', notes: 'Zero-day + ESXi persistence' },
  { name: 'Scattered Spider', notes: 'Social engineering + hypervisor' },
  { name: 'Play', notes: 'N-able N-sight exploitation' },
  { name: 'Alphv/BlackCat', notes: 'vCenter exploitation' },
];

const TTP_MATRIX: Record<string, string[]> = {
  T1190: ['CVE-2024-21762', 'vCenter RCE', 'VPN exploit', 'Help desk SE', 'vCenter CVE'],
  T1610: ['vCenter deploy', 'VM snapshot', 'Guest deploy', 'API abuse', 'ESXi shell'],
  T1003: ['ESXi passwd', 'AD backup', 'VM guest creds', 'LDAP dump', 'LSASS dump'],
  T1136: ['ESXi account', 'AD account', 'cron job', 'systemd svc', 'backdoor user'],
  T1021: ['vMotion', 'ESXi SSH', 'RDP lateral', 'WMI exec', 'SMB lateral'],
  T1486: ['VM encrypt', 'ESXi encrypt', 'VMDK enc', 'Double extort', 'Data wiper'],
};

const ACTOR_TECHNIQUES: Record<string, Record<string, boolean>> = {
  'BRICKSTORM/UNC5221': { T1190: true, T1610: true, T1003: true, T1136: true, T1021: true, T1486: true },
  UNC3886: { T1190: true, T1610: true, T1003: true, T1136: true, T1021: true, T1486: true },
  'Scattered Spider': { T1190: true, T1610: true, T1003: true, T1136: true, T1021: true, T1486: true },
  Play: { T1190: true, T1610: true, T1003: true, T1136: true, T1021: true, T1486: true },
  'Alphv/BlackCat': { T1190: true, T1610: true, T1003: true, T1136: true, T1021: true, T1486: true },
};

const DETECTION_SIGNALS = [
  { stage: 'Initial Access', signal: 'vCenter login from non-corporate IP', severity: 'critical' },
  { stage: 'Mgmt Plane Takeover', signal: 'vCenter API call creating/modifying VMs', severity: 'critical' },
  { stage: 'Credential Theft', signal: '/etc/shadow read on ESXi host', severity: 'critical' },
  { stage: 'Persistence', signal: 'New crontab or /etc/passwd modification on ESXi', severity: 'critical' },
  { stage: 'Lateral Movement', signal: 'vMotion events between unrelated clusters', severity: 'high' },
  { stage: 'Impact', signal: 'Mass VMDK rename operations on ESXi datastore', severity: 'critical' },
];

const CONVERGENCE_MAP = [
  { stage: 'Exploit or social-engineer into vSphere', shared: 'All 5 actors' },
  { stage: 'Deploy to hypervisor management plane', shared: 'All 5 actors' },
  { stage: 'Extract ESXi host credentials', shared: 'All 5 actors' },
  { stage: 'Create persistence on hypervisor', shared: 'All 5 actors' },
  { stage: 'Move laterally via vMotion/SSH', shared: 'All 5 actors' },
  { stage: 'Encrypt or destroy guest VMs', shared: 'All 5 actors' },
];

function CellHighlight({ active }: { active: boolean }) {
  return (
    <td
      className={`px-2 py-1.5 text-center font-mono text-xs ${active ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300' : 'text-slate-400'}`}
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

export default function AttackChainHypervisor(): JSX.Element {
  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="dfir"
      icon={<Shield size={28} />}
      title="Hypervisor Chain Detail"
      accentClass="text-sky-600 dark:text-sky-400"
      maxWidthClass="max-w-6xl"
    >
      <div className="animate-fade-in-up space-y-6">
        <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="font-display font-bold text-lg">Hypervisor Kill Chain</h2>
            <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300">
              VMware vSphere
            </span>
            <span className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400">
              avg dwell 393 days
            </span>
          </div>
          <p className="text-sm font-mono text-slate-700 dark:text-slate-300 leading-relaxed mb-5">
            VMware vSphere and ESXi targeting — from vCenter RCE through hypervisor credential theft to guest VM
            encryption. The Snowflake breach (2024) demonstrated cloud management plane risk at scale.
          </p>

          <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
            Kill Chain Progression
          </h3>
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {STAGES.map((s, i) => (
              <div key={s.label} className="flex items-center gap-2">
                <div className="rounded border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-mono">
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

        <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
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

        <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
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
                className="flex items-center gap-3 rounded border border-sky-300/40 dark:border-sky-800/40 bg-sky-50 dark:bg-sky-950/20 p-3"
              >
                <div className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                <div>
                  <p className="text-sm font-mono font-semibold text-sky-800 dark:text-sky-200">{c.stage}</p>
                  <p className="text-xs font-mono text-sky-600 dark:text-sky-400">{c.shared}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
          <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
            Chokepoints Per Stage
          </h2>
          <div className="space-y-2">
            {STAGES.map((s) => (
              <div
                key={s.label}
                className="flex items-start gap-3 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
              >
                <Target size={14} className="text-sky-600 dark:text-sky-400 mt-0.5 shrink-0" />
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

        <section className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-5">
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
