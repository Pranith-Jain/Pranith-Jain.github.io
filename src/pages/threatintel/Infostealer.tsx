import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataPageLayout } from '../../components/DataPageLayout';
import { BookText, Bug, Copy, ExternalLink, KeyRound, Network, Radio, Send, ShoppingCart } from 'lucide-react';
import { INFOSTEALER_FAMILIES } from '../../data/threatintel/infostealer-families';
import { sanitizeUrl } from '../../lib/sanitize-url';

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

type TabId = 'hudsonrock' | 'markets' | 'telegram' | 'samples' | 'c2' | 'combo' | 'encyclopedia' | 'articles';

interface ArticleItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: 'blog' | 'report' | 'technique' | 'all';
}

/**
 * High-precision infostealer family matcher. Covers the dominant
 * 2024–2026 families seen in MalwareBazaar signatures + ThreatFox/URLhaus
 * tags. Word-ish boundaries keep "mars" / "meta" from over-matching.
 */
const STEALER_RE =
  /\b(redline|lumma(c2)?|stealc|vidar|raccoon|meta ?stealer|risepro|rhadamanthys|aurora ?stealer|mars ?stealer|azorult|agent ?tesla|snake ?keylogger|lokibot|amos|atomic ?stealer|banshee|cryptbot|vipersoftx|whitesnake|phemedrone|stealerium|mystic ?stealer|darkcloud|strela|erbium|taurus ?stealer|skuld|nexus ?stealer|kematian|acrstealer|fickerstealer)\b/i;

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
  {
    id: 'samples',
    label: 'Stealer samples',
    icon: Bug,
    blurb: 'Live MalwareBazaar uploads whose signature/tags match a known infostealer family.',
  },
  {
    id: 'c2',
    label: 'Stealer C2 / IOCs',
    icon: Radio,
    blurb: 'Live ThreatFox / URLhaus / TweetFeed indicators attributed to an infostealer family.',
  },
  {
    id: 'combo',
    label: 'Combo & forum intel',
    icon: Network,
    blurb:
      'Intelligence ABOUT combolist / stealer-log forums & channels — directory metadata + tagged chatter pointers. No stolen data is fetched, parsed, or shown here.',
  },
  {
    id: 'encyclopedia',
    label: 'Family encyclopedia',
    icon: BookText,
    blurb:
      'Curated profiles for 17 baseline infostealer families — description, capabilities, first-seen, Malpedia cross-refs, and known actor attribution.',
  },
  {
    id: 'articles',
    label: 'News articles',
    icon: BookText,
    blurb:
      'Latest infostealer research, campaign tracking, and breach reports from Hudson Rock / InfoStealers.com — RedLine, Lumma, Vidar, StealC, and emerging stealer families.',
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
interface SampleItem {
  family: string;
  sha256: string;
  reporter?: string;
  first_seen?: string;
  file_type?: string;
  url: string;
}
interface C2Item {
  value: string;
  kind: string;
  family: string;
  source: string;
  observed_at?: string;
}

interface SfiForumGroup {
  category: string;
  count: number;
  entries: { name: string; url: string; onion: boolean; status: string }[];
}
interface SfiChatterSample {
  source: string;
  link: string;
  when?: string;
  keyword: string;
}
interface SfiResponse {
  generated_at: string;
  forums: SfiForumGroup[];
  chatter: {
    telegram: { matches: number; samples: SfiChatterSample[] };
    reddit: { matches: number; samples: SfiChatterSample[] };
  };
  totals: { tracked_sources: number; categories: number };
}

function RawJson({ value }: { value: unknown }) {
  return (
    <pre className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-200))] p-3 overflow-auto font-mono text-mini text-slate-700 dark:text-slate-300 max-h-[55vh]">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function Infostealer(): JSX.Element {
  // Default tab is "hudsonrock" — the headline PRO source. The previous
  // default ('markets') was a leftover from the demo build.
  const [tab, setTab] = useState<TabId>('hudsonrock');
  const [hr, setHr] = useState<unknown>(null);
  const [hrErr, setHrErr] = useState<string | null>(null);
  const [markets, setMarkets] = useState<MarketItem[] | null>(null);
  const [tg, setTg] = useState<TelegramItem[] | null>(null);
  const [samples, setSamples] = useState<SampleItem[] | null>(null);
  const [c2, setC2] = useState<C2Item[] | null>(null);
  const [sfi, setSfi] = useState<SfiResponse | null>(null);
  const [articles, setArticles] = useState<ArticleItem[] | null>(null);
  const [articlesErr, setArticlesErr] = useState<string | null>(null);
  const [articleSource, setArticleSource] = useState<'all' | 'blog' | 'report' | 'technique'>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    setLoading(true);
    const opts = { signal: ctrl.signal } as const;
    Promise.allSettled([
      fetch('/api/v1/rl/infostealer', opts).then((r) => r.json().then((j) => ({ ok: r.ok, j }))),
      fetch('/api/v1/cyber-crime', opts).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch('/api/v1/deepdarkcti', opts).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch('/api/v1/malware-samples', opts).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch('/api/v1/live-iocs', opts).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch('/api/v1/stealer-forum-intel', opts).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch(
        '/api/v1/feeds/proxy?url=' + encodeURIComponent('https://www.infostealers.com/learn-info-stealers/feed/'),
        opts
      ).then(async (r) => (r.ok ? r.text() : null)),
      fetch('/api/v1/feeds/proxy?url=' + encodeURIComponent('https://www.infostealers.com/feed/'), opts).then(
        async (r) => (r.ok ? r.text() : null)
      ),
      fetch(
        '/api/v1/feeds/proxy?url=' + encodeURIComponent('https://www.infostealers.com/info-stealers-reports/feed/'),
        opts
      ).then(async (r) => (r.ok ? r.text() : null)),
      fetch(
        '/api/v1/feeds/proxy?url=' + encodeURIComponent('https://www.infostealers.com/info-stealers-techniques/feed/'),
        opts
      ).then(async (r) => (r.ok ? r.text() : null)),
    ]).then(([hrRes, ccRes, ddcRes, mbRes, liRes, sfiRes, blogRes, allRes, reportsRes, techRes]) => {
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
      // Stealer samples — MalwareBazaar uploads matching a known family
      if (mbRes.status === 'fulfilled' && isRecord(mbRes.value) && Array.isArray(mbRes.value.samples)) {
        const ss = (mbRes.value.samples as Record<string, unknown>[])
          .map((s) => {
            const sig = String(s.signature ?? '');
            const tags = Array.isArray(s.tags) ? (s.tags as unknown[]).map(String) : [];
            const hay = `${sig} ${tags.join(' ')}`;
            const m = hay.match(STEALER_RE);
            return m
              ? {
                  family: m[0],
                  sha256: String(s.sha256 ?? ''),
                  reporter: typeof s.reporter === 'string' ? s.reporter : undefined,
                  first_seen: typeof s.first_seen === 'string' ? s.first_seen : undefined,
                  file_type: typeof s.file_type === 'string' ? s.file_type : undefined,
                  url: String(s.bazaar_url ?? ''),
                }
              : null;
          })
          .filter((x) => x !== null) as SampleItem[];
        setSamples(ss);
      } else setSamples([]);
      // Stealer C2 / IOCs — live-iocs items whose family/context matches
      if (liRes.status === 'fulfilled' && isRecord(liRes.value) && Array.isArray(liRes.value.items)) {
        const ci = (liRes.value.items as Record<string, unknown>[])
          .filter((i) => STEALER_RE.test(String(i.context ?? '')))
          .map((i) => ({
            value: String(i.value ?? ''),
            kind: String(i.kind ?? ''),
            family: (String(i.context ?? '').match(STEALER_RE) ?? ['?'])[0],
            source: String(i.source ?? ''),
            observed_at: typeof i.observed_at === 'string' ? i.observed_at : undefined,
          }));
        setC2(ci);
      } else setC2([]);
      // Combo & stealer-forum intel — metadata + chatter pointers only
      if (sfiRes.status === 'fulfilled' && isRecord(sfiRes.value) && Array.isArray(sfiRes.value.forums)) {
        setSfi(sfiRes.value as unknown as SfiResponse);
      } else setSfi(null);

      // InfoStealers.com RSS feeds
      try {
        const parseFeed = (text: string | null, source: ArticleItem['source']): ArticleItem[] => {
          if (!text) return [];
          const doc = new DOMParser().parseFromString(text, 'text/xml');
          const items = doc.querySelectorAll('item');
          const out: ArticleItem[] = [];
          items.forEach((item) => {
            const title = item.querySelector('title')?.textContent?.trim() ?? '';
            const link = item.querySelector('link')?.textContent?.trim() ?? '';
            const desc =
              item
                .querySelector('description')
                ?.textContent?.trim()
                ?.replace(/<[^>]+>/g, '')
                ?.slice(0, 300) ?? '';
            const pubDate = item.querySelector('pubDate')?.textContent?.trim() ?? '';
            if (title && link) out.push({ title, link, description: desc, pubDate, source });
          });
          return out;
        };
        const blog = parseFeed(blogRes.status === 'fulfilled' ? (blogRes.value as string | null) : null, 'blog');
        const all = parseFeed(allRes.status === 'fulfilled' ? (allRes.value as string | null) : null, 'all');
        const reports = parseFeed(
          reportsRes.status === 'fulfilled' ? (reportsRes.value as string | null) : null,
          'report'
        );
        const tech = parseFeed(techRes.status === 'fulfilled' ? (techRes.value as string | null) : null, 'technique');
        const merged = [...all, ...blog, ...reports, ...tech]
          .filter((a, i, arr) => arr.findIndex((x) => x.link === a.link) === i)
          .sort((a, b) => {
            const da = Date.parse(a.pubDate);
            const db = Date.parse(b.pubDate);
            if (!isNaN(da) && !isNaN(db)) return db - da;
            if (!isNaN(da)) return -1;
            if (!isNaN(db)) return 1;
            return 0;
          })
          .slice(0, 50);
        setArticles(merged);
        setArticlesErr(null);
      } catch {
        setArticlesErr('failed to parse RSS feeds');
      }

      setLoading(false);
    });
    return () => {
      alive = false;
      ctrl.abort();
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
    <DataPageLayout
      backTo="/threatintel"
      icon={<KeyRound size={28} />}
      title="Infostealer Live Tracker"
      description={
        <span className="text-sm font-mono">
          Live infostealer signal: HudsonRock victim exposure, log-market threads, stealer-log Telegram channels,
          MalwareBazaar samples, live IOCs, combo-forum intel, family encyclopedia, and Hudson Rock research articles.
        </span>
      }
      maxWidthClass="max-w-6xl"
    >
      <div className="flex flex-wrap gap-2 mb-4 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 font-mono text-meta border-b-2 -mb-px ${
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

      <p className="font-mono text-mini text-slate-500 mb-4">{TABS.find((t) => t.id === tab)?.blurb ?? ''}</p>

      {loading && (
        <p role="status" aria-live="polite" className="font-mono text-sm text-slate-500">
          loading…
        </p>
      )}

      {!loading && tab === 'hudsonrock' && (
        <>
          {hrErr && (
            <div
              role="alert"
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 font-mono text-sm text-amber-700 dark:text-amber-300"
            >
              {hrErr}
            </div>
          )}
          {!hrErr && hrRows.length > 0 && (
            <ul className="grid gap-2 md:grid-cols-2">
              {hrRows.slice(0, 100).map((row, i) => {
                if (!isRecord(row))
                  return (
                    <li
                      key={`raw-${i}`}
                      className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] p-3 font-mono text-meta"
                    >
                      {String(row)}
                    </li>
                  );
                const title = str(row, ['victim', 'name', 'post_title', 'domain', 'title']) ?? `#${i + 1}`;
                const sub = str(row, ['description', 'country', 'activity', 'group', 'group_name']);
                const date = str(row, ['discovered', 'published', 'date', 'added_date']);
                return (
                  <li
                    key={`${title}-${date}-${i}`}
                    className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3"
                  >
                    <div className="font-display font-semibold text-sm truncate">{title}</div>
                    {sub && <p className="font-mono text-mini text-muted mt-1 line-clamp-2">{sub}</p>}
                    {date && <p className="font-mono text-micro text-slate-400 mt-1">{date}</p>}
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
          {(markets ?? []).map((m) => (
            <li
              key={m.title}
              className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <a
                  href={sanitizeUrl(m.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-display font-semibold text-sm text-brand-600 dark:text-brand-400 hover:underline break-all"
                >
                  {m.title}
                </a>
                <button
                  type="button"
                  onClick={() => copy(m.url)}
                  className="shrink-0 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-1 text-slate-500 hover:text-brand-600"
                  aria-label="Copy URL"
                >
                  <Copy size={11} />
                </button>
              </div>
              {m.description && <p className="font-mono text-mini text-slate-500 mt-1 line-clamp-2">{m.description}</p>}
              {m.published && <p className="font-mono text-micro text-slate-400 mt-1">{m.published}</p>}
            </li>
          ))}
          {markets && markets.length === 0 && (
            <li className="font-mono text-meta text-slate-500">No log-market threads in the current feed window.</li>
          )}
        </ul>
      )}

      {!loading && tab === 'telegram' && (
        <ul className="grid gap-2 md:grid-cols-2">
          {(tg ?? []).map((c) => (
            <li
              key={c.name}
              className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-semibold text-sm truncate">{c.name}</span>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-micro uppercase ${
                    c.status === 'online' || c.status === 'valid'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-400/40 bg-slate-400/10 text-slate-500'
                  }`}
                >
                  {c.status}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <code className="font-mono text-mini text-muted break-all">{c.url}</code>
                <button
                  type="button"
                  onClick={() => copy(c.url)}
                  className="shrink-0 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-1 text-slate-500 hover:text-brand-600"
                  aria-label="Copy URL"
                >
                  <Copy size={11} />
                </button>
              </div>
              {c.notes && <p className="font-mono text-mini text-slate-500 mt-1 line-clamp-2">{c.notes}</p>}
            </li>
          ))}
          {tg && tg.length === 0 && (
            <li className="font-mono text-meta text-slate-500">
              deepdarkCTI infostealer-Telegram category unavailable.
            </li>
          )}
        </ul>
      )}

      {!loading && tab === 'samples' && (
        <ul className="grid gap-2 md:grid-cols-2">
          {(samples ?? []).map((s) => (
            <li
              key={s.sha256}
              className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 font-mono text-micro uppercase text-rose-700 dark:text-rose-300">
                  {s.family}
                </span>
                {s.file_type && <span className="font-mono text-micro text-slate-400">{s.file_type}</span>}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <a
                  href={sanitizeUrl(s.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-mini text-brand-600 dark:text-brand-400 hover:underline break-all"
                >
                  {s.sha256.slice(0, 32)}…
                </a>
                <button
                  type="button"
                  onClick={() => copy(s.sha256)}
                  className="shrink-0 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-1 text-slate-500 hover:text-brand-600"
                  aria-label="Copy SHA256"
                >
                  <Copy size={11} />
                </button>
              </div>
              <p className="font-mono text-micro text-slate-400 mt-1">
                {s.reporter ? `by ${s.reporter}` : ''} {s.first_seen ?? ''}
              </p>
            </li>
          ))}
          {samples && samples.length === 0 && (
            <li className="font-mono text-meta text-slate-500">
              No known-family stealer samples in the current MalwareBazaar window.
            </li>
          )}
        </ul>
      )}

      {!loading && tab === 'c2' && (
        <ul className="grid gap-2 md:grid-cols-2">
          {(c2 ?? []).map((x) => (
            <li
              key={x.value}
              className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 font-mono text-micro uppercase text-rose-700 dark:text-rose-300">
                  {x.family}
                </span>
                <span className="font-mono text-micro text-slate-400">
                  {x.kind} · {x.source}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <code className="font-mono text-mini text-muted break-all">{x.value}</code>
                <button
                  type="button"
                  onClick={() => copy(x.value)}
                  className="shrink-0 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-1 text-slate-500 hover:text-brand-600"
                  aria-label="Copy indicator"
                >
                  <Copy size={11} />
                </button>
              </div>
              {x.observed_at && <p className="font-mono text-micro text-slate-400 mt-1">{x.observed_at}</p>}
            </li>
          ))}
          {c2 && c2.length === 0 && (
            <li className="font-mono text-meta text-slate-500">
              No infostealer-attributed indicators in the current live-IOC window.
            </li>
          )}
        </ul>
      )}

      {!loading && tab === 'encyclopedia' && (
        <div className="space-y-4">
          {INFOSTEALER_FAMILIES.map((fam) => (
            <details
              key={fam.slug}
              className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 group open:border-brand-500/40"
            >
              <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none hover:bg-slate-50 dark:hover:bg-slate-950 rounded-lg list-none">
                <div className="min-w-0">
                  <Link
                    to={`/threatintel/infostealer/${fam.slug}`}
                    className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 hover:text-brand-600 dark:hover:text-brand-400"
                  >
                    {fam.name}
                  </Link>
                  {fam.aliases.length > 0 && (
                    <span className="ml-2 text-mini font-mono text-slate-500">aka {fam.aliases.join(', ')}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-micro font-mono text-slate-400 border border-slate-200 dark:border-[rgb(var(--border-400))] rounded px-1.5 py-0.5">
                    {fam.firstSeen}
                  </span>
                  <span className="text-micro font-mono text-slate-400">{fam.platforms.join('/')}</span>
                </div>
              </summary>
              <div className="px-4 pb-4 border-t border-slate-200 dark:border-[rgb(var(--border-400))] pt-3 space-y-3">
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{fam.description}</p>

                <div className="flex flex-wrap gap-1.5">
                  {fam.capabilities.map((c) => (
                    <span
                      key={c}
                      className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] bg-slate-50 dark:bg-slate-950 text-muted"
                    >
                      {c}
                    </span>
                  ))}
                </div>

                {fam.actors.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-micro font-mono uppercase tracking-wider text-slate-500">Actors:</span>
                    {fam.actors.map((a) => (
                      <Link
                        key={a}
                        to={`/threatintel/actors/${a.toLowerCase().replace(/\s+/g, '-')}`}
                        className="text-mini font-mono px-1.5 py-0.5 rounded border border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10"
                      >
                        {a}
                      </Link>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 text-mini font-mono">
                  {fam.malpediaUrl && (
                    <a
                      href={fam.malpediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
                    >
                      Malpedia <ExternalLink size={11} />
                    </a>
                  )}
                  {fam.threatfoxTag && (
                    <span className="text-slate-500">
                      ThreatFox tag: <code className="text-slate-700 dark:text-slate-300">{fam.threatfoxTag}</code>
                    </span>
                  )}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}

      {!loading && tab === 'combo' && (
        <div className="space-y-5">
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 font-mono text-mini text-amber-700 dark:text-amber-300">
            Defensive intelligence only. This tab tracks <strong>where</strong> combolist / stealer-log activity lives
            and <strong>that</strong> it is being discussed — directory metadata and public permalinks. It never
            fetches, parses, or displays stolen credentials or breach contents.
          </div>

          {!sfi && (
            <p className="font-mono text-meta text-slate-500">
              Forum-intel cache is cold — visit again shortly once it warms.
            </p>
          )}

          {sfi && (
            <>
              <p className="font-mono text-mini text-slate-500">
                {sfi.totals.tracked_sources} tracked sources across {sfi.totals.categories} categories · telegram
                chatter hits: {sfi.chatter.telegram.matches} · reddit: {sfi.chatter.reddit.matches}
              </p>

              {sfi.forums.map((g) => (
                <div key={g.category}>
                  <h3 className="font-display font-semibold text-sm mb-2">
                    {g.category} <span className="font-mono text-mini text-slate-500">· {g.count}</span>
                  </h3>
                  <ul className="grid gap-2 md:grid-cols-2">
                    {g.entries.slice(0, 60).map((e, i) => (
                      <li
                        key={`${e.name}-${i}`}
                        className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display font-semibold text-sm truncate" title={e.name}>
                            {e.name}
                          </span>
                          <span className="flex items-center gap-1 shrink-0">
                            {e.onion && (
                              <span className="rounded border border-slate-400/40 bg-slate-400/10 px-1 py-0.5 font-mono text-micro uppercase text-slate-500">
                                onion
                              </span>
                            )}
                            <span
                              className={`rounded border px-1.5 py-0.5 font-mono text-micro uppercase ${
                                e.status === 'online' || e.status === 'valid'
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                  : 'border-slate-400/40 bg-slate-400/10 text-slate-500'
                              }`}
                            >
                              {e.status}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="font-mono text-mini text-muted break-all">{e.url}</code>
                          <button
                            type="button"
                            onClick={() => copy(e.url)}
                            className="shrink-0 rounded border border-slate-200 dark:border-[rgb(var(--border-400))] p-1 text-slate-500 hover:text-brand-600"
                            aria-label="Copy URL"
                          >
                            <Copy size={11} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {(['telegram', 'reddit'] as const).map((src) => {
                const block = sfi.chatter[src];
                if (block.samples.length === 0) return null;
                return (
                  <div key={src}>
                    <h3 className="font-display font-semibold text-sm mb-2 capitalize">
                      {src} combo/stealer chatter{' '}
                      <span className="font-mono text-mini text-slate-500">· {block.matches} matches</span>
                    </h3>
                    <ul className="space-y-1.5">
                      {block.samples.map((s, i) => (
                        <li
                          key={`${src}-${i}`}
                          className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-2.5 font-mono text-mini flex items-center gap-2 flex-wrap"
                        >
                          <span className="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-micro uppercase text-rose-700 dark:text-rose-300">
                            {s.keyword}
                          </span>
                          <span className="text-muted truncate">{s.source}</span>
                          {s.when && <span className="text-slate-400 text-micro">{s.when.slice(0, 10)}</span>}
                          {s.link && (
                            <a
                              href={sanitizeUrl(s.link)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-auto text-brand-600 dark:text-brand-400 hover:underline"
                            >
                              open ↗
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {!loading && tab === 'articles' && (
        <>
          {articlesErr && (
            <div
              role="alert"
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 font-mono text-sm text-amber-700 dark:text-amber-300"
            >
              {articlesErr}
            </div>
          )}
          {articles && (
            <>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {(['all', 'blog', 'report', 'technique'] as const).map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setArticleSource(src)}
                    className={`text-mini font-mono px-2 py-1 rounded border ${
                      articleSource === src
                        ? 'bg-brand-500/15 border-brand-500/40 text-brand-700 dark:text-brand-300'
                        : 'border-slate-200 dark:border-[rgb(var(--border-400))] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {src === 'all' ? 'All' : src === 'blog' ? 'Blog' : src === 'report' ? 'Reports' : 'Techniques'}
                  </button>
                ))}
              </div>
              {(() => {
                const filtered =
                  articleSource === 'all' ? articles : articles.filter((a) => a.source === articleSource);
                if (filtered.length === 0) {
                  return <p className="font-mono text-meta text-slate-500">No articles in this category.</p>;
                }
                return (
                  <ul className="grid gap-3 md:grid-cols-2">
                    {filtered.map((a) => (
                      <li
                        key={a.link}
                        className="rounded-lg border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))] shadow-e1 p-3"
                      >
                        <a
                          href={sanitizeUrl(a.link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-display font-semibold text-sm text-brand-600 dark:text-brand-400 hover:underline block mb-1"
                        >
                          {a.title}
                        </a>
                        {a.description && (
                          <p className="font-mono text-mini text-muted line-clamp-2 mb-1">{a.description}</p>
                        )}
                        <div className="flex items-center gap-2 text-micro font-mono text-slate-400">
                          <ExternalLink size={10} />
                          <span
                            className={`rounded border px-1 py-0.5 ${
                              a.source === 'blog'
                                ? 'border-brand-500/30 bg-brand-500/10 text-brand-600 dark:text-brand-400'
                                : a.source === 'report'
                                  ? 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400'
                                  : a.source === 'technique'
                                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                    : 'border-slate-400/30 bg-slate-400/10 text-slate-500'
                            }`}
                          >
                            {a.source === 'blog'
                              ? 'Blog'
                              : a.source === 'report'
                                ? 'Report'
                                : a.source === 'technique'
                                  ? 'Technique'
                                  : 'Article'}
                          </span>
                          {a.pubDate && (
                            <>
                              <span>·</span>
                              <span>{a.pubDate}</span>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                );
              })()}
            </>
          )}
        </>
      )}
    </DataPageLayout>
  );
}
