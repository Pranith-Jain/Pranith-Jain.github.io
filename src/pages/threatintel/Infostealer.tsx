import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Copy, KeyRound, Send, ShoppingCart } from 'lucide-react';

/**
 * Infostealer live tracker. Three independent live sources composed on one
 * page (no new backend beyond the rl proxy alias):
 *   1. ransomware.live PRO /victims/recent — HudsonRock infostealer
 *      enrichment (authenticated proxy at /api/v1/rl/infostealer).
 *   2. AF datamarkets — demonforums ULP / cloud-log market threads
 *      (via the existing /api/v1/cyber-crime aggregate).
 *   3. deepdarkCTI "Infostealer Telegram" channel directory
 *      (via the existing /api/v1/deepdarkcti aggregate).
 *
 * Shapes from the PRO API are undocumented, so the HudsonRock tab renders
 * defensively (known fields + raw JSON fallback).
 */

type TabId = 'hudsonrock' | 'markets' | 'telegram';

const TABS: Array<{ id: TabId; label: string; icon: typeof KeyRound; blurb: string }> = [
  {
    id: 'hudsonrock',
    label: 'HudsonRock (PRO)',
    icon: KeyRound,
    blurb: 'ransomware.live PRO — recent victims carrying HudsonRock infostealer exposure.',
  },
  {
    id: 'markets',
    label: 'Log markets',
    icon: ShoppingCart,
    blurb: 'Live demonforums ULP / cloud-log market threads (Andrea Fortuna datamarkets feed).',
  },
  {
    id: 'telegram',
    label: 'Telegram channels',
    icon: Send,
    blurb: 'deepdarkCTI directory of channels actively trading infostealer logs.',
  },
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function str(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

interface MarketItem {
  title: string;
  url: string;
  source: string;
  published?: string;
  description?: string;
}
interface TelegramItem {
  name: string;
  url: string;
  status: string;
  notes?: string;
}

function RawJson({ value }: { value: unknown }) {
  return (
    <pre className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3 overflow-auto font-mono text-[11px] text-slate-700 dark:text-slate-300 max-h-[55vh]">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function Infostealer(): JSX.Element {
  const [tab, setTab] = useState<TabId>('markets');
  const [hr, setHr] = useState<unknown>(null);
  const [hrErr, setHrErr] = useState<string | null>(null);
  const [markets, setMarkets] = useState<MarketItem[] | null>(null);
  const [tg, setTg] = useState<TelegramItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.allSettled([
      fetch('/api/v1/rl/infostealer').then((r) => r.json().then((j) => ({ ok: r.ok, j }))),
      fetch('/api/v1/cyber-crime').then((r) => r.json()),
      fetch('/api/v1/deepdarkcti').then((r) => r.json()),
    ]).then(([hrRes, ccRes, ddcRes]) => {
      if (!alive) return;
      // HudsonRock / PRO
      if (hrRes.status === 'fulfilled') {
        const { ok, j } = hrRes.value as { ok: boolean; j: Record<string, unknown> };
        if (ok) setHr((j as { data?: unknown }).data ?? j);
        else
          setHrErr(
            (j as { error?: string }).error === 'not_configured'
              ? 'ransomware.live PRO key not configured on the server.'
              : `PRO request failed: ${(j as { error?: string }).error ?? 'unknown'}`
          );
      } else setHrErr('PRO request failed.');
      // Log markets — AF demonforums threads from the cybercrime aggregate
      if (ccRes.status === 'fulfilled' && isRecord(ccRes.value) && Array.isArray(ccRes.value.items)) {
        const items = (ccRes.value.items as Record<string, unknown>[])
          .filter((i) => String(i.source ?? '').includes('andreafortuna-demonforums'))
          .map((i) => ({
            title: String(i.title ?? 'untitled'),
            url: String(i.url ?? ''),
            source: String(i.source ?? ''),
            published: typeof i.published === 'string' ? i.published : undefined,
            description: typeof i.description === 'string' ? i.description : undefined,
          }));
        setMarkets(items);
      } else setMarkets([]);
      // Telegram channels — deepdarkCTI 'Infostealer Telegram' category
      if (ddcRes.status === 'fulfilled' && isRecord(ddcRes.value) && Array.isArray(ddcRes.value.entries)) {
        const ch = (ddcRes.value.entries as Record<string, unknown>[])
          .filter((e) => e.category === 'Infostealer Telegram')
          .map((e) => ({
            name: String(e.name ?? 'channel'),
            url: String(e.url ?? ''),
            status: String(e.status ?? 'unknown'),
            notes: typeof e.notes === 'string' ? e.notes : undefined,
          }));
        setTg(ch);
      } else setTg([]);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const hrRows = useMemo(() => {
    const d = hr;
    if (Array.isArray(d)) return d;
    if (isRecord(d)) {
      for (const k of ['results', 'victims', 'data', 'items']) {
        if (Array.isArray(d[k])) return d[k] as unknown[];
      }
    }
    return [];
  }, [hr]);

  const copy = (t: string) => void navigator.clipboard?.writeText(t);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-6 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /threatintel
      </Link>

      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl flex items-center gap-2">
          <KeyRound size={22} className="text-brand-600 dark:text-brand-400" />
          Infostealer Live Tracker
        </h1>
        <p className="text-sm font-mono text-slate-600 dark:text-slate-400 mt-1">
          Live infostealer signal across three independent surfaces: HudsonRock victim exposure (ransomware.live PRO),
          ULP / cloud-log market threads, and the active stealer-log Telegram channel directory.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 font-mono text-[12px] border-b-2 -mb-px ${
                tab === t.id
                  ? 'border-brand-500 text-brand-700 dark:text-brand-300'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      <p className="font-mono text-[11px] text-slate-500 mb-4">{TABS.find((t) => t.id === tab)!.blurb}</p>

      {loading && <div className="font-mono text-sm text-slate-500">loading…</div>}

      {!loading && tab === 'hudsonrock' && (
        <>
          {hrErr && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 font-mono text-sm text-amber-700 dark:text-amber-300">
              {hrErr}
            </div>
          )}
          {!hrErr && hrRows.length > 0 && (
            <ul className="grid gap-2 md:grid-cols-2">
              {hrRows.slice(0, 100).map((row, i) => {
                if (!isRecord(row))
                  return (
                    <li
                      key={i}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 font-mono text-[12px]"
                    >
                      {String(row)}
                    </li>
                  );
                const title = str(row, ['victim', 'name', 'post_title', 'domain', 'title']) ?? `#${i + 1}`;
                const sub = str(row, ['description', 'country', 'activity', 'group', 'group_name']);
                const date = str(row, ['discovered', 'published', 'date', 'added_date']);
                return (
                  <li
                    key={i}
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
                  >
                    <div className="font-display font-semibold text-sm truncate">{title}</div>
                    {sub && (
                      <p className="font-mono text-[11px] text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                        {sub}
                      </p>
                    )}
                    {date && <p className="font-mono text-[10px] text-slate-400 mt-1">{date}</p>}
                  </li>
                );
              })}
            </ul>
          )}
          {!hrErr && hrRows.length === 0 && hr != null && <RawJson value={hr} />}
        </>
      )}

      {!loading && tab === 'markets' && (
        <ul className="grid gap-2 md:grid-cols-2">
          {(markets ?? []).map((m, i) => (
            <li
              key={i}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display font-semibold text-sm text-brand-600 dark:text-brand-400 hover:underline break-all"
                >
                  {m.title}
                </a>
                <button
                  type="button"
                  onClick={() => copy(m.url)}
                  className="shrink-0 rounded border border-slate-200 dark:border-slate-700 p-1 text-slate-500 hover:text-brand-600"
                  aria-label="Copy URL"
                >
                  <Copy size={11} />
                </button>
              </div>
              {m.description && (
                <p className="font-mono text-[11px] text-slate-500 mt-1 line-clamp-2">{m.description}</p>
              )}
              {m.published && <p className="font-mono text-[10px] text-slate-400 mt-1">{m.published}</p>}
            </li>
          ))}
          {markets && markets.length === 0 && (
            <li className="font-mono text-[12px] text-slate-500">No log-market threads in the current feed window.</li>
          )}
        </ul>
      )}

      {!loading && tab === 'telegram' && (
        <ul className="grid gap-2 md:grid-cols-2">
          {(tg ?? []).map((c, i) => (
            <li
              key={i}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-semibold text-sm truncate">{c.name}</span>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                    c.status === 'online' || c.status === 'valid'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-400/40 bg-slate-400/10 text-slate-500'
                  }`}
                >
                  {c.status}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <code className="font-mono text-[11px] text-slate-600 dark:text-slate-400 break-all">{c.url}</code>
                <button
                  type="button"
                  onClick={() => copy(c.url)}
                  className="shrink-0 rounded border border-slate-200 dark:border-slate-700 p-1 text-slate-500 hover:text-brand-600"
                  aria-label="Copy URL"
                >
                  <Copy size={11} />
                </button>
              </div>
              {c.notes && <p className="font-mono text-[11px] text-slate-500 mt-1 line-clamp-2">{c.notes}</p>}
            </li>
          ))}
          {tg && tg.length === 0 && (
            <li className="font-mono text-[12px] text-slate-500">
              deepdarkCTI infostealer-Telegram category unavailable.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
