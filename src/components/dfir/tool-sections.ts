/**
 * Auto-extracted from ToolGrid.tsx so the component file can satisfy the
 * react-refresh/only-export-components rule — Fast Refresh only works when
 * a file exports components and nothing else. Data (SECTIONS, EXTERNAL,
 * Tool / Section types, TOOL_COUNT) lives here; the renderer lives in
 * ToolGrid.tsx and imports from this module.
 */
import {
  Hash,
  ShieldAlert,
  Globe,
  Radar,
  Clock,
  Users,
  Lock,
  Search,
  Shield,
  Sparkles,
  Eye,
  Network,
  Code2,
  Image as ImageIcon,
  Filter,
  KeyRound,
  Type,
  Unplug,
  Share2,
  Microscope,
  Globe2,
  ShieldCheck,
  Plug,
  Crosshair,
  Diamond,
  Mail,
  Terminal,
  FlaskConical,
  ScrollText,
  FileCheck,
  FolderTree,
  Paperclip,
  Scale,
  AtSign,
  History,
  Coins,
  type LucideIcon,
} from 'lucide-react';

export interface Tool {
  path: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  external?: boolean;
}

export interface Section {
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
export const SECTIONS: Section[] = [
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
        path: '/dfir/malware-scan',
        label: 'Malware Scanner',
        desc: 'Drop a file · client-side hashing + entropy + strings + heuristic tags · dispatches the hash to 11 public engines (VT, MalwareBazaar, ANY.RUN, Joe Sandbox, Hybrid Analysis, OTX, etc)',
        icon: Microscope,
      },
      {
        path: '/dfir/extract',
        label: 'IOC Extractor',
        desc: 'Pull IOCs from any text blob · refang-aware',
        icon: Filter,
      },
      { path: '/dfir/decode', label: 'Decoder', desc: 'Base64 · URL · multi-pass', icon: Code2 },
      {
        path: '/dfir/encoder',
        label: 'Encoder',
        desc: 'Reverse of Decoder — base64 / url / hex / binary / rot13 with chain builder + round-trip',
        icon: Type,
      },
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
      {
        path: '/dfir/full-spectrum',
        label: 'Full Spectrum Domain',
        desc: 'One-shot orchestrator — runs WHOIS, DNS, ASN, breach check, exposure, certs, takeover, web scan, IP geo on a single domain and stitches the results',
        icon: Radar,
      },
      { path: '/dfir/asn', label: 'ASN Lookup', desc: 'BGP · prefixes · abuse contacts', icon: Network },
      { path: '/dfir/exposure', label: 'Exposure Scanner', desc: 'Subdomains + open ports', icon: Radar },
      {
        path: '/dfir/web-scan',
        label: 'Web Vulnerability Scanner',
        desc: 'HTTP security headers · cookies · version disclosure · ~30 common exposed paths probed in parallel',
        icon: ShieldAlert,
      },
      {
        path: '/dfir/takeover',
        label: 'Subdomain Takeover',
        desc: 'CNAME chain + 15 dangling-service fingerprints',
        icon: Unplug,
      },
      {
        path: '/dfir/cert-search',
        label: 'Certificate Search',
        desc: 'CT log enumeration via SSLMate Cert Spotter — find subdomains by their issued certs',
        icon: ShieldCheck,
      },
    ],
  },
  {
    id: 'osint',
    label: 'OSINT Tools',
    blurb: 'Open-source pivots — username, archive, code-host metadata.',
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
        path: '/dfir/ip-geo',
        label: 'IP Geolocation',
        desc: 'Country · ASN · ISP · proxy/VPN/hosting flags · AbuseIPDB confidence + report count · OpenStreetMap pin',
        icon: Globe2,
      },
      {
        path: '/dfir/socmint',
        label: 'SOCMINT Pivots',
        desc: 'Email/domain/handle/name → categorised OSINT lookup links · breach + B2B (ZoomInfo, Apollo, Hunter, RocketReach) + social + dev + paste dorks',
        icon: Users,
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
        path: '/dfir/reverse-image',
        label: 'Reverse Image Search',
        desc: 'Paste image URL → Google Lens / Bing / Yandex / TinEye / Baidu · pure URL generator · pairs with Phishing',
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
        path: '/dfir/eml',
        label: 'EML Attachment Extractor',
        desc: 'Drop a raw .eml · decode multipart · SHA-256 / SHA-1 / MD5 each attachment · one-click pivot to file lookup',
        icon: Paperclip,
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
    id: 'det-eng',
    label: 'Detection Engineering',
    blurb: 'Build, test, and run detection content.',
    tools: [
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
      {
        path: '/dfir/log-parser',
        label: 'Log Parser',
        desc: 'WinEvent / Sysmon / syslog / JSON-line / key=value · MITRE tagging · Splunk + Elastic + Sentinel queries',
        icon: ScrollText,
      },
      {
        path: '/dfir/stix',
        label: 'STIX Viewer',
        desc: 'Drop a STIX 2.1 bundle · interactive relationship graph · validate + browse SDOs/SROs',
        icon: Share2,
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
    label: 'Personal',
    blurb: 'Your own state and privacy hygiene.',
    tools: [
      { path: '/dfir/dashboard', label: 'Recent Lookups', desc: 'Your last 20 queries', icon: Clock },
      { path: '/dfir/privacy', label: 'Privacy Check', desc: 'IP · WebRTC · fingerprint', icon: Lock },
    ],
  },
];

/**
 * Off-site sources / catalogs the External-Resources block used to render.
 * Moved to /threatintel as part of the 2026-05-11 split — see
 * `EXTERNAL_SOURCES` in `src/pages/threatintel/Home.tsx`. Kept here as
 * an empty array so the page renderer below doesn't need a conditional.
 */
const EXTERNAL: Tool[] = [];

export const TOOL_COUNT = SECTIONS.reduce((n, s) => n + s.tools.length, 0);

export { EXTERNAL };
