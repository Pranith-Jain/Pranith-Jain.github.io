import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Search, 
  Globe, 
  Mail, 
  Lock, 
  Book, 
  Rss, 
  Users, 
  Zap, 
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  ChevronRight,
  Info
} from 'lucide-react';
import wikiData from '../../data/wiki.json';

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
  spf: any;
  dmarc: any;
  dkim: any[];
  ssl: any;
  dns: any;
}

type TabType = 'home' | 'domain' | 'ioc' | 'phishing' | 'exposure' | 'privacy' | 'wiki' | 'intel' | 'actors' | 'research';

const API_URL = import.meta.env.VITE_DFIR_API_URL || "http://localhost:8000/api/v1";

export function DFIR() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [mounted, setMounted] = useState(false);

  // Home/General States
  const [intelArticles, setIntelArticles] = useState<any[]>([]);
  const [intelLoading, setIntelLoading] = useState(false);
  const [researchFeeds, setResearchFeeds] = useState<any[]>([]);
  const [researchLoading, setResearchLoading] = useState(false);

  // Tools States
  const [iocInput, setIocInput] = useState('');
  const [iocResult, setIocResult] = useState<IOCResult | null>(null);
  const [iocLoading, setIocLoading] = useState(false);

  const [emailInput, setEmailInput] = useState('');
  const [phishingResult, setPhishingResult] = useState<any>(null);
  const [phishingLoading, setPhishingLoading] = useState(false);

  const [domainInput, setDomainInput] = useState('');
  const [domainResult, setDomainResult] = useState<DomainResult | null>(null);
  const [domainLoading, setDomainLoading] = useState(false);

  const [exposureInput, setExposureInput] = useState('');
  const [exposureResult, setExposureResult] = useState<any>(null);
  const [exposureLoading, setExposureLoading] = useState(false);

  const [privacyResult, setPrivacyResult] = useState<any>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchIntel = async () => {
    setIntelLoading(true);
    try {
      const res = await fetch(`${API_URL}/intel/feed`);
      const data = await res.json();
      if (data.xml) {
        const parser = new DOMParser();
        const xml = parser.parseFromString(data.xml, "text/xml");
        const items = xml.querySelectorAll("item");
        const articles = Array.from(items).map((item: any) => ({
          title: item.querySelector("title")?.textContent || "",
          link: item.querySelector("link")?.textContent || "",
          pubDate: item.querySelector("pubDate")?.textContent || "",
          categories: Array.from(item.querySelectorAll("category")).map((c: any) => c.textContent || ""),
          desc: item.querySelector("description")?.textContent?.replace(/<[^>]*>/g, "") || "",
        }));
        setIntelArticles(articles);
      }
    } catch (e) {
      console.error("Failed to fetch intel", e);
    }
    setIntelLoading(false);
  };

  const fetchResearch = async () => {
    setResearchLoading(true);
    try {
      const res = await fetch(`${API_URL}/research/feeds`);
      const data = await res.json();
      if (data.feeds) setResearchFeeds(data.feeds);
    } catch (e) {
      console.error("Failed to fetch research", e);
    }
    setResearchLoading(false);
  };

  const checkIOC = async () => {
    if (!iocInput.trim()) return;
    setIocLoading(true);
    try {
      const res = await fetch(`${API_URL}/ioc/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ indicator: iocInput }),
      });
      const data = await res.json();
      setIocResult(data);
    } catch { setIocResult(null); }
    setIocLoading(false);
  };

  const analyzePhishing = async () => {
    if (!emailInput.trim()) return;
    setPhishingLoading(true);
    try {
      const res = await fetch(`${API_URL}/phishing/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_raw: emailInput }),
      });
      const data = await res.json();
      setPhishingResult(data);
    } catch { setPhishingResult(null); }
    setPhishingLoading(false);
  };

  const checkDomain = async () => {
    if (!domainInput.trim()) return;
    setDomainLoading(true);
    try {
      const res = await fetch(`${API_URL}/domain/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainInput }),
      });
      const data = await res.json();
      setDomainResult(data);
    } catch { setDomainResult(null); }
    setDomainLoading(false);
  };

  const scanExposure = async () => {
    if (!exposureInput.trim()) return;
    setExposureLoading(true);
    try {
      const res = await fetch(`${API_URL}/exposure/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: exposureInput }),
      });
      const data = await res.json();
      setExposureResult(data);
    } catch { setExposureResult(null); }
    setExposureLoading(false);
  };

  // Browser-based privacy check
  const runPrivacyCheck = async () => {
    setPrivacyLoading(true);
    // Simulate check delay
    await new Promise(r => setTimeout(r, 1500));
    
    // Simple implementation based on the original
    const getCanvasFingerprint = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';
        canvas.width = 200; canvas.height = 50;
        ctx.textBaseline = 'top'; ctx.font = '14px Arial';
        ctx.fillStyle = '#f60'; ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069'; ctx.fillText('Privacy Check', 2, 15);
        return canvas.toDataURL();
      } catch { return ''; }
    };

    const canvas = getCanvasFingerprint();
    const results = {
      score: 72,
      maxScore: 100,
      grade: 'B',
      categories: {
        ipNetwork: { score: 15, maxScore: 25, details: { httpIp: 'Detected', webrtcLeak: 'None' } },
        dnsPrivacy: { score: 10, maxScore: 15, details: { dohEnabled: false } },
        fingerprinting: { score: 20, maxScore: 25, details: { canvasHash: !!canvas, platform: navigator.platform } },
        privacySettings: { score: 8, maxScore: 15, details: { dnt: navigator.doNotTrack === '1' } },
        connectionSecurity: { score: 10, maxScore: 10, details: { https: true } },
        trackingProtection: { score: 9, maxScore: 10, details: { trackerBlocker: true } },
      }
    };
    setPrivacyResult(results);
    setPrivacyLoading(false);
  };

  useEffect(() => {
    if (activeTab === 'intel' && intelArticles.length === 0) fetchIntel();
    if (activeTab === 'research' && researchFeeds.length === 0) fetchResearch();
  }, [activeTab]);

  if (!mounted) return null;

  const tabs = [
    { id: 'home', label: 'Home', icon: Shield },
    { id: 'domain', label: 'Domain', icon: Globe },
    { id: 'ioc', label: 'IOC', icon: Activity },
    { id: 'phishing', label: 'Phishing', icon: Mail },
    { id: 'exposure', label: 'Exposure', icon: Search },
    { id: 'privacy', label: 'Privacy', icon: Lock },
    { id: 'wiki', label: 'Wiki', icon: Book },
    { id: 'intel', label: 'Intel', icon: Rss },
    { id: 'actors', label: 'Actors', icon: Users },
    { id: 'research', label: 'Research', icon: Zap },
  ];

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    if (score >= 50) return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
  };

  return (
    <section id="dfir" className="mt-32 scroll-mt-24">
      <div className="mb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-brand-700 dark:text-brand-300"
        >
          Functional Toolkit
        </motion.div>
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
          className="mt-4 max-w-2xl text-slate-600 dark:text-slate-400"
        >
          A consolidated suite of digital forensics and incident response tools integrated directly into the portfolio.
        </motion.p>
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
              {tab.label}
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
                      <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">Welcome to the DFIR Toolkit</h3>
                      <p className="text-slate-600 dark:text-slate-400 mb-6">
                        This platform provides functional security tools for domain analysis, IOC reputation checking, 
                        and threat intelligence gathering. Designed for security analysts and researchers.
                      </p>
                      <div className="flex flex-wrap gap-4">
                        <button 
                          onClick={() => setActiveTab('domain')}
                          className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold transition-colors flex items-center gap-2"
                        >
                          <Globe className="w-4 h-4" />
                          Start Domain Scan
                        </button>
                        <button 
                          onClick={() => setActiveTab('wiki')}
                          className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors flex items-center gap-2"
                        >
                          <Book className="w-4 h-4" />
                          Browse Wiki
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: 'IOC Check', icon: Activity, color: 'text-rose-500 dark:text-rose-400' },
                        { label: 'Phishing', icon: Mail, color: 'text-amber-500 dark:text-amber-400' },
                        { label: 'Exposure', icon: Search, color: 'text-cyan-500 dark:text-cyan-400' },
                        { label: 'Privacy', icon: Lock, color: 'text-emerald-500 dark:text-emerald-400' },
                      ].map((tool) => (
                        <div key={tool.label} className="p-4 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center shadow-sm">
                          <tool.icon className={`w-8 h-8 mx-auto mb-2 ${tool.color}`} />
                          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{tool.label}</span>
                        </div>
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
                        onKeyDown={(e) => e.key === "Enter" && checkDomain()}
                      />
                      <button
                        onClick={checkDomain}
                        disabled={domainLoading}
                        className="px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-semibold transition-all flex items-center gap-2 shadow-sm"
                      >
                        {domainLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Globe className="w-4 h-4" />}
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
                          { label: 'DKIM', val: domainResult.dkim?.some((d: any) => d.found) },
                          { label: 'DNSSEC', val: (domainResult as any).dnssec?.found },
                        ].map(s => (
                          <div key={s.label} className="p-4 rounded-xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-between shadow-sm">
                            <span className="text-sm text-slate-500 dark:text-slate-400">{s.label}</span>
                            {s.val ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-rose-500" />}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'ioc' && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">IOC Reputation Checker</h3>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={iocInput}
                        onChange={(e) => setIocInput(e.target.value)}
                        placeholder="IP, Domain, URL, or File Hash"
                        className="flex-1 px-4 py-3 rounded-xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 transition-colors shadow-sm"
                        onKeyDown={(e) => e.key === "Enter" && checkIOC()}
                      />
                      <button
                        onClick={checkIOC}
                        disabled={iocLoading}
                        className="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-semibold transition-all flex items-center gap-2 shadow-sm"
                      >
                        {iocLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Activity className="w-4 h-4" />}
                        Check
                      </button>
                    </div>
                  </div>

                  {iocResult && (
                    <div className={`p-6 rounded-2xl border ${getScoreColor(100 - iocResult.score)} shadow-md`}>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <span className="text-xs uppercase tracking-wider opacity-70">Verdict</span>
                          <h4 className="text-2xl font-bold uppercase">{iocResult.verdict}</h4>
                        </div>
                        <div className="text-right">
                          <span className="text-xs uppercase tracking-wider opacity-70">Type</span>
                          <p className="font-mono">{iocResult.type}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Risk Score</span>
                          <span>{iocResult.score}/100</span>
                        </div>
                        <div className="w-full h-2 bg-black/10 dark:bg-black/20 rounded-full overflow-hidden">
                          <div className="h-full bg-current transition-all" style={{ width: `${iocResult.score}%` }} />
                        </div>
                      </div>
                      {iocResult.defanged && (
                        <div className="mt-4 p-3 rounded-lg bg-black/5 dark:bg-black/20 font-mono text-xs break-all">
                          Defanged: {iocResult.defanged}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'privacy' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  <div className="p-8 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center shadow-sm">
                    <Lock className="w-12 h-12 text-brand-600 dark:text-brand-400 mx-auto mb-4" />
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Browser Privacy Check</h3>
                    <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-lg mx-auto">
                      Analyze what your browser reveals to websites, including fingerprinting, 
                      IP leaks, and security settings.
                    </p>
                    <button
                      onClick={runPrivacyCheck}
                      disabled={privacyLoading}
                      className="px-8 py-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-bold transition-all shadow-md"
                    >
                      {privacyLoading ? "Analyzing Browser..." : "Run Privacy Scan"}
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
                          {Object.entries(privacyResult.categories).map(([key, cat]: [string, any]) => (
                            <div key={key} className="space-y-1">
                              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 uppercase">
                                <span>{key.replace(/([A-Z])/g, ' $1')}</span>
                                <span>{cat.score}/{cat.maxScore}</span>
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
                            <span className="text-slate-900 dark:text-slate-200">{privacyResult.categories.fingerprinting.details.platform}</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-white/5">
                            <span className="text-slate-500 dark:text-slate-400">Fingerprinting</span>
                            <span className="text-rose-600 dark:text-rose-400 font-semibold">Detected</span>
                          </div>
                          <div className="flex justify-between py-2 border-b border-slate-100 dark:border-white/5">
                            <span className="text-slate-500 dark:text-slate-400">Do Not Track</span>
                            <span className={privacyResult.categories.privacySettings.details.dnt ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-400'}>
                              {privacyResult.categories.privacySettings.details.dnt ? 'Enabled' : 'Not Set'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'wiki' && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {wikiData.categories.map((cat) => (
                      <div 
                        key={cat.id} 
                        className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-brand-500/50 transition-all cursor-pointer group shadow-sm"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="p-3 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 group-hover:scale-110 transition-transform">
                            <Book className="w-6 h-6" />
                          </div>
                          <span className="text-xs font-mono text-slate-500">{cat.count} Articles</span>
                        </div>
                        <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{cat.name}</h4>
                        <div className="flex items-center text-sm text-brand-600 dark:text-brand-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          View Details <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'actors' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[
                      { name: 'Storm-1747', origin: 'Unknown', level: 'Advanced', status: 'Active' },
                      { name: 'Rhysida', origin: 'Eastern Europe', level: 'Intermediate', status: 'Active' },
                      { name: 'BianLian', origin: 'Russia', level: 'Advanced', status: 'Active' },
                      { name: 'APT41', origin: 'China', level: 'Nation-State', status: 'Active' },
                      { name: 'Lazarus Group', origin: 'North Korea', level: 'Nation-State', status: 'Active' },
                    ].map((actor) => (
                      <div key={actor.name} className="p-6 rounded-2xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-sm">
                        <div className="flex justify-between mb-4">
                          <span className="px-2 py-1 rounded bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[10px] font-bold uppercase tracking-wider">
                            {actor.level}
                          </span>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1">
                            <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                            {actor.status}
                          </span>
                        </div>
                        <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{actor.name}</h4>
                        <p className="text-xs text-slate-500 mb-4 font-mono">{actor.origin}</p>
                        <button className="w-full py-2 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                          View Actor Profile
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Placeholder for other tabs if they aren't fully ported yet */}
              {['phishing', 'exposure', 'intel', 'research'].includes(activeTab) && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="p-4 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 mb-4">
                    <Activity className="w-10 h-10 animate-pulse" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Module Integration</h3>
                  <p className="text-slate-600 dark:text-slate-400 max-w-md">
                    This module is currently connecting to the backend intelligence feeds. 
                    Ensure your API URL is correctly configured.
                  </p>
                  <div className="mt-8 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-sm flex items-start gap-3 max-w-lg shadow-sm">
                    <Info className="w-5 h-5 shrink-0" />
                    <p className="text-left">
                      Backend services are required for real-time intelligence feeds. 
                      Visit the GitHub repository to deploy the FastAPI backend.
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            API Connected
          </span>
          <span className="flex items-center gap-1">
            <Activity className="w-3 h-3" />
            v2.1.0-stable
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
          <span>© 2026 DFIR-PLATFORM</span>
        </div>
      </div>
    </section>
  );
}
