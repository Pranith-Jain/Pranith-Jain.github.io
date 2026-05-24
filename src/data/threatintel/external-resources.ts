// src/data/threatintel/external-resources.ts
/**
 * External resources catalog — sites and dashboards I cross-reference outside
 * this repo. Mixed kinds (training, lab, tool, dashboard, directory, samples,
 * community, research) so a single pill row drives the filter.
 *
 * Each entry has ONE `kind`. Sites that legitimately span multiple categories
 * (e.g. OpenSourceMalware: samples AND community) are tagged by their dominant
 * artefact; the description mentions the secondary aspect.
 *
 * Last verified 2026-05-14.
 */

export type ResourceKind =
  | 'training'
  | 'lab'
  | 'tool'
  | 'dashboard'
  | 'directory'
  | 'samples'
  | 'community'
  | 'research';

export interface ExternalResource {
  id: string;
  name: string;
  url: string;
  kind: ResourceKind;
  description: string;
  why?: string;
  /** Quality-content signal for research/discovery filtering. */
  featured?: true;
}

export const KIND_LABELS: Record<ResourceKind, string> = {
  training: 'Training',
  lab: 'Lab',
  tool: 'Tool',
  dashboard: 'Dashboard',
  directory: 'Directory',
  samples: 'Samples',
  community: 'Community',
  research: 'Research',
};

export const KIND_BLURB: Record<ResourceKind, string> = {
  training: 'Structured courses and learning paths.',
  lab: 'Interactive hands-on environments and playgrounds.',
  tool: 'Off-site utilities you run against an indicator or asset.',
  dashboard: 'Hosted dashboards and visual feeds you read.',
  directory: 'Curated indexes pointing at other resources.',
  samples: 'Datasets, malware corpora, and credential dumps.',
  community: 'Forums, Discords, and practitioner hubs.',
  research: 'Methodology, whitepapers, and adversarial-testing frameworks.',
};

export const KIND_PILL: Record<ResourceKind, string> = {
  training: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  lab: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  tool: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  dashboard: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  directory: 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  samples: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
  community: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  research: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
};

export const RESOURCES: ExternalResource[] = [
  // Migrated from src/pages/threatintel/Home.tsx (External Sources block, 2026-05-14).
  // Descriptions copied verbatim — no rewriting in this commit.
  {
    id: 'my-threat-intel',
    name: 'My Threat Intel',
    url: 'https://www.mythreatintel.com/?lang=en',
    kind: 'dashboard',
    description:
      'Live ransomware dashboard · country / sector / timeline charts · 180+ ransomware groups with ransom-note transcripts and leak-site screenshots',
  },
  {
    id: 'deepdark-cti',
    name: 'deepdarkCTI',
    url: 'https://github.com/fastfire/deepdarkCTI',
    kind: 'directory',
    description: 'Continuously updated repository of dark-web and CTI sources, by fastfire',
  },
  {
    id: 'threat-landscape-free-tools',
    name: 'Threat Landscape Free Tools',
    url: 'https://threatlandscape.io/free-tools',
    kind: 'directory',
    description: 'Curated free DFIR and threat-intel tools directory',
  },
  {
    id: 'vecert-analyzer',
    name: 'Vecert Analyzer',
    url: 'https://analyzer.vecert.io/index',
    kind: 'tool',
    description: 'Free file and indicator analyzer for incident response',
  },
  {
    id: 'world-monitor',
    name: 'World Monitor',
    url: 'https://www.worldmonitor.app',
    kind: 'dashboard',
    description: 'Real-time OSINT dashboard, news, markets, ADS-B and AIS tracking across 435+ sources',
  },
  {
    id: 'osint-tools',
    name: 'OSINT Tools',
    url: 'https://osinttools.io/tools',
    kind: 'directory',
    description: 'Curated OSINT directory',
  },
  {
    id: 'osintrack',
    name: 'OSINTrack',
    url: 'https://osintrack.com/',
    kind: 'tool',
    description: 'OSINT investigation tracker',
  },
  {
    id: 'ai-soc',
    name: 'AI SOC',
    url: 'https://aisoc.pplx.app/',
    kind: 'lab',
    description: 'AI-assisted SOC playground by Perplexity Labs.',
  },
  {
    id: 'leakradar',
    name: 'LeakRadar',
    url: 'https://leakradar.io/en/leaks',
    kind: 'tool',
    description:
      '290B+ leaked credentials indexed from stealer logs, combolists, and database dumps. REST API + Telegram/Slack/webhook alerts.',
  },
  {
    id: 'serus',
    name: 'Serus',
    url: 'https://serus.ai',
    kind: 'tool',
    description:
      'AI-powered data-exposure monitoring and dark-web surveillance for individuals and orgs. Combines breach search with takedown automation.',
  },

  // New entries (2026-05-14). Descriptions verified against each site.
  {
    id: 'opensourcemalware',
    name: 'OpenSourceMalware',
    url: 'https://opensourcemalware.com/',
    kind: 'samples',
    description: 'Community-driven platform for sharing and analysing malware samples and threat intelligence.',
  },
  {
    id: 'ai-goat',
    name: 'AI Goat',
    url: 'https://aigoat.co.in/learn/',
    kind: 'lab',
    featured: true,
    description:
      'Open-source AI security playground for hands-on LLM red teaming — prompt injection, RAG poisoning, OWASP LLM Top 10 — runs fully offline.',
  },
  {
    id: 'vulnos',
    name: 'VulnOS',
    url: 'https://learn.vulnos.tech/index.html',
    kind: 'training',
    featured: true,
    description: 'Cybersecurity learning platform with practical, interactive labs for hands-on skill building.',
  },
  {
    id: 'black-ledger-security',
    name: 'Black Ledger Security',
    url: 'https://blackledgersecurity.ai/',
    kind: 'research',
    featured: true,
    description:
      'Research portfolio publishing AI/LLM security findings and the SPECTRA framework for context-aware adversarial testing of production AI deployments.',
  },
  {
    id: 'webverse-labs-pro',
    name: 'WebVerse Labs Pro',
    url: 'https://webverselabs-pro.com/',
    kind: 'lab',
    featured: true,
    description:
      'Web-app pentest training platform — 36 labs across 5 difficulty tiers with XP, leaderboards, and vulnerability-chaining scenarios.',
  },
  {
    id: 'redteam-community',
    name: 'Red Team Community',
    url: 'https://www.redteam.community/',
    kind: 'community',
    description: 'Red-team practitioner community hub.',
  },
  {
    id: 'hunter-how',
    name: 'hunter.how',
    url: 'https://hunter.how/',
    kind: 'tool',
    description:
      'Internet asset search engine in the Shodan/Censys/FOFA family. Fingerprints 500+ network protocols across 2,000+ products with country, SSL-certificate, and subdomain filters. Free daily quota; paid plans for higher throughput.',
  },
  // ── New entries (2026-05-16) ─────────────────────────────────────────────
  {
    id: 'darkfeed-io',
    name: 'Darkfeed.io',
    url: 'https://darkfeed.io/free-dashboard/',
    kind: 'dashboard',
    description:
      'Real-time threat intelligence dashboard aggregating IOCs, dark-web activity, and adversary infrastructure indicators from multiple sources. Free tier available.',
  },
  {
    id: 'deepfind-me',
    name: 'DeepFind.Me',
    url: 'https://deepfind.me/tools',
    kind: 'tool',
    description:
      'Comprehensive OSINT toolkit — username search (50+ platforms), geolocation, email/domain recon, metadata extraction, dark-web link checker, crypto wallet tracking, and more. REST API available.',
  },
  {
    id: 'ai-supply-chain-observatory',
    name: 'AI Supply Chain Observatory',
    url: 'https://ai-supply-chain-observatory.vercel.app/',
    kind: 'dashboard',
    featured: true,
    description:
      'Visual dashboard tracking AI supply-chain risks, model provenance, and dependency vulnerabilities across the ML ecosystem.',
  },
  {
    id: 'darkweb-daily',
    name: 'DarkWebDaily',
    url: 'https://darkwebdaily.live/',
    kind: 'dashboard',
    description:
      'Curated dark-web news aggregator — breach announcements, ransomware claims, and underground forum highlights delivered in a daily digest format.',
  },
  {
    id: 'haxor-llm-security',
    name: 'LLM Security Slides',
    url: 'https://haxor44.github.io/llm-security-slides/#1',
    kind: 'research',
    featured: true,
    description:
      'Presentation covering LLM attack surfaces, prompt injection techniques, jailbreaking methodologies, and AI red-teaming tradecraft.',
  },
  {
    id: 'geniebot',
    name: 'GenieBot',
    url: 'https://geniebot.pro/',
    kind: 'tool',
    description: 'AI-powered security assistant and chatbot for threat intelligence queries and security automation.',
  },
  {
    id: 'web-check',
    name: 'Web Check',
    url: 'https://web-check.xyz/',
    kind: 'tool',
    featured: true,
    description:
      'All-in-one website analysis tool — DNS, SSL, headers, WHOIS, tech stack, performance, and security audit from a single URL input.',
  },
  {
    id: 'claude101',
    name: 'Claude 101',
    url: 'https://claude101.com/',
    kind: 'training',
    description:
      'Learning resource hub for Claude AI — prompt engineering guides, use-case examples, and best practices for Anthropic Claude.',
  },
  {
    id: 'appsec-master',
    name: 'AppSec Master',
    url: 'https://www.appsecmaster.net/en',
    kind: 'training',
    featured: true,
    description:
      'Interactive application security training platform — hands-on labs covering OWASP Top 10, API security, and secure coding practices.',
  },
  {
    id: 'osinttools-io',
    name: 'OSINT Tools',
    url: 'https://osinttools.io/',
    kind: 'directory',
    featured: true,
    description:
      'Curated directory of OSINT tools with community collections, featured tool listings, and new-tool discovery feed.',
  },
  {
    id: 'databreach-com',
    name: 'DataBreach.com',
    url: 'https://databreach.com/',
    kind: 'tool',
    description:
      'Data breach search platform — check if credentials or personal data have been exposed in known breaches. Also provides breach monitoring alerts.',
  },
  {
    id: 'malwareworld',
    name: 'MalwareWorld',
    url: 'https://malwareworld.com/',
    kind: 'dashboard',
    featured: true,
    description:
      'Aggregated threat intelligence from 100+ public blacklists. Search IPs/domains, view threat maps, download categorized blocklists (bad reputation, malware, spam, phishing, cryptocurrency, DGA).',
  },
  {
    id: 'hacktricks-tools',
    name: 'HackTricks Tools',
    url: 'https://tools.hacktricks.wiki/',
    kind: 'tool',
    featured: true,
    description:
      'Interactive security tools by HackTricks — domain/DNS auditor, host checker, clickjacking PoC generator, GitHub leaks scanner, AI chatbot, and cloud IAM auditor (PEASS).',
  },
  {
    id: 'osv-dev',
    name: 'OSV.dev',
    url: 'https://osv.dev/list',
    kind: 'tool',
    featured: true,
    description:
      'Open Source Vulnerabilities database — Google-backed, API-first vulnerability feed covering PyPI, npm, Go, Maven, and other ecosystems with ecosystem-agnostic schema.',
  },
  {
    id: 'digital-defense',
    name: 'Digital Defense',
    url: 'https://digital-defense.io/',
    kind: 'tool',
    description:
      'OPSEC and privacy toolkit — guides and checklists for operational security, digital footprint reduction, and secure communications.',
  },
  {
    id: 'awesome-privacy',
    name: 'Awesome Privacy',
    url: 'https://awesome-privacy.xyz/',
    kind: 'directory',
    description:
      'Curated list of privacy-focused tools and services — VPNs, encrypted messaging, password managers, analytics alternatives, and privacy hardware.',
  },
  {
    id: 'bitwire-blocklist',
    name: 'BitWire IP Blocklist',
    url: 'https://bitwire.it/blocklist-stats',
    kind: 'tool',
    description:
      'Open-source IP blocklist with statistics and live feed. Covers malicious IPs across multiple threat categories. REST API and downloadable blocklists.',
  },
  {
    id: 'crowdthreat',
    name: 'CrowdThreat',
    url: 'https://www.crowdthreat.com/',
    kind: 'dashboard',
    description:
      'Threat intelligence dashboard — cross-references IOCs, threat actor profiles, and campaign tracking. Includes OSINT tools section at /osint_tools.',
  },
  {
    id: 'ti-mindmap-hub',
    name: 'TI Mindmap Hub',
    url: 'https://ti-mindmap-hub.com/',
    kind: 'tool',
    description:
      'Interactive threat intelligence mindmap — visual navigation of TTPs, threat actors, campaigns, and detection strategies mapped to the MITRE ATT&CK framework.',
  },
  {
    id: 'insider-threat-matrix',
    name: 'Insider Threat Matrix',
    url: 'https://insiderthreatmatrix.org/',
    kind: 'research',
    featured: true,
    description:
      'Comprehensive insider threat framework covering indicators, detection methods, mitigation strategies, and case studies across personas and attack vectors.',
  },
  {
    id: 'orca-osintcti',
    name: 'Orca OSINT/CTI',
    url: 'https://orca.osintcti.com/',
    kind: 'tool',
    description:
      'OSINT and cyber threat intelligence platform — unified search across multiple data sources for indicators, threat actors, and infrastructure discovery.',
  },
  {
    id: 'redhunt-labs-research',
    name: 'RedHunt Labs Research',
    url: 'https://research.redhuntlabs.com/',
    kind: 'research',
    featured: true,
    description:
      'Security research blog from RedHunt Labs — attack surface management insights, vulnerability disclosures, and adversary infrastructure tracking write-ups.',
  },
  {
    id: 'aidefend',
    name: 'AIDefend',
    url: 'https://aidefend.net/',
    kind: 'tool',
    description:
      'AI-powered cybersecurity defense platform — automated threat detection, response orchestration, and security posture management.',
  },
  {
    id: 'cyber-laws',
    name: 'Cyber Laws',
    url: 'https://cyber-laws.com/en/',
    kind: 'research',
    description:
      'Legal reference platform for cybersecurity regulations worldwide — GDPR, CCPA, HIPAA, DPDP, and cross-border data protection frameworks with jurisdictional analysis.',
  },
  {
    id: 'kongsec-osai-notes',
    name: 'KongSec OSAI Notes',
    url: 'https://kongsec.github.io/OSAINotesResearch/',
    kind: 'research',
    featured: true,
    description:
      'Research notes on offensive AI security — prompt injection, LLM red-teaming, AI supply-chain attacks, and adversarial ML techniques.',
  },
  {
    id: 'mjolnir-intel',
    name: 'Mjolnir Intelligence',
    url: 'https://intel.mjolnirsecurity.com/',
    kind: 'dashboard',
    description:
      'Threat intelligence dashboard — IOC feeds, campaign tracking, and real-time security event monitoring from Mjolnir Security.',
  },
  {
    id: 'mjolnir-vulnot',
    name: 'Mjolnir VulnOT',
    url: 'https://vulnot.mjolnirlabs.com/',
    kind: 'tool',
    description:
      'Vulnerability notes and OT/IoT security advisory aggregator — CVE tracking, exploit POC references, and remediation guidance for operational technology.',
  },
  {
    id: 'owasp-ai-visualizer',
    name: 'OWASP AI Security Visualizer',
    url: 'https://ricokomenda.github.io/owasp-ai-security-visualizer/',
    kind: 'tool',
    featured: true,
    description:
      'Interactive visualizer for the OWASP AI Security landscape — maps AI-specific threats, vulnerabilities, and controls across the ML lifecycle.',
  },
  {
    id: 'cybersectools',
    name: 'CyberSecTools',
    url: 'https://cybersectools.com/',
    kind: 'directory',
    featured: true,
    description:
      'Curated catalog of cybersecurity tools organized by category — penetration testing, forensics, OSINT, red teaming, and blue team operations.',
  },
  {
    id: 'sigma-nasbench',
    name: 'Sigma Rule Explorer (nasbench)',
    url: 'https://sigma.nasbench.dev/',
    kind: 'tool',
    featured: true,
    description:
      'Interactive Sigma rule browser — search, filter, and explore Sigma detection rules with SIEM conversion previews for Splunk, Elastic, QRadar, and more.',
  },
  {
    id: 'ghostint-tools',
    name: 'Ghostint Tools',
    url: 'https://cyberz7.github.io/Ghostint-Tools/',
    kind: 'directory',
    featured: true,
    description:
      'Curated OSINT and cybersecurity tools directory — categorized tools for reconnaissance, social media investigation, and digital forensics.',
  },
  {
    id: 'arcanum-ai-sec',
    name: 'Arcanum AI Security Resources',
    url: 'https://arcanum-sec.github.io/ai-sec-resources/',
    kind: 'research',
    featured: true,
    description:
      'Curated resources on AI/ML security — papers, tools, frameworks, and CTF challenges focused on adversarial ML, LLM security, and AI red teaming.',
  },
  {
    id: 'extsentry-feeds',
    name: 'ExtSentry Feeds',
    url: 'https://extsentry.github.io/#feeds/malicious',
    kind: 'tool',
    description:
      'Browser extension threat feeds — curated list of malicious browser extensions tracked via abuse reports and security research.',
  },
  {
    id: 'hocsec',
    name: 'HOCSEC',
    url: 'https://hackersonlineclub.com/hocsec/',
    kind: 'directory',
    description:
      'Cybersecurity tools and resources directory by Hackers Online Club — categorized security tools, learning resources, and community projects.',
  },
  {
    id: 'quanqiuchongtu',
    name: 'Quanqiuchongtu',
    url: 'https://quanqiuchongtu.com/',
    kind: 'dashboard',
    description:
      'Global cybersecurity conflict monitoring dashboard — tracks nation-state cyber operations, hacktivist campaigns, and geopolitical cyber events.',
  },
  {
    id: 'map-wddadk',
    name: 'Cyber Threat Map (wddadk)',
    url: 'https://map.wddadk.com/',
    kind: 'dashboard',
    description:
      'Live cyber threat attack map — real-time visualization of cyber attacks, DDoS events, and scanning activity across global infrastructure.',
  },
  {
    id: 'apt28-victimology',
    name: 'APT28 Victimology',
    url: 'https://apt-28.victimology.infrawatch.com/',
    kind: 'dashboard',
    featured: true,
    description:
      'APT28 (Fancy Bear) victimology dashboard — tracks known targets, campaigns, and infrastructure attribution for the Russian state-sponsored threat actor.',
  },
  {
    id: 'kilaz-net',
    name: 'Kilaz.net',
    url: 'https://kilaz.net/',
    kind: 'research',
    featured: true,
    description:
      'Security research and threat intelligence blog — APT analysis, malware reverse engineering, and cybercrime ecosystem investigations.',
  },
  {
    id: 'mail-thc',
    name: 'THC Mail',
    url: 'https://mail.thc.org/',
    kind: 'tool',
    description:
      'The Hackers Choice mail service — privacy-focused email with security features for the infosec community.',
  },
  {
    id: 'crowdthreat-osint',
    name: 'CrowdThreat OSINT Tools',
    url: 'https://www.crowdthreat.com/osint_tools',
    kind: 'directory',
    description:
      'Curated OSINT tools section within CrowdThreat — categorized open-source intelligence tools for digital investigations.',
  },
  {
    id: 'dmarc-labs',
    name: 'DMARC Labs',
    url: 'https://www.dmarclabsds1.xyz/',
    kind: 'tool',
    description:
      'Free DMARC RUA report analyzer — privacy-first, in-memory XML parsing with IP enrichment, SPF/DKIM/DMARC alignment per sender. See also /dfir/dmarc-analyzer on this site.',
  },
  {
    id: 'osv-api',
    name: 'OSV.dev API',
    url: 'https://osv.dev/#use-the-api',
    kind: 'tool',
    description:
      'Open Source Vulnerabilities REST API — query by package/version or commit hash to identify known vulnerabilities across open-source ecosystems.',
  },
  {
    id: 'hudsonrock-free-tools',
    name: 'Hudson Rock Free Tools',
    url: 'https://www.hudsonrock.com/free-tools',
    kind: 'tool',
    description:
      'Free infostealer exposure check — search by email, domain, or username for compromised credentials from infostealer infections. By Hudson Rock.',
  },
  {
    id: 'infostealers-victims',
    name: 'InfoStealers.com Victims',
    url: 'https://www.infostealers.com/infostealer-victims/',
    kind: 'dashboard',
    description:
      'Infostealer victims dashboard by Hudson Rock — browse compromised machines, employees, and domains per infostealer family.',
  },
];
