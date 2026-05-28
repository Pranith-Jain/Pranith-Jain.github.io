import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, X } from 'lucide-react';
import { useLastVisit } from '../../hooks';

/**
 * "What's new since your last visit" banner for /threatintel landing.
 *
 * One fetch of /api/v1/snapshot (already edge-cached, shared with the
 * LiveSnapshotPanel below it) → count per-surface items newer than the
 * user's localStorage 'threatintel-home' last-visit marker → render a
 * compact banner of clickable chips that deep-link into the relevant
 * page.
 *
 * Hides itself when:
 *   - first-ever visit (no baseline → no false-positive flood)
 *   - zero deltas across all surfaces
 *   - user explicitly dismisses via "Mark all read"
 *
 * Calls markVisited() ONLY when the user explicitly hits "mark all read",
 * not on every page load. That way navigating away + coming back doesn't
 * silently consume the deltas.
 */

interface SnapshotMinimal {
  generated_at?: string;
  ransomware?: { ok: boolean; data?: { victims?: Array<{ discovered: string }> } | null };
  telegram?: { ok: boolean; data?: { items?: Array<{ datetime: string }> } | null };
  scam?: { ok: boolean; data?: { items?: Array<{ pubDate?: string; datetime?: string }> } | null };
  threat_intel?: { ok: boolean; data?: { items?: Array<{ pubDate?: string }> } | null };
  tech_ai?: { ok: boolean; data?: { items?: Array<{ pubDate?: string }> } | null };
  briefings?: {
    ok: boolean;
    data?: { items?: Array<{ slug: string; metadata?: { range_end?: string; date?: string } }> } | null;
  };
}

interface DeltaRow {
  key: string;
  count: number;
  label: string;
  to: string;
}

function isNewer(iso: string | undefined, baseline: string): boolean {
  if (!iso) return false;
  return iso > baseline;
}

function countNew<T>(items: T[] | undefined, baseline: string, getIso: (it: T) => string | undefined): number {
  if (!items) return 0;
  let n = 0;
  for (const it of items) if (isNewer(getIso(it), baseline)) n += 1;
  return n;
}

function prettyAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'a moment ago';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'a moment ago';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function WhatsNewBanner(): JSX.Element | null {
  const { previous, markVisited } = useLastVisit('threatintel-home');
  const [snapshot, setSnapshot] = useState<SnapshotMinimal | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!previous) return;
    const ctrl = new AbortController();
    let cancelled = false;
    fetch('/api/v1/snapshot', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((j: SnapshotMinimal) => {
        if (!cancelled) setSnapshot(j);
      })
      .catch(() => {
        /* silent */
      });
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [previous]);

  const rows = useMemo<DeltaRow[]>(() => {
    if (!snapshot || !previous) return [];
    const out: DeltaRow[] = [];
    const ransomCount = countNew(snapshot.ransomware?.data?.victims, previous, (v) => v.discovered);
    if (ransomCount) {
      out.push({
        key: 'ransomware',
        count: ransomCount,
        label: ransomCount === 1 ? 'ransomware claim' : 'ransomware claims',
        to: '/threatintel/ransomware-activity',
      });
    }
    const telegramCount = countNew(snapshot.telegram?.data?.items, previous, (m) => m.datetime);
    if (telegramCount) {
      out.push({
        key: 'telegram',
        count: telegramCount,
        label: telegramCount === 1 ? 'Telegram message' : 'Telegram messages',
        to: '/threatintel/cybersec',
      });
    }
    const scamCount = countNew(snapshot.scam?.data?.items, previous, (it) => it.pubDate ?? it.datetime);
    if (scamCount) {
      out.push({
        key: 'scam',
        count: scamCount,
        label: scamCount === 1 ? 'scam report' : 'scam reports',
        to: '/threatintel/scam-watch',
      });
    }
    const intelCount = countNew(snapshot.threat_intel?.data?.items, previous, (it) => it.pubDate);
    if (intelCount) {
      out.push({
        key: 'threat_intel',
        count: intelCount,
        label: intelCount === 1 ? 'threat-intel writeup' : 'threat-intel writeups',
        to: '/threatintel/writeups',
      });
    }
    const techAiCount = countNew(snapshot.tech_ai?.data?.items, previous, (it) => it.pubDate);
    if (techAiCount) {
      out.push({
        key: 'tech_ai',
        count: techAiCount,
        label: techAiCount === 1 ? 'tech / AI item' : 'tech / AI items',
        to: '/threatintel/tech-ai-news',
      });
    }
    const briefingsCount = countNew(
      snapshot.briefings?.data?.items,
      previous,
      (it) => it.metadata?.range_end ?? it.metadata?.date
    );
    if (briefingsCount) {
      out.push({
        key: 'briefings',
        count: briefingsCount,
        label: briefingsCount === 1 ? 'briefing' : 'briefings',
        to: '/threatintel/briefings',
      });
    }
    return out;
  }, [snapshot, previous]);

  if (dismissed) return null;
  if (!previous) return null;
  if (!snapshot) return null;
  if (rows.length === 0) return null;

  const total = rows.reduce((a, r) => a + r.count, 0);

  return (
    <section
      aria-label="What's new since your last visit"
      className="mb-6 rounded-lg border border-amber-300/60 bg-amber-50/60 dark:border-amber-700/40 dark:bg-amber-500/5 p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-amber-700 dark:text-amber-300 shrink-0">
          <Bell size={14} aria-hidden="true" />
          <span className="font-semibold">{total} new</span>
          <span className="hidden sm:inline">since {prettyAgo(previous)}</span>
        </span>
        <ul className="flex flex-wrap items-center gap-1.5">
          {rows.map((r) => (
            <li key={r.key}>
              <Link
                to={r.to}
                className="inline-flex items-baseline gap-1 px-2 py-1 rounded border border-amber-400/40 bg-amber-100/60 dark:bg-amber-500/15 text-xs font-mono text-amber-800 dark:text-amber-200 hover:border-amber-500 hover:bg-amber-200/60 dark:hover:bg-amber-500/25"
                onClick={() => {
                  // Don't markVisited on click — user is just looking. The
                  // explicit "mark all read" button is the only consumer.
                }}
              >
                <span className="font-bold tabular-nums">{r.count}</span>
                <span>{r.label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              markVisited();
              setDismissed(true);
            }}
            className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 px-2 py-1 rounded hover:bg-amber-200/40 dark:hover:bg-amber-500/15"
            title="Reset the baseline and hide this banner"
          >
            <Check size={11} /> mark all read
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] sm:min-h-[28px] sm:min-w-[28px] rounded text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 hover:bg-amber-200/40 dark:hover:bg-amber-500/15"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </section>
  );
}
