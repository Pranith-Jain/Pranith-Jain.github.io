import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  BookText,
  Briefcase,
  Bug,
  Cloud,
  Compass,
  Database,
  Dna,
  ExternalLink,
  FileCode,
  FileText,
  GitBranch,
  GitBranchPlus,
  Globe,
  Globe2,
  Grid3x3,
  Handshake,
  KeyRound,
  Layers,
  LayoutDashboard,
  MessageSquare,
  Newspaper,
  Radio,
  Radar,
  Scale,
  Search,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  UserCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { LiveSnapshotPanel } from '../../components/dfir/LiveSnapshotPanel';
import { WhatsNewBanner } from '../../components/threatintel/WhatsNewBanner';
import { PlatformPulse } from '../../components/threatintel/PlatformPulse';
import { LatestBriefingCard } from '../../components/threatintel/LatestBriefingCard';
import { TodaysRead } from '../../components/threatintel/TodaysRead';
import { FeedSnapshot } from '../../components/threatintel/FeedSnapshot';
import { personalInfo } from '../../data/content';
import { AppHero } from '../../components/AppHero';

/**
 * Threat-Intel landing page — the SOLE entry point for sources, feeds, RSS,
 * news, briefings, and curated catalogues. /dfir keeps the interactive
 * tools; /threatintel keeps everything you READ.
 *
 * The pages themselves now live at /threatintel/<slug>; old /dfir/<slug>
 * URLs redirect via `MovedRedirect` in App.tsx so existing bookmarks keep
 * resolving (query string + hash preserved).
 *
 * If you add a new SOURCE / FEED / CATALOG, add the tile here AND remove
 * any matching tile from src/components/dfir/ToolGrid.tsx so the two
 * landings stay strictly disjoint.
 */

interface Tool {
  to: string;
  label: string;
  desc: string;
  icon: LucideIcon;
  /** Tag hint shown alongside title (e.g. "live", "new"). */
  badge?: string;
  /** Set true when `to` is an off-site URL (renders as <a target=_blank>). */
  external?: boolean;
}

interface Section {
  id: string;
  label: string;
  blurb: string;
  tools: Tool[];
}

const SECTIONS: Section[] = [
  {
    id: 'ransomware',
    label: 'Ransomware & Negotiations',
    blurb: 'Leak-site claims, negotiation economics, re-victimisation, onion reachability.',
    tools: [
      {
        to: '/threatintel/ransomware-activity',
        label: 'Live ransomware activity',
        desc: 'Recent ransomware leak-site claims aggregated from Ransomlook · per-victim screenshots when available',
        icon: AlertTriangle,
        badge: 'live',
      },
      {
        to: '/threatintel/ransomware-live',
        label: 'ransomware.live PRO',
        desc: 'Authenticated, edge-cached view of the ransomware.live PRO API: stats, recent cyberattacks (HudsonRock infostealer-enriched), leaked negotiation logs, and per-group YARA rules.',
        icon: ShieldAlert,
        badge: 'live',
      },
      {
        to: '/threatintel/ransomware-map',
        label: 'Ransomware victim geo-heatmap',
        desc: 'World choropleth shaded by victim count per country, aggregated from ransomfeed.it, ransomwatch, ransomware.live, and Andrea Fortuna. Click a country for the top groups and named victims.',
        icon: Globe2,
        badge: 'new',
      },
      {
        to: '/threatintel/negotiations',
        label: 'Ransomware negotiations',
        desc: 'Negotiation chats across every ransomware.live PRO group. Initial demand vs. negotiated figure, discount, settlement flag, with full transcript drill-down (Casualtek/Ransomchats). Sortable, filterable.',
        icon: Handshake,
        badge: 'live',
      },
      {
        to: '/threatintel/re-leaks',
        label: 'Victim re-leak detection',
        desc: 'Victims claimed by 2+ ransomware groups in the last 12 months. Usually a failed double-extortion, or an affiliate switching programs. Cross-actor match on normalised victim names.',
        icon: Users,
      },
      {
        to: '/threatintel/onion-watch',
        label: 'Onion Watch',
        desc: 'Live inventory of .onion mirrors for the top ransomware leak sites. Per-group reachability from Ransomlook, with search and copy-all.',
        icon: Globe,
      },
      {
        to: '/threatintel/mythreatintel',
        label: 'MyThreatIntel',
        desc: 'Authenticated, edge-cached view of the MyThreatIntel CTI platform REST API: IOCs, malware, CVEs, ransomware victims, leaks, threat groups, darknet markets, and onion services.',
        icon: Radar,
        badge: 'live',
      },
    ],
  },
  {
    id: 'darkweb-breach',
    label: 'Dark Web, Breach & Leak',
    blurb: 'Leak sites, breach disclosures, infostealer logs, criminal forums.',
    tools: [
      {
        to: '/threatintel/darkweb',
        label: 'Dark Web Watch',
        desc: 'Aggregated leak-site, ransomware, breach activity · keyword watchlist · per-source separation',
        icon: Bell,
        badge: 'live',
      },
      {
        to: '/threatintel/breach-forums',
        label: 'Breach / leak-forum tracker',
        desc: 'Directory of criminal forums + dark markets (deepdarkCTI) plus a curated set of notable breach/leak forums. Intelligence about venues: names, status, OSINT-coverage links only; no forum contents.',
        icon: ShieldAlert,
        badge: 'live',
      },
      {
        to: '/threatintel/breach',
        label: 'Live breach disclosures',
        desc: 'Public breach disclosures from Have I Been Pwned, with verification flags, sensitivity markers, and the data classes that leaked.',
        icon: ShieldAlert,
        badge: 'live',
      },
      {
        to: '/threatintel/infostealer',
        label: 'Infostealer live tracker',
        desc: 'Three live infostealer surfaces in one: HudsonRock victim exposure (ransomware.live PRO), demonforums ULP / cloud-log market threads, and the active stealer-log Telegram channel directory.',
        icon: KeyRound,
        badge: 'live',
      },
      {
        to: '/threatintel/deepdarkcti',
        label: 'deepdarkCTI Index',
        desc: 'Parsed mirror of fastfire/deepdarkCTI: ransomware leak sites, dark markets, criminal forums, infostealer & threat-actor Telegram/Twitter channels, dark-web search engines. 18 source lists, filterable, onion-aware.',
        icon: Globe,
      },
      {
        to: '/threatintel/misp-browser',
        label: 'MISP Browser',
        desc: 'Connect to any MISP instance to browse events, attributes, objects, galaxies, and tags. Search, filter, and drill into threat intelligence from your own MISP server.',
        icon: Search,
      },
      {
        to: '/threatintel/scam-watch',
        label: 'Scam Watch',
        desc: 'Live FTC and FBI IC3 alerts, deepfake-scam news, and Reddit victim reports. Search and filter built in.',
        icon: AlertTriangle,
      },
      {
        to: '/threatintel/telegram-leaks',
        label: 'Telegram Leak Monitor',
        desc: 'Credential leaks, paste dumps, and file leaks detected across monitored Telegram channels. Search by keyword, channel, or severity.',
        icon: AlertTriangle,
        badge: 'new',
      },
      {
        to: '/threatintel/telegram-leaks/channels',
        label: 'Discovered TG Channels',
        desc: 'Telegram channels auto-discovered from monitored feeds. Review, approve, and add to the leak-scanning watchlist.',
        icon: UserCheck,
        badge: 'new',
      },
      {
        to: '/threatintel/telegram-leaks/stats',
        label: 'Telegram Leak Stats',
        desc: 'KPIs, severity distribution, top channels and domains from the Telegram leak database.',
        icon: BarChart3,
        badge: 'new',
      },
    ],
  },
  {
    id: 'feeds-news',
    label: 'Live Feeds & News',
    blurb: 'Streaming social, press, and aggregate feeds. Fresh data each visit.',
    tools: [
      {
        to: '/threatintel/cybersec',
        label: 'Cybersec Telegram firehose',
        desc: 'Message stream from curated public cybersec Telegram channels. IOC drops, vendor advisories, leak announcements, with per-channel quality scores so the loud channels stop drowning the signal.',
        icon: Send,
        badge: 'live',
      },
      {
        to: '/threatintel/reddit',
        label: 'Cybersec Reddit firehose',
        desc: '16 cybersec subreddits: r/netsec, r/blueteamsec, r/redteamsec, r/Malware, r/OSINT, r/computerforensics, plus scam/fraud coverage on r/Scams, r/IdentityTheft, r/phishing, r/scambait',
        icon: MessageSquare,
        badge: 'live',
      },
      {
        to: '/threatintel/x',
        label: 'Cybersec social firehose',
        desc: '16 cybersec researchers and vendor labs on Bluesky and Mastodon. Krebs, MalwareTech, Talos, Mandiant, Beaumont, Florian Roth, Cimpanu, vxunderground. Keyless RSS, no auth.',
        icon: Cloud,
        badge: 'live',
      },
      {
        to: '/threatintel/x-live',
        label: 'X live (cybersec)',
        desc: 'Chronological recent X tweets from cybersec IOC-posting accounts — TweetFeed permalink stream joined with fxtwitter per-status enrichment. Only free, no-auth path that delivers fresh X content; covers ~30 monitored researchers (malwrhunterteam, JAMESWT_MHT, bushidotoken, blackorbird, etc). IOC-biased by design — prose-only takes go to the Bluesky firehose.',
        icon: MessageSquare,
        badge: 'live',
      },
      {
        to: '/threatintel/x-watch',
        label: 'X firehose',
        desc: 'Live chronological tweets from 70 cybersec accounts across researchers, vendor labs, CTI feeds, OSINT, IR/DFIR, and security press. Filter by handle, window, replies, and pinned. Inactive accounts auto-hidden so the page shows only what is actually posting.',
        icon: MessageSquare,
        badge: 'live',
      },
      {
        to: '/threatintel/threat-feeds',
        label: 'Threat Feeds',
        desc: '40-source aggregation: CISA advisories, vendor labs, IR write-ups, Reddit infosec, CVE/Exploit-DB, and security press.',
        icon: Radio,
      },
      {
        to: '/threatintel/tech-ai-news',
        label: 'Tech & AI News',
        desc: '16-source feed for AI labs, cyber-vendor funding and M&A, general tech, and HN/YC. Threat-intel kept on its own surface.',
        icon: Newspaper,
      },
      {
        to: '/threatintel/cyber-crime',
        label: 'Cyber crime & fraud feeds',
        desc: 'Live incident coverage: DOJ indictments and takedowns, Chainalysis and Elliptic crypto-crime tracing, Krebs/BleepingComputer/HackRead breach reporting, DataBreaches.net, CISA, The Record. Round-robin so no one source dominates.',
        icon: AlertOctagon,
        badge: 'live',
      },
      {
        to: '/threatintel/pulse',
        label: 'Threat Pulse',
        desc: 'Real-time aggregator of fresh threat entities (actors, malware families, CVEs, IOCs) ranked by cross-source activity over the last 24h',
        icon: Activity,
        badge: 'live',
      },
      {
        to: '/threatintel/telegram-settings',
        label: 'Telegram Settings',
        desc: 'Manage custom Telegram channels for the Cybersec Telegram firehose. Add channels by @handle, view active channel list, remove stale ones.',
        icon: Send,
        badge: 'new',
      },
      {
        to: '/threatintel/aggregated-feeds',
        label: 'Aggregated Feeds',
        desc: 'Browse all 21 CriticalPathSecurity public feed files with search and category filter. See sample entries per feed.',
        icon: Layers,
        badge: 'new',
      },
      {
        to: '/threatintel/feed-catalog',
        label: 'Feed Catalog',
        desc: 'Searchable directory of 100+ open-source threat intel feeds from Bert-JanP. Filter by category, source, and format.',
        icon: BookText,
        badge: 'new',
      },
    ],
  },
  {
    id: 'cti-platforms',
    label: 'CTI Platforms & Aggregators',
    blurb: 'Cross-source synthesis, exports, maps, and pipeline health.',
    tools: [
      {
        to: '/threatintel/threat-map',
        label: 'Cyber Threat Map',
        desc: 'Live geolocation of malicious infrastructure. Choropleth map plus country leaderboard, with IP, URL, domain, and hash buckets.',
        icon: Globe2,
      },
      {
        to: '/threatintel/metrics',
        label: 'Threat Intel Metrics',
        desc: 'Ten panels covering the questions CTI teams actually ask. Most-active ransomware groups, CVE severity, KEV cadence, top-impersonated brands, IOC volume by source, sector targeting, malware families, re-leak hotspots.',
        icon: BarChart3,
      },
      {
        to: '/threatintel/status',
        label: 'Feed status',
        desc: 'Health of every upstream-backed feed on /threatintel. When a page looks empty, check here first to see whether the gap is upstream or our worker.',
        icon: Activity,
      },
      {
        to: '/threatintel/intel-dashboard',
        label: 'Intel Dashboard',
        desc: 'Consolidated view across all threat intelligence sources: leak KPIs, breach stats, feed health, source catalog, quick actions.',
        icon: LayoutDashboard,
      },
      {
        to: '/threatintel/collection-slo',
        label: 'Collection SLO',
        desc: 'Live health of every intelligence collector — uptime %, staleness, reliability grades. Alerts on silent degradation.',
        icon: Activity,
      },
      {
        to: '/threatintel/source-reliability',
        label: 'Source Reliability',
        desc: 'NATO Admiralty Code (A–F) grading for all 25+ intelligence sources. Every finding traceable to a graded source.',
        icon: Shield,
      },
      {
        to: '/threatintel/pir-dashboard',
        label: 'Intelligence Requirements',
        desc: 'PIR-driven tasking: define what decisions to inform, score collection against requirements, track coverage gaps.',
        icon: Target,
        badge: 'new',
      },
      {
        to: '/threatintel/briefings',
        label: 'Intel Briefings',
        desc: 'Daily and weekly digest, auto-generated from the upstream feeds. Ransomware claims, breach disclosures, and the IOCs of the day, with auto-tagged actors and CVEs per item.',
        icon: Briefcase,
      },
      {
        to: '/threatintel/campaign-generator',
        label: 'AI Campaign Generator',
        desc: 'Turn an analyst brief (actor, sector, TTPs, IOCs) into a structured campaign hypothesis with kill-chain mapping, ATT&CK techniques, hunting hypotheses, and detection ideas. Confidence + caveats surfaced explicitly.',
        icon: Sparkles,
        badge: 'new',
      },
      {
        to: '/threatintel/campaigns',
        label: 'Saved campaigns',
        desc: 'Browse persisted campaign hypotheses from the generator. Each entry keeps the full kill-chain, MITRE mapping, hunting hypotheses, and IOC pivots so analysts can return to a brief without re-running the prompt.',
        icon: Briefcase,
        badge: 'new',
      },
      {
        to: '/threatintel/feed-sources',
        label: 'Feed Sources',
        desc: 'Browse and manage all 50+ RSS feeds grouped by category — ransomware, APT, malware, CVE, dark-web, press, and research. Search and per-feed enable/disable toggle.',
        icon: Radio,
        badge: 'new',
      },
      {
        to: '/threatintel/settings',
        label: 'API Keys & Settings',
        desc: 'Reference table of 21 provider API keys with environment variable names, signup URLs, and free-tier limits. Runtime binding and env-var reference too.',
        icon: KeyRound,
        badge: 'new',
      },
      {
        to: '/threatintel/ioc-enrichment',
        label: 'IOC Enrichment',
        desc: 'Query external free threat intel APIs — Maltiverse, InQuest Labs, CertSpotter, HackerTarget DNS, Cloudflare Radar — from one interface. Supports IP, domain, hash, and keyword lookups.',
        icon: Search,
        badge: 'new',
      },
      {
        to: '/threatintel/copilot',
        label: 'AI Investigation Copilot',
        desc: 'AI-powered threat investigation. Paste a CVE, IP, domain, hash, or actor name — auto-detects query type, fans out to 6 cache sources, and returns analysis via Groq or Workers AI.',
        icon: Sparkles,
        badge: 'new',
      },
      {
        to: '/threatintel/analyze',
        label: 'Analysis Orchestration',
        desc: 'IntelOwl-inspired observable analysis. Single input fans out to all 44 SSE providers, results in a sortable table with composite score, verdict chips, and CSV/JSON export.',
        icon: Search,
        badge: 'new',
      },
      {
        to: '/threatintel/relationship-graph',
        label: 'Relationship Graph',
        desc: 'Interactive graph of cross-source connections between CVEs, threat actors, ransomware groups, IPs, domains, and hashes. Depth-1/2 traversal with KV-cached resolution.',
        icon: Globe2,
        badge: 'new',
      },
      {
        to: '/threatintel/entity-resolution',
        label: 'Entity Resolution',
        desc: 'Resolve threat actor names, ransomware groups, CVEs, IPs, domains, and hashes against a curated 500+ entry alias index with CVE-to-actor mapping.',
        icon: Search,
        badge: 'new',
      },
      {
        to: '/threatintel/investigations',
        label: 'Investigation Board',
        desc: 'TheHive-inspired case management. Create investigations with severity/TLP/status, manage observables, track tasks, add timeline notes. Full CRUD via KV-backed API.',
        icon: Shield,
        badge: 'new',
      },
      {
        to: '/threatintel/observable-db',
        label: 'Observable Database',
        desc: 'Yeti-inspired persistent IOC storage. Searchable by indicator/type/score/tag with enrichment history, provider verdicts, composite score bars, tag management, and threaded notes.',
        icon: Database,
        badge: 'new',
      },
      {
        to: '/threatintel/feed-scheduler',
        label: 'Feed Scheduler',
        desc: 'INTELMQ/Yeti-inspired feed collection. Configure external sources, set intervals, manual trigger with live fetch. 9 presets, run history with item counts and duration.',
        icon: Radio,
        badge: 'new',
      },
      {
        to: '/threatintel/search',
        label: 'Unified Search',
        desc: 'Cross-source search across 10+ threat intel sources — CVE, threat actors, ransomware, malware, IoC feeds, Telegram, breach data, and OSINT. One query, multiple surfaces.',
        icon: Search,
        badge: 'new',
      },
      {
        to: '/threatintel/watches',
        label: 'Alert Engine',
        desc: 'Set up keyword watches on threat feeds. When a watch fires, receive webhook alerts. Each watch gets KV-backed event history with per-trigger context.',
        icon: Bell,
        badge: 'new',
      },
    ],
  },
  {
    id: 'ioc-detection',
    label: 'IOC & Detection',
    blurb: 'Fresh indicators, cross-source correlation, C2 infra, detection rules.',
    tools: [
      {
        to: '/threatintel/live-iocs',
        label: 'Live IOC stream',
        desc: 'Chronological firehose with per-IOC reporter handles + timestamps. Sources: TweetFeed, SANS ISC, C2IntelFeeds, URLhaus, ThreatFox, MalwareBazaar, PhishTank, OpenPhish, MyThreatIntel.',
        icon: Radio,
        badge: 'live',
      },
      {
        to: '/threatintel/correlation',
        label: 'Cross-source IOC correlation',
        desc: 'Indicators that appear in 2+ independent feeds, ranked by source consensus. A single-feed flag can be a false positive. Cross-source overlap is the signal CTI analysts actually trust.',
        icon: GitBranchPlus,
      },
      {
        to: '/threatintel/c2-tracker',
        label: 'C2 Infrastructure Tracker',
        desc: 'Live C2 server IPs from drb-ra/C2IntelFeeds (GitHub) and abuse.ch ThreatFox. Filter by framework: Cobalt Strike, Sliver, Metasploit, Havoc, Brute Ratel, and more.',
        icon: Radar,
        badge: 'new',
      },
      {
        to: '/threatintel/certstream',
        label: 'CertStream live feed',
        desc: 'Polls crt.sh every 15s for newly-issued certificates matching a keyword. Surfaces lookalike-domain issuances within minutes of certificate creation — typosquats, homographs, phishing-kit hostnames. Built-in suspicion scoring.',
        icon: Radio,
        badge: 'new',
      },
      {
        to: '/threatintel/malicious-packages',
        label: 'Malicious package directory',
        desc: 'Cross-ecosystem malware/typosquat/dependency-confusion IOCs across npm, PyPI, RubyGems, Maven, Go, Rust — sourced from ossf/malicious-packages (OpenSSF curated OSV records). Filter by name, pivot to registry + IOC checker.',
        icon: KeyRound,
        badge: 'new',
      },
      {
        to: '/threatintel/rules',
        label: 'Detection Rules',
        desc: 'Sigma, YARA, Elastic, Splunk, KQL, and Suricata. Live commit feeds from the upstream repos, so the new rules show up the day they land.',
        icon: FileCode,
      },
      {
        to: '/threatintel/detections',
        label: 'Detections',
        desc: 'A curated detection-rule pack evaluated hourly against the unified live-IOC stream. Cross-feed consensus, Cobalt Strike / C2, ransomware & infostealer tagging, phishing-campaign clustering. Each firing rule with the indicators that triggered it. Write your own in the in-browser Detection Lab.',
        icon: AlertOctagon,
        badge: 'new',
      },
      {
        to: '/threatintel/cve-list',
        label: 'Live CVE updates',
        desc: 'NVD published-CVE feed (last 14 days) merged with the CISA KEV catalogue (last 30 days). Severity, KEV flag, ransomware-use flag, and a curated actor pill where attribution exists.',
        icon: ShieldAlert,
        badge: 'live',
      },
      {
        to: '/threatintel/domain-monitor',
        label: 'Domain Monitor',
        desc: 'Typosquatting and domain impersonation scanner. Generates lookalike variants (character swaps, TLD swaps, homoglyphs, prefix/suffix abuse). Inspired by haveibeensquatted.com.',
        icon: Search,
      },
      {
        to: '/threatintel/malware-iocs',
        label: 'Malware IOC Browser',
        desc: 'Browse 50+ malware families with IOC lists from gendigitalinc/ioc. Left sidebar family selector, right panel shows IPs/domains/hashes/URLs per family.',
        icon: Bug,
        badge: 'new',
      },
      {
        to: '/threatintel/yara',
        label: 'YARA Rule Hub',
        desc: 'Browse 1,200+ YARA rules from YARAHub (abuse.ch). Search by name/author/family, view full rule content with syntax highlighting, and download.',
        icon: FileCode,
        badge: 'new',
      },
      {
        to: '/threatintel/malware-vault',
        label: 'Malware Vault',
        desc: 'Viper-inspired sample storage. Upload files, auto-hash (MD5/SHA1/SHA256), detect magic bytes, tag with family, search/download. 1MB limit per file via KV.',
        icon: Shield,
        badge: 'new',
      },
    ],
  },
  {
    id: 'adversary',
    label: 'Adversary & Frameworks',
    blurb: 'Who is attacking, with what. Actors, intrusion sets, ATT&CK.',
    tools: [
      {
        to: '/threatintel/actors',
        label: 'Threat Actors',
        desc: 'APT catalogue. STIX-aware, with TTPs, associated tooling, and MITRE technique mapping per actor.',
        icon: Users,
      },
      {
        to: '/threatintel/actor-kb',
        label: 'Threat-Actor Knowledge Base',
        desc: '174 MITRE ATT&CK intrusion-sets. Search by name / alias / Gxxxx / technique / malware → aliases, TTPs grouped by kill-chain tactic, and tooling. Committed dataset, 100% client-side.',
        icon: BookText,
      },
      {
        to: '/threatintel/actor-timeline',
        label: 'Actor activity timeline',
        desc: 'Per-actor leak-site cadence Gantt for the most-active ransomware groups · joins Ransomlook per-group history with curated MITRE Group lookup',
        icon: ShieldAlert,
      },
      {
        to: '/threatintel/mitre',
        label: 'MITRE ATT&CK',
        desc: 'The matrix, plus per-technique deep-dives. Pivot both ways: actor to technique, technique to actor.',
        icon: Grid3x3,
      },
      {
        to: '/threatintel/atlas',
        label: 'MITRE ATLAS (AI/ML)',
        desc: 'Adversarial-ML taxonomy — tactics, techniques, and real-world case studies of attacks on AI and ML systems. The ATT&CK-adjacent matrix for GenAI risk.',
        icon: Grid3x3,
      },
      {
        to: '/threatintel/actor-dna',
        label: 'Actor Behavioral DNA',
        desc: 'Fingerprint threat actors by behavior, not just tools. TTP signatures, infrastructure patterns, operational tempo, and victimology.',
        icon: Dna,
        badge: 'new',
      },
      {
        to: '/threatintel/attribution',
        label: 'Attribution Framework',
        desc: 'Multi-signal attribution with confidence scoring. Technical, behavioral, and infrastructure evidence analysis.',
        icon: Scale,
        badge: 'new',
      },
      {
        to: '/threatintel/campaign-lifecycle',
        label: 'Campaign Lifecycle',
        desc: 'Track campaigns from preparation to monetization. Predictive modeling, kill chain phases, and escalation detection.',
        icon: Target,
        badge: 'new',
      },
      {
        to: '/threatintel/cross-campaign',
        label: 'Cross-Campaign Correlation',
        desc: 'Find connections between campaigns: shared infrastructure, tooling, and TTPs. Identify same-actor attribution.',
        icon: GitBranch,
        badge: 'new',
      },
      {
        to: '/threatintel/predictive',
        label: 'Predictive Intelligence',
        desc: 'AI-driven threat forecasting based on current intelligence trends, actor behavior patterns, and historical data.',
        icon: TrendingUp,
        badge: 'new',
      },
      {
        to: '/threatintel/status',
        label: 'Feed Health',
        desc: 'Real-time health and coverage of all intelligence feeds. Identify gaps, degraded sources, and cold caches.',
        icon: Activity,
        badge: 'live',
      },
      {
        to: '/threatintel/malpedia',
        label: 'Malpedia',
        desc: 'Malware family attribution via Fraunhofer FKIE. Search actors and families for descriptions, associated malware, and full reference lists.',
        icon: Bug,
        badge: 'new',
      },
      {
        to: '/threatintel/maltrail',
        label: 'Maltrail APT Trails',
        desc: 'Per-actor IOC trail files curated by Miroslav Stampar. Browse 75+ APT trail files, view known IPs/domains/hashes by group.',
        icon: FileCode,
        badge: 'new',
      },
    ],
  },
  {
    id: 'knowledge',
    label: 'Knowledge & Reference',
    blurb: 'Long-form research and curated reference indexes. Start here for the broad questions.',
    tools: [
      {
        to: '/threatintel/research',
        label: 'Research (authored)',
        desc: "Original adversary-tracking and methodology pieces written by Pranith Jain. Every quantitative claim sourced to this platform's own data or to named third-party reporting.",
        icon: FileText,
        badge: 'authored',
      },
      {
        to: '/threatintel/signal',
        label: 'Research Signal',
        desc: 'Tight curated set of elite vendor labs + independent research only (ThreatSignal Research, DFIR Report, SentinelLabs, Unit 42, Check Point, Huntress, Eye Security, Exodus, OpenAnalysis, BushidoToken, DoublePulsar). Low-volume sources, high-depth pieces.',
        icon: Radio,
        badge: 'live',
      },
      {
        to: '/threatintel/writeups',
        label: 'Writeups Feed',
        desc: 'The broad ecosystem cut. Krebs, The Hacker News, BleepingComputer, CrowdStrike, ESET, Recorded Future, Intezer, and the technical Medium tag feeds (#threat-intel, #malware-analysis, #dfir, …). Signal-tier sources live on /signal (no overlap).',
        icon: BookText,
        badge: 'live',
      },
      {
        to: '/threatintel/wiki',
        label: 'Knowledge Base',
        desc: 'Long-form articles on Telegram OSINT tradecraft, dark-web monitoring, MITRE workflows, and briefing methodology.',
        icon: BookOpen,
      },
      {
        to: '/threatintel/cve-resources',
        label: 'CVE Resources Catalog',
        desc: 'About 70 curated CVE sources. Databases, exploit and PoC repos, vendor PSIRTs, scoring services, research labs, and alert feeds.',
        icon: BookText,
      },
      {
        to: '/threatintel/secops-tools',
        label: 'SecOps Tools Catalog',
        desc: 'About 140 hand-picked tools across 14 categories: DFIR, Threat Intel, AI Sec, Malware, Vuln Mgmt, Detection.',
        icon: Layers,
      },
      {
        to: '/threatintel/awesome-lists',
        label: 'Awesome Lists',
        desc: 'GitHub awesome-lists for OSINT, threat intel, IR, and MCP / AI security. Filterable by stars and focus area.',
        icon: Sparkles,
      },
      {
        to: '/threatintel/external-resources',
        label: 'External Resources',
        desc: 'Off-site cross-references: dashboards, OSINT directories, training labs, malware samples, and research portfolios. Filter by kind. Featured quality-content markers and research-discovery mode.',
        icon: ExternalLink,
      },
      {
        to: '/threatintel/telegram-watch',
        label: 'Telegram Catalog',
        desc: 'Curated index of public threat-intel, cybercrime, and OSINT Telegram channels. Category and language filters, for when you want to find new channels rather than read the firehose at /threatintel/cybersec.',
        icon: Send,
      },
      {
        to: '/threatintel/osint-framework',
        label: 'OSINT Framework',
        desc: '70+ curated OSINT tools across 15 categories. Filter by pricing tier and category.',
        icon: Compass,
      },
    ],
  },
];

/** Flat tool + parent-section pair used by the search results view. */
interface ToolMatch {
  tool: Tool;
  section: Section;
}

function flattenTools(sections: Section[]): ToolMatch[] {
  return sections.flatMap((s) => s.tools.map((t) => ({ tool: t, section: s })));
}

function matchesQuery(t: ToolMatch, q: string): boolean {
  if (!q) return true;
  const hay = `${t.tool.label} ${t.tool.desc} ${t.section.label}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token));
}

export default function ThreatIntelHome(): JSX.Element {
  const totalTiles = SECTIONS.reduce((sum, s) => sum + s.tools.length, 0);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const allTools = useMemo(() => flattenTools(SECTIONS), []);
  const searchResults = useMemo(
    () => (query.trim() ? allTools.filter((t) => matchesQuery(t, query.trim())) : []),
    [allTools, query]
  );
  const isSearching = query.trim().length > 0;
  const { cat } = useParams<{ cat?: string }>();
  const activeSection = cat ? SECTIONS.find((s) => s.id === cat) : undefined;

  // Keyboard: '/' or 'Cmd/Ctrl+K' focuses the search; 'Esc' clears.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = target && /^(INPUT|TEXTAREA)$/.test(target.tagName);
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setQuery('');
        return;
      }
      if (inField) return;
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <h1 className="sr-only">Threat Intel Platform</h1>
      {/* "What's new since your last visit" banner — silent on first
          visit / zero deltas. Reuses the localStorage marker key
          'threatintel-home'. */}
      <WhatsNewBanner />
      {/* 7-day platform-pulse sparklines (IOCs + findings per day). Real
          data from /api/v1/briefings/list — the daily-briefing cron has
          ~30 days of history. Decorative only when fewer than 2 days
          are available. */}
      <PlatformPulse />
      <LatestBriefingCard />
      {/* Today's read — opinionated 3-card "if you have 60 seconds" promo.
          Surfaces the latest authored research, the most-fired detection
          rule right now, and a one-line weekly ransomware read so a
          first-time visitor lands on editorial direction rather than
          a 20-tile picker. The category sections below remain the
          comprehensive index for analysts who know what they want. */}
      <TodaysRead />
      <AppHero
        kicker="Privacy-first · Live edge feeds · No login · No tracking"
        title="Threat-intel platform"
        sub="CTI aggregator and DFIR analyst toolkit, both running on Cloudflare Workers. Pulls from ~30 public feeds — ransomware leak sites, CVE/KEV, malware samples, phishing URLs, social and Telegram, MyThreatIntel — plus multi-provider IOC enrichment and STIX 2.1 export. Coverage is a sample, not exhaustive."
        meta={
          <>
            {totalTiles} intel surfaces · by{' '}
            <Link to="/" className="text-brand-600 dark:text-brand-400 hover:underline">
              {personalInfo.name}
            </Link>{' '}
            ·{' '}
            <Link to="/threatintel/about" className="text-brand-600 dark:text-brand-400 hover:underline">
              about
            </Link>{' '}
            · interactive tools:{' '}
            <Link to="/dfir" className="text-brand-600 dark:text-brand-400 hover:underline">
              /dfir
            </Link>
          </>
        }
      />
      <FeedSnapshot />

      {/* Quick links to power-user surfaces */}
      <div className="flex flex-wrap items-center gap-2 mb-12 text-[11px] font-mono text-slate-500 dark:text-slate-400">
        <span>quick:</span>
        <Link
          to="/threatintel/metrics"
          className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 min-h-[44px] sm:min-h-0 sm:py-1 flex items-center"
        >
          metrics
        </Link>
        <Link
          to="/threatintel/correlation"
          className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 min-h-[44px] sm:min-h-0 sm:py-1 flex items-center"
        >
          correlation
        </Link>
        <Link
          to="/threatintel/actor-timeline"
          className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 min-h-[44px] sm:min-h-0 sm:py-1 flex items-center"
        >
          actor timeline
        </Link>
        <Link
          to="/threatintel/re-leaks"
          className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 min-h-[44px] sm:min-h-0 sm:py-1 flex items-center"
        >
          re-leaks
        </Link>
        <Link
          to="/threatintel/live-iocs"
          className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 min-h-[44px] sm:min-h-0 sm:py-1 flex items-center"
        >
          live stream
        </Link>
        <Link
          to="/threatintel/status"
          className="px-3 py-2 rounded border border-slate-200 dark:border-slate-800 hover:border-brand-500/40 min-h-[44px] sm:min-h-0 sm:py-1 flex items-center"
        >
          feed status
        </Link>
      </div>

      {/* Search bar — '/' or Cmd/Ctrl+K to focus, Esc to clear */}
      <div className="relative mb-10">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search every intel surface, catalog, feed…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-20 font-mono text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500/60 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            aria-label="Search intel surfaces"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Clear search"
            >
              <X size={11} /> clear
            </button>
          ) : (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden items-center gap-1 font-mono text-[10px] text-slate-400 sm:inline-flex">
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[9px] dark:border-slate-700 dark:bg-slate-800">
                /
              </kbd>
              <span>or</span>
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[9px] dark:border-slate-700 dark:bg-slate-800">
                ⌘K
              </kbd>
            </span>
          )}
        </div>
        {isSearching && (
          <div className="mt-2 font-mono text-[11px] text-slate-500">
            {searchResults.length} {searchResults.length === 1 ? 'match' : 'matches'} for &ldquo;{query.trim()}&rdquo;
            {searchResults.length === 0 && ' · try fewer or different keywords'}
          </div>
        )}
      </div>

      {!isSearching && !cat && (
        <section className="animate-fade-in-up">
          <LiveSnapshotPanel compact subtitle="live intel pulse across the platform" mbClass="mb-12" />
        </section>
      )}

      {isSearching ? (
        <section className="animate-fade-in-up mb-12">
          <ul className="stagger grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {searchResults.map(({ tool: t, section }) => {
              const Icon = t.icon;
              const cardClass =
                'group relative block h-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 ' +
                'transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-brand-500/50 ' +
                'hover:shadow-[0_10px_30px_-12px_rgba(44,62,229,0.35)] focus-visible:outline-none focus-visible:-translate-y-0.5 ' +
                'focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40';
              const inner = (
                <>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <Icon size={18} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" />
                    <span className="mt-0.5 inline-flex items-center rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
                      {section.label}
                    </span>
                  </div>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <h3 className="flex items-center gap-1 font-display font-semibold text-base text-slate-900 transition-colors group-hover:text-brand-600 dark:text-slate-100 dark:group-hover:text-brand-400">
                      {t.label}
                      {t.external && <ExternalLink size={11} className="opacity-60" aria-hidden="true" />}
                    </h3>
                    {t.badge && (
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                          t.badge === 'live'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {t.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">{t.desc}</p>
                </>
              );
              if (t.external) {
                return (
                  <li key={`${section.id}:${t.to}`}>
                    <a href={t.to} target="_blank" rel="noopener noreferrer" className={cardClass}>
                      {inner}
                    </a>
                  </li>
                );
              }
              return (
                <li key={`${section.id}:${t.to}`}>
                  <Link to={t.to} className={cardClass}>
                    {inner}
                  </Link>
                </li>
              );
            })}
          </ul>
          {searchResults.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-[13px] text-slate-500 dark:border-slate-700">
              No matches. Searching across {allTools.length} intel surfaces, catalogs, and feeds.
            </div>
          )}
        </section>
      ) : activeSection ? (
        <section className="animate-fade-in-up mb-12">
          <div className="flex flex-wrap items-center gap-2 mb-6 text-[11px] font-mono">
            <span className="text-slate-500">categories:</span>
            {SECTIONS.map((s) => (
              <Link
                key={s.id}
                to={`/threatintel/c/${s.id}`}
                className={`px-3 py-1.5 rounded border ${
                  s.id === cat
                    ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:border-brand-500/40'
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
          <div className="mb-4">
            <h2 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100">
              {activeSection.label}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-mono mt-1">
              {activeSection.blurb} · {activeSection.tools.length}{' '}
              {activeSection.tools.length === 1 ? 'source' : 'sources'}
            </p>
            <p className="text-[11px] font-mono text-slate-400 mt-2">
              Reference only. Feeds refreshed at the edge each visit; verify indicators in your own environment.
            </p>
          </div>
          <ul className="stagger grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {activeSection.tools.map((t) => {
              const Icon = t.icon;
              const cardClass =
                'group relative block h-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 ' +
                'transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-brand-500/50 ' +
                'hover:shadow-[0_10px_30px_-12px_rgba(44,62,229,0.35)] focus-visible:outline-none focus-visible:-translate-y-0.5 ' +
                'focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/40';
              const inner = (
                <>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Icon size={18} className="text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" />
                    <ArrowRight
                      size={14}
                      className="text-slate-300 dark:text-slate-700 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors mt-0.5 shrink-0"
                    />
                  </div>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <h3 className="font-display font-semibold text-base text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors flex items-center gap-1">
                      {t.label}
                      {t.external && <ExternalLink size={11} className="opacity-60" aria-hidden="true" />}
                    </h3>
                    {t.badge && (
                      <span
                        className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${
                          t.badge === 'live'
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {t.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed">{t.desc}</p>
                </>
              );
              return t.external ? (
                <li key={t.to}>
                  <a href={t.to} target="_blank" rel="noopener noreferrer" className={cardClass}>
                    {inner}
                  </a>
                </li>
              ) : (
                <li key={t.to}>
                  <Link to={t.to} className={cardClass}>
                    {inner}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className="animate-fade-in-up mb-12">
          <h2 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100 mb-1">
            Browse by category
          </h2>
          <p className="text-sm font-mono text-slate-500 mb-6">
            Pick a surface to dive in, or use the search above to jump straight to a tool.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SECTIONS.map((s) => (
              <Link
                key={s.id}
                to={`/threatintel/c/${s.id}`}
                className="group rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-brand-500/40 transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-display font-semibold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {s.label}
                  </span>
                  <ArrowRight
                    size={14}
                    className="text-slate-300 dark:text-slate-700 group-hover:text-brand-500 transition-colors"
                  />
                </div>
                <p className="text-[12px] font-mono text-slate-600 dark:text-slate-400 leading-relaxed">{s.blurb}</p>
                <p className="mt-2 text-[11px] font-mono text-slate-400">
                  {s.tools.length} {s.tools.length === 1 ? 'source' : 'sources'}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
