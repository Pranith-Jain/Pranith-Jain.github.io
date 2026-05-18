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
  Cloud,
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
  Database,
  Smartphone,
  ScanLine,
  Binary,
  Activity,
  type LucideIcon,
} from 'lucide-react';

export interface Tool {
  path: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  /** One-line example use-case shown on the rich landing card. */
  useCase?: string;
  external?: boolean;
}

/**
 * Top-level tool group. Each section belongs to exactly one group so the
 * grid can be sliced into dedicated, less-overwhelming category pages
 * (separate OSINT / AI-sec / Data-security / GRC surfaces) while the
 * full /dfir grid stays as the power-user index.
 */
export type ToolGroup = 'dfir' | 'ir' | 'ti' | 'osint' | 'aisec' | 'datasec' | 'grc';

export const GROUP_META: Record<ToolGroup, { label: string; blurb: string }> = {
  dfir: {
    label: 'DFIR / Forensics',
    blurb: 'Triage + artifact parsing — IOC/hash, decoders, EVTX/registry/PE/prefetch, SQLite, PCAP.',
  },
  ir: {
    label: 'Incident Response',
    blurb: 'Domain/network/edge investigation, email & phishing response, vuln + identity checks.',
  },
  ti: {
    label: 'Threat-Intel Tools',
    blurb: 'Detection engineering — YARA/Sigma, LOLBins, log timeline, STIX.',
  },
  osint: { label: 'OSINT Tools', blurb: 'Recon, attribution, public-record pivots. Username, image, archive, geo.' },
  aisec: {
    label: 'AI Security Tools',
    blurb: 'LLM red-teaming, prompt-injection, MCP audit, agent attack surface, ATLAS.',
  },
  datasec: { label: 'Data Security Tools', blurb: 'Sensitive-data detection, classification & handling, privacy hub.' },
  grc: { label: 'GRC & Posture Tools', blurb: 'Compliance & maturity, tabletop exercises, kill chain, OWASP, NHI.' },
};

export interface Section {
  id: string;
  label: string;
  /** One-line hint shown under the section heading. */
  blurb: string;
  /** Which dedicated category page this section belongs to. */
  group: ToolGroup;
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
    group: 'dfir',
    label: 'Triage & IOCs',
    blurb: 'First stop when an indicator lands in your inbox.',
    tools: [
      {
        path: '/dfir/ioc-check',
        useCase: 'Check an indicator across 24 sources in seconds.',
        label: 'IOC & Hash Checker',
        desc: '24 sources · streaming · IPs · domains · URLs · file hashes',
        icon: Hash,
      },
      {
        path: '/dfir/malware-scan',
        useCase: 'Profile a suspicious file before deeper analysis.',
        label: 'Malware Scanner',
        desc: 'Drop a file · client-side hashing + entropy + strings + heuristic tags · dispatches the hash to 11 public engines (VT, MalwareBazaar, ANY.RUN, Joe Sandbox, Hybrid Analysis, OTX, etc)',
        icon: Microscope,
      },
      {
        path: '/dfir/extract',
        useCase: 'Pull every IOC out of a threat report instantly.',
        label: 'IOC Extractor',
        desc: 'Pull IOCs from any text blob · refang-aware',
        icon: Filter,
      },
      {
        path: '/dfir/decode',
        useCase: 'Decode an obfuscated payload string fast.',
        label: 'Decoder',
        desc: 'Base64 · URL · multi-pass',
        icon: Code2,
      },
      {
        path: '/dfir/encoder',
        useCase: 'Build and round-trip an encoding chain.',
        label: 'Encoder',
        desc: 'Reverse of Decoder — base64 / url / hex / binary / rot13 with chain builder + round-trip',
        icon: Type,
      },
      {
        path: '/dfir/powershell-deobf',
        useCase: 'Unwrap an encoded PowerShell command.',
        label: 'PowerShell Deobfuscator',
        desc: 'EncodedCommand · char-arrays · format-strings · multi-pass with diff trace',
        icon: Terminal,
      },
      {
        path: '/dfir/timestamp',
        useCase: 'Decode a FILETIME from a registry artifact.',
        label: 'Timestamp Converter',
        desc: 'Unix s/ms/µs · Windows FILETIME · WebKit/Chrome · Apple Cocoa · ISO 8601 — all at once',
        icon: Clock,
      },
      {
        path: '/dfir/hash-calc',
        useCase: 'Verify a file hash against a known IOC.',
        label: 'Hash Calculator',
        desc: 'MD5 · SHA-1/256/384/512 for text or a dropped file · client-side',
        icon: Hash,
      },
      {
        path: '/dfir/plist-protobuf',
        useCase: 'Preview a plist manifest or protobuf blob.',
        label: 'Plist & Protobuf Decoder',
        desc: 'Apple binary/XML plists + schema-less protobuf · hand-rolled parsers · client-side',
        icon: Code2,
      },
      {
        path: '/dfir/pcap-triage',
        useCase: 'Extract DNS and HTTP from a capture quickly.',
        label: 'PCAP Triage',
        desc: '.pcap/.pcapng → protocol mix · top talkers · conversations · DNS + HTTP extraction · client-side',
        icon: Network,
      },
      {
        path: '/dfir/registry-hive',
        useCase: 'Pull autoruns and USB history from a hive.',
        label: 'Registry Hive Explorer',
        desc: 'Raw regf hive (SYSTEM/SOFTWARE/NTUSER.DAT) → key/value tree · hand-rolled parser · client-side',
        icon: FolderTree,
      },
      {
        path: '/dfir/evtx',
        useCase: 'Review key Windows security events from an export.',
        label: 'EVTX Parser Lite',
        desc: 'Windows .evtx → per-record timestamp + readable BinXML strings · triage view · client-side',
        icon: ScrollText,
      },
      {
        path: '/dfir/sqlite',
        useCase: 'Inspect browser history without uploading it.',
        label: 'SQLite Artifact Explorer',
        desc: 'Open browser/app SQLite DBs · schema + row browse + read queries · lazy WASM · client-side',
        icon: Database,
      },
      {
        path: '/dfir/ios-backup',
        useCase: 'Review an iOS backup file inventory for triage.',
        label: 'iOS Backup Explorer',
        desc: 'iOS Manifest.db → backed-up file inventory by domain/path · lazy WASM · client-side',
        icon: Smartphone,
      },
      {
        path: '/dfir/mobile-sqlite',
        useCase: 'Inspect app databases from a mobile backup.',
        label: 'Mobile SQLite Explorer',
        desc: 'Open mobile-app SQLite DBs exported from backups · schema + rows + queries · client-side',
        icon: Smartphone,
      },
      {
        path: '/dfir/pe',
        useCase: 'Profile a suspicious binary before reversing.',
        label: 'PE Static Analyzer Lite',
        desc: 'EXE/DLL headers · mitigations · section entropy (packed?) · import table w/ suspicious-API flags',
        icon: Binary,
      },
      {
        path: '/dfir/web-log',
        useCase: 'Triage web logs and export suspicious hits.',
        label: 'Web Server Log Analyzer',
        desc: 'Apache/Nginx access logs → SQLi/XSS/traversal/scanner heuristics · CSV export · client-side',
        icon: FileCheck,
      },
      {
        path: '/dfir/prefetch',
        useCase: 'Recover execution metadata from a .pf artifact.',
        label: 'Prefetch Analyzer Lite',
        desc: 'Windows .pf incl. Win10+ MAM/LZXPRESS-Huffman · exe · run count · last runs · referenced files',
        icon: Activity,
      },
      {
        path: '/dfir/apk-analyzer',
        useCase: 'Analyze an Android APK for malware indicators.',
        label: 'APK Analyzer',
        desc: 'Drop .apk · permissions · package info · DEX count · strings · IOCs · suspicious patterns · hashes · client-side',
        icon: Smartphone,
      },
    ],
  },
  {
    id: 'domain',
    group: 'ir',
    label: 'Domain, Network & Edge',
    blurb: 'Where does this thing live, what does it expose, who owns it.',
    tools: [
      {
        path: '/dfir/domain',
        useCase: 'Get WHOIS, DNS and email auth in one shot.',
        label: 'Domain Lookup',
        desc: 'WHOIS · DNS · email auth · CT logs',
        icon: Globe,
      },
      {
        path: '/dfir/domain-rep',
        useCase: 'Check domain and IP against 11 DNSBL sources.',
        label: 'Domain & IP Reputation',
        desc: 'Spamhaus · Barracuda · SORBS · URIBL · Invaluement · DNS-over-HTTPS · no API key required',
        icon: ShieldCheck,
      },
      {
        path: '/dfir/full-spectrum',
        useCase: 'Run every domain check from one query.',
        label: 'Full Spectrum Domain',
        desc: 'One-shot orchestrator — runs WHOIS, DNS, ASN, breach check, exposure, certs, takeover, web scan, IP geo on a single domain and stitches the results',
        icon: Radar,
      },
      {
        path: '/dfir/asn',
        useCase: 'Map an IP to its ASN and abuse contacts.',
        label: 'ASN Lookup',
        desc: 'BGP · prefixes · abuse contacts',
        icon: Network,
      },
      {
        path: '/dfir/exposure',
        useCase: 'Enumerate subdomains and open ports fast.',
        label: 'Exposure Scanner',
        desc: 'Subdomains + open ports',
        icon: Radar,
      },
      {
        path: '/dfir/web-scan',
        useCase: 'Spot missing security headers and exposed paths.',
        label: 'Web Vulnerability Scanner',
        desc: 'HTTP security headers · cookies · version disclosure · ~30 common exposed paths probed in parallel',
        icon: ShieldAlert,
      },
      {
        path: '/dfir/takeover',
        useCase: 'Detect a dangling subdomain takeover.',
        label: 'Subdomain Takeover',
        desc: 'CNAME chain + 15 dangling-service fingerprints',
        icon: Unplug,
      },
      {
        path: '/dfir/cert-search',
        useCase: 'Find subdomains via certificate transparency.',
        label: 'Certificate Search',
        desc: 'CT log enumeration via SSLMate Cert Spotter — find subdomains by their issued certs',
        icon: ShieldCheck,
      },
    ],
  },
  {
    id: 'osint',
    group: 'osint',
    label: 'OSINT Tools',
    blurb: 'Open-source pivots — username, archive, code-host metadata.',
    tools: [
      {
        path: '/dfir/username',
        useCase: 'Trace a username across 50+ platforms.',
        label: 'Username Pivot',
        desc: 'Sherlock-lite · 50+ services · live CORS checks for GitHub/GitLab/Reddit/HN/Mastodon · client-side',
        icon: AtSign,
      },
      {
        path: '/dfir/wayback',
        useCase: 'Build an archive timeline for a URL.',
        label: 'Wayback Machine Pivot',
        desc: 'Internet Archive CDX timeline · first/last seen · status-code distribution · snapshot links',
        icon: History,
      },
      {
        path: '/dfir/ip-geo',
        useCase: 'Geolocate an IP and flag VPN or hosting.',
        label: 'IP Geolocation',
        desc: 'Country · ASN · ISP · proxy/VPN/hosting flags · AbuseIPDB confidence + report count · OpenStreetMap pin',
        icon: Globe2,
      },
      {
        path: '/dfir/socmint',
        useCase: 'Pivot an email or handle to OSINT sources.',
        label: 'SOCMINT Pivots',
        desc: 'Email/domain/handle/name → categorised OSINT lookup links · breach + B2B (ZoomInfo, Apollo, Hunter, RocketReach) + social + dev + paste dorks',
        icon: Users,
      },
      {
        path: '/dfir/url-rep',
        useCase: 'Check a URL across 20+ sources.',
        label: 'URL Reputation',
        desc: 'Streaming verdict · 20+ sources · VT · PhishTank · URLScan · OTX · ThreatFox · composite score',
        icon: Eye,
      },
      {
        path: '/dfir/url-preview',
        useCase: 'Safely preview a suspicious link.',
        label: 'URL Preview',
        desc: 'Server-side metadata · safe fetch · screenshot',
        icon: Eye,
      },
      {
        path: '/dfir/exif',
        useCase: 'Extract GPS and camera data from an image.',
        label: 'EXIF Parser',
        desc: 'GPS · camera · client-only · drop image to extract metadata',
        icon: ImageIcon,
      },
      {
        path: '/dfir/reverse-image',
        useCase: 'Generate reverse-image search links fast.',
        label: 'Reverse Image Search',
        desc: 'Paste image URL → Google Lens / Bing / Yandex / TinEye / Baidu · pure URL generator · pairs with Phishing',
        icon: ImageIcon,
      },
      {
        path: '/dfir/punycode',
        useCase: 'Catch a homograph lookalike domain.',
        label: 'Homograph Detector',
        desc: 'IDN · mixed scripts · brand lookalikes · paste a domain to inspect',
        icon: Type,
      },
      {
        path: '/dfir/crypto-trace',
        useCase: 'Trace a wallet across chains and explorers.',
        label: 'Crypto Address Tracer',
        desc: 'BTC + 6 EVM chains + Solana · balance · explorer + NFT + DeFi + scam-flag pivots',
        icon: Coins,
      },
      {
        path: '/dfir/dork-builder',
        useCase: 'Compose a dork to surface exposed files.',
        label: 'Google Dork Builder',
        desc: 'Compose site:/filetype:/intitle: operators · presets · open in Google/Bing/DDG/Yandex',
        icon: Search,
      },
      {
        path: '/dfir/brand-impersonation',
        useCase: 'Generate lookalike domains to monitor.',
        label: 'Brand Impersonation Explorer',
        desc: 'Typosquat · homoglyph · affix · TLD-swap variants of a brand domain · crt.sh pivots · cross-link to /threatintel/domain-monitor',
        icon: ShieldAlert,
      },
      {
        path: '/dfir/image-fingerprint',
        useCase: 'Detect a re-uploaded or near-duplicate image.',
        label: 'Image Fingerprint',
        desc: 'In-browser aHash + dHash · compare two images for near-duplicate / re-upload detection',
        icon: ImageIcon,
      },
      {
        path: '/dfir/screenshot-intel',
        useCase: 'OCR a screenshot and pull entities from the text.',
        label: 'Screenshot Intelligence',
        desc: 'OCR (self-hosted Tesseract) + QR decode + EXIF/GPS · extract URL/IP/email/crypto entities · client-side',
        icon: ScanLine,
      },
    ],
  },
  {
    id: 'email',
    group: 'ir',
    label: 'Email Security',
    blurb: 'Phishing analysis and BEC-defense for the domain you protect.',
    tools: [
      {
        path: '/dfir/phishing',
        useCase: 'Triage a phishing email in seconds.',
        label: 'Phishing Analyzer',
        desc: 'Email headers · auth · embedded URLs',
        icon: ShieldAlert,
      },
      {
        path: '/dfir/eml',
        useCase: 'Pull attachments and IOCs from an .eml.',
        label: 'EML Attachment Extractor',
        desc: 'Drop a raw .eml · decode multipart · SHA-256 / SHA-1 / MD5 each attachment · one-click pivot to file lookup',
        icon: Paperclip,
      },
      {
        path: '/dfir/email-rep',
        useCase: 'Check a domain email reputation.',
        label: 'Email Reputation',
        desc: 'MX · SPF · DKIM · DMARC · BIMI · MTA-STS · TLS-RPT · 13 IP blacklists · 6 domain blacklists · live DNSBL via DoH · composite score',
        icon: Mail,
      },
      {
        path: '/dfir/email-defense',
        useCase: 'Score BEC risk for the domain you protect.',
        label: 'Email Defense / BEC Score',
        desc: 'SPF · DMARC · DKIM · MTA-STS · spoofability score · attack scenarios per gap',
        icon: Mail,
      },
      {
        path: '/dfir/dmarc-analyzer',
        useCase: 'Parse DMARC RUA XML reports instantly.',
        label: 'DMARC RUA Analyzer',
        desc: 'Upload XML · in-browser parse · per-IP SPF/DKIM/DMARC · pass rate · CSV export · zero server storage',
        icon: ShieldCheck,
      },
    ],
  },
  {
    id: 'data-sec',
    group: 'datasec',
    label: 'Data Security & DLP',
    blurb: 'Find sensitive data; decide how to handle it.',
    tools: [
      {
        path: '/dfir/dlp-scan',
        useCase: 'Spot sensitive data before it leaks.',
        label: 'Sensitive Data Detector',
        desc: '28 patterns · Luhn / IBAN / Verhoeff / NHS verified · severity + confidence · redact-and-copy',
        icon: ShieldAlert,
      },
      {
        path: '/dfir/data-classification',
        useCase: 'Classify data and pick a handling tier.',
        label: 'Data Classification & Handling',
        desc: 'Tier policies · dataset inventory · matrix view · markdown export',
        icon: FolderTree,
      },
      {
        path: '/dfir/privacy-hub',
        useCase: 'Review data-protection posture quickly.',
        label: 'Privacy & Data-Protection Hub',
        desc: 'GDPR · CCPA / CPRA · DPDP · HIPAA Privacy Rule · PCI DSS · breach-notification timelines',
        icon: Scale,
      },
    ],
  },
  {
    id: 'det-eng',
    group: 'ti',
    label: 'Detection Engineering',
    blurb: 'Build, test, and run detection content.',
    tools: [
      {
        path: '/dfir/rule-playground',
        useCase: 'Test a YARA or Sigma rule locally.',
        label: 'YARA / Sigma Playground',
        desc: 'Paste rule + sample · highlight matches · client-side',
        icon: FlaskConical,
      },
      {
        path: '/dfir/yara',
        useCase: 'Manage and run YARA rules in-browser.',
        label: 'YARA Rule Manager',
        desc: 'Create, edit, validate, and export YARA rules · localStorage-backed library · multi-rule .yar file builder',
        icon: FileCheck,
      },
      {
        path: '/dfir/lolbins',
        useCase: 'Look up a living-off-the-land binary.',
        label: 'LOLBins / GTFOBins',
        desc: 'Curated living-off-the-land catalog · ATT&CK-mapped · detection ideas',
        icon: Terminal,
      },
      {
        path: '/dfir/log-parser',
        useCase: 'Build a timeline from raw log text.',
        label: 'Log Parser',
        desc: 'WinEvent / Sysmon / syslog / JSON-line / key=value · MITRE tagging · Splunk + Elastic + Sentinel queries',
        icon: ScrollText,
      },
      {
        path: '/dfir/stix',
        useCase: 'Inspect a STIX bundle visually.',
        label: 'STIX Viewer',
        desc: 'Drop a STIX 2.1 bundle · interactive relationship graph · validate + browse SDOs/SROs',
        icon: Share2,
      },
    ],
  },
  {
    id: 'frameworks',
    group: 'grc',
    label: 'Frameworks & Posture',
    blurb: 'Models analysts use to structure intrusions and security programs.',
    tools: [
      {
        path: '/dfir/kill-chain',
        useCase: 'Map an intrusion to the kill chain.',
        label: 'Cyber Kill Chain',
        desc: '7 phases · 28 techniques · ATT&CK cross-links',
        icon: Crosshair,
      },
      {
        path: '/dfir/diamond',
        useCase: 'Model an intrusion with the Diamond model.',
        label: 'Diamond Model',
        desc: '4 vertices · meta-features · interactive event template',
        icon: Diamond,
      },
      {
        path: '/dfir/owasp',
        useCase: 'Reference the OWASP Top 10 fast.',
        label: 'OWASP Top 10',
        desc: 'Web 2021 · API 2023 · LLM 2025 · self-assessment + MITRE links',
        icon: ShieldCheck,
      },
      {
        path: '/dfir/nhi',
        useCase: 'Inventory non-human identities and risk.',
        label: 'NHI Inventory & Top 10',
        desc: 'OWASP NHI Top 10 (2025) · service-account / OAuth / MCP-token inventory · per-NHI risk',
        icon: KeyRound,
      },
      {
        path: '/dfir/tabletop',
        useCase: 'Generate a tabletop exercise on demand.',
        label: 'Tabletop / IR Exercise Generator',
        desc: '6 archetypes × actor catalog · timed injects · per-role prompts · markdown export',
        icon: ScrollText,
      },
      {
        path: '/dfir/grc',
        useCase: 'Score compliance and maturity quickly.',
        label: 'GRC Compliance & Maturity',
        desc: 'NIST CSF 2.0 · ISO 27001 · ISO 42001 (AI) · CIS · SOC 2 · SOC-CMM · cross-mapping',
        icon: FileCheck,
      },
    ],
  },
  {
    id: 'ai-sec',
    group: 'aisec',
    label: 'AI Security',
    blurb: 'AI-system threat surface — prompts, agents, MCP servers.',
    tools: [
      {
        path: '/dfir/prompt-injection',
        useCase: 'Red-team a prompt for injection.',
        label: 'Prompt Injection & Red-Team',
        desc: 'Detect 28 patterns · 26-prompt red-team library · OWASP LLM Top 10 · JSON export',
        icon: Sparkles,
      },
      {
        path: '/dfir/mcp-audit',
        useCase: 'Audit an MCP server attack surface.',
        label: 'MCP & Claude Code Auditor',
        desc: 'MCP configs + Claude Code settings · hooks · permission rules · tool poisoning',
        icon: Plug,
      },
      {
        path: '/dfir/agent-map',
        useCase: 'Map an AI agent attack surface.',
        label: 'AI Agent Attack-Surface Mapper',
        desc: 'Capability graph from MCP/CC config · flags exfil + RCE chains · SVG visual',
        icon: Network,
      },
      {
        path: '/dfir/atlas',
        useCase: 'Reference MITRE ATLAS techniques.',
        label: 'MITRE ATLAS',
        desc: 'Adversarial-ML technique matrix — tactics + techniques for AI/ML attack surface · live from mitre/atlas-data',
        icon: Crosshair,
      },
    ],
  },
  {
    id: 'vulns-identity',
    group: 'ir',
    label: 'Vulnerabilities & Identity',
    blurb: 'CVE triage, breach exposure, and identity verification.',
    tools: [
      {
        path: '/dfir/cve',
        useCase: 'Look up a CVE with KEV and EPSS context.',
        label: 'CVE Lookup',
        desc: 'NVD · CVSS · EPSS · KEV · combined patch-priority score with rationale',
        icon: Search,
      },
      {
        path: '/dfir/breach',
        useCase: 'Check a password against breach corpora.',
        label: 'Breach Checker',
        desc: 'Pwned password · k-anonymity',
        icon: Shield,
      },
      {
        path: '/dfir/jwt',
        useCase: 'Decode a JWT and flag weak claims.',
        label: 'JWT Inspector',
        desc: 'Decode + flag alg=none, exp, weak claims',
        icon: KeyRound,
      },
    ],
  },
  {
    id: 'reference',
    group: 'dfir',
    label: 'Personal',
    blurb: 'Your own state and privacy hygiene.',
    tools: [
      {
        path: '/dfir/dashboard',
        useCase: 'Jump back to your recent lookups.',
        label: 'Recent Lookups',
        desc: 'Your last 20 queries',
        icon: Clock,
      },
      {
        path: '/dfir/privacy',
        useCase: 'Check your own IP and fingerprint exposure.',
        label: 'Privacy Check',
        desc: 'IP · WebRTC · fingerprint',
        icon: Lock,
      },
    ],
  },
  {
    id: 'cloud',
    group: 'grc',
    label: 'Cloud Security',
    blurb: 'Cloud posture & least-privilege review — runs entirely in your browser.',
    tools: [
      {
        path: '/dfir/iam-analyzer',
        useCase: 'Catch wildcard-admin / public-access before it ships.',
        label: 'IAM Policy Analyzer',
        desc: 'Paste an AWS IAM / S3 bucket / role-trust policy · flags wildcard admin, public principals, NotAction/NotResource, privilege-escalation actions, broad secret access & confused-deputy trust · 100% client-side',
        icon: Cloud,
      },
      {
        path: '/dfir/sg-analyzer',
        useCase: 'Find the database port someone left open to the world.',
        label: 'Security Group / NSG Analyzer',
        desc: 'Paste AWS describe-security-groups JSON or an Azure NSG · flags inbound rules open to 0.0.0.0/0 · ::/0 · "Internet", severity-ranked by service (SSH/RDP/DB/admin planes) · 100% client-side',
        icon: Network,
      },
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
