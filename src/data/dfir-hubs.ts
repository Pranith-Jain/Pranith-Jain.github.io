/**
 * Canonical registry of every routable page in the DFIR / security toolkit area.
 *
 * Mirrors `data/threatintel-hubs.ts` - the threat-intel area was consolidated
 * onto this pattern in commit 6f7d055b (2026-06-17); this file is the same
 * shape for the DFIR section so both apps share a navigation system.
 *
 * Each "hub" is a category of related pages. Pages live at their own direct
 * URL (/dfir/<hub-id>/<tab-id>). There is no /dfir/<hub-id> landing page in
 * between - the /dfir/catalog page is the single navigation surface for
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
  ScanLine,
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
    ],
  },
  {
    id: 'ioc-triage',
    label: 'IOC Triage',
    blurb:
      'Check, extract, and track indicators across 60+ sources - IP, domain, URL, hash pivots with cross-source consensus.',
    icon: Crosshair,
    tone: 'text-rose-700 dark:text-rose-300 border-rose-500/30 bg-rose-500/10',
    pages: [
      {
        path: '/dfir/ioc-investigate',
        tabId: 'ioc-investigate',
        label: 'IOC Investigator',
        desc: 'Cross-source investigation hub - paste any indicator type and pivot across all sources.',
        compVar: 'IocInvestigate',
      },

      {
        path: '/dfir/extract',
        tabId: 'extract',
        label: 'IOC Extractor',
        desc: 'Pull IOCs from any text blob - refang-aware.',
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
      {
        path: '/dfir/oss-feeds',
        tabId: 'oss-feeds',
        label: 'OSS Feed Registry',
        desc: 'Curated catalog of 145+ free open-source threat intel feeds - IP, DNS, URL, hash, CVE, JA3, and more. Search by vendor, category, or keyword.',
        compVar: 'OssFeeds',
        badge: 'new',
        keywords: ['feed', 'ioc', 'threat intel', 'open source', 'catalog', 'ip', 'dns', 'url', 'hash', 'cve', 'ja3'],
      },
      {
        path: '/dfir/orkl',
        tabId: 'orkl',
        label: 'ORKL Library Search',
        desc: 'Search the ORKL open-source threat intelligence library - reports, actors, CVEs from hundreds of sources.',
        compVar: 'OrklPage',
        keywords: ['orkl', 'threat intelligence', 'library', 'reports'],
      },
      {
        path: '/dfir/traceix',
        tabId: 'traceix',
        label: 'Traceix Hash Lookup',
        desc: 'SHA-256 hash reputation lookup via Traceix - per-engine antivirus/AV verdicts (Safe/Malicious/Unknown).',
        compVar: 'TraceixPage',
      },
      {
        path: '/dfir/url-risk',
        tabId: 'url-risk',
        label: 'URL Risk Analyzer',
        desc: 'Multi-source URL risk scoring - static signals + VirusTotal, Safe Browsing, URLScan, AbuseIPDB and WHOIS-age correlation (IntelX framework port). 0-100 score with evidence chain.',
        compVar: 'UrlRiskPage',
        badge: 'new',
        keywords: ['url', 'risk', 'phishing', 'virustotal', 'safe browsing', 'urlscan', 'abuseipdb', 'whois', 'score'],
      },
      {
        path: '/dfir/whoxy',
        tabId: 'whoxy',
        label: 'Whoxy Reverse WHOIS',
        desc: 'Reverse WHOIS lookup via Whoxy - find all domains registered by an email, name, company, or keyword.',
        compVar: 'WhoxyPage',
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
        desc: 'Parse RedLine / Raccoon / Vidar / LummaC stealer logs - credentials, system, browser data.',
        compVar: 'StealerParser',
      },

      {
        path: '/dfir/bloom',
        tabId: 'bloom',
        label: 'Bloom Filter Lookup',
        desc: 'Membership-test against a corpus of known-bad indicators.',
        compVar: 'BloomFilter',
      },
      {
        path: '/dfir/infostealer-intel',
        tabId: 'infostealer-intel',
        label: 'Infostealer Intelligence',
        desc: 'Infostealer-specific intelligence dashboard - prevalent families, log types, and compromised credential tracking.',
        compVar: 'InfostealerIntel',
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
        path: '/dfir/codec',
        tabId: 'codec',
        label: 'Codec Hub',
        desc: 'Decode and encode across base64, hex, URL, rot13, zlib, gzip with auto-detection.',
        compVar: 'CodecHub',
        keywords: ['decode', 'encode', 'base64', 'hex', 'url', 'rot13', 'zlib', 'gzip'],
      },

      {
        path: '/dfir/hash-calc',
        tabId: 'hash-calc',
        label: 'Hash Calculator',
        desc: 'MD5 - SHA1 - SHA256 - SHA512 - SSDEEP - TLSH - drag a file in.',
        compVar: 'HashCalculator',
      },
      {
        path: '/dfir/timestamp',
        tabId: 'timestamp',
        label: 'Timestamp Converter',
        desc: 'Epoch - Windows FILETIME - Unix - human - bidirectional.',
        compVar: 'TimestampConverter',
      },
      {
        path: '/dfir/pe',
        tabId: 'pe',
        label: 'PE Static Analyzer Lite',
        desc: 'Sections, imports, exports, version info - 0x12 lite profile.',
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
        desc: 'EXIF - IPTC - XMP - MakerNotes - camera, GPS, software fingerprints.',
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
        desc: 'Visualise IDN homograph attacks - Cyrillic vs Latin lookalikes.',
        compVar: 'Punycode',
      },
      {
        path: '/dfir/powershell-deobf',
        tabId: 'powershell-deobf',
        label: 'PowerShell Deobfuscator',
        desc: 'Unroll encoded / base64 / invoke-expression chains - step by step.',
        compVar: 'PowershellDeobf',
      },
      {
        path: '/dfir/powershell-analyzer',
        tabId: 'powershell-analyzer',
        label: 'PowerShell Security Analyzer',
        desc: 'Static-analysis a PowerShell script for malicious behavior - 250+ signatures, MITRE ATT&CK mapping, IOC extraction, obfuscation scoring, risk score, 100% client-side.',
        compVar: 'PowershellAnalyzer',
        badge: 'new',
        keywords: ['powershell', 'malware', 'obfuscation', 'ioc', 'mitre', 'static analysis', 'script'],
      },
      {
        path: '/dfir/file',
        tabId: 'file',
        label: 'File Analyzer',
        desc: 'Upload a file - extract metadata, hashes, strings, and embedded indicators.',
        compVar: 'FileAnalyzer',
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
        desc: 'Protocol breakdown - top talkers - DNS / HTTP / TLS summaries.',
        compVar: 'PcapTriage',
      },
      {
        path: '/dfir/registry-hive',
        tabId: 'registry-hive',
        label: 'Registry Hive Explorer',
        desc: 'Browse - search - diff Windows registry hives offline.',
        compVar: 'RegistryHive',
      },
      {
        path: '/dfir/evtx',
        tabId: 'evtx',
        label: 'EVTX Parser Lite',
        desc: 'Parse Windows Event Log files - event IDs, channels, time-range filter.',
        compVar: 'EvtxParser',
      },
      {
        path: '/dfir/sqlite',
        tabId: 'sqlite',
        label: 'SQLite Artifact Explorer',
        desc: 'Browser profile - chat history - mobile backups - query in-browser via WASM.',
        compVar: 'SqliteExplorer',
      },
      {
        path: '/dfir/ios-backup',
        tabId: 'ios-backup',
        label: 'iOS Backup Explorer',
        desc: 'Manifest.db - plists - SQLite artifacts from a local iTunes backup.',
        compVar: 'IosBackupExplorer',
      },

      {
        path: '/dfir/web-log',
        tabId: 'web-log',
        label: 'Web Server Log Analyzer',
        desc: 'Apache - nginx - IIS access logs - anomaly detection + pivots.',
        compVar: 'WebLogAnalyzer',
      },
      {
        path: '/dfir/prefetch',
        tabId: 'prefetch',
        label: 'Prefetch Analyzer Lite',
        desc: 'Parse Windows Prefetch files - execution evidence, run count, last run time.',
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
      {
        path: '/dfir/winreg',
        tabId: 'winreg',
        label: 'Windows Registry Artifacts Reference',
        desc: 'Windows Registry Forensic Artifact Reference - 292 artifacts, 16 categories, 10 hive types, 77 MITRE techniques.',
        compVar: 'WinRegPage',
      },
      {
        path: '/dfir/sigbase',
        tabId: 'sigbase',
        label: 'Signature-Base YARA + IOCs',
        desc: 'Neo23x0 signature-base - 746 YARA rule files (5,784 rules) + 4 IOC lists (hashes, C2, filenames, keywords).',
        compVar: 'SigBasePage',
        keywords: ['yara', 'ioc', 'signature', 'rule', 'hash', 'c2'],
      },
      {
        path: '/dfir/dfir-ref',
        tabId: 'dfir-ref',
        label: 'DFIR Reference',
        desc: 'Event IDs, memory forensics, browser artifacts, evidence collection phases — practitioner reference.',
        compVar: 'DfirRef',
        badge: 'new',
        keywords: ['event ids', 'memory', 'volatility', 'browser', 'evidence', 'forensics'],
      },
      {
        path: '/dfir/coc-generator',
        tabId: 'coc-generator',
        label: 'Chain of Custody Generator',
        desc: 'Build a defensible custody timeline — evidence inventory with hashes, transfer handlers, timestamps.',
        compVar: 'CoCGenerator',
        badge: 'new',
        keywords: ['chain of custody', 'evidence', 'forensic', 'timeline'],
      },
    ],
  },
  {
    id: 'domain-network',
    label: 'Domain & Network',
    blurb:
      'WHOIS, DNS, reputation, certificates, and infrastructure pivots - passive reconnaissance, no active scanning.',
    icon: Globe,
    tone: 'text-sky-700 dark:text-sky-300 border-cyan-500/30 bg-cyan-500/10',
    pages: [
      {
        path: '/dfir/domain-investigator',
        tabId: 'domain-investigator',
        label: 'Domain Investigator',
        desc: 'Cross-source domain investigation hub - 6 aliases route here (domain-rep, webcheck, etc.).',
        compVar: 'DomainInvestigator',
      },
      {
        path: '/dfir/whois-history',
        tabId: 'whois-history',
        label: 'WHOIS History Explorer',
        desc: 'Historical WHOIS pivots - registrant, nameserver, status changes.',
        compVar: 'WhoisHistory',
      },
      {
        path: '/dfir/asn',
        tabId: 'asn',
        label: 'ASN Lookup',
        desc: 'ASN details - prefix ranges - peer relationships.',
        compVar: 'AsnLookup',
      },
      {
        path: '/dfir/cert-search',
        tabId: 'cert-search',
        label: 'Certificate Search',
        desc: 'crt.sh-style CT log search for a domain - subdomains - cert chain.',
        compVar: 'CertSearch',
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
        desc: 'Search historical snapshots for a URL - changes over time.',
        compVar: 'Wayback',
      },
      {
        path: '/dfir/ip-geo',
        tabId: 'ip-geo',
        label: 'IP Geolocation',
        desc: 'IP - country / city / ASN / org / hosting type.',
        compVar: 'IpGeo',
      },
      {
        path: '/dfir/passive-dns',
        tabId: 'passive-dns',
        label: 'Passive DNS',
        desc: 'Historical DNS resolution data for infrastructure tracking - migrations + fast-flux detection.',
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
        desc: 'Aggregate asset inventory - domains, subdomains, services, certificates.',
        compVar: 'AssetIntel',
      },
      {
        path: '/dfir/exposed-host',
        tabId: 'exposed-host',
        label: 'Exposed Host',
        desc: 'Per-host exposure score and evidence - services, versions, CVEs.',
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
        desc: 'Safe, sandboxed preview of a URL - headers, redirects, screenshot.',
        compVar: 'UrlPreview',
      },
      {
        path: '/dfir/subdomain-takeover',
        tabId: 'subdomain-takeover',
        label: 'Subdomain Takeover Scanner',
        desc: 'Detect dangling CNAMEs pointing to expired or unclaimed third-party services.',
        compVar: 'SubdomainTakeover',
        keywords: ['subdomain', 'takeover', 'cname', 'dangling', 'attack-surface'],
      },
      {
        path: '/dfir/exposure',
        tabId: 'exposure',
        label: 'Exposure Analysis',
        desc: 'External attack surface exposure - open ports, services, certificates, and misconfigurations.',
        compVar: 'ExposureAnalyzer',
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
        desc: 'Parse a DMARC aggregate report (RUA) - alignment, volume, failures.',
        compVar: 'DmarcAnalyzer',
      },
      {
        path: '/dfir/eml',
        tabId: 'eml',
        label: 'EML Extractor',
        desc: 'Headers - body - attachments - URL / hash extraction from a .eml file.',
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
        path: '/dfir/email-osnit',
        tabId: 'email-osnit',
        label: 'Email OSINT Profile',
        desc: 'Build digital identity from email - GitHub, Gravatar, breach, reputation, DNS, PGP.',
        compVar: 'EmailOsnit',
        badge: 'new',
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
        desc: 'Cross-source URL reputation - PhishTank, OpenPhish, Google Safe Browsing.',
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
        desc: 'Alias of /dfir/username - the canonical page.',
        compVar: 'UsernameInvestigator',
      },

      {
        path: '/dfir/phone-hub',
        tabId: 'phone-hub',
        label: 'Phone Intelligence',
        desc: 'Phone number OSINT - carrier lookup, line type, breach presence, and AI-powered risk scoring.',
        compVar: 'PhoneHub',
        keywords: ['phone', 'osint', 'carrier', 'intel', 'risk'],
      },

      {
        path: '/dfir/wifi-investigation',
        tabId: 'wifi-investigation',
        label: 'Wi-Fi / BSSID Investigation',
        desc: 'Wireless network - BSSID vendor lookup, SSID analysis, security flags.',
        compVar: 'WifiInvestigation',
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
        desc: 'Social-media intelligence - X / Reddit / Telegram / Mastodon pivots.',
        compVar: 'Socmint',
      },
      {
        path: '/dfir/osint-mapper',
        tabId: 'osint-mapper',
        label: 'OSINT Mapper',
        desc: 'Build a mind-map of an investigation - nodes are entities, edges are pivots.',
        compVar: 'OsintMapper',
      },
      {
        path: '/dfir/breach',
        tabId: 'breach',
        label: 'Breach Lookup',
        desc: 'Email / username / domain - cross-correlate public breach corpora.',
        compVar: 'Breach',
      },
      {
        path: '/dfir/image-intel',
        tabId: 'image-intel',
        label: 'Image Intelligence',
        desc: 'Image analysis - reverse search, perceptual fingerprinting, and OCR screenshot intelligence.',
        compVar: 'ImageIntel',
        keywords: ['image', 'reverse', 'fingerprint', 'phash', 'dhash', 'screenshot', 'ocr'],
      },
      {
        path: '/dfir/brand-impersonation',
        tabId: 'brand-impersonation',
        label: 'Brand Impersonation',
        desc: 'Detect typosquats / look-alike domains targeting your brand.',
        compVar: 'BrandImpersonation',
      },

      {
        path: '/dfir/ironsight',
        tabId: 'ironsight',
        label: 'IRONSIGHT OSINT',
        desc: 'Real-time OSINT command center - alerts, flights, strikes, markets, satellite thermal.',
        compVar: 'Ironsight',
        badge: 'live',
      },
    ],
  },
  {
    id: 'vuln',
    label: 'Vulnerabilities',
    blurb: 'CVE lookup, prioritisation, exploit intel, and dependency scanning - know what to patch first.',
    icon: AlertTriangle,
    tone: 'text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/10',
    pages: [
      {
        path: '/dfir/cve',
        tabId: 'cve',
        label: 'CVE Lookup',
        desc: 'Single-CVE detail - NVD, KEV, EPSS, exploit availability.',
        compVar: 'Cve',
      },
      {
        path: '/dfir/cve-prioritizer',
        tabId: 'cve-prioritizer',
        label: 'CVE Prioritizer',
        desc: 'CVSS + EPSS + KEV + ransomware-use - single patch-priority call.',
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
        desc: 'Paste a manifest.json / package-lock / requirements.txt - known vulns.',
        compVar: 'OsvScanner',
      },
      {
        path: '/dfir/cve-risk-matrix',
        tabId: 'cve-risk-matrix',
        label: 'CVE Risk Matrix',
        desc: 'CTI priority score (CVSS + EPSS + KEV + recency) plotted against CVSS — quadrant scatter plot + sortable table + SSVC-V decisions.',
        compVar: 'CveRiskMatrix',
        badge: 'new',
        keywords: ['cve', 'risk', 'matrix', 'scoring', 'epss', 'kev', 'ssvc'],
      },
    ],
  },
  {
    id: 'ctem',
    label: 'CTEM & Exposure Management',
    blurb:
      'Continuous threat exposure management - fusion scoring, attack path analysis, risk register, GRC evidence, vulnerability ops, ransomware quantification, patch management, and SOC automation.',
    icon: ScanLine,
    tone: 'text-rose-700 dark:text-rose-300 border-rose-500/30 bg-rose-500/10',
    pages: [
      {
        path: '/dfir/fusion-exposure',
        tabId: 'fusion-exposure',
        label: 'Fusion Exposure Worklist',
        desc: 'Composite 4-dimension scoring (CVSS/KEV/EPSS/Exploit-DB) - ranked worklist with per-dimension breakdown.',
        compVar: 'FusionExposure',
        keywords: ['fusion', 'exposure', 'scoring', 'cvss', 'kev', 'epss', 'prioritization'],
      },
      {
        path: '/dfir/risk-register',
        tabId: 'risk-register',
        label: 'Risk Register',
        desc: 'Full lifecycle CRUD with FAIR quantification, inherent->residual levels, and treatment plans.',
        compVar: 'RiskRegister',
        keywords: ['risk', 'register', 'fair', 'quantification', 'treatment'],
      },
      {
        path: '/dfir/attack-path',
        tabId: 'attack-path',
        label: 'Attack Path Graph',
        desc: 'BFS shortest-path reachability from exposed assets to crown jewels - choke point detection, demo fallback.',
        compVar: 'AttackPathGraph',
        keywords: ['attack', 'path', 'graph', 'bfs', 'choke', 'crown jewel'],
      },
      {
        path: '/dfir/grc-evidence',
        tabId: 'grc-evidence',
        label: 'GRC Compliance Evidence',
        desc: 'Framework selector (SOC2/ISO27001/NIST/PCI/HIPAA), control tree, evidence collection with inline status.',
        compVar: 'GrcEvidence',
        keywords: ['grc', 'compliance', 'evidence', 'framework', 'control'],
      },
      {
        path: '/dfir/vulnerability-ops',
        tabId: 'vulnerability-ops',
        label: 'Vulnerability Ops (VOC)',
        desc: 'Intake / triage / SLA tracking - severity, status, source filters with auto-computed deadlines.',
        compVar: 'VulnerabilityOps',
        keywords: ['vulnerability', 'vuln', 'ops', 'sla', 'triage', 'patch'],
      },
      {
        path: '/dfir/ransomware-quant',
        tabId: 'ransomware-quant',
        label: 'Ransomware Quantification',
        desc: 'Scenario-based financial impact across 7 cost dimensions with insurance recovery modeling.',
        compVar: 'RansomwareQuant',
        keywords: ['ransomware', 'quantification', 'financial', 'cost', 'insurance'],
      },
      {
        path: '/dfir/patch-task-mgr',
        tabId: 'patch-task-mgr',
        label: 'Patch & Task Manager',
        desc: 'Vendor advisory intake, maintenance window scheduling, approval workflows, deploy tracking.',
        compVar: 'PatchTaskMgr',
        keywords: ['patch', 'task', 'manager', 'maintenance', 'window', 'advisory'],
      },
      {
        path: '/dfir/soc-automation',
        tabId: 'soc-automation',
        label: 'SOC Automation Engine',
        desc: 'Playbook engine with configurable actions (webhook/email/slack/KB/MCP) - one-click execute, run history.',
        compVar: 'SocAutomation',
        keywords: ['soc', 'automation', 'playbook', 'runbook', 'orchestration'],
      },
    ],
  },
  {
    id: 'detection',
    label: 'Detection Engineering',
    blurb: 'Author, convert, and test detection rules - Sigma, KQL, SPL, YARA, ATT&CK mapping, hunting queries.',
    icon: Shield,
    tone: 'text-brand-700 dark:text-brand-300 border-brand-500/30 bg-brand-500/10',
    pages: [
      {
        path: '/dfir/rule-converter',
        tabId: 'rule-converter',
        label: 'Rule Converter',
        desc: 'Sigma - KQL - SPL - YARA via one canonical IR.',
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
        desc: 'Indicator - relationship graph - visual pivot from any node.',
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
        desc: 'False-positive analyst - score a detection against historical FPs.',
        compVar: 'FpLens',
      },
      {
        path: '/dfir/detection-chokepoints',
        tabId: 'detection-chokepoints',
        label: 'Detection Chokepoints',
        desc: 'Invariant detection points - prerequisites attackers cannot bypass, mapped to MITRE ATT&CK.',
        compVar: 'DetectionChokepoints',
        keywords: ['chokepoint', 'detection', 'mitre', 'kill-chain'],
      },
      {
        path: '/dfir/ir-playbooks',
        tabId: 'ir-playbooks',
        label: 'IR Playbooks',
        desc: 'Step-by-step playbooks for common incident types.',
        compVar: 'IrPlaybooks',
      },

      {
        path: '/dfir/tracerules',
        tabId: 'tracerules',
        label: 'TRACERULES',
        desc: 'Trace a rule back to its source intel - coverage and lineage.',
        compVar: 'Tracerules',
        badge: 'new',
        keywords: ['rule', 'lineage', 'trace', 'intel'],
      },
      {
        path: '/dfir/siem-library',
        tabId: 'siem-library',
        label: 'SIEM Use-Case Library',
        desc: '60 detection use-cases across 16 categories — KQL + SPL starter rules with MITRE mapping.',
        compVar: 'SiemLibrary',
        badge: 'new',
        keywords: ['siem', 'detection', 'kql', 'spl', 'use-case', 'rule'],
      },
      {
        path: '/dfir/hunt-hypotheses',
        tabId: 'hunt-hypotheses',
        label: 'Hunting Hypothesis Library',
        desc: '154 hunt hypotheses across 12 MITRE tactics — technique-driven, data-source-aware starter queries.',
        compVar: 'HuntHypotheses',
        badge: 'new',
        keywords: ['hunting', 'hypothesis', 'mitre', 'kql', 'spl', 'starter query'],
      },
      {
        path: '/dfir/soc-calculators',
        tabId: 'soc-calculators',
        label: 'SOC Calculators',
        desc: 'Alert fatigue index, SOAR ROI, EDR maturity, and log volume estimators.',
        compVar: 'SocCalculators',
        badge: 'new',
        keywords: ['soc', 'calculator', 'alert fatigue', 'soar', 'edr', 'maturity'],
      },
      {
        path: '/dfir/sysmon-config',
        tabId: 'sysmon-config',
        label: 'Sysmon Config Generator',
        desc: 'Build v15 Sysmon XML configs — verbose, baseline, and lean presets with field-level exclude mode.',
        compVar: 'SysmonConfig',
        badge: 'new',
        keywords: ['sysmon', 'xml', 'config', 'detection', 'endpoint'],
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
        desc: 'Build, view, and export STIX 2.x bundles (canonical entry - /dfir/stix, /dfir/stix-builder, /dfir/taxii, /dfir/report-ingest all redirect here).',
        compVar: 'StixWorkbench',
      },
    ],
  },
  {
    id: 'cloud',
    label: 'Cloud Security',
    blurb: 'IAM, network, secrets, and configuration analysis for AWS, GCP, Azure, and Kubernetes.',
    icon: Cloud,
    tone: 'text-brand-700 dark:text-brand-300 border-brand-500/30 bg-brand-500/10',
    pages: [
      {
        path: '/dfir/iam-hub',
        tabId: 'iam-hub',
        label: 'IAM & RBAC Hub',
        desc: 'Cloud identity analysis - AWS, GCP, Azure, and Kubernetes RBAC policy analyzers.',
        compVar: 'IamHub',
        keywords: ['iam', 'rbac', 'aws', 'gcp', 'azure', 'k8s', 'kubernetes', 'privilege', 'escalation'],
      },

      {
        path: '/dfir/sg-analyzer',
        tabId: 'sg-analyzer',
        label: 'Security Group Analyzer',
        desc: 'AWS security group visualizer - 0.0.0.0/0 + port exposure heatmap.',
        compVar: 'SecurityGroupAnalyzer',
      },
      {
        path: '/dfir/cloudtrail-triage',
        tabId: 'cloudtrail-triage',
        label: 'CloudTrail Triage',
        desc: 'Filter CloudTrail logs for an incident timeframe - IAM, EC2, S3, KMS.',
        compVar: 'CloudTrailTriage',
      },

      {
        path: '/dfir/terraform-scan',
        tabId: 'terraform-scan',
        label: 'Terraform Scanner',
        desc: 'Static analysis of HCL - misconfigurations + drift.',
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
      {
        path: '/dfir/cloud-reference',
        tabId: 'cloud-ref',
        label: 'Cloud Shared-Responsibility Matrix',
        desc: 'AWS / Azure / GCP / OCI SRM — 16 domains, customer/cloud responsibilities, cloud hunt queries by provider.',
        compVar: 'CloudReference',
        badge: 'new',
        keywords: ['cloud', 'shared responsibility', 'srm', 'aws', 'azure', 'gcp', 'hunt query'],
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
        path: '/dfir/pi-taxonomy',
        tabId: 'pi-taxonomy',
        label: 'PI Taxonomy',
        desc: 'Arcanum Prompt Injection Taxonomy - 172 classified attack nodes.',
        compVar: 'PiTaxonomy',
      },
      {
        path: '/dfir/mcp-audit',
        tabId: 'mcp-audit',
        label: 'MCP Audit',
        desc: 'Audit a Model Context Protocol server for tool-poisoning vectors.',
        compVar: 'McpAudit',
      },
      {
        path: '/dfir/agent-suite',
        tabId: 'agent-suite',
        label: 'Agent Suite',
        desc: 'AI agent investigation - tool-call analysis, observable enrichment, and attack-surface mapping.',
        compVar: 'AgentSuite',
        keywords: ['agent', 'investigator', 'enrich', 'map', 'ai', 'tool calls', 'exfil'],
      },

      {
        path: '/dfir/ai-threats',
        tabId: 'ai-threats',
        label: 'AI Threat Actors',
        desc: 'Tracked real-world threat-actor uses of AI/LLMs - 79 entries, MITRE ATT&CK mapped, from the Cybershujin tracker.',
        compVar: 'AIThreats',
        badge: 'new',
        keywords: ['ai', 'llm', 'threat actor', 'apt', 'ttps', 'cybershujin'],
      },
      {
        path: '/dfir/ai-suite',
        tabId: 'ai-suite',
        label: 'AI Suite',
        desc: 'AI-assisted investigation - incident summarisation, query generation, timeline reconstruction, malware briefing, and IOC verdicts.',
        compVar: 'AiSuite',
        keywords: ['ai', 'insight', 'querycraft', 'chrono', 'malbrief', 'verdikt', 'llm', 'copilot'],
      },
    ],
  },
  {
    id: 'api',
    label: 'API & Application Security',
    blurb: 'OpenAPI, GraphQL, JWT, secrets, and headers - application-layer security analysis.',
    icon: Code2,
    tone: 'text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    pages: [
      {
        path: '/dfir/openapi-audit',
        tabId: 'openapi-audit',
        label: 'OpenAPI Auditor',
        desc: 'Lint an OpenAPI spec - missing auth, schema issues, PII exposure.',
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
        desc: 'Decode - verify - alg-confusion check - claim analysis.',
        compVar: 'JwtInspect',
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
        path: '/dfir/medusa-scan',
        tabId: 'medusa-scan',
        label: 'Medusa Scanner',
        desc: 'AI-first security scanner - SAST (Python/JS/Go/Rust/PHP), secrets, prompt injection detection. 140+ rules, runs entirely in browser.',
        compVar: 'MedusaScanner',
        badge: 'new',
        keywords: ['sast', 'secrets', 'prompt injection', 'ai security', 'static analysis', 'medusa', 'code scan'],
      },
      {
        path: '/dfir/csrf-poc',
        tabId: 'csrf-poc',
        label: 'CSRF PoC Generator',
        desc: 'Generate HTML/XHR/fetch proof-of-concept exploits for CSRF testing.',
        compVar: 'CsrfPocGenerator',
        badge: 'new',
        keywords: ['csrf', 'cross-site request forgery', 'poc', 'exploit', 'form'],
      },
      {
        path: '/dfir/xss-payloads',
        tabId: 'xss-payloads',
        label: 'XSS Payload Selector',
        desc: 'Curated XSS payload library - filter by context, severity, or tags.',
        compVar: 'XssPayloadSelector',
        badge: 'new',
        keywords: ['xss', 'cross-site scripting', 'payload', 'injection', 'reflected', 'stored'],
      },
      {
        path: '/dfir/google-dorks',
        tabId: 'google-dorks',
        label: 'Google Dorks Builder',
        desc: 'Compose a Google dork for a target - site:, inurl:, filetype:.',
        compVar: 'GoogleDorks',
      },

      {
        path: '/dfir/log-parser',
        tabId: 'log-parser',
        label: 'Log Parser',
        desc: 'Generic log parser - pattern detection + anomaly highlighting.',
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
        desc: 'Conversational copilot - ask in plain English, get a runbook.',
        compVar: 'DfirCopilotPage',
      },
      {
        path: '/dfir/multi-search',
        tabId: 'multi-search',
        label: 'Multi-Search',
        desc: 'Query 30+ intel sources in parallel - paste an IOC or entity.',
        compVar: 'MultiSearch',
      },

      {
        path: '/dfir/crypto-tracer',
        tabId: 'crypto-tracer',
        label: 'Crypto Tracer',
        desc: 'Cross-chain transaction tracing, real-time flow monitoring, and quick address lookups for AML and ransomware investigations.',
        compVar: 'CryptoTracer',
        keywords: ['crypto', 'tracer', 'tracepulse', 'quicktrace', 'bitcoin', 'blockchain', 'aml'],
      },
      {
        path: '/dfir/pivex',
        tabId: 'pivex',
        label: 'PIVEX',
        desc: 'Pivot explorer - graph-style pivots from any entity.',
        compVar: 'Pivex',
        keywords: ['pivot', 'explorer', 'graph'],
      },
      {
        path: '/dfir/agent-history',
        tabId: 'agent-history',
        label: 'Agent History',
        desc: 'AI agent investigation sessions - quality scores, IOCs, and key findings.',
        compVar: 'InvestigationHistory',
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
        path: '/dfir/report-hub',
        tabId: 'report-hub',
        label: 'Report Hub',
        desc: 'Analyze external reports and compose investigation reports - AI summarisation, IOC extraction, MITRE mapping, PDF/DOCX export.',
        compVar: 'ReportHub',
        keywords: ['report', 'analyzer', 'composer', 'ioc', 'mitre', 'stix', 'pdf', 'docx'],
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
      {
        path: '/dfir/notebooks',
        tabId: 'notebooks',
        label: 'Investigation Notebooks',
        desc: 'Persistent notes, IOC snapshots, and findings for DFIR investigations.',
        compVar: 'Notebooks',
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
        desc: 'Generate - encrypt - sign - verify PGP messages in-browser.',
        compVar: 'PgpTool',
      },
      {
        path: '/dfir/one-time-secret',
        tabId: 'one-time-secret',
        label: 'One-Time Secret',
        desc: 'Encrypted secret sharing - AES-GCM in-browser, burn after reading, zero-knowledge server.',
        compVar: 'OneTimeSecret',
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
        desc: 'Control mapping - risk register - vendor assessment.',
        compVar: 'Grc',
      },
      {
        path: '/dfir/lolbins',
        tabId: 'lolbins',
        label: 'LOLBins',
        desc: 'Living-off-the-land binaries - search by binary or behaviour.',
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
        desc: 'OPSEC checklist - threat-modelling for individuals.',
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
      {
        path: '/dfir/grc-checklists',
        tabId: 'grc-checklists',
        label: 'GRC Checklists',
        desc: 'Control checklists for NIST CSF, ISO 27001, SOC 2, PCI DSS v4, DPDP 2023, CERT-In, SEBI — plus cross-framework mapper.',
        compVar: 'GrcChecklists',
        badge: 'new',
        keywords: ['grc', 'checklist', 'nist', 'iso27001', 'soc2', 'pci', 'dpdp', 'cert-in', 'sebi'],
      },
      {
        path: '/dfir/pqc',
        tabId: 'pqc',
        label: 'Post-Quantum Cryptography',
        desc: 'Algorithm profiles, HNDL threat model, crypto-class readiness assessment, and migration checklist.',
        compVar: 'Pqc',
        badge: 'new',
        keywords: ['post-quantum', 'pqc', 'nist', 'mlkem', 'ml-dsa', 'slh-dsa', 'hndl'],
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
        desc: 'Layered ATT&CK matrix - coverage heatmap, gap analysis.',
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
        desc: 'Adversary - capability - infrastructure - victim - reference.',
        compVar: 'Diamond',
      },
      {
        path: '/dfir/owasp',
        tabId: 'owasp',
        label: 'OWASP Top 10',
        desc: 'Web 2021 - API 2023 - LLM 2025 reference + checklist.',
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
        desc: 'Scenario-driven tabletop exercises - pick a scenario, run it.',
        compVar: 'Tabletop',
      },
      {
        path: '/dfir/cloak',
        tabId: 'cloak',
        label: 'CLOAK — Anonymity Framework',
        desc: 'Concealment Layers for Online Anonymity and Knowledge — adversary tactics, techniques, sub-techniques, and procedures.',
        compVar: 'Cloak',
        badge: 'new',
        keywords: ['cloak', 'anonymity', 'tor', 'privacy', 'obfuscation'],
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
