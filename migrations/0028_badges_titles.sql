-- Badges: visual distinctions tied to achievements or special events
CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  rarity TEXT NOT NULL DEFAULT 'common' CHECK(rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  category TEXT NOT NULL CHECK(category IN ('intel', 'investigation', 'social', 'community', 'special')),
  xp_bonus INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- User badges (earned)
CREATE TABLE IF NOT EXISTS user_badges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL REFERENCES badges(id),
  earned_at TEXT NOT NULL DEFAULT (datetime('now')),
  displayed INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, badge_id)
);

-- Badge display slots (max 5 badges shown on profile)
CREATE TABLE IF NOT EXISTS badge_slots (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slot_1 TEXT REFERENCES badges(id),
  slot_2 TEXT REFERENCES badges(id),
  slot_3 TEXT REFERENCES badges(id),
  slot_4 TEXT REFERENCES badges(id),
  slot_5 TEXT REFERENCES badges(id)
);

-- Titles: unlockable display names
CREATE TABLE IF NOT EXISTS titles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  prefix TEXT,
  suffix TEXT,
  color TEXT NOT NULL DEFAULT '#ffffff',
  requirement_type TEXT NOT NULL CHECK(requirement_type IN ('xp', 'level', 'achievement', 'streak', 'special')),
  requirement_value TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- User titles (earned)
CREATE TABLE IF NOT EXISTS user_titles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT NOT NULL REFERENCES titles(id),
  earned_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, title_id)
);

-- Active title selection
CREATE TABLE IF NOT EXISTS active_title (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  title_id TEXT REFERENCES titles(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges(badge_id);
CREATE INDEX IF NOT EXISTS idx_user_titles_user ON user_titles(user_id);
CREATE INDEX IF NOT EXISTS idx_titles_requirement ON titles(requirement_type, requirement_value);

-- Seed badges
INSERT OR IGNORE INTO badges (id, name, description, icon, color, rarity, category, xp_bonus) VALUES
  -- Intel badges
  ('first-report', 'First Report', 'Generated your first threat report', '📝', '#22c55e', 'common', 'intel', 10),
  ('hundred-reports', 'Prolific Author', 'Generated 100 threat reports', '📚', '#3b82f6', 'rare', 'intel', 100),
  ('ioc-hunter', 'IOC Hunter', 'Enriched 100 IOCs', '🎯', '#f59e0b', 'uncommon', 'intel', 50),
  ('apt-specialist', 'APT Specialist', 'Viewed 50 APT actor profiles', '🕵️', '#8b5cf6', 'rare', 'intel', 75),
  ('ransomware-fighter', 'Ransomware Fighter', 'Tracked 25 ransomware families', '⚔️', '#ef4444', 'epic', 'intel', 150),

  -- Investigation badges
  ('case-closed', 'Case Closed', 'Closed your first investigation', '✅', '#22c55e', 'common', 'investigation', 20),
  ('master-detective', 'Master Detective', 'Closed 25 investigations', '🔍', '#6366f1', 'epic', 'investigation', 200),
  ('evidence-collector', 'Evidence Collector', 'Added 50 findings', '🗂️', '#0ea5e9', 'uncommon', 'investigation', 40),
  ('pattern-recognizer', 'Pattern Recognizer', 'Correlated 100 IOCs', '🔗', '#d946ef', 'rare', 'investigation', 100),

  -- Social badges
  ('team-leader', 'Team Leader', 'Created an organization', '👥', '#22c55e', 'common', 'social', 30),
  ('community-pillar', 'Community Pillar', 'Invited 10 members', '🏛️', '#f59e0b', 'rare', 'social', 100),
  ('knowledge-sharer', 'Knowledge Sharer', 'Shared 50 reports', '📤', '#06b6d4', 'uncommon', 'social', 50),

  -- Streak badges
  ('week-warrior', 'Week Warrior', '7-day streak', '🔥', '#f97316', 'common', 'community', 30),
  ('month-master', 'Month Master', '30-day streak', '💎', '#8b5cf6', 'rare', 'community', 150),
  ('centurion', 'Centurion', '100-day streak', '👑', '#eab308', 'legendary', 'community', 500),

  -- XP badges
  ('rising-talent', 'Rising Talent', 'Reached Level 10', '⭐', '#22c55e', 'common', 'community', 25),
  ('seasoned-pro', 'Seasoned Pro', 'Reached Level 25', '🌟', '#3b82f6', 'uncommon', 'community', 75),
  ('elite-analyst', 'Elite Analyst', 'Reached Level 50', '💫', '#8b5cf6', 'epic', 'community', 200),
  ('legendary-status', 'Legendary Status', 'Reached Level 100', '🏆', '#eab308', 'legendary', 'community', 1000),

  -- Special badges
  ('early-adopter', 'Early Adopter', 'Joined during beta', '🚀', '#6366f1', 'epic', 'special', 250),
  ('bug-hunter', 'Bug Hunter', 'Reported a platform bug', '🐛', '#ef4444', 'rare', 'special', 100),
  ('feature-requester', 'Feature Requester', 'Suggested a feature that shipped', '💡', '#f59e0b', 'rare', 'special', 100),
  ('night-owl', 'Night Owl', 'Active between midnight and 6am', '🦉', '#6366f1', 'common', 'special', 15),
  ('speed-demon', 'Speed Demon', 'Completed 10 actions in one session', '⚡', '#ef4444', 'uncommon', 'special', 50);

-- Seed titles
INSERT OR IGNORE INTO titles (id, name, description, prefix, suffix, color, requirement_type, requirement_value, category) VALUES
  -- Level titles
  ('title-newcomer', 'Newcomer', 'Just getting started', null, null, '#9ca3af', 'level', '1', 'general'),
  ('title-analyst', 'Analyst', 'Threat intelligence analyst', null, ' the Analyst', '#22c55e', 'level', '5', 'general'),
  ('title-senior-analyst', 'Senior Analyst', 'Experienced threat analyst', null, ' the Senior Analyst', '#3b82f6', 'level', '10', 'general'),
  ('title-lead-analyst', 'Lead Analyst', 'Leading threat intelligence', null, ' the Lead Analyst', '#8b5cf6', 'level', '20', 'general'),
  ('title-principal-analyst', 'Principal Analyst', 'Principal threat expert', null, ' the Principal', '#d946ef', 'level', '30', 'general'),
  ('title-distinguished', 'Distinguished Analyst', 'Distinguished in the field', 'Distinguished ', null, '#eab308', 'level', '50', 'general'),
  ('title-fellow', 'Fellow', 'Fellow of threat intelligence', 'Fellow ', null, '#ef4444', 'level', '75', 'general'),
  ('title-emeritus', 'Emeritus', 'Lifetime achievement', 'Emeritus ', null, '#f97316', 'level', '100', 'general'),

  -- XP titles
  ('title-rookie', 'Rookie', 'Just starting out', null, ' the Rookie', '#9ca3af', 'xp', '100', 'general'),
  ('title-veteran', 'Veteran', 'Seasoned veteran', null, ' the Veteran', '#22c55e', 'xp', '500', 'general'),
  ('title-expert', 'Expert', 'Recognized expert', null, ' the Expert', '#3b82f6', 'xp', '1000', 'general'),
  ('title-master', 'Master', 'Master of the craft', 'Master ', null, '#8b5cf6', 'xp', '5000', 'general'),
  ('title-legend', 'Legend', 'Legendary analyst', 'Legend ', null, '#eab308', 'xp', '10000', 'general'),

  -- Streak titles
  ('title-committed', 'Committed', 'Dedicated user', null, ' the Committed', '#22c55e', 'streak', '7', 'general'),
  ('title-devoted', 'Devoted', 'Devoted to the craft', null, ' the Devoted', '#3b82f6', 'streak', '30', 'general'),
  ('title-obsessed', 'Obsessed', 'Cannot stop', null, ' the Obsessed', '#8b5cf6', 'streak', '100', 'general'),

  -- Special titles
  ('title-first-blood', 'First Blood', 'First investigation closed', null, ' the First Blood', '#ef4444', 'achievement', 'case-closed', 'investigation'),
  ('title-cyber-detective', 'Cyber Detective', 'Master detective', 'Cyber Detective ', null, '#6366f1', 'achievement', 'master-detective', 'investigation'),
  ('title-threat-hunter', 'Threat Hunter', 'Expert threat hunter', 'Threat Hunter ', null, '#f59e0b', 'achievement', 'apt-specialist', 'intel'),
  ('title-ransomware-slayer', 'Ransomware Slayer', 'Fights ransomware', 'Ransomware Slayer ', null, '#ef4444', 'achievement', 'ransomware-fighter', 'intel'),
  ('title-community-champion', 'Community Champion', 'Builds the community', 'Community Champion ', null, '#22c55e', 'achievement', 'community-pillar', 'social');
