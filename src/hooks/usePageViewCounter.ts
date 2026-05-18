import { useState, useEffect, useCallback } from 'react';

const VIEWED_SESSION_KEY = 'pj_portfolio_viewed';
const FIRST_VISIT_KEY = 'pj_portfolio_first_visit';
const ENDPOINT = '/api/v1/pageviews';

interface PageViewData {
  count: number;
  firstVisit: string | null;
  isNewSession: boolean;
}

/**
 * GLOBAL site view counter (D1-backed `/api/v1/pageviews`).
 *
 * Previously this was a per-browser localStorage tally rendered as a global
 * "N views" — so it differed on every device/session (62, 30, 44…). Now it
 * reads/increments one shared server counter, so every visitor sees the
 * same number. Still privacy-first: increments once per browser SESSION
 * (sessionStorage guard), no per-user tracking. The GET is edge-cached so
 * reads don't hammer D1; `firstVisit` stays local (inherently personal).
 */
export function usePageViewCounter(): PageViewData & { increment: () => void } {
  const [count, setCount] = useState(0);
  const [firstVisit, setFirstVisit] = useState<string | null>(null);
  const [isNewSession, setIsNewSession] = useState(false);

  useEffect(() => {
    let alive = true;
    let newSession = false;
    try {
      newSession = !sessionStorage.getItem(VIEWED_SESSION_KEY);
      if (newSession) sessionStorage.setItem(VIEWED_SESSION_KEY, 'true');
      const stored = localStorage.getItem(FIRST_VISIT_KEY);
      if (!stored) {
        const now = new Date().toISOString();
        localStorage.setItem(FIRST_VISIT_KEY, now);
        setFirstVisit(now);
      } else {
        setFirstVisit(stored);
      }
    } catch {
      newSession = true; // private mode — treat as a fresh session
    }
    setIsNewSession(newSession);

    // New session → increment the global counter once; else just read the
    // (edge-cached) global total. Fail silent: an offline/error leaves the
    // count at 0 rather than showing a fake per-device number.
    fetch(`${ENDPOINT}${newSession ? '?inc=1' : ''}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { views?: number }) => {
        if (alive && typeof d.views === 'number') setCount(d.views);
      })
      .catch(() => {
        /* leave at 0 — better than a misleading device-local tally */
      });
    return () => {
      alive = false;
    };
  }, []);

  const increment = useCallback(() => {
    fetch(`${ENDPOINT}?inc=1`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { views?: number }) => {
        if (typeof d.views === 'number') setCount(d.views);
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  return { count, firstVisit, isNewSession, increment };
}

/**
 * Format view count with proper suffix (e.g., 1.2K, 1.5M)
 */
export function formatViewCount(count: number): string {
  if (count < 1000) {
    return count.toString();
  } else if (count < 1000000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  } else {
    return (count / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
}

/**
 * Hook for getting formatted view count display
 */
export function useFormattedViewCount(): string {
  const { count } = usePageViewCounter();
  return formatViewCount(count);
}
