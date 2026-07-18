import { useState } from 'react';
import { BackLink } from '../../components/BackLink';
import { ExternalLink, Shield, ArrowRight, Link2 } from 'lucide-react';
import { sanitizeUrl } from '../../lib/sanitize-url';

type ChainId = 'ransomware' | 'infostealer' | 'aitm' | 'hypervisor' | 'identity';

interface ChainStage {
  label: string;
  mitre?: string;
}

interface ThreatActor {
  name: string;
  aliases?: string;
  notes?: string;
}

interface AttackChain {
  id: ChainId;
  name: string;
  color: string;
  badgeStyle: string;
  stages: ChainStage[];
  actors: ThreatActor[];
  chokepoints: number;
  avgTTR: string;
  description: string;
}

const CHAINS: AttackChain[] = [
  {
    id: 'ransomware',
    name: 'Ransomware Chain',
    color: 'rose',
    badgeStyle: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    stages: [
      { label: 'Initial Access', mitre: 'T1566' },
      { label: 'Credential Access', mitre: 'T1003' },
      { label: 'Lateral Movement', mitre: 'T1021' },
      { label: 'Defense Evasion', mitre: 'T1562' },
      { label: 'Impact', mitre: 'T1486' },
    ],
    actors: [
      { name: 'BlackBasta', notes: 'QakBot → ransomware pipeline' },
      { name: 'LockBit 3.0', notes: 'RaaS, affiliate model' },
      { name: 'Akira', notes: 'Cisco VPN exploitation' },
      { name: 'Alphv/BlackCat', notes: 'Rust-based, double extortion' },
      { name: 'Play', notes: 'N-able N-sight exploitation' },
    ],
    chokepoints: 5,
    avgTTR: '<24 hrs',
    description:
      'End-to-end ransomware intrusion from initial foothold through data exfiltration to encryption. Five documented chokepoints exist between credential theft and file encryption.',
  },
  {
    id: 'infostealer',
    name: 'Infostealer Chain',
    color: 'amber',
    badgeStyle: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    stages: [
      { label: 'Distribution', mitre: 'T1566' },
      { label: 'Execution', mitre: 'T1204' },
      { label: 'Collection', mitre: 'T1555' },
      { label: 'Exfiltration', mitre: 'T1041' },
      { label: 'Monetization', mitre: 'T1657' },
    ],
    actors: [
      { name: 'RedLine', notes: 'Java-based, .NET loader' },
      { name: 'LummaC2', notes: 'C2 panel, Chrome cookie theft' },
      { name: 'Vidar', notes: 'Raccoon fork, Telegram bot exfil' },
      { name: 'StealC', notes: 'Chromium + Firefox targeted' },
      { name: 'Raccoon', notes: 'MaaS stealer-as-a-service' },
    ],
    chokepoints: 5,
    avgTTR: 'N/A (passive)',
    description:
      'Commodity infostealer pipeline targeting browser credentials, crypto wallets, and session cookies. 15M+ infections/year — the primary feeder for initial access brokers.',
  },
  {
    id: 'aitm',
    name: 'AiTM/Phishing Chain',
    color: 'violet',
    badgeStyle: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    stages: [
      { label: 'Lure Delivery', mitre: 'T1566' },
      { label: 'Proxy Interception', mitre: 'T1557' },
      { label: 'Token Harvest', mitre: 'T1539' },
      { label: 'Account Takeover', mitre: 'T1078' },
      { label: 'Persistence', mitre: 'T1098' },
    ],
    actors: [
      { name: 'Tycoon 2FA', notes: 'PhaaS platform, Adversary-in-the-Middle' },
      { name: 'Evilginx', notes: 'Open-source proxy framework' },
      { name: 'EvilProxy', notes: 'Subscription-based PhaaS' },
      { name: 'Sneaky 2FA', notes: 'Microsoft 365 targeting' },
      { name: 'Device Code Flow', notes: 'OAuth device code abuse' },
    ],
    chokepoints: 5,
    avgTTR: 'N/A (session-based)',
    description:
      'Adversary-in-the-Middle proxy phishing that bypasses MFA by intercepting session tokens in real time. WebSocket relay and reverse proxy kits make this the fastest-growing initial access vector.',
  },
  {
    id: 'hypervisor',
    name: 'Hypervisor Chain',
    color: 'sky',
    badgeStyle: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    stages: [
      { label: 'Initial Access', mitre: 'T1190' },
      { label: 'Mgmt Plane Takeover', mitre: 'T1610' },
      { label: 'Credential Theft', mitre: 'T1003' },
      { label: 'Persistence', mitre: 'T1136' },
      { label: 'Lateral Movement', mitre: 'T1021' },
      { label: 'Impact', mitre: 'T1486' },
    ],
    actors: [
      { name: 'Scattered Spider', notes: 'Social engineering + hypervisor access' },
      { name: 'BlackCat/ALPHV', notes: 'vCenter exploitation' },
      { name: 'RansomHub', notes: 'VMware ESXi encrypted' },
      { name: 'Cactus', notes: 'ESXi SSH lateral movement' },
      { name: 'Monti', notes: 'ESXi ransomware copy' },
    ],
    chokepoints: 5,
    avgTTR: 'Variable',
    description:
      'VMware vSphere and ESXi targeting — from vCenter RCE through hypervisor credential theft to guest VM encryption. The Snowflake breach (2024) demonstrated cloud management plane risk at scale.',
  },
  {
    id: 'identity',
    name: 'Identity Chain',
    color: 'emerald',
    badgeStyle: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    stages: [
      { label: 'Initial Access', mitre: 'T1566' },
      { label: 'Credential Access', mitre: 'T1556' },
      { label: 'Privilege Escalation', mitre: 'T1078' },
      { label: 'Lateral Movement', mitre: 'T1021' },
      { label: 'Persistence', mitre: 'T1136' },
      { label: 'Impact', mitre: 'T1486' },
    ],
    actors: [
      { name: 'Scattered Spider', notes: 'Social engineering + help desk' },
      { name: 'Void Blizzard', notes: 'Entra ID OAuth abuse' },
      { name: 'LAPSUS$', notes: 'MFA fatigue + SIM swap' },
      { name: 'APT29 (Cozy Bear)', notes: 'Golden SAML, cloud persistence' },
      { name: 'Storm-1152', notes: 'M365 fraud-as-a-service' },
    ],
    chokepoints: 5,
    avgTTR: 'Variable',
    description:
      'Active Directory and Entra ID identity chain — from credential theft through Golden SAML, DCSync, or cloud token abuse to full domain or tenant compromise.',
  },
];

const CROSS_CHAIN = [
  {
    from: 'Infostealer',
    to: 'Ransomware',
    description:
      'Infostealer credentials sold to Initial Access Brokers (IABs) who provide RaaS affiliates initial footholds.',
    icon: Link2,
  },
  {
    from: 'AiTM Phishing',
    to: 'BEC',
    description:
      'Session tokens harvested via AiTM proxy kits enable Business Email Compromise without password compromise.',
    icon: Link2,
  },
  {
    from: 'Infostealer',
    to: 'AiTM Phishing',
    description: 'Stolen session cookies and OAuth tokens lower the barrier for follow-on AiTM campaigns.',
    icon: Link2,
  },
];

const REAL_EXAMPLES = [
  {
    name: 'Snowflake Breach (2024)',
    description:
      'Compromised credentials from infostealer infections used to access Snowflake customer environments. No MFA enabled — 165+ organizations affected, 1.5B+ records exfiltrated.',
    tags: ['infostealer', 'cloud', 'no-mfa', 'credential-theft'],
  },
  {
    name: 'RansomHub',
    description:
      'Ransomware-as-a-service exploiting CitrixBleed (CVE-2023-4966) and VMware ESXi vulnerabilities. Rapid lateral movement from edge to hypervisor to all guest VMs.',
    tags: ['ransomware', 'citrix', 'vmware', 'edge'],
  },
  {
    name: 'Scattered Spider',
    description:
      'Social engineering of help desk and IT support to reset credentials, then MFA enrollment for persistent cloud access. Targeted MGM, Caesars, and others.',
    tags: ['social-engineering', 'identity', 'help-desk', 'cloud'],
  },
];

const STAGE_COLOR: Record<string, string> = {
  rose: 'border-rose-500/30 bg-rose-500/10',
  amber: 'border-amber-500/30 bg-amber-500/10',
  violet: 'border-violet-500/30 bg-violet-500/10',
  sky: 'border-sky-500/30 bg-sky-500/10',
  emerald: 'border-emerald-500/30 bg-emerald-500/10',
};

export default function AttackChains(): JSX.Element {
  const [active, setActive] = useState<ChainId>('ransomware');
  const chain = CHAINS.find((c) => c.id === active)!;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
          <Shield size={28} className="text-brand-600 dark:text-brand-400" /> Attack Chains Hub
        </h1>
        <p className="text-muted mb-2 leading-relaxed">
          Five major attack chains with mapped chokepoints, threat actors, and cross-chain ecosystem connections. Each
          chain represents a complete intrusion lifecycle from initial access to impact.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          Source:{' '}
          <a
            href={sanitizeUrl('https://github.com/iimp0ster/detection-chokepoints') || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            iimp0ster/detection-chokepoints <ExternalLink size={11} />
          </a>
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        {CHAINS.map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`text-xs font-mono px-3 py-1.5 rounded border transition-colors ${
              active === c.id
                ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      <article className="surface-card p-5 mb-8">
        <header className="flex flex-wrap items-center gap-3 mb-4">
          <h2 className="font-display font-bold text-lg">{chain.name}</h2>
          <span
            className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${chain.badgeStyle}`}
          >
            {chain.chokepoints} chokepoints
          </span>
          <span className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-500 dark:text-slate-400">
            avg TTR: {chain.avgTTR}
          </span>
        </header>

        <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mb-5 leading-relaxed">{chain.description}</p>

        <div className="mb-5">
          <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-2">
            Kill Chain Stages
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {chain.stages.map((s, i) => (
              <div key={s.label} className="flex items-center gap-2">
                <div className={`rounded border px-3 py-1.5 text-xs font-mono ${STAGE_COLOR[chain.color]}`}>
                  <span className="font-semibold">{s.label}</span>
                  {s.mitre && <span className="ml-1.5 text-brand-600 dark:text-brand-400">{s.mitre}</span>}
                </div>
                {i < chain.stages.length - 1 && <ArrowRight size={12} className="text-slate-400 shrink-0" />}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-2">
            Threat Actors
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {chain.actors.map((a) => (
              <div
                key={a.name}
                className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-2.5"
              >
                <span className="font-display font-semibold text-sm">{a.name}</span>
                {a.notes && <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">{a.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      </article>

      <section className="surface-card p-5 mb-8">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3">
          Cross-Chain Ecosystem
        </h2>
        <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mb-4 leading-relaxed">
          Attack chains do not exist in isolation. Infostealer credentials fuel ransomware operations, and AiTM session
          tokens enable BEC campaigns.
        </p>
        <div className="space-y-3">
          {CROSS_CHAIN.map((cc) => (
            <div
              key={`${cc.from}-${cc.to}`}
              className="flex items-start gap-3 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
            >
              <cc.icon size={16} className="text-brand-600 dark:text-brand-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-mono font-semibold">
                  {cc.from} <span className="text-muted font-normal">feeds</span> {cc.to}
                </p>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">{cc.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="surface-card p-5">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3">
          Real-World Examples
        </h2>
        <div className="space-y-3">
          {REAL_EXAMPLES.map((ex) => (
            <div
              key={ex.name}
              className="rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
            >
              <p className="font-display font-semibold text-sm mb-1">{ex.name}</p>
              <p className="text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed">{ex.description}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {ex.tags.map((t) => (
                  <span
                    key={t}
                    className="text-micro font-mono px-1.5 py-0.5 rounded border border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
