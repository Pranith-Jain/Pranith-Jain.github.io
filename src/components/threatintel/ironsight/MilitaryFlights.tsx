import { useState, useEffect, useCallback } from 'react';
import { Plane } from 'lucide-react';

interface MilFlight {
  icao24: string;
  callsign: string;
  origin: string;
  lat: number;
  lon: number;
  altitude: number;
  heading: number;
  speed: number;
  type: string;
  aircraftType: string;
  squawk: string;
  isMilitary: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  'ISR Drone (UAV)': '#ef4444',
  'High-Alt ISR/Drone': '#ef4444',
  'SIGINT/ELINT': '#ef4444',
  'Fast Mover': '#ef4444',
  AWACS: '#a855f7',
  JSTARS: '#a855f7',
  'Aerial Tanker': '#06b6d4',
  'Strategic Airlift': '#3b82f6',
  'Tactical Transport': '#3b82f6',
  'Fighter (F-35)': '#ef4444',
  'Fighter (F-16)': '#ef4444',
  'Fighter (F-15)': '#ef4444',
  'Maritime Patrol': '#a855f7',
  Helicopter: '#f59e0b',
  'Military Aircraft': '#94a3b8',
};

export default function MilitaryFlights() {
  const [flights, setFlights] = useState<MilFlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchFlights = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/ironsight/flights', { signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const data = await res.json();
        setFlights(data.flights || []);
        setTotal(data.total || 0);
      }
    } catch {
      /* network error */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchFlights();
    const id = setInterval(fetchFlights, 180000);
    return () => clearInterval(id);
  }, [fetchFlights]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] bg-white dark:bg-[rgb(var(--surface-200))]/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Plane size={16} className="text-indigo-400" />
          <h3 className="text-sm font-bold font-mono text-slate-700 dark:text-slate-200">MIL AIRSPACE</h3>
        </div>
        <span className="text-[10px] font-mono text-slate-400">
          {flights.length} mil / {total} total · adsb.lol
        </span>
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
            ))}
          </div>
        ) : flights.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-4">
            No military aircraft detected
            <br />
            <span className="text-[10px]">(many disable transponders)</span>
          </div>
        ) : (
          flights.slice(0, 20).map((f, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold" style={{ color: TYPE_COLORS[f.type] || '#06b6d4' }}>
                  {f.callsign || f.icao24}
                </span>
                {f.aircraftType && <span className="text-[10px] text-slate-400 font-mono">{f.aircraftType}</span>}
                {f.squawk === '7700' && (
                  <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-red-900/30 text-red-400">EMERG</span>
                )}
              </div>
              <div className="text-right">
                <div className="text-[10px]" style={{ color: TYPE_COLORS[f.type] || '#94a3b8' }}>
                  {f.type}
                </div>
                <div className="text-[9px] text-slate-400 font-mono">{f.altitude.toLocaleString()}ft</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
