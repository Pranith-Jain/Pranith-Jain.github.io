import { useState } from 'react';
import { useDataFetch } from '../hooks/useDataFetch';
import { DataPageLayout } from '../components/DataPageLayout';
import { Search, Shield, Hash } from 'lucide-react';

interface AvResult {
  engine: string;
  engine_type: string;
  file_hash: string;
  verdict: 'Safe' | 'Malicious' | 'Unknown' | 'Failed';
}

interface TraceixResponse {
  success: boolean;
  hash: string;
  requestTimestamp?: number;
  avResults: AvResult[];
  error?: string;
}

const VERDICT_COLORS: Record<string, string> = {
  Safe: 'text-green-400 bg-green-950/30 border-green-800/40',
  Malicious: 'text-red-400 bg-red-950/30 border-red-800/40',
  Unknown: 'text-yellow-400 bg-yellow-950/30 border-yellow-800/40',
  Failed: 'text-slate-400 bg-slate-950/30 border-slate-700/40',
};

export default function Traceix() {
  const [hash, setHash] = useState('');
  const [submittedHash, setSubmittedHash] = useState<string | null>(null);

  const { data, loading, error } = useDataFetch<TraceixResponse>({
    url: submittedHash ? `/api/v1/traceix/lookup?hash=${submittedHash}` : null,
    ttl: 60_000,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = hash.trim();
    if (/^[0-9a-f]{64}$/i.test(trimmed)) {
      setSubmittedHash(trimmed);
    }
  };

  const maliciousCount = data?.avResults.filter((r) => r.verdict === 'Malicious').length ?? 0;
  const safeCount = data?.avResults.filter((r) => r.verdict === 'Safe').length ?? 0;

  return (
    <DataPageLayout
      backTo="/"
      backLabel="Home"
      icon={<Shield />}
      title="Traceix Hash Lookup"
      description={
        <span>
          Look up a SHA-256 file hash against{' '}
          <a href="https://traceix.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
            traceix.com
          </a>{' '}
          — antivirus/reputation results powered by{' '}
          <a href="https://perkinsfund.org" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
            Perkins Fund (PCEF)
          </a>
          .
        </span>
      }
      accentClass="text-cyan-400"
    >
      <div className="space-y-6 max-w-2xl mx-auto">
        {/* Search form */}
        <form onSubmit={handleSubmit} className="flex gap-3">
          <div className="relative flex-1">
            <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Enter a SHA-256 hash (64 hex characters)"
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-600"
            />
          </div>
          <button
            type="submit"
            disabled={!/^[0-9a-f]{64}$/i.test(hash.trim())}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Search size={14} />
            Lookup
          </button>
        </form>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12 text-slate-500">
            <div className="w-6 h-6 border-2 border-slate-600 border-t-cyan-500 rounded-full animate-spin mr-3" />
            Looking up hash...
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="bg-red-950/30 border border-red-800/40 rounded-lg p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Results */}
        {data && !loading && (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-400">{safeCount}</div>
                <div className="text-xs text-slate-500 mt-1">Safe</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-red-400">{maliciousCount}</div>
                <div className="text-xs text-slate-500 mt-1">Malicious</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-slate-300">{data.avResults.length}</div>
                <div className="text-xs text-slate-500 mt-1">Total Engines</div>
              </div>
            </div>

            {/* Engine results table */}
            {data.avResults.length > 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                        <th className="text-left px-4 py-2.5 font-semibold">Engine</th>
                        <th className="text-left px-4 py-2.5 font-semibold">Type</th>
                        <th className="text-right px-4 py-2.5 font-semibold">Verdict</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.avResults.map((r, i) => (
                        <tr key={i} className="border-b border-slate-800/50 last:border-0">
                          <td className="px-4 py-2.5 text-slate-200 font-medium">{r.engine}</td>
                          <td className="px-4 py-2.5 text-slate-400 text-xs">{r.engine_type}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded border ${VERDICT_COLORS[r.verdict] ?? VERDICT_COLORS.Unknown}`}>
                              {r.verdict}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500 text-sm">
                No AV results found for this hash.
              </div>
            )}

            {data.requestTimestamp && (
              <div className="text-center text-[10px] text-slate-600">
                Lookup timestamp: {new Date(data.requestTimestamp * 1000).toISOString()}
              </div>
            )}
          </div>
        )}

        {/* Source footer */}
        <div className="text-center pt-6 pb-2 text-xs text-slate-600 border-t border-slate-800">
          Powered by{' '}
          <a href="https://traceix.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
            traceix.com
          </a>{' '}
          — a project of{' '}
          <a href="https://perkinsfund.org" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
            Perkins Fund (PCEF)
          </a>
          , a 501(c)(3) nonprofit.<br />
          API docs at{' '}
          <a href="https://docs.perkinsfund.org/readme/traceix-endpoints/traceix.md" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
            docs.perkinsfund.org
          </a>
        </div>
      </div>
    </DataPageLayout>
  );
}
