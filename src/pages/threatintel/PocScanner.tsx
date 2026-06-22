import { useState } from 'react';
import { Code2, ExternalLink, RefreshCw, Search, Star, GitFork, Clock, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api-client';

interface PocRepo {
  id: number;
  name: string;
  full_name: string;
  url: string;
  description: string | null;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
  owner: string;
  created_at: string;
  updated_at: string;
  age_days: number;
  has_code: boolean;
}

interface PocScanResult {
  cve_id: string;
  total_count: number;
  repos: PocRepo[];
  fetched_at: string;
  error?: string;
}

export default function PocScanner(): JSX.Element {
  const [cveId, setCveId] = useState('');
  const [result, setResult] = useState<PocScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = async () => {
    const id = cveId.trim().toUpperCase();
    if (!id || !/^CVE-\d{4}-\d{4,7}$/.test(id)) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<PocScanResult>(`/api/v1/cve-poc-scan?id=${encodeURIComponent(id)}`, {
        timeoutMs: 20000,
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="CVE-2024-3094"
            value={cveId}
            onChange={(e) => setCveId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && scan()}
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-300 dark:border-[rgb(var(--border-400))] rounded font-mono text-sm"
          />
        </div>
        <button
          onClick={scan}
          disabled={loading || !/^CVE-\d{4}-\d{4,7}$/.test(cveId.trim().toUpperCase())}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded text-sm font-medium flex items-center gap-1.5"
        >
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Scan GitHub
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
            <span className="font-mono font-semibold text-slate-900 dark:text-white">{result.cve_id}</span>
            <span>{result.repos.length} PoC repos found</span>
            <span className="text-xs">({result.total_count} total on GitHub)</span>
          </div>

          {result.repos.length === 0 ? (
            <div className="p-6 text-center text-slate-500 dark:text-slate-400 text-sm">
              No PoC repositories found for {result.cve_id}
            </div>
          ) : (
            <div className="space-y-2">
              {result.repos.map((repo) => (
                <div
                  key={repo.id}
                  className="p-3 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded hover:border-brand-300 dark:hover:border-brand-600 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <a
                          href={repo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                        >
                          {repo.full_name}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        {repo.has_code && (
                          <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[10px] font-medium rounded">
                            HAS CODE
                          </span>
                        )}
                      </div>
                      {repo.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                          {repo.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                      <span className="flex items-center gap-1">
                        <Star className="h-3.5 w-3.5" />
                        {repo.stars}
                      </span>
                      <span className="flex items-center gap-1">
                        <GitFork className="h-3.5 w-3.5" />
                        {repo.forks}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500 dark:text-slate-500">
                    {repo.language && (
                      <span className="flex items-center gap-1">
                        <Code2 className="h-3 w-3" />
                        {repo.language}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {repo.age_days}d old
                    </span>
                    {repo.topics.length > 0 && <span className="truncate">{repo.topics.slice(0, 3).join(', ')}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!result && !loading && !error && (
        <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-sm">
          Search for a CVE to find public exploit/PoC repositories on GitHub.
        </div>
      )}
    </div>
  );
}
