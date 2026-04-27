import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';

interface ConnectionStatusProps {
  apiUrl: string;
  onConnectionChange?: (connected: boolean) => void;
}

type ConnectionState = 'checking' | 'connected' | 'disconnected' | 'error';

export function ConnectionStatus({ apiUrl, onConnectionChange }: ConnectionStatusProps) {
  const [status, setStatus] = useState<ConnectionState>(apiUrl ? 'checking' : 'disconnected');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);

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

  if (!apiUrl) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30">
          <WifiOff className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Offline Mode</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Client-side tools are active. Connect to the FastAPI backend for real-time feeds.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/30 border border-slate-200 dark:border-white/10">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            Available Offline Features
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: Globe, label: 'Domain Scanner' },
              { icon: Database, label: 'IOC Check' },
              { icon: FileSearch, label: 'Phishing Analyzer' },
              { icon: BookOpen, label: 'Knowledge Base' },
            ].map((feature) => (
              <div
                key={feature.label}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-white/5 text-xs text-slate-600 dark:text-slate-300"
              >
                <feature.icon className="w-3.5 h-3.5 text-emerald-500" />
                {feature.label}
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Connect Backend for Full Features
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Set{' '}
            <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 font-mono text-[10px]">
              VITE_DFIR_API_URL
            </code>{' '}
            in your environment to enable:
          </p>
          <ul className="space-y-1 text-xs text-slate-500 dark:text-slate-400 mb-4">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              Real-time RSS threat feeds
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              Enhanced threat intelligence
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              Privacy score with global threat data
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <a
              href="https://github.com/Pranith-Jain/DFIR-PLATFORM"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              View Backend
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://github.com/Pranith-Jain/DFIR-PLATFORM#setup"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors flex items-center gap-1.5"
            >
              Setup Guide
              <ExternalLink className="w-3 h-3" />
            </a>
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
}
