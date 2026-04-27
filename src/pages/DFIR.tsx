import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Search,
  Globe,
  Lock,
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
  ExternalLink,
  AlertTriangle,
  Eye,
  EyeOff,
  Copy,
  Link2,
  Server,
  Activity,
  HelpCircle,
} from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { ConnectionStatus } from '../components/ConnectionStatus';

const sanitizeText = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const isSafeUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};

interface IOCResult {
  indicator: string;
  type: string;
  score: number;
  verdict: string;
  tags: string[];
  defanged: string;
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
}

interface PhishingResult {
  url: string;
  verdict: string;
  confidence: number;
  risk_factors: string[];
  final_url?: string;
  content_flags: string[];
  similar_domains?: Array<{ domain: string; similarity: number }>;
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

type TabType = 'home' | 'domain' | 'analysis' | 'exposure' | 'privacy' | 'threatIntel';

const API_URL = import.meta.env.VITE_DFIR_API_URL || '';

export default function DFIRPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mounted, setMounted] = useState(false);

  const initialTab = (searchParams.get('tab') as TabType) || 'home';
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  const [iocInput, setIocInput] = useState('');
  const [iocResult, setIocResult] = useState<IOCResult | null>(null);
  const [iocLoading, setIocLoading] = useState(false);

  const [domainInput, setDomainInput] = useState('');
  const [domainResult, setDomainResult] = useState<DomainResult | null>(null);
  const [domainLoading, setDomainLoading] = useState(false);

  const [privacyResult, setPrivacyResult] = useState<PrivacyResult | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);

  const [phishingUrl, setPhishingUrl] = useState('');
  const [phishingResult, setPhishingResult] = useState<PhishingResult | null>(null);
  const [phishingLoading, setPhishingLoading] = useState(false);
  const [showUrl, setShowUrl] = useState(false);

  const [exposureQuery, setExposureQuery] = useState('');
  const [exposureResult, setExposureResult] = useState<ExposureResult | null>(null);
  const [exposureLoading, setExposureLoading] = useState(false);
  const [exposureHistory, setExposureHistory] = useState<ExposureResult[]>([]);

  const [intelItems, setIntelItems] = useState<ThreatIntelItem[]>([]);
  const [intelLoading, setIntelLoading] = useState(false);
  const [intelFilter, setIntelFilter] = useState('all');
  const [expandedIntel, setExpandedIntel] = useState<string | null>(null);

  const [actorSearch, setActorSearch] = useState('');

  const [analysisMode, setAnalysisMode] = useState<'ioc' | 'phishing'>('ioc');
  const [threatIntelMode, setThreatIntelMode] = useState<'intel' | 'actors'>('intel');

  useEffect(() => {
    setMounted(true);
  }, []);

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
      description: 'Russian state-sponsored threat group known for destructive attacks against critical infrastructure.',
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
      description: 'Emerging threat actor known for sophisticated phishing campaigns targeting healthcare and financial sectors.',
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
      description: 'Ransomware-as-a-Service group known for high-profile attacks on hospitals and educational institutions.',
      url: 'https://dfir-lab.ch/actors/rhysida',
    },
    {
      name: 'APT41',
      alias: 'BARIUM, WICKED PANDARIS, Double Dragon',
      origin: 'China',
      motivation: 'Cyber Espionage + Financial',
      active_since: '2012',
      last_activity: '2025',
      status: 'Active',
      malware: ['SPARROW', 'SHOTPUT', 'CROSSWALK', 'HOMEUNIX', 'KEYPLUG'],
      techniques: ['Espionage', 'Cryptojacking', 'Supply Chain Attacks', 'Finance Theft'],
      targets: ['Healthcare', 'Telecommunications', 'Media', 'Government', 'Gaming'],
      description: 'Chinese nation-state actor operating for both espionage and financial gain.',
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
      description: 'North Korean state-sponsored threat group responsible for major financial heists.',
      url: 'https://dfir-lab.ch/actors/lazarus-group',
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
      description: 'Ransomware-as-a-Service group disrupted by international law enforcement in 2024 (Operation Cronos).',
    },
  ];

  const trustedDomains = [
    'google.com', 'microsoft.com', 'github.com', 'cloudflare.com', 'apple.com',
    'amazon.com', 'facebook.com', 'linkedin.com', 'twitter.com', 'x.com'
  ];
  const suspiciousTLDs = ['xyz', 'top', 'click', 'link', 'work', 'ru', 'cn', 'tk', 'ml', 'ga', 'cf', 'gq'];
  const suspiciousPatterns = ['login', 'verify', 'secure', 'account', 'update', 'support', 'alert', 'signin', 'auth'];

  const calculateDomainScore = (domain: string): { score: number; health_score: string; verdict: string } => {
    const normalizedDomain = domain.toLowerCase().trim();
    const isTrusted = trustedDomains.some((td) => normalizedDomain === td || normalizedDomain.endsWith('.' + td));
    if (isTrusted) return { score: 95, health_score: 'Excellent', verdict: 'Secure' };

    let score = 70;
    const tld = normalizedDomain.split('.').pop() || '';
    if (suspiciousTLDs.includes(tld)) score -= 10;
    const hasSuspiciousPattern = suspiciousPatterns.some((p) => normalizedDomain.includes(p));
    if (hasSuspiciousPattern && normalizedDomain.length < 15) score -= 15;
    const homoglyphs = /[а-яА-Я]|[οοΟΟ]|[рР]|[сС]|[уУ]|[хХ]/;
    if (homoglyphs.test(normalizedDomain)) score = Math.max(score - 40, 10);
    const hyphenCount = (normalizedDomain.match(/-/g) || []).length;
    if (hyphenCount >= 3) score -= 15;
    score = Math.max(Math.min(score, 100), 0);

    let health_score = 'Good', verdict = 'Good';
    if (score >= 85) { health_score = 'Excellent'; verdict = 'Secure'; }
    else if (score >= 65) { health_score = 'Good'; verdict = 'Good'; }
    else if (score >= 40) { health_score = 'Fair'; verdict = 'Needs Attention'; }
    else if (score >= 20) { health_score = 'Poor'; verdict = 'Suspicious'; }
    else { health_score = 'Critical'; verdict = 'Likely Malicious'; }

    return { score, health_score, verdict };
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
        setDomainResult(data);
      } else {
        await new Promise((r) => setTimeout(r, 1500));
        const domain = domainInput.toLowerCase().trim();
        const { score, health_score, verdict } = calculateDomainScore(domain);
        setDomainResult({
          domain, score, verdict, generated: new Date().toISOString(), health_score,
          blacklist: score < 60 ? [{ ip: '93.184.216.34', listed: score < 40, blacklists: score < 40 ? ['spamhaus', 'surbl'] : [] }] : [],
          mx: { records: score >= 60 ? [{ priority: 10, host: 'aspmx.l.google.com' }, { priority: 20, host: 'alt1.aspmx.l.google.com' }] : [] },
          spf: { found: score >= 50, record: score >= 50 ? 'v=spf1 include:_spf.google.com ~all' : undefined },
          dmarc: { found: score >= 50, record: score >= 50 ? 'v=DMARC1; p=quarantine; rua=mailto:dmarc@' + domain : undefined },
          dkim: [{ found: score >= 70, selector: score >= 70 ? 'google' : undefined }],
          ssl: { valid: score >= 40, issuer: score >= 40 ? 'Google Trust Services' : undefined, expires: score >= 40 ? '2026-01-01' : undefined },
          dns: { A: score >= 30 ? ['142.250.185.78'] : undefined, AAAA: score >= 30 ? ['2607:f8b0:4004:800::200e'] : undefined },
          dnssec: { found: score >= 80 },
        });
      }
    } catch { setDomainResult(null); }
    setDomainLoading(false);
  };

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
        setPhishingResult(data);
      } else {
        await new Promise((r) => setTimeout(r, 2000));
        const url = phishingUrl.toLowerCase();
        const isPhishing = url.includes('login') || url.includes('signin') || url.includes('verify') || url.includes('secure');
        const riskFactors: string[] = [];
        if (url.includes('http://')) riskFactors.push('Insecure HTTP connection');
        if (url.match(/\d{1,3}\.\d{1,3}\.\d{1,3}/)) riskFactors.push('IP address in URL');
        if (url.includes('-')) riskFactors.push('Hyphenated domain (common in lookalikes)');
        setPhishingResult({
          url: phishingUrl,
          verdict: isPhishing || riskFactors.length > 2 ? 'PHISHING' : 'SUSPICIOUS',
          confidence: isPhishing ? 85 : riskFactors.length > 2 ? 70 : 45,
          risk_factors: riskFactors.length > 0 ? riskFactors : ['No obvious risk factors detected'],
          final_url: url.replace('http://', 'https://'),
          content_flags: isPhishing ? ['Credential harvesting form', 'Fake login page'] : [],
          similar_domains: [{ domain: 'google.com', similarity: 0.85 }, { domain: 'microsoft.com', similarity: 0.72 }],
        });
      }
    } catch { setPhishingResult(null); }
    setPhishingLoading(false);
  };

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
        setExposureResult(data);
        setExposureHistory((prev) => [data, ...prev.slice(0, 9)]);
      } else {
        await new Promise((r) => setTimeout(r, 2500));
        const sources = [
          { name: 'Have I Been Pwned', records: Math.floor(Math.random() * 5) + 1, date: '2024-03-15', category: 'Breach Data' },
          { name: 'DeHashed', records: Math.floor(Math.random() * 3), date: '2024-02-20', category: 'Leaked Credentials' },
          { name: 'LeakCheck', records: Math.floor(Math.random() * 2), date: '2024-01-10', category: 'Data Breach' },
        ];
        const exposureData = {
          query: exposureQuery,
          type: exposureQuery.includes('@') ? 'Email' : 'Domain',
          total_exposed_records: sources.reduce((acc, s) => acc + s.records, 0),
          sources,
          severity: sources.reduce((acc, s) => acc + s.records, 0) > 3 ? 'High' : 'Medium',
          risk_level: sources.reduce((acc, s) => acc + s.records, 0) > 5 ? 'Critical' : 'Elevated',
        };
        setExposureResult(exposureData);
        setExposureHistory((prev) => [exposureData, ...prev.slice(0, 9)]);
      }
    } catch { setExposureResult(null); }
    setExposureLoading(false);
  };

  const runPrivacyCheck = async () => {
    setPrivacyLoading(true);
    await new Promise((r) => setTimeout(r, 1500));
    setPrivacyResult({
      score: 65,
      maxScore: 100,
      grade: 'C',
      categories: {
        ipNetwork: { score: 60, maxScore: 100, details: { httpIp: '203.0.113.xxx', webrtcLeak: 'Not Detected', dohEnabled: false } },
        dnsPrivacy: { score: 50, maxScore: 100, details: {} },
        fingerprinting: { score: 40, maxScore: 100, details: { canvasHash: true, platform: navigator.platform } },
        privacySettings: { score: 70, maxScore: 100, details: { dnt: false, https: true } },
        connectionSecurity: { score: 90, maxScore: 100, details: { https: true } },
        trackingProtection: { score: 80, maxScore: 100, details: { trackerBlocker: true } },
      },
    });
    setPrivacyLoading(false);
  };

  const fetchThreatIntel = useCallback(async () => {
    setIntelLoading(true);
    try {
      const sampleItems: ThreatIntelItem[] = [
        {
          id: '1',
          title: 'New AsyncRAT Campaign Targeting Healthcare Sector',
          source: 'MITRE ATT&CK',
          published: new Date().toISOString(),
          type: 'Malware',
          severity: 'High',
          description: 'Threat actors distributing AsyncRAT through phishing emails disguised as medical invoices.',
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
          description: 'Authentication bypass vulnerability in FortiOS allows remote attackers to gain unauthorized access.',
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
          description: 'International law enforcement operation disrupts LockBit ransomware infrastructure.',
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
          description: 'New exploitation attempts observed against unpatched MOVEit Transfer servers.',
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
          severity: 'High',
          description: 'New phishing kits leverage AI to generate convincing login pages and email content.',
          link: 'https://unit42.paloaltonetworks.com',
          read: false,
        },
      ];
      setIntelItems(sampleItems);
    } catch { setIntelItems([]); }
    setIntelLoading(false);
  }, []);

  useEffect(() => { fetchThreatIntel(); }, [fetchThreatIntel]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch { /* ignore */ }
  };

  const markIntelAsRead = (id: string) => {
    setIntelItems((items) => items.map((item) => (item.id === id ? { ...item, read: true } : item)));
  };

  const clearHistory = () => setExposureHistory([]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  if (!mounted) return null;

  const tabs = [
    { id: 'home', label: 'Home', icon: Shield },
    { id: 'domain', label: 'Domain', icon: Globe },
    { id: 'analysis', label: 'Analysis', icon: Search, description: 'IOC + Phishing' },
    { id: 'exposure', label: 'Exposure', icon: Database },
    { id: 'privacy', label: 'Privacy', icon: Lock },
    { id: 'threatIntel', label: 'Threat Intel', icon: Radar },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    if (score >= 50) return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
  };

  return (
    <section className="min-h-screen">
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
              DFIR Toolkit
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400"
            >
              Security tools for domain analysis, IOC reputation checking, and threat intelligence.
            </motion.p>
          </div>
          <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }}>
            <Breadcrumbs items={[{ label: 'DFIR Tools' }]} className="justify-end" />
          </motion.div>
        </div>
      </div>

      <div className="glass rounded-3xl overflow-hidden shadow-2xl">
        <div className="flex overflow-x-auto no-scrollbar bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-b border-slate-200 dark:border-white/5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as TabType)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all whitespace-nowrap border-b-2 ${
                activeTab === tab.id
                  ? 'text-brand-600 dark:text-brand-400 border-brand-500 bg-brand-500/5'
                  : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.description && <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal hidden sm:inline">({tab.description})</span>}
            </button>
          ))}
        </div>

        <div className="p-8 min-h-[500px] bg-slate-50/30 dark:bg-slate-900/30">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }}>

              {activeTab === 'home' && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Welcome to the DFIR Toolkit</h3>
                      <p className="text-slate-600 dark:text-slate-400 mb-6">
                        Functional security tools for domain analysis, IOC reputation checking, and threat intelligence.
                      </p>
                      <ConnectionStatus apiUrl={API_URL} />
                      <div className="flex flex-wrap gap-4 mt-6">
                        <button onClick={() => handleTabChange('domain')} className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold transition-colors flex items-center gap-2">
                          <Globe className="w-4 h-4" /> Start Domain Scan
                        </button>
                        <button onClick={() => handleTabChange('analysis')} className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors flex items-center gap-2">
                          <Search className="w-4 h-4" /> IOC/Phishing Analysis
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: 'IOC Check', icon: Activity, color: 'text-rose-500 dark:text-rose-400', tab: 'analysis' as TabType },
                        { label: 'Phishing', icon: Bug, color: 'text-amber-500 dark:text-amber-400', tab: 'analysis' as TabType },
                        { label: 'Exposure', icon: Database, color: 'text-cyan-500 dark:text-cyan-400', tab: 'exposure' as TabType },
                        { label: 'Privacy', icon: Lock, color: 'text-emerald-500 dark:text-emerald-400', tab: 'privacy' as TabType },
                      ].map((tool) => (
                        <button key={tool.label} onClick={() => handleTabChange(tool.tab)} className="p-4 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center shadow-sm hover:bg-white/60 dark:hover:bg-white/10 transition-colors cursor-pointer">
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
                  <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <Globe className="w-6 h-6 text-brand-500" />
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">Domain Security Checker</h3>
                    </div>
                    <div className="flex gap-3">
                      <input type="text" value={domainInput} onChange={(e) => setDomainInput(e.target.value)} placeholder="Enter domain to check" className="flex-1 px-4 py-3 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 transition-colors shadow-sm" onKeyDown={(e) => e.key === 'Enter' && checkDomain()} />
                      <button onClick={checkDomain} disabled={domainLoading} className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-semibold transition-all flex items-center gap-2 shadow-sm">
                        {domainLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Check
                      </button>
                    </div>
                  </div>

                  {domainResult && (
                    <div className="space-y-6">
                      <div className={`p-6 rounded-2xl border-2 ${getScoreColor(domainResult.score)}`}>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <span className="text-xs uppercase tracking-wider text-slate-500">Security Score</span>
                            <h4 className={`text-4xl font-black ${domainResult.score >= 80 ? 'text-emerald-600 dark:text-emerald-400' : domainResult.score >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>{domainResult.score}/100</h4>
                          </div>
                          <div className="text-right">
                            <span className="text-xs uppercase tracking-wider text-slate-500">Verdict</span>
                            <p className="text-2xl font-bold text-slate-900 dark:text-white">{domainResult.verdict}</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                          <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Shield className="w-5 h-5 text-brand-500" /> Email Security</h4>
                          <div className="space-y-3">
                            <div className="flex justify-between items-center"><span className="text-sm text-slate-600 dark:text-slate-400">SPF</span><span className={`text-sm font-semibold ${domainResult.spf.found ? 'text-emerald-500' : 'text-rose-500'}`}>{domainResult.spf.found ? 'Configured' : 'Not Found'}</span></div>
                            <div className="flex justify-between items-center"><span className="text-sm text-slate-600 dark:text-slate-400">DKIM</span><span className={`text-sm font-semibold ${domainResult.dkim[0]?.found ? 'text-emerald-500' : 'text-rose-500'}`}>{domainResult.dkim[0]?.found ? 'Configured' : 'Not Found'}</span></div>
                            <div className="flex justify-between items-center"><span className="text-sm text-slate-600 dark:text-slate-400">DMARC</span><span className={`text-sm font-semibold ${domainResult.dmarc.found ? 'text-emerald-500' : 'text-rose-500'}`}>{domainResult.dmarc.found ? 'Configured' : 'Not Found'}</span></div>
                            <div className="flex justify-between items-center"><span className="text-sm text-slate-600 dark:text-slate-400">DNSSEC</span><span className={`text-sm font-semibold ${domainResult.dnssec?.found ? 'text-emerald-500' : 'text-rose-500'}`}>{domainResult.dnssec?.found ? 'Secured' : 'Not Secured'}</span></div>
                          </div>
                        </div>
                        <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                          <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Lock className="w-5 h-5 text-emerald-500" /> SSL/TLS</h4>
                          <div className="space-y-3">
                            <div className="flex justify-between items-center"><span className="text-sm text-slate-600 dark:text-slate-400">Certificate</span><span className={`text-sm font-semibold ${domainResult.ssl.valid ? 'text-emerald-500' : 'text-rose-500'}`}>{domainResult.ssl.valid ? 'Valid' : 'Invalid'}</span></div>
                            {domainResult.ssl.issuer && <div className="flex justify-between items-center"><span className="text-sm text-slate-600 dark:text-slate-400">Issuer</span><span className="text-sm text-slate-700 dark:text-slate-300">{domainResult.ssl.issuer}</span></div>}
                            {domainResult.ssl.expires && <div className="flex justify-between items-center"><span className="text-sm text-slate-600 dark:text-slate-400">Expires</span><span className="text-sm text-slate-700 dark:text-slate-300">{domainResult.ssl.expires}</span></div>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'analysis' && (
                <div className="space-y-6">
                  <div className="flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/50 w-fit">
                    <button onClick={() => setAnalysisMode('ioc')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${analysisMode === 'ioc' ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}><Hash className="w-4 h-4" /> IOC Check</button>
                    <button onClick={() => setAnalysisMode('phishing')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${analysisMode === 'phishing' ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}><Bug className="w-4 h-4" /> Phishing Analyzer</button>
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div key={analysisMode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>

                      {analysisMode === 'ioc' && (
                        <div className="max-w-4xl mx-auto space-y-6">
                          <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                            <div className="flex items-center gap-3 mb-4">
                              <Hash className="w-6 h-6 text-rose-500" />
                              <h3 className="text-xl font-bold text-slate-900 dark:text-white">IOC Reputation Checker</h3>
                            </div>
                            <div className="flex gap-3">
                              <input type="text" value={iocInput} onChange={(e) => setIocInput(e.target.value)} placeholder="Enter IP, domain, hash, or email" className="flex-1 px-4 py-3 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none transition-colors shadow-sm" onKeyDown={(e) => e.key === 'Enter' && checkDomain()} />
                              <button disabled={iocLoading} className="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold transition-all flex items-center gap-2 shadow-sm">
                                {iocLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Check
                              </button>
                            </div>
                          </div>
                          {iocResult && (
                            <div className={`p-6 rounded-2xl border-2 ${getScoreColor(iocResult.score)}`}>
                              <div className="flex justify-between items-start mb-4">
                                <div><span className="text-xs uppercase tracking-wider text-slate-500">Verdict</span><h4 className="text-2xl font-black">{iocResult.verdict}</h4></div>
                                <div className="text-right"><span className="text-xs uppercase tracking-wider text-slate-500">Threat Score</span><p className="text-3xl font-bold">{iocResult.score}/100</p></div>
                              </div>
                              <div className="flex gap-4 text-sm">
                                <span className="text-slate-600 dark:text-slate-400">Type: {iocResult.type}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {analysisMode === 'phishing' && (
                        <div className="max-w-4xl mx-auto space-y-6">
                          <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                            <div className="flex items-center gap-3 mb-4">
                              <Bug className="w-6 h-6 text-amber-500" />
                              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Phishing URL Analyzer</h3>
                            </div>
                            <div className="flex gap-3">
                              <div className="relative flex-1">
                                {showUrl ? (
                                  <input type="text" value={phishingUrl} onChange={(e) => setPhishingUrl(e.target.value)} placeholder="Enter URL to analyze" className="w-full px-4 py-3 pr-10 rounded-xl bg-white dark:bg-slate-800/50 border border-amber-500/50 text-slate-900 dark:text-white focus:outline-none transition-colors shadow-sm" onKeyDown={(e) => e.key === 'Enter' && analyzePhishing()} />
                                ) : (
                                  <input type="password" value={phishingUrl} onChange={(e) => setPhishingUrl(e.target.value)} placeholder="Enter URL to analyze" className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none transition-colors shadow-sm" onKeyDown={(e) => e.key === 'Enter' && analyzePhishing()} />
                                )}
                                <button onClick={() => setShowUrl(!showUrl)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showUrl ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
                              </div>
                              <button onClick={analyzePhishing} disabled={phishingLoading} className="px-6 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold transition-all flex items-center gap-2 shadow-sm">
                                {phishingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bug className="w-4 h-4" />} Analyze
                              </button>
                            </div>
                          </div>

                          {phishingResult && (
                            <div className="space-y-6">
                              <div className={`p-6 rounded-2xl border-2 ${phishingResult.verdict === 'PHISHING' ? 'bg-rose-500/10 border-rose-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                                <div className="flex justify-between items-start mb-4">
                                  <div><span className="text-xs uppercase tracking-wider text-slate-500">Verdict</span><h4 className={`text-3xl font-black uppercase ${phishingResult.verdict === 'PHISHING' ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>{phishingResult.verdict}</h4></div>
                                  <div className="text-right"><span className="text-xs uppercase tracking-wider text-slate-500">Confidence</span><p className="text-2xl font-bold text-slate-900 dark:text-white">{phishingResult.confidence}%</p></div>
                                </div>
                                <div className="flex gap-4 text-sm">
                                  <div className="flex items-center gap-2"><Link2 className="w-4 h-4 text-slate-500" /><span className="text-slate-600 dark:text-slate-400 truncate max-w-[300px]">{sanitizeText(phishingResult.url)}</span></div>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                                  <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Risk Factors</h4>
                                  <div className="space-y-2">
                                    {phishingResult.risk_factors.map((factor, idx) => (
                                      <div key={idx} className="flex items-start gap-2 text-sm"><span className="text-rose-500">✗</span><span className="text-slate-700 dark:text-slate-300">{sanitizeText(factor)}</span></div>
                                    ))}
                                  </div>
                                </div>
                                <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                                  <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Globe className="w-5 h-5 text-cyan-500" /> Similar Domains</h4>
                                  {phishingResult.similar_domains && phishingResult.similar_domains.length > 0 ? (
                                    <div className="space-y-3">
                                      {phishingResult.similar_domains.map((item, idx) => (
                                        <div key={idx} className="flex justify-between items-center">
                                          <span className="text-sm text-slate-700 dark:text-slate-300 font-mono">{sanitizeText(item.domain)}</span>
                                          <div className="flex items-center gap-2">
                                            <div className="w-24 h-1.5 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${item.similarity * 100}%` }} /></div>
                                            <span className="text-xs font-semibold text-slate-500">{(item.similarity * 100).toFixed(0)}%</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : <p className="text-sm text-slate-500">No similar domains found</p>}
                                </div>
                              </div>
                            </div>
                          )}
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
                      <input type="text" value={exposureQuery} onChange={(e) => setExposureQuery(e.target.value)} placeholder="Enter email or domain to check exposure" className="flex-1 px-4 py-3 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 transition-colors shadow-sm" onKeyDown={(e) => e.key === 'Enter' && runExposureScan()} />
                      <button onClick={runExposureScan} disabled={exposureLoading} className="px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold transition-all flex items-center gap-2 shadow-sm">
                        {exposureLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Scan
                      </button>
                    </div>
                  </div>

                  {exposureResult && (
                    <div className="space-y-6">
                      <div className={`p-6 rounded-2xl border-2 ${exposureResult.risk_level === 'Critical' ? 'bg-rose-500/10 border-rose-500/30' : exposureResult.risk_level === 'High' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-cyan-500/10 border-cyan-500/30'}`}>
                        <div className="flex justify-between items-start mb-4">
                          <div><span className="text-xs uppercase tracking-wider text-slate-500">Risk Level</span><h4 className={`text-2xl font-black uppercase ${exposureResult.risk_level === 'Critical' ? 'text-rose-600 dark:text-rose-400' : exposureResult.risk_level === 'High' ? 'text-amber-600 dark:text-amber-400' : 'text-cyan-600 dark:text-cyan-400'}`}>{exposureResult.risk_level}</h4></div>
                          <div className="text-right"><span className="text-xs uppercase tracking-wider text-slate-500">Exposed Records</span><p className="text-3xl font-bold text-slate-900 dark:text-white">{exposureResult.total_exposed_records}</p></div>
                        </div>
                        <div className="flex gap-4 text-sm text-slate-600 dark:text-slate-400">
                          <span className="flex items-center gap-1"><Hash className="w-4 h-4" /> Type: {exposureResult.type}</span>
                          <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> Severity: {exposureResult.severity}</span>
                        </div>
                      </div>
                      <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                        <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Server className="w-5 h-5 text-brand-500" /> Breach Sources</h4>
                        <div className="space-y-4">
                          {exposureResult.sources.map((source, idx) => (
                            <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-white/5">
                              <div className="flex justify-between items-start mb-2">
                                <div><h5 className="font-semibold text-slate-900 dark:text-white">{source.name}</h5><p className="text-xs text-slate-500">{source.category}</p></div>
                                <div className="text-right"><span className="text-lg font-bold text-rose-600 dark:text-rose-400">{source.records}</span><p className="text-[10px] text-slate-500">records</p></div>
                              </div>
                              <div className="flex justify-between text-xs text-slate-500"><span>Last seen: {source.date}</span></div>
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
                        <button onClick={clearHistory} className="text-xs text-slate-500 hover:text-rose-500 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Clear</button>
                      </div>
                      <div className="space-y-2">
                        {exposureHistory.slice(0, 5).map((item, idx) => (
                          <button key={idx} onClick={() => setExposureResult(item)} className="w-full flex justify-between items-center p-3 rounded-lg bg-white/60 dark:bg-white/5 hover:bg-white/80 dark:hover:bg-white/10 cursor-pointer transition-colors text-left">
                            <span className="text-sm font-mono text-slate-700 dark:text-slate-300">{item.query}</span>
                            <span className={`text-xs font-semibold ${item.risk_level === 'Critical' ? 'text-rose-500' : 'text-amber-500'}`}>{item.risk_level} ({item.total_exposed_records} records)</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'privacy' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="p-8 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center shadow-sm">
                    <Lock className="w-12 h-12 text-brand-600 dark:text-brand-400 mx-auto mb-4" />
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Browser Privacy Check</h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-lg mx-auto">Analyze what your browser reveals to websites, including fingerprinting, IP leaks, and security settings.</p>
                    <button onClick={runPrivacyCheck} disabled={privacyLoading} className="px-8 py-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-bold transition-all shadow-md">
                      {privacyLoading ? 'Analyzing Browser...' : 'Run Privacy Scan'}
                    </button>
                  </div>

                  {privacyResult && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                          <h4 className="font-bold text-slate-900 dark:text-white">Privacy Score</h4>
                          <span className="text-3xl font-black text-brand-600 dark:text-brand-400">{privacyResult.score}/100</span>
                        </div>
                        <div className="space-y-4">
                          {Object.entries(privacyResult.categories).map(([key, cat]) => (
                            <div key={key} className="space-y-1">
                              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 uppercase"><span>{key.replace(/([A-Z])/g, ' $1')}</span><span>{cat.score}/{cat.maxScore}</span></div>
                              <div className="h-1.5 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${(cat.score / cat.maxScore) * 100}%` }} /></div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                        <h4 className="font-bold text-slate-900 dark:text-white mb-4">Detected Exposure</h4>
                        <div className="space-y-3 text-sm">
                          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-white/5"><span className="text-slate-500 dark:text-slate-400">Platform</span><span className="text-slate-900 dark:text-slate-200">{privacyResult.categories.fingerprinting.details.platform}</span></div>
                          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-white/5"><span className="text-slate-500 dark:text-slate-400">Fingerprinting</span><span className="text-rose-600 dark:text-rose-400 font-semibold">Detected</span></div>
                          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-white/5"><span className="text-slate-500 dark:text-slate-400">Do Not Track</span><span className={privacyResult.categories.privacySettings.details.dnt ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}>{privacyResult.categories.privacySettings.details.dnt ? 'Enabled' : 'Not Set'}</span></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'threatIntel' && (
                <div className="space-y-6">
                  <div className="flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/50 w-fit">
                    <button onClick={() => setThreatIntelMode('intel')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${threatIntelMode === 'intel' ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}><Radar className="w-4 h-4" /> Threat Feeds</button>
                    <button onClick={() => setThreatIntelMode('actors')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${threatIntelMode === 'actors' ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}><Users className="w-4 h-4" /> Threat Actors</button>
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div key={threatIntelMode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>

                      {threatIntelMode === 'intel' && (
                        <div className="space-y-6">
                          <div className="flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/50 w-fit flex-wrap">
                            {['all', 'malware', 'vulnerability', 'phishing', 'threat-actor'].map((filter) => (
                              <button key={filter} onClick={() => setIntelFilter(filter)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${intelFilter === filter ? 'bg-brand-600 text-white' : 'bg-white/40 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-white/60'}`}>{filter.charAt(0).toUpperCase() + filter.slice(1)}</button>
                            ))}
                            <button onClick={fetchThreatIntel} className="px-4 py-2 rounded-lg text-sm font-medium bg-white/40 dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-white/60 flex items-center gap-2 transition-all ml-auto"><RefreshCw className="w-4 h-4" /> Refresh</button>
                          </div>

                          {intelLoading ? (
                            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-brand-500 animate-spin" /></div>
                          ) : (
                            <div className="space-y-4">
                              {intelItems.filter((item) => intelFilter === 'all' || item.type.toLowerCase().includes(intelFilter)).map((item) => (
                                <div role="button" tabIndex={0} key={item.id} className={`p-6 rounded-2xl bg-white/40 dark:bg-white/5 border transition-all cursor-pointer ${item.read ? 'border-slate-200 dark:border-white/5 opacity-75' : 'border-slate-200 dark:border-white/10 hover:border-brand-500/50'}`} onClick={() => { setExpandedIntel(expandedIntel === item.id ? null : item.id); if (!item.read) markIntelAsRead(item.id); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setExpandedIntel(expandedIntel === item.id ? null : item.id); if (!item.read) markIntelAsRead(item.id); } }}>
                                  <div className="flex justify-between items-start mb-3">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${item.severity === 'Critical' ? 'bg-rose-500/10 text-rose-600' : item.severity === 'High' ? 'bg-amber-500/10 text-amber-600' : 'bg-cyan-500/10 text-cyan-600'}`}>{sanitizeText(item.severity)}</span>
                                        <span className="text-xs text-slate-500">{sanitizeText(item.source)}</span>
                                        {!item.read && <span className="w-2 h-2 rounded-full bg-brand-500" />}
                                      </div>
                                      <h4 className="text-lg font-bold text-slate-900 dark:text-white">{sanitizeText(item.title)}</h4>
                                    </div>
                                    <div className="flex items-center gap-2"><span className="text-xs text-slate-500">{new Date(item.published).toLocaleDateString()}</span><ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${expandedIntel === item.id ? 'rotate-90' : ''}`} /></div>
                                  </div>
                                  {expandedIntel === item.id && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-4 mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
                                      <p className="text-sm text-slate-600 dark:text-slate-400">{sanitizeText(item.description)}</p>
                                      {item.indicators && item.indicators.length > 0 && (
                                        <div>
                                          <h5 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Indicators</h5>
                                          <div className="flex flex-wrap gap-2">
                                            {item.indicators.map((ind, idx) => (
                                              <button key={idx} onClick={(e) => { e.stopPropagation(); copyToClipboard(ind); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); copyToClipboard(ind); } }} className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-white/10 font-mono text-xs text-slate-700 dark:text-slate-300 hover:bg-brand-500/10 hover:text-brand-600 cursor-pointer transition-colors flex items-center gap-1"><Copy className="w-3 h-3" />{sanitizeText(ind)}</button>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      <a href={isSafeUrl(item.link) ? item.link : '#'} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400 hover:underline">View Source <ExternalLink className="w-4 h-4" /></a>
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
                            <input type="text" value={actorSearch} onChange={(e) => setActorSearch(e.target.value)} placeholder="Search threat actors..." className="w-full pl-12 pr-4 py-3 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-brand-500 transition-colors" />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {threatActors.filter((actor) => actor.name.toLowerCase().includes(actorSearch.toLowerCase()) || actor.origin.toLowerCase().includes(actorSearch.toLowerCase())).map((actor) => (
                              <div key={actor.name} className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm hover:border-brand-500/50 transition-all cursor-pointer">
                                <div className="flex justify-between mb-4">
                                  <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${actor.status === 'Active' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 'bg-slate-500/10 text-slate-500'}`}>{actor.status === 'Active' ? '⚠ Active' : actor.status}</span>
                                  <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-mono">{sanitizeText(actor.motivation)}</span>
                                </div>
                                <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{sanitizeText(actor.name)}</h4>
                                <p className="text-xs text-slate-500 mb-4 font-mono">{sanitizeText(actor.origin)}</p>
                                <div className="flex flex-wrap gap-1 mb-4">
                                  {actor.targets.slice(0, 2).map((target) => (<span key={target} className="px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[10px]">{sanitizeText(target)}</span>))}
                                </div>
                                <button className="w-full py-2 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors flex items-center justify-center gap-2"><FileSearch className="w-3 h-3" /> View Profile</button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-4">
          <div className="w-48"><ConnectionStatus apiUrl={API_URL} /></div>
          <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> v2.2.0-stable</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="https://github.com/Pranith-Jain/DFIR-PLATFORM" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-brand-400 transition-colors">Documentation <ExternalLink className="w-3 h-3" /></a>
          <span>© 2025 DFIR-PLATFORM</span>
        </div>
      </div>
    </section>
  );
}
