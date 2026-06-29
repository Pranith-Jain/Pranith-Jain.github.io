import { useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook for recording user activities for gamification XP.
 *
 * Usage:
 *   const { trackActivity } = useActivityTracker();
 *   trackActivity('view-report', { reportId: '123' });
 */
export function useActivityTracker() {
  const { user } = useAuth();

  const trackActivity = useCallback(
    async (action: string, metadata?: Record<string, unknown>) => {
      if (!user) return; // Only track for logged-in users

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
