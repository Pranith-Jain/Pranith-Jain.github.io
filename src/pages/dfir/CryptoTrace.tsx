import { useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeUrl } from '../../lib/sanitize-url';
import { Link, useSearchParams } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import {
  ArrowLeft,
  Coins,
  Search,
  ExternalLink,
  Loader2,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowLeftRight,
} from 'lucide-react';
import { EXPLORERS, CATEGORY_LABELS, CATEGORY_ORDER, buildLink } from '../../lib/dfir/crypto-explorers';
import { RelatedWikiArticles } from '../../components/dfir/RelatedWikiArticles';

interface RecentTx {
  hash: string;
  time?: string;
  direction?: 'in' | 'out' | 'self';
  amount?: string;
  link: string;
}

interface ChainResult {
  chain: string;
  label: string;
  symbol: string;
  balance: string;
  balance_raw: string;
  tx_count?: number;
  has_activity: boolean;
  recent_txs: RecentTx[];
  explorer_url: string;
  error?: string;
}

interface SanctionsCheck {
  listed: boolean;
  matched_in?: string;
  source: string;
  source_url: string;
}

interface ScamCheck {
  flagged: boolean;
  source: string;
  source_url: string;
  list_size?: number;
}

interface AddressContext {
  found: boolean;
  is_contract: boolean;
  is_scam: boolean;
  ens_name: string | null;
  label: string | null;
  reputation: string | null;
  source: string;
  source_url: string;
}

interface TokenTransfer {
  tx_hash: string;
  timestamp: string | null;
  direction: 'in' | 'out' | 'self';
  counterparty: string;
  counterparty_label: string | null;
  counterparty_flagged: boolean;
  token_symbol: string | null;
  token_name: string | null;
  amount: string | null;
  method: string | null;
  explorer_url: string;
}

interface TraceResponse {
  address: string;
  detected_kind: 'btc' | 'evm' | 'solana' | 'unknown';
  results: ChainResult[];
  sanctions?: SanctionsCheck;
  scam?: ScamCheck;
  context?: AddressContext;
  recent_token_transfers?: TokenTransfer[];
  generated_at: string;
}

const SAMPLES: { label: string; addr: string }[] = [
  { label: 'Vitalik (ETH)', addr: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
  { label: 'Bitfinex hack (BTC)', addr: '3FZbgi29cpjq2GjdwV8eyHuJJnkLtktZc5' },
  { label: 'Wrapped SOL', addr: 'So11111111111111111111111111111111111111112' },
];

function fmtRel(s?: string): string {
  if (!s) return '';
  const t = new Date(s).getTime();
  if (!t) return '';
  const ageSec = Math.floor((Date.now() - t) / 1000);
  if (ageSec < 60) return 'just now';
  if (ageSec < 3600) return `${Math.floor(ageSec / 60)} m ago`;
  if (ageSec < 86400) return `${Math.floor(ageSec / 3600)} h ago`;
  if (ageSec < 7 * 86400) return `${Math.floor(ageSec / 86400)} d ago`;
  return new Date(s).toISOString().slice(0, 10);
}

function shortHash(h: string, take = 8): string {
  if (!h) return '';
  if (h.length <= take * 2 + 3) return h;
  return `${h.slice(0, take)}…${h.slice(-take)}`;
}

function DirectionPill({ d }: { d?: RecentTx['direction'] }): JSX.Element | null {
  if (!d) return null;
  const cls =
    d === 'in'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : d === 'out'
        ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
        : 'border-slate-300 dark:border-slate-700 text-slate-500';
  const Icon = d === 'in' ? ArrowDown : d === 'out' ? ArrowUp : ArrowLeftRight;
  return (
    <span
      className={`inline-flex items-center gap-1 text-micro font-mono uppercase tracking-wider px-1 py-0.5 rounded border ${cls}`}
    >
      <Icon size={9} /> {d}
    </span>
  );
}

export default function CryptoTrace(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const [address, setAddress] = useState(searchParams.get('address') ?? '');
  const [data, setData] = useState<TraceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialDone = useRef(false);

  const lookup = async (override?: string) => {
    const a = (override ?? address).trim();
    if (!a) return;
    setLoading(true);
    setError(null);
    setData(null);
    if (override) setAddress(override);
    setSearchParams({ address: a }, { replace: false });
    try {
      const res = await fetch(`/api/v1/crypto-trace?address=${encodeURIComponent(a)}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as TraceResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch from URL on first mount.
  useEffect(() => {
    if (initialDone.current) return;
    const initial = searchParams.get('address');
    if (initial) {
      initialDone.current = true;
      void lookup(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const explorerLinks = useMemo(() => {
    if (!data) return [];
    if (data.detected_kind === 'btc') return [EXPLORERS.btc];
    if (data.detected_kind === 'solana') return [EXPLORERS.solana];
    if (data.detected_kind === 'evm') {
      // For EVM, show every chain we queried so the user can pivot.
      return data.results.map((r) => EXPLORERS[r.chain]).filter(Boolean);
    }
    return [];
  }, [data]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Coins size={28} className="text-brand-600 dark:text-brand-400" /> Crypto Address Tracer
        </h1>
        <p className="text-muted mb-2 leading-relaxed">
          Multi-chain inspector. Paste a Bitcoin, EVM (ETH/Polygon/BSC/Arbitrum/Optimism/Base), or Solana address —
          balance, tx count, recent transactions, and pivot links to every block-explorer / NFT marketplace / DeFi
          dashboard / scam-check service.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mb-8">
          Free public APIs only — Blockstream Esplora for BTC, public JSON-RPC for EVM, public Solana RPC. No keys, no
          signup. Cached 60 s server-side. Pairs with{' '}
          <Link to="/threatintel/scam-watch" className="text-brand-600 dark:text-brand-400 hover:underline">
            Scam Watch
          </Link>{' '}
          and{' '}
          <Link to="/dfir/dlp-scan" className="text-brand-600 dark:text-brand-400 hover:underline">
            Sensitive Data Detector
          </Link>
          .
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 mb-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void lookup();
          }}
          className="flex flex-wrap gap-2"
        >
          <div className="relative flex-1 min-w-[280px]">
            <Coins size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x… (EVM) · 1… / 3… / bc1… (BTC) · 32-44 base58 (Solana)"
              className="w-full pl-9 pr-3 py-2 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-900 dark:text-slate-100 focus:border-brand-500/60 focus:outline-none"
              aria-label="Crypto address"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !address.trim()}
            className="text-sm font-mono px-3 py-2 rounded border border-brand-500/60 bg-brand-500/15 text-brand-700 dark:text-brand-300 hover:border-brand-500 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? 'Tracing' : 'Trace'}
          </button>
        </form>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              onClick={() => setAddress(s.addr)}
              className="text-xs font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400"
            >
              {s.label}
            </button>
          ))}
        </div>
        {error && (
          <p
            role="alert"
            className="mt-2 text-xs font-mono text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5"
          >
            <AlertTriangle size={12} /> {error}
          </p>
        )}
      </section>

      {data && data.detected_kind === 'unknown' && (
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-6 text-sm font-mono text-amber-700 dark:text-amber-300 inline-flex items-center gap-2">
          <AlertTriangle size={14} /> Could not detect chain from this address shape. Supported: BTC (1…/3…/bc1…), EVM
          (0x + 40 hex), Solana (base58 32–44 chars).
        </section>
      )}

      {data && data.detected_kind !== 'unknown' && (
        <>
          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 mb-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
              <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono">
                Address inspected
              </h2>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-300">
                  {data.detected_kind}
                </span>
                {data.context?.found && (
                  <span
                    className={`text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                      data.context.is_contract
                        ? 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300'
                        : 'border-slate-300 dark:border-slate-700 text-muted'
                    }`}
                  >
                    {data.context.is_contract ? 'contract' : 'EOA'}
                  </span>
                )}
                {data.context?.is_scam && (
                  <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300">
                    blockscout: scam
                  </span>
                )}
              </div>
            </div>
            {(data.context?.ens_name || data.context?.label) && (
              <div className="flex flex-wrap items-center gap-2 mb-2 text-sm font-mono">
                {data.context?.ens_name && (
                  <span className="text-brand-700 dark:text-brand-300 font-semibold">{data.context.ens_name}</span>
                )}
                {data.context?.label && (
                  <span className="px-1.5 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 text-xs">
                    {data.context.label}
                  </span>
                )}
              </div>
            )}
            <code className="block font-mono text-sm text-slate-900 dark:text-slate-100 break-all bg-slate-50 dark:bg-slate-950 rounded border border-slate-200 dark:border-slate-800 p-2">
              {data.address}
            </code>
            {data.context?.found && (
              <p className="text-micro font-mono text-slate-500 dark:text-slate-400 mt-2">
                Enrichment via{' '}
                <a
                  href={sanitizeUrl(data.context.source_url) || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  Blockscout
                </a>
                {data.context.reputation && <> · reputation: {data.context.reputation}</>}
              </p>
            )}
          </section>

          {/* OFAC sanctions verdict */}
          {data.sanctions &&
            (data.sanctions.listed ? (
              <section className="rounded-lg border-2 border-rose-500/60 bg-rose-500/10 p-4 mb-6">
                <div className="flex items-baseline gap-2 mb-2">
                  <AlertTriangle size={16} className="text-rose-700 dark:text-rose-300" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300 font-mono">
                    OFAC SDN listed
                  </h2>
                </div>
                <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mb-2">
                  This address appears on the U.S. Treasury Office of Foreign Assets Control Specially Designated
                  Nationals list (matched in <strong>{data.sanctions.matched_in}</strong> currency feed). Transacting
                  with sanctioned addresses can constitute a U.S. sanctions violation regardless of intent.
                </p>
                <a
                  href={sanitizeUrl(data.sanctions.source_url) || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-mini font-mono text-rose-700 dark:text-rose-300 hover:underline inline-flex items-center gap-1"
                >
                  source: {data.sanctions.source} <ExternalLink size={10} />
                </a>
              </section>
            ) : (
              data.detected_kind !== 'solana' && (
                <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 mb-6 text-xs font-mono text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-2 w-full">
                  <span className="inline-flex items-center gap-1">
                    ✓ Not listed in the OFAC SDN sanctioned-address feed.
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 ml-auto">
                    (per{' '}
                    <a
                      href={sanitizeUrl(data.sanctions.source_url) || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      0xB10C/ofac-sanctioned-digital-currency-addresses
                    </a>
                    , refreshed daily)
                  </span>
                </section>
              )
            ))}

          {/* ScamSniffer phishing / wallet-drainer verdict (EVM-only) */}
          {data.scam &&
            data.detected_kind === 'evm' &&
            (data.scam.flagged ? (
              <section className="rounded-lg border-2 border-amber-500/60 bg-amber-500/10 p-4 mb-6">
                <div className="flex items-baseline gap-2 mb-2">
                  <AlertTriangle size={16} className="text-amber-700 dark:text-amber-300" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300 font-mono">
                    Flagged by ScamSniffer
                  </h2>
                </div>
                <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mb-2">
                  This address has been observed in phishing kits, wallet drainers, fake-airdrop sites, or malicious
                  contracts tracked by ScamSniffer's crawler. Funds sent here are commonly lost. Treat any signing
                  request involving this address as hostile.
                </p>
                <a
                  href={sanitizeUrl(data.scam.source_url) || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-mini font-mono text-amber-700 dark:text-amber-300 hover:underline inline-flex items-center gap-1"
                >
                  source: {data.scam.source} <ExternalLink size={10} />
                </a>
              </section>
            ) : (
              <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 mb-6 text-xs font-mono text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-2 w-full">
                <span className="inline-flex items-center gap-1">
                  ✓ Not flagged in the ScamSniffer phishing / wallet-drainer database
                  {typeof data.scam.list_size === 'number' && (
                    <> ({data.scam.list_size.toLocaleString()} addresses tracked)</>
                  )}
                  .
                </span>
                <span className="text-slate-500 dark:text-slate-400 ml-auto">
                  (per{' '}
                  <a
                    href={sanitizeUrl(data.scam.source_url) || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    scamsniffer/scam-database
                  </a>
                  )
                </span>
              </section>
            ))}

          <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 mb-6">
            <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3">
              Per-chain balance & activity
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.results.map((r) => (
                <div
                  key={r.chain}
                  className={`rounded border p-3 ${
                    r.error
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : r.has_activity
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
                      {r.label}
                    </span>
                    <span className="text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {r.symbol}
                    </span>
                  </div>
                  {r.error ? (
                    <p className="text-meta font-mono text-amber-700 dark:text-amber-300">{r.error}</p>
                  ) : (
                    <>
                      <div className="text-base font-mono font-bold text-slate-900 dark:text-slate-100 break-words">
                        {r.balance}
                      </div>
                      {typeof r.tx_count === 'number' && (
                        <div className="text-mini font-mono text-slate-500 dark:text-slate-400">
                          {r.tx_count} tx{r.tx_count === 1 ? '' : 's'}
                        </div>
                      )}
                      <a
                        href={r.explorer_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-mini font-mono text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        explorer <ExternalLink size={10} />
                      </a>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          {data.recent_token_transfers && data.recent_token_transfers.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 mb-6">
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono">
                  Recent ERC-20 transfers (Ethereum)
                </h2>
                {data.recent_token_transfers.some((t) => t.counterparty_flagged) && (
                  <span className="text-micro font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 inline-flex items-center gap-1">
                    <AlertTriangle size={10} /> drainer interaction
                  </span>
                )}
              </div>
              <ul className="space-y-1.5">
                {data.recent_token_transfers.map((t, i) => (
                  <li
                    key={`${t.tx_hash}-${i}`}
                    className={`text-meta font-mono flex flex-wrap items-baseline gap-2 border rounded p-2 ${
                      t.counterparty_flagged
                        ? 'border-rose-500/40 bg-rose-500/5'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950'
                    }`}
                  >
                    <DirectionPill d={t.direction} />
                    {t.amount && <span className="text-slate-900 dark:text-slate-100 font-bold">{t.amount}</span>}
                    <span className="text-slate-500 dark:text-slate-400">
                      {t.direction === 'out' ? '→' : t.direction === 'in' ? '←' : '↔'}
                    </span>
                    <span
                      className={`break-all ${
                        t.counterparty_flagged
                          ? 'text-rose-700 dark:text-rose-300 font-semibold'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {t.counterparty_label ?? shortHash(t.counterparty, 6)}
                    </span>
                    {t.counterparty_flagged && (
                      <span className="text-micro uppercase tracking-wider px-1 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40">
                        scamsniffer
                      </span>
                    )}
                    {t.method && (
                      <span className="text-micro uppercase tracking-wider text-violet-600 dark:text-violet-400">
                        {t.method}
                      </span>
                    )}
                    {t.timestamp && <span className="text-slate-500 dark:text-slate-400">{fmtRel(t.timestamp)}</span>}
                    <a
                      href={t.explorer_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
                    >
                      tx <ExternalLink size={10} />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="text-micro font-mono text-slate-500 dark:text-slate-400 mt-2">
                Source:{' '}
                <a
                  href={`https://eth.blockscout.com/address/${data.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  Blockscout
                </a>{' '}
                · counterparties cross-referenced against ScamSniffer drainer/phishing list. Ethereum mainnet only —
                other chains' Blockscout instances are not yet wired in.
              </p>
            </section>
          )}

          {data.results.some((r) => r.recent_txs.length > 0) && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 mb-6">
              <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3">
                Recent transactions
              </h2>
              {data.results
                .filter((r) => r.recent_txs.length > 0)
                .map((r) => (
                  <div key={r.chain} className="mb-3 last:mb-0">
                    <h3 className="text-mini font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1.5">
                      {r.label}
                    </h3>
                    <ul className="space-y-1">
                      {r.recent_txs.map((tx) => (
                        <li
                          key={tx.hash}
                          className="text-meta font-mono flex flex-wrap items-baseline gap-2 border-b border-slate-200 dark:border-slate-800 pb-1.5 last:border-0"
                        >
                          <DirectionPill d={tx.direction} />
                          {tx.amount && (
                            <span className="text-slate-700 dark:text-slate-300 font-bold">{tx.amount}</span>
                          )}
                          {tx.time && <span className="text-slate-500 dark:text-slate-400">{fmtRel(tx.time)}</span>}
                          <a
                            href={sanitizeUrl(tx.link) || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1 break-all"
                          >
                            {shortHash(tx.hash)} <ExternalLink size={10} />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              <p className="text-mini font-mono text-slate-500 dark:text-slate-400 mt-2">
                EVM chains aren't shown above — public JSON-RPC nodes don't expose tx history cheaply. Click any
                explorer link below for the full picture.
              </p>
            </section>
          )}

          {explorerLinks.length > 0 && (
            <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4 mb-6">
              <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3">
                Pivot links
              </h2>
              <p className="text-mini font-mono text-slate-500 dark:text-slate-400 mb-3">
                One-click handoff to every major explorer, NFT marketplace, DeFi dashboard, and scam-flag service for
                this address.
              </p>
              {explorerLinks.map((set) => {
                const grouped = CATEGORY_ORDER.map((cat) => ({
                  cat,
                  links: set.links.filter((l) => l.category === cat),
                })).filter((g) => g.links.length > 0);
                return (
                  <div key={set.chain} className="mb-4 last:mb-0">
                    <h3 className="text-xs font-display font-semibold text-slate-900 dark:text-slate-100 mb-2">
                      {set.label}
                    </h3>
                    {grouped.map((g) => (
                      <div key={g.cat} className="mb-2 last:mb-0">
                        <span className="text-micro font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mr-2">
                          {CATEGORY_LABELS[g.cat]}
                        </span>
                        <span className="inline-flex flex-wrap gap-1.5 align-middle">
                          {g.links.map((l) => (
                            <a
                              key={`${set.chain}-${l.label}`}
                              href={buildLink(l.url, data.address)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-mini font-mono px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-500/40 hover:text-brand-600 dark:hover:text-brand-400 inline-flex items-center gap-1"
                            >
                              {l.label} <ExternalLink size={10} />
                            </a>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </section>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <section className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm font-mono text-slate-500 dark:text-slate-400">
          Paste an address above, or pick a sample to try.
        </section>
      )}

      <section className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-e1 p-4">
        <h2 className="text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-mono mb-3">
          Notes & references
        </h2>
        <ul className="space-y-1.5 text-sm font-mono text-muted list-disc pl-5">
          <li>
            EVM addresses are checked across <strong>6 chains</strong> in parallel. An address that doesn't exist on a
            chain still returns a "0 balance, 0 tx" result — that's normal.
          </li>
          <li>
            Recent-transaction list is shallow on EVM (public RPC doesn't expose log history without indexing). Use the
            Etherscan / Bscscan / Polygonscan link for the full feed.
          </li>
          <li>
            <strong>OFAC SDN search</strong> is a manual link to the U.S. Treasury sanctions list.{' '}
            <strong>Chainabuse</strong> aggregates community-reported scam addresses. <strong>Revoke.cash</strong> shows
            which contracts the address has approved (and lets the owner revoke them).
          </li>
          <li>
            For NFTs, the cards link directly to OpenSea / Blur / LooksRare (EVM) and Magic Eden / Tensor (Solana)
            profiles for the address.
          </li>
        </ul>
      </section>
      <RelatedWikiArticles />
    </div>
  );
}
