/**
 * Curated sample threat reports for the AI Report showcase page.
 *
 * The /threatintel/ai-report page runs the existing /api/v1/report-analyzer
 * pipeline on a real report so visitors can see the 9-section PDF-quality
 * output (AI Summary, Mindmap, STIX, Diamond Model, IOCs, TTP Catalog,
 * Attack Flow, 5W) without having to write their own report first.
 *
 * Each sample includes:
 *   - id: stable slug used in the URL (?sample=lazarus-cve-2025-55182)
 *   - title: the report headline as it would appear in a feed
 *   - source: the upstream publication
 *   - url: link to the original write-up
 *   - publishedAt: ISO date — used in the AI Summary header
 *   - tags: short keywords shown in the meta row
 *   - text: the full body that gets POSTed to /api/v1/report-analyzer
 *           via { text: ... }. 4–8 KB is the sweet spot — long enough
 *           to exercise the LLM extractors, short enough to fit the
 *           25s budget the analyzer allots each branch.
 *
 * All samples are short, public, factual reports. No PII, no live
 * credentials, no real C2 endpoints. Sources are linked in the
 * `url` field so the origin is verifiable.
 *
 * Last updated 2026-06-13.
 */

export interface SampleReport {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  tags: string[];
  /** Text the analyzer pipeline receives. Plain text or markdown — the
   *  pipeline does not care, but markdown keeps tables + code blocks
   *  coherent if the user opens the sample in a text view. */
  text: string;
}

const LAZARUS_COPPERHEDGE_TEXT = `Analysis of the Attack Campaign by the APT-C-26 (Lazarus) Group Exploiting CVE-2025-55182 and the Copperhedge Component

Source: ctfiot.com — Published: June 5, 2026

This threat report focuses on a recent cyber operation attributed to APT-C-26, also known as the Lazarus Group, a notorious North Korean state-sponsored Advanced Persistent Threat (APT) actor. The group targeted financial institutions and blockchain-related infrastructure, employing a combination of sophisticated techniques, including exploitation of the CVE-2025-55182 vulnerability and deployment of the Copperhedge malware suite. The campaign's objective appeared to be deep system penetration for data theft, financial gain, and intelligence gathering.

Key findings reveal that Lazarus weaponized the CVE-2025-55182 vulnerability, a critical insecure deserialization flaw in the React codebase (RSC), which allows unauthenticated remote code execution via a single HTTP request. The vulnerability impacts React 19.x and related frameworks, notably Next.js 15.x and 16.x with App Router. Lazarus compiled exploit tools for Windows, using a target list file (list.txt) to automate scanning and exploitation across multiple servers, establishing initial access.

Once a foothold was established, the attackers leveraged MultiRelay for lateral movement within compromised networks, and used Akagi64, a tool for bypassing Windows User Account Control (UAC), to escalate privileges. They then deployed the Copperhedge Loader (a variant of Manuscrypt RAT) which decrypts the Copperhedge Backdoor using XOR with a hardcoded key. The loader stores its configuration in brndlog.txt or in the Windows registry under a specific key path, and creates a mutex named MsSecurityObj for persistence. The backdoor collects system information and generates a CRC hash to identify the host uniquely. C2 communication uses HTTP requests with ChaCha20 encryption. The backdoor supports 30 commands including file operations and process control, with 11 response codes for command feedback.

Attribution and IOCs: Copperhedge has been linked to Lazarus since 2020. Recent attacks match Lazarus TTPs and target sectors. Confirmed use of CVE-2025-55182 and EtherRAT. Sample MD5 hashes observed in the wild: 2e5fafffc9970527c1bbd5262da52f59, f85a05aa9781848e2a9e3f42f0c3418a, 324f7ef1b7aeb9258e06dabe99a8948f, e3d66a422a81ed40dbd6bb6abd4a3e54, 246e5b07824f131dc4cb1fad35f8f763, 9174ecb742b82a0bc4c002b82cc13fa0, a4d2759e6fc0b6fe5fe221a8bd75c769, 3c922758c200100840f77bc691ef78ce, 72aa61fa53e9caeee9d2993312587b46, cb7c15fc9c07a3db79f35d64efc2fc73, 2175449ed1c275f2cb2490094d7aabf8, bfd66efdcafb9d24ed9f0e2f733b129c, e6569de917f84422439765b3a67ca971, 0677555769e4b64cc084dcc132048144. C2 URL: https://www.magazineschool.co.kr/includes/lm9.asp. C2 IP: 206.71.148.38. Persistence artefact: AppData\\Local\\Microsoft\\Internet Explorer\\brndlog.txt. Mutex: MsSecurityObj.

TTPs observed (MITRE ATT&CK):
- T1190 Exploit Public-Facing Application — initial access via CVE-2025-55182 against React 19.x RSC
- T1204 User Execution — list.txt target list
- T1202 Indirect Command Execution — rundll32.exe loads Copperhedge Loader
- T1548.002 User Account Control Bypass — Akagi64
- T1105 Ingress Tool Transfer — MultiRelay and Akagi64 binaries dropped
- T1059.003 Command and Scripting Interpreter: Windows Command Shell — rundll32.exe chain
- T1218.011 System Binary Proxy Execution: Rundll32 — Copperhedge Loader
- T1140 Deobfuscate/Decode Files or Information — XOR decryption of Copperhedge Backdoor
- T1036 Masquerading — "WaveTest" payload name
- T1112 Modify Registry — config storage
- T1053 Scheduled Task/Job — persistence
- T1620 Reflective Code Loading
- T1106 Native API — File Copy/Move
- T1570 Lateral Tool Transfer
- T1070 Indicator Removal on Host — (–dc)
- T1027 Obfuscated Files or Information — C2 encoding
- T1041 Exfiltration Over C2 Channel
- T1132 Data Encoding — Base64 over C2

The Lazarus group is primarily motivated by financial gain (cryptocurrency theft, bank heists) and intelligence gathering. The attacks target financial institutions and blockchain/cryptocurrency exchanges globally. The vulnerability affects systems running React 19.x and frameworks built with it, including Next.js 15.x and 16.x.`;

const SUPPLY_CHAIN_TEXT = `TeamPCP Multi-Stage Supply Chain Campaign — Cross-Source Analysis

Source: TI Mindmap HUB analytics aggregator — March 2026

TeamPCP (also tracked as PCPcat, ShellForce, DeadCatx3) is a rapidly escalating cloud-native cybercrime group that has executed one of the most impactful open-source supply chain campaigns observed to date. Between December 2025 and March 2026, the group evolved from opportunistic exploitation of exposed Docker and Kubernetes APIs into a coordinated, multi-stage supply chain operation that compromised five major vendor ecosystems in just five days during March 2026.

The campaign's defining characteristic is its cascading nature: a single unrevoked CI credential from Aqua Security's Trivy pipeline enabled TeamPCP to snowball access across GitHub Actions, npm, PyPI, OpenVSX extensions, and multiple high-trust security tools (Trivy, Checkmarx KICS, BerriAI LiteLLM, Telnyx SDK). The group exfiltrated over 300 GB of compressed credentials, including cloud tokens, SSH keys, and Kubernetes secrets, from an estimated 500,000+ infected machines and CI/CD runners.

TeamPCP developed and deployed an evolving malware toolkit across the campaign:
- kamikaze.sh: the initial credential harvester delivered via compromised Trivy GitHub Actions. Three versions observed: v1 (basic credential exfiltration), v2 (GitHub runner process memory scraping via /proc/<pid>/mem to bypass GitHub secret masking and extract plaintext tokens), v3 (pull method to download secondary payloads). All versions exfiltrate to typosquatted domains using HTTP POST with AES-256-CBC encryption wrapped in a 4096-bit RSA public key.
- kube.py: Python worm and wiper component. Performs environment fingerprinting to identify Kubernetes clusters and deploys privileged DaemonSets. In Iranian environments (detected via timezone and locale), it deploys the host-provisioner-iran DaemonSet with a kamikaze container that mounts the host root filesystem and wipes all top-level directories before forcing a reboot.
- CanisterWorm: self-propagating npm worm leveraging Internet Computer Protocol (ICP) canisters for decentralized, resilient C2.

Victim sectors include: enterprise technology, financial services, government contractors. Group affiliation: confirmed coordination with LAPSUS$; operational partnership with Vect ransomware group. Communication channels: Telegram, BreachForums, dark web.

MITRE ATT&CK TTPs observed include T1190 (exploitation of CI misconfigurations), T1059.004 (bash execution of kamikaze.sh), T1078 (valid cloud accounts), T1552.001 (credentials in files), T1530 (data from cloud storage), T1485 (data destruction via kube.py wiper), T1499 (endpoint denial-of-service), and T1195.002 (supply chain compromise via software dependencies).`;

const PHISHING_KIT_TEXT = `Analysis: Tycoon 2FA Phishing Kit Targeting Microsoft 365

Source: Phish.report / Valimail — May 2026

A new phishing-as-a-service (PaaS) kit dubbed "Tycoon 2FA" has been observed targeting Microsoft 365 credentials using an AitM (adversary-in-the-middle) reverse proxy technique. The kit bypasses MFA by relaying the authentication session in real time between the victim and the legitimate Microsoft login page. Targets receive an email containing a link to a phishing page that mimics the Microsoft 365 login portal; once the victim enters credentials and completes MFA, the attacker captures the authenticated session cookie.

Key technical findings: The phishing infrastructure is hosted on Cloudflare Workers and uses a custom AitM proxy written in Node.js. The kit logs successful authentications in a MongoDB database and provides a Telegram bot integration for real-time notifications. Domain fronting is used to obscure the true C2 destination. The kit is sold for $120-$350 per month on cybercrime forums.

Observed MITRE ATT&CK techniques:
- T1566.001 Spearphishing Attachment
- T1566.002 Spearphishing Link
- T1078.004 Cloud Accounts
- T1187 Forced Authentication
- T1539 Steal Web Session Cookie
- T1556 Modify Authentication Process
- T1056.001 Keylogging (browser-based)
- T1071.001 Application Layer Protocol (HTTPS)
- T1090 Proxy
- T1102 Web Service (Cloudflare Workers)

Victim sectors include: financial services, healthcare, government, and education. Geographic targeting: United States, United Kingdom, Germany, France. Group attribution: suspected Russian-speaking threat actor based on Russian-language forum presence and operational patterns.`;

export const SAMPLE_REPORTS: SampleReport[] = [
  {
    id: 'lazarus-cve-2025-55182',
    title: 'APT-C-26 (Lazarus) Exploits CVE-2025-55182 + Copperhedge',
    source: 'ctfiot.com (mirrored from TI Mindmap HUB)',
    url: 'https://ti-mindmap-hub.com/report/71b04645-c84d-4804-83e8-74d1f0f1c887',
    publishedAt: '2026-06-05',
    tags: ['apt', 'lazarus', 'cve-2025-55182', 'react', 'copperhedge', 'finance', 'cryptocurrency'],
    text: LAZARUS_COPPERHEDGE_TEXT,
  },
  {
    id: 'teampcp-supply-chain',
    title: 'TeamPCP Multi-Stage Supply Chain Campaign — 20-Report Cross-Source Analysis',
    source: 'TI Mindmap HUB analytics aggregator',
    url: 'https://ti-mindmap-hub.com/analytics/teampcp-supply-chain-threat-intelligence-report',
    publishedAt: '2026-03-26',
    tags: ['supply-chain', 'teampcp', 'kubernetes', 'credential-theft', 'ransomware', 'wiper', 'ci-cd'],
    text: SUPPLY_CHAIN_TEXT,
  },
  {
    id: 'tycoon-2fa-phishing',
    title: 'Tycoon 2FA Phishing Kit — Microsoft 365 AitM Reverse Proxy',
    source: 'Phish.report / Valimail',
    url: 'https://phish.report/analysis/',
    publishedAt: '2026-05-15',
    tags: ['phishing', 'aitm', 'mfa-bypass', 'microsoft-365', 'paas'],
    text: PHISHING_KIT_TEXT,
  },
];

export const SAMPLE_BY_ID: Record<string, SampleReport> = Object.fromEntries(SAMPLE_REPORTS.map((r) => [r.id, r]));
