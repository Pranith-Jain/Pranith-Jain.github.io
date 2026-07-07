import { Shield, Skull, Bug, Zap, Flame, Plane } from 'lucide-react';
import type { CtiMode, ExtraLayer } from './useCtiData';

/* ─── Props ────────────────────────────────────────────────────────────── */

interface CtiFiltersProps {
  mode: CtiMode;
  onModeChange: (mode: CtiMode) => void;
  windowDays: number;
  onWindowChange: (days: number) => void;
  layers: Set<ExtraLayer>;
  onLayerToggle: (layer: ExtraLayer) => void;
}

/* ─── Mode tabs ────────────────────────────────────────────────────────── */

const MODES: Array<{ id: CtiMode; label: string; icon: JSX.Element }> = [
  { id: 'severity', label: 'Threat Severity', icon: <Shield size={12} /> },
  { id: 'ransomware', label: 'Ransomware', icon: <Skull size={12} /> },
  { id: 'incident', label: 'Incident Type', icon: <Bug size={12} /> },
];

/* ─── Time windows ─────────────────────────────────────────────────────── */

const WINDOWS = [
  { days: 1, label: '24h' },
  { days: 2, label: '48h' },
  { days: 7, label: '1W' },
  { days: 30, label: '1M' },
  { days: 365, label: '1Y' },
];

/* ─── Extra layers ─────────────────────────────────────────────────────── */

const LAYERS: Array<{ id: ExtraLayer; label: string; icon?: JSX.Element }> = [
  { id: 'c2', label: 'C2' },
  { id: 'breach', label: 'Breach' },
  { id: 'darkweb', label: 'Dark Web' },
  { id: 'cyber_attack', label: 'Cyber Attacks', icon: <Zap size={10} /> },
  { id: 'war_room', label: 'War Room', icon: <Flame size={10} /> },
  { id: 'aircraft', label: 'Aircraft', icon: <Plane size={10} /> },
];

/* ─── Component ────────────────────────────────────────────────────────── */

export default function CtiFilters({
  mode,
  onModeChange,
  windowDays,
  onWindowChange,
  layers,
  onLayerToggle,
}: CtiFiltersProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Mode tabs */}
      <div className="inline-flex rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] overflow-hidden">
        {MODES.map((m) => {
          const on = m.id === mode;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onModeChange(m.id)}
              className={`inline-flex items-center gap-1.5 text-mini font-mono px-3 py-1.5 transition-colors ${
                on
                  ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                  : 'bg-white dark:bg-[rgb(var(--surface-200))] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]'
              }`}
            >
              {m.icon}
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Time window pills */}
      <div className="inline-flex rounded-xl border border-slate-200 dark:border-[rgb(var(--border-400))] overflow-hidden">
        {WINDOWS.map((w) => {
          const on = w.days === windowDays;
          return (
            <button
              key={w.days}
              type="button"
              onClick={() => onWindowChange(w.days)}
              className={`text-mini font-mono px-2.5 py-1.5 transition-colors ${
                on
                  ? 'bg-brand-500/15 text-brand-700 dark:text-brand-300'
                  : 'bg-white dark:bg-[rgb(var(--surface-200))] text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]'
              }`}
            >
              {w.label}
            </button>
          );
        })}
      </div>

      {/* Layer toggles */}
      <div className="inline-flex items-center gap-1.5">
        {LAYERS.map((l) => {
          const on = layers.has(l.id);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => onLayerToggle(l.id)}
              className={`inline-flex items-center gap-1 text-micro font-mono px-2 py-1 rounded-xl border transition-colors ${
                on
                  ? 'border-brand-500/50 bg-brand-500/10 text-brand-700 dark:text-brand-300'
                  : 'border-slate-300 dark:border-[rgb(var(--border-400))] text-slate-400'
              }`}
            >
              {l.icon}
              {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
