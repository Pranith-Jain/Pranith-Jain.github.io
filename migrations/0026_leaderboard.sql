-- User profiles with gamification data
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_active_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Achievement definitions
CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT,
  xp_reward INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL CHECK(category IN ('intel', 'social', 'investigation', 'community')),
  tier TEXT NOT NULL DEFAULT 'bronze' CHECK(tier IN ('bronze', 'silver', 'gold', 'platinum')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- User achievements (earned)
CREATE TABLE IF NOT EXISTS user_achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievements(id),
  earned_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, achievement_id)
);

-- Activity log for XP tracking
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  metadata TEXT, -- JSON blob for action-specific data
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Leaderboard snapshots (cached for performance)
CREATE TABLE IF NOT EXISTS leaderboard_cache (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL CHECK(period IN ('daily', 'weekly', 'monthly', 'alltime')),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  rank INTEGER,
  snapshot_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_xp ON user_profiles(xp DESC);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_leaderboard_cache_period ON leaderboard_cache(period, xp_earned DESC);

-- Seed achievements
INSERT OR IGNORE INTO achievements (id, name, description, icon, xp_reward, category, tier) VALUES
  ('first-login', 'First Steps', 'Log in for the first time', '🎯', 10, 'community', 'bronze'),
  ('threat-hunter', 'Threat Hunter', 'View 100 threat intel reports', '🔍', 50, 'intel', 'bronze'),
  ('ioc-sleuth', 'IOC Sleuth', 'Enrich 50 IOCs', '🔬', 75, 'investigation', 'silver'),
  ('breach-watcher', 'Breach Watcher', 'Monitor 10 breach sources', '👁️', 40, 'intel', 'bronze'),
  ('dark-web-explorer', 'Dark Web Explorer', 'Access 25 dark web sources', '🕵️', 60, 'intel', 'silver'),
  ('report-writer', 'Report Writer', 'Generate 10 threat reports', '📝', 100, 'investigation', 'gold'),
  ('streak-master', 'Streak Master', 'Maintain a 30-day streak', '🔥', 200, 'community', 'gold'),
  ('global-pulse-regular', 'Pulse Regular', 'Check Global Pulse 50 times', '🌍', 80, 'intel', 'silver'),
  ('collaborator', 'Collaborator', 'Invite 5 team members', '🤝', 150, 'social', 'gold'),
  ('intel-pioneer', 'Intel Pioneer', 'Be among first 100 users', '⭐', 500, 'community', 'platinum');
