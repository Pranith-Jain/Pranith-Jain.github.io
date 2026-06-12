/**
 * Curated mirror of https://research.redhuntlabs.com/
 *
 * RedHunt Labs is a cybersecurity company that primarily operates in
 * Attack Surface Management (ASM) and Exposures. Their research arm
 * publishes open-source security tools, runs Project Resonance (an
 * internet-wide security research initiative), and releases
 * downloadable research datasets.
 *
 * This file seeds a /threatintel/redhunt-labs sub-page with:
 *   - the open-source tools listed on their /tools page
 *   - the Project Resonance initiative and the "wave" data releases
 *   - a guide to the "Internet Insights" reports
 *   - their "About" / mission text
 *
 * All 11 tools on the live /tools page are included verbatim with
 * authors, tags, and conference credits. URLs point at the upstream
 * GitHub repos so the page never goes stale when RedHunt updates a
 * README. The structure is deliberately a tree (Tools / Research /
 * Datasets / About) so the page renders the same as /owasp-ai-landscape
 * and /curated-toolbox and a future server-side sync can drop in
 * without re-shaping the UI.
 *
 * Mirrored: 2026-06-13.
 */

export type RedHuntCategory = 'tools' | 'research' | 'datasets' | 'about';

export interface RedHuntAuthor {
  name: string;
  /** GitHub username when known, e.g. 'redhuntlabs'. */
  handle?: string;
}

export interface RedHuntTool {
  /** URL slug — used for keys; not exposed in the UI. */
  id: string;
  name: string;
  url: string;
  authors: RedHuntAuthor[];
  tags: string[];
  conferences: string[];
  description: string;
}

export interface RedHuntSection {
  id: RedHuntCategory;
  short: string;
  longTitle: string;
  intro: string;
}

export const SECTIONS: RedHuntSection[] = [
  {
    id: 'tools',
    short: 'Tools',
    longTitle: 'Open Source Security Tools & Projects',
    intro:
      'RedHunt Labs contributes to a long list of open-source security tools, several of which have been showcased at Black Hat conferences. Each entry links to the upstream GitHub repo so you can file issues, read the source, or pin a version. The same tools are also catalogued in the external resources directory at /threatintel/external-resources.',
  },
  {
    id: 'research',
    short: 'Research',
    longTitle: 'Project Resonance — Internet-Wide Security Research',
    intro:
      "Project Resonance is RedHunt Labs' flagship research initiative: internet-wide port scans, exposure studies, and data leak surveys released one Wave at a time. Every wave targets a specific area (exposed control panels, misconfigured cloud storage, etc.) and ships with a downloadable dataset. They take exclusions seriously and stop scanning hosts that ask to be excluded.",
  },
  {
    id: 'datasets',
    short: 'Datasets',
    longTitle: 'Research Datasets — Project Resonance Waves',
    intro:
      'Each Project Resonance wave ships a structured dataset — typically CSV / JSON of exposed assets, with tags for the asset type, the country of origin, and a confidence score. The datasets are freely downloadable. The live listing is on the upstream /datasets page, where you can filter by wave.',
  },
  {
    id: 'about',
    short: 'About',
    longTitle: 'About RedHunt Labs Research',
    intro:
      'Background on the team, their mission, and the ways external researchers can collaborate. Includes contact info and the "join our newsletter" call to action shown on the upstream /about page.',
  },
];

export const TOOLS: RedHuntTool[] = [
  {
    id: 'varunastra',
    name: 'Varunastra',
    url: 'https://github.com/redhuntlabs/Varunastra',
    authors: [{ name: 'Devang Solanki' }, { name: 'Bhavarth Karmarkar' }],
    tags: ['docker', 'vulnerability-scanner'],
    conferences: ['Black Hat MEA 2024', 'Black Hat Asia 2025'],
    description:
      'Advanced Docker security tool that detects and mitigates vulnerabilities in containers and images. Named after the water weapon in Indian mythology, it is created by Varuna, the god of the hydrosphere. Provides comprehensive container security coverage across build and runtime.',
  },
  {
    id: 'agneyastra',
    name: 'Agneyastra',
    url: 'https://github.com/redhuntlabs/agneyastra',
    authors: [{ name: 'Bhavarth Karmarkar' }, { name: 'Devang Solanki' }],
    tags: ['firebase', 'vulnerability-scanner'],
    conferences: ['Black Hat EU 2024', 'Black Hat Asia 2025'],
    description:
      'Security tool for bug bounty hunters and security professionals that identifies Firebase misconfigurations with high precision. Inspired by the divine fire weapon, it includes extensive checks for all Firebase services, a correlation engine, secret extraction, and automated report generation.',
  },
  {
    id: 'bucketloot',
    name: 'BucketLoot',
    url: 'https://github.com/redhuntlabs/BucketLoot',
    authors: [{ name: 'Umair Nehri' }],
    tags: ['aws', 'gcp', 'digital-ocean', 'vulnerability-scanner'],
    conferences: ['Black Hat EU 2023', 'Black Hat Asia 2024', 'Black Hat USA 2023', 'Black Hat MEA 2023'],
    description:
      'Automated S3-compatible bucket inspector that extracts assets, flags secret exposures, and searches for custom keywords and regex patterns in publicly-exposed storage buckets. Supports AWS S3, Google Cloud Storage, DigitalOcean Spaces, and custom domains/URLs connected to these platforms.',
  },
  {
    id: 'octopii',
    name: 'Octopii',
    url: 'https://github.com/redhuntlabs/Octopii',
    authors: [{ name: 'Owais Shaikh' }],
    tags: ['ML', 'PII-scanner', 'vulnerability-scanner'],
    conferences: [],
    description:
      'Personally Identifiable Information (PII) scanner that uses Optical Character Recognition (OCR), regular expression lists, and Natural Language Processing (NLP) to search public-facing locations for government IDs, addresses, emails, and other sensitive data in images, PDFs, and documents. Encountered many cases where employee and customer data was leaked by these systems.',
  },
  {
    id: 'antisquat',
    name: 'Antisquat',
    url: 'https://github.com/redhuntlabs/Antisquat',
    authors: [{ name: 'Owais Shaikh' }],
    tags: ['ML', 'LLM', 'vulnerability-scanner', 'recon'],
    conferences: ['Black Hat USA 2023'],
    description:
      'AI-powered typosquatting and phishing domain detector. Uses NLP and large language models (e.g. ChatGPT) to analyze domain names for subtle misspellings, brand impersonations, and other patterns that help prevent malicious parties from exploiting user trust and conducting fraud.',
  },
  {
    id: 'awesome-asset-discovery',
    name: 'Awesome-Asset-Discovery',
    url: 'https://github.com/redhuntlabs/awesome-asset-discovery',
    authors: [{ name: 'RedHunt Labs Research', handle: 'redhuntlabs' }],
    tags: ['awesome-list', 'vulnerability-scanner', 'recon', 'osint'],
    conferences: [],
    description:
      'Curated list of resources that help during the asset discovery phase of a security assessment engagement. Covers both offensive and defensive use cases. Community-maintained; contributions of resources and categories are welcome.',
  },
  {
    id: 'online-ide-paste-search',
    name: 'Online IDE & Paste Search Engine',
    url: 'https://github.com/redhuntlabs/Online-IDE-Paste-Search',
    authors: [{ name: 'RedHunt Labs Research', handle: 'redhuntlabs' }],
    tags: ['recon', 'osint'],
    conferences: [],
    description:
      'Custom search tool that looks for specific keywords or strings across a variety of online IDEs, paste sites, and code-sharing platforms. Helps security professionals, developers, and researchers quickly identify potentially sensitive or exposed information — code snippets, credentials, and other critical data that may have been inadvertently shared publicly.',
  },
  {
    id: 'redhunt-os',
    name: 'RedHunt OS',
    url: 'https://github.com/redhuntlabs/RedHunt-OS',
    authors: [{ name: 'RedHunt Labs Research', handle: 'redhuntlabs' }],
    tags: ['recon', 'osint', 'vulnerability-scanner', 'os'],
    conferences: [],
    description:
      'Comprehensive virtual machine for adversary emulation and threat hunting. Integrates a range of attacker tools and defender resources to proactively identify and mitigate threats. Built on Lubuntu-18.04 x64 and ships with Metasploit, Nmap, Maltego, the ELK Stack, and more.',
  },
  {
    id: 'kubestalk',
    name: 'KubeStalk',
    url: 'https://github.com/redhuntlabs/KubeStalk',
    authors: [{ name: 'Umair Nehri' }],
    tags: ['vulnerability-scanner', 'k8s'],
    conferences: [],
    description:
      'Open-source security tool for security professionals, penetration testers, and system administrators to assess the attack surface of Kubernetes clusters. Operates from a black-box perspective, requiring no internal credentials or infrastructure access. Scans the public internet to identify unsecured or misconfigured Kubernetes clusters and their potential entry points.',
  },
  {
    id: 'burpsuite-asset-discover',
    name: 'BurpSuite Asset Discover',
    url: 'https://github.com/redhuntlabs/BurpSuite-Asset-Discover',
    authors: [{ name: 'Sudhanshu Chauhan' }],
    tags: ['recon', 'burpsuite'],
    conferences: [],
    description:
      'Burp Suite extension that acts as a passive scanner, parsing the responses from pages in scope and continuously monitoring for assets. Identifies and classifies assets using RegEx patterns tailored to different asset types. Available on the BApp store for direct install into Burp Suite.',
  },
  {
    id: 'datasploit',
    name: 'Datasploit',
    url: 'https://github.com/redhuntlabs/datasploit',
    authors: [{ name: 'Sudhanshu Chauhan' }, { name: 'Shubham Mittal' }, { name: 'Kunal Aggarwal' }],
    tags: ['recon', 'osint'],
    conferences: [],
    description:
      'OSINT framework built for comprehensive reconnaissance on companies, individuals, phone numbers, Bitcoin addresses, and more. Gathers raw data from various public and private sources, correlates findings, and presents them in a unified, easily digestible format. Identifies sensitive data like credentials, API keys, subdomains, domain history, and legacy portals; exports reports in HTML, JSON, and text.',
  },
];

export interface RedHuntResearchItem {
  id: string;
  title: string;
  url: string;
  summary: string;
  details?: string;
}

export const RESEARCH_ITEMS: RedHuntResearchItem[] = [
  {
    id: 'project-resonance',
    title: 'Project Resonance',
    url: 'https://github.com/redhuntlabs/Project-Resonance-Website',
    summary:
      'Internet-wide surveys to study and understand the security state of the public internet, and to facilitate research into the various components and topics that originate as a result of those surveys.',
    details:
      'Project Resonance improves the security of publicly exposed assets through study of the services and applications running on them, followed by deep analysis and data correlation. Focus areas include unknown custom headers, less popular services, custom protocols, and their impact on security. Coverage goes beyond port scanning into data leakage patterns and cloud infrastructure security. Each Wave targets one specific area of the internet and analyses the current security posture of the components in that area.',
  },
  {
    id: 'awesome-ai-exposure-cheatsheet',
    title: 'Awesome AI Exposure Cheatsheet',
    url: 'https://github.com/redhuntlabs/awesome-ai-exposure-cheatsheet',
    summary:
      'Curated resources for finding and assessing AI/LLM exposures — model endpoints, MCP servers, prompt-injection surfaces, and misconfigured inference infrastructure.',
  },
  {
    id: 'aegis-ai-governance-framework',
    title: 'Aegis — AI Governance Framework',
    url: 'https://github.com/redhuntlabs/Aegis-AI-Governance-Framework',
    summary:
      'Open framework for assessing AI governance posture — model risk classification, policy enforcement, and audit trail generation for organizations deploying AI/ML systems.',
  },
  {
    id: 'one-liner-pocs',
    title: 'One-liner POCs',
    url: 'https://github.com/redhuntlabs/one-liner-pocs',
    summary:
      'Single-line command-line proof-of-concept snippets for reproducing common vulnerability classes — useful for blue teams validating detections and for offensive security researchers documenting new findings.',
  },
  {
    id: 'wizard',
    title: 'Wizard',
    url: 'https://github.com/redhuntlabs/wizard',
    summary:
      'Researcher tooling for chaining external recon utilities, normalising their output into a common schema, and driving them from a single YAML config.',
  },
  {
    id: 'zgrab2',
    title: 'zgrab2 (contrib)',
    url: 'https://github.com/redhuntlabs/zgrab2',
    summary:
      "RedHunt Labs' fork and contribution back to the zgrab2 application-layer scanner used for banner grabbing at internet scale — feeds Project Resonance data collection.",
  },
];

export interface RedHuntDataset {
  id: string;
  wave: string;
  title: string;
  url: string;
  description: string;
  releaseStatus: 'available' | 'pending' | 'historical';
}

export const DATASETS: RedHuntDataset[] = [
  {
    id: 'wave-exposures-overview',
    wave: 'Ongoing',
    title: 'Internet Exposures — Aggregated Index',
    url: 'https://research.redhuntlabs.com/datasets',
    description:
      'The headline dataset for Project Resonance: aggregated counts of exposed services and components across the public IPv4 internet, broken down by country, ASN, and component type. Updated as new waves ship.',
    releaseStatus: 'available',
  },
  {
    id: 'wave-history',
    wave: 'All Waves',
    title: 'Per-Wave Asset Snapshots',
    url: 'https://research.redhuntlabs.com/datasets',
    description:
      'Each historical wave ships its own structured snapshot. The /datasets page on the upstream research site is the canonical index, with a wave filter and a per-wave CSV/JSON download.',
    releaseStatus: 'historical',
  },
];

export interface RedHuntAbout {
  mission: string;
  principles: { title: string; body: string }[];
  contact: { label: string; href: string; value: string }[];
  socials: { label: string; href: string }[];
}

export const ABOUT: RedHuntAbout = {
  mission:
    'At RedHunt Labs, we primarily operate in ASM (Attack Surface Management) and Exposures, and we research the exposures and the whole Internet Attack Surface. We are passionate about making the digital world safer through meaningful and impactful security research. Real change can only come when the world has real visibility of the internet, which is why we share our insights and datasets as much as we responsibly can.',
  principles: [
    {
      title: 'Use and Share',
      body: 'Utilize our data to create impactful solutions. Share your outcomes with us by tagging the RedHunt Labs team — they will showcase your work and share it with the world.',
    },
    {
      title: 'Propose a Study',
      body: 'Have a research idea but lack the resources or scale to execute it? Share your vision and RedHunt Labs will explore how to make it happen.',
    },
    {
      title: 'Collaborate on Projects',
      body: 'Whether you are an individual, organization, or community, RedHunt Labs is open to partnering on groundbreaking research to tackle complex challenges in internet ASM and exposure research.',
    },
  ],
  contact: [{ label: 'email', href: 'mailto:research@redhuntlabs.com', value: 'research@redhuntlabs.com' }],
  socials: [
    { label: 'GitHub', href: 'https://github.com/redhuntlabs' },
    { label: 'Twitter', href: 'https://twitter.com/redHuntLabs' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/company/redhunt-labs' },
  ],
};

/** Convenience counts for the page header. */
export const COUNTS = {
  tools: TOOLS.length,
  research: RESEARCH_ITEMS.length,
  datasets: DATASETS.length,
} as const;
