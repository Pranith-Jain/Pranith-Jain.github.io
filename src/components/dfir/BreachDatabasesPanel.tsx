import { ExternalLink, Database } from 'lucide-react';

interface BreachDb {
  name: string;
  url: string;
  desc: string;
  tier: 'free-check' | 'freemium-api' | 'paid';
}

const DATABASES: ReadonlyArray<BreachDb> = [
  {
    name: 'Have I Been Pwned',
    url: 'https://haveibeenpwned.com',
    desc: 'Troy Hunt’s canonical breach corpus. Free email + domain lookup, k-anonymity password API. Powers most third-party checkers.',
    tier: 'free-check',
  },
  {
    name: 'LeakRadar',
    url: 'https://leakradar.io/en/leaks',
    desc: '290B+ leaked credentials indexed from stealer logs, combolists, and database dumps. Free account for search; REST API + Slack/Telegram/Webhook alerts on paid tiers.',
    tier: 'freemium-api',
  },
  {
    name: 'SOCRadar Labs',
    url: 'https://socradar.io/labs/app/dark-web-report/',
    desc: '15B+ breach records searched in a free dark-web exposure report. No signup, no credit card. B2B-grade output covering credentials, infostealer logs, and dark-web mentions.',
    tier: 'free-check',
  },
  {
    name: 'Lunar',
    url: 'https://lunarcyber.com/breach-catalog/',
    desc: 'Webz.io’s breach-monitoring platform — continuous ingestion from breach dumps and infostealer logs. Free Community tier exposes real-time credential + cookie exposure; Pro adds dashboards and automation.',
    tier: 'freemium-api',
  },
  {
    name: 'Flawtrack',
    url: 'https://www.flawtrack.com/scan',
    desc: 'Free dark-web credential scanner. 2.2B+ leaked credentials, 33M+ compromised devices. Search by email, company domain, or service URL — no signup.',
    tier: 'free-check',
  },
  {
    name: 'DeHashed',
    url: 'https://dehashed.com',
    desc: 'Large credential and PII corpus. Searchable by email, username, IP, name, address, phone. Paid API; some free preview hits.',
    tier: 'freemium-api',
  },
  {
    name: 'IntelX',
    url: 'https://intelx.io',
    desc: 'Search engine over indexed darknet, paste sites, Tor mirrors, and leak repositories. Free search with limited results; paid plans for full export.',
    tier: 'freemium-api',
  },
  {
    name: 'XposedOrNot',
    url: 'https://xposedornot.com',
    desc: 'Open-source breach checker — email + password + domain + CXO dashboard. 835M+ exposed passwords. Public API, no key required. Mirrored into this site’s /dfir/breach backend.',
    tier: 'free-check',
  },
  {
    name: 'LeakIX',
    url: 'https://leakix.net',
    desc: 'Indexed exposed services and leaked data on the open internet. Free search; OAuth API for automation.',
    tier: 'freemium-api',
  },
  {
    name: 'BreachDirectory',
    url: 'https://breachdirectory.org',
    desc: 'Free email + domain check against a large breach corpus. No signup. Useful as a HIBP cross-reference.',
    tier: 'free-check',
  },
  {
    name: 'DataBreach.com',
    url: 'https://databreach.com',
    desc: 'Atlas Privacy’s breach search. Lookup by name, address, phone, SSN, IP, username. Free check with browsable per-org breach catalog at /breach.',
    tier: 'free-check',
  },
  {
    name: 'Firefox Monitor',
    url: 'https://monitor.firefox.com',
    desc: 'Mozilla’s consumer-facing wrapper over HIBP. Free email check with re-check alerts.',
    tier: 'free-check',
  },
];

const TIER_STYLE: Record<BreachDb['tier'], string> = {
  'free-check': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'freemium-api': 'border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300',
  paid: 'border-slate-300 dark:border-[rgb(var(--border-400))] bg-slate-100 dark:bg-[rgb(var(--surface-300))] text-slate-500 dark:text-slate-400',
};

const TIER_LABEL: Record<BreachDb['tier'], string> = {
  'free-check': 'free check',
  'freemium-api': 'freemium + api',
  paid: 'paid',
};

/**
 * Static catalog of legitimate, well-known breach databases. We can't proxy
 * most of them (key required or ToS prohibits redistribution), so this is
 * a cross-reference block — analysts use the embedded checker for the
 * fast path, then pivot here when they need broader coverage.
 */
export function BreachDatabasesPanel({ initialQuery }: { initialQuery?: string }): JSX.Element {
  const trimmed = initialQuery?.trim() ?? '';
  const buildUrl = (db: BreachDb): string => {
    if (!trimmed) return db.url;
    const q = encodeURIComponent(trimmed);
    if (db.name === 'Have I Been Pwned') return `https://haveibeenpwned.com/unifiedsearch/${q}`;
    if (db.name === 'IntelX') return `https://intelx.io/?s=${q}`;
    if (db.name === 'LeakIX') return `https://leakix.net/search?q=${q}`;
    if (db.name === 'BreachDirectory') return `https://breachdirectory.org/?q=${q}`;
    if (db.name === 'XposedOrNot' && trimmed.includes('@')) return `https://xposedornot.com/email-report/${q}`;
    if (db.name === 'DataBreach.com') return `https://databreach.com/?q=${q}`;
    if (db.name === 'DeHashed') return `https://dehashed.com/search?query=${q}`;
    return db.url;
  };

  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between mb-3 pb-2 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
        <h2 className="font-display font-bold text-xl inline-flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <Database size={18} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />
          External breach databases
        </h2>
        <span className="text-xs font-mono text-slate-500">{DATABASES.length} sources</span>
      </div>
      <p className="text-sm text-muted mb-4 max-w-3xl">
        For deeper coverage beyond what this tool can check directly. Each link opens an external search — credentials
        and ToS apply.{trimmed && ' Where supported, the link is pre-filled with your query.'}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DATABASES.map((db) => (
          <a
            key={db.name}
            href={buildUrl(db)}
            target="_blank"
            rel="noopener noreferrer"
            className="glass group block p-4 rounded-xl hover:border-brand-500/40 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-sm font-display font-bold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors flex items-center gap-1">
                {db.name}
                <ExternalLink size={11} className="opacity-60" aria-hidden="true" />
              </span>
              <span
                className={`ml-auto text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${TIER_STYLE[db.tier]}`}
              >
                {TIER_LABEL[db.tier]}
              </span>
            </div>
            <p className="text-xs text-muted leading-relaxed">{db.desc}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
