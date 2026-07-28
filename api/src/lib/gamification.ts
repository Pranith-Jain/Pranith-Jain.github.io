/**
 * Gamification module.
 *
 * Handles XP tracking, achievements, levels, streaks, and leaderboards.
 * Designed for Cloudflare Workers + D1.
 */

import type { D1Database } from '@cloudflare/workers-types';

/* ─── Types ────────────────────────────────────────────────────────────────── */

export interface UserProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  xp: number;
  level: number;
  streak_days: number;
  last_active_at: string | null;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string | null;
  xp_reward: number;
  category: string;
  tier: string;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  xp: number;
  level: number;
  streak_days: number;
}

/* ─── XP & Leveling ────────────────────────────────────────────────────────── */

const XP_PER_LEVEL = 100;
const MAX_LEVEL = 100;

function calculateLevel(xp: number): number {
  return Math.min(Math.floor(xp / XP_PER_LEVEL) + 1, MAX_LEVEL);
}

/* ─── Activity Actions ──────────────────────────────────────────────────────── */

const ACTION_XP: Record<string, number> = {
  'view-report': 5,
  'enrich-ioc': 10,
  'generate-report': 25,
  'check-pulse': 2,
  login: 10,
  'invite-member': 15,
  'submit-intel': 20,
  'complete-investigation': 50,
};

export async function recordActivity(
  db: D1Database,
  userId: string,
  action: string,
  metadata?: Record<string, unknown>
): Promise<{ xpEarned: number; achievementEarned?: Achievement }> {
  const xp = ACTION_XP[action] || 0;

  // Record activity
  await db
    .prepare('INSERT INTO activity_log (id, user_id, action, xp_earned, metadata) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), userId, action, xp, metadata ? JSON.stringify(metadata) : null)
    .run();

  // Update user XP and level
  const profile = await db
    .prepare('SELECT xp, level FROM user_profiles WHERE user_id = ?')
    .bind(userId)
    .first<{ xp: number; level: number }>();

  if (profile) {
    const newXP = profile.xp + xp;
    const newLevel = calculateLevel(newXP);
    await db
      .prepare(
        "UPDATE user_profiles SET xp = ?, level = ?, last_active_at = datetime('now'), updated_at = datetime('now') WHERE user_id = ?"
      )
      .bind(newXP, newLevel, userId)
      .run();
  }

  // Check for achievement unlocks
  const achievement = await checkAchievements(db, userId, action);

  return { xpEarned: xp, achievementEarned: achievement };
}

/* ─── Achievement Checking ──────────────────────────────────────────────────── */

async function checkAchievements(db: D1Database, userId: string, action: string): Promise<Achievement | undefined> {
  // Get unearned achievements
  const { results: unearned } = await db
    .prepare(
      `SELECT a.* FROM achievements a
       WHERE a.id NOT IN (
         SELECT achievement_id FROM user_achievements WHERE user_id = ?
       )`
    )
    .bind(userId)
    .all<Achievement>();

  for (const achievement of unearned) {
    let earned = false;

    switch (achievement.id) {
      case 'first-login':
        earned = action === 'login';
        break;
      case 'threat-hunter': {
        const count = await db
          .prepare("SELECT COUNT(*) as cnt FROM activity_log WHERE user_id = ? AND action = 'view-report'")
          .bind(userId)
          .first<{ cnt: number }>();
        earned = (count?.cnt ?? 0) >= 100;
        break;
      }
      case 'ioc-sleuth': {
        const count = await db
          .prepare("SELECT COUNT(*) as cnt FROM activity_log WHERE user_id = ? AND action = 'enrich-ioc'")
          .bind(userId)
          .first<{ cnt: number }>();
        earned = (count?.cnt ?? 0) >= 50;
        break;
      }
      case 'global-pulse-regular': {
        const count = await db
          .prepare("SELECT COUNT(*) as cnt FROM activity_log WHERE user_id = ? AND action = 'check-pulse'")
          .bind(userId)
          .first<{ cnt: number }>();
        earned = (count?.cnt ?? 0) >= 50;
        break;
      }
      case 'report-writer': {
        const count = await db
          .prepare("SELECT COUNT(*) as cnt FROM activity_log WHERE user_id = ? AND action = 'generate-report'")
          .bind(userId)
          .first<{ cnt: number }>();
        earned = (count?.cnt ?? 0) >= 10;
        break;
      }
      case 'collaborator': {
        const count = await db
          .prepare("SELECT COUNT(*) as cnt FROM activity_log WHERE user_id = ? AND action = 'invite-member'")
          .bind(userId)
          .first<{ cnt: number }>();
        earned = (count?.cnt ?? 0) >= 5;
        break;
      }
    }

    if (earned) {
      await db
        .prepare('INSERT INTO user_achievements (id, user_id, achievement_id) VALUES (?, ?, ?)')
        .bind(crypto.randomUUID(), userId, achievement.id)
        .run();

      // Award XP for achievement
      await db
        .prepare('UPDATE user_profiles SET xp = xp + ? WHERE user_id = ?')
        .bind(achievement.xp_reward, userId)
        .run();

      return achievement;
    }
  }

  return undefined;
}

/* ─── Streak Management ─────────────────────────────────────────────────────── */

export async function updateStreak(
  db: D1Database,
  userId: string
): Promise<{ streakDays: number; isNewStreak: boolean }> {
  const profile = await db
    .prepare('SELECT streak_days, last_active_at FROM user_profiles WHERE user_id = ?')
    .bind(userId)
    .first<{ streak_days: number; last_active_at: string | null }>();

  if (!profile) {
    return { streakDays: 0, isNewStreak: false };
  }

  const now = new Date();
  const lastActive = profile.last_active_at ? new Date(profile.last_active_at) : null;

  if (!lastActive) {
    // First activity
    await db
      .prepare("UPDATE user_profiles SET streak_days = 1, last_active_at = datetime('now') WHERE user_id = ?")
      .bind(userId)
      .run();
    return { streakDays: 1, isNewStreak: true };
  }

  const daysSinceLastActive = Math.floor((now.getTime() - lastActive.getTime()) / (24 * 60 * 60 * 1000));

  let newStreak: number;
  let isNewStreak = false;

  if (daysSinceLastActive === 0) {
    // Same day, no change
    newStreak = profile.streak_days;
  } else if (daysSinceLastActive === 1) {
    // Consecutive day
    newStreak = profile.streak_days + 1;
    isNewStreak = true;
  } else {
    // Streak broken
    newStreak = 1;
    isNewStreak = true;
  }

  await db
    .prepare("UPDATE user_profiles SET streak_days = ?, last_active_at = datetime('now') WHERE user_id = ?")
    .bind(newStreak, userId)
    .run();

  return { streakDays: newStreak, isNewStreak };
}

/* ─── Leaderboard ───────────────────────────────────────────────────────────── */

export async function getLeaderboard(
  db: D1Database,
  period: 'daily' | 'weekly' | 'monthly' | 'alltime' = 'alltime',
  limit: number = 50
): Promise<LeaderboardEntry[]> {
  let timeFilter = '';
  switch (period) {
    case 'daily':
      timeFilter = "AND al.created_at >= datetime('now', '-1 day')";
      break;
    case 'weekly':
      timeFilter = "AND al.created_at >= datetime('now', '-7 days')";
      break;
    case 'monthly':
      timeFilter = "AND al.created_at >= datetime('now', '-30 days')";
      break;
    default:
      timeFilter = '';
  }

  const { results } = await db
    .prepare(
      `SELECT
        up.user_id,
        up.display_name,
        up.avatar_url,
        up.xp,
        up.level,
        up.streak_days,
        COALESCE(SUM(al.xp_earned), 0) as period_xp
       FROM user_profiles up
       LEFT JOIN activity_log al ON up.user_id = al.user_id ${timeFilter}
       GROUP BY up.user_id
       ORDER BY period_xp DESC, up.xp DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<LeaderboardEntry & { period_xp: number }>();

  return (results || []).map((entry, index) => ({
    rank: index + 1,
    user_id: entry.user_id,
    display_name: entry.display_name,
    avatar_url: entry.avatar_url,
    xp: entry.period_xp || entry.xp,
    level: entry.level,
    streak_days: entry.streak_days,
  }));
}

/* ─── Profile Management ────────────────────────────────────────────────────── */

export async function getOrCreateProfile(db: D1Database, userId: string): Promise<UserProfile> {
  let profile = await db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').bind(userId).first<UserProfile>();

  if (!profile) {
    await db.prepare('INSERT INTO user_profiles (user_id) VALUES (?)').bind(userId).run();

    profile = await db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').bind(userId).first<UserProfile>();
  }

  return profile!;
}

export async function updateProfile(
  db: D1Database,
  userId: string,
  updates: { display_name?: string; avatar_url?: string; bio?: string }
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.display_name !== undefined) {
    sets.push('display_name = ?');
    values.push(updates.display_name);
  }
  if (updates.avatar_url !== undefined) {
    sets.push('avatar_url = ?');
    values.push(updates.avatar_url);
  }
  if (updates.bio !== undefined) {
    sets.push('bio = ?');
    values.push(updates.bio);
  }

  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");
  values.push(userId);

  await db
    .prepare(`UPDATE user_profiles SET ${sets.join(', ')} WHERE user_id = ?`)
    .bind(...values)
    .run();
}

export async function getUserAchievements(db: D1Database, userId: string): Promise<Achievement[]> {
  const { results } = await db
    .prepare(
      `SELECT a.* FROM achievements a
       JOIN user_achievements ua ON a.id = ua.achievement_id
       WHERE ua.user_id = ?
       ORDER BY ua.earned_at DESC`
    )
    .bind(userId)
    .all<Achievement>();

  return results || [];
}
