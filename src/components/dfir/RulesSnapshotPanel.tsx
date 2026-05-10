import { useEffect, useMemo, useState } from 'react';
import { GitCommit, Network, Bug, Database, Shield, ExternalLink } from 'lucide-react';
import { SnapshotCard, type SnapshotAccent } from './SnapshotCard';

/**
 * Live snapshot for /dfir/rules — buckets the recent_commits returned by
 * /api/v1/rules by detection-rule platform (Sigma / YARA / Suricata / SIEM)
 * so the analyst sees "what just landed in upstream rule repos" at a glance.
 *
 * Same compact-card UX as LiveSnapshotPanel + IocSnapshotPanel. The bigger
 * source-list table on /dfir/rules is the canonical detail view; this panel
 * is the "what changed in the last day" entry point.
 */

interface RecentCommit {
  source_id: string;
  source_label: string;
  type: string;
  title: string;
  author: string;
  link: string;
  pubDate: string;
}

interface RulesResp {
  generated_at: string;
  recent_commits: RecentCommit[];
}

const ITEM_LIMIT = 5;

function shortRel(iso?: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const ageS = Math.max(0, (Date.now() - t) / 1000);
  if (ageS < 60) return 'now';
  if (ageS < 3600) return `${Math.round(ageS / 60)}m ago`;
  if (ageS < 86400) return `${Math.round(ageS / 3600)}h ago`;
  return `${Math.round(ageS / 86400)}d ago`;
}

const WATCHLIST_KEY = 'dfir.darkweb.watchlist';
function loadWatchlist(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : [];
  } catch {
    return [];
  }
}
function watchHits(haystack: string, watchlist: string[]): string[] {
  if (watchlist.length === 0) return [];
  const lc = haystack.toLowerCase();
  return watchlist.filter((t) => lc.includes(t.toLowerCase()));
}

interface CardSpec {
  key: string;
  title: string;
  Icon: typeof GitCommit;
  accent: SnapshotAccent;
  /** Which raw `type` strings from the API map into this card. */
  matches: string[];
}

/**
 * Four cards covering the four main detection-platform families. KQL +
 * Elastic + Splunk SPL all collapse into one "SIEM" card because they're
 * the same workflow from the analyst's POV (paste a query into a search
 * bar). Sigma stays solo even when it has zero commits — its absence is
 * itself a signal worth seeing.
 */
const CARDS: CardSpec[] = [
  { key: 'sigma', title: 'Sigma', Icon: Shield, accent: 'blue', matches: ['Sigma'] },
  { key: 'yara', title: 'YARA', Icon: Bug, accent: 'orange', matches: ['YARA'] },
  { key: 'suricata', title: 'Suricata', Icon: Network, accent: 'emerald', matches: ['Suricata'] },
  {
    key: 'siem',
    title: 'SIEM (Splunk · Elastic · KQL)',
    Icon: Database,
    accent: 'violet',
    matches: ['Splunk SPL', 'Elastic', 'KQL'],
  },
];

function decodeHtml(s: string): string {
  // Commit messages come back HTML-encoded (e.g. &#39; for apostrophes).
  // GitHub's API helpfully escapes them; we de-escape just the common ones.
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function RulesSnapshotPanel(): JSX.Element {
  const [data, setData] = useState<RulesResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<string[]>(() => loadWatchlist());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === WATCHLIST_KEY) setWatchlist(loadWatchlist());
    };
    window.addEventListener('storage', onStorage);
    const t = setTimeout(() => setWatchlist(loadWatchlist()), 1000);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/v1/rules');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as RulesResp;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bucketed = useMemo(() => {
    const out: Record<string, RecentCommit[]> = {};
    for (const c of CARDS) out[c.key] = [];
    if (!data) return out;
    for (const commit of data.recent_commits) {
      for (const c of CARDS) {
        if (c.matches.includes(commit.type)) {
          out[c.key].push(commit);
          break;
        }
      }
    }
    return out;
  }, [data]);

  const watchedByCard = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of CARDS) {
      out[c.key] = bucketed[c.key].filter(
        (cm) => watchHits(`${cm.title} ${cm.author} ${cm.source_label}`, watchlist).length > 0
      ).length;
    }
    return out;
  }, [bucketed, watchlist]);

  const totalWatched = Object.values(watchedByCard).reduce((a, b) => a + b, 0);
  const totalCommits = data?.recent_commits.length ?? 0;

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="font-display font-bold text-xl inline-flex items-center gap-2 flex-wrap">
          What just shipped
          {watchlist.length > 0 && totalWatched > 0 && (
            <span
              className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-violet-500/50 bg-violet-500/15 text-violet-700 dark:text-violet-300"
              title={`${totalWatched} commits match your watchlist (${watchlist.join(', ')})`}
            >
              {totalWatched} watchlist hits
            </span>
          )}
        </h2>
        <span className="text-[11px] font-mono text-slate-500 dark:text-slate-500">
          {data ? `${totalCommits} recent commits across upstream rule repos` : err ? `load error: ${err}` : 'loading…'}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {CARDS.map((c) => {
          const commits = bucketed[c.key].slice(0, ITEM_LIMIT);
          const watched = watchedByCard[c.key] ?? 0;
          return (
            <SnapshotCard
              key={c.key}
              accent={c.accent}
              icon={c.Icon}
              title={c.title}
              showNewBadge={false}
              watchCount={watched}
              watchTerms={watchlist}
              rightAction={<span className="text-slate-500 dark:text-slate-500">{bucketed[c.key].length} commits</span>}
              loading={!data && !err}
              error={err ?? undefined}
            >
              {data && commits.length === 0 && (
                <p className="text-[11px] font-mono text-slate-500">No recent commits in window.</p>
              )}

              {commits.length > 0 && (
                <ul className="space-y-1.5 mt-1">
                  {commits.map((cm, i) => {
                    const matched = watchHits(`${cm.title} ${cm.author} ${cm.source_label}`, watchlist);
                    return (
                      <li
                        key={`${cm.source_id}-${i}`}
                        className="flex items-baseline gap-2 text-[11px] font-mono py-0.5"
                      >
                        <span
                          className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                            matched.length > 0 ? 'bg-violet-500' : 'bg-transparent'
                          }`}
                          aria-label={matched.length > 0 ? `watchlist match: ${matched.join(', ')}` : undefined}
                          title={matched.length > 0 ? `watchlist match: ${matched.join(', ')}` : undefined}
                        />
                        <a
                          href={cm.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 flex-1 min-w-0 inline-flex items-center gap-1"
                          title={`${decodeHtml(cm.title)} — ${cm.source_label}`}
                        >
                          <GitCommit size={9} className="opacity-50 shrink-0" />
                          <span className="truncate">{decodeHtml(cm.title)}</span>
                        </a>
                        <span className="text-slate-500 shrink-0">{shortRel(cm.pubDate)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}

              {commits.length > 0 && (
                <a
                  href={`https://github.com/search?q=${encodeURIComponent(c.title)}+rules&type=repositories`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto pt-2 text-[10px] font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-0.5"
                >
                  more {c.title.split(' ')[0].toLowerCase()} repos <ExternalLink size={9} />
                </a>
              )}
            </SnapshotCard>
          );
        })}
      </div>
    </section>
  );
}
