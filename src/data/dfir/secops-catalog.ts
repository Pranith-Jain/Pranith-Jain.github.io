/**
 * Curated SecOps tools catalog.
 *
 * Hand-picked across the categories a working analyst actually reaches
 * for — not an exhaustive directory. Quality > quantity. Each entry:
 *   - is currently live and reachable as of last review
 *   - has a clear primary use-case in 1–2 sentences
 *   - declares its pricing posture honestly (open-source vs free
 *     freemium vs paid-only) — see the standing improvement-goal doc:
 *     paid services are listed as outbound URL pivots, not proxied.
 *
 * Inspired by but distinct from /threatintel/osint-framework — that page is
 * OSINT-only with deeper coverage of search/recon angles. This one
 * spans the whole SecOps surface.
 *
 * Adding entries: keep the description concrete (what it does, not
 * marketing). If the tool is open-source, fill source_url. If the
 * primary value is "list of paid tools to know about", that's still
 * fair — the analyst needs to know the landscape exists.
 */

export type Pricing = 'open-source' | 'free' | 'freemium' | 'paid';

export type Category =
  | 'osint'
  | 'dfir'
  | 'threat-intel'
  | 'ai-security'
  | 'malware-analysis'
  | 'vulnerability'
  | 'data-security'
  | 'detection-engineering'
  | 'email-security'
  | 'network-security'
  | 'cloud-security'
  | 'appsec'
  | 'secrets-iam'
  | 'pentest-redteam';

export interface Tool {
  id: string;
  name: string;
  url: string;
  categories: Category[];
  pricing: Pricing;
  description: string;
  /** GitHub or canonical source repo when open-source. */
  source_url?: string;
  /** Optional one-word badge: "industry-standard", "essential", "deprecated", etc. */
  badge?: string;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  osint: 'OSINT',
  dfir: 'DFIR / IR',
  'threat-intel': 'Threat Intelligence',
  'ai-security': 'AI / LLM Security',
  'malware-analysis': 'Malware Analysis',
  vulnerability: 'Vulnerability Mgmt',
  'data-security': 'Data Security / DLP',
  'detection-engineering': 'Detection Engineering',
  'email-security': 'Email Security',
  'network-security': 'Network Security',
  'cloud-security': 'Cloud Security',
  appsec: 'AppSec / Web',
  'secrets-iam': 'Secrets & IAM',
  'pentest-redteam': 'Pentest / Red Team',
};

export const CATEGORY_BLURB: Record<Category, string> = {
  osint: 'Open-source intelligence — reconnaissance, attribution, public-record pivots.',
  dfir: 'Forensics, incident response, memory + disk + endpoint analysis, IR orchestration.',
  'threat-intel': 'IOC feeds, actor tracking, intel platforms, ATT&CK navigation.',
  'ai-security': 'LLM red-teaming, prompt-injection scanners, model robustness, AI governance.',
  'malware-analysis': 'Static + dynamic analysis, sandboxing, reverse engineering, signature authoring.',
  vulnerability: 'CVE databases, exploit catalogs, EPSS, scanner platforms.',
  'data-security': 'Secrets scanning, DLP, classification, data-loss prevention engines.',
  'detection-engineering': 'SIEM rule libraries, hunting frameworks, adversary emulation.',
  'email-security': 'DMARC/SPF/DKIM tooling, header analysis, gateway products.',
  'network-security': 'IDS/IPS, packet capture, network scanners, traffic analysis.',
  'cloud-security': 'CSPM, CWPP, IaC scanning, cloud-native attack tooling.',
  appsec: 'SAST, DAST, web application scanners, fuzzing, recon for bug-bounty.',
  'secrets-iam': 'Secrets management, identity providers, zero-trust gateways.',
  'pentest-redteam': 'Offensive frameworks, C2, adversary emulation, post-exploitation.',
};

export const PRICING_LABELS: Record<Pricing, string> = {
  'open-source': 'Open Source',
  free: 'Free',
  freemium: 'Freemium',
  paid: 'Paid',
};

export const TOOLS: Tool[] = [
  // ── OSINT ──────────────────────────────────────────────────────────────
  {
    id: 'maltego',
    name: 'Maltego',
    url: 'https://www.maltego.com',
    categories: ['osint', 'threat-intel'],
    pricing: 'freemium',
    description:
      'Graph-based investigation platform. Community Edition is free with limited transforms; full transforms in paid tiers.',
    badge: 'industry-standard',
  },
  {
    id: 'spiderfoot',
    name: 'SpiderFoot',
    url: 'https://www.spiderfoot.net',
    categories: ['osint'],
    pricing: 'open-source',
    description: 'Automated OSINT scanner — 200+ modules pivoting from a single starting point (domain, IP, person).',
    source_url: 'https://github.com/smicallef/spiderfoot',
  },
  {
    id: 'sherlock',
    name: 'Sherlock',
    url: 'https://sherlockproject.xyz',
    categories: ['osint'],
    pricing: 'open-source',
    description: 'Username enumeration across 400+ social networks. The canonical username-pivot CLI.',
    source_url: 'https://github.com/sherlock-project/sherlock',
  },
  {
    id: 'theharvester',
    name: 'theHarvester',
    url: 'https://github.com/laramies/theHarvester',
    categories: ['osint', 'pentest-redteam'],
    pricing: 'open-source',
    description:
      'Email + subdomain + name harvesting from public sources (search engines, PGP key servers, LinkedIn, etc).',
    source_url: 'https://github.com/laramies/theHarvester',
  },
  {
    id: 'recon-ng',
    name: 'recon-ng',
    url: 'https://github.com/lanmaster53/recon-ng',
    categories: ['osint'],
    pricing: 'open-source',
    description: 'Modular framework for web-based recon, modeled after Metasploit. Extensible via marketplace modules.',
    source_url: 'https://github.com/lanmaster53/recon-ng',
  },
  {
    id: 'shodan',
    name: 'Shodan',
    url: 'https://www.shodan.io',
    categories: ['osint', 'network-security', 'vulnerability'],
    pricing: 'freemium',
    description:
      'Search engine for internet-exposed devices and services. Free tier limited; query credits sold per query.',
    badge: 'industry-standard',
  },
  {
    id: 'censys',
    name: 'Censys',
    url: 'https://search.censys.io',
    categories: ['osint', 'network-security'],
    pricing: 'freemium',
    description:
      'Internet-wide scan data (hosts + certificates + leaked configs). Free tier limited; paid for higher quotas.',
  },
  {
    id: 'binaryedge',
    name: 'BinaryEdge',
    url: 'https://www.binaryedge.io',
    categories: ['osint', 'network-security'],
    pricing: 'freemium',
    description: 'Internet attack-surface intelligence — exposed services, leaks, ICS/SCADA detection.',
  },
  {
    id: 'fofa',
    name: 'FOFA',
    url: 'https://en.fofa.info',
    categories: ['osint', 'network-security'],
    pricing: 'freemium',
    description:
      'Chinese-origin alternative to Shodan. Strong coverage of APAC infrastructure; useful for cross-checking.',
  },
  {
    id: 'intelx',
    name: 'IntelligenceX',
    url: 'https://intelx.io',
    categories: ['osint', 'threat-intel'],
    pricing: 'freemium',
    description:
      'Search across breach dumps, paste sites, dark-web mirrors, leaked git repos. Free tier shows preview only.',
  },
  {
    id: 'whatsmyname',
    name: 'WhatsMyName',
    url: 'https://whatsmyname.app',
    categories: ['osint'],
    pricing: 'open-source',
    description:
      'Browser-based username search across 580+ sites. The data file is also consumed by other OSINT tools.',
    source_url: 'https://github.com/WebBreacher/WhatsMyName',
  },

  // ── DFIR / IR ──────────────────────────────────────────────────────────
  {
    id: 'volatility3',
    name: 'Volatility 3',
    url: 'https://www.volatilityfoundation.org',
    categories: ['dfir', 'malware-analysis'],
    pricing: 'open-source',
    description:
      'Memory forensics framework. The de facto tool for extracting processes, network connections, and injected code from RAM dumps.',
    source_url: 'https://github.com/volatilityfoundation/volatility3',
    badge: 'industry-standard',
  },
  {
    id: 'autopsy',
    name: 'Autopsy',
    url: 'https://www.autopsy.com',
    categories: ['dfir'],
    pricing: 'open-source',
    description:
      'Disk-image forensics GUI built on The Sleuth Kit. Timeline analysis, keyword search, deleted-file recovery.',
    source_url: 'https://github.com/sleuthkit/autopsy',
  },
  {
    id: 'sleuthkit',
    name: 'The Sleuth Kit',
    url: 'https://www.sleuthkit.org',
    categories: ['dfir'],
    pricing: 'open-source',
    description: 'CLI library underpinning Autopsy. Filesystem-level forensics for NTFS / FAT / ExFAT / Ext / HFS+.',
    source_url: 'https://github.com/sleuthkit/sleuthkit',
  },
  {
    id: 'plaso',
    name: 'Plaso / log2timeline',
    url: 'https://plaso.readthedocs.io',
    categories: ['dfir'],
    pricing: 'open-source',
    description:
      'Super-timeline generator — extracts timestamps from 200+ artifacts and produces a single CSV/JSON timeline.',
    source_url: 'https://github.com/log2timeline/plaso',
  },
  {
    id: 'kape',
    name: 'KAPE',
    url: 'https://www.kroll.com/en/insights/publications/cyber/kroll-artifact-parser-extractor-kape',
    categories: ['dfir'],
    pricing: 'free',
    description:
      "Kroll's triage collector — runs on a target host, extracts forensic artifacts in under 10 minutes. Free for non-commercial use.",
  },
  {
    id: 'velociraptor',
    name: 'Velociraptor',
    url: 'https://docs.velociraptor.app',
    categories: ['dfir', 'detection-engineering'],
    pricing: 'open-source',
    description:
      'Endpoint visibility and DFIR-at-scale. Custom VQL queries against fleets of agents — collect, hunt, respond.',
    source_url: 'https://github.com/Velocidex/velociraptor',
  },
  {
    id: 'osquery',
    name: 'osquery',
    url: 'https://osquery.io',
    categories: ['dfir', 'detection-engineering'],
    pricing: 'open-source',
    description: 'Treat the OS as a SQL database. Query running processes, listening sockets, kernel modules, etc.',
    source_url: 'https://github.com/osquery/osquery',
  },
  {
    id: 'thehive',
    name: 'TheHive',
    url: 'https://thehive-project.org',
    categories: ['dfir', 'threat-intel'],
    pricing: 'freemium',
    description:
      'Open-source SIRP (Security Incident Response Platform). Case management + observable enrichment via Cortex.',
    source_url: 'https://github.com/TheHive-Project/TheHive',
  },
  {
    id: 'cortex',
    name: 'Cortex',
    url: 'https://github.com/TheHive-Project/Cortex',
    categories: ['dfir', 'threat-intel'],
    pricing: 'open-source',
    description:
      'Observable analyzer + responder engine. ~100 analyzers (VirusTotal, abuse.ch, MISP, etc) callable from TheHive.',
    source_url: 'https://github.com/TheHive-Project/Cortex',
  },
  {
    id: 'misp',
    name: 'MISP',
    url: 'https://www.misp-project.org',
    categories: ['threat-intel', 'dfir'],
    pricing: 'open-source',
    description:
      'Threat-intelligence sharing platform. Standard format for IOC exchange between teams; integrates with most SIEMs.',
    source_url: 'https://github.com/MISP/MISP',
    badge: 'industry-standard',
  },
  {
    id: 'grr',
    name: 'GRR Rapid Response',
    url: 'https://grr-doc.readthedocs.io',
    categories: ['dfir'],
    pricing: 'open-source',
    description:
      "Google's remote-live-forensics framework. Hunt for IOCs across thousands of endpoints from a central console.",
    source_url: 'https://github.com/google/grr',
  },
  {
    id: 'magnet-axiom',
    name: 'Magnet AXIOM',
    url: 'https://www.magnetforensics.com/products/magnet-axiom',
    categories: ['dfir'],
    pricing: 'paid',
    description: 'Commercial DFIR suite — disk + mobile + cloud + memory in one workflow. Paid; widely used by LE.',
  },

  // ── Threat Intelligence ────────────────────────────────────────────────
  {
    id: 'opencti',
    name: 'OpenCTI',
    url: 'https://www.filigran.io/en/products/opencti/',
    categories: ['threat-intel'],
    pricing: 'open-source',
    description:
      'STIX-2.1-native threat-intelligence platform. Knowledge-graph relationships, connectors for 100+ sources.',
    source_url: 'https://github.com/OpenCTI-Platform/opencti',
  },
  {
    id: 'mitre-attack',
    name: 'MITRE ATT&CK',
    url: 'https://attack.mitre.org',
    categories: ['threat-intel', 'detection-engineering'],
    pricing: 'open-source',
    description:
      'Adversary tactics + techniques knowledge base. The shared vocabulary for describing attacker behaviour.',
    badge: 'industry-standard',
  },
  {
    id: 'attack-navigator',
    name: 'ATT&CK Navigator',
    url: 'https://mitre-attack.github.io/attack-navigator/',
    categories: ['threat-intel', 'detection-engineering'],
    pricing: 'open-source',
    description: 'Layer the ATT&CK matrix with your detection coverage, actor tradecraft, or threat assessment.',
    source_url: 'https://github.com/mitre-attack/attack-navigator',
  },
  {
    id: 'abuse-ch',
    name: 'abuse.ch',
    url: 'https://abuse.ch',
    categories: ['threat-intel'],
    pricing: 'free',
    description: 'URLhaus / MalwareBazaar / ThreatFox — free IOC feeds. Free API key on signup.',
    badge: 'essential',
  },
  {
    id: 'alienvault-otx',
    name: 'AlienVault OTX',
    url: 'https://otx.alienvault.com',
    categories: ['threat-intel'],
    pricing: 'free',
    description: 'Crowdsourced threat-intel pulses. Free API; integrates everywhere.',
  },
  {
    id: 'mandiant-advantage',
    name: 'Mandiant Advantage',
    url: 'https://advantage.mandiant.com',
    categories: ['threat-intel'],
    pricing: 'paid',
    description: 'Google Cloud / Mandiant TI platform. APT tracking, TTPs, finished intel reports. Enterprise-grade.',
  },
  {
    id: 'recorded-future',
    name: 'Recorded Future',
    url: 'https://www.recordedfuture.com',
    categories: ['threat-intel'],
    pricing: 'paid',
    description: 'AI-driven threat-intel platform. Wide source coverage, expensive.',
  },
  {
    id: 'crowdsec',
    name: 'CrowdSec',
    url: 'https://www.crowdsec.net',
    categories: ['threat-intel', 'network-security'],
    pricing: 'freemium',
    description:
      'Crowdsourced IP-reputation engine. Open-source agent + community blocklist; paid SaaS for premium feeds.',
    source_url: 'https://github.com/crowdsecurity/crowdsec',
  },
  {
    id: 'greynoise',
    name: 'GreyNoise',
    url: 'https://www.greynoise.io',
    categories: ['threat-intel', 'network-security'],
    pricing: 'freemium',
    description:
      'Identifies internet-background-noise scanners vs targeted activity. Free community tier (limited queries).',
  },

  // ── AI / LLM Security ──────────────────────────────────────────────────
  {
    id: 'garak',
    name: 'garak',
    url: 'https://github.com/leondz/garak',
    categories: ['ai-security'],
    pricing: 'open-source',
    description:
      "NVIDIA's LLM vulnerability scanner. Probes for prompt injection, jailbreaks, data leakage, toxic outputs.",
    source_url: 'https://github.com/leondz/garak',
    badge: 'essential',
  },
  {
    id: 'pyrit',
    name: 'PyRIT',
    url: 'https://github.com/Azure/PyRIT',
    categories: ['ai-security'],
    pricing: 'open-source',
    description: "Microsoft's Python Risk Identification Tool for generative AI. Automated red-teaming framework.",
    source_url: 'https://github.com/Azure/PyRIT',
  },
  {
    id: 'promptfoo',
    name: 'promptfoo',
    url: 'https://www.promptfoo.dev',
    categories: ['ai-security'],
    pricing: 'open-source',
    description: 'LLM eval + red-teaming. Configurable test suites for prompt injection, jailbreaks, harmful content.',
    source_url: 'https://github.com/promptfoo/promptfoo',
  },
  {
    id: 'guardrails-ai',
    name: 'Guardrails AI',
    url: 'https://www.guardrailsai.com',
    categories: ['ai-security'],
    pricing: 'open-source',
    description:
      'Validation library for LLM outputs. Composable validators (PII detection, toxicity, schema compliance).',
    source_url: 'https://github.com/guardrails-ai/guardrails',
  },
  {
    id: 'nemo-guardrails',
    name: 'NeMo Guardrails',
    url: 'https://github.com/NVIDIA/NeMo-Guardrails',
    categories: ['ai-security'],
    pricing: 'open-source',
    description: "NVIDIA's programmable guardrails layer for LLM apps. Define dialogue + safety rails in Colang DSL.",
    source_url: 'https://github.com/NVIDIA/NeMo-Guardrails',
  },
  {
    id: 'lakera-guard',
    name: 'Lakera Guard',
    url: 'https://www.lakera.ai',
    categories: ['ai-security'],
    pricing: 'freemium',
    description:
      'Hosted LLM-firewall API — prompt-injection + jailbreak + PII detection. Free tier limited; paid for production.',
  },
  {
    id: 'owasp-llm-top10',
    name: 'OWASP Top 10 for LLM Applications',
    url: 'https://owasp.org/www-project-top-10-for-large-language-model-applications/',
    categories: ['ai-security'],
    pricing: 'free',
    description:
      'Reference list of the top LLM-application risks (prompt injection, training-data poisoning, etc). Required reading.',
    badge: 'essential',
  },
  {
    id: 'art',
    name: 'Adversarial Robustness Toolbox',
    url: 'https://github.com/Trusted-AI/adversarial-robustness-toolbox',
    categories: ['ai-security'],
    pricing: 'open-source',
    description: 'Linux Foundation AI library for evaluating ML model robustness against adversarial examples.',
    source_url: 'https://github.com/Trusted-AI/adversarial-robustness-toolbox',
  },
  {
    id: 'mitre-atlas',
    name: 'MITRE ATLAS',
    url: 'https://atlas.mitre.org',
    categories: ['ai-security', 'threat-intel'],
    pricing: 'open-source',
    description: 'ATT&CK-style tactics + techniques for adversarial attacks on AI/ML systems.',
  },

  // ── Malware Analysis ───────────────────────────────────────────────────
  {
    id: 'virustotal',
    name: 'VirusTotal',
    url: 'https://www.virustotal.com',
    categories: ['malware-analysis', 'threat-intel'],
    pricing: 'freemium',
    description:
      'Multi-engine AV scanner + sandbox + relationship graph. Free tier limited (4/min); enterprise tier deep.',
    badge: 'industry-standard',
  },
  {
    id: 'any-run',
    name: 'ANY.RUN',
    url: 'https://any.run',
    categories: ['malware-analysis'],
    pricing: 'freemium',
    description:
      'Interactive malware sandbox. Free tier requires public submissions; paid tier private + advanced features.',
  },
  {
    id: 'joe-sandbox',
    name: 'Joe Sandbox',
    url: 'https://www.joesecurity.org',
    categories: ['malware-analysis'],
    pricing: 'freemium',
    description:
      'Deep behavioural analysis sandbox (Windows/Linux/macOS/Android/iOS). Cloud Basic is free with public reports.',
  },
  {
    id: 'hybrid-analysis',
    name: 'Hybrid Analysis',
    url: 'https://www.hybrid-analysis.com',
    categories: ['malware-analysis'],
    pricing: 'free',
    description: 'CrowdStrike Falcon Sandbox — free public submissions, API for vetted researchers.',
  },
  {
    id: 'malwarebazaar',
    name: 'MalwareBazaar',
    url: 'https://bazaar.abuse.ch',
    categories: ['malware-analysis', 'threat-intel'],
    pricing: 'free',
    description: 'Sample sharing platform from abuse.ch. Free hash + sample download for vetted researchers.',
  },
  {
    id: 'capa',
    name: 'capa',
    url: 'https://github.com/mandiant/capa',
    categories: ['malware-analysis'],
    pricing: 'open-source',
    description: "Mandiant's capability detector for executables. Tells you what a binary CAN do without running it.",
    source_url: 'https://github.com/mandiant/capa',
  },
  {
    id: 'yara',
    name: 'YARA',
    url: 'https://virustotal.github.io/yara/',
    categories: ['malware-analysis', 'detection-engineering'],
    pricing: 'open-source',
    description: 'Pattern-matching language for malware classification. The lingua franca of malware research.',
    source_url: 'https://github.com/VirusTotal/yara',
    badge: 'industry-standard',
  },
  {
    id: 'ghidra',
    name: 'Ghidra',
    url: 'https://ghidra-sre.org',
    categories: ['malware-analysis'],
    pricing: 'open-source',
    description:
      'NSA-released reverse-engineering framework. Free IDA Pro alternative — disassembler + decompiler + scripting.',
    source_url: 'https://github.com/NationalSecurityAgency/ghidra',
  },
  {
    id: 'radare2',
    name: 'radare2',
    url: 'https://www.radare.org',
    categories: ['malware-analysis'],
    pricing: 'open-source',
    description:
      'CLI reverse-engineering framework. Steep learning curve; powerful for scripted analysis. iaito GUI also available.',
    source_url: 'https://github.com/radareorg/radare2',
  },
  {
    id: 'ida-pro',
    name: 'IDA Pro',
    url: 'https://hex-rays.com/ida-pro/',
    categories: ['malware-analysis'],
    pricing: 'paid',
    description: 'Industry-standard interactive disassembler. Hex-Rays decompiler is the gold standard. Expensive.',
    badge: 'industry-standard',
  },
  {
    id: 'remnux',
    name: 'REMnux',
    url: 'https://remnux.org',
    categories: ['malware-analysis'],
    pricing: 'open-source',
    description: 'Linux distribution for malware analysis. Hundreds of pre-installed tools + curated workflows.',
  },
  {
    id: 'flarevm',
    name: 'FLARE-VM',
    url: 'https://github.com/mandiant/flare-vm',
    categories: ['malware-analysis'],
    pricing: 'open-source',
    description: "Mandiant's Windows VM provisioner for malware analysis + reverse engineering.",
    source_url: 'https://github.com/mandiant/flare-vm',
  },
  {
    id: 'pe-studio',
    name: 'PE-Studio',
    url: 'https://www.winitor.com',
    categories: ['malware-analysis'],
    pricing: 'freemium',
    description:
      'Static PE file analyzer. Highlights anomalies, imports, sections, indicators. Free for non-commercial use.',
  },
  {
    id: 'detect-it-easy',
    name: 'Detect It Easy',
    url: 'https://github.com/horsicq/Detect-It-Easy',
    categories: ['malware-analysis'],
    pricing: 'open-source',
    description: 'PE/ELF/Mach-O packer + compiler detector. Plugin-based; modern alternative to PEiD.',
    source_url: 'https://github.com/horsicq/Detect-It-Easy',
  },

  // ── Vulnerability Management ────────────────────────────────────────────
  {
    id: 'nvd',
    name: 'NVD',
    url: 'https://nvd.nist.gov',
    categories: ['vulnerability'],
    pricing: 'free',
    description: 'NIST National Vulnerability Database. Authoritative source for CVE metadata + CVSS scores. Free API.',
    badge: 'industry-standard',
  },
  {
    id: 'cisa-kev',
    name: 'CISA KEV Catalog',
    url: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
    categories: ['vulnerability', 'threat-intel'],
    pricing: 'free',
    description:
      'Known Exploited Vulnerabilities catalog. The "patch this first" list — every entry has confirmed exploitation.',
    badge: 'essential',
  },
  {
    id: 'epss',
    name: 'EPSS',
    url: 'https://www.first.org/epss/',
    categories: ['vulnerability'],
    pricing: 'free',
    description:
      'Exploit Prediction Scoring System — probability that a CVE will be exploited in the next 30 days. Free API.',
  },
  {
    id: 'osv',
    name: 'OSV.dev',
    url: 'https://osv.dev',
    categories: ['vulnerability', 'appsec'],
    pricing: 'free',
    description: "Google's open-source vulnerability database. Excellent for SBOM and dependency-graph queries.",
    source_url: 'https://github.com/google/osv.dev',
  },
  {
    id: 'ghsa',
    name: 'GitHub Advisory Database',
    url: 'https://github.com/advisories',
    categories: ['vulnerability', 'appsec'],
    pricing: 'free',
    description: 'GitHub-curated advisories for npm, PyPI, Maven, NuGet, Composer, RubyGems, Cargo, Pub. Free API.',
  },
  {
    id: 'exploit-db',
    name: 'Exploit-DB',
    url: 'https://www.exploit-db.com',
    categories: ['vulnerability', 'pentest-redteam'],
    pricing: 'free',
    description: 'Offensive Security exploit archive. PoCs, shellcodes, exploit techniques — historical + current.',
  },
  {
    id: 'vulncheck-kev',
    name: 'VulnCheck KEV',
    url: 'https://vulncheck.com/kev',
    categories: ['vulnerability', 'threat-intel'],
    pricing: 'free',
    description: 'Independent KEV catalog — earlier exploitation signals than CISA, broader source set. Free API tier.',
  },
  {
    id: 'nuclei',
    name: 'Nuclei',
    url: 'https://nuclei.projectdiscovery.io',
    categories: ['vulnerability', 'appsec'],
    pricing: 'open-source',
    description: 'Template-based vulnerability scanner. ~9000 community templates; the modern web-vuln scanner.',
    source_url: 'https://github.com/projectdiscovery/nuclei',
    badge: 'essential',
  },
  {
    id: 'tenable-nessus',
    name: 'Tenable Nessus',
    url: 'https://www.tenable.com/products/nessus',
    categories: ['vulnerability'],
    pricing: 'paid',
    description:
      'Industry-standard vulnerability scanner. Paid (Pro/Expert/Manager); free Essentials limited to 16 hosts.',
  },
  {
    id: 'qualys',
    name: 'Qualys VMDR',
    url: 'https://www.qualys.com/apps/vulnerability-management-detection-response/',
    categories: ['vulnerability'],
    pricing: 'paid',
    description: 'Cloud-native vuln management platform. Enterprise-tier; competes with Tenable + Rapid7.',
  },

  // ── Data Security / DLP ────────────────────────────────────────────────
  {
    id: 'gitleaks',
    name: 'gitleaks',
    url: 'https://gitleaks.io',
    categories: ['data-security', 'appsec'],
    pricing: 'open-source',
    description: 'Secret scanning for git repos. ~150 default rules; pre-commit + CI-friendly. The standard.',
    source_url: 'https://github.com/gitleaks/gitleaks',
    badge: 'essential',
  },
  {
    id: 'trufflehog',
    name: 'trufflehog',
    url: 'https://trufflesecurity.com',
    categories: ['data-security', 'appsec'],
    pricing: 'open-source',
    description:
      'Secret scanner with hundreds of detectors and live verification (calls the API to confirm a secret is valid).',
    source_url: 'https://github.com/trufflesecurity/trufflehog',
  },
  {
    id: 'detect-secrets',
    name: 'detect-secrets',
    url: 'https://github.com/Yelp/detect-secrets',
    categories: ['data-security', 'appsec'],
    pricing: 'open-source',
    description:
      "Yelp's pre-commit-friendly secret scanner. Pluggable detectors with baseline-management for false positives.",
    source_url: 'https://github.com/Yelp/detect-secrets',
  },
  {
    id: 'secrets-patterns-db',
    name: 'secrets-patterns-db',
    url: 'https://github.com/mazen160/secrets-patterns-db',
    categories: ['data-security'],
    pricing: 'open-source',
    description: 'Curated regex pattern database (~1600) for secret detection. Foundation for custom DLP scanners.',
    source_url: 'https://github.com/mazen160/secrets-patterns-db',
  },
  {
    id: 'gitguardian',
    name: 'GitGuardian',
    url: 'https://www.gitguardian.com',
    categories: ['data-security'],
    pricing: 'freemium',
    description:
      'Hosted secret-detection across git, Slack, Jira. Free tier limited; paid for org-scale + remediation.',
  },
  {
    id: 'nightfall',
    name: 'Nightfall AI',
    url: 'https://www.nightfall.ai',
    categories: ['data-security'],
    pricing: 'paid',
    description: 'AI-driven DLP across SaaS apps (Slack, Jira, GitHub, Confluence, M365). Strong PII/PHI detection.',
  },
  {
    id: 'microsoft-purview',
    name: 'Microsoft Purview',
    url: 'https://learn.microsoft.com/en-us/purview/',
    categories: ['data-security'],
    pricing: 'paid',
    description: 'Enterprise data governance + DLP across M365 / Azure / on-prem. Bundled with E5 licensing.',
  },
  {
    id: 'sops',
    name: 'Mozilla SOPS',
    url: 'https://github.com/getsops/sops',
    categories: ['data-security', 'secrets-iam'],
    pricing: 'open-source',
    description: 'Encrypts secrets at rest with KMS / GPG / age. Diff-friendly format; works in git workflows.',
    source_url: 'https://github.com/getsops/sops',
  },

  // ── Detection Engineering ──────────────────────────────────────────────
  {
    id: 'sigma',
    name: 'Sigma',
    url: 'https://sigmahq.io',
    categories: ['detection-engineering'],
    pricing: 'open-source',
    description:
      'Generic SIEM-agnostic signature format. Convert one rule to Splunk/Sentinel/Elastic/QRadar. SigmaHQ ruleset = thousands of rules.',
    source_url: 'https://github.com/SigmaHQ/sigma',
    badge: 'industry-standard',
  },
  {
    id: 'sigma-cli',
    name: 'sigma-cli (pySigma)',
    url: 'https://github.com/SigmaHQ/sigma-cli',
    categories: ['detection-engineering'],
    pricing: 'open-source',
    description: 'Modern Sigma rule converter. Replaces the legacy sigmac. Plugins for each backend.',
    source_url: 'https://github.com/SigmaHQ/sigma-cli',
  },
  {
    id: 'atomic-red-team',
    name: 'Atomic Red Team',
    url: 'https://atomicredteam.io',
    categories: ['detection-engineering', 'pentest-redteam'],
    pricing: 'open-source',
    description: 'Red Canary library of small, portable test scripts mapped to ATT&CK. Validate detections atomically.',
    source_url: 'https://github.com/redcanaryco/atomic-red-team',
    badge: 'essential',
  },
  {
    id: 'caldera',
    name: 'CALDERA',
    url: 'https://caldera.mitre.org',
    categories: ['detection-engineering', 'pentest-redteam'],
    pricing: 'open-source',
    description: 'MITRE adversary-emulation platform. Automated red-team campaigns mapped to ATT&CK.',
    source_url: 'https://github.com/mitre/caldera',
  },
  {
    id: 'falco',
    name: 'Falco',
    url: 'https://falco.org',
    categories: ['detection-engineering', 'cloud-security'],
    pricing: 'open-source',
    description:
      'CNCF runtime-security engine. eBPF + custom rule language for container + Kubernetes threat detection.',
    source_url: 'https://github.com/falcosecurity/falco',
  },
  {
    id: 'sigmahq-rules',
    name: 'SigmaHQ Rules',
    url: 'https://github.com/SigmaHQ/sigma',
    categories: ['detection-engineering'],
    pricing: 'open-source',
    description:
      'Open Sigma ruleset — thousands of rules across Windows, Linux, cloud, network. Curated by the community.',
    source_url: 'https://github.com/SigmaHQ/sigma',
  },
  {
    id: 'elastic-detection-rules',
    name: 'elastic/detection-rules',
    url: 'https://github.com/elastic/detection-rules',
    categories: ['detection-engineering'],
    pricing: 'open-source',
    description: 'Elastic Security detection rules. TOML format with full ATT&CK mapping; ~1000 rules.',
    source_url: 'https://github.com/elastic/detection-rules',
  },
  {
    id: 'splunk-security-content',
    name: 'splunk/security_content',
    url: 'https://github.com/splunk/security_content',
    categories: ['detection-engineering'],
    pricing: 'open-source',
    description: 'Splunk Enterprise Security Content Update. SPL + ATT&CK mapping; updated continuously.',
    source_url: 'https://github.com/splunk/security_content',
  },
  {
    id: 'azure-sentinel',
    name: 'Azure-Sentinel',
    url: 'https://github.com/Azure/Azure-Sentinel',
    categories: ['detection-engineering', 'cloud-security'],
    pricing: 'open-source',
    description: 'Microsoft Sentinel KQL detection rules. The largest open-source KQL detection collection.',
    source_url: 'https://github.com/Azure/Azure-Sentinel',
  },
  {
    id: 'limacharlie',
    name: 'LimaCharlie',
    url: 'https://www.limacharlie.io',
    categories: ['detection-engineering', 'dfir'],
    pricing: 'freemium',
    description: 'SecOps cloud — EDR + log + automation primitives, pay-per-event. Free for small workloads.',
  },
  {
    id: 'panther',
    name: 'Panther',
    url: 'https://panther.com',
    categories: ['detection-engineering'],
    pricing: 'freemium',
    description: 'Detection-as-code SIEM (Python rules, YAML data models). Cloud-native; commercial.',
  },
  {
    id: 'jupiter',
    name: 'Jupiter Tunings',
    url: 'https://jupiterone.com',
    categories: ['detection-engineering', 'cloud-security'],
    pricing: 'freemium',
    description: 'Asset + relationship security graph + queryable detection. JupiterOne; community tier exists.',
  },

  // ── Email Security ─────────────────────────────────────────────────────
  {
    id: 'mxtoolbox',
    name: 'MXToolbox',
    url: 'https://mxtoolbox.com',
    categories: ['email-security', 'osint'],
    pricing: 'freemium',
    description: 'Email + DNS diagnostics. Free quick-checks (DMARC, SPF, MX, blacklists); paid monitoring.',
  },
  {
    id: 'easydmarc',
    name: 'EasyDMARC',
    url: 'https://easydmarc.com',
    categories: ['email-security'],
    pricing: 'freemium',
    description: 'DMARC report aggregator + email-auth wizard. Free tier for small domains.',
  },
  {
    id: 'dmarcian',
    name: 'dmarcian',
    url: 'https://dmarcian.com',
    categories: ['email-security'],
    pricing: 'freemium',
    description: 'Established DMARC analytics platform. Free community tier; paid for larger domains.',
  },
  {
    id: 'mail-tester',
    name: 'Mail-Tester',
    url: 'https://www.mail-tester.com',
    categories: ['email-security'],
    pricing: 'freemium',
    description: 'Send a test email, get a deliverability + auth + content score. Free 3 tests/day.',
  },
  {
    id: 'proofpoint',
    name: 'Proofpoint',
    url: 'https://www.proofpoint.com',
    categories: ['email-security'],
    pricing: 'paid',
    description: 'Enterprise email gateway + threat protection. Industry leader in BEC + impostor protection.',
  },
  {
    id: 'mimecast',
    name: 'Mimecast',
    url: 'https://www.mimecast.com',
    categories: ['email-security'],
    pricing: 'paid',
    description: 'Cloud email security gateway. Strong archiving + continuity story.',
  },
  {
    id: 'abnormal',
    name: 'Abnormal Security',
    url: 'https://abnormalsecurity.com',
    categories: ['email-security'],
    pricing: 'paid',
    description: 'AI-driven BEC + account-takeover detection. API-based (no MX change). Strong analyst feedback.',
  },
  {
    id: 'material-security',
    name: 'Material Security',
    url: 'https://material.security',
    categories: ['email-security', 'data-security'],
    pricing: 'paid',
    description:
      'Defense-in-depth for already-delivered email. Re-authenticate before exposing PII; sweep retroactively.',
  },
  {
    id: 'emailrep',
    name: 'EmailRep',
    url: 'https://emailrep.io',
    categories: ['email-security', 'osint'],
    pricing: 'free',
    description: 'Email-address reputation lookup — breach hits, social presence, sender history. Free API.',
  },

  // ── Network Security ───────────────────────────────────────────────────
  {
    id: 'wireshark',
    name: 'Wireshark',
    url: 'https://www.wireshark.org',
    categories: ['network-security', 'dfir'],
    pricing: 'open-source',
    description: 'The packet capture + analysis tool. Indispensable for any network forensics work.',
    source_url: 'https://github.com/wireshark/wireshark',
    badge: 'industry-standard',
  },
  {
    id: 'zeek',
    name: 'Zeek',
    url: 'https://zeek.org',
    categories: ['network-security', 'detection-engineering'],
    pricing: 'open-source',
    description: 'Network analysis framework (formerly Bro). Generates rich connection logs + protocol metadata.',
    source_url: 'https://github.com/zeek/zeek',
  },
  {
    id: 'suricata',
    name: 'Suricata',
    url: 'https://suricata.io',
    categories: ['network-security', 'detection-engineering'],
    pricing: 'open-source',
    description: 'High-performance IDS/IPS + NSM. Compatible with Snort rules + ET ruleset.',
    source_url: 'https://github.com/OISF/suricata',
  },
  {
    id: 'snort',
    name: 'Snort',
    url: 'https://www.snort.org',
    categories: ['network-security', 'detection-engineering'],
    pricing: 'open-source',
    description:
      'The original signature-based IDS. Snort 3 is the actively maintained version; massive rule ecosystem.',
  },
  {
    id: 'nmap',
    name: 'Nmap',
    url: 'https://nmap.org',
    categories: ['network-security', 'pentest-redteam'],
    pricing: 'open-source',
    description: 'Network scanner. Service detection + scriptable via NSE. Foundational.',
    source_url: 'https://github.com/nmap/nmap',
    badge: 'industry-standard',
  },
  {
    id: 'masscan',
    name: 'Masscan',
    url: 'https://github.com/robertdavidgraham/masscan',
    categories: ['network-security', 'pentest-redteam'],
    pricing: 'open-source',
    description:
      'Internet-scale port scanner. Scans the entire internet in minutes; pair with Nmap for service detection.',
    source_url: 'https://github.com/robertdavidgraham/masscan',
  },
  {
    id: 'naabu',
    name: 'naabu',
    url: 'https://github.com/projectdiscovery/naabu',
    categories: ['network-security', 'appsec'],
    pricing: 'open-source',
    description: "ProjectDiscovery's fast port scanner. Pipes cleanly into nuclei/httpx for chained recon.",
    source_url: 'https://github.com/projectdiscovery/naabu',
  },
  {
    id: 'rita',
    name: 'RITA',
    url: 'https://www.activecountermeasures.com/free-tools/rita/',
    categories: ['network-security', 'detection-engineering'],
    pricing: 'open-source',
    description: 'Real Intelligence Threat Analytics — beaconing detection on Zeek logs. Active Countermeasures.',
    source_url: 'https://github.com/activecm/rita',
  },

  // ── Cloud Security ─────────────────────────────────────────────────────
  {
    id: 'prowler',
    name: 'Prowler',
    url: 'https://prowler.com',
    categories: ['cloud-security'],
    pricing: 'open-source',
    description:
      'Multi-cloud CSPM (AWS/Azure/GCP/K8s). 400+ checks against CIS, NIST, GDPR, etc. Open-source CLI + paid SaaS.',
    source_url: 'https://github.com/prowler-cloud/prowler',
  },
  {
    id: 'scoutsuite',
    name: 'ScoutSuite',
    url: 'https://github.com/nccgroup/ScoutSuite',
    categories: ['cloud-security'],
    pricing: 'open-source',
    description: 'NCC Group multi-cloud auditing tool. AWS / Azure / GCP / OCI / AliCloud. Static HTML report.',
    source_url: 'https://github.com/nccgroup/ScoutSuite',
  },
  {
    id: 'checkov',
    name: 'Checkov',
    url: 'https://www.checkov.io',
    categories: ['cloud-security', 'appsec'],
    pricing: 'open-source',
    description: 'IaC + image + secrets scanning. Terraform / CloudFormation / Helm / K8s / Dockerfile / GHA.',
    source_url: 'https://github.com/bridgecrewio/checkov',
  },
  {
    id: 'trivy',
    name: 'Trivy',
    url: 'https://aquasecurity.github.io/trivy/',
    categories: ['cloud-security', 'appsec', 'vulnerability'],
    pricing: 'open-source',
    description: 'Aqua all-in-one vuln + IaC + secret + license + SBOM scanner. The reference container scanner.',
    source_url: 'https://github.com/aquasecurity/trivy',
    badge: 'essential',
  },
  {
    id: 'kube-bench',
    name: 'kube-bench',
    url: 'https://github.com/aquasecurity/kube-bench',
    categories: ['cloud-security'],
    pricing: 'open-source',
    description: 'Aqua tool that runs the CIS Kubernetes Benchmark against a cluster. Quick hardening audit.',
    source_url: 'https://github.com/aquasecurity/kube-bench',
  },
  {
    id: 'kube-hunter',
    name: 'kube-hunter',
    url: 'https://github.com/aquasecurity/kube-hunter',
    categories: ['cloud-security', 'pentest-redteam'],
    pricing: 'open-source',
    description: 'Hunts for security weaknesses in Kubernetes clusters. Active + passive modes.',
    source_url: 'https://github.com/aquasecurity/kube-hunter',
  },
  {
    id: 'pacu',
    name: 'Pacu',
    url: 'https://github.com/RhinoSecurityLabs/pacu',
    categories: ['cloud-security', 'pentest-redteam'],
    pricing: 'open-source',
    description: 'AWS exploitation framework — privilege escalation, persistence, exfiltration. Rhino Security.',
    source_url: 'https://github.com/RhinoSecurityLabs/pacu',
  },
  {
    id: 'stratus-red-team',
    name: 'Stratus Red Team',
    url: 'https://stratus-red-team.cloud',
    categories: ['cloud-security', 'detection-engineering', 'pentest-redteam'],
    pricing: 'open-source',
    description: 'Granular cloud-attack technique simulator. Test your detections against real cloud TTPs.',
    source_url: 'https://github.com/DataDog/stratus-red-team',
  },
  {
    id: 'wiz',
    name: 'Wiz',
    url: 'https://www.wiz.io',
    categories: ['cloud-security'],
    pricing: 'paid',
    description: 'Cloud security platform — agentless CSPM/CWPP/CIEM. Acquired by Google for $32B in 2024.',
  },

  // ── AppSec / Web ───────────────────────────────────────────────────────
  {
    id: 'burp-suite',
    name: 'Burp Suite',
    url: 'https://portswigger.net/burp',
    categories: ['appsec', 'pentest-redteam'],
    pricing: 'freemium',
    description:
      'Web app proxy + scanner. Community Edition is free (no scanner); Professional is the bug-bounty standard.',
    badge: 'industry-standard',
  },
  {
    id: 'caido',
    name: 'Caido',
    url: 'https://caido.io',
    categories: ['appsec', 'pentest-redteam'],
    pricing: 'freemium',
    description: 'Modern web pentesting suite — Burp alternative, Rust-based. Free tier capable; Pro paid.',
  },
  {
    id: 'owasp-zap',
    name: 'OWASP ZAP',
    url: 'https://www.zaproxy.org',
    categories: ['appsec'],
    pricing: 'open-source',
    description: "OWASP's free web app scanner. Solid for CI integration; weaker than Burp for manual workflows.",
    source_url: 'https://github.com/zaproxy/zaproxy',
  },
  {
    id: 'sqlmap',
    name: 'sqlmap',
    url: 'https://sqlmap.org',
    categories: ['appsec', 'pentest-redteam'],
    pricing: 'open-source',
    description: 'Automated SQL injection + database takeover. The reference tool for confirming + exploiting SQLi.',
    source_url: 'https://github.com/sqlmapproject/sqlmap',
  },
  {
    id: 'ffuf',
    name: 'ffuf',
    url: 'https://github.com/ffuf/ffuf',
    categories: ['appsec', 'pentest-redteam'],
    pricing: 'open-source',
    description: 'Fast web fuzzer (Go). Replaces dirb / wfuzz / dirsearch for most workflows.',
    source_url: 'https://github.com/ffuf/ffuf',
  },
  {
    id: 'amass',
    name: 'OWASP Amass',
    url: 'https://owasp.org/www-project-amass/',
    categories: ['appsec', 'osint'],
    pricing: 'open-source',
    description: 'In-depth attack-surface mapping + asset discovery. The thorough subdomain enumerator.',
    source_url: 'https://github.com/owasp-amass/amass',
  },
  {
    id: 'subfinder',
    name: 'subfinder',
    url: 'https://github.com/projectdiscovery/subfinder',
    categories: ['appsec', 'osint'],
    pricing: 'open-source',
    description:
      "ProjectDiscovery's passive subdomain enumerator. Fast, scriptable, pipes into the rest of the PD ecosystem.",
    source_url: 'https://github.com/projectdiscovery/subfinder',
  },
  {
    id: 'httpx-pd',
    name: 'httpx',
    url: 'https://github.com/projectdiscovery/httpx',
    categories: ['appsec', 'osint'],
    pricing: 'open-source',
    description: 'Fast HTTP toolkit + probe. Tech-stack fingerprinting, status checks, screenshots.',
    source_url: 'https://github.com/projectdiscovery/httpx',
  },
  {
    id: 'semgrep',
    name: 'Semgrep',
    url: 'https://semgrep.dev',
    categories: ['appsec'],
    pricing: 'freemium',
    description:
      'Lightweight static analysis with a rule registry that reads like grep but understands syntax. OSS engine + paid SaaS.',
    source_url: 'https://github.com/semgrep/semgrep',
    badge: 'essential',
  },
  {
    id: 'codeql',
    name: 'CodeQL',
    url: 'https://codeql.github.com',
    categories: ['appsec'],
    pricing: 'free',
    description:
      "GitHub's variant analysis engine. Free for OSS + GitHub-Native; query language is the differentiator.",
  },
  {
    id: 'snyk',
    name: 'Snyk',
    url: 'https://snyk.io',
    categories: ['appsec', 'vulnerability'],
    pricing: 'freemium',
    description: 'Developer-first SCA + SAST + IaC + container scanning. Free tier generous; paid for org-wide.',
  },

  // ── Secrets & IAM ──────────────────────────────────────────────────────
  {
    id: 'vault',
    name: 'HashiCorp Vault',
    url: 'https://www.vaultproject.io',
    categories: ['secrets-iam'],
    pricing: 'open-source',
    description: 'The reference secrets manager. OSS Community Edition + Enterprise (BSL licensed).',
    source_url: 'https://github.com/hashicorp/vault',
    badge: 'industry-standard',
  },
  {
    id: 'infisical',
    name: 'Infisical',
    url: 'https://infisical.com',
    categories: ['secrets-iam'],
    pricing: 'freemium',
    description: 'Open-source secrets platform. Pleasant UI, modern git integration; SaaS or self-hosted.',
    source_url: 'https://github.com/Infisical/infisical',
  },
  {
    id: 'age',
    name: 'age',
    url: 'https://age-encryption.org',
    categories: ['secrets-iam', 'data-security'],
    pricing: 'open-source',
    description: 'Modern file encryption tool. Designed as a simpler PGP replacement; pairs with SOPS.',
    source_url: 'https://github.com/FiloSottile/age',
  },
  {
    id: 'keycloak',
    name: 'Keycloak',
    url: 'https://www.keycloak.org',
    categories: ['secrets-iam'],
    pricing: 'open-source',
    description: 'The reference open-source IAM. SAML + OIDC + federation, customizable themes, Red Hat SSO upstream.',
    source_url: 'https://github.com/keycloak/keycloak',
  },
  {
    id: 'teleport',
    name: 'Teleport',
    url: 'https://goteleport.com',
    categories: ['secrets-iam'],
    pricing: 'freemium',
    description: 'Identity-aware access proxy for SSH / K8s / DB / desktop. OSS Community + paid Enterprise.',
    source_url: 'https://github.com/gravitational/teleport',
  },
  {
    id: 'tailscale',
    name: 'Tailscale',
    url: 'https://tailscale.com',
    categories: ['secrets-iam', 'network-security'],
    pricing: 'freemium',
    description: 'WireGuard-based zero-config VPN. Free for up to 100 devices; identity-first networking.',
  },

  // ── Pentest / Red Team ─────────────────────────────────────────────────
  {
    id: 'metasploit',
    name: 'Metasploit Framework',
    url: 'https://www.metasploit.com',
    categories: ['pentest-redteam'],
    pricing: 'open-source',
    description: 'The exploitation framework. Thousands of modules, post-exploitation, listeners. Rapid7 maintains.',
    source_url: 'https://github.com/rapid7/metasploit-framework',
    badge: 'industry-standard',
  },
  {
    id: 'cobaltstrike',
    name: 'Cobalt Strike',
    url: 'https://www.cobaltstrike.com',
    categories: ['pentest-redteam'],
    pricing: 'paid',
    description:
      'Commercial adversary-emulation C2 framework. Industry standard for red teams; widely abused by criminals too.',
  },
  {
    id: 'sliver',
    name: 'Sliver',
    url: 'https://sliver.sh',
    categories: ['pentest-redteam'],
    pricing: 'open-source',
    description: 'Open-source cross-platform C2. Cobalt Strike alternative. Bishop Fox.',
    source_url: 'https://github.com/BishopFox/sliver',
  },
  {
    id: 'havoc',
    name: 'Havoc',
    url: 'https://havocframework.com',
    categories: ['pentest-redteam'],
    pricing: 'open-source',
    description: 'Modern post-exploitation C2. Cross-platform implant + customizable evasion.',
    source_url: 'https://github.com/HavocFramework/Havoc',
  },
  {
    id: 'mythic',
    name: 'Mythic',
    url: 'https://docs.mythic-c2.net',
    categories: ['pentest-redteam'],
    pricing: 'open-source',
    description: 'Multiplayer C2 framework with pluggable agents. Strong for long-engagement red teams.',
    source_url: 'https://github.com/its-a-feature/Mythic',
  },
  {
    id: 'bloodhound',
    name: 'BloodHound',
    url: 'https://bloodhound.specterops.io',
    categories: ['pentest-redteam'],
    pricing: 'freemium',
    description: 'AD + Azure attack-path graph. Community Edition (free) + Enterprise. The reference AD recon tool.',
    source_url: 'https://github.com/SpecterOps/BloodHound',
    badge: 'essential',
  },
  {
    id: 'impacket',
    name: 'Impacket',
    url: 'https://github.com/fortra/impacket',
    categories: ['pentest-redteam'],
    pricing: 'open-source',
    description: 'Python network-protocol library + offensive scripts (psexec, secretsdump, ntlmrelayx, etc).',
    source_url: 'https://github.com/fortra/impacket',
  },
  {
    id: 'caldera-mitre',
    name: 'MITRE CALDERA (red team)',
    url: 'https://caldera.mitre.org',
    categories: ['pentest-redteam', 'detection-engineering'],
    pricing: 'open-source',
    description:
      'Adversary-emulation platform — same project as listed under Detection Engineering, complementary use cases.',
    source_url: 'https://github.com/mitre/caldera',
  },
  {
    id: 'infection-monkey',
    name: 'Infection Monkey',
    url: 'https://www.akamai.com/lp/infection-monkey',
    categories: ['pentest-redteam'],
    pricing: 'open-source',
    description: 'Akamai/Guardicore continuous breach + attack simulation. Auto-spreads through your network safely.',
    source_url: 'https://github.com/guardicore/monkey',
  },
  // ── New entries (2026-05-16) ─────────────────────────────────────────────
  {
    id: 'deepfind-me',
    name: 'DeepFind.Me',
    url: 'https://deepfind.me/tools',
    categories: ['osint'],
    pricing: 'freemium',
    description:
      'Comprehensive OSINT platform — username search (50+ platforms), geolocation, email/domain recon, metadata extraction, dark-web link checker, crypto wallet tracking, and steganography tools. REST API available.',
  },
  {
    id: 'osinttools-io',
    name: 'OSINT Tools',
    url: 'https://osinttools.io/',
    categories: ['osint'],
    pricing: 'free',
    description:
      'Curated directory of OSINT tools with community collections, featured tools, and new-tool discovery. Covers the full spectrum of open-source intelligence gathering.',
  },
  {
    id: 'ghostint-tools',
    name: 'Ghostint Tools',
    url: 'https://cyberz7.github.io/Ghostint-Tools/',
    categories: ['osint'],
    pricing: 'free',
    description:
      'Curated OSINT and cybersecurity tools directory — categorized tools for reconnaissance, social media investigation, and digital forensics investigations.',
  },
  {
    id: 'web-check-xyz',
    name: 'Web Check',
    url: 'https://web-check.xyz/',
    categories: ['appsec', 'network-security'],
    pricing: 'free',
    description:
      'All-in-one website analysis — DNS, SSL/TLS, security headers, WHOIS, tech stack detection, performance audit, and security misconfiguration scanning from a single URL.',
  },
  {
    id: 'hacktricks-tools',
    name: 'HackTricks Tools',
    url: 'https://tools.hacktricks.wiki/',
    categories: ['pentest-redteam', 'appsec'],
    pricing: 'freemium',
    description:
      'Interactive security tools suite — domain/DNS auditor, host checker, clickjacking PoC generator, GitHub leaks scanner, cloud IAM auditor (PEASS), and AI security chatbot.',
  },
  {
    id: 'osv-dev',
    name: 'OSV.dev',
    url: 'https://osv.dev/list',
    categories: ['vulnerability'],
    pricing: 'free',
    description:
      'Google-backed open-source vulnerability database — ecosystem-agnostic schema covering PyPI, npm, Go, Maven, Rust, and more. REST API and deterministic query by commit hash.',
  },
  {
    id: 'malwareworld',
    name: 'MalwareWorld',
    url: 'https://malwareworld.com/',
    categories: ['threat-intel'],
    pricing: 'free',
    description:
      'Aggregated threat intelligence from 500+ public blacklists. Searchable IP/domain database with categorized blocklist downloads (malware, spam, phishing, crypto, DGA, bad reputation).',
  },
  {
    id: 'crowdthreat',
    name: 'CrowdThreat',
    url: 'https://www.crowdthreat.com/',
    categories: ['threat-intel'],
    pricing: 'free',
    description:
      'Threat intelligence platform — cross-reference IOCs, track threat actor campaigns, and browse curated OSINT tools. Community-driven threat data aggregation.',
  },
  {
    id: 'sigma-nasbench',
    name: 'Sigma Rule Explorer (nasbench)',
    url: 'https://sigma.nasbench.dev/',
    categories: ['detection-engineering'],
    pricing: 'free',
    description:
      'Interactive Sigma rule browser — search and filter detection rules with live SIEM conversion previews for Splunk, Elasticsearch, QRadar, Microsoft Sentinel, and more.',
  },
  {
    id: 'bitwire-blocklist',
    name: 'BitWire IP Blocklist',
    url: 'https://bitwire.it/blocklist-stats',
    categories: ['threat-intel', 'network-security'],
    pricing: 'open-source',
    description:
      'Open-source IP blocklist with live statistics and downloadable feeds. Covers malicious IPs across multiple threat categories. REST API for automated ingestion.',
    source_url: 'https://github.com/bitwire-it/ipblocklist',
  },
  {
    id: 'ti-mindmap-hub',
    name: 'TI Mindmap Hub',
    url: 'https://ti-mindmap-hub.com/',
    categories: ['threat-intel'],
    pricing: 'free',
    description:
      'Interactive threat intelligence mindmap — visual navigation of TTPs, threat actors, campaigns, and detection strategies aligned with the MITRE ATT&CK framework.',
  },
  {
    id: 'insider-threat-matrix',
    name: 'Insider Threat Matrix',
    url: 'https://insiderthreatmatrix.org/',
    categories: ['dfir', 'detection-engineering'],
    pricing: 'free',
    description:
      'Comprehensive insider threat framework — indicators, detection methods, mitigation playbooks, and real-world case studies across insider personas and attack vectors.',
  },
  {
    id: 'orca-osintcti',
    name: 'Orca OSINT/CTI',
    url: 'https://orca.osintcti.com/',
    categories: ['osint', 'threat-intel'],
    pricing: 'free',
    description:
      'OSINT and threat intelligence search platform — unified queries across multiple data sources for indicator lookups, threat actor profiling, and infrastructure discovery.',
  },
  {
    id: 'cybersectools',
    name: 'CyberSecTools',
    url: 'https://cybersectools.com/',
    categories: ['osint', 'pentest-redteam'],
    pricing: 'free',
    description:
      'Curated catalog of cybersecurity tools — penetration testing, forensics, OSINT, red teaming, and blue team operations. Categorized with search and filtering.',
  },
  {
    id: 'redhunt-research',
    name: 'RedHunt Labs Research',
    url: 'https://research.redhuntlabs.com/',
    categories: ['threat-intel', 'vulnerability'],
    pricing: 'free',
    description:
      'Security research publications — attack surface management insights, vulnerability disclosures, APT tracking, and adversary infrastructure analysis.',
  },
  {
    id: 'aidefend',
    name: 'AIDefend',
    url: 'https://aidefend.net/',
    categories: ['ai-security'],
    pricing: 'freemium',
    description:
      'AI-powered cybersecurity defense — automated threat detection, AI-driven incident response orchestration, and continuous security posture management.',
  },
  {
    id: 'appsec-master',
    name: 'AppSec Master',
    url: 'https://www.appsecmaster.net/en',
    categories: ['appsec'],
    pricing: 'free',
    description:
      'Interactive application security training — hands-on labs covering OWASP Top 10, API security testing, secure coding practices, and vulnerability remediation.',
  },
  {
    id: 'arcanum-ai-sec',
    name: 'Arcanum AI Security Resources',
    url: 'https://arcanum-sec.github.io/ai-sec-resources/',
    categories: ['ai-security'],
    pricing: 'free',
    description:
      'Curated AI/ML security resource hub — academic papers, offensive/defensive tools, CTF challenges, and frameworks for adversarial ML and LLM red teaming.',
  },
  {
    id: 'owasp-ai-visualizer',
    name: 'OWASP AI Security Visualizer',
    url: 'https://ricokomenda.github.io/owasp-ai-security-visualizer/',
    categories: ['ai-security'],
    pricing: 'free',
    description:
      'Interactive visual mapping of the OWASP AI security landscape — explore AI-specific threats, vulnerabilities, and controls across the ML development lifecycle.',
  },
  {
    id: 'mjolnir-intel',
    name: 'Mjolnir Intelligence',
    url: 'https://intel.mjolnirsecurity.com/',
    categories: ['threat-intel'],
    pricing: 'free',
    description:
      'Threat intelligence dashboard — live IOC feeds, campaign tracking, and real-time security event monitoring from Mjolnir Security.',
  },
  {
    id: 'geniebot',
    name: 'GenieBot Pro',
    url: 'https://geniebot.pro/',
    categories: ['ai-security'],
    pricing: 'freemium',
    description:
      'AI-powered security assistant — threat intelligence queries, security automation workflows, and chatbot-driven incident response guidance.',
  },
];
