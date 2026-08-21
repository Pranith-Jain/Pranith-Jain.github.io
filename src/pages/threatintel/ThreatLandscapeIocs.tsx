import { logCatch } from '../../lib/log';
import { useState, useEffect, useCallback } from 'react';
import { Shield, Download, Search, RefreshCw } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable';
import { DataState } from '../../components/DataState';
import { PageMeta } from '../../components/PageMeta';
import { fetchJsonCached } from '../../lib/api-client';

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
      const json = await fetchJsonCached<ActionableIoc[]>(`${endpoint}${qs ? `?${qs}` : ''}`, 30_000);
      setData(json);
    } catch (e) {
      logCatch(e);
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
      ipv4: 'bg-blue-100 text-brand-700 dark:bg-blue-900/30 dark:text-brand-300',
      ipv6: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
      domain: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      url: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      hash_md5: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
      hash_sha1: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
      hash_sha256: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    };
    return colors[type] ?? 'bg-slate-100 text-slate-700 dark:bg-[rgb(var(--surface-200))] dark:text-slate-300';
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
              type="button"
              onClick={fetchData}
              className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-500))] hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] transition-colors"
            >
              <RefreshCw size={12} /> Refresh
            </button>
            <button
              type="button"
              onClick={exportAsJson}
              disabled={!data?.length}
              className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-500))] hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))] disabled:opacity-40 transition-colors"
            >
              <Download size={12} /> Export JSON
            </button>
          </div>
        }
      >
        {/* Tab selector */}
        <div className="mb-3 flex gap-1 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
          <button
            type="button"
            onClick={() => {
              setActiveTab('all');
              setIocType('');
            }}
            className={`text-xs px-3 py-2 border-b-2 transition-colors ${activeTab === 'all' ? 'border-rose-600 text-rose-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            All IOCs
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('type');
            }}
            className={`text-xs px-3 py-2 border-b-2 transition-colors ${activeTab === 'type' ? 'border-rose-600 text-rose-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
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
              className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-500))] bg-white dark:bg-[rgb(var(--surface-200))]"
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
            className="w-40 text-xs px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-500))] bg-white dark:bg-[rgb(var(--surface-200))]"
            placeholder="seq_id.desc"
          />
          <label className="text-xs font-medium">Limit:</label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="w-20 text-xs px-2 py-1 rounded border border-slate-300 dark:border-[rgb(var(--border-500))] bg-white dark:bg-[rgb(var(--surface-200))]"
          />
          <button
            type="button"
            onClick={fetchData}
            className="text-xs flex items-center gap-1 px-3 py-1.5 rounded bg-rose-600 text-white hover:bg-rose-700 transition-colors"
          >
            <Search size={12} /> Query
          </button>
        </div>

        {/* Quick type links */}
        {activeTab === 'type' && !iocType && (
          <div className="mb-4 flex flex-wrap gap-2">
            {IOC_TYPES.map((t) => (
              <button
                type="button"
                key={t}
                role="tab"
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
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))]">
              <DataTable
                columns={
                  [
                    {
                      key: 'type',
                      header: 'Type',
                      sortValue: (row: (typeof data)[number]) => row.ioc_type,
                      render: (row) => (
                        <span className={`px-1.5 py-0.5 rounded-full text-micro ${iocTypeColor(row.ioc_type)}`}>
                          {IOC_LABELS[row.ioc_type] ?? row.ioc_type}
                        </span>
                      ),
                    },
                    {
                      key: 'value',
                      header: 'Value',
                      sortValue: (row: (typeof data)[number]) => row.ioc_value,
                      render: (row) => (
                        <span className="font-mono text-mini max-w-[280px] truncate" title={row.ioc_value}>
                          {row.ioc_value}
                        </span>
                      ),
                    },
                    {
                      key: 'validUntil',
                      header: 'Valid Until',
                      sortValue: (row: (typeof data)[number]) => row.valid_until ?? '',
                      render: (row) =>
                        row.valid_until ? (
                          <span
                            className={new Date(row.valid_until) < new Date() ? 'text-rose-500' : 'text-emerald-500'}
                          >
                            {new Date(row.valid_until).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">never</span>
                        ),
                    },
                    {
                      key: 'bundle',
                      header: 'Source Bundle',
                      render: (row) => (
                        <span
                          className="font-mono text-micro text-slate-500 dark:text-slate-400 max-w-[150px] truncate"
                          title={row.source_bundle_id ?? ''}
                        >
                          {row.source_bundle_id ?? '-'}
                        </span>
                      ),
                    },
                    {
                      key: 'seqId',
                      header: 'Seq ID',
                      align: 'right',
                      sortValue: (row: (typeof data)[number]) => row.seq_id,
                      render: (row) => <span className="font-mono text-slate-500">{row.seq_id}</span>,
                    },
                    {
                      key: 'created',
                      header: 'Created',
                      sortValue: (row: (typeof data)[number]) => row.created_at ?? '',
                      render: (row) => (
                        <span className="text-slate-500">
                          {row.created_at ? new Date(row.created_at).toLocaleDateString() : '-'}
                        </span>
                      ),
                    },
                  ] as DataTableColumn<(typeof data)[number]>[]
                }
                rows={data}
                rowKey={(row) => `${row.ioc_value}-${row.seq_id}`}
                rowClassName={() => 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}
              />
            </div>
          )}
          {data && (
            <p className="text-micro text-slate-500 dark:text-slate-400 mt-2">
              {data.length} IOC{data.length !== 1 ? 's' : ''}
            </p>
          )}
        </DataState>
      </DataPageLayout>
    </>
  );
}
