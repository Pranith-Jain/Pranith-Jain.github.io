/**
 * Leaderboard routes.
 *
 * GET /api/v1/leaderboard — Get leaderboard
 * GET /api/v1/leaderboard/me — Get current user's rank
 * GET /api/v1/profile/:userId — Get user profile
 * PUT /api/v1/profile — Update current user's profile
 * GET /api/v1/achievements — List all achievements
 * GET /api/v1/achievements/me — Get current user's achievements
 * POST /api/v1/activity — Record an activity
 */

import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import {
  getLeaderboard,
  getOrCreateProfile,
  updateProfile,
  getUserAchievements,
  recordActivity,
  updateStreak,
} from '../lib/gamification';
import { validateSession } from '../lib/user-auth';

interface LeaderboardEnv {
  BRIEFINGS_DB: D1Database;
}

const leaderboard = new Hono<{ Bindings: LeaderboardEnv }>();

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function getTokenFromCookie(cookieHeader: string | undefined | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/session_token=([^;]+)/);
  return match?.[1] ?? null;
}

async function requireUser(c: any) {
  const token = getTokenFromCookie(c.req.header('cookie'));
  if (!token) return null;
  return validateSession(c.env.BRIEFINGS_DB, token);
}

/* ─── Routes ───────────────────────────────────────────────────────────────── */

leaderboard.get('/', async (c) => {
  const period = (c.req.query('period') || 'alltime') as 'daily' | 'weekly' | 'monthly' | 'alltime';
  const limit = parseInt(c.req.query('limit') || '50', 10);

  const entries = await getLeaderboard(c.env.BRIEFINGS_DB, period, Math.min(limit, 100));
  return c.json({ entries, period });
});

leaderboard.get('/me', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const profile = await getOrCreateProfile(c.env.BRIEFINGS_DB, user.id);
  const achievements = await getUserAchievements(c.env.BRIEFINGS_DB, user.id);

  // Get rank
  const rankResult = await c.env.BRIEFINGS_DB.prepare(`SELECT COUNT(*) as rank FROM user_profiles WHERE xp > ?`)
    .bind(profile.xp)
    .first<{ rank: number }>();

  return c.json({
    profile,
    achievements,
    rank: (rankResult?.rank ?? 0) + 1,
  });
});

leaderboard.get('/profile/:userId', async (c) => {
  const userId = c.req.param('userId');
  const profile = await getOrCreateProfile(c.env.BRIEFINGS_DB, userId);
  const achievements = await getUserAchievements(c.env.BRIEFINGS_DB, userId);

  return c.json({ profile, achievements });
});

leaderboard.put('/profile', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json<{ display_name?: string; avatar_url?: string; bio?: string }>();
  await updateProfile(c.env.BRIEFINGS_DB, user.id, body);

  const profile = await getOrCreateProfile(c.env.BRIEFINGS_DB, user.id);
  return c.json({ profile });
});

leaderboard.get('/achievements', async (c) => {
  const { results } = await c.env.BRIEFINGS_DB.prepare('SELECT * FROM achievements ORDER BY category, tier').all();

  return c.json({ achievements: results || [] });
});

leaderboard.get('/achievements/me', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const achievements = await getUserAchievements(c.env.BRIEFINGS_DB, user.id);
  return c.json({ achievements });
});

leaderboard.post('/activity', async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json<{ action: string; metadata?: Record<string, unknown> }>();
  if (!body.action) {
    return c.json({ error: 'Action required' }, 400);
  }

  const result = await recordActivity(c.env.BRIEFINGS_DB, user.id, body.action, body.metadata);

  // Update streak on login
  if (body.action === 'login') {
    await updateStreak(c.env.BRIEFINGS_DB, user.id);
  }

  return c.json(result);
});

export default leaderboard;
