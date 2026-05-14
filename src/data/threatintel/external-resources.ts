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
    description:
      'Open-source AI security playground for hands-on LLM red teaming — prompt injection, RAG poisoning, OWASP LLM Top 10 — runs fully offline.',
  },
  {
    id: 'vulnos',
    name: 'VulnOS',
    url: 'https://learn.vulnos.tech/index.html',
    kind: 'training',
    description: 'Cybersecurity learning platform with practical, interactive labs for hands-on skill building.',
  },
  {
    id: 'black-ledger-security',
    name: 'Black Ledger Security',
    url: 'https://blackledgersecurity.ai/',
    kind: 'research',
    description:
      'Research portfolio publishing AI/LLM security findings and the SPECTRA framework for context-aware adversarial testing of production AI deployments.',
  },
  {
    id: 'webverse-labs-pro',
    name: 'WebVerse Labs Pro',
    url: 'https://webverselabs-pro.com/',
    kind: 'lab',
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
];
