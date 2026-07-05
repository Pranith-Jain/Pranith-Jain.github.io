import { DataPageLayout } from '../../components/DataPageLayout';
import { ArrowRight, ExternalLink, Shield, AlertTriangle, Link2 } from 'lucide-react';
import { sanitizeUrl } from '../../lib/sanitize-url';

interface ChainLink {
  from: string;
  to: string;
  label: string;
  color: string;
  description: string;
}

const ECOSYSTEM_LINKS: ChainLink[] = [
  {
    from: 'Infostealers',
    to: 'Ransomware',
    label: 'Credential Pipeline',
    color: 'rose',
    description:
      'Infostealer-harvested credentials are sold on IAB marketplaces and used as initial access for ransomware operations. Snowflake breach (2024): 165+ orgs compromised via infostealer creds.',
  },
  {
    from: 'AiTM Kits',
    to: 'BEC / Double Extortion',
    label: 'Session Hijacking',
    color: 'amber',
    description:
      'AiTM-compromised accounts are used for business email compromise, internal phishing, and lateral movement. Session tokens bypass MFA entirely.',
  },
  {
    from: 'AiTM Kits',
    to: 'Ransomware',
    label: 'IAB Supply Chain',
    color: 'orange',
    description:
      'Scattered Spider: AiTM → Okta session → lateral movement → ransomware. AiTM-stolen accounts sold to ransomware IABs.',
  },
  {
    from: 'ClickFix',
    to: 'Infostealers',
    label: 'Delivery Vector',
    color: 'violet',
    description:
      'ClickFix is the primary delivery mechanism for LummaC2 (51% surge in 2025). Clipboard paste → LOLBin chain → stealer deployment.',
  },
  {
    from: 'Renamed RMM',
    to: 'Ransomware',
    label: 'Persistence Layer',
    color: 'sky',
    description:
      'RMM tools (AnyDesk, ScreenConnect) provide persistent C2 access post-compromise. Used by Akira, Scattered Spider, and commodity operators.',
  },
  {
    from: 'EDR Bypass',
    to: 'Ransomware',
    label: 'Pre-Encryption',
    color: 'red',
    description:
      'BYOVD EDR killers (EDRKillShifter, Terminator) are deployed as a pre-ransomware step. 54% of ransomware chains include EDR bypass.',
  },
];

const CHAINS = [
  { name: 'Infostealers', color: 'violet', icon: '🔑', tools: 'LummaC2, RedLine, Raccoon' },
  { name: 'Ransomware', color: 'rose', icon: '🔒', tools: 'LockBit, BlackCat, Akira' },
  { name: 'AiTM Kits', color: 'amber', icon: '🎣', tools: 'Tycoon 2FA, Evilginx' },
  { name: 'ClickFix', color: 'emerald', icon: '📋', tools: '9 variants tracked' },
  { name: 'Renamed RMM', color: 'sky', icon: '🖥️', tools: 'AnyDesk, ScreenConnect' },
  { name: 'EDR Bypass', color: 'red', icon: '🛡️', tools: 'Terminator, POORTRY' },
  { name: 'BEC / Double Extortion', color: 'orange', icon: '📧', tools: 'Internal phishing' },
];

const TONE: Record<string, string> = {
  rose: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  orange: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  violet: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  sky: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  red: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  emerald: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
};

const CARD =
  'rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1';

export default function CrossChainEcosystem() {
  return (
    <DataPageLayout
      title="Cross-Chain Ecosystem"
      subtitle="How attack chains feed into each other — infostealers fund ransomware, AiTM enables BEC, ClickFix delivers stealers."
      backLink={{ to: '/dfir/attack-chains', label: 'Attack Chains' }}
      headerExtra={
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
          Source:{' '}
          <a
            href={sanitizeUrl('https://iimp0ster.github.io/detection-chokepoints/attack-chains/') || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
          >
            Detection Chokepoints <ExternalLink size={11} />
          </a>{' '}
          · {ECOSYSTEM_LINKS.length} cross-chain connections mapped.
        </p>
      }
      maxWidthClass="max-w-6xl"
    >
      {/* Chain Nodes */}
      <div className="mb-8">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Shield size={18} /> Attack Chain Ecosystem
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {CHAINS.map((chain) => (
            <div key={chain.name} className={`${CARD} p-3`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{chain.icon}</span>
                <span className="font-mono text-sm font-medium text-slate-900 dark:text-white">{chain.name}</span>
              </div>
              <p className="text-xs text-muted font-mono">{chain.tools}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Connection Map */}
      <div className="mb-8">
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Link2 size={18} /> Cross-Chain Connections
        </h2>
        <div className="space-y-3">
          {ECOSYSTEM_LINKS.map((link, i) => (
            <div key={i} className={`${CARD} p-4`}>
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <span className={`text-xs font-mono px-2 py-0.5 rounded border ${TONE[link.color]}`}>{link.from}</span>
                <ArrowRight size={14} className="text-slate-400" />
                <span className={`text-xs font-mono px-2 py-0.5 rounded border ${TONE[link.color]}`}>{link.to}</span>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400">· {link.label}</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{link.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Real-World Examples */}
      <div>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <AlertTriangle size={18} /> Real-World Cross-Chain Examples
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            {
              title: 'Snowflake Breach (2024)',
              chains: 'Infostealer → Ransomware',
              detail:
                'UNC5537 used infostealer-harvested credentials for initial access to 160+ organizations via Snowflake. No MFA on accounts. Data exfiltration + extortion.',
            },
            {
              title: 'RansomHub Campaign',
              chains: 'ClickFix → Stealer → IAB → Ransomware',
              detail:
                'ClickFix clipboard delivery → LummaC2 stealer → credential sale on IAB → RansomHub affiliate deployment.',
            },
            {
              title: 'Scattered Spider',
              chains: 'AiTM → Okta → Lateral → Ransomware',
              detail:
                'AiTM session theft → Okta admin escalation → lateral movement → Alphv/BlackCat ransomware deployment.',
            },
            {
              title: 'MuddyWater',
              chains: 'Renamed RMM → Persistence → Espionage',
              detail:
                'Atera RMM deployed via social engineering → persistent C2 → Iranian state-sponsored espionage operations.',
            },
          ].map((example) => (
            <div key={example.title} className={`${CARD} p-4`}>
              <h3 className="font-mono text-sm font-semibold text-slate-900 dark:text-white mb-1">{example.title}</h3>
              <p className="text-xs font-mono text-brand-600 dark:text-brand-400 mb-2">{example.chains}</p>
              <p className="text-sm text-slate-700 dark:text-slate-300">{example.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </DataPageLayout>
  );
}
