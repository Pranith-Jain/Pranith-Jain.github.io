/**
 * Canonical registry of every routable page in the DFIR / security toolkit area.
 *
 * Mirrors `data/threatintel-hubs.ts` - the threat-intel area was consolidated
 * onto this pattern in commit 6f7d055b (2026-06-17); this file is the same
 * shape for the DFIR section so both apps share a navigation system.
 *
 * Each "hub" is a category of related pages. Pages live at their own direct
 * URL (/dfir/<hub-id>/<tab-id>). There is no /dfir/<hub-id> landing page in
 * between — the /dfir/catalog page is the single navigation surface for
 * browsing a category, and accepts ?cat=<hub-id> to pre-filter.
 */

import {
  AlertTriangle,
  AtSign,
  Bot,
  Bug,
  Cloud,
  Code2,
  Compass,
  Crosshair,
  FileText,
  FolderTree,
  Globe,
  Lock,
  Mail,
  Scale,
  ScrollText,
  Server,
  Share2,
  Shield,
  Sparkles,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

export type HubPageBadge = 'live' | 'new' | 'beta';

export interface HubPage {
  path: string;
  tabId: string;
  label: string;
  desc: string;
  compVar: string;
  badge?: HubPageBadge;
  keywords?: readonly string[];
  icon?: LucideIcon;
}

export interface HubMeta {
  id: string;
  label: string;
  blurb: string;
  icon: LucideIcon;
  tone: string;
  pages: readonly HubPage[];
}

export const HUB_META: readonly HubMeta[] = [
  {
    id: 'overview',
    label: 'Overview',
    blurb: 'Catalog and entry points for the DFIR / security toolkit area.',
    icon: Compass,
    tone: 'text-brand-700 dark:text-brand-300 border-brand-500/30 bg-brand-500/10',
    pages: [
      {
        path: '/dfir/catalog',
        tabId: 'catalog',
        label: 'DFIR Catalog',
        desc: 'Every DFIR tool, searchable, grouped by category.',
        compVar: 'DfirCatalog',
      },
      {
        path: '/dfir/vs',
        tabId: 'vs',
        label: 'Toolkit vs VirusTotal / ANY.RUN / Hybrid Analysis / URLScan',
        desc: 'Side-by-side comparison of the DFIR toolkit with hosted sandboxes and URL scanners.',
        compVar: 'DfirVs',
      },
    ],
  },
  {
    id: 'ioc-triage',
    label: 'IOC Triage',
    blurb:
      'Check, extract, and track indicators across 24+ sources - IP, domain, URL, hash pivots with cross-source consensus.',
    icon: Crosshair,
    tone: 'text-rose-700 dark:text-rose-300 border-rose-500/30 bg-rose-500/10',
    pages: [
      {
        path: '/dfir/ioc-investigate',
        tabId: 'ioc-investigate',
        label: 'IOC Investigator',
        desc: 'Cross-source investigation hub — paste any indicator type and pivot across all sources.',
        compVar: 'IocInvestigate',
      },

      {
        path: '/dfir/extract',
        tabId: 'extract',
        label: 'IOC Extractor',
        desc: 'Pull IOCs from any text blob — refang-aware.',
        compVar: 'IocExtractor',
      },
      {
        path: '/dfir/ioc-lifecycle',
        tabId: 'ioc-lifecycle',
        label: 'IOC Lifecycle',
        desc: 'Track an IOC from collection to enrichment to retirement.',
        compVar: 'IocLifecycle',
      },
      {
        path: '/dfir/ct-monitor',
        tabId: 'ct-monitor',
        label: 'Certificate Transparency Monitor',
        desc: 'Watch CT logs for new certificates matching your watchlist.',
        compVar: 'CtMonitor',
      },
      {
        path: '/dfir/abuse-rep',
        tabId: 'abuse-rep',
        label: 'Abuse Reputation',
        desc: 'Cross-source reputation: AbuseIPDB, Spamhaus, OTX, URLhaus.',
        compVar: 'AbuseRepPage',
      },
      {
        path: '/dfir/x-verdikt',
        tabId: 'x-verdikt',
        label: 'X-VERDIKT Multi-Source Verdict',
        desc: 'Streaming verdicts from X (Twitter) intelligence feeds.',
        compVar: 'XVeridikt',
        badge: 'new',
        keywords: ['x', 'twitter', 'verdict', 'consensus'],
      },
    ],
  },
  {
    id: 'malware',
    label: 'Malware Analysis',
    blurb: 'Triage, parse, and deobfuscate samples - stealer logs, packed binaries, malicious documents, and PCAPs.',
    icon: Bug,
    tone: 'text-orange-700 dark:text-orange-300 border-orange-500/30 bg-orange-500/10',
    pages: [
      {
        path: '/dfir/malware-analyzer',
        tabId: 'malware-analyzer',
        label: 'Malware Analyzer',
        desc: 'PE / ELF / Mach-O static analysis with import hashing + section entropy.',
        compVar: 'MalwareAnalyzer',
      },
      {
        path: '/dfir/stealer-parser',
        tabId: 'stealer-parser',
        label: 'Infostealer Log Parser',
        desc: 'Parse RedLine / Raccoon / Vidar / LummaC stealer logs — credentials, system, browser data.',
        compVar: 'StealerParser',
      },

      {
        path: '/dfir/bloom',
        tabId: 'bloom',
        label: 'Bloom Filter Lookup',
        desc: 'Membership-test against a corpus of known-bad indicators.',
        compVar: 'BloomFilter',
      },
    ],
  },
  {
    id: 'file-analysis',
    label: 'File & Binary Analysis',
    blurb: 'Decode, hash, and inspect binaries, encoded payloads, and document formats - runs entirely in the browser.',
    icon: FileText,
    tone: 'text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/10',
    pages: [
      {
        path: '/dfir/decode',
        tabId: 'decode',
        label: 'Decoder',
        desc: 'base64 — hex — url — rot13 — zlib — gzip — chained auto-detection.',
        compVar: 'Decode',
      },
      {
        path: '/dfir/encoder',
        tabId: 'encoder',
        label: 'Encoder',
        desc: 'Reverse of Decoder — encode any text to any of the supported formats.',
        compVar: 'Encoder',
      },
      {
        path: '/dfir/hash-calc',
        tabId: 'hash-calc',
        label: 'Hash Calculator',
        desc: 'MD5 — SHA1 — SHA256 — SHA512 — SSDEEP — TLSH — drag a file in.',
        compVar: 'HashCalculator',
      },
      {
        path: '/dfir/timestamp',
        tabId: 'timestamp',
        label: 'Timestamp Converter',
        desc: 'Epoch — Windows FILETIME — Unix — human — bidirectional.',
        compVar: 'TimestampConverter',
      },
      {
        path: '/dfir/pe',
        tabId: 'pe',
        label: 'PE Static Analyzer Lite',
        desc: 'Sections, imports, exports, version info — 0x12 lite profile.',
        compVar: 'PeAnalyzer',
      },
      {
        path: '/dfir/apk-analyzer',
        tabId: 'apk-analyzer',
        label: 'APK Analyzer',
        desc: 'Manifest + permissions + signing certs + native libs.',
        compVar: 'ApkAnalyzer',
      },
      {
        path: '/dfir/exif',
        tabId: 'exif',
        label: 'EXIF / Metadata Parser',
        desc: 'EXIF — IPTC — XMP — MakerNotes — camera, GPS, software fingerprints.',
        compVar: 'ExifParse',
      },
      {
        path: '/dfir/plist-protobuf',
        tabId: 'plist-protobuf',
        label: 'Plist & Protobuf Decoder',
        desc: 'Apple binary plist + protobuf human-readable view.',
        compVar: 'PlistProtobuf',
      },
      {
        path: '/dfir/punycode',
        tabId: 'punycode',
        label: 'Punycode / Homoglyph Viewer',
        desc: 'Visualise IDN homograph attacks — Cyrillic vs Latin lookalikes.',
        compVar: 'Punycode',
      },
      {
        path: '/dfir/powershell-deobf',
        tabId: 'powershell-deobf',
        label: 'PowerShell Deobfuscator',
        desc: 'Unroll encoded / base64 / invoke-expression chains — step by step.',
        compVar: 'PowershellDeobf',
      },
    ],
  },
  {
    id: 'artifacts',
    label: 'Artifact Parsers',
    blurb: 'Endpoint forensic artifacts - PCAP, registry, EVTX, SQLite, browser, mobile, and web logs.',
    icon: FolderTree,
    tone: 'text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    pages: [
      {
        path: '/dfir/pcap-triage',
        tabId: 'pcap-triage',
        label: 'PCAP Triage',
        desc: 'Protocol breakdown — top talkers — DNS / HTTP / TLS summaries.',
        compVar: 'PcapTriage',
      },
      {
        path: '/dfir/registry-hive',
        tabId: 'registry-hive',
        label: 'Registry Hive Explorer',
        desc: 'Browse — search — diff Windows registry hives offline.',
        compVar: 'RegistryHive',
      },
      {
        path: '/dfir/evtx',
        tabId: 'evtx',
        label: 'EVTX Parser Lite',
        desc: 'Parse Windows Event Log files — event IDs, channels, time-range filter.',
        compVar: 'EvtxParser',
      },
      {
        path: '/dfir/sqlite',
        tabId: 'sqlite',
        label: 'SQLite Artifact Explorer',
        desc: 'Browser profile — chat history — mobile backups — query in-browser via WASM.',
        compVar: 'SqliteExplorer',
      },
      {
        path: '/dfir/ios-backup',
        tabId: 'ios-backup',
        label: 'iOS Backup Explorer',
        desc: 'Manifest.db — plists — SQLite artifacts from a local iTunes backup.',
        compVar: 'IosBackupExplorer',
      },

      {
        path: '/dfir/web-log',
        tabId: 'web-log',
        label: 'Web Server Log Analyzer',
        desc: 'Apache — nginx — IIS access logs — anomaly detection + pivots.',
        compVar: 'WebLogAnalyzer',
      },
      {
        path: '/dfir/prefetch',
        tabId: 'prefetch',
        label: 'Prefetch Analyzer Lite',
        desc: 'Parse Windows Prefetch files — execution evidence, run count, last run time.',
        compVar: 'PrefetchAnalyzer',
      },
      {
        path: '/dfir/regscope',
        tabId: 'regscope',
        label: 'REGSCOPE Registry Analyzer',
        desc: 'Multi-hive registry scope: persistence, autoruns, services, scheduled tasks.',
        compVar: 'Regscope',
        badge: 'new',
        keywords: ['registry', 'persistence', 'autoruns'],
      },
    ],
  },
  {
    id: 'domain-network',
    label: 'Domain & Network',
    blurb:
      'WHOIS, DNS, reputation, certificates, and infrastructure pivots - passive reconnaissance, no active scanning.',
    icon: Globe,
    tone: 'text-cyan-700 dark:text-cyan-300 border-cyan-500/30 bg-cyan-500/10',
    pages: [
      {
        path: '/dfir/domain-investigator',
        tabId: 'domain-investigator',
        label: 'Domain Investigator',
        desc: 'Cross-source domain investigation hub — 6 aliases route here (domain-rep, webcheck, etc.).',
        compVar: 'DomainInvestigator',
      },
      {
        path: '/dfir/whois-history',
        tabId: 'whois-history',
        label: 'WHOIS History Explorer',
        desc: 'Historical WHOIS pivots — registrant, nameserver, status changes.',
        compVar: 'WhoisHistory',
      },
      {
        path: '/dfir/asn',
        tabId: 'asn',
        label: 'ASN Lookup',
        desc: 'ASN details — prefix ranges — peer relationships.',
        compVar: 'AsnLookup',
      },
      {
        path: '/dfir/cert-search',
        tabId: 'cert-search',
        label: 'Certificate Search',
        desc: 'crt.sh-style CT log search for a domain — subdomains — cert chain.',
        compVar: 'CertSearch',
      },
      {
        path: '/dfir/takeover',
        tabId: 'takeover',
        label: 'Subdomain Takeover',
        desc: 'Detect dangling DNS records vulnerable to subdomain takeover.',
        compVar: 'Takeover',
      },
      {
        path: '/dfir/dnscope',
        tabId: 'dnscope',
        label: 'DNSCOPE Infrastructure Map',
        desc: "Graph view of a domain's nameservers, mail servers, and cross-delegations",
        compVar: 'Dnscope',
        badge: 'new',
        keywords: ['dns', 'infrastructure', 'graph', 'nameserver'],
      },
      {
        path: '/dfir/host-graph',
        tabId: 'host-graph',
        label: 'Host Graph',
        desc: 'Graph of related domains, IPs, and ASNs for a target.',
        compVar: 'HostGraph',
      },
      {
        path: '/dfir/wayback',
        tabId: 'wayback',
        label: 'Wayback Machine',
        desc: 'Search historical snapshots for a URL — changes over time.',
        compVar: 'Wayback',
      },
      {
        path: '/dfir/ip-geo',
        tabId: 'ip-geo',
        label: 'IP Geolocation',
        desc: 'IP — country / city / ASN / org / hosting type.',
        compVar: 'IpGeo',
      },
      {
        path: '/dfir/passive-dns',
        tabId: 'passive-dns',
        label: 'Passive DNS',
        desc: 'Historical DNS resolution data for infrastructure tracking — migrations + fast-flux detection.',
        compVar: 'PassiveDns',
        badge: 'new',
        keywords: ['passive dns', 'pdns', 'infrastructure', 'fast-flux', 'migration'],
      },
    ],
  },
  {
    id: 'asset-attack',
    label: 'Asset & Attack Surface',
    blurb:
      'Exposed-host analysis, asset intelligence, and web vulnerability scanning - see what an attacker would see.',
    icon: Server,
    tone: 'text-sky-700 dark:text-sky-300 border-sky-500/30 bg-sky-500/10',
    pages: [
      {
        path: '/dfir/asset-intel',
        tabId: 'asset-intel',
        label: 'Asset Intelligence',
        desc: 'Aggregate asset inventory — domains, subdomains, services, certificates.',
        compVar: 'AssetIntel',
      },
      {
        path: '/dfir/exposed-host',
        tabId: 'exposed-host',
        label: 'Exposed Host',
        desc: 'Per-host exposure score and evidence — services, versions, CVEs.',
        compVar: 'ExposedHostPage',
      },
      {
        path: '/dfir/open-directory',
        tabId: 'open-directory',
        label: 'Open Directory Scanner',
        desc: 'Detect misconfigured web servers exposing file listings.',
        compVar: 'OpenDirectory',
      },

      {
        path: '/dfir/url-preview',
        tabId: 'url-preview',
        label: 'URL Preview',
        desc: 'Safe, sandboxed preview of a URL — headers, redirects, screenshot.',
        compVar: 'UrlPreview',
      },
    ],
  },
  {
    id: 'email',
    label: 'Email Security',
    blurb:
      'Phishing analysis, BEC defense, and email authentication audits - SPF / DKIM / DMARC / BIMI without sending data off-host.',
    icon: Mail,
    tone: 'text-indigo-700 dark:text-indigo-300 border-indigo-500/30 bg-indigo-500/10',
    pages: [
      {
        path: '/dfir/email-defense',
        tabId: 'email-defense',
        label: 'Email Defense',
        desc: 'SPF / DKIM / DMARC / BIMI audit with failure modes called out.',
        compVar: 'EmailDefense',
      },
      {
        path: '/dfir/phishing',
        tabId: 'phishing',
        label: 'Phishing Analyzer',
        desc: 'URL + sender + header analysis with risk score.',
        compVar: 'Phishing',
      },
      {
        path: '/dfir/dmarc-analyzer',
        tabId: 'dmarc-analyzer',
        label: 'DMARC Analyzer',
        desc: 'Parse a DMARC aggregate report (RUA) — alignment, volume, failures.',
        compVar: 'DmarcAnalyzer',
      },
      {
        path: '/dfir/eml',
        tabId: 'eml',
        label: 'EML Extractor',
        desc: 'Headers — body — attachments — URL / hash extraction from a .eml file.',
        compVar: 'EmlExtractor',
      },
      {
        path: '/dfir/email-deliverability',
        tabId: 'email-deliverability',
        label: 'Email Deliverability Tester',
        desc: 'Paste or upload a raw .eml to get spam score, SPF/DKIM/DMARC alignment, and inbox-placement suggestions.',
        compVar: 'EmailDeliverability',
      },
      {
        path: '/dfir/email-rep',
        tabId: 'email-rep',
        label: 'Email Reputation',
        desc: 'Sender domain + IP reputation with deliverability signals.',
        compVar: 'EmailReputation',
      },
      {
        path: '/dfir/phishbook',
        tabId: 'phishbook',
        label: 'PhishBook',
        desc: 'Curated playbook of phishing patterns, lures, and IOCs.',
        compVar: 'PhishBook',
      },
      {
        path: '/dfir/phishops',
        tabId: 'phishops',
        label: 'PHISHOPS',
        desc: 'Phishing-as-a-service operator catalog and tracking.',
        compVar: 'PhishOps',
        keywords: ['phishing', 'paas', 'operator'],
      },
      {
        path: '/dfir/url-rep',
        tabId: 'url-rep',
        label: 'URL Reputation',
        desc: 'Cross-source URL reputation — PhishTank, OpenPhish, Google Safe Browsing.',
        compVar: 'UrlReputation',
      },
    ],
  },
  {
    id: 'identity-osint',
    label: 'Identity & OSINT',
    blurb: 'Username, email, phone, image, and social reconnaissance - cross-platform pivots for a single subject.',
    icon: AtSign,
    tone: 'text-violet-700 dark:text-violet-300 border-violet-500/30 bg-violet-500/10',
    pages: [
      {
        path: '/dfir/username-investigator',
        tabId: 'username-investigator',
        label: 'Username Investigator (alias)',
        desc: 'Alias of /dfir/username — the canonical page.',
        compVar: 'UsernameInvestigator',
      },

      {
        path: '/dfir/phone-osint',
        tabId: 'phone-osint',
        label: 'Phone OSINT',
        desc: 'Phone number — carrier, country, line type, breach presence.',
        compVar: 'PhoneOsint',
      },
      {
        path: '/dfir/weather-osint',
        tabId: 'weather-osint',
        label: 'Weather OSINT',
        desc: 'Reverse geocoding + historical weather for a timestamp + coordinates.',
        compVar: 'WeatherOsint',
      },
      {
        path: '/dfir/socmint',
        tabId: 'socmint',
        label: 'SOCMINT',
        desc: 'Social-media intelligence — X / Reddit / Telegram / Mastodon pivots.',
        compVar: 'Socmint',
      },
      {
        path: '/dfir/osint-mapper',
        tabId: 'osint-mapper',
        label: 'OSINT Mapper',
        desc: 'Build a mind-map of an investigation — nodes are entities, edges are pivots.',
        compVar: 'OsintMapper',
      },
      {
        path: '/dfir/breach',
        tabId: 'breach',
        label: 'Breach Lookup',
        desc: 'Email / username / domain — cross-correlate public breach corpora.',
        compVar: 'Breach',
      },
      {
        path: '/dfir/reverse-image',
        tabId: 'reverse-image',
        label: 'Reverse Image Search',
        desc: 'Multi-engine reverse image — Google, Yandex, TinEye, Bing.',
        compVar: 'ReverseImage',
      },
      {
        path: '/dfir/brand-impersonation',
        tabId: 'brand-impersonation',
        label: 'Brand Impersonation',
        desc: 'Detect typosquats / look-alike domains targeting your brand.',
        compVar: 'BrandImpersonation',
      },
      {
        path: '/dfir/image-fingerprint',
        tabId: 'image-fingerprint',
        label: 'Image Fingerprint',
        desc: 'Perceptual hash (pHash, dHash) for image clustering & de-duplication.',
        compVar: 'ImageFingerprint',
      },
      {
        path: '/dfir/screenshot-intel',
        tabId: 'screenshot-intel',
        label: 'Screenshot Intel',
        desc: 'Extract text + URLs + indicators from a screenshot — OCR pipeline.',
        compVar: 'ScreenshotIntel',
      },
    ],
  },
  {
    id: 'vuln',
    label: 'Vulnerabilities',
    blurb: 'CVE lookup, prioritisation, exploit intel, and dependency scanning - know what to patch first.',
    icon: AlertTriangle,
    tone: 'text-yellow-700 dark:text-yellow-300 border-yellow-500/30 bg-yellow-500/10',
    pages: [
      {
        path: '/dfir/cve',
        tabId: 'cve',
        label: 'CVE Lookup',
        desc: 'Single-CVE detail — NVD, KEV, EPSS, exploit availability.',
        compVar: 'Cve',
      },
      {
        path: '/dfir/cve-prioritizer',
        tabId: 'cve-prioritizer',
        label: 'CVE Prioritizer',
        desc: 'CVSS + EPSS + KEV + ransomware-use — single patch-priority call.',
        compVar: 'CvePrioritizer',
      },
      {
        path: '/dfir/vuln-toolkit',
        tabId: 'vuln-toolkit',
        label: 'CVE Resources Catalog',
        desc: 'Curated list of CVE databases, exploit trackers, vendor PSIRTs.',
        compVar: 'VulnToolkitCatalog',
      },
      {
        path: '/dfir/osv-scan',
        tabId: 'osv-scan',
        label: 'OSV Dependency Scan',
        desc: 'Paste a manifest.json / package-lock / requirements.txt — known vulns.',
        compVar: 'OsvScanner',
      },
    ],
  },
  {
    id: 'detection',
    label: 'Detection Engineering',
    blurb: 'Author, convert, and test detection rules - Sigma, KQL, SPL, YARA, ATT&CK mapping, hunting queries.',
    icon: Shield,
    tone: 'text-blue-700 dark:text-blue-300 border-blue-500/30 bg-blue-500/10',
    pages: [
      {
        path: '/dfir/rule-converter',
        tabId: 'rule-converter',
        label: 'Rule Converter',
        desc: 'Sigma — KQL — SPL — YARA via one canonical IR.',
        compVar: 'RuleConverter',
      },

      {
        path: '/dfir/yara-workbench',
        tabId: 'yara-workbench',
        label: 'YARA Workbench',
        desc: 'Collaborative YARA editor with malware test corpus.',
        compVar: 'YaraWorkbench',
      },

      {
        path: '/dfir/threat-graph',
        tabId: 'threat-graph',
        label: 'Threat Graph',
        desc: 'Indicator — relationship graph — visual pivot from any node.',
        compVar: 'ThreatGraph',
      },
      {
        path: '/dfir/attmap-ai',
        tabId: 'attmap-ai',
        label: 'ATTMAP-AI',
        desc: 'AI-assisted mapping of detection rules to ATT&CK techniques.',
        compVar: 'AttmapAi',
        badge: 'new',
        keywords: ['att&ck', 'mapping', 'mitre', 'ai'],
      },
      {
        path: '/dfir/hunting-query-generator',
        tabId: 'hunting-query-generator',
        label: 'Hunting Query Generator',
        desc: 'AI-assisted KQL / SPL / Lucene generation from a hypothesis.',
        compVar: 'HuntingQueryGenerator',
      },
      {
        path: '/dfir/ai-rule-generator',
        tabId: 'ai-rule-generator',
        label: 'AI Rule Generator',
        desc: 'Generate a Sigma/YARA rule from a natural-language description.',
        compVar: 'AiRuleGenerator',
      },
      {
        path: '/dfir/fp-lens',
        tabId: 'fp-lens',
        label: 'FP Lens',
        desc: 'False-positive analyst — score a detection against historical FPs.',
        compVar: 'FpLens',
      },
      {
        path: '/dfir/ir-playbooks',
        tabId: 'ir-playbooks',
        label: 'IR Playbooks',
        desc: 'Step-by-step playbooks for common incident types.',
        compVar: 'IrPlaybooks',
      },
      {
        path: '/dfir/tools/about',
        tabId: 'tools-about',
        label: 'Tools About',
        desc: 'About the DFIR toolkit — principles, design, and feature flags.',
        compVar: 'ToolsAbout',
      },
      {
        path: '/dfir/tracerules',
        tabId: 'tracerules',
        label: 'TRACERULES',
        desc: 'Trace a rule back to its source intel — coverage and lineage.',
        compVar: 'Tracerules',
        badge: 'new',
        keywords: ['rule', 'lineage', 'trace', 'intel'],
      },
    ],
  },
  {
    id: 'stix-taxii',
    label: 'STIX / TAXII',
    blurb: 'STIX 2.1 bundle builder, TAXII server, and viewable graph - interoperable CTI artefacts.',
    icon: Share2,
    tone: 'text-teal-700 dark:text-teal-300 border-teal-500/30 bg-teal-500/10',
    pages: [
      {
        path: '/dfir/stix-workbench',
        tabId: 'stix-workbench',
        label: 'STIX Workbench',
        desc: 'Build, view, and export STIX 2.x bundles (canonical entry — /dfir/stix, /dfir/stix-builder, /dfir/taxii, /dfir/report-ingest all redirect here).',
        compVar: 'StixWorkbench',
      },
    ],
  },
  {
    id: 'cloud',
    label: 'Cloud Security',
    blurb: 'IAM, network, secrets, and configuration analysis for AWS, GCP, Azure, and Kubernetes.',
    icon: Cloud,
    tone: 'text-blue-700 dark:text-blue-300 border-blue-500/30 bg-blue-500/10',
    pages: [
      {
        path: '/dfir/iam-analyzer',
        tabId: 'iam-analyzer',
        label: 'AWS IAM Analyzer',
        desc: 'Parse a downloaded IAM policy — find privilege escalation paths.',
        compVar: 'IamPolicyAnalyzer',
      },
      {
        path: '/dfir/gcp-iam',
        tabId: 'gcp-iam',
        label: 'GCP IAM Analyzer',
        desc: 'GCP IAM policy + role analyzer.',
        compVar: 'GcpIamAnalyzer',
      },
      {
        path: '/dfir/azure-rbac',
        tabId: 'azure-rbac',
        label: 'Azure RBAC Analyzer',
        desc: 'Azure RBAC role assignments — least-privilege check.',
        compVar: 'AzureRbacAnalyzer',
      },
      {
        path: '/dfir/sg-analyzer',
        tabId: 'sg-analyzer',
        label: 'Security Group Analyzer',
        desc: 'AWS security group visualizer — 0.0.0.0/0 + port exposure heatmap.',
        compVar: 'SecurityGroupAnalyzer',
      },
      {
        path: '/dfir/cloudtrail-triage',
        tabId: 'cloudtrail-triage',
        label: 'CloudTrail Triage',
        desc: 'Filter CloudTrail logs for an incident timeframe — IAM, EC2, S3, KMS.',
        compVar: 'CloudTrailTriage',
      },
      {
        path: '/dfir/k8s-rbac',
        tabId: 'k8s-rbac',
        label: 'K8s RBAC Analyzer',
        desc: 'Kubernetes Role/ClusterRole analyzer — risky verbs, secrets access.',
        compVar: 'K8sRbacAnalyzer',
      },
      {
        path: '/dfir/terraform-scan',
        tabId: 'terraform-scan',
        label: 'Terraform Scanner',
        desc: 'Static analysis of HCL — misconfigurations + drift.',
        compVar: 'TerraformScanner',
      },
      {
        path: '/dfir/nhi',
        tabId: 'nhi',
        label: 'Non-Human Identity (NHI)',
        desc: 'Catalogue service accounts, API keys, OAuth grants.',
        compVar: 'Nhi',
      },
      {
        path: '/dfir/zero-trust-ai-agents',
        tabId: 'zero-trust-ai-agents',
        label: 'Zero-Trust AI Agents',
        desc: 'Verify identity + intent for autonomous agent actions.',
        compVar: 'ZeroTrustAiAgents',
        keywords: ['zero trust', 'agent', 'identity'],
      },
    ],
  },
  {
    id: 'ai-security',
    label: 'AI Security',
    blurb: 'LLM red-teaming, prompt-injection defense, MCP audit, and agent attack-surface analysis.',
    icon: Sparkles,
    tone: 'text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/10',
    pages: [
      {
        path: '/dfir/prompt-injection',
        tabId: 'prompt-injection',
        label: 'Prompt Injection',
        desc: 'Test a prompt against a curated set of injection payloads.',
        compVar: 'PromptInjection',
      },
      {
        path: '/dfir/mcp-audit',
        tabId: 'mcp-audit',
        label: 'MCP Audit',
        desc: 'Audit a Model Context Protocol server for tool-poisoning vectors.',
        compVar: 'McpAudit',
      },
      {
        path: '/dfir/agent',
        tabId: 'agent',
        label: 'Agent Investigator',
        desc: 'Investigate an autonomous agent — tool calls, prompt history, exfil.',
        compVar: 'AgentInvestigator',
      },
      {
        path: '/dfir/agent-map',
        tabId: 'agent-map',
        label: 'Agent Map',
        desc: "Visualise an agent's reachable tools and data sources",
        compVar: 'AgentMap',
      },
      {
        path: '/dfir/insight-ai',
        tabId: 'insight-ai',
        label: 'INSIGHT-AI',
        desc: 'AI-assisted incident summarisation and pattern detection.',
        compVar: 'InsightAi',
      },
      {
        path: '/dfir/querycraft-ai',
        tabId: 'querycraft-ai',
        label: 'QUERYCRAFT-AI',
        desc: 'AI-assisted KQL / SPL / Lucene generation.',
        compVar: 'QuerycraftAi',
      },
      {
        path: '/dfir/chrono-ai',
        tabId: 'chrono-ai',
        label: 'CHRONO-AI',
        desc: 'AI-assisted timeline reconstruction from logs + reports.',
        compVar: 'ChronoAi',
      },
      {
        path: '/dfir/malbrief-ai',
        tabId: 'malbrief-ai',
        label: 'MALBRIEF-AI',
        desc: 'AI-assisted malware family briefing from sample + sandbox output.',
        compVar: 'MalbriefAi',
      },
      {
        path: '/dfir/verdikt-ai',
        tabId: 'verdikt-ai',
        label: 'VERDIKT-AI',
        desc: 'AI-assisted IOC verdict — explain cross-source disagreement.',
        compVar: 'VerdiktAi',
      },
    ],
  },
  {
    id: 'api',
    label: 'API & Application Security',
    blurb: 'OpenAPI, GraphQL, JWT, secrets, and headers - application-layer security analysis.',
    icon: Code2,
    tone: 'text-lime-700 dark:text-lime-300 border-lime-500/30 bg-lime-500/10',
    pages: [
      {
        path: '/dfir/openapi-audit',
        tabId: 'openapi-audit',
        label: 'OpenAPI Auditor',
        desc: 'Lint an OpenAPI spec — missing auth, schema issues, PII exposure.',
        compVar: 'OpenApiAuditor',
      },
      {
        path: '/dfir/graphql-audit',
        tabId: 'graphql-audit',
        label: 'GraphQL Auditor',
        desc: 'Introspection + query depth/complexity + authz analysis.',
        compVar: 'GraphqlAuditor',
      },
      {
        path: '/dfir/jwt',
        tabId: 'jwt',
        label: 'JWT Inspector',
        desc: 'Decode — verify — alg-confusion check — claim analysis.',
        compVar: 'JwtInspect',
      },
      {
        path: '/dfir/sec-headers',
        tabId: 'sec-headers',
        label: 'Security Headers Analyzer',
        desc: 'CORS — CSP — HSTS — X-Frame-Options — graded report.',
        compVar: 'SecHeadersAnalyzer',
      },
      {
        path: '/dfir/sec-headers-live',
        tabId: 'sec-headers-live',
        label: 'Live Security Headers',
        desc: 'Third-party live HSTS/CSP/X-Frame-Options scan via IntoDNS.ai with ready-to-paste Nginx/Apache/Caddy/Cloudflare configs.',
        compVar: 'SecHeadersLive',
      },
      {
        path: '/dfir/secret-scan',
        tabId: 'secret-scan',
        label: 'Secret Scanner',
        desc: 'Scan a text blob / repo for API keys, tokens, private keys.',
        compVar: 'SecretScanner',
      },
      {
        path: '/dfir/google-dorks',
        tabId: 'google-dorks',
        label: 'Google Dorks Builder',
        desc: 'Compose a Google dork for a target — site:, inurl:, filetype:.',
        compVar: 'GoogleDorks',
      },

      {
        path: '/dfir/log-parser',
        tabId: 'log-parser',
        label: 'Log Parser',
        desc: 'Generic log parser — pattern detection + anomaly highlighting.',
        compVar: 'LogParser',
      },
    ],
  },
  {
    id: 'copilot',
    label: 'AI Copilot & Investigation',
    blurb: 'Conversational copilots and AI-assisted investigation workbenches - natural-language pivots.',
    icon: Bot,
    tone: 'text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/10',
    pages: [
      {
        path: '/dfir/copilot',
        tabId: 'copilot',
        label: 'DFIR Copilot',
        desc: 'Conversational copilot — ask in plain English, get a runbook.',
        compVar: 'DfirCopilotPage',
      },
      {
        path: '/dfir/multi-search',
        tabId: 'multi-search',
        label: 'Multi-Search',
        desc: 'Query 30+ intel sources in parallel — paste an IOC or entity.',
        compVar: 'MultiSearch',
      },

      {
        path: '/dfir/tracer',
        tabId: 'tracer',
        label: 'TRACER',
        desc: 'Cross-chain transaction tracer for AML and ransomware investigations.',
        compVar: 'Tracer',
      },
      {
        path: '/dfir/tracepulse',
        tabId: 'tracepulse',
        label: 'TRACEPULSE',
        desc: 'Real-time crypto flow monitor — alerts on suspicious wallet activity.',
        compVar: 'Tracepulse',
        keywords: ['crypto', 'pulse', 'monitor'],
      },
      {
        path: '/dfir/quicktrace',
        tabId: 'quicktrace',
        label: 'QUICKTRACE',
        desc: 'Quick lookup for a crypto address or transaction hash.',
        compVar: 'Quicktrace',
      },
      {
        path: '/dfir/pivex',
        tabId: 'pivex',
        label: 'PIVEX',
        desc: 'Pivot explorer — graph-style pivots from any entity.',
        compVar: 'Pivex',
        keywords: ['pivot', 'explorer', 'graph'],
      },
    ],
  },
  {
    id: 'reports',
    label: 'Reports & Export',
    blurb: 'Draft investigation reports, ingest external reports, and export IOCs to any standard format.',
    icon: ScrollText,
    tone: 'text-pink-700 dark:text-pink-300 border-pink-500/30 bg-pink-500/10',
    pages: [
      {
        path: '/dfir/report-analyzer',
        tabId: 'report-analyzer',
        label: 'Report Analyzer',
        desc: 'AI summary — IOC extraction — MITRE TTP mapping — STIX bundle.',
        compVar: 'ReportAnalyzer',
      },
      {
        path: '/dfir/report-composer',
        tabId: 'report-composer',
        label: 'Report Composer',
        desc: 'Cover — summary — findings — IOCs — sources — TLP — export to PDF/DOCX.',
        compVar: 'ReportComposer',
      },

      {
        path: '/dfir/export-hub',
        tabId: 'export-hub',
        label: 'Export Hub',
        desc: 'Export IOCs to STIX 2.1, MISP, Sigma, YARA, Snort, Suricata, CSV.',
        compVar: 'ExportHub',
      },
      {
        path: '/dfir/blocklists',
        tabId: 'blocklists',
        label: 'Blocklist Export',
        desc: 'Generate network blocklists (pfSense, MikroTik, Cisco) from IOCs.',
        compVar: 'Blocklists',
      },
    ],
  },
  {
    id: 'dark-web',
    label: 'Dark Web & Privacy',
    blurb: 'PGP, Tor, and dark-web workbench - the on-ramp and off-ramp tooling for sensitive investigations.',
    icon: Lock,
    tone: 'text-slate-700 dark:text-slate-300 border-slate-500/30 bg-slate-500/10',
    pages: [
      {
        path: '/dfir/pgp-tool',
        tabId: 'pgp-tool',
        label: 'PGP Tool',
        desc: 'Generate — encrypt — sign — verify PGP messages in-browser.',
        compVar: 'PgpTool',
      },
      {
        path: '/dfir/tor-gateway',
        tabId: 'tor-gateway',
        label: 'Tor Gateway',
        desc: 'Browser-routed Tor gateway for safe .onion lookups.',
        compVar: 'TorGateway',
      },
      {
        path: '/dfir/privacy',
        tabId: 'privacy',
        label: 'Privacy Toolkit',
        desc: 'Privacy hygiene: tracker audit, browser fingerprint, cookie analysis.',
        compVar: 'Privacy',
      },
    ],
  },
  {
    id: 'grc',
    label: 'GRC & Posture',
    blurb: 'Compliance, maturity, tabletop exercises, and reference frameworks - policy and posture.',
    icon: Scale,
    tone: 'text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    pages: [
      {
        path: '/dfir/grc',
        tabId: 'grc',
        label: 'GRC Toolkit',
        desc: 'Control mapping — risk register — vendor assessment.',
        compVar: 'Grc',
      },
      {
        path: '/dfir/lolbins',
        tabId: 'lolbins',
        label: 'LOLBins',
        desc: 'Living-off-the-land binaries — search by binary or behaviour.',
        compVar: 'Lolbins',
      },
      {
        path: '/dfir/data-classification',
        tabId: 'data-classification',
        label: 'Data Classification',
        desc: 'Tag data with sensitivity + handling requirements.',
        compVar: 'DataClassification',
      },
      {
        path: '/dfir/privacy-hub',
        tabId: 'privacy-hub',
        label: 'Privacy Hub',
        desc: 'GDPR / CCPA references, DPIA templates, privacy notice generator.',
        compVar: 'PrivacyHub',
      },
      {
        path: '/dfir/personal-security',
        tabId: 'personal-security',
        label: 'Personal Security',
        desc: 'OPSEC checklist — threat-modelling for individuals.',
        compVar: 'PersonalSecurity',
      },
      {
        path: '/dfir/dlp-scan',
        tabId: 'dlp-scan',
        label: 'DLP Scan',
        desc: 'Data-loss-prevention scan for files + clipboard + screenshots.',
        compVar: 'DlpScan',
      },
      {
        path: '/dfir/linux-triage',
        tabId: 'linux-triage',
        label: 'Linux IR Triage',
        desc: 'Bash one-liners for live Linux incident response.',
        compVar: 'LinuxTriage',
      },
    ],
  },
  {
    id: 'frameworks',
    label: 'Frameworks & Models',
    blurb:
      'Reference frameworks, attack models, and visual matrices analysts use to structure intrusions and security programs.',
    icon: Workflow,
    tone: 'text-indigo-700 dark:text-indigo-300 border-indigo-500/30 bg-indigo-500/10',
    pages: [
      {
        path: '/dfir/attack-navigator',
        tabId: 'attack-navigator',
        label: 'ATT&CK Navigator',
        desc: 'Layered ATT&CK matrix — coverage heatmap, gap analysis.',
        compVar: 'AttackNavigator',
      },
      {
        path: '/dfir/attack-chain',
        tabId: 'attack-chain',
        label: 'Attack Chain',
        desc: 'Visualise a multi-stage attack as a connected kill-chain.',
        compVar: 'AttackChain',
      },
      {
        path: '/dfir/kill-chain',
        tabId: 'kill-chain',
        label: 'Cyber Kill Chain',
        desc: 'Lockheed Martin 7-phase kill chain with ATT&CK cross-links.',
        compVar: 'KillChain',
      },
      {
        path: '/dfir/diamond',
        tabId: 'diamond',
        label: 'Diamond Model',
        desc: 'Adversary — capability — infrastructure — victim — reference.',
        compVar: 'Diamond',
      },
      {
        path: '/dfir/owasp',
        tabId: 'owasp',
        label: 'OWASP Top 10',
        desc: 'Web 2021 — API 2023 — LLM 2025 reference + checklist.',
        compVar: 'Owasp',
      },
      {
        path: '/dfir/mitre-matrix',
        tabId: 'mitre-matrix',
        label: 'MITRE Matrix',
        desc: 'Static reference view of the MITRE ATT&CK matrix with tactic/technique lookup.',
        compVar: 'MitreMatrix',
      },
      {
        path: '/dfir/tabletop',
        tabId: 'tabletop',
        label: 'Tabletop Exercises',
        desc: 'Scenario-driven tabletop exercises — pick a scenario, run it.',
        compVar: 'Tabletop',
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Lookup helpers                                                     */
/* ------------------------------------------------------------------ */

const HUB_BY_ID = new Map(HUB_META.map((h) => [h.id, h]));
const PAGE_BY_PATH = new Map<string, { hub: HubMeta; page: HubPage }>();
for (const hub of HUB_META) {
  for (const page of hub.pages) {
    PAGE_BY_PATH.set(page.path, { hub, page });
  }
}

export function getHub(id: string): HubMeta | undefined {
  return HUB_BY_ID.get(id);
}

export function getPageByPath(path: string): { hub: HubMeta; page: HubPage } | undefined {
  return PAGE_BY_PATH.get(path);
}

export function getAllPages(): Array<{ hub: HubMeta; page: HubPage }> {
  return Array.from(PAGE_BY_PATH.values());
}

export function flattenPages(): Array<HubPage & { hub: HubMeta }> {
  const out: Array<HubPage & { hub: HubMeta }> = [];
  for (const hub of HUB_META) {
    for (const page of hub.pages) {
      out.push({ ...page, hub });
    }
  }
  return out;
}
