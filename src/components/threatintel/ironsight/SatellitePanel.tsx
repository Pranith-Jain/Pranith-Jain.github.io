import { useState, useEffect, useCallback } from 'react';
import { Satellite } from 'lucide-react';

interface FireEvent {
  lat: number;
  lon: number;
  brightness: number;
  frp: number;
  confidence: string;
  intensity: 'low' | 'medium' | 'high' | 'extreme';
  datetime: string;
  possibleExplosion: boolean;
}

const INTENSITY_COLORS: Record<string, string> = {
  low: '#94a3b8',
  medium: '#f59e0b',
  high: '#f97316',
  extreme: '#ef4444',
};

function getRegion(lat: number, lon: number): string {
  if (lat > 29 && lat < 34 && lon > 34 && lon < 36) return 'Israel';
  if (lat > 24 && lat < 38 && lon > 44 && lon < 64) return 'Iran';
  if (lat > 29 && lat < 38 && lon > 38 && lon < 49) return 'Iraq';
  if (lat > 32 && lat < 38 && lon > 35 && lon < 43) return 'Syria';
  if (lat > 33 && lat < 35 && lon > 35 && lon < 37) return 'Lebanon';
  if (lat > 12 && lat < 19 && lon > 42 && lon < 55) return 'Yemen';
  if (lat > 16 && lat < 33 && lon > 34 && lon < 56) return 'Saudi Arabia';
  return 'Middle East';
}

export default function SatellitePanel() {
  const [events, setEvents] = useState<FireEvent[]>([]);
  const [stats, setStats] = useState({ total: 0, highIntensity: 0, flagged: 0 });
  const [loading, setLoading] = useState(true);

  const fetchFires = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/ironsight/fires', { signal: AbortSignal.timeout(35000) });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setStats({
          total: data.total || 0,
          highIntensity: data.highIntensity || 0,
          flagged: data.possibleExplosions || 0,
        });
      }
    } catch {
      /* network error */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFires();
    const id = setInterval(fetchFires, 600000);
    return () => clearInterval(id);
  }, [fetchFires]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Satellite size={16} className="text-orange-400" />
          <h3 className="text-sm font-bold font-mono text-slate-700 dark:text-slate-200">SAT THERMAL DETECT</h3>
        </div>
        <span className="text-[10px] font-mono text-slate-400">NASA FIRMS</span>
      </div>
      <div className="flex gap-4 mb-3">
        <div className="text-center">
          <div className="text-sm font-bold text-slate-800 dark:text-white">{stats.total}</div>
          <div className="text-[9px] text-slate-400">HOTSPOTS</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-orange-400">{stats.highIntensity}</div>
          <div className="text-[9px] text-slate-400">HIGH INT</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-red-400">{stats.flagged}</div>
          <div className="text-[9px] text-slate-400">FLAGGED</div>
        </div>
      </div>
      <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-8 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-4">No thermal anomalies detected</div>
        ) : (
          events.slice(0, 15).map((e, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 py-1 px-2 rounded ${e.possibleExplosion ? 'bg-red-500/5' : ''}`}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: INTENSITY_COLORS[e.intensity] }} />
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-medium text-slate-700 dark:text-slate-200">
                  {getRegion(e.lat, e.lon)}
                </span>
                {e.possibleExplosion && (
                  <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-red-500/10 text-red-400 ml-1">
                    FLAGGED
                  </span>
                )}
                <div className="text-[9px] text-slate-400">
                  FRP: {e.frp} MW · {e.lat.toFixed(2)}, {e.lon.toFixed(2)}
                </div>
              </div>
              <span className="text-[9px] font-bold shrink-0" style={{ color: INTENSITY_COLORS[e.intensity] }}>
                {e.intensity.toUpperCase()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
