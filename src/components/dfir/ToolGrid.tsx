import { useMemo, useState } from 'react';
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
  Search as SearchIcon,
  X,
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
  ScrollText,
  FileCheck,
  FolderTree,
  Scale,
  AtSign,
  History,
  AlertTriangle,
  Coins,
  type LucideIcon,
} from 'lucide-react';

interface Tool {
  path: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  external?: boolean;
}

interface Section {
  id: string;
  label: string;
  /** One-line hint shown under the section heading. */
  blurb: string;
  tools: Tool[];
}

/**
 * Sections are ordered by typical investigation flow:
 * triage first, then infra, email, intel, detection-engineering, frameworks,
 * AI security, vulns/identity, reference. External resources sit at the end.
 */
const SECTIONS: Section[] = [
  {
    id: 'triage',
    label: 'Triage & IOCs',
    blurb: 'First stop when an indicator lands in your inbox.',
    tools: [
      {
        path: '/dfir/ioc-check',
        label: 'IOC & Hash Checker',
        desc: '24 sources · streaming · IPs · domains · URLs · file hashes',
        icon: Hash,
      },
      {
        path: '/dfir/extract',
        label: 'IOC Extractor',
        desc: 'Pull IOCs from any text blob · refang-aware',
        icon: Filter,
      },
      { path: '/dfir/decode', label: 'Decoder', desc: 'Base64 · URL · multi-pass', icon: Code2 },
      {
        path: '/dfir/powershell-deobf',
        label: 'PowerShell Deobfuscator',
        desc: 'EncodedCommand · char-arrays · format-strings · multi-pass with diff trace',
        icon: Terminal,
      },
    ],
  },
  {
    id: 'domain',
    label: 'Domain, Network & Edge',
    blurb: 'Where does this thing live, what does it expose, who owns it.',
    tools: [
      { path: '/dfir/domain', label: 'Domain Lookup', desc: 'WHOIS · DNS · email auth · CT logs', icon: Globe },
      { path: '/dfir/asn', label: 'ASN Lookup', desc: 'BGP · prefixes · abuse contacts', icon: Network },
      { path: '/dfir/exposure', label: 'Exposure Scanner', desc: 'Subdomains + open ports', icon: Radar },
      {
        path: '/dfir/takeover',
        label: 'Subdomain Takeover',
        desc: 'CNAME chain + 15 dangling-service fingerprints',
        icon: Unplug,
      },
      {
        path: '/dfir/threat-map',
        label: 'Cyber Threat Map',
        desc: 'Live geolocation of malicious infrastructure · choropleth + leaderboard',
        icon: Globe2,
      },
    ],
  },
  {
    id: 'osint',
    label: 'OSINT',
    blurb: 'Open-source pivots — username, archive, code-host metadata, curated directory.',
    tools: [
      {
        path: '/dfir/username',
        label: 'Username Pivot',
        desc: 'Sherlock-lite · 50+ services · live CORS checks for GitHub/GitLab/Reddit/HN/Mastodon · client-side',
        icon: AtSign,
      },
      {
        path: '/dfir/wayback',
        label: 'Wayback Machine Pivot',
        desc: 'Internet Archive CDX timeline · first/last seen · status-code distribution · snapshot links',
        icon: History,
      },
      {
        path: '/dfir/github-osint',
        label: 'GitHub Recon',
        desc: 'Profile · top repos · languages · activity · opt-in commit-author email scan',
        icon: Github,
      },
      {
        path: '/dfir/osint-framework',
        label: 'OSINT Framework',
        desc: '70+ curated OSINT tools across 15 categories · pricing-tier + category filter · search',
        icon: Compass,
      },
      {
        path: '/dfir/url-preview',
        label: 'URL Preview',
        desc: 'Server-side metadata · safe fetch · screenshot',
        icon: Eye,
      },
      {
        path: '/dfir/exif',
        label: 'EXIF Parser',
        desc: 'GPS · camera · client-only · drop image to extract metadata',
        icon: ImageIcon,
      },
      {
        path: '/dfir/punycode',
        label: 'Homograph Detector',
        desc: 'IDN · mixed scripts · brand lookalikes · paste a domain to inspect',
        icon: Type,
      },
      {
        path: '/dfir/crypto-trace',
        label: 'Crypto Address Tracer',
        desc: 'BTC + 6 EVM chains + Solana · balance · explorer + NFT + DeFi + scam-flag pivots',
        icon: Coins,
      },
    ],
  },
  {
    id: 'email',
    label: 'Email Security',
    blurb: 'Phishing analysis and BEC-defense for the domain you protect.',
    tools: [
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
    ],
  },
  {
    id: 'data-sec',
    label: 'Data Security & DLP',
    blurb: 'Find sensitive data; decide how to handle it.',
    tools: [
      {
        path: '/dfir/dlp-scan',
        label: 'Sensitive Data Detector',
        desc: '28 patterns · Luhn / IBAN / Verhoeff / NHS verified · severity + confidence · redact-and-copy',
        icon: ShieldAlert,
      },
      {
        path: '/dfir/data-classification',
        label: 'Data Classification & Handling',
        desc: 'Tier policies · dataset inventory · matrix view · markdown export',
        icon: FolderTree,
      },
      {
        path: '/dfir/privacy-hub',
        label: 'Privacy & Data-Protection Hub',
        desc: 'GDPR · CCPA / CPRA · DPDP · HIPAA Privacy Rule · PCI DSS · breach-notification timelines',
        icon: Scale,
      },
    ],
  },
  {
    id: 'intel',
    label: 'Threat Intelligence',
    blurb: 'Feeds, actors, and the data behind the indicators.',
    tools: [
      {
        path: '/dfir/briefings',
        label: 'Intel Briefings',
        desc: 'Daily + weekly digest · auto-generated from feeds',
        icon: Newspaper,
      },
      {
        path: '/dfir/darkweb',
        label: 'Dark Web Watch',
        desc: 'Aggregated leak-site, ransomware, breach activity · keyword watchlist',
        icon: Bell,
      },
      {
        path: '/dfir/scam-watch',
        label: 'Scam Watch',
        desc: 'Live FTC + FBI IC3 alerts · deepfake-scam news · Reddit victim reports · search + filter',
        icon: AlertTriangle,
      },
      {
        path: '/dfir/tech-ai-news',
        label: 'Tech & AI News',
        desc: 'AI labs · cyber-vendor funding · M&A · general tech · 13 sources, threat-intel kept separate',
        icon: Sparkles,
      },
      { path: '/dfir/actors', label: 'Threat Actors', desc: 'APT catalog · STIX-aware', icon: Users },
      {
        path: '/dfir/mitre',
        label: 'MITRE ATT&CK',
        desc: 'Matrix · technique deep-dive · actor mapping',
        icon: Grid3x3,
      },
      {
        path: '/dfir/stix',
        label: 'STIX Viewer',
        desc: 'Visualise STIX 2.1 bundles · interactive relationship graph',
        icon: Share2,
      },
    ],
  },
  {
    id: 'det-eng',
    label: 'Detection Engineering',
    blurb: 'Build, test, and maintain detection content.',
    tools: [
      {
        path: '/dfir/rules',
        label: 'Detection Rules',
        desc: 'Sigma · YARA · Elastic · Splunk · KQL · Suricata · live commit feeds',
        icon: FileCode,
      },
      {
        path: '/dfir/rule-playground',
        label: 'YARA / Sigma Playground',
        desc: 'Paste rule + sample · highlight matches · client-side',
        icon: FlaskConical,
      },
      {
        path: '/dfir/lolbins',
        label: 'LOLBins / GTFOBins',
        desc: 'Curated living-off-the-land catalog · ATT&CK-mapped · detection ideas',
        icon: Terminal,
      },
    ],
  },
  {
    id: 'frameworks',
    label: 'Frameworks & Posture',
    blurb: 'Models analysts use to structure intrusions and security programs.',
    tools: [
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
        path: '/dfir/owasp',
        label: 'OWASP Top 10',
        desc: 'Web 2021 · API 2023 · LLM 2025 · self-assessment + MITRE links',
        icon: ShieldCheck,
      },
      {
        path: '/dfir/nhi',
        label: 'NHI Inventory & Top 10',
        desc: 'OWASP NHI Top 10 (2025) · service-account / OAuth / MCP-token inventory · per-NHI risk',
        icon: KeyRound,
      },
      {
        path: '/dfir/tabletop',
        label: 'Tabletop / IR Exercise Generator',
        desc: '6 archetypes × actor catalog · timed injects · per-role prompts · markdown export',
        icon: ScrollText,
      },
      {
        path: '/dfir/grc',
        label: 'GRC Compliance & Maturity',
        desc: 'NIST CSF 2.0 · ISO 27001 · ISO 42001 (AI) · CIS · SOC 2 · SOC-CMM · cross-mapping',
        icon: FileCheck,
      },
    ],
  },
  {
    id: 'ai-sec',
    label: 'AI Security',
    blurb: 'AI-system threat surface — prompts, agents, MCP servers.',
    tools: [
      {
        path: '/dfir/prompt-injection',
        label: 'Prompt Injection & Red-Team',
        desc: 'Detect 28 patterns · 26-prompt red-team library · OWASP LLM Top 10 · JSON export',
        icon: Sparkles,
      },
      {
        path: '/dfir/mcp-audit',
        label: 'MCP & Claude Code Auditor',
        desc: 'MCP configs + Claude Code settings · hooks · permission rules · tool poisoning',
        icon: Plug,
      },
      {
        path: '/dfir/agent-map',
        label: 'AI Agent Attack-Surface Mapper',
        desc: 'Capability graph from MCP/CC config · flags exfil + RCE chains · SVG visual',
        icon: Network,
      },
    ],
  },
  {
    id: 'vulns-identity',
    label: 'Vulnerabilities & Identity',
    blurb: 'CVE triage, breach exposure, and identity verification.',
    tools: [
      {
        path: '/dfir/cve',
        label: 'CVE Lookup',
        desc: 'NVD · CVSS · EPSS · KEV · combined patch-priority score with rationale',
        icon: Search,
      },
      { path: '/dfir/breach', label: 'Breach Checker', desc: 'Pwned password · k-anonymity', icon: Shield },
      { path: '/dfir/jwt', label: 'JWT Inspector', desc: 'Decode + flag alg=none, exp, weak claims', icon: KeyRound },
    ],
  },
  {
    id: 'reference',
    label: 'Reference & Personal',
    blurb: 'Knowledge base, your own state, and privacy hygiene.',
    tools: [
      { path: '/dfir/wiki', label: 'Knowledge Base', desc: 'Concepts + playbooks', icon: BookOpen },
      { path: '/dfir/dashboard', label: 'Recent Lookups', desc: 'Your last 20 queries', icon: Clock },
      { path: '/dfir/privacy', label: 'Privacy Check', desc: 'IP · WebRTC · fingerprint', icon: Lock },
    ],
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

function SectionBlock({ section }: { section: Section }): JSX.Element {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-3 mt-2 flex-wrap">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
          {section.label}
        </h3>
        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-500">
          {section.blurb} · {section.tools.length} tool{section.tools.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {section.tools.map((t) => (
          <Card key={t.path} tool={t} />
        ))}
      </div>
    </div>
  );
}

export const TOOL_COUNT = SECTIONS.reduce((n, s) => n + s.tools.length, 0);

function matches(tool: Tool, q: string): boolean {
  if (!q) return true;
  const haystack = `${tool.label} ${tool.desc} ${tool.path}`.toLowerCase();
  // Tokenise on whitespace; every token must match (AND).
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((tok) => haystack.includes(tok));
}

export function ToolGrid(): JSX.Element {
  const [query, setQuery] = useState('');
  const q = query.trim();

  const filteredSections = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        tools: s.tools.filter((t) => matches(t, q)),
      })).filter((s) => s.tools.length > 0),
    [q]
  );
  const filteredExternal = useMemo(() => EXTERNAL.filter((t) => matches(t, q)), [q]);

  const matchCount = filteredSections.reduce((n, s) => n + s.tools.length, 0) + filteredExternal.length;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
        <div className="relative">
          <SearchIcon
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools — e.g. dmarc, kill chain, mcp, owasp, jwt…"
            className="w-full pl-9 pr-9 py-2 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono text-sm focus:border-brand-500/60 focus:outline-none"
            aria-label="Search DFIR tools"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <p className="text-xs font-mono text-slate-500 dark:text-slate-500">
        {q ? (
          <>
            {matchCount} match{matchCount === 1 ? '' : 'es'} for{' '}
            <span className="text-slate-700 dark:text-slate-300">"{q}"</span>
          </>
        ) : (
          <>
            {TOOL_COUNT} tools across {SECTIONS.length} categories. All client-side or run from this site's edge worker
            — nothing leaves your browser unless explicitly stated on the tool's page.
          </>
        )}
      </p>

      {filteredSections.length === 0 && filteredExternal.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm font-mono text-slate-500 dark:text-slate-500">
          No tools match "{q}". Try a different keyword or{' '}
          <button onClick={() => setQuery('')} className="text-brand-600 dark:text-brand-400 hover:underline">
            clear the search
          </button>
          .
        </div>
      ) : (
        <>
          {filteredSections.map((s) => (
            <SectionBlock key={s.id} section={s} />
          ))}

          {filteredExternal.length > 0 && (
            <div>
              <div className="flex items-baseline justify-between gap-3 mb-3 mt-2 flex-wrap">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono">
                  External resources
                </h3>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-500">
                  Curated tools and catalogs hosted elsewhere · {filteredExternal.length}
                  {q ? ` of ${EXTERNAL.length}` : ''} link{filteredExternal.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredExternal.map((t) => (
                  <Card key={t.path} tool={t} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
