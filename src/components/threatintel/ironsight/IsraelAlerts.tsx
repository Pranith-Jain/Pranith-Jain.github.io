import { useState, useEffect, useCallback, useRef } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Volume2, VolumeX } from 'lucide-react';

interface AlertEvent {
  id: string;
  time: string;
  type: string;
  threat: string;
  locations: string[];
  source: string;
}
interface AlertData {
  status: 'ACTIVE' | 'CLEAR';
  activeCount: number;
  alerts: AlertEvent[];
  lastChecked: string;
}

const TYPE_ICONS: Record<string, string> = {
  MISSILE: '🚀',
  ROCKET: '🎯',
  DRONE: '✈',
  MORTAR: '💣',
  INFILTRATION: '⚠',
  ALERT: '🔴',
};

function playAlertSound() {
  try {
    const ctx = new (
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
    [0, 0.2, 0.4].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime([880, 1100, 1320][i], ctx.currentTime + t);
      gain.gain.setValueAtTime(0.08, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + t + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.18);
    });
    setTimeout(() => ctx.close(), 800);
  } catch {
    /* audio unavailable */
  }
}

export default function IsraelAlerts() {
  const [data, setData] = useState<AlertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);
  const prevStatus = useRef('CLEAR');

  useEffect(() => {
    const h = () => {
      setHasInteracted(true);
      window.removeEventListener('click', h);
    };
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/ironsight/alerts', { signal: AbortSignal.timeout(15000) });
      if (res.ok) setData(await res.json());
    } catch {
      /* network error */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, 5000);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  useEffect(() => {
    if (data?.status === 'ACTIVE' && prevStatus.current === 'CLEAR' && soundEnabled && hasInteracted) playAlertSound();
    if (data) prevStatus.current = data.status;
  }, [data, soundEnabled, hasInteracted]);

  const isActive = data?.status === 'ACTIVE';

  return (
    <div className={`surface-card p-4 ${isActive ? 'border-red-500/50 bg-red-500/5 ring-1 ring-red-500/20' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isActive ? (
            <ShieldAlert size={16} className="text-red-400 animate-pulse" />
          ) : (
            <ShieldCheck size={16} className="text-emerald-400" />
          )}
          <h3 className="text-tool font-bold font-mono text-slate-700 dark:text-slate-200">ISRAEL ALERT STATUS</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <span className={`text-meta font-mono font-bold ${isActive ? 'text-red-400' : 'text-emerald-400'}`}>
            {isActive ? `${data?.activeCount} ACTIVE` : 'ALL CLEAR'}
          </span>
        </div>
      </div>
      {loading ? (
        <div className="h-16 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ) : isActive ? (
        <div className="space-y-2">
          {data?.alerts.slice(0, 5).map((alert, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <span className="text-sm">{TYPE_ICONS[alert.type] || '🔴'}</span>
              <div className="min-w-0 flex-1">
                <div className="text-meta font-bold text-red-400">{alert.type}</div>
                <div className="text-tool text-slate-600 dark:text-slate-300">{alert.threat}</div>
                <div className="text-mini text-slate-400">{alert.locations.join(', ')}</div>
              </div>
              <span className="text-mini text-slate-400 ml-auto shrink-0">
                {new Date(alert.time).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-4">
          <Shield size={24} className="text-emerald-400 mb-2" />
          <div className="text-tool text-emerald-400 font-bold">ALL CLEAR</div>
          <div className="text-mini text-slate-400 mt-1">Polling 5s · Pikud HaOref</div>
        </div>
      )}
    </div>
  );
}
