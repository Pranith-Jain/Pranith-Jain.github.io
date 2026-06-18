import { useMemo, useState } from 'react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { Search, ShieldAlert, AlertTriangle, Eye, Lock } from 'lucide-react';

interface PredatorCategory {
  name: string;
  type: string;
  risk: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  regions: string[];
  description: string;
  indicators: string[];
  resources: string[];
}

const CATEGORIES: PredatorCategory[] = [
  {
    name: 'Child Sexual Exploitation (CSAM) Networks',
    type: 'Online Predation',
    risk: 'CRITICAL',
    regions: ['Global'],
    description:
      'Dark-web and encrypted-platform networks involved in the production, distribution, and consumption of child sexual abuse material. Includes Tor hidden-service markets, encrypted messaging groups, and peer-to-peer (P2P) file-sharing rings. Increasing use of cryptocurrency for transactions and AI-generated CSAM.',
    indicators: [
      'Tor hidden service URLs',
      'End-to-end encrypted channels',
      'Cryptocurrency payment patterns',
      'P2P hash-sharing rings',
      'AI-generated imagery detection',
    ],
    resources: [
      'NCMEC CyberTipline',
      'IWF (Internet Watch Foundation)',
      'FBI Innocent Images',
      'Europol EC3',
      'Project VIC',
    ],
  },
  {
    name: 'Sextortion Networks',
    type: 'Financial / Coercive',
    risk: 'CRITICAL',
    regions: ['West Africa', 'Southeast Asia', 'Eastern Europe', 'Global'],
    description:
      'Organized sextortion rings targeting minors and adults through social engineering, compromised accounts, and deepfake content. West Africa (Yahoo Boys), SEA cyberscam centers, and Eastern European groups operate sophisticated pipelines from initial contact to ongoing extortion. Increasingly targeting minors via gaming platforms and social media.',
    indicators: [
      'Unsolicited friend requests from attractive profiles',
      'Requests to move to WhatsApp/Snapchat',
      'Compromised webcam indications',
      'Threat of image release with screenshots',
      'Demands for cryptocurrency / gift cards',
    ],
    resources: [
      'FBI Sextortion Tips',
      'NCMEC Take It Down',
      'StopNCII.org',
      'FBI IC3 Sextortion PSA',
      'Thorn — Safer.io',
    ],
  },
  {
    name: 'Online Grooming Ecosystems',
    type: 'Social Engineering',
    risk: 'HIGH',
    regions: ['Global'],
    description:
      'Platforms and networks where adults systematically groom minors for exploitation. Operates across gaming platforms (Roblox, Fortnite, Minecraft), social media (Instagram, Snapchat, TikTok), and encrypted chat apps. Groomers use love-bombing, desensitization, and isolation tactics. Increasing use of generative AI to create convincing personas.',
    indicators: [
      'Age-inappropriate gifts / attention',
      'Requests for secret relationships',
      'Excessive screen time with unknown contacts',
      'New apps installed with hidden chats',
      'Gaming console direct-message contacts',
    ],
    resources: [
      'Thorn — Safer.io',
      'NetSmartz Workshop',
      'NCMEC CyberTipline',
      'Internet Matters',
      'UKCEOP (Child Exploitation and Online Protection)',
    ],
  },
  {
    name: 'Human Trafficking — Online Recruitment',
    type: 'Labor / Sex Trafficking',
    risk: 'CRITICAL',
    regions: ['Southeast Asia', 'Latin America', 'Sub-Saharan Africa', 'Eastern Europe', 'Middle East'],
    description:
      'Trafficking networks using online platforms for recruitment, advertisement, and logistics. Includes cyberscam-center trafficking (SEA golden triangle), forced criminality via social media job ads, and online commercial sex advertising platforms. Cryptocurrency and encrypted messaging used for logistics and payment.',
    indicators: [
      'Fake job ads on social media',
      'Models / entertainers wanted posts',
      'Hotel booking patterns',
      'Coded language on adult advertising sites',
      'Forced criminality task channels',
    ],
    resources: [
      'Polaris Project',
      'UNODC Human Trafficking',
      'Global Slavery Index (Walk Free)',
      'ECPAT',
      'IJM (International Justice Mission)',
    ],
  },
  {
    name: 'Romance Scam / Sweetheart Swindle Networks',
    type: 'Financial Fraud',
    risk: 'HIGH',
    regions: ['West Africa', 'Eastern Europe', 'Southeast Asia'],
    description:
      'Organized romance fraud networks operating across dating platforms and social media. Prevalent West African (Yahoo Boys) and Southeast Asian operations use scripted playbooks, fake profiles, and prolonged grooming before soliciting money. Overlaps with money muling and identity theft supply chains.',
    indicators: [
      'Professed love within days',
      'Excuses to avoid video calls',
      'Requests for travel money / medical bills',
      'Military / offshore worker personas',
      'Requests for cryptocurrency gift cards',
    ],
    resources: [
      'FBI IC3 Romance Scam',
      'FTC Romance Scam Alerts',
      'Social Catfish',
      'RomanceScam.com',
      'Action Fraud UK',
    ],
  },
  {
    name: 'Revenge Porn / Image-Based Abuse Networks',
    type: 'Image Exploitation',
    risk: 'MEDIUM',
    regions: ['Global'],
    description:
      'Networks facilitating non-consensual intimate image distribution, including ex-partner retaliation, hacked cloud storage leaks, and dedicated exposure platforms. Includes "involuntary celibate" forums where intimate images are weaponized. Legal frameworks increasingly criminalizing distribution.',
    indicators: [
      'Exposure forum posts',
      'Cloud storage account compromises',
      'Intimate image metadata stripping',
      'Deepfake porn generation services',
      'Threat of image leak in arguments',
    ],
    resources: [
      'StopNCII.org',
      'Cyber Civil Rights Initiative',
      'EVA (Eliminate Violence Against Women)',
      'NCOSE (National Center on Sexual Exploitation)',
      'Without My Consent',
    ],
  },
  {
    name: 'Live-Streaming Exploitation Enterprises',
    type: 'Commercial Exploitation',
    risk: 'CRITICAL',
    regions: ['Southeast Asia', 'South Asia', 'Latin America', 'Eastern Europe'],
    description:
      'Commercial live-streaming operations producing CSAM and exploitation content for paying viewers on encrypted platforms. Victims are often trafficked or coerced. Payment via cryptocurrency and streaming pay-per-view models. Jurisdictional complexity makes prosecution difficult.',
    indicators: [
      'Pay-per-view encrypted channels',
      'Cryptocurrency micropayment patterns',
      'Stream-on-demand platforms',
      'Hotel / residential rental patterns',
      'Cross-border payment trails',
    ],
    resources: [
      'IWF Dark Web Team',
      'EC3 Europol',
      'NCMEC CyberTipline',
      'ECPAT International',
      'INTERLOCAL (INTERPOL)',
    ],
  },
  {
    name: 'Predator Identification & Monitoring Tools',
    type: 'Countermeasure Resources',
    risk: 'LOW',
    regions: ['Global'],
    description:
      'Tools, platforms, and organizations that help identify, track, and report online predators. Includes automated detection systems, hash-sharing databases, OSINT tools for investigator use, and victim assistance platforms.',
    indicators: [
      'Hash-sharing databases (PhotoDNA, Project VIC)',
      'Bait / decoy account operations',
      'Platform reporting toolchains',
      'Undercover OSINT techniques',
      'Cross-platform account linkage',
    ],
    resources: ['Thorn — Safer.io', 'NCMEC CyberTipline', 'Project VIC', 'IWF Image Hash List', 'StopNCII.org'],
  },
];

const RISK_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const RISK_PILL: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-300 dark:border-red-800',
  HIGH: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-800',
  MEDIUM:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800',
  LOW: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
};

export default function Predators(): JSX.Element {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return CATEGORIES;
    return CATEGORIES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q) ||
        c.regions.some((r) => r.toLowerCase().includes(q)) ||
        c.indicators.some((i) => i.toLowerCase().includes(q)) ||
        c.description.toLowerCase().includes(q) ||
        c.resources.some((r) => r.toLowerCase().includes(q))
    );
  }, [query]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => (RISK_ORDER[a.risk] ?? 99) - (RISK_ORDER[b.risk] ?? 99));
  }, [filtered]);

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<ShieldAlert size={28} />}
      title="Online Predator Monitoring — Tracking & Response"
      description="Tracking categories of online predation, exploitation networks, and trafficking operations — organized by threat risk, regional prevalence, and investigator resources."
    >
      <div className="relative mb-6">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name, type, region, indicator, or resource…"
          className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
        />
      </div>

      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mb-4">
        {sorted.length} {sorted.length === 1 ? 'category' : 'categories'} tracked
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((cat) => (
          <div
            key={cat.name}
            className="surface-card p-5 flex flex-col border border-slate-200 dark:border-slate-800 rounded-xl"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-display font-semibold text-slate-900 dark:text-slate-100">{cat.name}</h3>
              <span
                className={`shrink-0 text-micro font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${RISK_PILL[cat.risk] ?? ''}`}
              >
                {cat.risk}
              </span>
            </div>

            <div className="flex items-center gap-1 text-xs font-mono text-slate-500 dark:text-slate-400 mb-2">
              <Eye size={12} />
              <span>{cat.type}</span>
            </div>

            <div className="flex flex-wrap gap-1 mb-2">
              {cat.regions.map((region) => (
                <span
                  key={region}
                  className="text-micro font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-muted border border-slate-200 dark:border-slate-700"
                >
                  {region}
                </span>
              ))}
            </div>

            <p className="text-sm text-muted leading-relaxed mb-3 line-clamp-3">{cat.description}</p>

            <div className="mt-auto space-y-2 text-xs font-mono text-slate-500 dark:text-slate-500">
              <div>
                <span className="flex items-center gap-1 text-slate-400 dark:text-slate-500 mb-1">
                  <AlertTriangle size={11} /> Indicators
                </span>
                <ul className="space-y-0.5">
                  {cat.indicators.map((ind) => (
                    <li key={ind} className="text-muted">
                      · {ind}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="flex items-center gap-1 text-slate-400 dark:text-slate-500 mb-1">
                  <Lock size={11} /> Response Resources
                </span>
                <ul className="space-y-0.5">
                  {cat.resources.map((res) => (
                    <li key={res} className="text-muted">
                      · {res}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>

      {sorted.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-12 font-mono">
          No predator categories match your filter.
        </p>
      )}
    </DataPageLayout>
  );
}
