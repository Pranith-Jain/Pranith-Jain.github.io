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
  ScanSearch,
  Binary,
  Activity,
  Fingerprint,
  GitBranch,
  Target,
  FileCode,
  Upload,
  BookOpen,
  FolderOpen,
  Download,
  Map as MapIcon,
  Bot,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureFlag } from '../../lib/features';

export interface Tool {
  path: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  /** One-line example use-case shown on the rich landing card. */
  useCase?: string;
  external?: boolean;
  /**
   * Mark a tool as a "utility" — duplicative of well-known online tools
   * (timestamp converters, hex/base64 decoders, hash calculators,
   * homoglyph viewers). The hub hides utilities behind a toggle so the
   * count of "real" tools reads as the actual depth of the toolkit, not
   * a padded list. The routes still resolve — nothing is deleted, only
   * de-emphasised on the landing.
   */
  utility?: boolean;
  /**
   * What this tool CAN'T do — kept honest. Surfaced on the tool page so
   * a visitor doesn't bounce when they realise the tool isn't a Splunk
   * replacement. Optional; absent means no panel renders.
   */
  cantDo?: string;
  /** Typical 1-line workflow hint (e.g. "Paste IOC → review consensus
   *  → pivot to /threatintel/correlation"). Optional. */
  workflow?: string;
  /**
   * Hide this tool from all nav + search until the named deployment
   * feature flag is enabled (see `GET /api/v1/features` and
   * `src/lib/features.tsx`). Used for dormant self-hosted bridges that
   * only work once an operator sets the matching `*_BRIDGE_URL` secret —
   * no point advertising a tool that just returns a 503 setup hint. The
   * route still exists; direct navigation is handled by a page-level
   * guard that redirects when the flag is off.
   */
  requiresFlag?: FeatureFlag;
}

/**
 * Top-level tool group. Each section belongs to exactly one group so the
 * grid can be sliced into dedicated, less-overwhelming category pages
 * (separate OSINT / AI-sec / Data-security / GRC surfaces) while the
 * full /dfir grid stays as the power-user index.
 */
export type ToolGroup = 'core-dfir' | 'investigation' | 'intelligence' | 'recon' | 'specialized' | 'grc' | 'aisec';

export const GROUP_META: Record<ToolGroup, { label: string; blurb: string }> = {
  'core-dfir': {
    label: 'Core DFIR',
    blurb: 'Triage & analysis — IOC checks, malware triage, file analysis, artifact parsers.',
  },
  investigation: {
    label: 'Investigation',
    blurb: 'Infrastructure & identity — domain/network, assets, email security, vulnerabilities.',
  },
  intelligence: {
    label: 'Intelligence',
    blurb: 'Detection & standards — rule converters, STIX/TAXII, IR playbooks, hunting tools.',
  },
  recon: {
    label: 'Recon & OSINT',
    blurb: 'Identity, network intel, image analysis, dark web, privacy checks.',
  },
  specialized: {
    label: 'Specialized',
    blurb: 'AI security, cloud, API, data security, GRC, case management, deception, platform.',
  },
  grc: {
    label: 'GRC & Posture',
    blurb: 'Compliance, maturity assessments, tabletop exercises, kill chain, OWASP.',
  },
  aisec: {
    label: 'AI Security',
    blurb: 'LLM red-teaming, prompt injection, MCP audit, agent attack surface, ATLAS.',
  },
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
  // ── DFIR / Forensics group ───────────────────────────────────────
  {
    id: 'ioc-triage',
    group: 'core-dfir',
    label: 'IOC Triage',
    blurb: 'Check, extract, and track indicators across 24+ sources.',
    tools: [
      {
        path: '/dfir/ioc-check',
        useCase: 'Check an indicator across 24 sources in seconds.',
        cantDo:
          "Won't replace a paid MSP — providers with strict rate limits still rate-limit you; some sources need your own API key for high-volume use.",
        workflow:
          'Paste IP / domain / URL / hash → results stream in across 24 sources → trust cross-source consensus, not single-feed flags.',
        label: 'IOC & Hash Checker',
        desc: '24 sources · streaming · IPs · domains · URLs · file hashes',
        icon: Hash,
      },
      {
        path: '/dfir/ioc-pivot',
        useCase: 'Graph what an indicator touches and pivot through it.',
        label: 'IOC Pivot Graph',
        desc: 'Enrich an IOC across 26 sources → radial graph of verdict-coloured sources + derived IPs/domains/hashes/ASNs/CVEs · click any node to re-pivot',
        icon: Share2,
      },
      {
        path: '/dfir/threat-hunt',
        useCase: 'Cross-reference an indicator across all intel sources in one shot.',
        label: 'Threat Hunt',
        desc: 'IP · domain · email · hash → auto-detect type → Telegram leak cross-ref + IOC providers + breach DB links',
        icon: Crosshair,
      },
      {
        path: '/dfir/extract',
        useCase: 'Pull every IOC out of a threat report instantly.',
        label: 'IOC Extractor',
        desc: 'Pull IOCs from any text blob · refang-aware',
        icon: Filter,
      },
      {
        path: '/dfir/ioc-lifecycle',
        useCase: 'Track when an IOC first appeared and its activity trend.',
        label: 'IOC Lifecycle Tracker',
        desc: 'Track IOC first-seen, last-seen, peak score, decay rate, activity status · temporal intelligence for threat hunting · trending IOCs dashboard',
        icon: Clock,
      },
      {
        path: '/dfir/ct-monitor',
        useCase: 'Monitor CT logs for new subdomains on your domains.',
        label: 'Certificate Transparency Monitor',
        desc: 'Watch domains for new certificates · detects suspicious patterns, typosquatting, wildcard certs · crt.sh integration · free unlimited lookups',
        icon: ShieldCheck,
      },
      {
        path: '/dfir/abuse-rep',
        useCase: 'Look up IP or email abuse history from a crowdsourced registry.',
        label: 'Abuse Reputation',
        desc: 'Stop Forum Spam IP/email abuse registry · report count · last-seen · tor-exit flag · confidence score',
        icon: ShieldAlert,
      },
    ],
  },
  {
    id: 'malware-triage',
    group: 'core-dfir',
    label: 'Malware Triage',
    blurb: 'Analyse files, parse stealer logs, and check breach corpora.',
    tools: [
      {
        path: '/dfir/malware-scan',
        useCase: 'Profile a suspicious file before deeper analysis.',
        label: 'Malware Scanner',
        desc: 'Drop a file · client-side hashing + entropy + strings + heuristic tags · dispatches the hash to 11 public engines (VT, MalwareBazaar, ANY.RUN, Joe Sandbox, Hybrid Analysis, OTX, etc)',
        icon: Microscope,
      },
      {
        path: '/dfir/malware-capabilities',
        useCase: 'Identify malware capabilities and MITRE ATT&CK techniques from a hash.',
        label: 'Malware Capabilities',
        desc: 'capa-style analysis · family identification via MalwareBazaar · 30+ curated malware behavior database · MITRE ATT&CK technique mapping · capabilities extraction',
        icon: Shield,
      },
      {
        path: '/dfir/sample-scan',
        useCase: 'Composite hash verdict + one-click public-sandbox detonation.',
        label: 'Sample Scan (lite 0x12)',
        desc: 'Hash fan-out across 9 free public reputation engines (VT, MB, YARAify, Hybrid, OTX, ThreatFox, Malshare, Hashlookup, Kaspersky) · composite verdict + family/signature aggregation · 12 free public-sandbox deep links (Triage, ANY.RUN, Joe, Intezer, InQuest, …) for one-click detonation',
        icon: ScanSearch,
      },
      {
        path: '/dfir/stealer-parser',
        useCase: 'Parse infostealer logs (Redline, Raccoon, Vidar, Lumma).',
        label: 'Infostealer Log Parser',
        desc: 'Paste stealer log dumps · auto-detects format (Redline, Raccoon, Vidar, Lumma, StealC) · extracts credentials, cookies, autofill, crypto wallets, system info · 100% client-side',
        icon: Database,
      },
      {
        path: '/dfir/bloom',
        useCase: 'Check if a hash/credential appears in a breach corpus.',
        label: 'Bloom Filter Lookup',
        desc: 'Probabilistic set-membership check against large breach/credential corpora · zero false negatives · client-side · supports MD5, SHA1, SHA256, email, username',
        icon: Filter,
      },
      {
        path: '/dfir/report-parser',
        useCase: 'Extract IOCs, actors, and TTPs from a threat report.',
        label: 'Threat Report Parser',
        desc: 'Paste threat report text or URL → AI extracts IOCs, threat actors, malware families, MITRE techniques, CVEs, targeted sectors · powered by Workers AI',
        icon: FileCode,
      },
      {
        path: '/dfir/linux-triage',
        useCase: 'Triage a Linux box from its auth.log + bash_history.',
        label: 'Linux IR Triage',
        desc: 'Paste auth.log / secure / crontab / bash_history · flags SSH brute force, success-after-failure, root login, new sudoers, cron persistence, reverse-shell & download-cradle one-liners · 100% client-side',
        icon: Terminal,
      },
    ],
  },
  {
    id: 'file-analysis',
    group: 'core-dfir',
    label: 'File Analysis',
    blurb: 'Decode, hash, and inspect binaries and encoded payloads.',
    tools: [
      {
        path: '/dfir/decode',
        useCase: 'Decode an obfuscated payload string fast.',
        label: 'Decoder',
        desc: 'Base64 · URL · multi-pass',
        icon: Code2,
        utility: true,
      },
      {
        path: '/dfir/encoder',
        useCase: 'Build and round-trip an encoding chain.',
        label: 'Encoder',
        desc: 'Reverse of Decoder. base64 / url / hex / binary / rot13 with chain builder + round-trip',
        icon: Type,
        utility: true,
      },
      {
        path: '/dfir/powershell-deobf',
        useCase: 'Unwrap an encoded PowerShell command.',
        label: 'PowerShell Deobfuscator',
        desc: 'EncodedCommand · char-arrays · format-strings · multi-pass with diff trace',
        icon: Terminal,
      },
      {
        path: '/dfir/pe',
        useCase: 'Profile a suspicious binary before reversing.',
        label: 'PE Static Analyzer Lite',
        desc: 'EXE/DLL headers · mitigations · section entropy (packed?) · import table w/ suspicious-API flags',
        icon: Binary,
      },
      {
        path: '/dfir/apk-analyzer',
        useCase: 'Analyze an Android APK for malware indicators.',
        label: 'APK Analyzer',
        desc: 'Drop .apk · permissions · package info · DEX count · strings · IOCs · suspicious patterns · hashes · client-side',
        icon: Smartphone,
      },
      {
        path: '/dfir/hash-calc',
        useCase: 'Verify a file hash against a known IOC.',
        label: 'Hash Calculator',
        desc: 'MD5 · SHA-1/256/384/512 for text or a dropped file · client-side',
        icon: Hash,
        utility: true,
      },
      {
        path: '/dfir/timestamp',
        useCase: 'Decode a FILETIME from a registry artifact.',
        label: 'Timestamp Converter',
        desc: 'Unix s/ms/µs · Windows FILETIME · WebKit/Chrome · Apple Cocoa · ISO 8601. all at once',
        icon: Clock,
        utility: true,
      },
      {
        path: '/dfir/plist-protobuf',
        useCase: 'Preview a plist manifest or protobuf blob.',
        label: 'Plist & Protobuf Decoder',
        desc: 'Apple binary/XML plists + schema-less protobuf · hand-rolled parsers · client-side',
        icon: Code2,
        utility: true,
      },
    ],
  },
  {
    id: 'artifact-parsers',
    group: 'core-dfir',
    label: 'Artifact Parsers & Logs',
    blurb: 'PCAP, registry, EVTX, SQLite, browser and mobile artifacts.',
    tools: [
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
        path: '/dfir/blocklists',
        useCase: 'Download daily-generated firewall blocklists from cross-source IOC consensus.',
        label: 'Blocklist Export',
        desc: 'pfSense · iptables · Suricata · IPs from 2+ independent feeds · daily cron generation · one-click download',
        icon: Shield,
      },
    ],
  },
  // ── IR group ──────────────────────────────────────────────────────
  {
    id: 'domain-network',
    group: 'investigation',
    label: 'Domain & Network',
    blurb: 'WHOIS, DNS, reputation, and infrastructure lookups.',
    tools: [
      {
        path: '/dfir/domain',
        useCase: 'Deep-dive any domain: DNS, WHOIS, email auth, CT logs, threat intel.',
        label: 'Domain Lookup',
        desc: 'WHOIS · DNS · email auth · CT logs',
        icon: Globe,
      },
      {
        path: '/dfir/webcheck',
        useCase: 'Full domain security audit: HTTP, TLS, headers, tech stack, ports.',
        label: 'Domain Web Check',
        desc: 'HTTP probe · TLS inspection · security headers scoring · technology fingerprinting · Shodan ports · redirect chain analysis',
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
        path: '/dfir/whois-history',
        useCase: 'Track ownership changes and find related domains.',
        label: 'WHOIS History Explorer',
        desc: 'Registration timeline · ownership transfers · registrar changes · pivot by registrant email/org/nameserver · inspired by etugen.io',
        icon: Globe,
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
        desc: 'CT log enumeration via SSLMate Cert Spotter. find subdomains by their issued certs',
        icon: ShieldCheck,
      },
    ],
  },
  {
    id: 'asset-surface',
    group: 'investigation',
    label: 'Asset & Attack Surface',
    blurb: 'Exposed-host analysis, asset intel, and web scanning.',
    tools: [
      {
        path: '/dfir/asset-intel',
        useCase: 'Unified IP and domain asset reconnaissance — exposed host, WHOIS history, and artifact analysis.',
        label: 'Asset Intelligence',
        desc: 'IP → exposed host with open ports, CVEs, artifacts · domain → WHOIS timeline, registration changes, related domains · auto-detects input type',
        icon: ScanLine,
      },
      {
        path: '/dfir/open-directory',
        useCase: 'Scan for exposed open directories and malware staging.',
        label: 'Open Directory Scanner',
        desc: 'Detect directory listings · classify files by risk · identify credential dumps, configs, malware · inspired by etugen.io trashpile',
        icon: FolderOpen,
      },
      {
        path: '/dfir/full-spectrum',
        useCase: 'Run every domain check from one query.',
        label: 'Full Spectrum Domain',
        desc: 'One-shot orchestrator. runs WHOIS, DNS, ASN, breach check, exposure, certs, takeover, web scan, IP geo on a single domain and stitches the results',
        icon: Radar,
      },
      {
        path: '/dfir/web-scan',
        useCase: 'Spot missing security headers and exposed paths.',
        label: 'Web Vulnerability Scanner',
        desc: 'HTTP security headers · cookies · version disclosure · ~30 common exposed paths probed in parallel',
        icon: ShieldAlert,
      },
    ],
  },
  // ── Email Security ────────────────────────────────────────────────
  {
    id: 'email',
    group: 'investigation',
    label: 'Email Security',
    blurb: 'Phishing analysis and BEC-defense for the domain you protect.',
    tools: [
      {
        path: '/dfir/phishing',
        useCase: 'Triage a phishing email in seconds.',
        label: 'Phishing Analyzer',
        desc: 'Email headers · auth · embedded URLs · URL auto-analysis · kit fingerprint',
        icon: ShieldAlert,
      },
      {
        path: '/dfir/phishing#fingerprint',
        useCase: 'Identify phishing kits by structural page hash.',
        label: 'Phishing Kit Fingerprint',
        desc: 'Server-side fetch → browser-side SHA-256 → KV-backed kit lookup · 30-day retention',
        icon: Fingerprint,
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
        cantDo:
          "Reads DNS only — won't catch a domain that auths correctly but sends from a compromised mailbox. The score is the floor of attacker effort, not the ceiling of your safety.",
        workflow:
          'Enter your domain → review the rule failures with attack-scenario context → fix in DNS → recheck → set DMARC p=reject when alignment is clean.',
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
    id: 'vulns-identity',
    group: 'investigation',
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
  // ── OSINT group ───────────────────────────────────────────────────
  {
    id: 'identity-search',
    group: 'recon',
    label: 'Identity & Search',
    blurb: 'Username pivots, Google dorking, archive recon.',
    tools: [
      {
        path: '/dfir/identity-lookup',
        useCase: 'Look up a username across 10+ platforms and see live profile data.',
        label: 'Identity Lookup',
        desc: 'KagamiID-style · GitHub/GitLab/Reddit/HN/Bluesky/Dev.to profile lookup · avatar, bio, followers, repos · client-side from public APIs',
        icon: Search,
      },
      {
        path: '/dfir/username',
        useCase: 'Trace a username across 50+ platforms.',
        label: 'Username Pivot',
        desc: 'Sherlock-lite · 50+ services · live CORS checks for GitHub/GitLab/Reddit/HN/Mastodon · client-side',
        icon: AtSign,
      },
      {
        path: '/dfir/username-osint',
        useCase: 'Enumerate username presence across 60+ platforms server-side.',
        label: 'Username OSINT',
        desc: '60+ platforms (social, dev, gaming, creative, finance) · server-side HTTP checks · bounded concurrency · 15min edge cache',
        icon: Users,
      },
      {
        path: '/dfir/google-dorks',
        useCase: 'Run Google search with operator hints to surface OSINT leads.',
        label: 'Google Dorks',
        desc: 'SerpAPI-backed · `site:` `inurl:` `filetype:` `intitle:` · 6 quick-start presets (exposed .env, paste leaks, SQL dumps, S3, GitHub) · edge-cached 1h to stretch the free SerpAPI tier',
        icon: Search,
      },
      {
        path: '/dfir/wayback',
        useCase: 'Build an archive timeline for a URL.',
        label: 'Wayback Machine Pivot',
        desc: 'Internet Archive CDX timeline · first/last seen · status-code distribution · snapshot links',
        icon: History,
      },
      {
        path: '/dfir/dork-builder',
        useCase: 'Compose a dork to surface exposed files.',
        label: 'Google Dork Builder',
        desc: 'Compose site:/filetype:/intitle: operators · presets · open in Google/Bing/DDG/Yandex',
        icon: Search,
      },
      {
        path: '/dfir/socmint',
        useCase: 'Pivot an email or handle to OSINT sources.',
        label: 'SOCMINT Pivots',
        desc: 'Email/domain/handle/name → categorised OSINT lookup links · breach + B2B (ZoomInfo, Apollo, Hunter, RocketReach) + social + dev + paste dorks',
        icon: Users,
      },
      {
        path: '/dfir/multi-search',
        useCase: 'Fan out one piece of intel to 60+ OSINT platforms in parallel.',
        label: 'Multi-Search',
        desc: 'Auto-detect input kind (email/IP/username/hash/CVE/BTC) · fill 60+ platform URL templates · open all in parallel new tabs · 100% client-side',
        icon: Search,
      },
      {
        path: '/dfir/osint-mapper',
        useCase: 'Map identifiers and locations for an investigation.',
        label: 'OSINT Mapper',
        desc: 'Node graph of identifiers (social/phone/plate/person/vehicle) + Leaflet street map · click-to-pin w/ Nominatim geocoding · cross-link identifiers↔locations · local-only · .osint.json import/export',
        icon: MapIcon,
      },
    ],
  },
  {
    id: 'network-url-intel',
    group: 'recon',
    label: 'Network & URL Intel',
    blurb: 'IP geo, URL reputation, crypto tracing.',
    tools: [
      {
        path: '/dfir/host-graph',
        useCase: 'Map an IP to its ASN, prefix, abuse contact, and peers.',
        label: 'Host Graph',
        desc: 'IP / ASN / CIDR enrichment · RDAP · abuse contact · prefix tree · clickable graph to pivot across network footprint',
        icon: Network,
      },
      {
        path: '/dfir/ip-geo',
        useCase: 'Geolocate an IP and flag VPN or hosting.',
        label: 'IP Geolocation',
        desc: 'Country · ASN · ISP · proxy/VPN/hosting flags · AbuseIPDB confidence + report count · OpenStreetMap pin',
        icon: Globe2,
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
        path: '/dfir/punycode',
        useCase: 'Catch a homograph lookalike domain.',
        label: 'Homograph Detector',
        desc: 'IDN · mixed scripts · brand lookalikes · paste a domain to inspect',
        icon: Type,
        utility: true,
      },
      {
        path: '/dfir/crypto-trace',
        useCase: 'Trace a wallet across chains and explorers.',
        label: 'Crypto Address Tracer',
        desc: 'BTC + 6 EVM chains + Solana · balance · explorer + NFT + DeFi + scam-flag pivots',
        icon: Coins,
      },
      {
        path: '/dfir/tracer',
        useCase: 'Trace fund flows hop-by-hop and map an actor’s on-chain footprint.',
        workflow:
          'Seed an address → click nodes to expand counterparties → confirm hops → inspect tx calldata / find the cash-out path → save, export, or pin to an investigation → watch the address for new movement.',
        cantDo:
          'Not Chainalysis — entity labels are a curated seed + on-the-fly Blockscout/ENS, not an 800M-label index; save / label / watch are admin-gated; native-only value moves (no token-transfer) are not monitored.',
        label: 'Fund-Flow Tracer',
        desc: 'EVM + BTC + Tron fund-flow graph · entity labels + risk score · calldata/TxDataHiding inspector · BTC common-input clustering · auto-path to CEX/Mixer · save/export (JSON/CSV/PNG) + investigation pinning · OSINT identity pivot · address monitoring & alerts',
        icon: Coins,
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
    id: 'image-brand',
    group: 'recon',
    label: 'Image & Brand',
    blurb: 'EXIF, reverse-image search, brand impersonation monitoring.',
    tools: [
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
        path: '/dfir/image-fingerprint',
        useCase: 'Detect a re-uploaded or near-duplicate image.',
        label: 'Image Fingerprint',
        desc: 'In-browser aHash + dHash · compare two images for near-duplicate / re-upload detection',
        icon: ImageIcon,
      },
      {
        path: '/dfir/brand-impersonation',
        useCase: 'Generate lookalike domains to monitor.',
        label: 'Brand Impersonation Explorer',
        desc: 'Typosquat · homoglyph · affix · TLD-swap variants of a brand domain · crt.sh pivots · cross-link to /threatintel/domain-monitor',
        icon: ShieldAlert,
      },
    ],
  },
  {
    id: 'data-sec',
    group: 'specialized',
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
    id: 'det-rules',
    group: 'intelligence',
    label: 'Detection Rules & Converters',
    blurb: 'Build, convert, and test detection rules across formats.',
    tools: [
      {
        path: '/dfir/rule-converter',
        useCase: 'Translate a detection between Sigma, KQL, SPL, EQL, YARA.',
        cantDo:
          'Heuristic, not pySigma — reverse-parsing query languages back into the IR recovers only flat `field op "value"` predicates. YARA / DLP / supply-chain carry no field semantics; every lossy step is flagged in the warnings panel.',
        workflow:
          'Pick the source format (Sigma is the most-faithful) → pick a SIEM field-map preset (Defender / ECS / CIM) → paste a rule or load a starter → copy the emitted target.',
        label: 'Rule Converter',
        desc: 'Universal any-to-any detection translation · Sigma · KQL · Splunk SPL · Elastic Lucene/EQL · YARA · DLP regex · supply-chain Semgrep · 100% client-side',
        icon: ScanLine,
      },
      {
        path: '/dfir/detection-lab',
        useCase: 'Write a rule and test it against the live IOC feed.',
        label: 'Detection Lab',
        desc: 'Author a JSON detection rule and evaluate in-browser against the live-IOC stream · localStorage save/export',
        icon: Activity,
      },
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
        desc: 'Create, edit, validate, and export YARA rules · localStorage-backed library · multi-rule .yar builder',
        icon: FileCheck,
      },
      {
        path: '/dfir/ai-rule-generator',
        useCase: 'Generate detection rules from a plain-English description.',
        label: 'AI Rule Generator',
        desc: 'Plain English → Sigma, KQL, Splunk SPL, Elastic EQL, YARA, Snort, Suricata, DLP regex, Semgrep, Falco · Workers AI',
        icon: Sparkles,
      },
      {
        path: '/dfir/cve-prioritizer',
        useCase: 'Decide which CVEs to actually patch this week.',
        label: 'CVE Exploit Prioritizer',
        desc: 'NVD CVSS + FIRST EPSS + CISA KEV → ACT-NOW / SCHEDULE / MONITOR / DEFER verdict · bulk mode',
        icon: Crosshair,
      },
    ],
  },
  {
    id: 'stix-taxii',
    group: 'intelligence',
    label: 'STIX & TAXII',
    blurb: 'Threat intelligence standards, graph analysis, and attack chain mapping.',
    tools: [
      {
        path: '/dfir/taxii',
        useCase: 'Serve STIX bundles over TAXII 2.1 for tool integration.',
        label: 'TAXII 2.1 Server',
        desc: 'In-browser TAXII 2.1 server · serves STIX 2.1 collections from localStorage · compatible with OpenCTI, MISP',
        icon: Share2,
      },
      {
        path: '/dfir/stix',
        useCase: 'Inspect a STIX bundle visually.',
        label: 'STIX Viewer',
        desc: 'Drop a STIX 2.1 bundle · interactive relationship graph · validate + browse SDOs/SROs',
        icon: Share2,
      },
      {
        path: '/dfir/stix-builder',
        useCase: 'Turn a threat-report into a STIX 2.1 bundle.',
        label: 'STIX Builder',
        desc: 'Paste brief / IoC list / URL — or upload a report file (PDF / DOCX / image / text / HTML) → extraction + enrichment → STIX 2.1 bundle with MITRE Attack-Flow (OpenCTI/MISP importable)',
        icon: FileCheck,
      },
      {
        path: '/dfir/report-ingest',
        useCase: 'Upload a report file and get a STIX 2.1 bundle.',
        label: 'Report → STIX (file upload)',
        desc: 'Upload a threat report (PDF / DOCX / image / text / HTML) → text extraction (OCR for images, file2txt bridge for PDF/DOCX) + enrichment → STIX 2.1 bundle with a MITRE Attack-Flow step graph. Admin-gated.',
        icon: Upload,
      },
      {
        path: '/dfir/threat-graph',
        useCase: 'Visualize IOC relationships and discover threat communities.',
        label: 'Threat Intelligence Graph',
        desc: 'Graph DB for threat intel · BFS shortest path · community detection · relationship mapping',
        icon: GitBranch,
      },
      {
        path: '/dfir/attack-chain',
        useCase: 'Map IOCs to the MITRE ATT&CK kill chain.',
        label: 'Attack Chain Reconstruction',
        desc: 'Reconstruct attack progression · 14 MITRE tactics · predicts next move · detection recommendations',
        icon: Target,
      },
      {
        path: '/dfir/hunting-query-generator',
        useCase: 'Generate hunting queries for 7 SIEM platforms.',
        label: 'Hunting Query Generator',
        desc: 'Describe threat → Splunk, KQL, Sigma, Elastic, YARA, Snort, Suricata queries · MITRE-mapped',
        icon: Crosshair,
      },
    ],
  },
  {
    id: 'ir-hunting',
    group: 'intelligence',
    label: 'IR & Hunting Tools',
    blurb: 'LOLBins reference, log analysis, sandbox queries, and IR playbooks.',
    tools: [
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
        desc: 'WinEvent / Sysmon / syslog / JSON-line / key=value · MITRE tagging · Splunk + Elastic queries',
        icon: ScrollText,
      },
      {
        path: '/dfir/sandbox',
        useCase: 'Query multiple sandbox platforms with a single hash.',
        label: 'Sandbox Integration',
        desc: 'VT, MalwareBazaar, ANY.RUN, Triage, Hybrid Analysis, Joe Sandbox · consensus verdict · family attribution',
        icon: Upload,
      },
      {
        path: '/dfir/ir-playbooks',
        useCase: 'Get a step-by-step IR playbook for any incident type.',
        label: 'IR Playbooks',
        desc: '10 incident types · step-by-step workflows · tool integration · severity-rated',
        icon: BookOpen,
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
        path: '/dfir/attack-navigator',
        useCase: 'Visualize adversary techniques on the MITRE ATT&CK matrix.',
        label: 'MITRE ATT&CK Navigator',
        desc: '14 tactics · ~200 techniques · ARiES risk scores + % actor use + prevalence modes · drawer with technique detail · live from mitre/cti',
        icon: Target,
      },
      {
        path: '/dfir/attack-navigator?matrix=a3m',
        useCase: 'Map AI-agent attacks across the A3M kill chain.',
        label: 'A3M Agentic AI Matrix',
        desc: '17-phase Agentic AI Attack Matrix · 167 techniques · purple-violet tile map · live from cyberriskevaluator.com/A3M',
        icon: Sparkles,
      },
      {
        path: '/dfir/attack-navigator?matrix=d3fend',
        useCase: 'Browse the MITRE D3FEND defensive-technique ontology.',
        label: 'MITRE D3FEND Matrix',
        desc: '7 defensive tactics (Model · Harden · Detect · Isolate · Deceive · Evict · Restore) · 250+ techniques with definitions · live from d3fend.mitre.org',
        icon: ShieldCheck,
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
    blurb: 'AI-system threat surface. prompts, agents, MCP servers.',
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
        path: '/dfir/agent',
        useCase: 'Let an autonomous agent plan and run CTI tools to answer a query.',
        label: 'Agent Investigator',
        desc: 'Autonomous CTI investigator · plans steps · runs server-side tools via WebSocket · streams STIX bundle + step-by-step trace · LLM synthesis',
        icon: Bot,
      },
      {
        path: '/dfir/atlas',
        useCase: 'Reference MITRE ATLAS techniques.',
        label: 'MITRE ATLAS',
        desc: 'Adversarial-ML technique matrix. tactics + techniques for AI/ML attack surface · live from mitre/atlas-data',
        icon: Crosshair,
      },
      {
        path: '/dfir/zero-trust-ai-agents',
        useCase: 'Read the reference card for securing AI agent identities and tool calls.',
        label: 'Zero Trust for AI Agents',
        desc: 'Static reference card / infographic recasting Zero Trust principles (verify explicitly, least privilege, assume breach) for the AI-agent threat surface — identity, prompts, tool calls, memory, exfil paths. Phase-by-phase workflow, model + data + supply-chain control matrix, and detection signals.',
        icon: ShieldCheck,
      },
    ],
  },
  {
    id: 'dark-web',
    group: 'recon',
    label: 'Dark Web Workbench',
    blurb: 'PGP operations, .onion gateway links, and reference resources for dark web investigations.',
    tools: [
      {
        path: '/dfir/pgp-tool',
        useCase: 'Encrypt, decrypt, sign, or verify PGP messages during an investigation.',
        label: 'PGP Tool',
        desc: 'Encrypt · Decrypt · Sign · Verify · Generate keys · OpenPGP.js · 100% client-side',
        icon: Lock,
      },
      {
        path: '/dfir/tor-gateway',
        useCase: 'Generate a clearnet link to access a .onion service.',
        label: 'Tor Gateway',
        desc: '.onion → Tor2web / Tor.link / Onion.ws gateway links · paste .onion address → get 6 gateway URLs',
        icon: Globe2,
      },
    ],
  },
  {
    id: 'reference',
    group: 'recon',
    label: 'Personal & Privacy',
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
      {
        path: '/dfir/personal-security',
        useCase: 'Work through a personal OPSEC / cybersecurity checklist.',
        label: 'Personal Security Checklist',
        desc: 'OPSEC audit across accounts, devices, network, travel, comms, crypto & family · mark-done progress · exportable report',
        icon: ShieldCheck,
      },
    ],
  },
  {
    id: 'cloud',
    group: 'specialized',
    label: 'Cloud Security',
    blurb: 'Cloud posture & least-privilege review. runs entirely in your browser.',
    tools: [
      {
        path: '/dfir/iam-analyzer',
        useCase: 'Catch wildcard-admin / public-access before it ships.',
        label: 'AWS IAM Policy Analyzer',
        desc: 'Paste an AWS IAM / S3 bucket / role-trust policy · flags wildcard admin, public principals, NotAction/NotResource, privilege-escalation actions, broad secret access & confused-deputy trust · 100% client-side',
        icon: Cloud,
      },
      {
        path: '/dfir/gcp-iam',
        useCase: 'Find the allUsers binding / owner role on a GCP project.',
        label: 'GCP IAM Policy Analyzer',
        desc: 'Paste a GCP allow policy or custom role · flags allUsers/allAuthenticatedUsers, primitive owner/editor, SA impersonation & key creation, setIamPolicy, wildcard custom-role permissions · 100% client-side',
        icon: Shield,
      },
      {
        path: '/dfir/azure-rbac',
        useCase: 'Find the SP that is Owner on the whole subscription.',
        label: 'Azure RBAC Analyzer',
        desc: 'Paste az role assignment / definition list JSON · flags privileged roles at root/MG/subscription scope, SP & guest grants, legacy co-admins, custom-role escalation (roleAssignments/write, elevateAccess, VM run-command, listKeys) · 100% client-side',
        icon: Lock,
      },
      {
        path: '/dfir/sg-analyzer',
        useCase: 'Find the database port someone left open to the world.',
        label: 'Security Group / NSG Analyzer',
        desc: 'Paste AWS describe-security-groups JSON or an Azure NSG · flags inbound rules open to 0.0.0.0/0 · ::/0 · "Internet", severity-ranked by service (SSH/RDP/DB/admin planes) · 100% client-side',
        icon: Network,
      },
      {
        path: '/dfir/cloudtrail-triage',
        useCase: 'Spot the no-MFA login + log-tampering in a CloudTrail dump.',
        label: 'CloudTrail Triage',
        desc: 'Paste CloudTrail JSON (file / lookup-events / array) · scores no-MFA & root logins, log/guardrail tampering, IAM changes, public exposure, snapshot sharing, recon bursts · 100% client-side',
        icon: ScrollText,
      },
      {
        path: '/dfir/k8s-rbac',
        useCase: 'Catch the service account that is secretly cluster-admin.',
        label: 'Kubernetes RBAC Analyzer',
        desc: 'Paste kubectl RBAC -o json · flags wildcard verbs/resources, escalate/bind/impersonate, cluster-wide secret read, pod exec, cluster-admin & anonymous bindings · 100% client-side',
        icon: KeyRound,
      },
      {
        path: '/dfir/terraform-scan',
        useCase: 'Block the public S3 bucket before terraform apply.',
        label: 'Terraform / IaC Plan Scanner',
        desc: 'Paste terraform show -json (plan/state) · flags public S3/RDS, world-open security groups, unencrypted storage, IMDSv1, wildcard IAM, public resource policies & hardcoded secrets · 100% client-side',
        icon: FileCheck,
      },
    ],
  },
  {
    id: 'api-sec',
    group: 'specialized',
    label: 'API Security',
    blurb: 'Spec, header, secret & GraphQL review. OWASP API Top 10, runs entirely in your browser.',
    tools: [
      {
        path: '/dfir/openapi-audit',
        useCase: 'Find the unauthenticated endpoint before it ships.',
        label: 'OpenAPI / Swagger Auditor',
        desc: 'Paste an OpenAPI 3 / Swagger 2 spec · OWASP API Top 10. unauth & BOLA-prone endpoints, query-string API keys, Basic/no-scope auth, plaintext HTTP, mass assignment, debug paths · 100% client-side',
        icon: Plug,
      },
      {
        path: '/dfir/sec-headers',
        useCase: 'Grade a site’s response headers in one paste.',
        label: 'HTTP Security Headers Analyzer',
        desc: 'Paste raw response headers · graded CSP / HSTS / framing / CORS / Set-Cookie flags + Server/X-Powered-By leakage, A–F score · 100% client-side',
        icon: Globe,
      },
      {
        path: '/dfir/secret-scan',
        useCase: 'Catch the leaked key in a config / log paste.',
        label: 'Secret / API-Key Scanner',
        desc: 'Paste code/.env/logs · detects AWS/GCP/Azure keys, GitHub/Slack/Stripe/SendGrid tokens, private keys, DB URIs, JWTs + high-entropy assignments · redacted · 100% client-side',
        icon: KeyRound,
      },
      {
        path: '/dfir/graphql-audit',
        useCase: 'Spot the passwordHash field in a GraphQL schema.',
        label: 'GraphQL Security Analyzer',
        desc: 'Paste introspection JSON or SDL · flags introspection exposure, sensitive/PII fields, auth-less mutations/subscriptions, recursive-type DoS surface · 100% client-side',
        icon: Share2,
      },
      {
        path: '/dfir/osv-scan',
        useCase: 'Find known CVEs in a lockfile before you ship it.',
        label: 'OSV Dependency Scanner',
        desc: 'Paste package-lock.json / package.json / requirements.txt / go.mod / Cargo.lock / Gemfile.lock · checks each package against OSV.dev · parsing client-side, fixed-version aware',
        icon: Database,
      },
    ],
  },
  // ─── Export Hub ────────────────────────────────────────────────────
  {
    id: 'export-hub',
    label: 'Export Hub',
    blurb: 'Export IOCs to 8 standard formats — STIX, MISP, Sigma, YARA, Snort, Suricata, CSV, pfSense.',
    group: 'specialized',
    tools: [
      {
        path: '/dfir/export-hub',
        useCase: 'Export IOCs to STIX 2.1 for sharing with partners.',
        label: 'Export Hub',
        desc: 'Export IOCs to 8 standard formats: STIX 2.1, MISP Event, Sigma, YARA, Snort, Suricata, CSV, pfSense Alias. Open standards, no paid services.',
        icon: Download,
      },
      {
        path: '/dfir/report-composer',
        useCase: 'Draft a multi-section investigation report in the browser.',
        label: 'Report Composer',
        desc: 'Cover · summary · findings · IOCs · sources · TLP marking · export to PDF (jsPDF) or DOCX (OOXML via JSZip) · localStorage autosave · 100% client-side',
        icon: FileText,
      },
      {
        path: '/dfir/report-analyzer',
        useCase: 'Paste a report URL/text and extract IOCs, TTPs, CVEs, and a STIX bundle in one round-trip.',
        label: 'Report Analyzer',
        desc: 'AI summary · IOC extraction (allowlist + confidence) · MITRE ATT&CK TTP mapping · 5W context · CVE extraction · image-OCR for embedded IOCs · STIX 2.1 bundle + mindmap',
        icon: ScanSearch,
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

/**
 * Total tool count includes everything (utilities + main tools). Kept as
 * the headline number elsewhere but the hub landing also computes the
 * "main" count (excluding utility-flagged tools) so the front door isn't
 * padded by hash-calculators and timestamp converters.
 */
export const TOOL_COUNT = SECTIONS.reduce((n, s) => n + s.tools.length, 0);

/** Tools that aren't flagged with `utility: true`. */
export const MAIN_TOOL_COUNT = SECTIONS.reduce((n, s) => n + s.tools.filter((t) => !t.utility).length, 0);

/** Just the utility tools, flat. The hub renders these under a separate
 *  "Utilities & converters" collapsible at the bottom of the tool grid. */
export const UTILITY_TOOLS: Tool[] = SECTIONS.flatMap((s) => s.tools.filter((t) => t.utility));

export { EXTERNAL };
