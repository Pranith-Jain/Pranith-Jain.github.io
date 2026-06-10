import { useEffect, useMemo, useState } from 'react';
import { Bitcoin, Search } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ClusterTabs, RANSOMWARE_TABS } from '../../components/threatintel/ClusterTabs';
import { relativeAgo as shortRel } from '../../lib/relativeTime';

/**
 * Ransom payment tracker — on-chain ransomware payments via Ransomwhere
 * (ransomwhe.re, free). Actual paid ransoms, not leak-site victim posts.
 */

interface FamilyAgg {
  family: string;
  total_usd: number;
  address_count: number;
  payment_count: number;
}
interface Overview {
  generated_at: string;
  total_usd: number;
  address_count: number;
  payment_count: number;
  family_count: number;
  families: FamilyAgg[];
}
interface FamilyAddress {
  address: string;
  blockchain: string;
  balance_usd: number;
  payment_count: number;
  last_payment: number;
}
interface FamilyDetail {
  family: string;
  total_usd: number;
  address_count: number;
  addresses: FamilyAddress[];
}

function usd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default function RansomPayments(): JSX.Element {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [openFamily, setOpenFamily] = useState<string | null>(null);
  const [famDetail, setFamDetail] = useState<Record<string, FamilyDetail | 'loading'>>({});

  useEffect(() => {
    let cancelled = false;
    fetch('/api/v1/ransomwhere')
      .then((r) => {
        if (!r.ok) throw new Error(`upstream ${r.status}`);
        return r.json() as Promise<Overview>;
      })
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const families = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return q ? data.families.filter((f) => f.family.toLowerCase().includes(q)) : data.families;
  }, [data, query]);

  const toggleFamily = async (family: string) => {
    if (openFamily === family) {
      setOpenFamily(null);
      return;
    }
    setOpenFamily(family);
    if (famDetail[family]) return;
    setFamDetail((d) => ({ ...d, [family]: 'loading' }));
    try {
      const r = await fetch(`/api/v1/ransomwhere?family=${encodeURIComponent(family)}`);
      const detail = (await r.json()) as FamilyDetail;
      setFamDetail((d) => ({ ...d, [family]: detail }));
    } catch {
      setFamDetail((d) => {
        const next = { ...d };
        delete next[family];
        return next;
      });
      setOpenFamily(null);
    }
  };

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Bitcoin size={28} />}
      title="Ransom payment tracker"
      description={
        <>
          On-chain ransomware payments — actual paid ransoms observed on the blockchain, attributed to families. Sourced
          from{' '}
          <a
            href="https://ransomwhe.re"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline"
          >
            Ransomwhere
          </a>{' '}
          (crowdsourced, free).
          {data && (
            <span className="block mt-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
              snapshot <span className="text-slate-700 dark:text-slate-300">{shortRel(data.generated_at)}</span>
            </span>
          )}
        </>
      }
      headerExtra={<ClusterTabs tabs={RANSOMWARE_TABS} ariaLabel="Ransomware intel" />}
      loading={loading}
      error={error}
      onRetry={() => window.location.reload()}
    >
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'total tracked', value: usd(data.total_usd) },
            { label: 'payments', value: data.payment_count.toLocaleString() },
            { label: 'addresses', value: data.address_count.toLocaleString() },
            { label: 'families', value: data.family_count.toLocaleString() },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4"
            >
              <div className="text-micro font-mono uppercase tracking-wider text-slate-500 mb-1">{s.label}</div>
              <div className="text-xl font-display font-bold tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter ransomware families…"
          className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded font-mono text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-400"
          aria-label="Filter families"
        />
      </div>

      {data && families.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">No families match.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {families.map((f) => {
            const open = openFamily === f.family;
            const detail = famDetail[f.family];
            return (
              <li
                key={f.family}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1"
              >
                <button
                  type="button"
                  onClick={() => void toggleFamily(f.family)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
                >
                  <span className="font-display font-semibold text-sm truncate">{f.family}</span>
                  <span className="flex items-center gap-4 shrink-0 font-mono text-meta">
                    <span className="text-rose-600 dark:text-rose-400 tabular-nums">{usd(f.total_usd)}</span>
                    <span className="text-slate-400 tabular-nums">{f.address_count} addr</span>
                    <span className="text-slate-400">{open ? '▾' : '▸'}</span>
                  </span>
                </button>
                {open && (
                  <div className="border-t border-slate-100 dark:border-slate-800 px-3 py-2">
                    {detail === 'loading' || detail === undefined ? (
                      <span className="text-meta font-mono text-slate-500">loading addresses…</span>
                    ) : detail.addresses.length === 0 ? (
                      <span className="text-meta font-mono text-slate-500">No addresses.</span>
                    ) : (
                      <ul className="space-y-1">
                        {detail.addresses.slice(0, 50).map((a) => (
                          <li key={a.address} className="flex items-center justify-between gap-3 font-mono text-mini">
                            <span className="truncate text-slate-700 dark:text-slate-300">{a.address}</span>
                            <span className="flex items-center gap-3 shrink-0 text-slate-400">
                              <span className="text-rose-600 dark:text-rose-400 tabular-nums">
                                {usd(a.balance_usd)}
                              </span>
                              <span>{a.payment_count} tx</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </DataPageLayout>
  );
}
