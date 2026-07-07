import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bitcoin, ExternalLink, Search } from 'lucide-react';
import { DataPageLayout } from '../../components/DataPageLayout';
import { ClusterTabs, RANSOMWARE_TABS } from '../../components/threatintel/ClusterTabs';

interface Wallet {
  address: string;
  blockchain: string;
  family: string;
  balance_usd: number;
  transactions: number;
  first_seen: string;
  last_seen: string;
}
interface RansomwhereResponse {
  source: string;
  source_url: string;
  dataset_url: string;
  license: string;
  generated_at: string;
  count: number;
  total: number;
  total_balance_usd: number;
  facets: {
    families: Record<string, number>;
    blockchains: Record<string, number>;
  };
  wallets: Wallet[];
  stale?: boolean;
  upstream_error?: string;
}

/** Only render http(s) links — the dataset urls come from an untrusted upstream,
 *  so never let a `javascript:`/`data:` URL reach an href. */
function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const NUM = new Intl.NumberFormat('en-US');

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

const CHAIN_TONE: Record<string, string> = {
  bitcoin: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
  ethereum: 'border-indigo-500/40 text-indigo-600 dark:text-indigo-400',
  monero: 'border-orange-500/40 text-orange-600 dark:text-orange-400',
};

function chip(active: boolean): string {
  return `text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
    active
      ? 'border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300'
      : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-muted hover:border-brand-500/40'
  }`;
}

export default function Ransomwhere(): JSX.Element {
  const [data, setData] = useState<RansomwhereResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [family, setFamily] = useState('all');
  const [chain, setChain] = useState('all');

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/api/v1/ransomwhere?limit=1000', { signal: ctrl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<RansomwhereResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: { name?: string; message?: string }) => {
        if (!cancelled && e.name !== 'AbortError') setError(e.message ?? 'unknown');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, []);

  const families = useMemo(() => Object.entries(data?.facets.families ?? {}).sort((a, b) => b[1] - a[1]), [data]);
  const blockchains = useMemo(() => Object.entries(data?.facets.blockchains ?? {}).sort((a, b) => b[1] - a[1]), [data]);

  const filtered = useMemo(() => {
    const list = data?.wallets ?? [];
    return list
      .filter((w) => (family === 'all' || w.family === family) && (chain === 'all' || w.blockchain === chain))
      .sort((a, b) => b.balance_usd - a.balance_usd);
  }, [data, family, chain]);

  const description = (
    <>
      Crowdsourced directory of cryptocurrency wallets attributed to ransomware families — on-chain balance (USD),
      transaction count, and first/last-seen. Data:{' '}
      <a
        href="https://ransomwhe.re/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-600 dark:text-brand-400 hover:underline"
      >
        Ransomwhere
      </a>{' '}
      — open data, free to cite with attribution. Pivot any address into the crypto tracer.
    </>
  );

  const headerExtra =
    data && !error ? (
      <div className="space-y-2">
        <ClusterTabs tabs={RANSOMWARE_TABS} ariaLabel="Ransomware intel" />
        {data.stale && (
          <p className="text-micro font-mono text-amber-600 dark:text-amber-400">
            ⚠ showing cached data (upstream temporarily unavailable)
          </p>
        )}
        <p className="text-micro font-mono text-slate-500">
          {NUM.format(data.total)} wallets · {USD.format(data.total_balance_usd)} tracked across {blockchains.length}{' '}
          chains
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setChain('all')} className={chip(chain === 'all')}>
            All chains
          </button>
          {blockchains.map(([name, n]) => (
            <button key={name} onClick={() => setChain(name)} className={chip(chain === name)}>
              {name} <span className="opacity-60">· {n}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFamily('all')} className={chip(family === 'all')}>
            All families <span className="opacity-60">· {data.total}</span>
          </button>
          {families.slice(0, 24).map(([name, n]) => (
            <button key={name} onClick={() => setFamily(name)} className={chip(family === name)}>
              {name} <span className="opacity-60">· {n}</span>
            </button>
          ))}
        </div>
      </div>
    ) : undefined;

  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<Bitcoin size={28} />}
      title="Ransomware crypto wallets"
      description={description}
      headerExtra={headerExtra}
      loading={loading}
      error={error}
      empty={!loading && !error && !!data && filtered.length === 0}
      emptyMessage="No wallets match the filter."
    >
      <div className="grid gap-3 lg:grid-cols-2">
        {filtered.slice(0, 600).map((w) => (
          <div
            key={`${w.address}-${w.blockchain}`}
            className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--input-200))] p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <button
                onClick={() => setFamily(w.family)}
                className="font-semibold text-sm text-slate-900 dark:text-slate-100 leading-snug text-left hover:text-brand-600 dark:hover:text-brand-400"
                title="Filter by this family"
              >
                {w.family || 'unattributed'}
              </button>
              {w.blockchain && (
                <span
                  className={`shrink-0 text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                    CHAIN_TONE[w.blockchain] ?? 'border-slate-400/40 text-slate-500'
                  }`}
                >
                  {w.blockchain}
                </span>
              )}
            </div>

            <p className="mt-2 font-mono text-xs break-all text-slate-600 dark:text-slate-300" title={w.address}>
              {w.address}
            </p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-micro font-mono text-slate-500">
              <span className="text-emerald-600 dark:text-emerald-400">{USD.format(w.balance_usd)}</span>
              <span>{NUM.format(w.transactions)} tx</span>
              {w.first_seen && <span>first {fmtDate(w.first_seen)}</span>}
              {w.last_seen && <span>last {fmtDate(w.last_seen)}</span>}
            </div>

            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-[rgb(var(--border-400))]">
              <Link
                to={`/dfir/tracer?address=${encodeURIComponent(w.address)}`}
                className="inline-flex items-center gap-1 text-micro font-mono text-brand-600 dark:text-brand-400 hover:underline"
                title="Trace this address in the crypto tracer"
              >
                <Search size={11} /> trace address →
              </Link>
            </div>
          </div>
        ))}
      </div>

      {data && (
        <p className="mt-6 text-micro font-mono text-slate-400 text-center">
          Data:{' '}
          <a
            href={safeHref(data.source_url) ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brand-600 dark:hover:text-brand-400"
          >
            {data.source}
          </a>{' '}
          — open data, free to cite with attribution ·{' '}
          <a
            href={safeHref(data.dataset_url) ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-brand-600 dark:hover:text-brand-400"
          >
            Zenodo dataset <ExternalLink size={10} className="inline align-baseline opacity-60" />
          </a>{' '}
          · {NUM.format(data.total)} wallets
        </p>
      )}
    </DataPageLayout>
  );
}
