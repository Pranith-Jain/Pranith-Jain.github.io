import { useState, useEffect, useCallback } from 'react';
import { Shield, Download, Search, RefreshCw } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { DataState } from '../../components/DataState';
import { PageMeta } from '../../components/PageMeta';

interface ActionableIoc {
  ioc_value: string;
  ioc_type: string;
  valid_until: string | null;
  source_bundle_id: string | null;
  created_at: string | null;
  seq_id: number;
}

const IOC_TYPES = ['ipv4', 'ipv6', 'domain', 'url', 'md5', 'sha1', 'sha256'] as const;
const IOC_LABELS: Record<string, string> = {
  ipv4: 'IPv4',
  ipv6: 'IPv6',
  domain: 'Domain',
  url: 'URL',
  md5: 'MD5',
  sha1: 'SHA-1',
  sha256: 'SHA-256',
};

export default function ThreatLandscapeIocs(): JSX.Element {
  const [data, setData] = useState<ActionableIoc[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iocType, setIocType] = useState<string>('');
  const [limit, setLimit] = useState('50');
  const [order, setOrder] = useState('seq_id.desc');
  const [activeTab, setActiveTab] = useState<'all' | 'type'>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (limit) params.set('limit', limit);
      if (order) params.set('order', order);

      let endpoint = '/api/v1/actionable_iocs';
      if (activeTab === 'type' && iocType) {
        endpoint = `/api/v1/iocs_${iocType}`;
      } else if (activeTab === 'type') {
        endpoint = '/api/v1/actionable_iocs';
      }

      const qs = params.toString();
      const res = await fetch(`${endpoint}${qs ? `?${qs}` : ''}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ActionableIoc[];
      setData(json);
    } catch (e) {
      console.error('handler failed:', e instanceof Error ? e.message : String(e));
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [iocType, limit, order, activeTab]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const exportAsJson = () => {
    if (!data?.length) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iocs-${iocType || 'all'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const iocTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      ipv4: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      ipv6: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
      domain: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      url: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      hash_md5: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
      hash_sha1: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
      hash_sha256: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    };
    return colors[type] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  };

  return (
    <>
      <PageMeta
        title="Actionable IOCs - Threat Landscape"
        description="Query indicators of compromise with PostgREST-style filters"
        section="threatintel"
      />
      <DataPageLayout
        backTo="/threatintel"
        backLabel="Threat Intel"
        icon={<Shield size={28} />}
        title="Actionable IOCs"
        description="PostgREST-style IOC query interface. Filter by type, validity, source. Use seq_id for incremental sync."
        headerExtra={
          <div className="flex gap-2">
            <button
              onClick={fetchData}
              className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <RefreshCw size={12} /> Refresh
            </button>
            <button
              onClick={exportAsJson}
              disabled={!data?.length}
              className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40"
            >
              <Download size={12} /> Export JSON
            </button>
          </div>
        }
      >
        {/* Tab selector */}
        <div className="mb-3 flex gap-1 border-b border-slate-200 dark:border-slate-700">
          <button
            onClick={() => {
              setActiveTab('all');
              setIocType('');
            }}
            className={`text-xs px-3 py-2 border-b-2 transition-colors ${activeTab === 'all' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            All IOCs
          </button>
          <button
            onClick={() => {
              setActiveTab('type');
            }}
            className={`text-xs px-3 py-2 border-b-2 transition-colors ${activeTab === 'type' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            By Type
          </button>
        </div>

        {/* Controls */}
        <div className="mb-4 flex flex-wrap gap-2 items-center">
          {activeTab === 'type' && (
            <select
              value={iocType}
              onChange={(e) => setIocType(e.target.value)}
              className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
            >
              <option value="">Select type...</option>
              {IOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {IOC_LABELS[t]}
                </option>
              ))}
            </select>
          )}
          <label className="text-xs font-medium">Order:</label>
          <input
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className="w-40 text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
            placeholder="seq_id.desc"
          />
          <label className="text-xs font-medium">Limit:</label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="w-20 text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
          />
          <button
            onClick={fetchData}
            className="text-xs flex items-center gap-1 px-3 py-1.5 rounded bg-brand-600 text-white hover:bg-brand-700"
          >
            <Search size={12} /> Query
          </button>
        </div>

        {/* Quick type links */}
        {activeTab === 'type' && !iocType && (
          <div className="mb-4 flex flex-wrap gap-2">
            {IOC_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setIocType(t)}
                className={`text-xs px-3 py-1.5 rounded-full border ${iocTypeColor(t)}`}
              >
                {IOC_LABELS[t]}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <DataState
          loading={loading}
          error={error}
          empty={data?.length === 0}
          onRetry={fetchData}
          emptyLabel="No IOCs match these filters."
        >
          {data && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Value</th>
                    <th className="px-3 py-2 text-left font-medium">Valid Until</th>
                    <th className="px-3 py-2 text-left font-medium">Source Bundle</th>
                    <th className="px-3 py-2 text-right font-medium">Seq ID</th>
                    <th className="px-3 py-2 text-left font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr
                      key={`${row.ioc_value}-${row.seq_id}`}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${iocTypeColor(row.ioc_type)}`}>
                          {IOC_LABELS[row.ioc_type] ?? row.ioc_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] max-w-[280px] truncate" title={row.ioc_value}>
                        {row.ioc_value}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {row.valid_until ? (
                          <span
                            className={new Date(row.valid_until) < new Date() ? 'text-rose-500' : 'text-emerald-500'}
                          >
                            {new Date(row.valid_until).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-slate-400">never</span>
                        )}
                      </td>
                      <td
                        className="px-3 py-2 font-mono text-[10px] text-slate-400 max-w-[150px] truncate"
                        title={row.source_bundle_id ?? ''}
                      >
                        {row.source_bundle_id ?? '-'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500">{row.seq_id}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {row.created_at ? new Date(row.created_at).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && (
            <p className="text-[10px] text-slate-400 mt-2">
              {data.length} IOC{data.length !== 1 ? 's' : ''}
            </p>
          )}
        </DataState>
      </DataPageLayout>
    </>
  );
}
