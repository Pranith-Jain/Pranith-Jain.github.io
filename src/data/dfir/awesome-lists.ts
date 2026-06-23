/**
 * Curated GitHub awesome-lists — external reference catalogues that an
 * analyst will actually open mid-investigation.
 *
 * Honest scope:
 *   - These are CURATED ENTRY POINTS, not a verified live feed. Awesome-list
 *     READMEs decay (dead links creep in), so each entry is dated by stars +
 *     last-updated as a freshness proxy. Re-check before acting on a
 *     specific link.
 *   - We bias toward big, actively-maintained lists (★ > 1k or recent
 *     commits), supplemented by a few smaller specialty lists that fill
 *     genuine gaps (Claude Code security skills, MCP security).
 *   - Each entry's `why` field explains why I personally come back to that
 *     list — the tradecraft niche it covers — rather than just restating
 *     the README.
 *
 * Last verified 2026-05-11 (gh repo metadata).
 */

export type AwesomeFocus =
  | 'threat-intel'
  | 'osint'
  | 'incident-response'
  | 'cybersecurity-general'
  | 'soc-cert'
  | 'mcp-security'
  | 'ai-skills';

export interface AwesomeList {
  id: string;
  /** Pretty display name. */
  name: string;
  /** "owner/repo" — the canonical short form. */
  repo: string;
  /** Full GitHub URL — what the card click opens. */
  url: string;
  /** What the list contains, in 1–2 sentences. */
  description: string;
  /** Which DFIR/CTI niche this list serves; used for filter chips. */
  focus: AwesomeFocus[];
  /** Star count rounded for display ("26k", "1.4k", "692"). */
  stars: string;
  /** Optional badge: "essential" (must-bookmark), "reference" (solid baseline),
   *  "specialised" (narrow but useful). */
  badge?: 'essential' | 'reference' | 'specialised';
  /** Why this list earns a slot on this page — the niche it fills better
   *  than its peers. Surfaces as a single italic line on the card. */
  why: string;
}

export const FOCUS_LABELS: Record<AwesomeFocus, string> = {
  'threat-intel': 'Threat Intelligence',
  osint: 'OSINT',
  'incident-response': 'Incident Response',
  'cybersecurity-general': 'General Cybersec',
  'soc-cert': 'SOC / CERT',
  'mcp-security': 'MCP Security',
  'ai-skills': 'AI / Agent Skills',
};

export const FOCUS_BLURB: Record<AwesomeFocus, string> = {
  'threat-intel': 'CTI feeds, platforms, frameworks, and adversary-tracking resources.',
  osint: 'Open-source intelligence — sites, tools, browser extensions, search dorks.',
  'incident-response': 'IR tradecraft — triage, memory forensics, network forensics, malware analysis.',
  'cybersecurity-general': 'Broad cybersec resource catalogues — red/blue/training/policy.',
  'soc-cert': 'SOC / CERT operations — IOC feeds, detection content, suspicious-indicator lists.',
  'mcp-security': 'Model Context Protocol — server security, attack surface, defensive tooling.',
  'ai-skills': 'AI agent skills + security toolkits for Claude Code and similar runtimes.',
};

export const BADGE_PILL: Record<NonNullable<AwesomeList['badge']>, string> = {
  essential: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  reference: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  specialised: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
};

export const FOCUS_PILL: Record<AwesomeFocus, string> = {
  'threat-intel': 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  osint: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  'incident-response': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'cybersecurity-general': 'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
  'soc-cert': 'border-cyan-500/40 bg-cyan-500/10 text-sky-700 dark:text-sky-300',
  'mcp-security': 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
  'ai-skills': 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
};

export const LISTS: AwesomeList[] = [
  // ─── Live dashboards (not technically awesome-lists but high-value
  //     external sources we have wired in) ───────────────────────────────
  {
    id: 'mythreatintel-com',
    name: 'My Threat Intel · live ransomware dashboard',
    repo: 'mythreatintel.com',
    url: 'https://www.mythreatintel.com/?lang=en',
    description:
      'Spanish/English dashboard tracking ransomware incidents with country / sector / timeline charts. Open-directory at /rescate/ + /screenshots/ provides 180+ ransom-note transcripts and leak-site landing-page captures. No RSS feed.',
    focus: ['threat-intel'],
    stars: 'site',
    badge: 'reference',
    why: 'The only public source I have found that ships per-group ransom-note transcripts AND leak-site screenshots together — linked from the External Sources block on /threatintel.',
  },

  // ─── OSINT ───────────────────────────────────────────────────────────────
  {
    id: 'jivoi-awesome-osint',
    name: 'Awesome OSINT',
    repo: 'jivoi/awesome-osint',
    url: 'https://github.com/jivoi/awesome-osint',
    description:
      'The canonical OSINT meta-list — sites, tools, browser extensions, image/video search, breach data, and country-specific resources, organised by investigation surface.',
    focus: ['osint'],
    stars: '26k',
    badge: 'essential',
    why: 'First-stop reference. If a public OSINT tool is worth knowing, it is in here.',
  },
  {
    id: 'soxoj-osint-mcp-servers',
    name: 'Awesome OSINT MCP Servers',
    repo: 'soxoj/awesome-osint-mcp-servers',
    url: 'https://github.com/soxoj/awesome-osint-mcp-servers',
    description:
      'Model Context Protocol servers that expose OSINT tools (Maigret, Holehe, etc.) to LLM agents. Useful for wiring OSINT capabilities into Claude / Cursor / Cline.',
    focus: ['osint', 'mcp-security'],
    stars: '227',
    badge: 'specialised',
    why: 'Bridges OSINT tradecraft and the agent stack — the place to discover OSINT MCPs you can wire into your IDE.',
  },

  // ─── Threat Intelligence ─────────────────────────────────────────────────
  {
    id: 'hslatman-threat-intel',
    name: 'Awesome Threat Intelligence',
    repo: 'hslatman/awesome-threat-intelligence',
    url: 'https://github.com/hslatman/awesome-threat-intelligence',
    description:
      'The de-facto CTI reference list — sources, formats (STIX/TAXII), frameworks (MITRE, Diamond), training, books, and research blogs. Updated for over a decade.',
    focus: ['threat-intel'],
    stars: '10k',
    badge: 'essential',
    why: 'Best single index of CTI primary sources. Cross-reference whenever a vendor claims novelty.',
  },
  {
    id: 'brandonhimpfen-threat-intel',
    name: 'Awesome Threat Intelligence (brandonhimpfen)',
    repo: 'brandonhimpfen/awesome-threat-intelligence',
    url: 'https://github.com/brandonhimpfen/awesome-threat-intelligence',
    description:
      'Smaller, recently-curated CTI list — feeds, platforms, and tools focused on detect / analyze / respond. Lighter than hslatman but easier to skim end-to-end.',
    focus: ['threat-intel'],
    stars: '9',
    badge: 'specialised',
    why: 'Useful as a quick-glance complement to hslatman — different curator, slightly different selection bias.',
  },

  // ─── Incident Response ───────────────────────────────────────────────────
  {
    id: 'meirwah-incident-response',
    name: 'Awesome Incident Response',
    repo: 'meirwah/awesome-incident-response',
    url: 'https://github.com/meirwah/awesome-incident-response',
    description:
      'IR tools index — triage, evidence collection, memory forensics, network forensics, malware analysis, sandbox stacks, plus IR books / courses / playbooks.',
    focus: ['incident-response'],
    stars: '9k',
    badge: 'essential',
    why: 'The reference list to hand a junior IR analyst on day one.',
  },

  // ─── Detection Engineering ───────────────────────────────────────────────
  {
    id: 'slimkql-detections-ai',
    name: 'SlimKQL · Detections.AI',
    repo: 'SlimKQL/Detections.AI',
    url: 'https://github.com/SlimKQL/Detections.AI',
    description:
      'Mirrored KQL detection-rule library — Defender XDR / Microsoft Sentinel rules with a focus on AI-related, identity-attack, and emerging-threat detections. Active commit cadence.',
    focus: ['threat-intel', 'soc-cert'],
    stars: '114',
    badge: 'specialised',
    why: 'Sharper / niche complement to Azure-Sentinel — wired into /threatintel/rules as a detection-rule source so latest commits appear in the live feed.',
  },

  // ─── SOC / CERT ──────────────────────────────────────────────────────────
  {
    id: 'mthcht-awesome-lists',
    name: 'Awesome Lists (mthcht)',
    repo: 'mthcht/awesome-lists',
    url: 'https://github.com/mthcht/awesome-lists',
    description:
      'A SOC / CERT / CTI working catalogue — IOC feeds, suspicious user-agent strings, malicious ASN lists, scanner fingerprints, detection-rule sources. Practitioner-curated.',
    focus: ['soc-cert', 'threat-intel', 'incident-response'],
    stars: '1.4k',
    badge: 'reference',
    why: 'High operational density — many of the lists here are directly importable into a SIEM or feed pipeline.',
  },

  // ─── General Cybersecurity ───────────────────────────────────────────────
  {
    id: 'okhosting-cyber-security',
    name: 'Awesome Cyber Security',
    repo: 'okhosting/awesome-cyber-security',
    url: 'https://github.com/okhosting/awesome-cyber-security',
    description:
      'Broad cybersec resource catalogue — red/blue tools, certifications, books, talks, podcasts. Generalist coverage rather than niche depth.',
    focus: ['cybersecurity-general'],
    stars: '522',
    badge: 'reference',
    why: 'Useful for orientation and when an adjacent topic needs a starting bibliography.',
  },

  // ─── MCP / AI Agent Security ─────────────────────────────────────────────
  {
    id: 'puliczek-mcp-security',
    name: 'Awesome MCP Security',
    repo: 'Puliczek/awesome-mcp-security',
    url: 'https://github.com/Puliczek/awesome-mcp-security',
    description:
      'Model Context Protocol security — published vulns, attack surface notes, defensive tooling, server-hardening tips, and MCP-specific threat research.',
    focus: ['mcp-security'],
    stars: '692',
    badge: 'specialised',
    why: 'MCP is a fast-moving attack surface. Track this for new server CVEs and posture-management tooling.',
  },
  {
    id: 'mordavid-cyber-mcp',
    name: 'Awesome Cyber Security MCP',
    repo: 'MorDavid/awesome-cyber-security-mcp',
    url: 'https://github.com/MorDavid/awesome-cyber-security-mcp',
    description:
      'Index of cybersecurity-focused MCP servers — pentest helpers, IOC enrichment, threat-feed bridges. Smaller list, narrower than the OSINT-MCP one.',
    focus: ['mcp-security', 'cybersecurity-general'],
    stars: '87',
    badge: 'specialised',
    why: 'Pair with the OSINT-MCP list to discover MCPs that fit your defensive workflow.',
  },
  {
    id: 'eyadkelleh-claude-skills-security',
    name: 'Awesome Claude Skills · Security',
    repo: 'Eyadkelleh/awesome-claude-skills-security',
    url: 'https://github.com/Eyadkelleh/awesome-claude-skills-security',
    description:
      'Security testing toolkit for Claude Code — curated SecLists wordlists, injection payloads, and expert agents for authorized pentest / CTF / bug-bounty work.',
    focus: ['ai-skills', 'cybersecurity-general'],
    stars: '235',
    badge: 'specialised',
    why: 'Useful pattern reference for building security-flavoured skills in Claude Code.',
  },

  // ─── Meta lists + General Cybersecurity (added 2026-05-11) ───────────────
  {
    id: 'hack-with-github-awesome-hacking',
    name: 'Awesome Hacking (Hack-with-Github)',
    repo: 'Hack-with-Github/Awesome-Hacking',
    url: 'https://github.com/Hack-with-Github/Awesome-Hacking',
    description:
      'Meta-list of awesome-lists — pen-test, exploit dev, web security, mobile, hardware, malware, CTF, OSINT, social engineering. The "start here" index for everything else.',
    focus: ['cybersecurity-general', 'osint', 'threat-intel'],
    stars: '112k',
    badge: 'essential',
    why: 'The directory of directories. When a sub-domain is too niche for the lists in this catalogue, find its sibling here.',
  },
  {
    id: 'carpedm20-awesome-hacking',
    name: 'Awesome Hacking (carpedm20)',
    repo: 'carpedm20/awesome-hacking',
    url: 'https://github.com/carpedm20/awesome-hacking',
    description:
      'Broad hacking tutorials, tools, conference talks, papers, books — older but well-organised, complements the Hack-with-Github meta-list with deeper per-topic curation.',
    focus: ['cybersecurity-general'],
    stars: '16k',
    badge: 'reference',
    why: 'Stronger on conference talks + papers than the Hack-with-Github meta-list — pair the two.',
  },
  {
    id: 'onlurking-awesome-infosec',
    name: 'Awesome InfoSec',
    repo: 'onlurking/awesome-infosec',
    url: 'https://github.com/onlurking/awesome-infosec',
    description:
      'Curated infosec courses + training resources — university lecture series, free MOOCs, books, lab platforms, certification prep.',
    focus: ['cybersecurity-general'],
    stars: '5.7k',
    badge: 'reference',
    why: 'The reference list when someone asks "how do I get into infosec" — has actual learning paths, not just tool lists.',
  },

  // ─── Offensive Security / AppSec ─────────────────────────────────────────
  {
    id: 'enaqx-awesome-pentest',
    name: 'Awesome Penetration Testing',
    repo: 'enaqx/awesome-pentest',
    url: 'https://github.com/enaqx/awesome-pentest',
    description:
      'Penetration-testing tools, books, courses, conferences, intentionally-vulnerable apps, online resources. The canonical pentest meta-list.',
    focus: ['cybersecurity-general'],
    stars: '26k',
    badge: 'essential',
    why: 'Best single index of pentest tooling — keeps you from rebuilding a discovery list every engagement.',
  },
  {
    id: 'paragonie-awesome-appsec',
    name: 'Awesome AppSec',
    repo: 'paragonie/awesome-appsec',
    url: 'https://github.com/paragonie/awesome-appsec',
    description:
      'Application-security learning resources — cryptography pitfalls, secure-code reviews, OWASP Top-10 deep dives, language-specific guidance.',
    focus: ['cybersecurity-general'],
    stars: '6.9k',
    badge: 'reference',
    why: 'AppSec-focused complement to the broader pentest list — heavier on theory + code-review craft.',
  },
  {
    id: '0xInfection-awesome-waf',
    name: 'Awesome WAF',
    repo: '0xInfection/Awesome-WAF',
    url: 'https://github.com/0xInfection/Awesome-WAF',
    description:
      'Everything WAF — fingerprints, bypass techniques, evasion research, vendor-specific notes, related CVEs. From an offensive-research perspective.',
    focus: ['cybersecurity-general'],
    stars: '7.5k',
    badge: 'specialised',
    why: 'The reference when you need to fingerprint or test against a WAF during a pentest or red-team engagement.',
  },
  {
    id: 'analysis-tools-dev-static-analysis',
    name: 'Static Analysis (SAST) tools',
    repo: 'analysis-tools-dev/static-analysis',
    url: 'https://github.com/analysis-tools-dev/static-analysis',
    description:
      'Curated SAST tools + linters across every language — Semgrep, CodeQL, SonarQube, Checkmarx, Bandit, gosec, ESLint security plugins, and language-specific entries.',
    focus: ['cybersecurity-general'],
    stars: '14k',
    badge: 'reference',
    why: 'Single source of truth when scoping AppSec automation or evaluating SAST vendors.',
  },

  // ─── Wordlists / payloads / training ─────────────────────────────────────
  {
    id: 'danielmiessler-seclists',
    name: 'SecLists',
    repo: 'danielmiessler/SecLists',
    url: 'https://github.com/danielmiessler/SecLists',
    description:
      "The security tester's companion — usernames, passwords, fuzzing payloads, web-content discovery wordlists, data patterns. Not strictly an awesome-list, but the most-referenced security wordlist collection in existence.",
    focus: ['cybersecurity-general'],
    stars: '71k',
    badge: 'essential',
    why: 'Half of the security-testing tools in this catalogue have SecLists as a default wordlist dependency.',
  },
  {
    id: 'joe-shenouda-awesome-cyber-skills',
    name: 'Awesome Cyber Skills',
    repo: 'joe-shenouda/awesome-cyber-skills',
    url: 'https://github.com/joe-shenouda/awesome-cyber-skills',
    description:
      'Curated list of legal hacking environments to practise on — CTF platforms, intentionally-vulnerable apps, lab simulators, war games. Skill-building only, no live targets.',
    focus: ['cybersecurity-general'],
    stars: '4.4k',
    badge: 'reference',
    why: 'When upskilling on a new technique, this is faster than building a lab from scratch.',
  },

  // ─── Network forensics ───────────────────────────────────────────────────
  {
    id: 'caesar0301-awesome-pcaptools',
    name: 'Awesome PCAP Tools',
    repo: 'caesar0301/awesome-pcaptools',
    url: 'https://github.com/caesar0301/awesome-pcaptools',
    description:
      'Tools for PCAP capture, analysis, and protocol dissection — from Wireshark plugins to ML-driven anomaly detectors. Includes sample-PCAP corpora for testing.',
    focus: ['incident-response'],
    stars: '3.4k',
    badge: 'specialised',
    why: 'IR-focused complement to meirwah/awesome-incident-response — sharper on the network-forensics niche.',
  },

  // ─── OSINT (kept distinct because of focus tagging) ───────────────────────
  {
    id: 'rawfilejson-awesome-osint-arsenal',
    name: 'Awesome OSINT Arsenal',
    repo: 'rawfilejson/awesome-osint-arsenal',
    url: 'https://github.com/rawfilejson/awesome-osint-arsenal',
    description:
      'Curated OSINT + recon toolkit for Kali Linux — 100+ tools with a one-command installer. Strong on the "ready-to-go investigator workstation" angle.',
    focus: ['osint'],
    stars: '382',
    badge: 'specialised',
    why: 'Useful when bootstrapping a fresh OSINT VM — saves an hour of apt+pip+go installs.',
  },
];
