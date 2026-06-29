import { DataPageLayout } from '../../components/DataPageLayout';
import { useTheme } from '../../hooks';
import { Plug, Moon, Sun } from 'lucide-react';

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
    icon: Plug,
    capability: 'Multi-engine AV verdicts on hashes, URLs, domains, IPs',
    status: 'optional',
  },
  {
    name: 'AbuseIPDB',
    category: 'reputation',
    icon: Plug,
    capability: 'Community-reported abuse confidence score per IP',
    status: 'optional',
  },
  {
    name: 'AlienVault OTX',
    category: 'reputation',
    icon: Plug,
    capability: 'Pulse subscriptions + cross-source IOC enrichment',
    status: 'live',
  },
  {
    name: 'GreyNoise',
    category: 'reputation',
    icon: Plug,
    capability: 'Internet-background-noise classification (benign scanners vs. targeted activity)',
    status: 'optional',
  },
  {
    name: 'URLhaus',
    category: 'reputation',
    icon: Plug,
    capability: 'Malware URL distribution feed (abuse.ch)',
    status: 'live',
  },
  {
    name: 'ThreatFox',
    category: 'reputation',
    icon: Plug,
    capability: 'Recent IOC submissions tagged by malware family (abuse.ch)',
    status: 'live',
  },
  // ─── Reconnaissance + exposure ──────────────────────────────────────────
  {
    name: 'Shodan',
    category: 'recon',
    icon: Plug,
    capability: 'Host-enrichment for exposure scans (ports, banners, CVEs)',
    status: 'optional',
  },
  {
    name: 'Censys',
    category: 'recon',
    icon: Plug,
    capability: 'Internet-scan host + certificate intelligence',
    status: 'optional',
  },
  {
    name: 'crt.sh',
    category: 'recon',
    icon: Plug,
    capability: 'Certificate Transparency log search',
    status: 'live',
  },
  {
    name: 'CertStream',
    category: 'recon',
    icon: Plug,
    capability: 'Real-time SSL/TLS issuance firehose with keyword highlight',
    status: 'live',
  },
  {
    name: 'CriminalIP',
    category: 'recon',
    icon: Plug,
    capability: 'Daily-curated C2 host feed (Mythic / Havoc / MeshAgent / Metasploit)',
    status: 'live',
  },
  // ─── Malware + sandbox ─────────────────────────────────────────────────
  {
    name: 'Malware Bazaar',
    category: 'malware',
    icon: Plug,
    capability: 'Recent malware samples + hash search (abuse.ch)',
    status: 'live',
  },
  {
    name: 'Hybrid Analysis',
    category: 'malware',
    icon: Plug,
    capability: 'Sandbox detonation report search',
    status: 'optional',
  },
  {
    name: 'URLScan.io',
    category: 'malware',
    icon: Plug,
    capability: 'URL screenshots, DOM analysis, and behavioural verdicts',
    status: 'optional',
  },
  {
    name: 'YARAify',
    category: 'malware',
    icon: Plug,
    capability: 'YARA-rule matches against malware samples (abuse.ch)',
    status: 'live',
  },
  {
    name: 'Malpedia',
    category: 'malware',
    icon: Plug,
    capability: 'Malware family + actor encyclopaedia',
    status: 'live',
  },
  {
    name: 'Maltrail',
    category: 'malware',
    icon: Plug,
    capability: 'Per-actor IOC lists imported from community trail files',
    status: 'live',
  },
  // ─── Breach + identity ─────────────────────────────────────────────────
  {
    name: 'Have I Been Pwned',
    category: 'breach',
    icon: Plug,
    capability: 'Breach catalogue + email/domain pwn lookups',
    status: 'live',
  },
  {
    name: 'EmailRep',
    category: 'breach',
    icon: Plug,
    capability: 'Email reputation + breach-source attribution',
    status: 'optional',
  },
  // ─── Social / OSINT ────────────────────────────────────────────────────
  {
    name: 'X (Twitter) firehose',
    category: 'social',
    icon: Plug,
    capability: '70+ cybersec accounts streamed chronologically (cookie-authed)',
    status: 'live',
  },
  {
    name: 'Reddit',
    category: 'social',
    icon: Plug,
    capability: 'r/netsec, r/cybersecurity, r/blueteamsec post stream',
    status: 'live',
  },
  {
    name: 'Telegram',
    category: 'social',
    icon: Plug,
    capability: 'Public cybersec channel firehose (web preview, no Bot API)',
    status: 'live',
  },
  // ─── Vulnerability data ────────────────────────────────────────────────
  {
    name: 'NVD 2.0',
    category: 'platform',
    icon: Plug,
    capability: 'Recent CVE feed with CVSS + CPE enrichment',
    status: 'live',
  },
  {
    name: 'CISA KEV',
    category: 'platform',
    icon: Plug,
    capability: 'Known-Exploited Vulnerabilities catalogue',
    status: 'live',
  },
  {
    name: 'EPSS',
    category: 'platform',
    icon: Plug,
    capability: 'Exploit Prediction Scoring System',
    status: 'live',
  },
  {
    name: 'cvefeed.io',
    category: 'platform',
    icon: Plug,
    capability: 'High-severity CVE syndication',
    status: 'live',
  },
  // ─── Platform infra ────────────────────────────────────────────────────
  {
    name: 'ransomware.live',
    category: 'platform',
    icon: Plug,
    capability: 'Active ransomware victim listings + group attribution',
    status: 'live',
  },
  {
    name: 'MITRE ATT&CK',
    category: 'platform',
    icon: Plug,
    capability: 'Tactics, techniques, sub-techniques + Groups + Software',
    status: 'live',
  },
  {
    name: 'MITRE ATLAS',
    category: 'platform',
    icon: Plug,
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

export default function SettingsPage(): JSX.Element {
  const { isDark, toggleTheme } = useTheme();
  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: INTEGRATIONS.filter((i) => i.category === cat),
  }));
  const liveCount = INTEGRATIONS.filter((i) => i.status === 'live').length;

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Plug size={26} />}
      title="Integrations"
      description={
        <>
          External data sources wired into the platform.{' '}
          <span className="font-semibold text-slate-700 dark:text-slate-200">{liveCount} live</span> and serving the
          analyst-facing pages now. Items marked <em>optional</em> light up when the operator enables them; they fail
          soft until then so nothing else breaks.
        </>
      }
      accentClass="text-brand-600 dark:text-brand-400"
    >
      {/* ── Preferences ──────────────────────────────────────────── */}
      <section className="mb-10 animate-fade-in-up">
        <h2 className="font-display font-semibold text-base mb-3 text-slate-800 dark:text-slate-200">Preferences</h2>
        <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm text-slate-900 dark:text-slate-100">Dark mode</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isDark ? 'Currently using dark theme' : 'Currently using light theme'}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-300))] px-3 py-2 text-sm font-mono text-slate-700 dark:text-slate-300 hover:border-brand-500/50 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
              aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
              {isDark ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>
      </section>

      <div className="space-y-8">
        {byCategory.map(({ cat, items }) => (
          <section key={cat} className="animate-fade-in-up">
            <h2 className="font-display font-semibold text-base mb-3 text-slate-800 dark:text-slate-200">
              {CATEGORY_LABEL[cat]}
              <span className="ml-2 text-mini font-mono text-slate-500">{items.length}</span>
            </h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {items.map((i) => {
                return (
                  <div
                    key={i.name}
                    className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3 flex items-start gap-3"
                  >
                    <Plug size={16} className="text-slate-500 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{i.name}</span>
                        <span
                          className={
                            i.status === 'live'
                              ? 'inline-flex items-center text-micro font-mono rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5'
                              : 'inline-flex items-center text-micro font-mono rounded border border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-500 px-1.5 py-0.5'
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
    </DataPageLayout>
  );
}
