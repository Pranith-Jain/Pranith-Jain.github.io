/**
 * Agentic Reports — cross-source correlated threat intelligence analyses.
 *
 * Each report synthesizes multiple upstream sources into a single
 * comprehensive analysis with executive summary, detection opportunities,
 * IOCs, TTPs, and recommended actions. Modeled on TI-Mindmap-HUB's
 * /analytics section.
 */

export interface AgenticReport {
  id: string;
  title: string;
  /** TLP marking. */
  tlp: 'WHITE' | 'AMBER' | 'RED';
  severity: 'critical' | 'high' | 'medium' | 'low';
  publishedAt: string;
  /** Upstream sources this analysis synthesized. */
  sources: { title: string; source: string; url: string; publishedAt: string }[];
  tags: string[];
  /** Executive summary (markdown). */
  summary: string;
  /** Attribution profile. */
  attribution: {
    actor: string;
    type: string;
    motivation: string;
    language?: string;
    infrastructure?: string;
  };
  /** Key technical details (markdown). */
  technicalDetails: string;
  /** Detection opportunities. */
  detection: {
    title: string;
    description: string;
    severity: string;
    mitreId?: string;
    query?: string;
  }[];
  /** IOCs with descriptions. */
  iocs: {
    type: string;
    value: string;
    description: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  }[];
  /** MITRE ATT&CK techniques with descriptions. */
  ttps: {
    id: string;
    name: string;
    tactic: string;
    description: string;
  }[];
  /** Conclusion and recommended actions. */
  conclusion: {
    takeaways: string[];
    actions: { priority: string; action: string }[];
  };
  /** Metrics / victimology. */
  metrics: { label: string; value: string }[];
  /** URL to the full analysis page on TI-Mindmap-HUB (if available). */
  externalUrl?: string;
}

const FORTIBLEED: AgenticReport = {
  id: 'fortibleed-credential-compromise',
  title: 'FortiBleed — Massive Fortinet Credential Compromise Campaign',
  tlp: 'WHITE',
  severity: 'critical',
  publishedAt: '2026-06-20',
  sources: [
    {
      title: 'FortiBleed: The Compromise of 80,000+ Fortinet Firewalls',
      source: 'SOCRadar',
      url: 'https://ti-mindmap-hub.com/report/35048609-8512-45a9-a23b-856145bd1ab9',
      publishedAt: '2026-06-19',
    },
    {
      title: '75,000 Fortinet Firewalls Compromised: Global Enterprises Exposed',
      source: 'Hudson Rock',
      url: 'https://ti-mindmap-hub.com/report/3868cba5-3262-4dbb-a828-d865f9a63aa2',
      publishedAt: '2026-06-19',
    },
    {
      title: 'Active FortiBleed Campaign Impacting 194 Countries',
      source: 'Arctic Wolf',
      url: 'https://ti-mindmap-hub.com/report/8066f0f9-da4d-4683-a5b1-82a43562b30b',
      publishedAt: '2026-06-19',
    },
    {
      title: 'Credentials Exposed for 73,932 FortiGate Systems',
      source: 'Recorded Future',
      url: 'https://ti-mindmap-hub.com/report/a250846f-4175-43a8-826f-7d8fdca229ba',
      publishedAt: '2026-06-19',
    },
    {
      title: 'What SpyCloud Found Inside the FortiBleed Infrastructure',
      source: 'SpyCloud',
      url: 'https://ti-mindmap-hub.com/report/d4b7155c-a4b9-4449-b10a-d6c9b465bb97',
      publishedAt: '2026-06-20',
    },
    {
      title: 'Inside the FortiBleed Open Directory',
      source: 'CloudSEK',
      url: 'https://ti-mindmap-hub.com/report/264c71de-3fdd-4c39-92d0-339f60ee3f64',
      publishedAt: '2026-06-20',
    },
    {
      title: 'Fortinet Credentials Exposed, Italian Public Sector Impacted',
      source: 'CERT-AGID',
      url: 'https://ti-mindmap-hub.com/report/75740157-d717-4f02-a35b-afaf3071b633',
      publishedAt: '2026-06-20',
    },
    {
      title: 'Inside the 73,000-Firewall Credential Leak',
      source: 'SecurityWall',
      url: 'https://ti-mindmap-hub.com/report/6888d19a-61ac-47c8-9a06-f3bff97287b6',
      publishedAt: '2026-06-20',
    },
    {
      title: 'Fortinet VPN Credentials and Configuration Data Exposed',
      source: 'Bitsight',
      url: 'https://ti-mindmap-hub.com/report/2b1747a2-3782-4046-9e6b-46704bd31dc3',
      publishedAt: '2026-06-20',
    },
  ],
  tags: [
    'fortinet',
    'fortigate',
    'credential-compromise',
    'vpn',
    'initial-access-broker',
    'brute-force',
    'hash-cracking',
    'lateral-movement',
    'active-directory',
    'critical-infrastructure',
  ],
  summary: `On June 17, 2026, security researcher Volodymyr "Bob" Diachenko disclosed **FortiBleed** — a massive credential compromise campaign targeting Fortinet FortiGate firewalls and SSL VPN gateways worldwide. The dataset contains valid administrator and SSL VPN credentials for approximately **73,932 unique FortiGate device URLs** spanning **194 countries** and over **21,600 domains**, representing roughly **50% of all internet-facing FortiGate firewalls globally**.

FortiBleed is not a single zero-day vulnerability, but the culmination of a long-running, multi-pronged credential-harvesting operation. A Russian-speaking threat group operating as an Initial Access Broker (IAB) under the alias **"SantaAd"** executed over **1.16 billion credential attempts** against FortiGate devices and **2.1 billion brute-force attempts** against MSSQL systems. The attackers intercepted SSL VPN authentication hashes and cracked them using a distributed **45-GPU cluster** managed via Hashtopolis.

Verified victims include Fortune Global 500 companies, government agencies, defense contractors (including a Turkish NATO contractor from which **105 GB of classified military data** was exfiltrated), critical infrastructure operators, hospitals, universities, and multinational corporations including Foxconn, Samsung, Comcast, Siemens, Lenovo, PwC, Accenture, and Oracle.`,
  attribution: {
    actor: 'SantaAd (Russian-speaking IAB)',
    type: 'Initial Access Broker (IAB)',
    motivation: 'Financial (credential sales) + Geopolitical (NATO targeting)',
    language: 'Russian',
    infrastructure: 'Multi-server (brute-force, cracking, jumpbox, operator workstation)',
  },
  technicalDetails: `The campaign exploits a **legacy password hashing weakness** in FortiOS. Historically, FortiGate devices stored admin credentials using SHA-256 with Salt — vulnerable to offline GPU cracking. While newer FortiOS versions (7.2.11, 7.4.8, 7.6.1) introduced PBKDF2, existing credentials are NOT automatically re-hashed upon firmware upgrade.

The attacker's infrastructure was inadvertently exposed when their backend server was left publicly accessible, revealing the complete attack pipeline: brute-force server, operator workstation (7 Kali VMs), Hashtopolis cracking cluster (45 GPUs), and jump box.

Four parallel credential acquisition techniques were employed:
1. **Mass Brute-Force:** 1.16B attempts against 320K FortiGate targets
2. **Configuration File Export:** Direct extraction from exposed management interfaces
3. **SSL VPN Hash Interception:** Network sniffers on compromised firewalls
4. **Credential Stuffing:** Using infostealer malware logs (Raccoon, RedLine, Vidar)`,
  detection: [
    {
      title: 'FortiGate Admin Access from Known Infrastructure',
      description: 'Detects administrative access to FortiGate devices from IPs associated with FortiBleed campaign',
      severity: 'critical',
      mitreId: 'T1078',
      query:
        "logsource:\n  product: fortinet\n  service: event\ndetection:\n  selection:\n    srcip:\n      - '85.11.187.8'\n      - '85.11.187.28'\n      - '193.8.187.2'\n      - '185.229.26.83'\n    action: 'login'\n  condition: selection\nlevel: critical",
    },
    {
      title: 'Mass Authentication Failure — Brute-Force',
      description: 'Detects brute-force patterns against FortiGate admin/VPN interfaces',
      severity: 'high',
      mitreId: 'T1110',
      query:
        "detection:\n  selection:\n    action: 'login'\n    status: 'failed'\n  condition: selection | count(srcip) by dstip > 100\n  timeframe: 1h\nlevel: high",
    },
    {
      title: 'Kerberos Password Spray from Perimeter',
      description: 'Detects password spraying from FortiGate/VPN IP ranges targeting AD',
      severity: 'high',
      mitreId: 'T1110.003',
      query:
        'logsource:\n  product: windows\n  service: security\ndetection:\n  selection:\n    EventID: 4771\n  condition: selection | count(TargetUserName) by IpAddress > 25\n  timeframe: 10m',
    },
  ],
  iocs: [
    {
      type: 'IPv4',
      value: '85.11.187[.]8',
      description: 'Hashtopolis coordination server / primary C2',
      confidence: 'HIGH',
    },
    { type: 'IPv4', value: '85.11.187[.]28', description: 'Credential harvesting server', confidence: 'HIGH' },
    { type: 'IPv4', value: '193.8.187[.]2', description: 'Jump box — staging server', confidence: 'HIGH' },
    { type: 'IPv4', value: '185.229.26[.]83', description: 'Hashtopolis GPU worker', confidence: 'HIGH' },
    { type: 'IPv4', value: '213.169.49[.]142', description: 'Hashtopolis GPU worker', confidence: 'HIGH' },
    { type: 'IPv4', value: '38.117.87[.]37', description: 'Hashtopolis GPU worker', confidence: 'HIGH' },
    { type: 'IPv4', value: '198.53.64[.]194', description: 'Hashtopolis GPU worker', confidence: 'HIGH' },
    { type: 'IPv4', value: '175.155.64[.]221', description: 'Hashtopolis GPU worker', confidence: 'HIGH' },
  ],
  ttps: [
    {
      id: 'T1595',
      name: 'Active Scanning',
      tactic: 'Reconnaissance',
      description: 'Internet-wide scanning for exposed FortiGate management interfaces and SSL VPN portals',
    },
    {
      id: 'T1190',
      name: 'Exploit Public-Facing Application',
      tactic: 'Initial Access',
      description: 'Exploitation of known Fortinet CVEs (CVE-2022-40684, CVE-2023-27997, CVE-2024-55591)',
    },
    {
      id: 'T1078',
      name: 'Valid Accounts',
      tactic: 'Initial Access',
      description: 'Use of cracked administrator and SSL VPN credentials',
    },
    {
      id: 'T1110',
      name: 'Brute Force',
      tactic: 'Credential Access',
      description: '1.16B credential attempts against 320K FortiGate targets',
    },
    {
      id: 'T1110.002',
      name: 'Password Cracking',
      tactic: 'Credential Access',
      description: 'Offline GPU cracking of SHA-256 hashes via 45-GPU Hashtopolis cluster',
    },
    {
      id: 'T1040',
      name: 'Network Sniffing',
      tactic: 'Credential Access',
      description: 'Network sniffers on compromised firewalls to capture authentication credentials',
    },
    {
      id: 'T1003',
      name: 'OS Credential Dumping',
      tactic: 'Credential Access',
      description: 'Dumping encrypted credentials from Active Directory via impacket',
    },
    {
      id: 'T1572',
      name: 'Protocol Tunneling',
      tactic: 'Command and Control',
      description: 'Chisel and Neo-reGeorg tunneling tools for persistent access',
    },
    {
      id: 'T1021.002',
      name: 'SMB/Windows Admin Shares',
      tactic: 'Lateral Movement',
      description: 'SMB-based access to file servers using recovered admin credentials',
    },
    {
      id: 'T1041',
      name: 'Exfiltration Over C2',
      tactic: 'Exfiltration',
      description: '105 GB of military data exfiltrated from Turkish defense contractor',
    },
  ],
  conclusion: {
    takeaways: [
      'Scale without precedent: ~50% of all internet-facing FortiGate firewalls globally compromised',
      'Not a zero-day — worse: exploits legacy password hashing persisting after firmware upgrades',
      'IAB-as-a-Service model: fully automated, AI-enhanced credential harvesting and marketplace listing',
      'Confirmed espionage impact: 105 GB military data exfiltration from Turkish NATO contractor',
      'Ongoing campaign with self-reinforcing credential feed-back loop',
    ],
    actions: [
      { priority: 'immediate', action: 'Rotate ALL FortiGate admin and SSL VPN credentials immediately' },
      { priority: 'immediate', action: 'Force PBKDF2 re-hashing by requiring admin login after firmware upgrade' },
      { priority: 'immediate', action: 'Enforce MFA on all administrative and VPN interfaces' },
      {
        priority: 'short-term',
        action: 'Restrict management interface exposure — remove all internet-facing admin panels',
      },
      {
        priority: 'short-term',
        action: 'Hunt for compromise indicators: unauthorized accounts, sniffers, tunneling tools',
      },
      { priority: 'short-term', action: 'Check exposure databases (Hudson Rock, SOCRadar) for inclusion in dataset' },
      { priority: 'long-term', action: 'Implement zero-trust network access for all management interfaces' },
    ],
  },
  metrics: [
    { label: 'Unique device URLs', value: '73,932' },
    { label: 'Countries affected', value: '194' },
    { label: 'Credential attempts (FortiGate)', value: '1.16 billion' },
    { label: 'Credential attempts (MSSQL)', value: '2.1 billion' },
    { label: 'Data exfiltrated (Turkish MoD)', value: '105 GB' },
    { label: 'Confirmed AD compromises', value: '148 (CloudSEK)' },
    { label: '% of internet-facing FortiGate', value: '~50%' },
  ],
  externalUrl: 'https://ti-mindmap-hub.com/analytics/fortibleed-fortinet-credential-compromise-cross-source-analysis',
};

const TEAMPCP_SUPPLY_CHAIN: AgenticReport = {
  id: 'teampcp-supply-chain',
  title: 'TeamPCP Multi-Stage Supply Chain Campaign — Cross-Source Analysis',
  tlp: 'WHITE',
  severity: 'critical',
  publishedAt: '2026-03-26',
  sources: [
    {
      title: 'TeamPCP Supply Chain Campaign Analysis',
      source: 'TI Mindmap HUB',
      url: 'https://ti-mindmap-hub.com/analytics/teampcp-supply-chain-threat-intelligence-report',
      publishedAt: '2026-03-26',
    },
  ],
  tags: ['supply-chain', 'teampcp', 'kubernetes', 'credential-theft', 'ransomware', 'wiper', 'ci-cd'],
  summary: `Between December 2025 and March 2026, TeamPCP (also tracked as PCPcat, ShellForce, DeadCatx3) evolved from opportunistic exploitation of exposed Docker and Kubernetes APIs into a coordinated, multi-stage supply chain operation that compromised five major vendor ecosystems in five days during March 2026.

The campaign's defining characteristic is its cascading nature: a single unrevoked CI credential from Aqua Security's Trivy pipeline enabled TeamPCP to snowball access across GitHub Actions, npm, PyPI, OpenVSX extensions, and multiple high-trust security tools (Trivy, Checkmarx KICS, BerriAI LiteLLM, Telnyx SDK). Over **300 GB of compressed credentials** were exfiltrated from an estimated **500,000+ infected machines** and CI/CD runners.`,
  attribution: {
    actor: 'TeamPCP (PCPcat / ShellForce / DeadCatx3)',
    type: 'Cybercrime group',
    motivation: 'Financial (credential theft, ransomware precursor)',
    infrastructure: 'Decentralized C2 via ICP canisters, Telegram, BreachForums',
  },
  technicalDetails: `TeamPCP developed an evolving malware toolkit:
- **kamikaze.sh**: Initial credential harvester (3 versions: v1 basic exfil, v2 GitHub runner memory scraping via /proc/pid/mem, v3 secondary payload pull). Exfiltrates to typosquatted domains via HTTP POST with AES-256-CBC + RSA-4096.
- **kube.py**: Python worm and wiper. Deploys privileged DaemonSets on Kubernetes clusters. In Iranian environments, deploys host-provisioner-iran DaemonSet that mounts host root and wipes all directories.
- **CanisterWorm**: Self-propagating npm worm using ICP canisters for decentralized C2.`,
  detection: [
    {
      title: 'Compromised CI/CD Credential Usage',
      description: 'Detect use of leaked CI tokens from known compromised pipelines',
      severity: 'critical',
      mitreId: 'T1078.004',
    },
    {
      title: 'Kubernetes DaemonSet Anomaly',
      description: 'Alert on privileged DaemonSet creation from unexpected namespaces',
      severity: 'high',
      mitreId: 'T1610',
    },
    {
      title: 'npm Package Typosquatting',
      description: 'Monitor for installs from known typosquatted package names',
      severity: 'high',
      mitreId: 'T1195.002',
    },
  ],
  iocs: [
    {
      type: 'Domain',
      value: 'typosquatted npm registry domains',
      description: 'Exfiltration endpoints for kamikaze.sh',
      confidence: 'HIGH',
    },
    {
      type: 'Hash',
      value: 'kamikaze.sh variants (v1, v2, v3)',
      description: 'Credential harvester shell scripts',
      confidence: 'HIGH',
    },
    { type: 'Hash', value: 'kube.py', description: 'Kubernetes worm and wiper component', confidence: 'HIGH' },
  ],
  ttps: [
    {
      id: 'T1195.002',
      name: 'Supply Chain Compromise: Software Supply Chain',
      tactic: 'Initial Access',
      description: 'Compromised Trivy GitHub Actions pipeline',
    },
    {
      id: 'T1078.004',
      name: 'Valid Accounts: Cloud Accounts',
      tactic: 'Initial Access',
      description: 'Unrevoked CI credentials used across GitHub Actions, npm, PyPI',
    },
    {
      id: 'T1059.004',
      name: 'Command and Scripting Interpreter: Unix Shell',
      tactic: 'Execution',
      description: 'kamikaze.sh execution on CI runners',
    },
    {
      id: 'T1610',
      name: 'Deploy Container',
      tactic: 'Execution',
      description: 'Privileged DaemonSet deployment on Kubernetes clusters',
    },
    {
      id: 'T1485',
      name: 'Data Destruction',
      tactic: 'Impact',
      description: 'kube.py wiper destroys host filesystem in Iranian environments',
    },
  ],
  conclusion: {
    takeaways: [
      'Single unrevoked credential cascaded across 5 major vendor ecosystems in 5 days',
      '500,000+ machines infected through supply chain trust propagation',
      'Novel use of ICP canisters for decentralized, resilient C2',
      'Confirmed coordination with LAPSUS$ and Vect ransomware group',
    ],
    actions: [
      { priority: 'immediate', action: 'Rotate all CI/CD credentials and audit pipeline access logs' },
      { priority: 'immediate', action: 'Review Kubernetes RBAC for unauthorized DaemonSet creation' },
      { priority: 'short-term', action: 'Audit npm/PyPI dependencies for known typosquatted packages' },
      { priority: 'long-term', action: 'Implement short-lived CI credentials with automatic rotation' },
    ],
  },
  metrics: [
    { label: 'Machines infected', value: '500,000+' },
    { label: 'Credentials exfiltrated', value: '300+ GB' },
    { label: 'Vendor ecosystems compromised', value: '5' },
    { label: 'Campaign duration', value: '5 days (March 2026)' },
  ],
  externalUrl: 'https://ti-mindmap-hub.com/analytics/teampcp-supply-chain-threat-intelligence-report',
};

const TYCOON_2FA: AgenticReport = {
  id: 'tycoon-2fa-phishing',
  title: 'Tycoon 2FA Phishing Kit — Microsoft 365 AitM Reverse Proxy',
  tlp: 'WHITE',
  severity: 'high',
  publishedAt: '2026-05-15',
  sources: [
    {
      title: 'Tycoon 2FA Phishing Kit Analysis',
      source: 'Phish.report / Valimail',
      url: 'https://phish.report/analysis/',
      publishedAt: '2026-05-15',
    },
  ],
  tags: ['phishing', 'aitm', 'mfa-bypass', 'microsoft-365', 'paas', 'reverse-proxy'],
  summary: `Tycoon 2FA is a phishing-as-a-service (PaaS) kit targeting Microsoft 365 credentials using an Adversary-in-the-Middle (AitM) reverse proxy technique. The kit bypasses MFA by relaying authentication sessions in real time between the victim and the legitimate Microsoft login page.

Infrastructure is hosted on Cloudflare Workers with a custom AitM proxy written in Node.js. Successful authentications are logged in MongoDB with Telegram bot integration for real-time notifications. Sold for $120-$350/month on cybercrime forums.`,
  attribution: {
    actor: 'Suspected Russian-speaking actor',
    type: 'Phishing-as-a-Service (PaaS) operator',
    motivation: 'Financial (credential sales, account takeover)',
  },
  technicalDetails: `The kit uses a reverse proxy architecture:
1. Victim receives phishing link mimicking Microsoft 365 login
2. Proxy sits between victim and legitimate Microsoft login page
3. Credentials and MFA tokens are relayed in real-time
4. Authenticated session cookies are captured
5. Attacker receives session token via Telegram notification

Infrastructure: Cloudflare Workers (domain fronting), Node.js AitM proxy, MongoDB logging, Telegram bot integration.`,
  detection: [
    {
      title: 'AitM Proxy Session Relay',
      description: 'Detect unusual authentication session relay patterns to Microsoft 365',
      severity: 'high',
      mitreId: 'T1539',
    },
    {
      title: 'Cloudflare Workers Phishing',
      description: 'Monitor for newly registered Cloudflare Workers domains mimicking Microsoft',
      severity: 'medium',
      mitreId: 'T1583.003',
    },
  ],
  iocs: [
    {
      type: 'URL',
      value: 'Tycoon 2FA phishing domains',
      description: 'Cloudflare Workers-hosted phishing pages',
      confidence: 'MEDIUM',
    },
  ],
  ttps: [
    {
      id: 'T1566.002',
      name: 'Spearphishing Link',
      tactic: 'Initial Access',
      description: 'Phishing links to AitM proxy pages',
    },
    {
      id: 'T1539',
      name: 'Steal Web Session Cookie',
      tactic: 'Credential Access',
      description: 'Session cookie capture via reverse proxy',
    },
    {
      id: 'T1090',
      name: 'Proxy',
      tactic: 'Command and Control',
      description: 'AitM reverse proxy for credential relay',
    },
    {
      id: 'T1102',
      name: 'Web Service',
      tactic: 'Command and Control',
      description: 'Cloudflare Workers infrastructure',
    },
  ],
  conclusion: {
    takeaways: [
      'MFA alone is insufficient against AitM reverse proxy attacks',
      'PaaS model lowers barrier to entry for credential theft',
      'Cloudflare Workers abuse provides resilient, domain-fronted infrastructure',
    ],
    actions: [
      { priority: 'immediate', action: 'Deploy phishing-resistant MFA (FIDO2/WebAuthn) for all Microsoft 365 users' },
      { priority: 'short-term', action: 'Implement Conditional Access policies to block legacy authentication' },
      { priority: 'long-term', action: 'Deploy email security solutions with AitM detection capabilities' },
    ],
  },
  metrics: [
    { label: 'Kit price', value: '$120-$350/month' },
    { label: 'Target platforms', value: 'Microsoft 365' },
    { label: 'Target sectors', value: 'Financial, Healthcare, Government, Education' },
    { label: 'Geographic targeting', value: 'US, UK, Germany, France' },
  ],
};

export const AGENTIC_REPORTS: AgenticReport[] = [FORTIBLEED, TEAMPCP_SUPPLY_CHAIN, TYCOON_2FA];

export const AGENTIC_BY_ID: Record<string, AgenticReport> = Object.fromEntries(AGENTIC_REPORTS.map((r) => [r.id, r]));
