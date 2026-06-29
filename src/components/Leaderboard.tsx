import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Trophy, Flame, Star, TrendingUp } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  xp: number;
  level: number;
  streak_days: number;
}

interface UserProfile {
  user_id: string;
  xp: number;
  level: number;
  streak_days: number;
}

type Period = 'daily' | 'weekly' | 'monthly' | 'alltime';

const PERIOD_LABELS: Record<Period, string> = {
  daily: 'Today',
  weekly: 'This Week',
  monthly: 'This Month',
  alltime: 'All Time',
};

const TIER_COLORS: Record<number, string> = {
  1: 'text-yellow-400',
  2: 'text-slate-300',
  3: 'text-amber-600',
};

export default function Leaderboard() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>('alltime');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
    if (user) fetchMyProfile();
  }, [period, user]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/leaderboard?period=${period}&limit=50`);
      const data = await res.json();
      setEntries(data.entries || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const fetchMyProfile = async () => {
    try {
      const res = await fetch('/api/v1/leaderboard/me');
      const data = await res.json();
      setMyProfile(data.profile);
      setMyRank(data.rank);
    } catch {
      // ignore
    }
  };

  const getXpForNextLevel = (level: number) => level * 100;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-500/10 border border-yellow-500/30 mb-3">
          <Trophy size={16} className="text-yellow-500" />
          <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">Leaderboard</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Top Analysts</h2>
      </div>

      {/* Period Selector */}
      <div className="flex justify-center gap-1 mb-6">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-colors ${
              period === p
                ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* My Stats */}
      {user && myProfile && (
        <div className="mb-6 p-4 rounded-xl border border-brand-500/30 bg-brand-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-500/20 flex items-center justify-center">
                <Star size={18} className="text-brand-500" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Your Rank</div>
                <div className="text-xs text-slate-500">Level {myProfile.level}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-brand-600 dark:text-brand-400">#{myRank || '—'}</div>
              <div className="text-xs text-slate-500">{myProfile.xp} XP</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>Level {myProfile.level}</span>
              <span>
                {myProfile.xp}/{getXpForNextLevel(myProfile.level)} XP
              </span>
            </div>
            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full transition-all"
                style={{ width: `${Math.min((myProfile.xp / getXpForNextLevel(myProfile.level)) * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard List */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No entries yet</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {entries.map((entry) => (
              <div
                key={entry.user_id}
                className={`flex items-center gap-4 px-4 py-3 ${entry.user_id === user?.id ? 'bg-brand-500/5' : ''}`}
              >
                {/* Rank */}
                <div className={`w-8 text-center font-mono font-bold ${TIER_COLORS[entry.rank] || 'text-slate-400'}`}>
                  {entry.rank <= 3 ? (
                    <span className="text-lg">{entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}</span>
                  ) : (
                    <span className="text-sm">#{entry.rank}</span>
                  )}
                </div>

                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-400">
                  {(entry.display_name || 'U')[0].toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {entry.display_name || 'Anonymous'}
                    {entry.user_id === user?.id && <span className="ml-2 text-xs text-brand-500">(you)</span>}
                  </div>
                  <div className="text-xs text-slate-400">Level {entry.level}</div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs">
                  {entry.streak_days > 0 && (
                    <div className="flex items-center gap-1 text-orange-500">
                      <Flame size={12} />
                      <span>{entry.streak_days}d</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-brand-500">
                    <TrendingUp size={12} />
                    <span className="font-mono">{entry.xp.toLocaleString()} XP</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
