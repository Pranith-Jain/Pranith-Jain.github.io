import { severityColor, SEVERITY_ORDER, type Severity } from './geo';

/* ─── Legend overlay ────────────────────────────────────────────────────── */

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

export default function SeverityLegend(): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-900/80 backdrop-blur-sm border border-slate-700/50">
      <span className="text-micro font-mono uppercase tracking-wider text-slate-400">Severity</span>
      <div className="flex items-center gap-2">
        {SEVERITY_ORDER.map((sev) => (
          <div key={sev} className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: severityColor(sev) }} />
            <span className="text-micro font-mono text-slate-400">{SEVERITY_LABELS[sev]}</span>
          </div>
        ))}
      </div>
      <span className="text-micro font-mono text-slate-500 ml-2 border-l border-slate-700 pl-2">
        Arcs = observed source telemetry → focal target
      </span>
    </div>
  );
}
