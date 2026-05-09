import { Link } from 'react-router-dom';
import {
  Hash,
  ShieldAlert,
  Globe,
  Radar,
  BookOpen,
  Clock,
  Users,
  Lock,
  Newspaper,
  Search,
  Shield,
  Grid3x3,
  Eye,
  Network,
  Code2,
  Compass,
  ExternalLink,
  Image as ImageIcon,
  Filter,
  KeyRound,
  Type,
  Unplug,
  Share2,
  Github,
  Microscope,
  Bell,
  Globe2,
  FileCode,
  ShieldCheck,
  Sparkles,
  Plug,
  Crosshair,
  Diamond,
  Mail,
  Terminal,
  FlaskConical,
  type LucideIcon,
} from 'lucide-react';

interface Tool {
  path: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  external?: boolean;
}

/** Flagship tools — most visitors should start here. */
const FEATURED: Tool[] = [
  {
    path: '/dfir/ioc-check',
    label: 'IOC & Hash Checker',
    desc: '24 sources · streaming results · IPs · domains · URLs · file hashes',
    icon: Hash,
  },
  { path: '/dfir/extract', label: 'IOC Extractor', desc: 'Pull IOCs from any text blob · refang-aware', icon: Filter },
  {
    path: '/dfir/takeover',
    label: 'Subdomain Takeover',
    desc: 'CNAME chain + 15 dangling-service fingerprints',
    icon: Unplug,
  },
  {
    path: '/dfir/phishing',
    label: 'Phishing Analyzer',
    desc: 'Email headers · auth · embedded URLs',
    icon: ShieldAlert,
  },
  {
    path: '/dfir/email-defense',
    label: 'Email Defense / BEC Score',
    desc: 'SPF · DMARC · DKIM · MTA-STS · spoofability score · attack scenarios per gap',
    icon: Mail,
  },
  { path: '/dfir/mitre', label: 'MITRE ATT&CK', desc: 'Matrix · technique deep-dive · actor mapping', icon: Grid3x3 },
  {
    path: '/dfir/kill-chain',
    label: 'Cyber Kill Chain',
    desc: '7 phases · 28 techniques · ATT&CK cross-links',
    icon: Crosshair,
  },
  {
    path: '/dfir/diamond',
    label: 'Diamond Model',
    desc: '4 vertices · meta-features · interactive event template',
    icon: Diamond,
  },
  {
    path: '/dfir/stix',
    label: 'STIX Viewer',
    desc: 'Visualise STIX 2.1 bundles · interactive relationship graph',
    icon: Share2,
  },
  {
    path: '/dfir/darkweb',
    label: 'Dark Web Watch',
    desc: 'Aggregated leak-site, ransomware, breach activity · keyword watchlist',
    icon: Bell,
  },
  {
    path: '/dfir/threat-map',
    label: 'Cyber Threat Map',
    desc: 'Live geolocation of malicious infrastructure · choropleth + leaderboard',
    icon: Globe2,
  },
  {
    path: '/dfir/rules',
    label: 'Detection Rules',
    desc: 'Sigma · YARA · Elastic · Splunk · KQL · Suricata · live commit feeds',
    icon: FileCode,
  },
  {
    path: '/dfir/owasp',
    label: 'OWASP Top 10',
    desc: 'Web 2021 · API 2023 · LLM 2025 · self-assessment + MITRE links',
    icon: ShieldCheck,
  },
  {
    path: '/dfir/prompt-injection',
    label: 'Prompt Injection Detector',
    desc: '25+ injection / jailbreak patterns · highlight + severity score',
    icon: Sparkles,
  },
  {
    path: '/dfir/mcp-audit',
    label: 'MCP & Claude Code Auditor',
    desc: 'MCP configs + Claude Code settings · hooks · permission rules · tool poisoning',
    icon: Plug,
  },
  {
    path: '/dfir/briefings',
    label: 'Intel Briefings',
    desc: 'Daily + weekly digest · auto-generated from feeds',
    icon: Newspaper,
  },
];

/** Everything else — utilities and lookups. */
const UTILITIES: Tool[] = [
  { path: '/dfir/domain', label: 'Domain Lookup', desc: 'WHOIS · DNS · email auth', icon: Globe },
  { path: '/dfir/exposure', label: 'Exposure Scanner', desc: 'Subdomains + open ports', icon: Radar },
  { path: '/dfir/jwt', label: 'JWT Inspector', desc: 'Decode + flag alg=none, exp, weak claims', icon: KeyRound },
  { path: '/dfir/punycode', label: 'Homograph Detector', desc: 'IDN · mixed scripts · brand lookalikes', icon: Type },
  { path: '/dfir/cve', label: 'CVE Lookup', desc: 'NVD · EPSS · KEV · Exploit-DB', icon: Search },
  { path: '/dfir/url-preview', label: 'URL Preview', desc: 'Server-side metadata · safe fetch', icon: Eye },
  { path: '/dfir/asn', label: 'ASN Lookup', desc: 'BGP · prefixes · abuse contacts', icon: Network },
  { path: '/dfir/breach', label: 'Breach Checker', desc: 'Pwned password · k-anonymity', icon: Shield },
  { path: '/dfir/exif', label: 'EXIF Parser', desc: 'GPS · camera · client-only', icon: ImageIcon },
  { path: '/dfir/decode', label: 'Decoder', desc: 'Base64 · URL · multi-pass', icon: Code2 },
  { path: '/dfir/wiki', label: 'Knowledge Base', desc: 'Concepts + playbooks', icon: BookOpen },
  { path: '/dfir/dashboard', label: 'Recent Lookups', desc: 'Your last 20 queries', icon: Clock },
  { path: '/dfir/actors', label: 'Threat Actors', desc: 'APT catalog · STIX-aware', icon: Users },
  { path: '/dfir/privacy', label: 'Privacy Check', desc: 'IP · WebRTC · fingerprint', icon: Lock },
  {
    path: '/dfir/lolbins',
    label: 'LOLBins / GTFOBins',
    desc: 'Curated living-off-the-land catalog · ATT&CK-mapped · detection ideas',
    icon: Terminal,
  },
  {
    path: '/dfir/rule-playground',
    label: 'YARA / Sigma Playground',
    desc: 'Paste rule + sample · highlight matches · client-side',
    icon: FlaskConical,
  },
];

const EXTERNAL: Tool[] = [
  {
    path: 'https://threatlandscape.io/free-tools',
    label: 'Threat Landscape Free Tools',
    desc: 'Curated free DFIR and threat intel tools directory',
    icon: Compass,
    external: true,
  },
  {
    path: 'https://analyzer.vecert.io/index',
    label: 'Vecert Analyzer',
    desc: 'Free file and indicator analyzer for incident response',
    icon: Microscope,
    external: true,
  },
  {
    path: 'https://github.com/fastfire/deepdarkCTI',
    label: 'deepdarkCTI',
    desc: 'Continuously updated repository of dark web and CTI sources, by fastfire',
    icon: Github,
    external: true,
  },
  {
    path: 'https://github.com/nitefood/asn',
    label: 'asn (nitefood)',
    desc: 'Multi-protocol BGP, ASN, and IP-to-ASN command-line lookup tool',
    icon: Github,
    external: true,
  },
  {
    path: 'https://www.worldmonitor.app',
    label: 'World Monitor',
    desc: 'Real-time OSINT dashboard, news, markets, ADS-B and AIS tracking across 435+ sources',
    icon: Compass,
    external: true,
  },
  {
    path: 'https://github.com/rawfilejson/awesome-osint-arsenal',
    label: 'awesome-osint-arsenal',
    desc: 'Curated arsenal of OSINT tools, frameworks, and references by rawfilejson',
    icon: Github,
    external: true,
  },
  {
    path: 'https://osinttools.io/tools',
    label: 'OSINT Tools',
    desc: 'Curated OSINT directory',
    icon: Compass,
    external: true,
  },
  {
    path: 'https://osintrack.com/',
    label: 'OSINTrack',
    desc: 'OSINT investigation tracker',
    icon: Compass,
    external: true,
  },
];

function Card({ tool }: { tool: Tool }): JSX.Element {
  const { path, label, desc, icon: Icon, external } = tool;
  const className =
    'group block rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-brand-500/40 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors';
  const inner = (
    <>
      <div className="flex items-center gap-3 mb-2">
        <Icon size={18} className="text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <span className="font-display font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors flex items-center gap-1">
          {label}
          {external && <ExternalLink size={12} className="opacity-60" aria-hidden="true" />}
        </span>
      </div>
      <p className="text-sm font-mono text-slate-600 dark:text-slate-400 leading-relaxed">{desc}</p>
    </>
  );
  if (external) {
    return (
      <a href={path} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    );
  }
  return (
    <Link to={path} className={className}>
      {inner}
    </Link>
  );
}

function SectionHeading({ label }: { label: string }): JSX.Element {
  return (
    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-4 mt-2">
      {label}
    </h3>
  );
}

export function ToolGrid(): JSX.Element {
  return (
    <div className="space-y-10">
      <div>
        <SectionHeading label="Start here" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURED.map((t) => (
            <Card key={t.path} tool={t} />
          ))}
        </div>
      </div>

      <div>
        <SectionHeading label="Utilities & lookups" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {UTILITIES.map((t) => (
            <Card key={t.path} tool={t} />
          ))}
        </div>
      </div>

      <div>
        <SectionHeading label="External resources" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {EXTERNAL.map((t) => (
            <Card key={t.path} tool={t} />
          ))}
        </div>
      </div>
    </div>
  );
}
