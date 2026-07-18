import { useState, useEffect, useCallback } from 'react';
import { Globe } from 'lucide-react';

interface CountryEvent {
  title: string;
  source: string;
  time: string;
  url: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}
interface CountryAlert {
  name: string;
  flag: string;
  color: string;
  events: CountryEvent[];
  level: string;
}

const LEVEL_CONFIG: Record<string, { color: string; label: string }> = {
  CLEAR: { color: 'text-emerald-400', label: 'CLEAR' },
  MONITORING: { color: 'text-blue-400', label: 'MONITOR' },
  ALERT: { color: 'text-amber-400', label: 'ALERT' },
  CRITICAL: { color: 'text-red-400', label: 'CRITICAL' },
};

function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return 'just now';
  if (abs < 3600) return `${Math.floor(abs / 60)}m ago`;
  if (abs < 86400) return `${Math.floor(abs / 3600)}h ago`;
  return `${Math.floor(abs / 86400)}d ago`;
}

export default function RegionalThreats() {
  const [alerts, setAlerts] = useState<CountryAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const fetchRegional = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/ironsight/regional', { signal: AbortSignal.timeout(60000) });
      if (res.ok) setAlerts((await res.json()).alerts || []);
    } catch {
      /* */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRegional();
    const id = setInterval(fetchRegional, 60000);
    return () => clearInterval(id);
  }, [fetchRegional]);

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-purple-400" />
          <h3 className="text-tool font-bold font-mono text-slate-700 dark:text-slate-200">REGIONAL THREAT MONITOR</h3>
        </div>
        <span className="text-mini font-mono text-slate-400">
          {alerts.filter((a) => a.level !== 'CLEAR').length} active
        </span>
      </div>
      <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 rounded-xl bg-slate-100 dark:bg-[rgb(var(--surface-200))] animate-pulse" />
            ))}
          </div>
        ) : (
          alerts.map((country, i) => {
            const lvl = LEVEL_CONFIG[country.level]!;
            const isCollapsed = collapsed.has(country.name);
            return (
              <div key={i} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                <div
                  className="flex items-center justify-between py-1.5 px-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded transition-colors"
                  style={{ borderLeft: `3px solid ${country.color || '#888'}` }}
                  onClick={() =>
                    setCollapsed((p) => {
                      const n = new Set(p);
                      n.has(country.name) ? n.delete(country.name) : n.add(country.name);
                      return n;
                    })
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-mini text-slate-400">{isCollapsed ? '▸' : '▾'}</span>
                    <span className="text-xs">{country.flag}</span>
                    <span className="text-tool font-bold" style={{ color: country.color || '#888' }}>
                      {country.name}
                    </span>
                  </div>
                  <span className={`text-mini font-bold px-1.5 py-0.5 rounded ${lvl.color} bg-current/10`}>
                    {lvl.label}
                  </span>
                </div>
                {!isCollapsed &&
                  country.events.slice(0, 3).map((event, j) => (
                    <a
                      key={j}
                      href={event.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block px-4 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                      style={{ paddingLeft: 20 }}
                    >
                      <div className="flex items-start gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${event.severity === 'critical' ? 'bg-red-400' : event.severity === 'high' ? 'bg-orange-400' : event.severity === 'medium' ? 'bg-amber-400' : 'bg-blue-400'}`}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-mini text-slate-700 dark:text-slate-200 leading-tight line-clamp-1">
                            {event.title}
                          </p>
                          <span className="text-mini text-slate-400">
                            {event.source} · {timeAgo(event.time)}
                          </span>
                        </div>
                      </div>
                    </a>
                  ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
