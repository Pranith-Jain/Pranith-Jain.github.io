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
  'ISR Drone (UAV)': 'text-red-400',
  'High-Alt ISR/Drone': 'text-red-400',
  'SIGINT/ELINT': 'text-red-400',
  'Fast Mover': 'text-red-400',
  AWACS: 'text-purple-400',
  JSTARS: 'text-purple-400',
  'Aerial Tanker': 'text-cyan-400',
  'Strategic Airlift': 'text-blue-400',
  'Tactical Transport': 'text-blue-400',
  'Fighter (F-35)': 'text-red-400',
  'Fighter (F-16)': 'text-red-400',
  'Fighter (F-15)': 'text-red-400',
  'Maritime Patrol': 'text-purple-400',
  Helicopter: 'text-amber-400',
  'Military Aircraft': 'text-slate-400',
};

export default function MilitaryFlights() {
  const [flights, setFlights] = useState<MilFlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const fetchFlights = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/ironsight/flights', { signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const d = await res.json();
        setFlights(d.flights || []);
        setTotal(d.total || 0);
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
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Plane size={16} className="text-indigo-400" />
          <h3 className="text-tool font-bold font-mono text-slate-700 dark:text-slate-200">MIL AIRSPACE</h3>
        </div>
        <span className="text-mini font-mono text-slate-400">
          {flights.length} mil / {total} total · adsb.lol
        </span>
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 rounded-xl bg-slate-100 dark:bg-[rgb(var(--surface-200))] animate-pulse" />
            ))}
          </div>
        ) : flights.length === 0 ? (
          <div className="text-center text-tool text-slate-400 py-4">
            No military aircraft detected
            <br />
            <span className="text-mini">(many disable transponders)</span>
          </div>
        ) : (
          flights.slice(0, 20).map((f, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <div className="flex items-center gap-2">
                <span className={`text-tool font-mono font-bold ${TYPE_COLORS[f.type] || 'text-cyan-400'}`}>
                  {f.callsign || f.icao24}
                </span>
                {f.aircraftType && <span className="text-mini text-slate-400 font-mono">{f.aircraftType}</span>}
                {f.squawk === '7700' && (
                  <span className="text-mini font-bold px-1 py-0.5 rounded bg-red-900/30 text-red-400">EMERG</span>
                )}
              </div>
              <div className="text-right">
                <div className={`text-mini ${TYPE_COLORS[f.type] || 'text-slate-400'}`}>{f.type}</div>
                <div className="text-mini text-slate-400 font-mono">{f.altitude.toLocaleString()}ft</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
