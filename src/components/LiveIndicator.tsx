import type { ReactNode } from 'react';

interface LiveIndicatorProps {
  /** Main label next to the pulse, e.g. "Live · platform telemetry" or
   *  "Live · ransomware telemetry". Default matches the /threatintel
   *  LivePulse band so the indicator reads the same across the app. */
  label?: string;
  /** Right-side hint, e.g. "edge-cached" or "updated 30s ago". Hidden on
   *  the narrowest screens. */
  note?: string;
  /** Visual size — `sm` matches the LivePulse band header, `md` is the
   *  default for page sub-headers, `lg` is for hero placements. */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Optional icon or text after the label, e.g. a "since last visit"
   *  badge. Kept as a slot so the LiveSnapshotPanel's "N new" pill can
   *  slot in next to the LIVE pulse without forking the component. */
  trailing?: ReactNode;
}

/**
 * Shared green-pulse + label "live" indicator. Reused in three places so a
 * "this page is live" affordance reads identically wherever it appears:
 *
 *   1. /threatintel landing → LivePulse band header
 *   2. /threatintel → LiveSnapshotPanel "Right now" header
 *   3. /threatintel/ransomware-activity → page sub-header
 *
 * The pulse is two stacked spans: an `animate-ping` outer ring and a solid
 * inner dot. Honours `prefers-reduced-motion` globally via the
 * `animation-duration: 0` reset in `index.css`.
 */
export function LiveIndicator({
  label = 'Live · platform telemetry',
  note = 'edge-cached',
  size = 'md',
  className = '',
  trailing,
}: LiveIndicatorProps): JSX.Element {
  const dot = size === 'lg' ? 'h-2.5 w-2.5' : 'h-2 w-2';
  const text = size === 'lg' ? 'text-xs' : 'text-mini';
  return (
    <div role="status" aria-live="polite" className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`relative flex ${dot}`} aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className={`relative inline-flex ${dot} rounded-full bg-emerald-500`} />
      </span>
      <span className={`font-mono uppercase tracking-[0.2em] ${text} text-slate-600 dark:text-slate-300`}>{label}</span>
      {trailing}
      {note && (
        <span className="hidden font-mono text-micro uppercase tracking-[0.18em] text-slate-400 sm:inline">{note}</span>
      )}
    </div>
  );
}
