import { BackLink } from '../../components/BackLink';
import { ArrowLeft, Plug, Shield, Globe, Server, FileSearch, Cpu, Book, Bug, Terminal } from 'lucide-react';

/**
 * Public-facing integrations directory.
 *
 * This is intentionally an analyst-facing surface — what's wired into the
 * platform and what capability each integration unlocks. It deliberately
 * does NOT expose the underlying env-var names, account URLs, free-tier
 * limits, or Worker bindings — those are operator concerns and live in
 * the deploy docs, not in a public page.
 */

interface Integration {
  name: string;
  category: 'reputation' | 'recon' | 'malware' | 'breach' | 'social' | 'platform';
  icon: typeof Plug;
  capability: string;
  status: 'live' | 'optional';
}

const INTEGRATIONS: Integration[] = [
  // ─── Reputation + IOC enrichment ────────────────────────────────────────
  {
    name: 'VirusTotal',
    category: 'reputation',
    icon: Shield,
    capability: 'Multi-engine AV verdicts on hashes, URLs, domains, IPs',
    status: 'optional',
  },
  {
    name: 'AbuseIPDB',
    category: 'reputation',
    icon: Shield,
    capability: 'Community-reported abuse confidence score per IP',
    status: 'optional',
  },
  {
    name: 'AlienVault OTX',
    category: 'reputation',
    icon: Bug,
    capability: 'Pulse subscriptions + cross-source IOC enrichment',
    status: 'live',
  },
  {
    name: 'GreyNoise',
    category: 'reputation',
    icon: FileSearch,
    capability: 'Internet-background-noise classification (benign scanners vs. targeted activity)',
    status: 'optional',
  },
  {
    name: 'URLhaus',
    category: 'reputation',
    icon: Shield,
    capability: 'Malware URL distribution feed (abuse.ch)',
    status: 'live',
  },
  {
    name: 'ThreatFox',
    category: 'reputation',
    icon: Bug,
    capability: 'Recent IOC submissions tagged by malware family (abuse.ch)',
    status: 'live',
  },
  {
    name: 'Feodo Tracker',
    category: 'reputation',
    icon: Bug,
    capability: 'Active C2 IPs for known banking trojans (abuse.ch)',
    status: 'live',
  },
  // ─── Reconnaissance + exposure ──────────────────────────────────────────
  {
    name: 'Shodan',
    category: 'recon',
    icon: Server,
    capability: 'Host-enrichment for exposure scans (ports, banners, CVEs)',
    status: 'optional',
  },
  {
    name: 'Censys',
    category: 'recon',
    icon: Globe,
    capability: 'Internet-scan host + certificate intelligence',
    status: 'optional',
  },
  {
    name: 'crt.sh',
    category: 'recon',
    icon: Globe,
    capability: 'Certificate Transparency log search',
    status: 'live',
  },
  {
    name: 'CertStream',
    category: 'recon',
    icon: Globe,
    capability: 'Real-time SSL/TLS issuance firehose with keyword highlight',
    status: 'live',
  },
  {
    name: 'CriminalIP',
    category: 'recon',
    icon: Server,
    capability: 'Daily-curated C2 host feed (Mythic / Havoc / MeshAgent / Metasploit)',
    status: 'live',
  },
  // ─── Malware + sandbox ─────────────────────────────────────────────────
  {
    name: 'Malware Bazaar',
    category: 'malware',
    icon: FileSearch,
    capability: 'Recent malware samples + hash search (abuse.ch)',
    status: 'live',
  },
  {
    name: 'Hybrid Analysis',
    category: 'malware',
    icon: FileSearch,
    capability: 'Sandbox detonation report search',
    status: 'optional',
  },
  {
    name: 'URLScan.io',
    category: 'malware',
    icon: FileSearch,
    capability: 'URL screenshots, DOM analysis, and behavioural verdicts',
    status: 'optional',
  },
  {
    name: 'YARAify',
    category: 'malware',
    icon: FileSearch,
    capability: 'YARA-rule matches against malware samples (abuse.ch)',
    status: 'live',
  },
  {
    name: 'Malpedia',
    category: 'malware',
    icon: Book,
    capability: 'Malware family + actor encyclopaedia',
    status: 'live',
  },
  {
    name: 'Maltrail',
    category: 'malware',
    icon: FileSearch,
    capability: 'Per-actor IOC lists imported from community trail files',
    status: 'live',
  },
  // ─── Breach + identity ─────────────────────────────────────────────────
  {
    name: 'Have I Been Pwned',
    category: 'breach',
    icon: Shield,
    capability: 'Breach catalogue + email/domain pwn lookups',
    status: 'live',
  },
  {
    name: 'EmailRep',
    category: 'breach',
    icon: Bug,
    capability: 'Email reputation + breach-source attribution',
    status: 'optional',
  },
  // ─── Social / OSINT ────────────────────────────────────────────────────
  {
    name: 'X (Twitter) firehose',
    category: 'social',
    icon: Terminal,
    capability: '70+ cybersec accounts streamed chronologically (cookie-authed)',
    status: 'live',
  },
  {
    name: 'Reddit',
    category: 'social',
    icon: Terminal,
    capability: 'r/netsec, r/cybersecurity, r/blueteamsec post stream',
    status: 'live',
  },
  {
    name: 'Telegram',
    category: 'social',
    icon: Terminal,
    capability: 'Public cybersec channel firehose (web preview, no Bot API)',
    status: 'live',
  },
  // ─── Vulnerability data ────────────────────────────────────────────────
  {
    name: 'NVD 2.0',
    category: 'platform',
    icon: Shield,
    capability: 'Recent CVE feed with CVSS + CPE enrichment',
    status: 'live',
  },
  {
    name: 'CISA KEV',
    category: 'platform',
    icon: Shield,
    capability: 'Known-Exploited Vulnerabilities catalogue',
    status: 'live',
  },
  {
    name: 'EPSS',
    category: 'platform',
    icon: Shield,
    capability: 'Exploit Prediction Scoring System',
    status: 'live',
  },
  {
    name: 'cvefeed.io',
    category: 'platform',
    icon: Shield,
    capability: 'High-severity CVE syndication',
    status: 'live',
  },
  // ─── Platform infra ────────────────────────────────────────────────────
  {
    name: 'ransomware.live',
    category: 'platform',
    icon: Bug,
    capability: 'Active ransomware victim listings + group attribution',
    status: 'live',
  },
  {
    name: 'MITRE ATT&CK',
    category: 'platform',
    icon: Cpu,
    capability: 'Tactics, techniques, sub-techniques + Groups + Software',
    status: 'live',
  },
  {
    name: 'MITRE ATLAS',
    category: 'platform',
    icon: Cpu,
    capability: 'Adversarial threat landscape for ML/AI systems',
    status: 'live',
  },
];

const CATEGORY_LABEL: Record<Integration['category'], string> = {
  reputation: 'Reputation & IOC enrichment',
  recon: 'Reconnaissance & exposure',
  malware: 'Malware analysis',
  breach: 'Breach & identity',
  social: 'Social / OSINT firehoses',
  platform: 'Vulnerability & platform data',
};

const CATEGORY_ORDER: Integration['category'][] = ['reputation', 'recon', 'malware', 'breach', 'social', 'platform'];

export default function Settings(): JSX.Element {
  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: INTEGRATIONS.filter((i) => i.category === cat),
  }));
  const liveCount = INTEGRATIONS.filter((i) => i.status === 'live').length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="mb-8 animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Plug size={26} className="text-brand-600 dark:text-brand-400" /> Integrations
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
          External data sources wired into the platform.{' '}
          <span className="font-semibold text-slate-700 dark:text-slate-200">{liveCount} live</span> and serving the
          analyst-facing pages now. Items marked <em>optional</em> light up when the operator enables them; they fail
          soft until then so nothing else breaks.
        </p>
      </div>

      <div className="space-y-8">
        {byCategory.map(({ cat, items }) => (
          <section key={cat} className="animate-fade-in-up">
            <h2 className="font-display font-semibold text-base mb-3 text-slate-800 dark:text-slate-200">
              {CATEGORY_LABEL[cat]}
              <span className="ml-2 text-[11px] font-mono text-slate-500">{items.length}</span>
            </h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {items.map((i) => {
                const Icon = i.icon;
                return (
                  <div
                    key={i.name}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex items-start gap-3"
                  >
                    <Icon size={16} className="text-slate-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{i.name}</span>
                        <span
                          className={
                            i.status === 'live'
                              ? 'inline-flex items-center text-[10px] font-mono rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5'
                              : 'inline-flex items-center text-[10px] font-mono rounded border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5'
                          }
                        >
                          {i.status === 'live' ? 'live' : 'optional'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        {i.capability}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
