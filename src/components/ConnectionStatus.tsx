import { useState, useEffect, useCallback, memo } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertCircle, Settings, X, Check, Loader2 } from 'lucide-react';

interface ConnectionStatusProps {
  apiUrl: string;
  onApiUrlChange?: (url: string) => void;
  onConnectionChange?: (connected: boolean) => void;
}

type ConnectionState = 'checking' | 'connected' | 'disconnected' | 'error';

export const ConnectionStatus = memo(function ConnectionStatus({
  apiUrl,
  onApiUrlChange,
  onConnectionChange,
}: ConnectionStatusProps) {
  const [status, setStatus] = useState<ConnectionState>(apiUrl ? 'checking' : 'disconnected');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [tempUrl, setTempUrl] = useState(apiUrl);

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

  const handleSaveUrl = () => {
    if (tempUrl === apiUrl) {
      setIsEditing(false);
      return;
    }

    if (tempUrl && !isValidUrl(tempUrl)) {
      return;
    }

    onApiUrlChange?.(tempUrl);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setTempUrl(apiUrl);
    setIsEditing(false);
  };

  const isValidUrl = (url: string): boolean => {
    if (!url) return true;
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  const startEditing = () => {
    setTempUrl(apiUrl);
    setIsEditing(true);
  };

  // Settings editing mode
  if (isEditing) {
    return (
      <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-slate-500" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">API Settings</p>
          <button
            onClick={handleCancelEdit}
            className="ml-auto p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            aria-label="Cancel"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="space-y-2">
          <label htmlFor="api-url-input" className="text-xs text-slate-500 dark:text-slate-400 block">
            Backend API URL
          </label>
          <input
            id="api-url-input"
            type="text"
            value={tempUrl}
            onChange={(e) => setTempUrl(e.target.value)}
            placeholder="https://api.example.com"
            className={`w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-slate-900 border ${
              tempUrl && !isValidUrl(tempUrl)
                ? 'border-rose-500 dark:border-rose-400'
                : 'border-slate-200 dark:border-slate-700'
            } dark:text-white focus:outline-none focus:border-brand-500 transition-colors`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveUrl();
              if (e.key === 'Escape') handleCancelEdit();
            }}
          />
          {tempUrl && !isValidUrl(tempUrl) && (
            <p className="text-xs text-rose-500 dark:text-rose-400">URL must start with http:// or https://</p>
          )}
          <div className="text-xs text-slate-400 dark:text-slate-500">Leave empty to use client-side tools only</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSaveUrl}
            disabled={tempUrl !== '' && !isValidUrl(tempUrl)}
            className="flex-1 py-2 px-3 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            Save
          </button>
          <button
            onClick={handleCancelEdit}
            className="py-2 px-3 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // No backend configured - show simple offline message
  if (!apiUrl) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <WifiOff className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          <div className="flex-1">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Client-Side Mode</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">Live feeds require backend</p>
          </div>
          <button
            onClick={startEditing}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            aria-label="Configure API URL"
          >
            <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>
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
            {lastChecked && <p className="text-xs text-emerald-700 dark:text-emerald-300">Live feeds enabled</p>}
          </div>
        </>
      )}
      {status === 'checking' && (
        <>
          <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
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
      <button
        onClick={startEditing}
        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors ml-1"
        aria-label="Configure API URL"
      >
        <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" />
      </button>
    </div>
  );
});
