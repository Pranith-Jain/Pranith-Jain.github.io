import { useState, useEffect, useCallback, memo } from 'react';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Database,
  FileSearch,
  Shield,
  BookOpen,
  Lock,
  Globe,
  Server,
  Activity,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Info,
} from 'lucide-react';
import { defaultFeeds } from '../data/rssFeeds';

interface ConnectionStatusProps {
  apiUrl: string;
  onConnectionChange?: (connected: boolean) => void;
}

type ConnectionState = 'checking' | 'connected' | 'disconnected' | 'error';

interface OfflineFeature {
  icon: typeof Globe;
  label: string;
  description: string;
  available: boolean;
}

interface OfflineGuide {
  step: number;
  title: string;
  description: string;
  code?: string;
}

const offlineFeatures: OfflineFeature[] = [
  {
    icon: Globe,
    label: 'Domain Scanner',
    description: 'Analyze domain reputation, WHOIS, DNS records, and SSL certificates',
    available: true,
  },
  {
    icon: Activity,
    label: 'IOC Checker',
    description: 'Check IP addresses, domains, URLs, and file hashes against threat patterns',
    available: true,
  },
  {
    icon: FileSearch,
    label: 'Phishing Analyzer',
    description: 'Detect phishing URLs, suspicious patterns, and similar domains',
    available: true,
  },
  {
    icon: Lock,
    label: 'Privacy Browser Check',
    description: 'Analyze browser fingerprinting, IP leaks, and privacy settings',
    available: true,
  },
  {
    icon: Database,
    label: 'Exposure Scanner',
    description: 'Check if your email/domain appears in known data breaches',
    available: true,
  },
  {
    icon: BookOpen,
    label: 'Knowledge Base',
    description: 'Access security research papers and MITRE ATT&CK techniques',
    available: true,
  },
];

const backendFeatures: OfflineFeature[] = [
  {
    icon: Server,
    label: 'Real-time RSS Feeds',
    description: 'Aggregated threat intelligence from 40+ security sources',
    available: false,
  },
  {
    icon: Shield,
    label: 'Enhanced Threat Intel',
    description: 'Deep analysis with VirusTotal, AlienVault OTX, and more',
    available: false,
  },
  {
    icon: Activity,
    label: 'API Rate Limits',
    description: 'Higher limits for IOC lookups and threat intelligence queries',
    available: false,
  },
];

const setupGuide: OfflineGuide[] = [
  {
    step: 1,
    title: 'Clone the Backend',
    description: 'Clone the DFIR-PLATFORM FastAPI backend repository',
    code: 'git clone https://github.com/Pranith-Jain/DFIR-PLATFORM.git',
  },
  {
    step: 2,
    title: 'Install Dependencies',
    description: 'Install Python dependencies using pip or poetry',
    code: 'cd DFIR-PLATFORM && pip install -r requirements.txt',
  },
  {
    step: 3,
    title: 'Configure Environment',
    description: 'Copy the example environment file and configure API keys',
    code: 'cp .env.example .env',
  },
  {
    step: 4,
    title: 'Start the Server',
    description: 'Run the FastAPI development server',
    code: 'uvicorn main:app --reload',
  },
  {
    step: 5,
    title: 'Connect Frontend',
    description: 'Set the VITE_DFIR_API_URL environment variable in your frontend',
    code: 'VITE_DFIR_API_URL=http://localhost:8000',
  },
];

export const ConnectionStatus = memo(function ConnectionStatus({ apiUrl, onConnectionChange }: ConnectionStatusProps) {
  const [status, setStatus] = useState<ConnectionState>(apiUrl ? 'checking' : 'disconnected');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['offline-features']));

  const checkConnection = useCallback(async () => {
    if (!apiUrl) {
      setStatus('disconnected');
      onConnectionChange?.(false);
      return;
    }

    setStatus('checking');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${apiUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        setStatus('connected');
        setLastChecked(new Date());
        setRetryCount(0);
        onConnectionChange?.(true);
      } else {
        setStatus('disconnected');
        onConnectionChange?.(false);
      }
    } catch {
      setStatus('disconnected');
      onConnectionChange?.(false);
    }
  }, [apiUrl, onConnectionChange]);

  useEffect(() => {
    if (apiUrl) {
      checkConnection();
      const interval = setInterval(checkConnection, 30000);
      return () => clearInterval(interval);
    } else {
      setStatus('disconnected');
    }
  }, [apiUrl, checkConnection]);

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
    checkConnection();
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  if (!apiUrl) {
    return (
      <div className="space-y-4">
        {/* Offline Mode Banner */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30">
          <div className="shrink-0">
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
              <WifiOff className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Running in Offline Mode</p>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200">
                Client-Side
              </span>
            </div>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              All security analysis tools are fully functional. Connect to the backend for real-time RSS feeds and
              enhanced threat intelligence.
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{offlineFeatures.length}</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Tools Available
            </div>
          </div>
          <div className="p-3 rounded-xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center">
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{backendFeatures.length}</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Backend Only</div>
          </div>
          <div className="p-3 rounded-xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-center">
            <div className="text-2xl font-bold text-brand-600 dark:text-brand-400">{defaultFeeds.length}+</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">RSS Sources</div>
          </div>
        </div>

        {/* Expandable Sections */}
        <div className="space-y-2">
          {/* Offline Features */}
          <div className="rounded-xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 overflow-hidden">
            <button
              onClick={() => toggleSection('offline-features')}
              className="w-full flex items-center justify-between p-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              aria-expanded={expandedSections.has('offline-features')}
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Available Offline Features
                </span>
              </div>
              {expandedSections.has('offline-features') ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>
            {expandedSections.has('offline-features') && (
              <div className="px-4 pb-4 space-y-2">
                {offlineFeatures.map((feature) => (
                  <div
                    key={feature.label}
                    className="flex items-start gap-3 p-3 rounded-lg bg-white/50 dark:bg-white/5"
                  >
                    <feature.icon className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{feature.label}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{feature.description}</div>
                    </div>
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-1" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Backend Features */}
          <div className="rounded-xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 overflow-hidden">
            <button
              onClick={() => toggleSection('backend-features')}
              className="w-full flex items-center justify-between p-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              aria-expanded={expandedSections.has('backend-features')}
            >
              <div className="flex items-center gap-3">
                <Server className="w-5 h-5 text-slate-400" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Requires Backend Connection
                </span>
              </div>
              {expandedSections.has('backend-features') ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>
            {expandedSections.has('backend-features') && (
              <div className="px-4 pb-4 space-y-2">
                {backendFeatures.map((feature) => (
                  <div
                    key={feature.label}
                    className="flex items-start gap-3 p-3 rounded-lg bg-white/50 dark:bg-white/5"
                  >
                    <feature.icon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{feature.label}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{feature.description}</div>
                    </div>
                    <XCircle className="w-3 h-3 text-slate-400 shrink-0 mt-1" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Setup Guide */}
          <div className="rounded-xl bg-white/40 dark:bg-white/5 border border-slate-200 dark:border-white/10 overflow-hidden">
            <button
              onClick={() => toggleSection('setup-guide')}
              className="w-full flex items-center justify-between p-4 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              aria-expanded={expandedSections.has('setup-guide')}
            >
              <div className="flex items-center gap-3">
                <Info className="w-5 h-5 text-brand-500" />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Quick Setup Guide</span>
              </div>
              {expandedSections.has('setup-guide') ? (
                <ChevronUp className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>
            {expandedSections.has('setup-guide') && (
              <div className="px-4 pb-4 space-y-3">
                {setupGuide.map((step) => (
                  <div key={step.step} className="flex gap-3">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 text-xs font-bold flex items-center justify-center">
                      {step.step}
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{step.title}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{step.description}</div>
                      {step.code && (
                        <code className="block mt-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-300 overflow-x-auto">
                          {step.code}
                        </code>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 pt-2">
                  <a
                    href="https://github.com/Pranith-Jain/DFIR-PLATFORM"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                  >
                    View Backend <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href="https://github.com/Pranith-Jain/DFIR-PLATFORM#setup"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors flex items-center gap-1.5"
                  >
                    Documentation <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
        status === 'connected'
          ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30'
          : status === 'checking'
            ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30'
            : 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/30'
      }`}
    >
      {status === 'connected' && (
        <>
          <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Backend Connected</p>
            {lastChecked && (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Last checked: {lastChecked.toLocaleTimeString()}
              </p>
            )}
          </div>
        </>
      )}
      {status === 'checking' && (
        <>
          <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Checking connection...</p>
        </>
      )}
      {status === 'disconnected' && (
        <>
          <WifiOff className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-rose-800 dark:text-rose-200">Backend unreachable</p>
            <p className="text-xs text-rose-700 dark:text-rose-300">
              {retryCount > 0 ? `Retry ${retryCount} failed` : 'Unable to connect to API'}
            </p>
          </div>
          <button
            onClick={handleRetry}
            className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors"
            aria-label="Retry connection"
          >
            <RefreshCw className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </button>
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-rose-800 dark:text-rose-200">Connection error</p>
            <p className="text-xs text-rose-700 dark:text-rose-300">Check API URL configuration</p>
          </div>
        </>
      )}
    </div>
  );
});

// Default feeds for quick stats display
const defaultFeeds = ['cisa-current', 'sans-isc', 'threatpost', 'krebsonsecurity'];
