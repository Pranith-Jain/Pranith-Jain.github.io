import { useState, useEffect, useCallback, memo } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle, Info } from 'lucide-react';

interface ConnectionStatusProps {
  apiUrl: string;
  onConnectionChange?: (connected: boolean) => void;
}

type ConnectionState = 'checking' | 'connected' | 'disconnected' | 'error';

export const ConnectionStatus = memo(function ConnectionStatus({ apiUrl, onConnectionChange }: ConnectionStatusProps) {
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

  // No backend configured - show helpful offline message
  if (!apiUrl) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <WifiOff className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Client-Side Mode</p>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            <span>IOC Check (offline)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            <span>Domain Scan (offline)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            <span>Phishing Analyzer (offline)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            <span>Privacy Check (offline)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            <span>Wiki / Knowledge Base</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3 h-3 text-emerald-500" />
            <span>Threat Actors Database</span>
          </div>
          <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <Info className="w-3 h-3" />
            <span>Live Feeds (requires backend)</span>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          Set VITE_DFIR_API_URL to enable live feeds
        </p>
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
                Live feeds enabled
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
              {retryCount > 0 ? `Retry ${retryCount} failed` : 'Client-side tools still work'}
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
