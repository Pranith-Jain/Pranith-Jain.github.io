import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Search,
  Globe,
  Lock,
  BookOpen,
  Radar,
  Database,
  Hash,
  ShieldAlert,
  Clock,
  Bug,
  FileSearch,
  RefreshCw,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
  Eye,
  EyeOff,
  Copy,
  FileText,
  Link2,
  Server,
  Activity,
  Users,
  HelpCircle,
} from 'lucide-react';
import wikiData from '../../data/wiki.json';
import { Breadcrumbs } from '../Breadcrumbs';
import { ConnectionStatus } from '../ConnectionStatus';

import { useDFIRRoute } from '../../hooks/useDFIRRoute';

// ============================================================================
// SECURITY IMPROVEMENTS
// ============================================================================
// 1. Sanitize input to prevent XSS in display
// 2. Use memo for expensive computations
// 3. Implement safe clipboard operations
// 4. Add Content Security Policy awareness in data handling

// Safe text sanitization helper (basic - in production use DOMPurify)
const sanitizeText = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Safe URL validation (prevent javascript: and data: URLs)
const isSafeUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const SecurityChecklist = ({ suggestions }: { suggestions?: string[] }) => {
  if (!suggestions || suggestions.length === 0) return null;
  return (
    <div className="p-6 rounded-2xl bg-brand-500/5 border border-brand-500/20 shadow-sm">
      <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <Shield className="w-5 h-5 text-brand-500" /> Security Recommendations
      </h4>
      <div className="space-y-3">
        {suggestions.map((s, i) => (
          <div key={i} className="flex items-start gap-3 text-sm">
            <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-brand-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-3 h-3 text-brand-600 dark:text-brand-400" />
            </div>
            <span className="text-slate-700 dark:text-slate-300">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface IOCResult {
  indicator: string;
  type: string;
  score: number;
  verdict: string;
  tags: string[];
  defanged: string;
  suggestions?: string[];
}

interface DomainResult {
  domain: string;
  score: number;
  verdict: string;
  generated: string;
  health_score?: string;
  blacklist: Array<{ ip: string; listed: boolean; blacklists: string[] }>;
  mx: { records: Array<{ priority: number; host: string }> };
  spf: { found: boolean; record?: string };
  dmarc: { found: boolean; record?: string };
  dkim: Array<{ found: boolean; selector?: string }>;
  ssl: { valid: boolean; issuer?: string; expires?: string };
  dns: { A?: string[]; AAAA?: string[] };
  dnssec?: { found: boolean };
  suggestions?: string[];
  additional_checks?: Record<string, any>;
}

interface PrivacyCategory {
  score: number;
  maxScore: number;
  details: {
    httpIp?: string;
    webrtcLeak?: string;
    dohEnabled?: boolean;
    canvasHash?: boolean;
    platform?: string;
    dnt?: boolean;
    https?: boolean;
    trackerBlocker?: boolean;
    browser?: string;
    language?: string;
    cookiesEnabled?: boolean;
    hardwareConcurrency?: number;
    screenResolution?: string;
  };
}

interface PrivacyResult {
  score: number;
  maxScore: number;
  grade: string;
  categories: {
    ipNetwork: PrivacyCategory;
    dnsPrivacy: PrivacyCategory;
    fingerprinting: PrivacyCategory;
    privacySettings: PrivacyCategory;
    connectionSecurity: PrivacyCategory;
    trackingProtection: PrivacyCategory;
  };
  suggestions?: string[];
}

interface PhishingResult {
  url: string;
  verdict: string;
  confidence: number;
  risk_factors: string[];
  screenshot?: string;
  final_url?: string;
  content_flags: string[];
  similar_domains?: Array<{ domain: string; similarity: number }>;
  suggestions?: string[];
  additional_checks?: Record<string, any>;
}

interface ExposureResult {
  query: string;
  type: string;
  total_exposed_records: number;
  sources: Array<{
    name: string;
    records: number;
    date: string;
    category: string;
  }>;
  severity: string;
  risk_level: string;
  suggestions?: string[];
}

interface ThreatIntelItem {
  id: string;
  title: string;
  source: string;
  published: string;
  type: string;
  severity: string;
  description: string;
  indicators?: string[];
  link: string;
  read: boolean;
}

interface ActorDetail {
  name: string;
  alias: string;
  origin: string;
  motivation: string;
  active_since: string;
  last_activity: string;
  status: string;
  malware: string[];
  techniques: string[];
  targets: string[];
  description: string;
  url?: string;
}

interface ResearchItem {
  id: string;
  title: string;
  authors: string;
  published: string;
  category: string;
  summary: string;
  url: string;
  citations?: number;
  read: boolean;
}

// Consolidated Tab Types (10 → 7)
type TabType =
  | 'home'
  | 'domain'
  | 'analysis' // MERGED: IOC + Phishing
  | 'exposure'
  | 'privacy'
  | 'knowledge' // MERGED: Wiki + Research
  | 'threatIntel'; // MERGED: Intel + Actors

const API_URL = import.meta.env.VITE_DFIR_API_URL || '';

export function DFIR() {
  const { tab: activeTab, setTab: setActiveTab } = useDFIRRoute();
  const [mounted, setMounted] = useState(false);

  // Tools States
  const [iocInput, setIocInput] = useState('');
  const [iocResult, setIocResult] = useState<IOCResult | null>(null);
  const [iocLoading, setIocLoading] = useState(false);

  const [domainInput, setDomainInput] = useState('');
  const [domainResult, setDomainResult] = useState<DomainResult | null>(null);
  const [domainLoading, setDomainLoading] = useState(false);

  const [privacyResult, setPrivacyResult] = useState<PrivacyResult | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);

  // Phishing State
  const [phishingUrl, setPhishingUrl] = useState('');
  const [phishingResult, setPhishingResult] = useState<PhishingResult | null>(null);
  const [phishingLoading, setPhishingLoading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  // Exposure State
  const [exposureQuery, setExposureQuery] = useState('');
  const [exposureResult, setExposureResult] = useState<ExposureResult | null>(null);
  const [exposureLoading, setExposureLoading] = useState(false);
  const [exposureHistory, setExposureHistory] = useState<ExposureResult[]>([]);

  // Threat Intel State
  const [intelItems, setIntelItems] = useState<ThreatIntelItem[]>([]);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelFilter, setIntelFilter] = useState('all');
  const [expandedIntel, setExpandedIntel] = useState<string | null>(null);

  // Actors State
  const [actorSearch, setActorSearch] = useState('');

  // Research State
  const [researchItems, setResearchItems] = useState<ResearchItem[]>([]);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchFilter, setResearchFilter] = useState('all');
  const [expandedResearch, setExpandedResearch] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // CONSOLIDATED TAB STATES (Performance optimization: single tab with sub-modes)
  // ---------------------------------------------------------------------------
  const [analysisMode, setAnalysisMode] = useState<'ioc' | 'phishing'>('ioc');
  const [knowledgeMode, setKnowledgeMode] = useState<'wiki' | 'research'>('wiki');
  const [threatIntelMode, setThreatIntelMode] = useState<'intel' | 'actors'>('intel');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Known Threat Actors Database
  const threatActors: ActorDetail[] = [
    {
      name: 'Sandworm Team',
      alias: 'Voodoo Bear, Electrum',
      origin: 'Russia (GRU)',
      motivation: 'Cyber Warfare',
      active_since: '2009',
      last_activity: '2025',
      status: 'Active',
      malware: ['BlackEnergy', 'NotPetya', 'Industroyer', 'KillDisk', 'GreyEnergy'],
      techniques: ['Destructive Malware', 'OT Targeting', 'Infrastructure Disruption'],
      targets: ['Energy', 'Critical Infrastructure', 'Government', 'Ukraine'],
      description:
        'Russian state-sponsored threat group known for destructive attacks against critical infrastructure, including the 2015 and 2016 Ukraine power grid attacks and the catastrophic 2017 NotPetya malware that caused billions in damages globally.',
      url: 'https://dfir-lab.ch/actors/sandworm-team',
    },
    {
      name: 'Storm-1747',
      alias: 'Storm-1747',
      origin: 'Unknown',
      motivation: 'Financial Gain',
      active_since: '2024',
      last_activity: '2025',
      status: 'Active',
      malware: ['AsyncRAT', 'RedLine Stealer', 'Custom Loader'],
      techniques: ['Phishing', 'Credential Theft', 'Data Exfiltration'],
      targets: ['Healthcare', 'Finance', 'Technology'],
      description:
        'Emerging threat actor known for sophisticated phishing campaigns targeting healthcare and financial sectors. Uses multi-stage attack chains with custom loaders.',
      url: 'https://dfir-lab.ch/actors/storm-1747',
    },
    {
      name: 'Rhysida',
      alias: 'Rhysida',
      origin: 'Eastern Europe',
      motivation: 'Ransomware Operations',
      active_since: '2023',
      last_activity: '2025',
      status: 'Active',
      malware: ['Rhysida Ransomware', 'Cobalt Strike'],
      techniques: ['Ransomware', 'Lateral Movement', 'Data Encryption'],
      targets: ['Healthcare', 'Education', 'Government'],
      description:
        'Ransomware-as-a-Service group known for high-profile attacks on hospitals and educational institutions. Employs double extortion tactics.',
      url: 'https://dfir-lab.ch/actors/rhysida',
    },
    {
      name: 'APT41 (Double Dragon)',
      alias: 'BARIUM, WICKED PANDARIS, Double Dragon',
      origin: 'China',
      motivation: 'Cyber Espionage + Financial',
      active_since: '2012',
      last_activity: '2025',
      status: 'Active',
      malware: ['SPARROW', 'SHOTPUT', 'CROSSWALK', 'HOMEUNIX', 'KEYPLUG'],
      techniques: ['Espionage', 'Cryptojacking', 'Supply Chain Attacks', 'Finance Theft'],
      targets: ['Healthcare', 'Telecommunications', 'Media', 'Government', 'Gaming'],
      description:
        'Chinese nation-state actor operating for both espionage and financial gain. Known for watering hole attacks, supply chain compromises, and targeting video game companies for virtual currency theft.',
      url: 'https://dfir-lab.ch/actors/apt41-double-dragon',
    },
    {
      name: 'Lazarus Group',
      alias: 'Hidden Cobra, Zinc, Labyrinth Chollima',
      origin: 'North Korea (RGB)',
      motivation: 'Cyber Espionage + Financial',
      active_since: '2009',
      last_activity: '2025',
      status: 'Active',
      malware: ['HARDRAIN', 'BRINE SPOT', 'TAINTEDMUSIC', 'FALLCHILL', 'COVERAGEBEACON'],
      techniques: ['SWIFT Attacks', 'Cryptocurrency Heists', 'Destructive Malware', 'Strategic Web Compromise'],
      targets: ['Banks', 'Cryptocurrency Exchanges', 'Defense Contractors', 'Government'],
      description:
        'North Korean state-sponsored threat group responsible for major financial heists including the Bangladesh Bank robbery ($81M), multiple cryptocurrency exchange attacks, and the destructiveattacks against Sony Pictures and Wannacry ransomware.',
      url: 'https://dfir-lab.ch/actors/lazarus-group',
    },
    {
      name: 'BianLian',
      alias: 'BianLian',
      origin: 'China',
      motivation: 'Financial Gain',
      active_since: '2019',
      last_activity: '2025',
      status: 'Active',
      malware: ['BianLian Ransomware', 'Custom Backdoors'],
      techniques: ['Ransomware', 'Business Email Compromise', 'Wire Fraud'],
      targets: ['Media', 'Entertainment', 'Sports', 'Manufacturing'],
      description:
        'China-based threat actor primarily targeting media and entertainment companies. Known for media leaks and double extortion attacks.',
    },
    {
      name: 'LockBit',
      alias: 'LockBit Ransomware Group',
      origin: 'Russia',
      motivation: 'Ransomware Operations',
      active_since: '2019',
      last_activity: '2024',
      status: 'Defunct (Disrupted)',
      malware: ['LockBit Ransomware', 'StealBit', 'LockBit Builder'],
      techniques: ['Ransomware', 'Data Exfiltration', 'Extortion'],
      targets: ['Healthcare', 'Education', 'Critical Infrastructure'],
      description:
        'Ransomware-as-a-Service group disrupted by international law enforcement in 2024 (Operation Cronos). Previously one of the most active RaaS operations with over $100M in ransom payments.',
    },
    {
      name: 'ALPHV (BlackCat)',
      alias: 'BlackCat, NoEscape, ALPHV',
      origin: 'Russia',
      motivation: 'Ransomware Operations',
      active_since: '2021',
      last_activity: '2024',
      status: 'Defunct',
      malware: ['BlackCat Ransomware', 'Exmatter', 'Cobalt Strike'],
      techniques: ['Ransomware', 'Double Extortion', 'RMM Tools'],
      targets: ['Healthcare', 'Critical Infrastructure', 'Entertainment'],
      description:
        'Rust-based ransomware group using affiliate model. Known for high ransoms and targeting critical infrastructure. Linked to previous DarkSide/BlackMatter operations.',
    },
    {
      name: 'Clop',
      alias: 'Clop Ransomware, TA505',
      origin: 'Russia/Ukraine',
      motivation: 'Financial Gain',
      active_since: '2019',
      last_activity: '2025',
      status: 'Active',
      malware: ['Clop Ransomware', 'Gambo', 'FinLoader'],
      techniques: ['Ransomware', 'MOVEit Exploitation', 'Data Leaks', 'BEC'],
      targets: ['Healthcare', 'Education', 'Government', 'Finance', 'Retail'],
      description:
        'Responsible for the massive MOVEit supply chain attack affecting millions. Uses double extortion and targets large enterprises.',
    },
  ];

  // Security Research Papers Database
  const researchPapers = useMemo<ResearchItem[]>(
    () => [
      {
        id: '1',
        title: 'Mastering Email Header Analysis',
        authors: 'DFIR Lab Research Team',
        published: '2024',
        category: 'Email Security',
        summary:
          'Comprehensive guide to RFC 5322 email header analysis covering SPF, DKIM, DMARC authentication verification, routing path analysis, and anomaly detection for security investigations.',
        url: 'https://dfir-lab.ch/wiki/email-header-analysis',
        citations: 342,
        read: false,
      },
      {
        id: '2',
        title: 'IOC Enrichment Automation Framework',
        authors: 'Security Research Team',
        published: '2024',
        category: 'Threat Intelligence',
        summary:
          'Framework for automated IOC enrichment integrating multiple threat intelligence sources including VirusTotal, AlienVault OTX, and MITRE ATT&CK for streamlined security operations.',
        url: 'https://dfir-lab.ch/wiki/ioc-enrichment',
        citations: 156,
        read: false,
      },
      {
        id: '3',
        title: 'SPF, DKIM, and DMARC Implementation Guide',
        authors: 'Email Security Experts',
        published: '2024',
        category: 'Email Security',
        summary:
          'Complete guide to implementing email authentication protocols including DNS configuration, policy setup, and monitoring for email security best practices.',
        url: 'https://dfir-lab.ch/wiki/spf',
        citations: 289,
        read: false,
      },
      {
        id: '4',
        title: 'Threat Actor Profiling Methodology',
        authors: 'DFIR Lab',
        published: '2024',
        category: 'Threat Intelligence',
        summary:
          'Systematic approach to identifying and documenting threat group tactics, techniques, infrastructure, and attribution based on intelligence gathering and analysis.',
        url: 'https://dfir-lab.ch/wiki/threat-actor-profiling',
        citations: 198,
        read: false,
      },
      {
        id: '5',
        title: 'BEC Attack Detection and Prevention',
        authors: 'Security Operations Team',
        published: '2024',
        category: 'Email Security',
        summary:
          'Analysis of Business Email Compromise attack patterns including invoice fraud, executive impersonation, and attorney impersonation with detection strategies.',
        url: 'https://dfir-lab.ch/wiki/bec',
        citations: 245,
        read: false,
      },
      {
        id: '6',
        title: 'Phishing Analysis Techniques',
        authors: 'DFIR Lab Research',
        published: '2024',
        category: 'Phishing Analysis',
        summary:
          'Forensic examination methodology for phishing emails including URL analysis, landing page investigation, and identifying indicators of compromise.',
        url: 'https://dfir-lab.ch/wiki/phishing-analysis',
        citations: 167,
        read: false,
      },
      {
        id: '7',
        title: 'MITRE ATT&CK Framework Guide',
        authors: 'Detection Engineering Team',
        published: '2024',
        category: 'Detection Engineering',
        summary:
          'Comprehensive guide to understanding and applying the MITRE ATT&CK framework for threat detection, hunting, and adversary emulation.',
        url: 'https://dfir-lab.ch/wiki/mitre-attack',
        citations: 412,
        read: false,
      },
      {
        id: '8',
        title: 'Domain Reputation Analysis Techniques',
        authors: 'Threat Intelligence Analysts',
        published: '2024',
        category: 'Threat Intelligence',
        summary:
          'Methods for evaluating domain reputation including WHOIS analysis, passive DNS records, certificate transparency logs, and historical threat data.',
        url: 'https://dfir-lab.ch/wiki/domain-reputation',
        citations: 134,
        read: false,
      },
      {
        id: '9',
        title: 'Incident Response Playbook Development',
        authors: 'DFIR Lab',
        published: '2024',
        category: 'Incident Response',
        summary:
          'Step-by-step methodology for developing comprehensive incident response playbooks including containment, eradication, and recovery procedures.',
        url: 'https://dfir-lab.ch/wiki/incident-response',
        citations: 289,
        read: false,
      },
      {
        id: '10',
        title: 'Homoglyph Domain Detection',
        authors: 'Brand Protection Team',
        published: '2024',
        category: 'Threat Intelligence',
        summary:
          'Techniques for identifying homoglyph domains that use visually similar Unicode characters to impersonate legitimate brands.',
        url: 'https://dfir-lab.ch/wiki/homoglyph-domains',
        citations: 89,
        read: false,
      },
      {
        id: '11',
        title: 'Ransomware Analysis and Response',
        authors: 'Malware Research Team',
        published: '2024',
        category: 'Malware Analysis',
        summary:
          'Comprehensive analysis of ransomware operations including encryption methodologies, double extortion tactics, and recovery strategies.',
        url: 'https://dfir-lab.ch/wiki/ransomware',
        citations: 178,
        read: false,
      },
      {
        id: '12',
        title: 'Data Removal and Breach Prevention',
        authors: 'Privacy Research',
        published: '2024',
        category: 'Data Privacy',
        summary:
          'Guide to using data removal services like Serus.ai and breach monitoring tools to protect personal information and reduce attack surface.',
        url: 'https://serus.ai',
        citations: 56,
        read: false,
      },
    ],
    []
  );

  // Fetch Threat Intelligence
  const fetchThreatIntel = useCallback(async () => {
    setIntelLoading(true);
    try {
      // Create sample threat intel items (in production, these would come from API)
      const sampleItems: ThreatIntelItem[] = [
        {
          id: '1',
          title: 'New AsyncRAT Campaign Targeting Healthcare Sector',
          source: 'MITRE ATT&CK',
          published: new Date().toISOString(),
          type: 'Malware',
          severity: 'High',
          description:
            'Threat actors are distributing AsyncRAT through phishing emails disguised as medical invoices. The campaign uses compromised email accounts.',
          indicators: ['185.220.101.xxx', 'malware-payload.exe', 'suspicious-domain.com'],
          link: 'https://attack.mitre.org',
          read: false,
        },
        {
          id: '2',
          title: 'Critical Fortinet VPN Vulnerability (CVE-2024-55591)',
          source: 'CISA',
          published: new Date(Date.now() - 86400000).toISOString(),
          type: 'Vulnerability',
          severity: 'Critical',
          description:
            'Authentication bypass vulnerability in FortiOS allows remote attackers to gain unauthorized access through crafted requests.',
          indicators: ['CVE-2024-55591', 'FortiOS 7.0.0-7.0.14'],
          link: 'https://www.cisa.gov',
          read: false,
        },
        {
          id: '3',
          title: 'LockBit 3.0 Ransomware Affiliate Network Dismantled',
          source: 'Europol',
          published: new Date(Date.now() - 172800000).toISOString(),
          type: 'Threat Actor',
          severity: 'Info',
          description:
            'International law enforcement operation disrupts LockBit ransomware infrastructure. Multiple arrests made across Europe.',
          link: 'https://www.europol.europa.eu',
          read: false,
        },
        {
          id: '4',
          title: 'MOVEit Transfer Exploitation Resurfaces',
          source: 'NIST NVD',
          published: new Date(Date.now() - 259200000).toISOString(),
          type: 'Vulnerability',
          severity: 'High',
          description:
            'New exploitation attempts observed against unpatched MOVEit Transfer servers. Organizations urged to apply patches immediately.',
          indicators: ['CVE-2023-34362', 'CVE-2024-5806'],
          link: 'https://nvd.nist.gov',
          read: false,
        },
        {
          id: '5',
          title: 'Phishing Kit Using AI-Generated Content Detected',
          source: 'Palo Alto Unit 42',
          published: new Date(Date.now() - 345600000).toISOString(),
          type: 'Phishing',
          severity: 'Medium',
          description:
            'New phishing kits leverage AI to create convincing login pages and emails with minimal detection rates.',
          indicators: ['ai-generated-phish.com', 'fake-login-portal.net'],
          link: 'https://unit42.paloaltonetworks.com',
          read: false,
        },
        {
          id: '6',
          title: 'Cobalt Strike 4.10 Abused in Living-off-the-Land Attacks',
          source: 'Mandiant',
          published: new Date(Date.now() - 432000000).toISOString(),
          type: 'Malware',
          severity: 'High',
          description:
            'Threat actors using pirated Cobalt Strike versions for lateral movement in enterprise networks with decreased detection times.',
          indicators: ['beacon.dll', 'cs.exe'],
          link: 'https://www.mandiant.com',
          read: false,
        },
      ];
      setIntelItems(sampleItems);
    } catch {
      console.error('Failed to fetch threat intel');
    }
    setIntelLoading(false);
  }, []);

  // Load Research Papers
  const loadResearchPapers = useCallback(async () => {
    setResearchLoading(true);
    try {
      setResearchItems(researchPapers);
    } catch {
      console.error('Failed to load research papers');
    }
    setResearchLoading(false);
  }, [researchPapers]);

  useEffect(() => {
    // Load data for active tab
    if (activeTab === 'threatIntel') {
      fetchThreatIntel();
    }
    if (activeTab === 'knowledge') {
      loadResearchPapers();
    }
  }, [activeTab, fetchThreatIntel, loadResearchPapers]);

  const checkIOC = async () => {
    if (!iocInput.trim()) return;
    setIocLoading(true);
    setIocResult(null);
    try {
      if (API_URL) {
        const res = await fetch(`${API_URL}/ioc/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ indicator: iocInput }),
        });
        const data = await res.json();
        setIocResult({ ...data, suggestions: generateSecuritySuggestions('ioc', data) });
      } else {
        // Client-side simulation
        await new Promise((r) => setTimeout(r, 1000));
        const input = iocInput.toLowerCase();
        let type = 'unknown';
        let score = 25;

        if (/^(\d{1,3}\.){3}\d{1,3}$/.test(input)) {
          type = 'IPv4';
          if (input.startsWith('185.220') || input.startsWith('192.168')) score = 75;
        } else if (input.startsWith('http')) {
          type = 'URL';
          score = 60;
        } else if (input.length === 64) {
          type = 'SHA256';
          score = 40;
        } else if (input.includes('.')) {
          type = 'Domain';
          score = 45;
        }

        setIocResult({
          indicator: iocInput,
          type,
          score,
          verdict: score > 60 ? 'Malicious' : score > 30 ? 'Suspicious' : 'Clean',
          tags: score > 60 ? ['threat-actor-associated', 'active-c2'] : [],
          defanged: input.replace('[.]', '.').replace('(dot)', '.'),
        });
      }
    } catch {
      setIocResult(null);
    }
    setIocLoading(false);
  };

  // Known trusted domains for validation
  const trustedDomains = [
    'google.com',
    'google.co.uk',
    'google.de',
    'google.fr',
    'google.jp',
    'google.ca',
    'microsoft.com',
    'microsoftonline.com',
    'office.com',
    'outlook.com',
    'live.com',
    'apple.com',
    'icloud.com',
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'amazon.com',
    'aws.amazon.com',
    'cloudflare.com',
    'cfemail.io',
    'facebook.com',
    'meta.com',
    'instagram.com',
    'twitter.com',
    'x.com',
    'linkedin.com',
  ];

  const suspiciousTLDs = ['xyz', 'top', 'click', 'link', 'work', 'ru', 'cn', 'tk', 'ml', 'ga', 'cf', 'gq'];
  const suspiciousPatterns = ['login', 'verify', 'secure', 'account', 'update', 'support', 'alert', 'signin', 'auth'];

  const generateSecuritySuggestions = (type: string, data: any): string[] => {
    const suggestions: string[] = [];
    if (type === 'domain') {
      const res = data as DomainResult;
      if (res.score < 80) suggestions.push('Improve domain security score by configuring missing records.');
      if (!res.spf.found) suggestions.push('Configure SPF record to prevent email spoofing.');
      if (!res.dmarc.found) suggestions.push('Implement DMARC policy (p=quarantine or p=reject).');
      if (!res.dkim[0]?.found) suggestions.push('Enable DKIM signing for outgoing emails.');
      if (!res.dnssec?.found) suggestions.push('Enable DNSSEC to protect against DNS spoofing.');
      if (!res.ssl.valid) suggestions.push('Install a valid SSL/TLS certificate.');
    } else if (type === 'phishing') {
      const res = data as PhishingResult;
      if (res.verdict === 'PHISHING') {
        suggestions.push('Report this URL to Google Safe Browsing.');
        suggestions.push('Block this domain at the firewall/DNS level.');
        suggestions.push('Alert users about this specific phishing campaign.');
      } else if (res.verdict === 'SUSPICIOUS') {
        suggestions.push('Exercise caution before entering any credentials.');
        suggestions.push('Verify the identity of the sender/source.');
      }
    } else if (type === 'exposure') {
      const res = data as ExposureResult;
      if (res.total_exposed_records > 0) {
        suggestions.push('Change passwords for any accounts associated with this email.');
        suggestions.push('Enable Multi-Factor Authentication (MFA) everywhere.');
        suggestions.push('Monitor financial statements for suspicious activity.');
      }
    } else if (type === 'privacy') {
      const res = data as PrivacyResult;
      if (res.score < 80) {
        suggestions.push('Use a privacy-focused browser like Brave or Firefox.');
        suggestions.push('Enable "Do Not Track" in your browser settings.');
        suggestions.push('Use a reputable VPN to mask your IP address.');
        suggestions.push('Install tracker-blocking extensions (uBlock Origin).');
      }
    }
    return suggestions;
  };

  const calculateDomainScore = (
    domain: string
  ): { score: number; health_score: string; verdict: string; additional_checks: any } => {
    const normalizedDomain = domain.toLowerCase().trim();
    const isTrusted = [
      'google.com',
      'microsoft.com',
      'github.com',
      'cloudflare.com',
      'apple.com',
      'amazon.com',
      'facebook.com',
      'linkedin.com',
      'twitter.com',
      'x.com',
    ].some((td) => normalizedDomain === td || normalizedDomain.endsWith('.' + td));
    if (isTrusted)
      return {
        score: 95,
        health_score: 'Excellent',
        verdict: 'Secure',
        additional_checks: { is_trusted: true, entropy: 2.5 },
      };

    let score = 70;
    const parts = normalizedDomain.split('.');
    const tld = parts.pop() || '';
    const mainPart = parts.join('.');

    if (suspiciousTLDs.includes(tld)) score -= 15;
    const hasSuspiciousPattern = suspiciousPatterns.some((p) => normalizedDomain.includes(p));
    if (hasSuspiciousPattern) score -= 20;

    const charCounts: Record<string, number> = {};
    for (const char of mainPart) {
      charCounts[char] = (charCounts[char] || 0) + 1;
    }
    let entropy = 0;
    for (const char in charCounts) {
      const p = charCounts[char] / mainPart.length;
      entropy -= p * Math.log2(p);
    }
    if (entropy > 3.8) score -= 20;

    const homoglyphs = /[а-яА-Я]|[οοΟΟ]|[рР]|[сС]|[уУ]|[хХ]/;
    if (homoglyphs.test(normalizedDomain)) score = Math.max(score - 45, 10);

    if (normalizedDomain.length > 25) score -= 10;
    const hyphenCount = (normalizedDomain.match(/-/g) || []).length;
    if (hyphenCount >= 3) score -= 15;

    score = Math.max(Math.min(score, 100), 0);

    let health_score = 'Good',
      verdict = 'Good';
    if (score >= 85) {
      health_score = 'Excellent';
      verdict = 'Secure';
    } else if (score >= 65) {
      health_score = 'Good';
      verdict = 'Good';
    } else if (score >= 40) {
      health_score = 'Fair';
      verdict = 'Needs Attention';
    } else if (score >= 20) {
      health_score = 'Poor';
      verdict = 'Suspicious';
    } else {
      health_score = 'Critical';
      verdict = 'Likely Malicious';
    }
    return {
      score,
      health_score,
      verdict,
      additional_checks: {
        entropy: Number(entropy.toFixed(2)),
        length: normalizedDomain.length,
        has_homoglyphs: homoglyphs.test(normalizedDomain),
        is_suspicious_tld: suspiciousTLDs.includes(tld),
      },
    };
  };

  const checkDomain = async () => {
    if (!domainInput.trim()) return;
    setDomainLoading(true);
    setDomainResult(null);
    try {
      if (API_URL) {
        const res = await fetch(`${API_URL}/domain/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: domainInput }),
        });
        const data = await res.json();
        setDomainResult({ ...data, suggestions: generateSecuritySuggestions('domain', data) });
      } else {
        // Client-side simulation with improved scoring
        await new Promise((r) => setTimeout(r, 1500));
        const domain = domainInput.toLowerCase().trim();
        const { score, health_score, verdict, additional_checks } = calculateDomainScore(domain);

        const result: DomainResult = {
          domain,
          score,
          verdict,
          generated: new Date().toISOString(),
          health_score,
          blacklist:
            score < 60
              ? [{ ip: '93.184.216.34', listed: score < 40, blacklists: score < 40 ? ['spamhaus', 'surbl'] : [] }]
              : [],
          mx: {
            records:
              score >= 60
                ? [
                    { priority: 10, host: 'aspmx.l.google.com' },
                    { priority: 20, host: 'alt1.aspmx.l.google.com' },
                    { priority: 30, host: 'alt2.aspmx.l.google.com' },
                  ]
                : [],
          },
          spf: { found: score >= 50, record: score >= 50 ? 'v=spf1 include:_spf.google.com ~all' : undefined },
          dmarc: {
            found: score >= 50,
            record: score >= 50 ? 'v=DMARC1; p=quarantine; rua=mailto:dmarc@' + domain : undefined,
          },
          dkim: [{ found: score >= 70, selector: score >= 70 ? 'google' : undefined }],
          ssl: {
            valid: score >= 40,
            issuer: score >= 40 ? 'Google Trust Services' : undefined,
            expires: score >= 40 ? '2026-01-01' : undefined,
          },
          dns: {
            A: score >= 30 ? ['142.250.185.78'] : undefined,
            AAAA: score >= 30 ? ['2607:f8b0:4004:800::200e'] : undefined,
          },
          dnssec: { found: score >= 80 },
          additional_checks,
        };
        result.suggestions = generateSecuritySuggestions('domain', result);
        setDomainResult(result);
      }
    } catch {
      setDomainResult(null);
    }
    setDomainLoading(false);
  };

  // Phishing Analysis
  const analyzePhishing = async () => {
    if (!phishingUrl.trim()) return;
    setPhishingLoading(true);
    setPhishingResult(null);
    try {
      if (API_URL) {
        const res = await fetch(`${API_URL}/phishing/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: phishingUrl }),
        });
        const data = await res.json();
        setPhishingResult({ ...data, suggestions: generateSecuritySuggestions('phishing', data) });
      } else {
        // Client-side simulation
        await new Promise((r) => setTimeout(r, 2000));
        const url = phishingUrl.toLowerCase();
        const isPhishing =
          url.includes('login') || url.includes('signin') || url.includes('verify') || url.includes('secure');
        const riskFactors: string[] = [];

        if (url.includes('http://')) riskFactors.push('Insecure HTTP connection');
        if (url.match(/\d{1,3}\.\d{1,3}\.\d{1,3}/)) riskFactors.push('IP address in URL');
        if (url.includes('-')) riskFactors.push('Hyphenated domain (common in lookalikes)');
        if (url.match(/[a-z]+\.[a-z]{5,}/) === null) riskFactors.push('Unusual TLD');
        if (url.includes('@')) riskFactors.push('Email-style URL (potential spoofing)');

        setPhishingResult({
          url: phishingUrl,
          verdict: isPhishing || riskFactors.length > 2 ? 'PHISHING' : 'SUSPICIOUS',
          confidence: isPhishing ? 85 : riskFactors.length > 2 ? 70 : 45,
          risk_factors: riskFactors.length > 0 ? riskFactors : ['No obvious risk factors detected'],
          final_url: url.replace('http://', 'https://'),
          content_flags: isPhishing ? ['Credential harvesting form', 'Fake login page'] : [],
          similar_domains: [
            { domain: 'google.com', similarity: 0.85 },
            { domain: 'microsoft.com', similarity: 0.72 },
          ],
        });
      }
    } catch {
      setPhishingResult(null);
    }
    setPhishingLoading(false);
  };

  // Exposure Scan
  const runExposureScan = async () => {
    if (!exposureQuery.trim()) return;
    setExposureLoading(true);
    setExposureResult(null);
    try {
      if (API_URL) {
        const res = await fetch(`${API_URL}/exposure/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: exposureQuery }),
        });
        const data = await res.json();
        const exposureWithSuggestions = { ...data, suggestions: generateSecuritySuggestions('exposure', data) };
        setExposureResult(exposureWithSuggestions);
        setExposureHistory((prev) => [exposureWithSuggestions, ...prev.slice(0, 9)]);
      } else {
        // Client-side simulation
        await new Promise((r) => setTimeout(r, 2500));
        const query = exposureQuery;
        const sources = [
          {
            name: 'Have I Been Pwned',
            records: Math.floor(Math.random() * 5) + 1,
            date: '2024-03-15',
            category: 'Breach Data',
          },
          {
            name: 'DeHashed',
            records: Math.floor(Math.random() * 3),
            date: '2024-02-20',
            category: 'Leaked Credentials',
          },
          { name: 'LeakCheck', records: Math.floor(Math.random() * 2), date: '2024-01-10', category: 'Data Breach' },
        ];

        const exposureData = {
          query,
          type: query.includes('@') ? 'Email' : 'Domain',
          total_exposed_records: sources.reduce((acc, s) => acc + s.records, 0),
          sources,
          severity: sources.reduce((acc, s) => acc + s.records, 0) > 3 ? 'High' : 'Medium',
          risk_level: sources.reduce((acc, s) => acc + s.records, 0) > 5 ? 'Critical' : 'Elevated',
        };
        setExposureResult(exposureData);
        setExposureHistory((prev) => [exposureData, ...prev.slice(0, 9)]);
      }
    } catch {
      setExposureResult(null);
    }
    setExposureLoading(false);
  };

  // Browser-based privacy check
  const runPrivacyCheck = async () => {
    setPrivacyLoading(true);
    await new Promise((r) => setTimeout(r, 1500));

    const getCanvasFingerprint = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        canvas.width = 200;
        canvas.height = 50;
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('Privacy Check', 2, 15);
        return canvas.toDataURL();
      } catch {
        return '';
      }
    };

    const canvas = getCanvasFingerprint();
    const results: PrivacyResult = {
      score: 72,
      maxScore: 100,
      grade: 'B',
      categories: {
        ipNetwork: { score: 15, maxScore: 25, details: { httpIp: 'Detected', webrtcLeak: 'None' } },
        dnsPrivacy: { score: 10, maxScore: 15, details: { dohEnabled: false } },
        fingerprinting: { score: 20, maxScore: 25, details: { canvasHash: !!canvas, platform: navigator.userAgent } },
        privacySettings: { score: 8, maxScore: 15, details: { dnt: navigator.doNotTrack === '1' } },
        connectionSecurity: { score: 10, maxScore: 10, details: { https: true } },
        trackingProtection: { score: 9, maxScore: 10, details: { trackerBlocker: true } },
      },
    };
    setPrivacyResult(results);
    setPrivacyLoading(false);
  };

  const markIntelAsRead = (id: string) => {
    setIntelItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
  };

  const markResearchAsRead = (id: string) => {
    setResearchItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const clearHistory = () => {
    setExposureHistory([]);
  };

  if (!mounted) return null;

  // ---------------------------------------------------------------------------
  // CONSOLIDATED TABS (10 → 7 for better UX and performance)
  // ---------------------------------------------------------------------------
  const tabs = [
    { id: 'home', label: 'Home', icon: Shield },
    { id: 'domain', label: 'Domain', icon: Globe },
    { id: 'analysis', label: 'Analysis', icon: Search, description: 'IOC + Phishing' }, // MERGED
    { id: 'exposure', label: 'Exposure', icon: Database },
    { id: 'privacy', label: 'Privacy', icon: Lock },
    { id: 'knowledge', label: 'Knowledge', icon: BookOpen, description: 'Wiki + Research' }, // MERGED
    { id: 'threatIntel', label: 'Threat Intel', icon: Radar, description: 'Intel + Actors' }, // MERGED
  ];

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    if (score >= 50) return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
  };

  return (
    <section id="dfir" className="mt-32 scroll-mt-24">
      <div className="mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-brand-700 dark:text-brand-300"
        >
          Functional Toolkit
        </motion.div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-3xl font-extrabold tracking-tight sm:text-4xl text-slate-900 dark:text-white"
            >
              DFIR-PLATFORM Tools
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400"
            >
              A consolidated suite of digital forensics and incident response tools integrated directly into the
              portfolio.
            </motion.p>
          </div>
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <Breadcrumbs items={[{ label: 'DFIR Tools' }]} className="justify-end" />
          </motion.div>
        </div>
      </div>

      <div className="glass rounded-3xl overflow-hidden shadow-2xl">
        {/* Tab Navigation */}
        <div className="flex overflow-x-auto no-scrollbar bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all whitespace-nowrap border-b-2 ${
                activeTab === tab.id
                  ? 'text-brand-600 dark:text-brand-400 border-brand-500 bg-brand-500/5'
                  : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.description && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal hidden sm:inline">
                  ({tab.description})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="p-8 min-h-[500px] bg-slate-50/30 dark:bg-slate-900/30">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === 'home' && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                        Welcome to the DFIR Toolkit
                      </h3>
                      <p className="text-slate-600 dark:text-slate-400 mb-6">
                        This platform provides functional security tools for domain analysis, IOC reputation checking,
                        and threat intelligence gathering. Designed for security analysts and researchers.
                      </p>
                      <ConnectionStatus apiUrl={API_URL} />
                      <div className="mt-4 flex items-start gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-white/10">
                        <HelpCircle className="w-5 h-5 text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                            Running in offline mode
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                            Client-side tools work offline. Connect to the FastAPI backend for real-time threat
                            intelligence, RSS feeds, and additional analysis capabilities.
                          </p>
                          <div className="flex flex-wrap gap-3 text-xs">
                            <a
                              href="https://github.com/Pranith-Jain/DFIR-PLATFORM"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                            >
                              View Backend <ExternalLink className="w-3 h-3" />
                            </a>
                            <span className="text-slate-300 dark:text-slate-600">|</span>
                            <a
                              href="https://github.com/Pranith-Jain/DFIR-PLATFORM#setup"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                            >
                              Setup Instructions <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-4 mt-6">
                        <button
                          onClick={() => setActiveTab('domain')}
                          className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold transition-colors flex items-center gap-2"
                        >
                          <Globe className="w-4 h-4" />
                          Start Domain Scan
                        </button>
                        <button
                          onClick={() => setActiveTab('analysis')}
                          className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors flex items-center gap-2"
                        >
                          <Search className="w-4 h-4" />
                          IOC/Phishing Analysis
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        {
                          label: 'IOC Check',
                          icon: Activity,
                          color: 'text-rose-500 dark:text-rose-400',
                          tab: 'analysis',
                        },
                        { label: 'Phishing', icon: Bug, color: 'text-amber-500 dark:text-amber-400', tab: 'analysis' },
                        {
                          label: 'Exposure',
                          icon: Database,
                          color: 'text-cyan-500 dark:text-cyan-400',
                          tab: 'exposure',
                        },
                        {
                          label: 'Privacy',
                          icon: Lock,
                          color: 'text-emerald-500 dark:text-emerald-400',
                          tab: 'privacy',
                        },
                      ].map((tool) => (
                        <button
                          key={tool.label}
                          onClick={() => setActiveTab(tool.tab as TabType)}
                          className="p-4 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center shadow-sm hover:bg-white/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          <tool.icon className={`w-8 h-8 mx-auto mb-2 ${tool.color}`} />
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{tool.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'domain' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Domain Security Checker</h3>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={domainInput}
                        onChange={(e) => setDomainInput(e.target.value)}
                        placeholder="Enter domain (e.g., google.com)"
                        className="flex-1 px-4 py-3 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 transition-colors shadow-sm"
                        onKeyDown={(e) => e.key === 'Enter' && checkDomain()}
                      />
                      <button
                        onClick={checkDomain}
                        disabled={domainLoading}
                        className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-semibold transition-all flex items-center gap-2 shadow-sm"
                      >
                        {domainLoading ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Globe className="w-4 h-4" />
                        )}
                        Scan
                      </button>
                    </div>
                  </div>

                  {domainResult && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className={`p-6 rounded-2xl border ${getScoreColor(domainResult.score)} shadow-sm`}>
                          <span className="text-sm opacity-80 block mb-1">Security Score</span>
                          <span className="text-3xl font-bold">{domainResult.score}/100</span>
                        </div>
                        <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                          <span className="text-sm text-slate-500 dark:text-slate-400 block mb-1">MX Status</span>
                          <span className="text-xl font-bold text-slate-900 dark:text-white">
                            {domainResult.mx?.records?.length > 0 ? 'Configured' : 'Missing'}
                          </span>
                        </div>
                        <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                          <span className="text-sm text-slate-500 dark:text-slate-400 block mb-1">SSL Certificate</span>
                          <span className="text-xl font-bold text-slate-900 dark:text-white">
                            {domainResult.ssl?.valid ? 'Valid' : 'Insecure'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                          { label: 'SPF', val: domainResult.spf?.found },
                          { label: 'DMARC', val: domainResult.dmarc?.found },
                          { label: 'DKIM', val: domainResult.dkim?.some((d) => d.found) },
                          { label: 'DNSSEC', val: domainResult.dnssec?.found },
                        ].map((s) => (
                          <div
                            key={s.label}
                            className="p-4 rounded-xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-between shadow-sm"
                          >
                            <span className="text-sm text-slate-500 dark:text-slate-400">{s.label}</span>
                            {s.val ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            ) : (
                              <XCircle className="w-5 h-5 text-rose-500" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'analysis' && (
                <div className="space-y-6">
                  <div className="flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/50 w-fit">
                    <button
                      onClick={() => setAnalysisMode('ioc')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                        analysisMode === 'ioc'
                          ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      <Activity className="w-4 h-4" />
                      IOC Check
                    </button>
                    <button
                      onClick={() => setAnalysisMode('phishing')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                        analysisMode === 'phishing'
                          ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      <Bug className="w-4 h-4" />
                      Phishing Analyzer
                    </button>
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={analysisMode}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      {analysisMode === 'ioc' && (
                        <div className="max-w-2xl mx-auto space-y-6">
                          <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                              <Activity className="w-5 h-5 text-rose-500" />
                              IOC Reputation Checker
                            </h3>
                            <div className="flex gap-3">
                              <input
                                type="text"
                                value={iocInput}
                                onChange={(e) => setIocInput(e.target.value)}
                                placeholder="IP, Domain, URL, or File Hash"
                                className="flex-1 px-4 py-3 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 transition-colors shadow-sm"
                                onKeyDown={(e) => e.key === 'Enter' && checkIOC()}
                              />
                              <button
                                onClick={checkIOC}
                                disabled={iocLoading}
                                className="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold transition-all flex items-center gap-2 shadow-sm"
                              >
                                {iocLoading ? (
                                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                  <Search className="w-4 h-4" />
                                )}
                                Check
                              </button>
                            </div>
                          </div>

                          {iocResult && (
                            <div className={`p-6 rounded-2xl border ${getScoreColor(100 - iocResult.score)} shadow-md`}>
                              <div className="flex justify-between items-start mb-4">
                                <div>
                                  <span className="text-xs uppercase tracking-wider opacity-70">Verdict</span>
                                  <h4 className="text-2xl font-bold uppercase">{sanitizeText(iocResult.verdict)}</h4>
                                </div>
                                <div className="text-right">
                                  <span className="text-xs uppercase tracking-wider opacity-70">Type</span>
                                  <p className="font-mono">{sanitizeText(iocResult.type)}</p>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span>Risk Score</span>
                                  <span>{iocResult.score}/100</span>
                                </div>
                                <div className="w-full h-2 bg-black/10 dark:bg-black/20 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-current transition-all"
                                    style={{ width: `${iocResult.score}%` }}
                                  />
                                </div>
                              </div>
                              {iocResult.defanged && (
                                <div className="mt-4 p-3 rounded-lg bg-black/5 dark:bg-black/20 font-mono text-xs break-all">
                                  Defanged: {sanitizeText(iocResult.defanged)}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {analysisMode === 'phishing' && (
                        <div className="max-w-4xl mx-auto space-y-6">
                          <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                            <div className="flex items-center gap-3 mb-4">
                              <Bug className="w-6 h-6 text-amber-500" />
                              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                                Phishing URL Analyzer
                              </h3>
                            </div>
                            <div className="flex gap-3">
                              <div className="relative flex-1">
                                {showUrl ? (
                                  <input
                                    type="text"
                                    value={phishingUrl}
                                    onChange={(e) => setPhishingUrl(e.target.value)}
                                    placeholder="Enter URL to analyze"
                                    className="w-full px-4 py-3 pr-10 rounded-xl bg-white dark:bg-slate-800/50 border border-amber-500/50 text-slate-900 dark:text-white focus:outline-none transition-colors shadow-sm"
                                    onKeyDown={(e) => e.key === 'Enter' && analyzePhishing()}
                                  />
                                ) : (
                                  <input
                                    type="password"
                                    value={phishingUrl}
                                    onChange={(e) => setPhishingUrl(e.target.value)}
                                    placeholder="Enter URL to analyze"
                                    className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none transition-colors shadow-sm"
                                    onKeyDown={(e) => e.key === 'Enter' && analyzePhishing()}
                                  />
                                )}
                                <button
                                  onClick={() => setShowUrl(!showUrl)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                  {showUrl ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                              </div>
                              <button
                                onClick={analyzePhishing}
                                disabled={phishingLoading}
                                className="px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold transition-all flex items-center gap-2 shadow-sm"
                              >
                                {phishingLoading ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Bug className="w-4 h-4" />
                                )}
                                Analyze
                              </button>
                            </div>
                          </div>

                          {phishingResult && (
                            <div className="space-y-6">
                              <div
                                className={`p-6 rounded-2xl border-2 ${
                                  phishingResult.verdict === 'PHISHING'
                                    ? 'bg-rose-500/10 border-rose-500/30'
                                    : 'bg-amber-500/10 border-amber-500/30'
                                } shadow-md`}
                              >
                                <div className="flex justify-between items-start mb-4">
                                  <div>
                                    <span className="text-xs uppercase tracking-wider text-slate-500">Verdict</span>
                                    <h4
                                      className={`text-3xl font-black uppercase ${
                                        phishingResult.verdict === 'PHISHING'
                                          ? 'text-rose-600 dark:text-rose-400'
                                          : 'text-amber-600 dark:text-amber-400'
                                      }`}
                                    >
                                      {sanitizeText(phishingResult.verdict)}
                                    </h4>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-xs uppercase tracking-wider text-slate-500">Confidence</span>
                                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                                      {phishingResult.confidence}%
                                    </p>
                                  </div>
                                </div>
                                <div className="flex gap-4 text-sm">
                                  <div className="flex items-center gap-2">
                                    <Link2 className="w-4 h-4 text-slate-500" />
                                    <span className="text-slate-600 dark:text-slate-400 truncate max-w-[300px]">
                                      {sanitizeText(phishingResult.url)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                                  <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                                    Risk Factors
                                  </h4>
                                  <div className="space-y-2">
                                    {phishingResult.risk_factors.map((factor, idx) => (
                                      <div key={idx} className="flex items-start gap-2 text-sm">
                                        <XCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                                        <span className="text-slate-700 dark:text-slate-300">
                                          {sanitizeText(factor)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                                  <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                    <Globe className="w-5 h-5 text-cyan-500" />
                                    Similar Domains
                                  </h4>
                                  {phishingResult.similar_domains && phishingResult.similar_domains.length > 0 ? (
                                    <div className="space-y-3">
                                      {phishingResult.similar_domains.map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center">
                                          <span className="text-sm text-slate-700 dark:text-slate-300 font-mono">
                                            {sanitizeText(item.domain)}
                                          </span>
                                          <div className="flex items-center gap-2">
                                            <div className="w-24 h-1.5 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                                              <div
                                                className="h-full bg-brand-500"
                                                style={{ width: `${item.similarity * 100}%` }}
                                              />
                                            </div>
                                            <span className="text-xs font-semibold text-slate-500">
                                              {(item.similarity * 100).toFixed(0)}%
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-slate-500">No similar domains found</p>
                                  )}
                                </div>
                              </div>

                              {phishingResult.content_flags && phishingResult.content_flags.length > 0 && (
                                <div className="p-6 rounded-2xl bg-rose-500/5 border border-rose-500/20 shadow-sm">
                                  <h4 className="font-bold text-rose-600 dark:text-rose-400 mb-3 flex items-center gap-2">
                                    <ShieldAlert className="w-5 h-5" />
                                    Content Flags Detected
                                  </h4>
                                  <div className="flex flex-wrap gap-2">
                                    {phishingResult.content_flags.map((flag, idx) => (
                                      <span
                                        key={idx}
                                        className="px-3 py-1 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-sm font-medium"
                                      >
                                        {sanitizeText(flag)}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}

              {activeTab === 'privacy' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="p-8 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center shadow-sm">
                    <Lock className="w-12 h-12 text-brand-600 dark:text-brand-400 mx-auto mb-4" />
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Browser Privacy Check</h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-lg mx-auto">
                      Analyze what your browser reveals to websites, including fingerprinting, IP leaks, and security
                      settings.
                    </p>
                    <button
                      onClick={runPrivacyCheck}
                      disabled={privacyLoading}
                      className="px-8 py-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-bold transition-all shadow-md"
                    >
                      {privacyLoading ? 'Analyzing Browser...' : 'Run Privacy Scan'}
                    </button>
                  </div>

                  {privacyResult && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                          <h4 className="font-bold text-slate-900 dark:text-white">Privacy Score</h4>
                          <span className="text-3xl font-black text-brand-600 dark:text-brand-400">
                            {privacyResult.score}/100
                          </span>
                        </div>
                        <div className="space-y-4">
                          {Object.entries(privacyResult.categories).map(([key, cat]) => (
                            <div key={key} className="space-y-1">
                              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 uppercase">
                                <span>{key.replace(/([A-Z])/g, ' $1')}</span>
                                <span>
                                  {cat.score}/{cat.maxScore}
                                </span>
                              </div>
                              <div className="h-1.5 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-brand-500"
                                  style={{ width: `${(cat.score / cat.maxScore) * 100}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                        <h4 className="font-bold text-slate-900 dark:text-white mb-4">Detected Exposure</h4>
                        <div className="space-y-3 text-sm">
                          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-white/5">
                            <span className="text-slate-500 dark:text-slate-400">Platform</span>
                            <span className="text-slate-900 dark:text-slate-200">
                              {privacyResult.categories.fingerprinting.details.platform}
                            </span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-white/5">
                            <span className="text-slate-500 dark:text-slate-400">Fingerprinting</span>
                            <span className="text-rose-600 dark:text-rose-400 font-semibold">Detected</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-white/5">
                            <span className="text-slate-500 dark:text-slate-400">Do Not Track</span>
                            <span
                              className={
                                privacyResult.categories.privacySettings.details.dnt
                                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                  : 'text-slate-400'
                              }
                            >
                              {privacyResult.categories.privacySettings.details.dnt ? 'Enabled' : 'Not Set'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'knowledge' && (
                <div className="space-y-6">
                  {/* Wiki + Research merged into Knowledge */}
                  <div className="flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/50 w-fit">
                    <button
                      onClick={() => setKnowledgeMode('wiki')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                        knowledgeMode === 'wiki'
                          ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      <BookOpen className="w-4 h-4" />
                      Wiki
                    </button>
                    <button
                      onClick={() => setKnowledgeMode('research')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                        knowledgeMode === 'research'
                          ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      <FileText className="w-4 h-4" />
                      Research Papers
                    </button>
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={knowledgeMode}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      {knowledgeMode === 'wiki' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {wikiData.categories.map((cat) => (
                            <div
                              key={cat.id}
                              className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-brand-500/50 transition-all cursor-pointer group shadow-sm"
                            >
                              <div className="flex justify-between items-start mb-4">
                                <div className="p-3 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 group-hover:scale-110 transition-transform">
                                  <BookOpen className="w-6 h-6" />
                                </div>
                                <span className="text-xs font-mono text-slate-500">{cat.count} Articles</span>
                              </div>
                              <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                                {sanitizeText(cat.name)}
                              </h4>
                              <div className="flex items-center text-sm text-brand-600 dark:text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                View Details <ChevronRight className="w-4 h-4" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {knowledgeMode === 'research' && (
                        <div className="space-y-6">
                          <div className="flex flex-wrap gap-3">
                            {[
                              'all',
                              'phishing detection',
                              'email security',
                              'threat intelligence',
                              'digital forensics',
                              'cloud security',
                              'osint',
                            ].map((filter) => (
                              <button
                                key={filter}
                                onClick={() => setResearchFilter(filter)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                  researchFilter === filter
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-white/40 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-white/60'
                                }`}
                              >
                                {filter.charAt(0).toUpperCase() + filter.slice(1)}
                              </button>
                            ))}
                          </div>

                          {researchLoading ? (
                            <div className="flex items-center justify-center py-20">
                              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {researchItems
                                .filter(
                                  (item) =>
                                    researchFilter === 'all' || item.category.toLowerCase().includes(researchFilter)
                                )
                                .map((item) => (
                                  <div
                                    key={item.id}
                                    className={`p-6 rounded-2xl bg-white/40 dark:bg-white/5 border transition-all ${
                                      item.read
                                        ? 'border-slate-200 dark:border-white/5'
                                        : 'border-slate-200 dark:border-white/10 hover:border-brand-500/50'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between mb-4">
                                      <div>
                                        <span className="px-2 py-0.5 rounded bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[10px] font-bold">
                                          {sanitizeText(item.category)}
                                        </span>
                                        <span className="text-xs text-slate-500 ml-2">
                                          {sanitizeText(item.published)}
                                        </span>
                                      </div>
                                      {!item.read && <span className="w-2 h-2 rounded-full bg-brand-500" />}
                                    </div>
                                    <button
                                      onClick={() => setExpandedResearch(expandedResearch === item.id ? null : item.id)}
                                      className="text-lg font-bold text-slate-900 dark:text-white mb-2 cursor-pointer hover:text-brand-600 transition-colors text-left w-full"
                                    >
                                      {sanitizeText(item.title)}
                                    </button>
                                    <p className="text-xs text-slate-500 mb-3">{sanitizeText(item.authors)}</p>

                                    <div
                                      className={`overflow-hidden transition-all ${expandedResearch === item.id ? 'max-h-48' : 'max-h-0'}`}
                                    >
                                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                                        {sanitizeText(item.summary)}
                                      </p>
                                    </div>

                                    <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
                                      <div className="flex items-center gap-3">
                                        {item.citations && (
                                          <span className="text-xs text-slate-500 flex items-center gap-1">
                                            <FileText className="w-3 h-3" />
                                            {item.citations} citations
                                          </span>
                                        )}
                                        <button
                                          onClick={() => markResearchAsRead(item.id)}
                                          className="text-xs text-slate-500 hover:text-brand-500"
                                        >
                                          {item.read ? '✓ Read' : 'Mark read'}
                                        </button>
                                      </div>
                                      <a
                                        href={isSafeUrl(item.url) ? item.url : '#'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => markResearchAsRead(item.id)}
                                        className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-1 transition-colors"
                                      >
                                        <FileText className="w-3 h-3" />
                                        Read Paper
                                      </a>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}

              {activeTab === 'threatIntel' && (
                <div className="space-y-6">
                  {/* Intel + Actors merged into Threat Intel */}
                  <div className="flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/50 w-fit">
                    <button
                      onClick={() => setThreatIntelMode('intel')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                        threatIntelMode === 'intel'
                          ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      <Radar className="w-4 h-4" />
                      Threat Feeds
                    </button>
                    <button
                      onClick={() => setThreatIntelMode('actors')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                        threatIntelMode === 'actors'
                          ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      Threat Actors
                    </button>
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={threatIntelMode}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      {threatIntelMode === 'intel' && (
                        <div className="space-y-6">
                          <div className="flex flex-wrap gap-3">
                            {['all', 'malware', 'vulnerability', 'phishing', 'threat-actor'].map((filter) => (
                              <button
                                key={filter}
                                onClick={() => setIntelFilter(filter)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                  intelFilter === filter
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-white/40 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-white/60'
                                }`}
                              >
                                {filter.charAt(0).toUpperCase() + filter.slice(1)}
                              </button>
                            ))}
                            <button
                              onClick={fetchThreatIntel}
                              className="px-4 py-2 rounded-lg text-sm font-medium bg-white/40 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-white/60 flex items-center gap-2 transition-all ml-auto"
                            >
                              <RefreshCw className="w-4 h-4" />
                              Refresh
                            </button>
                          </div>

                          {intelLoading ? (
                            <div className="flex items-center justify-center py-20">
                              <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {intelItems
                                .filter(
                                  (item) => intelFilter === 'all' || item.type.toLowerCase().includes(intelFilter)
                                )
                                .map((item) => (
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    key={item.id}
                                    className={`p-6 rounded-2xl bg-white/40 dark:bg-white/5 border transition-all cursor-pointer ${
                                      item.read
                                        ? 'border-slate-200 dark:border-white/5 opacity-75'
                                        : 'border-slate-200 dark:border-white/10 hover:border-brand-500/50'
                                    }`}
                                    onClick={() => {
                                      setExpandedIntel(expandedIntel === item.id ? null : item.id);
                                      if (!item.read) markIntelAsRead(item.id);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        setExpandedIntel(expandedIntel === item.id ? null : item.id);
                                        if (!item.read) markIntelAsRead(item.id);
                                      }
                                    }}
                                  >
                                    <div className="flex justify-between items-start mb-3">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <span
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                              item.severity === 'Critical'
                                                ? 'bg-rose-500/10 text-rose-600'
                                                : item.severity === 'High'
                                                  ? 'bg-amber-500/10 text-amber-600'
                                                  : 'bg-cyan-500/10 text-cyan-600'
                                            }`}
                                          >
                                            {sanitizeText(item.severity)}
                                          </span>
                                          <span className="text-xs text-slate-500">{sanitizeText(item.source)}</span>
                                          {!item.read && <span className="w-2 h-2 rounded-full bg-brand-500" />}
                                        </div>
                                        <h4 className="text-lg font-bold text-slate-900 dark:text-white">
                                          {sanitizeText(item.title)}
                                        </h4>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-500">
                                          {new Date(item.published).toLocaleDateString()}
                                        </span>
                                        <ChevronRight
                                          className={`w-5 h-5 text-slate-400 transition-transform ${expandedIntel === item.id ? 'rotate-90' : ''}`}
                                        />
                                      </div>
                                    </div>

                                    {expandedIntel === item.id && (
                                      <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="space-y-4 mt-4 pt-4 border-t border-slate-100 dark:border-white/5"
                                      >
                                        <p className="text-sm text-slate-600 dark:text-slate-400">
                                          {sanitizeText(item.description)}
                                        </p>

                                        {item.indicators && item.indicators.length > 0 && (
                                          <div>
                                            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                                              Indicators
                                            </h5>
                                            <div className="flex flex-wrap gap-2">
                                              {item.indicators.map((ind, idx) => (
                                                <button
                                                  key={idx}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    copyToClipboard(ind);
                                                  }}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                      e.stopPropagation();
                                                      copyToClipboard(ind);
                                                    }
                                                  }}
                                                  className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-white/10 font-mono text-xs text-slate-700 dark:text-slate-300 hover:bg-brand-500/10 hover:text-brand-600 cursor-pointer transition-colors flex items-center gap-1"
                                                  aria-label={`Copy ${ind} to clipboard`}
                                                >
                                                  <Copy className="w-3 h-3" />
                                                  {sanitizeText(ind)}
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        <a
                                          href={isSafeUrl(item.link) ? item.link : '#'}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="inline-flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400 hover:underline"
                                        >
                                          View Source <ExternalLink className="w-4 h-4" />
                                        </a>
                                      </motion.div>
                                    )}
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      )}

                      {threatIntelMode === 'actors' && (
                        <div className="space-y-6">
                          <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                              type="text"
                              value={actorSearch}
                              onChange={(e) => setActorSearch(e.target.value)}
                              placeholder="Search threat actors..."
                              className="w-full pl-12 pr-4 py-3 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 transition-colors"
                            />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {threatActors
                              .filter(
                                (actor) =>
                                  actor.name.toLowerCase().includes(actorSearch.toLowerCase()) ||
                                  actor.origin.toLowerCase().includes(actorSearch.toLowerCase())
                              )
                              .map((actor) => (
                                <div
                                  key={actor.name}
                                  className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm hover:border-brand-500/50 transition-all cursor-pointer"
                                >
                                  <div className="flex justify-between mb-4">
                                    <span
                                      className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                                        actor.status === 'Active'
                                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                          : 'bg-slate-500/10 text-slate-500'
                                      }`}
                                    >
                                      {actor.status === 'Active' ? '⚠ Active' : actor.status}
                                    </span>
                                    <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-mono">
                                      {sanitizeText(actor.motivation)}
                                    </span>
                                  </div>
                                  <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                                    {sanitizeText(actor.name)}
                                  </h4>
                                  <p className="text-xs text-slate-500 mb-4 font-mono">{sanitizeText(actor.origin)}</p>
                                  <div className="flex flex-wrap gap-1 mb-4">
                                    {actor.targets.slice(0, 2).map((target) => (
                                      <span
                                        key={target}
                                        className="px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[10px]"
                                      >
                                        {sanitizeText(target)}
                                      </span>
                                    ))}
                                  </div>
                                  <button className="w-full py-2 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors flex items-center justify-center gap-2">
                                    <FileSearch className="w-3 h-3" />
                                    View Profile
                                  </button>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}

              {activeTab === 'exposure' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <Database className="w-6 h-6 text-cyan-500" />
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">Data Exposure Scanner</h3>
                    </div>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={exposureQuery}
                        onChange={(e) => setExposureQuery(e.target.value)}
                        placeholder="Enter email or domain to check exposure"
                        className="flex-1 px-4 py-3 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 transition-colors shadow-sm"
                        onKeyDown={(e) => e.key === 'Enter' && runExposureScan()}
                      />
                      <button
                        onClick={runExposureScan}
                        disabled={exposureLoading}
                        className="px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold transition-all flex items-center gap-2 shadow-sm"
                      >
                        {exposureLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Search className="w-4 h-4" />
                        )}
                        Scan
                      </button>
                    </div>
                  </div>

                  {exposureResult && (
                    <div className="space-y-6">
                      <div
                        className={`p-6 rounded-2xl border-2 ${
                          exposureResult.risk_level === 'Critical'
                            ? 'bg-rose-500/10 border-rose-500/30'
                            : exposureResult.risk_level === 'High'
                              ? 'bg-amber-500/10 border-amber-500/30'
                              : 'bg-cyan-500/10 border-cyan-500/30'
                        } shadow-md`}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <span className="text-xs uppercase tracking-wider text-slate-500">Risk Level</span>
                            <h4
                              className={`text-2xl font-black uppercase ${
                                exposureResult.risk_level === 'Critical'
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : exposureResult.risk_level === 'High'
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-cyan-600 dark:text-cyan-400'
                              }`}
                            >
                              {exposureResult.risk_level}
                            </h4>
                          </div>
                          <div className="text-right">
                            <span className="text-xs uppercase tracking-wider text-slate-500">Exposed Records</span>
                            <p className="text-3xl font-bold text-slate-900 dark:text-white">
                              {exposureResult.total_exposed_records}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-4 text-sm text-slate-600 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <Hash className="w-4 h-4" />
                            Type: {exposureResult.type}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            Severity: {exposureResult.severity}
                          </span>
                        </div>
                      </div>

                      <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                        <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                          <Server className="w-5 h-5 text-brand-500" />
                          Breach Sources
                        </h4>
                        <div className="space-y-4">
                          {exposureResult.sources.map((source, idx) => (
                            <div
                              key={idx}
                              className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-white/5"
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <h5 className="font-semibold text-slate-900 dark:text-white">{source.name}</h5>
                                  <p className="text-xs text-slate-500">{source.category}</p>
                                </div>
                                <div className="text-right">
                                  <span className="text-lg font-bold text-rose-600 dark:text-rose-400">
                                    {source.records}
                                  </span>
                                  <p className="text-[10px] text-slate-500">records</p>
                                </div>
                              </div>
                              <div className="flex justify-between text-xs text-slate-500">
                                <span>Last seen: {source.date}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {exposureHistory.length > 0 && (
                    <div className="p-6 rounded-2xl bg-slate-100/50 dark:bg-slate-800/30 border border-slate-200 dark:border-white/5">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-slate-900 dark:text-white">Recent Scans</h4>
                        <button
                          onClick={clearHistory}
                          className="text-xs text-slate-500 hover:text-rose-500 flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          Clear
                        </button>
                      </div>
                      <div className="space-y-2">
                        {exposureHistory.slice(0, 5).map((item, idx) => (
                          <button
                            key={idx}
                            onClick={() => setExposureResult(item)}
                            className="w-full flex justify-between items-center p-3 rounded-lg bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 cursor-pointer transition-colors text-left"
                          >
                            <span className="text-sm font-mono text-slate-700 dark:text-slate-300">{item.query}</span>
                            <span
                              className={`text-xs font-semibold ${
                                item.risk_level === 'Critical' ? 'text-rose-500' : 'text-amber-500'
                              }`}
                            >
                              {item.risk_level} ({item.total_exposed_records} records)
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-4">
          <div className="w-48">
            <ConnectionStatus apiUrl={API_URL} />
          </div>
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3" />
            v2.2.0-stable
          </span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/Pranith-Jain/DFIR-PLATFORM"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-brand-400 transition-colors"
          >
            Documentation <ExternalLink className="w-3 h-3" />
          </a>
          <span>© 2025 DFIR-PLATFORM</span>
        </div>
      </div>
    </section>
  );
}
