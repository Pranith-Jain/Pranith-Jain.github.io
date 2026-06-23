import { useState, useCallback } from 'react';
import { Brain, RefreshCw, X, Shield, TrendingUp, TrendingDown, Minus, Eye } from 'lucide-react';

interface CountryIntel {
  country: string;
  overall_threat_level: string;
  executive_summary: string;
  cyber_threats: string;
  geopolitical_risks: string;
  key_actors: string[];
  active_conflicts: string[];
  critical_infrastructure: string;
  recommended_posture: string;
  trend: string;
  trend_rationale: string;
  watch_items: string[];
}

interface CountryIntelPanelProps {
  country: string;
  events?: Array<{ title: string; kind: string; severity: string; source: string }>;
  onClose: () => void;
}

const THREAT_COLORS: Record<string, string> = {
  critical: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  high: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
};

const TREND_ICONS: Record<string, typeof TrendingUp> = {
  improving: TrendingDown,
  stable: Minus,
  deteriorating: TrendingUp,
};

export function CountryIntelPanel({ country, events, onClose }: CountryIntelPanelProps) {
  const [intel, setIntel] = useState<CountryIntel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  const fetchIntel = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/country-intel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country, events }),
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
  }, [country, events]);

  useState(() => {
    fetchIntel();
  });

  const TrendIcon = intel?.trend ? (TREND_ICONS[intel.trend] ?? Minus) : Minus;

  return (
    <div className="rounded-xl border border-brand-500/30 bg-brand-500/5 animate-fade-in overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-brand-500/10">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15">
            <Brain size={16} className="text-brand-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">{country} Intelligence</h3>
              {model && (
                <span className="text-micro font-mono px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400">
                  {model}
                </span>
              )}
            </div>
            <p className="text-micro text-slate-500">Country threat profile</p>
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

      <div className="p-4 space-y-3">
        {loading && !intel && (
          <div className="flex items-center gap-2 justify-center py-6">
            <RefreshCw size={14} className="animate-spin text-brand-400" />
            <span className="text-xs text-slate-400">Generating intelligence brief…</span>
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
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded border ${THREAT_COLORS[intel.overall_threat_level] || ''}`}
              >
                <Shield size={12} />
                {intel.overall_threat_level?.toUpperCase()}
              </span>
              <span
                className={`inline-flex items-center gap-1 text-micro font-mono ${intel.trend === 'deteriorating' ? 'text-rose-400' : intel.trend === 'improving' ? 'text-emerald-400' : 'text-slate-400'}`}
              >
                <TrendIcon size={12} />
                {intel.trend}
              </span>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">{intel.executive_summary}</p>

            {intel.cyber_threats && (
              <div className="rounded-lg bg-rose-500/5 border border-rose-500/10 p-3">
                <span className="text-micro font-mono uppercase text-rose-400 block mb-1">Cyber Threats</span>
                <p className="text-xs text-slate-400">{intel.cyber_threats}</p>
              </div>
            )}

            {intel.geopolitical_risks && (
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/10 p-3">
                <span className="text-micro font-mono uppercase text-amber-400 block mb-1">Geopolitical Risks</span>
                <p className="text-xs text-slate-400">{intel.geopolitical_risks}</p>
              </div>
            )}

            {intel.key_actors?.length > 0 && (
              <div>
                <span className="text-micro font-mono uppercase text-slate-500 block mb-1">Key Actors</span>
                <div className="flex flex-wrap gap-1">
                  {intel.key_actors.map((a, i) => (
                    <span
                      key={i}
                      className="text-micro font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {intel.active_conflicts?.length > 0 && (
              <div>
                <span className="text-micro font-mono uppercase text-slate-500 block mb-1">Active Conflicts</span>
                <div className="flex flex-wrap gap-1">
                  {intel.active_conflicts.map((c, i) => (
                    <span
                      key={i}
                      className="text-micro font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {intel.watch_items?.length > 0 && (
              <div className="rounded-lg bg-cyan-500/5 border border-cyan-500/10 p-3">
                <span className="text-micro font-mono uppercase text-cyan-400 block mb-1 flex items-center gap-1">
                  <Eye size={10} /> Watch List
                </span>
                <ul className="space-y-0.5">
                  {intel.watch_items.map((w, i) => (
                    <li key={i} className="text-xs text-slate-400 flex items-start gap-1">
                      <span className="text-cyan-400">•</span>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {intel.recommended_posture && (
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3">
                <span className="text-micro font-mono uppercase text-emerald-400 block mb-1">Recommended Posture</span>
                <p className="text-xs text-slate-400">{intel.recommended_posture}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
