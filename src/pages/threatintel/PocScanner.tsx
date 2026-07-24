import { useState } from 'react';
import { Code2, ExternalLink, Search, Star, GitFork, Clock } from 'lucide-react';
import { useDataFetch } from '../../hooks/useDataFetch';
import { DataPageLayout } from '../../components/DataPageLayout';

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
}

interface PocScannerProps {
  bare?: boolean;
}

export default function PocScanner({ bare }: PocScannerProps): JSX.Element {
  const [cveId, setCveId] = useState('');
  const [submitted, setSubmitted] = useState('');

  const url = submitted ? `/api/v1/cve-poc-scan?id=${encodeURIComponent(submitted)}` : null;
  const { data, loading, error, refetch } = useDataFetch<PocScanResult>({ url, ttl: 300_000 });

  const scan = () => {
    const id = cveId.trim().toUpperCase();
    if (/^CVE-\d{4}-\d{4,7}$/.test(id)) setSubmitted(id);
  };

  const body = (
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
            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-300 dark:border-[rgb(var(--border-400))] rounded-xl font-mono text-sm"
          />
        </div>
        <button
          onClick={scan}
          disabled={!/^CVE-\d{4}-\d{4,7}$/.test(cveId.trim().toUpperCase())}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white rounded-xl text-sm font-medium flex items-center gap-1.5 transition-colors"
        >
          <Search className="h-4 w-4" />
          Scan GitHub
        </button>
      </div>

      {data && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
            <span className="font-mono font-semibold text-slate-900 dark:text-white">{data.cve_id}</span>
            <span>{data.repos.length} PoC repos found</span>
            <span className="text-xs text-slate-400">({data.total_count} total on GitHub)</span>
          </div>

          {data.repos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-[rgb(var(--border-400))] p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No PoC repositories found for {data.cve_id}
            </div>
          ) : (
            <div className="space-y-2">
              {data.repos.map((repo) => (
                <div
                  key={repo.id}
                  className="p-3 bg-white dark:bg-[rgb(var(--surface-200))] border border-slate-200 dark:border-[rgb(var(--border-400))] rounded-xl hover:border-brand-300 dark:hover:border-brand-600 transition-colors"
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
                          <span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-micro font-medium rounded border border-emerald-200 dark:border-emerald-800">
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
                  <div className="flex items-center gap-3 mt-2 text-mini text-slate-500 dark:text-slate-500">
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
    </div>
  );
  if (bare) return body;
  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Search size={28} />}
      title="CVE PoC Scanner"
      description="Search GitHub for public proof-of-concept exploit repositories for any CVE."
      loading={loading}
      error={error}
      onRetry={refetch}
      empty={!data}
      emptyMessage="Search for a CVE to find public exploit/PoC repositories on GitHub."
      emptyIcon={<Search size={32} className="mx-auto opacity-40" />}
    >
      {body}
    </DataPageLayout>
  );
}
