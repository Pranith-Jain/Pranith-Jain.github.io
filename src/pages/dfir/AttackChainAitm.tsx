import { DataPageLayout } from '../../components/DataPageLayout';
import { Shield, Target, ArrowRight, Eye } from 'lucide-react';

const STAGES = [
  { label: 'Lure Delivery', mitre: 'T1566', chokepoint: 'Phishing domain / email header anomaly' },
  { label: 'Proxy Interception', mitre: 'T1557', chokepoint: 'Reverse proxy cert mismatch / TLS inspection' },
  { label: 'Token Harvest', mitre: 'T1539', chokepoint: 'Session token exfil via WebSocket relay' },
  { label: 'Account Takeover', mitre: 'T1078', chokepoint: 'Token replay from unfamiliar IP/device' },
  { label: 'Persistence', mitre: 'T1098', chokepoint: 'OAuth app registration / mail rule creation' },
];

const ACTORS = [
  { name: 'Tycoon 2FA', notes: 'PhaaS platform, AiTM proxy' },
  { name: 'Evilginx', notes: 'Open-source proxy framework' },
  { name: 'EvilProxy', notes: 'Subscription-based PhaaS' },
  { name: 'Sneaky 2FA', notes: 'Microsoft 365 targeting' },
  { name: 'Device Code Flow', notes: 'OAuth device code abuse' },
];

const TTP_MATRIX: Record<string, string[]> = {
  T1566: ['M365 lure', 'DocuSign phish', 'SharePoint phish', 'Teams invite', 'OAuth consent'],
  T1557: ['Reverse proxy', 'Ngrok tunnel', 'Cloudflare tunnel', 'Caddy relay', 'Direct abuse'],
  T1539: ['Cookie theft', 'OAuth token', 'Access token', 'Refresh token', 'Device code'],
  T1078: ['Token replay', 'Cookie reuse', 'Session fix', 'OAuth abuse', 'SSO bypass'],
  T1098: ['Mail rules', 'OAuth apps', 'Inbox rules', 'Delegated auth', 'Entra app'],
};

const ACTOR_TECHNIQUES: Record<string, Record<string, boolean>> = {
  'Tycoon 2FA': { T1566: true, T1557: true, T1539: true, T1078: true, T1098: true },
  Evilginx: { T1566: true, T1557: true, T1539: true, T1078: true, T1098: true },
  EvilProxy: { T1566: true, T1557: true, T1539: true, T1078: true, T1098: true },
  'Sneaky 2FA': { T1566: true, T1557: true, T1539: true, T1078: true, T1098: true },
  'Device Code Flow': { T1566: true, T1557: false, T1539: true, T1078: true, T1098: true },
};

const DETECTION_SIGNALS = [
  { stage: 'Lure Delivery', signal: 'Email with proxied Microsoft login URL', severity: 'high' },
  { stage: 'Proxy Interception', signal: 'TLS cert not matching known Microsoft domains', severity: 'critical' },
  {
    stage: 'Token Harvest',
    signal: 'WebSocket connection to non-Microsoft endpoint during auth',
    severity: 'critical',
  },
  { stage: 'Account Takeover', signal: 'Sign-in from IP geographically impossible', severity: 'critical' },
  { stage: 'Persistence', signal: 'New mail forwarding rule or OAuth consent grant', severity: 'high' },
];

const CONVERGENCE_MAP = [
  { stage: 'Victim initiates auth to attacker infra', shared: 'All 5 kits (Tycoon uses redirect chain)' },
  { stage: 'Session passes through proxy', shared: '4 of 5 (Device Code Flow skips proxy)' },
  { stage: 'Session token extracted', shared: 'All 5 kits' },
  { stage: 'Token replayed without re-auth', shared: 'All 5 kits' },
  { stage: 'Attacker modifies account config', shared: 'All 5 kits' },
];

function CellHighlight({ active }: { active: boolean }) {
  return (
    <td
      className={`px-2 py-1.5 text-center font-mono text-xs ${active ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300' : 'text-slate-400'}`}
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

export default function AttackChainAitm(): JSX.Element {
  return (
    <DataPageLayout
      backTo="/dfir"
      backLabel="dfir"
      icon={<Shield size={28} />}
      title="AiTM / Phishing Chain Detail"
      accentClass="text-violet-600 dark:text-violet-400"
      maxWidthClass="max-w-6xl"
    >
      <div className="animate-fade-in-up space-y-6">
        <section className="surface-card p-5">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="font-display font-bold text-lg">AiTM Kill Chain</h2>
            <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300">
              MFA bypass
            </span>
            <span className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400">
              session-based
            </span>
          </div>
          <p className="text-sm font-mono text-slate-700 dark:text-slate-300 leading-relaxed mb-5">
            Adversary-in-the-Middle proxy phishing that bypasses MFA by intercepting session tokens in real time.
            WebSocket relay and reverse proxy kits make this the fastest-growing initial access vector.
          </p>

          <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-3">
            Kill Chain Progression
          </h3>
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {STAGES.map((s, i) => (
              <div key={s.label} className="flex items-center gap-2">
                <div className="rounded border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-mono">
                  <span className="font-semibold">{s.label}</span>
                  <span className="ml-1.5 text-brand-600 dark:text-brand-400">{s.mitre}</span>
                </div>
                {i < STAGES.length - 1 && <ArrowRight size={12} className="text-slate-400 shrink-0" />}
              </div>
            ))}
          </div>

          <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-2">
            PhaaS Kits
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
            Techniques shared across kits at each stage. Rows = MITRE technique, columns = kits.
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
            Convergence points where kits share identical behavior at each stage.
          </p>
          <div className="space-y-2">
            {CONVERGENCE_MAP.map((c) => (
              <div
                key={c.stage}
                className="flex items-center gap-3 rounded border border-violet-300/40 dark:border-violet-800/40 bg-violet-50 dark:bg-violet-950/20 p-3"
              >
                <div className="w-2 h-2 rounded-full bg-violet-500 shrink-0" />
                <div>
                  <p className="text-sm font-mono font-semibold text-violet-800 dark:text-violet-200">{c.stage}</p>
                  <p className="text-xs font-mono text-violet-600 dark:text-violet-400">{c.shared}</p>
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
                <Target size={14} className="text-violet-600 dark:text-violet-400 mt-0.5 shrink-0" />
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
