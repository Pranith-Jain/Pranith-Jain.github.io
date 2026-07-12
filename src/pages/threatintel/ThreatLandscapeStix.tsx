import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Download, Database, ChevronDown, ChevronUp } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { DataState } from '../../components/DataState';
import { PageMeta } from '../../components/PageMeta';
import type { AsyncState } from '../../components/AsyncState';

interface StixBundle {
  bundle_id: string;
  source_id: string;
  source_type: string;
  title: string;
  stix_published_at: string | null;
  api_created_at: string | null;
  ioc_count: number;
  actor_count: number;
  malware_count: number;
}

type FilterOp = 'eq' | 'neq' | 'gte' | 'lte' | 'cs' | 'like' | 'ilike';

interface FilterRow {
  column: string;
  op: FilterOp;
  value: string;
}

const COLUMNS = [
  { value: 'bundle_id', label: 'Bundle ID' },
  { value: 'source_type', label: 'Source Type' },
  { value: 'title', label: 'Title' },
  { value: 'threat_actors', label: 'Threat Actors' },
  { value: 'malware_names', label: 'Malware' },
  { value: 'sectors', label: 'Sectors' },
  { value: 'countries_target', label: 'Target Countries' },
  { value: 'vulnerabilities', label: 'CVEs' },
  { value: 'stix_published_at', label: 'Published' },
  { value: 'api_created_at', label: 'Ingested' },
  { value: 'ioc_count', label: 'IOC Count' },
  { value: 'actor_count', label: 'Actor Count' },
  { value: 'malware_count', label: 'Malware Count' },
];

export default function ThreatLandscapeStix(): JSX.Element {
  const [data, setData] = useState<StixBundle[] | null>(null);
  const [state, setState] = useState<AsyncState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [select, setSelect] = useState(
    'bundle_id,source_type,title,threat_actors,malware_names,sectors,stix_published_at'
  );
  const [limit, setLimit] = useState('20');
  const [order, setOrder] = useState('stix_published_at.desc');
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (select) params.set('select', select);
    if (limit) params.set('limit', limit);
    if (order) params.set('order', order);
    for (const f of filters) {
      if (f.column && f.op && f.value) {
        params.set(f.column, `${f.op}.${f.value}`);
      }
    }
    return params.toString();
  }, [select, limit, order, filters]);

  const fetchData = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const qs = buildQueryString();
      const res = await fetch(`/api/v1/stix_bundles${qs ? `?${qs}` : ''}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as StixBundle[];
      setData(json);
      setState(json.length === 0 ? 'empty' : 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setState('error');
    }
  }, [buildQueryString]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const addFilter = () => {
    setFilters([...filters, { column: 'source_type', op: 'eq', value: 'osint' }]);
  };

  const updateFilter = (i: number, field: keyof FilterRow, val: string) => {
    const next = [...filters];
    next[i] = { ...next[i]!, [field]: val };
    setFilters(next);
  };

  const removeFilter = (i: number) => {
    setFilters(filters.filter((_, idx) => idx !== i));
  };

  const exportAsJson = () => {
    if (!data?.length) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stix-bundles-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageMeta
        title="STIX Bundles - Threat Landscape"
        description="Query STIX 2.1 intelligence bundles with PostgREST-style filters"
        section="threatintel"
      />
      <DataPageLayout
        backTo="/threatintel"
        backLabel="Threat Intel"
        icon={<Database size={28} />}
        title="STIX Bundle Query"
        description="PostgREST-style query interface for STIX 2.1 intelligence bundles. Filter by threat actor, malware, sector, country, CVE, and more."
        headerExtra={
          <div className="flex gap-2">
            <button
              onClick={addFilter}
              className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              <Filter size={12} /> Add Filter
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
        {/* Controls */}
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-xs font-medium">Select:</label>
            <input
              value={select}
              onChange={(e) => setSelect(e.target.value)}
              className="flex-1 min-w-[200px] text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
              placeholder="bundle_id,source_type,title"
            />
            <label className="text-xs font-medium">Order:</label>
            <input
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              className="w-52 text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
              placeholder="stix_published_at.desc"
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

          {/* Filter builder */}
          <div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="text-xs flex items-center gap-1 text-slate-500"
            >
              {showFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Filters ({filters.length})
            </button>
            {showFilters && (
              <div className="mt-1 space-y-1">
                {filters.map((f, i) => (
                  <div key={i} className="flex flex-wrap gap-1 items-center">
                    <select
                      value={f.column}
                      onChange={(e) => updateFilter(i, 'column', e.target.value)}
                      className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                    >
                      {COLUMNS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={f.op}
                      onChange={(e) => updateFilter(i, 'op', e.target.value as FilterOp)}
                      className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                    >
                      <option value="eq">= (eq)</option>
                      <option value="neq">!= (neq)</option>
                      <option value="gte">&ge; (gte)</option>
                      <option value="lte">&le; (lte)</option>
                      <option value="cs">contains (cs)</option>
                      <option value="like">like</option>
                    </select>
                    <input
                      value={f.value}
                      onChange={(e) => updateFilter(i, 'value', e.target.value)}
                      className="text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 min-w-[200px]"
                      placeholder="Value"
                    />
                    <button
                      onClick={() => removeFilter(i)}
                      className="text-xs px-2 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        <DataState state={state} error={error} onRetry={fetchData} emptyMessage="No bundles match these filters.">
          {data && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <th className="px-3 py-2 text-left font-medium">Bundle ID</th>
                    <th className="px-3 py-2 text-left font-medium">Type</th>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">Published</th>
                    <th className="px-3 py-2 text-right font-medium">IOCs</th>
                    <th className="px-3 py-2 text-right font-medium">Actors</th>
                    <th className="px-3 py-2 text-right font-medium">Malware</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr
                      key={row.bundle_id}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td
                        className="px-3 py-2 font-mono text-[10px] text-slate-500 max-w-[200px] truncate"
                        title={row.bundle_id}
                      >
                        {row.bundle_id}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] ${row.source_type === 'darknet' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'}`}
                        >
                          {row.source_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 max-w-[300px] truncate" title={row.title}>
                        {row.title}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {row.stix_published_at ? new Date(row.stix_published_at).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{row.ioc_count}</td>
                      <td className="px-3 py-2 text-right font-mono">{row.actor_count}</td>
                      <td className="px-3 py-2 text-right font-mono">{row.malware_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data && (
            <p className="text-[10px] text-slate-400 mt-2">
              {data.length} bundle{data.length !== 1 ? 's' : ''}
            </p>
          )}
        </DataState>
      </DataPageLayout>
    </>
  );
}
