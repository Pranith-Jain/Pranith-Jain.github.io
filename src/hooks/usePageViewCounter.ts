import { useState, useEffect, useCallback } from 'react';

const VIEW_COUNT_KEY = 'pj_portfolio_views';
const VIEWED_SESSION_KEY = 'pj_portfolio_viewed';
const FIRST_VISIT_KEY = 'pj_portfolio_first_visit';

interface PageViewData {
  count: number;
  firstVisit: string | null;
  isNewSession: boolean;
}

/**
 * Hook for tracking page views using localStorage with privacy-first approach
 * - Only counts unique sessions (not individual page reloads)
 * - No external tracking or analytics
 * - Respects private browsing mode
 * - First-time visitor detection
 */
export function usePageViewCounter(): PageViewData & { increment: () => void } {
  const [count, setCount] = useState(0);
  const [firstVisit, setFirstVisit] = useState<string | null>(null);
  const [isNewSession, setIsNewSession] = useState(false);

  useEffect(() => {
    try {
      // Check if this is a new session
      const hasViewedThisSession = sessionStorage.getItem(VIEWED_SESSION_KEY);
      const storedCount = localStorage.getItem(VIEW_COUNT_KEY);
      const storedFirstVisit = localStorage.getItem(FIRST_VISIT_KEY);

      if (!hasViewedThisSession) {
        // New session - increment count
        const newCount = storedCount ? parseInt(storedCount, 10) + 1 : 1;
        setCount(newCount);
        setIsNewSession(true);

        // Store the new count
        localStorage.setItem(VIEW_COUNT_KEY, newCount.toString());
        sessionStorage.setItem(VIEWED_SESSION_KEY, 'true');

        // Store first visit date if not already set
        if (!storedFirstVisit) {
          const now = new Date().toISOString();
          localStorage.setItem(FIRST_VISIT_KEY, now);
          setFirstVisit(now);
        } else {
          setFirstVisit(storedFirstVisit);
        }
      } else {
        // Returning in same session
        setCount(storedCount ? parseInt(storedCount, 10) : 1);
        setIsNewSession(false);
        setFirstVisit(storedFirstVisit);
      }
    } catch (e) {
      // Fail silently in private browsing or if storage is disabled
      console.warn('Page view tracking disabled:', e);
      setCount(1);
      setIsNewSession(true);
    }
  }, []);

  const increment = useCallback(() => {
    try {
      const storedCount = localStorage.getItem(VIEW_COUNT_KEY);
      const newCount = storedCount ? parseInt(storedCount, 10) + 1 : 1;
      localStorage.setItem(VIEW_COUNT_KEY, newCount.toString());
      setCount(newCount);
    } catch (e) {
      console.warn('Failed to increment view count:', e);
    }
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
