import { useState, useCallback } from 'react';
import { RefreshCw, X, Shield, Eye } from 'lucide-react';

interface LeakSite {
  name: string;
  recent_activity: string;
  victim_count: string;
  sectors_targeted: string[];
  threat_assessment: string;
}

interface ForumChatter {
  topic: string;
  platform: string;
  sentiment: string;
  threat_relevance: string;
}

interface DarkwebIntel {
  executive_summary: string;
  threat_level: string;
  active_leak_sites: LeakSite[];
  forum_chatter: ForumChatter[];
  emerging_threats: string[];
  recommended_monitoring: string[];
}

const THREAT_COLORS: Record<string, string> = {
  critical: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  high: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
};

interface DarkWebDashboardProps {
  items: Array<{ title: string; source: string; description?: string; category?: string }>;
  onClose: () => void;
}

export function DarkWebDashboard({ items, onClose }: DarkWebDashboardProps) {
  const [intel, setIntel] = useState<DarkwebIntel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const fetchIntel = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/darkweb-intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setIntel(data.intel);
      setModel(data.model);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [items]);

  useState(() => {
    fetchIntel();
  });

  return (
    <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 animate-fade-in overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-500/10">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15">
            <Eye size={16} className="text-brand-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Dark Web Intelligence</h3>
              {model && (
                <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400">
                  {model}
                </span>
              )}
            </div>
            <p className="text-micro text-slate-500">{items.length} monitoring items</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchIntel}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 max-h-[600px] overflow-y-auto">
        {loading && !intel && (
          <div className="flex items-center gap-2 justify-center py-6">
            <RefreshCw size={14} className="animate-spin text-brand-400" />
            <span className="text-xs text-slate-400">Analyzing dark web activity…</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-center">
            <p className="text-xs text-rose-400">{error}</p>
          </div>
        )}

        {intel && (
          <>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded border ${THREAT_COLORS[intel.threat_level] || ''}`}
              >
                <Shield size={12} />
                {intel.threat_level?.toUpperCase()}
              </span>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">{intel.executive_summary}</p>

            {intel.active_leak_sites?.length > 0 && (
              <div>
                <span className="text-micro font-mono uppercase text-slate-500 block mb-2">Active Leak Sites</span>
                <div className="space-y-2">
                  {intel.active_leak_sites.map((site, i) => (
                    <div key={i} className="rounded-lg bg-slate-800/50 p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-200">{site.name}</span>
                        <span
                          className={`text-micro font-mono px-1.5 py-0.5 rounded ${THREAT_COLORS[site.threat_assessment] || ''}`}
                        >
                          {site.threat_assessment}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{site.recent_activity}</p>
                      <div className="flex items-center gap-2 text-micro text-slate-500">
                        <span>Victims: {site.victim_count}</span>
                        {site.sectors_targeted?.length > 0 && <span>Sectors: {site.sectors_targeted.join(', ')}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {intel.forum_chatter?.length > 0 && (
              <div>
                <span className="text-micro font-mono uppercase text-slate-500 block mb-2">Forum Chatter</span>
                <div className="space-y-1">
                  {intel.forum_chatter.map((chatter, i) => (
                    <div key={i} className="rounded-lg bg-slate-800/30 p-2 flex items-center gap-2">
                      <span
                        className={`text-micro font-mono px-1.5 py-0.5 rounded ${THREAT_COLORS[chatter.threat_relevance] || ''}`}
                      >
                        {chatter.sentiment}
                      </span>
                      <span className="text-xs text-slate-300 flex-1">{chatter.topic}</span>
                      <span className="text-micro text-slate-500">{chatter.platform}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {intel.emerging_threats?.length > 0 && (
              <div>
                <span className="text-micro font-mono uppercase text-slate-500 block mb-1">Emerging Threats</span>
                <div className="flex flex-wrap gap-1">
                  {intel.emerging_threats.map((t, i) => (
                    <span
                      key={i}
                      className="text-micro font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
