import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ShieldAlert, Search } from 'lucide-react';

const MOST_WANTED = [
  {
    name: 'LockBit',
    slug: 'lockbit',
    risk: 'CRITICAL' as const,
    categories: ['Ransomware', 'Cybercrime'],
    description: 'Prolific Ransomware-as-a-Service operation responsible for thousands of attacks worldwide. Known for advanced encryption, data exfiltration, and a dedicated leak site.',
    aliases: ['LockBit 2.0', 'LockBit 3.0', 'LockBit Black'],
    origin: 'Russia',
    tools: ['LockBit encryptor', 'StealBit', 'LockBit Negotiator'],
  },
  {
    name: 'APT29 (Cozy Bear)',
    slug: 'apt29',
    risk: 'CRITICAL' as const,
    categories: ['APT', 'Cyber Espionage'],
    description: 'Russian state-sponsored threat group attributed to the SVR. Known for supply chain attacks, diplomatic targets, and long-term espionage campaigns.',
    aliases: ['Cozy Bear', 'The Dukes', 'NOBELIUM'],
    origin: 'Russia',
    tools: ['SolarWinds backdoor', 'Beacon', 'PowerShell implants'],
  },
  {
    name: 'BlackCat (ALPHV)',
    slug: 'alphv',
    risk: 'CRITICAL' as const,
    categories: ['Ransomware', 'Cybercrime'],
    description: 'Rust-based RaaS group known for sophisticated attacks, data extortion, and targeting critical infrastructure across multiple sectors.',
    aliases: ['ALPHV', 'Noberus'],
    origin: 'Russia',
    tools: ['BlackCat encryptor', 'Tor leak site', 'Exfiltration tools'],
  },
  {
    name: 'Lazarus Group',
    slug: 'lazarus',
    risk: 'CRITICAL' as const,
    categories: ['APT', 'Cyber Espionage', 'Financial Crime'],
    description: 'North Korean state-sponsored threat group responsible for destructive attacks, cryptocurrency thefts, and the Sony Pictures breach.',
    aliases: ['Hidden Cobra', 'ZINC', 'APT38'],
    origin: 'North Korea',
    tools: ['Destructive wipers', 'RATs', 'Cryptocurrency traders'],
  },
  {
    name: 'Black Basta',
    slug: 'black-basta',
    risk: 'HIGH' as const,
    categories: ['Ransomware', 'Cybercrime'],
    description: 'Ransomware group first observed in 2022. Uses double-extortion tactics and has targeted enterprises across North America and Europe.',
    aliases: [],
    origin: 'Russia',
    tools: ['Black Basta encryptor', 'QakBot', 'Cobalt Strike'],
  },
  {
    name: 'Scattered Spider',
    slug: 'scattered-spider',
    risk: 'HIGH' as const,
    categories: ['Cybercrime', 'Social Engineering'],
    description: 'Highly social engineering-focused criminal group targeting SaaS platforms and cloud environments. Known for SIM-swapping and MFA bypass.',
    aliases: ['UNC3944', 'Muddled Libra'],
    origin: 'US/UK',
    tools: ['Social engineering toolkit', 'RATs', 'Cloud exploitation'],
  },
  {
    name: 'APT41 (Winnti)',
    slug: 'apt41',
    risk: 'HIGH' as const,
    categories: ['APT', 'Cyber Espionage', 'Financial Crime'],
    description: 'Chinese state-sponsored group with dual motivations of espionage and financial gain. Targets gaming, tech, and healthcare sectors.',
    aliases: ['Winnti', 'BARIUM', 'ShadowPad'],
    origin: 'China',
    tools: ['Winnti backdoor', 'ShadowPad', 'PlugX'],
  },
  {
    name: 'Clop',
    slug: 'clop',
    risk: 'HIGH' as const,
    categories: ['Ransomware', 'Cybercrime'],
    description: 'Ransomware group notorious for exploiting zero-day vulnerabilities in file transfer software (Accellion, GoAnywhere, MOVEit).',
    aliases: ['TA505', 'FIN11'],
    origin: 'Russia',
    tools: ['Clop encryptor', 'MOVEit exploit', 'GoAnywhere exploit'],
  },
  {
    name: 'APT33 (Elfin)',
    slug: 'apt33',
    risk: 'MEDIUM' as const,
    categories: ['APT', 'Cyber Espionage'],
    description: 'Iranian state-sponsored threat group targeting aerospace, energy, and petrochemical sectors with destructive wiper attacks.',
    aliases: ['Elfin', 'Refined Kitten', 'Magnallium'],
    origin: 'Iran',
    tools: ['Shamoon wiper', 'DDoS tools', 'RATs'],
  },
  {
    name: 'Kimsesky',
    slug: 'kimsuky',
    risk: 'MEDIUM' as const,
    categories: ['APT', 'Cyber Espionage'],
    description: 'North Korean threat group focused on intelligence gathering against South Korean government, think tanks, and academia.',
    aliases: ['Black Banshee', 'Thallium', 'Velvet Chollima'],
    origin: 'North Korea',
    tools: ['BabyShark', 'Kimusky RAT', 'AppleSeed'],
  },
  {
    name: 'Killnet',
    slug: 'killnet',
    risk: 'MEDIUM' as const,
    categories: ['Hacktivism', 'DDoS'],
    description: 'Pro-Russian hacktivist group known for large-scale DDoS attacks against governments and critical infrastructure in NATO countries.',
    aliases: ['Killnet', 'From Russia with Love'],
    origin: 'Russia',
    tools: ['DDoS tools', 'Web defacement', 'Leak sites'],
  },
  {
    name: 'SiegedSec',
    slug: 'siegedsec',
    risk: 'MEDIUM' as const,
    categories: ['Hacktivism', 'Data Leaks'],
    description: 'Hacktivist group known for targeting pro-LGBTQ+ causes and government entities with data breaches and leaks.',
    aliases: ['SiegedSec'],
    origin: 'International',
    tools: ['Telegram leak channels', 'Social engineering'],
  },
];

const RISK_PILL: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-300 dark:border-red-800',
  HIGH: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800',
};

const RISK_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };

export default function MostWanted(): JSX.Element {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return MOST_WANTED;
    return MOST_WANTED.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.categories.some((c) => c.toLowerCase().includes(q)) ||
        a.risk.toLowerCase().includes(q) ||
        a.origin.toLowerCase().includes(q) ||
        a.tools.some((t) => t.toLowerCase().includes(q)) ||
        a.aliases.some((al) => al.toLowerCase().includes(q))
    );
  }, [query]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => (RISK_ORDER[a.risk] ?? 99) - (RISK_ORDER[b.risk] ?? 99));
  }, [filtered]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<ShieldAlert size={28} />}
      title="Threat Actor Most Wanted"
      description="Curated list of the most significant threat actors and cybercriminal groups currently active — prioritized by risk and global impact."
    >
      <div className="relative mb-6">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name, category, risk, origin, tools, or aliases…"
          className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
        />
      </div>

      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">
        {sorted.length} {sorted.length === 1 ? 'actor' : 'actors'} listed
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((actor) => (
          <Link
            key={actor.slug}
            to={`/threatintel/actors/${actor.slug}`}
            className="group surface-card p-5 transition hover:-translate-y-0.5 hover:border-brand-500/50 hover:shadow-e2 flex flex-col"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-display font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                {actor.name}
              </h3>
              <span
                className={`shrink-0 text-micro font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${RISK_PILL[actor.risk] ?? ''}`}
              >
                {actor.risk}
              </span>
            </div>

            <div className="flex flex-wrap gap-1 mb-2">
              {actor.categories.map((cat) => (
                <span
                  key={cat}
                  className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                >
                  {cat}
                </span>
              ))}
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-3 line-clamp-3">
              {actor.description}
            </p>

            <div className="mt-auto space-y-1.5 text-xs font-mono text-slate-500 dark:text-slate-500">
              {actor.aliases.length > 0 && (
                <p>
                  <span className="text-slate-400 dark:text-slate-500">Aliases:</span>{' '}
                  {actor.aliases.join(', ')}
                </p>
              )}
              <p>
                <span className="text-slate-400 dark:text-slate-500">Origin:</span> {actor.origin}
              </p>
              <p>
                <span className="text-slate-400 dark:text-slate-500">Tools:</span>{' '}
                {actor.tools.join(', ')}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {sorted.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-12 font-mono">
          No actors match your filter.
        </p>
      )}
    </DataPageLayout>
  );
}
