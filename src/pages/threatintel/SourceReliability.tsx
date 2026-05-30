import { useApiData } from '../../hooks/useApiData';
import { DataPageLayout } from '../../components/DataPageLayout';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  Globe,
  Server,
  Cpu,
  BookOpen,
  Github,
  Database,
  Radio,
  Cloud,
  AlertTriangle,
  Brain,
} from 'lucide-react';

interface SourceEntry {
  id: string;
  name: string;
  reliability: string;
  category: string;
  description: string;
  known_bias?: string;
}
interface SourceResponse {
  total_sources: number;
  sources: SourceEntry[];
}

const RELIABILITY_COLORS: Record<string, string> = {
  A: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-900',
  B: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-900',
  C: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-900',
  D: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-900',
  E: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-900',
  F: 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700',
};

const CATEGORY_ICONS: Record<string, typeof Shield> = {
  primary: ShieldCheck,
  secondary: Shield,
  tertiary: ShieldAlert,
  ai_generated: Brain,
  inferred: HelpCircle,
};

const RELIABILITY_DESC: Record<string, string> = {
  A: 'Reliable — authoritative, no known bias',
  B: 'Usually reliable — minor caveats',
  C: 'Fairly reliable — corroboration recommended',
  D: 'Not usually reliable — treat with caution',
  E: 'Unreliable — likely inaccurate',
  F: 'Unassessed — no track record',
};

const RISK_MAP: Record<string, { level: string; clue: string }> = {
  A: { level: 'low', clue: 'Government-grade source; minimal risk of false data' },
  B: { level: 'low', clue: 'Trusted but imperfect; cross-check high-stakes findings' },
  C: { level: 'moderate', clue: 'Useful signal but needs corroboration before action' },
  D: { level: 'high', clue: 'High noise floor; treat as leads, not evidence' },
  E: { level: 'high', clue: 'Automated/heuristic output; verify before citing' },
  F: { level: 'critical', clue: 'AI-generated; always fact-check against primary sources' },
};

const OPEN_SOURCE_TOOLS = [
  { name: 'Vite', desc: 'Build tool & dev server', url: 'https://vitejs.dev', icon: Cpu },
  { name: 'React 18', desc: 'UI framework', url: 'https://react.dev', icon: Cpu },
  { name: 'TypeScript', desc: 'Type-safe JavaScript', url: 'https://typescriptlang.org', icon: Cpu },
  { name: 'Tailwind CSS', desc: 'Utility-first CSS framework', url: 'https://tailwindcss.com', icon: Cpu },
  { name: 'Cloudflare Workers', desc: 'Edge compute platform', url: 'https://workers.cloudflare.com', icon: Cloud },
  {
    name: 'Wrangler',
    desc: 'CLI for Cloudflare development',
    url: 'https://developers.cloudflare.com/workers/wrangler/',
    icon: Cloud,
  },
  { name: 'Lucide React', desc: 'Icon library', url: 'https://lucide.dev', icon: Cpu },
  { name: 'React Router', desc: 'Client-side routing', url: 'https://reactrouter.com', icon: Cpu },
  { name: 'Recharts', desc: 'Charting library', url: 'https://recharts.org', icon: Cpu },
  { name: 'Leaflet', desc: 'Interactive maps', url: 'https://leafletjs.com', icon: Globe },
  { name: 'D3 / vis-network', desc: 'Graph visualization', url: 'https://d3js.org', icon: Cpu },
  {
    name: 'STIX 2.1',
    desc: 'Structured Threat Info Expression',
    url: 'https://oasis-open.github.io/cti-documentation/',
    icon: BookOpen,
  },
  {
    name: 'NATO Admiralty Code',
    desc: 'Source reliability grading system',
    url: 'https://en.wikipedia.org/wiki/Admiralty_code',
    icon: Shield,
  },
];

const BACKEND_INTEGRATIONS = [
  { name: 'Ransomlook', desc: 'Ransomware leak-site scraper', icon: ShieldAlert },
  { name: 'ransomware.live PRO API', desc: 'Authenticated ransomware data', icon: ShieldAlert },
  { name: 'CISA KEV', desc: 'Known Exploited Vulnerabilities catalog', icon: AlertTriangle },
  { name: 'NVD / CVE API', desc: 'National Vulnerability Database', icon: AlertTriangle },
  { name: 'Malpedia', desc: 'Malware family reference', icon: Database },
  { name: 'abuse.ch (URLhaus/ThreatFox/MalwareBazaar)', desc: 'Malicious IOCs & malware samples', icon: Shield },
  { name: 'PhishTank / OpenPhish', desc: 'Phishing URL feeds', icon: ShieldAlert },
  { name: 'Hudson Rock / LeakCheck / XposedOrNot', desc: 'Breach & infostealer data', icon: Database },
  { name: 'AlienVault OTX', desc: 'Open Threat Exchange pulses', icon: Radio },
  { name: 'VirusTotal', desc: 'Multi-engine file scanner', icon: Shield },
  { name: 'AbuseIPDB / IPsum / CINS Army / Bitwire', desc: 'IP reputation blocklists', icon: Globe },
  { name: 'Cert Spotter / crt.sh', desc: 'Certificate Transparency logs', icon: Server },
  { name: 'Telegram channels', desc: 'Cybersec Telegram firehose & leak monitor', icon: Radio },
  { name: 'Reddit (16 subreddits)', desc: 'Cybersec discussion & link sharing', icon: Radio },
  { name: 'X/Twitter (70 accounts)', desc: 'Researcher tweets & IOC drops', icon: Radio },
  { name: 'Bluesky / Mastodon', desc: 'Decentralized social cybersec feeds', icon: Radio },
  { name: 'Have I Been Pwned', desc: 'Breach disclosure database', icon: Database },
  { name: 'deepdarkCTI', desc: 'Dark-web source index', icon: Globe },
  { name: 'MyThreatIntel CTI Platform', desc: 'Commercial CTI API', icon: Cloud },
  { name: 'CrowdSec / blocklist.de / cinsscore.com', desc: 'Community blocklists', icon: Shield },
];

function SourceCard({ s }: { s: SourceEntry }) {
  const risk = RISK_MAP[s.reliability] ?? { level: 'unknown', clue: '' };
  const Icon = CATEGORY_ICONS[s.category] ?? Shield;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
      <div className="flex items-start gap-3">
        <span
          className={`text-[11px] font-mono px-1.5 py-0.5 rounded font-bold border shrink-0 ${RELIABILITY_COLORS[s.reliability] ?? ''}`}
        >
          {s.reliability}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Icon size={14} className="text-slate-400 shrink-0" />
            <span className="text-sm font-medium">{s.name}</span>
            <span className="text-[10px] font-mono text-slate-400">({s.id})</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{s.description}</p>
          <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono">
            <span
              className={`px-1 py-0.5 rounded ${
                risk.level === 'low'
                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300'
                  : risk.level === 'moderate'
                    ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300'
                    : risk.level === 'high'
                      ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300'
                      : 'bg-rose-100 text-rose-600 dark:bg-rose-900/20 dark:text-rose-300'
              }`}
            >
              risk: {risk.level}
            </span>
            <span className="text-slate-500">{risk.clue}</span>
          </div>
          {s.known_bias && (
            <p className="text-[10px] font-mono text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
              <AlertTriangle size={10} /> Bias: {s.known_bias}
            </p>
          )}
        </div>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 capitalize shrink-0">
          {s.category.replace('_', ' ')}
        </span>
      </div>
    </div>
  );
}

export default function SourceReliability(): JSX.Element {
  const { data, loading, error, refetch } = useApiData<SourceResponse>('/api/v1/source-reliability', {
    initial: { total_sources: 0, sources: [] },
  });

  const sources = data?.sources ?? [];

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Shield size={28} />}
      title="Data Sources & Reliability"
      description="Every data source powering this platform — graded by NATO Admiralty Code (A–F) with risk context and known biases."
      loading={loading && sources.length === 0}
      error={error}
      onRetry={refetch}
    >
      {/* ── Grade legend ── */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 mb-6">
        <p className="text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Reliability grading (NATO Admiralty Code)
        </p>
        <div className="space-y-1">
          {(['A', 'B', 'C', 'D', 'E', 'F'] as const).map((r) => (
            <div
              key={r}
              className={`flex items-center gap-2 text-[11px] font-mono px-2 py-1 rounded ${RELIABILITY_COLORS[r]}`}
            >
              <span className="font-bold w-4">{r}</span>
              <span>{RELIABILITY_DESC[r]}</span>
              <span className="ml-auto text-[10px] text-slate-500">risk: {RISK_MAP[r].level}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Category summary ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-6">
        {(['primary', 'secondary', 'tertiary', 'ai_generated', 'inferred'] as const).map((cat) => {
          const count = sources.filter((s) => s.category === cat).length;
          const Icon = CATEGORY_ICONS[cat] ?? Shield;
          return (
            <div
              key={cat}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3 text-center"
            >
              <Icon size={16} className="mx-auto mb-1 text-slate-400" />
              <p className="text-lg font-bold">{count}</p>
              <p className="text-[10px] font-mono text-slate-500 capitalize">{cat.replace('_', ' ')}</p>
            </div>
          );
        })}
      </div>

      {/* ── Source cards ── */}
      <div className="space-y-2 mb-10">
        {sources.map((s) => (
          <SourceCard key={s.id} s={s} />
        ))}
      </div>

      {/* ── Backend integrations ── */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Database size={18} className="text-brand-600 dark:text-brand-400" />
          <h2 className="font-display font-bold text-lg">Backend data integrations</h2>
        </div>
        <p className="text-[11px] font-mono text-slate-500 mb-4">
          The upstream APIs, scrapers, and feeds the platform ingests at the edge:
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {BACKEND_INTEGRATIONS.map((b) => {
            const BIcon = b.icon;
            return (
              <div
                key={b.name}
                className="flex items-center gap-2 text-[12px] font-mono text-slate-600 dark:text-slate-400"
              >
                <BIcon size={14} className="shrink-0 text-slate-400" />
                <span className="font-medium text-slate-900 dark:text-slate-100">{b.name}</span>
                <span className="text-slate-500">— {b.desc}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Open source tools ── */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Github size={18} className="text-brand-600 dark:text-brand-400" />
          <h2 className="font-display font-bold text-lg">Open source tools & libraries</h2>
        </div>
        <p className="text-[11px] font-mono text-slate-500 mb-4">The open-source ecosystem the platform is built on:</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {OPEN_SOURCE_TOOLS.map((t) => {
            const TIcon = t.icon;
            return (
              <a
                key={t.name}
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-[12px] font-mono text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
              >
                <TIcon size={14} className="shrink-0 text-slate-400" />
                <span className="font-medium">{t.name}</span>
                <span className="text-slate-500">— {t.desc}</span>
                <span className="text-[10px] text-brand-500 ml-auto">↗</span>
              </a>
            );
          })}
        </div>
      </div>
    </DataPageLayout>
  );
}
