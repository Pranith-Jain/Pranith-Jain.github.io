import { useCallback, useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

/**
 * Hook for recording user activities for gamification XP.
 *
 * Usage:
 *   const { trackActivity } = useActivityTracker();
 *   trackActivity('view-report', { reportId: '123' });
 */
export function useActivityTracker() {
  const auth = useContext(AuthContext);
  const user = auth?.user ?? null;

  const trackActivity = useCallback(
    async (action: string, metadata?: Record<string, unknown>) => {
      if (!user) return;

      try {
        await fetch('/api/v1/leaderboard/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, metadata }),
        });
      } catch {
        // Silently fail — activity tracking shouldn't block the user
      }
    },
    [user]
  );

  return { trackActivity };
}
