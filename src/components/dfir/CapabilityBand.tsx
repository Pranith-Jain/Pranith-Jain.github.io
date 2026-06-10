import { Wrench, Radar, Database, BadgeCheck, type LucideIcon } from 'lucide-react';
import { MAIN_TOOL_COUNT } from './tool-sections';
import { StatBand, StatCell, StatNumber, STAT_NUM, STAT_SUB, prefersReducedMotion } from '../StatBand';

/**
 * CapabilityBand — the /dfir counterpart to /threatintel's LivePulse. The DFIR
 * toolkit landing has no live feeds, so faking a "live" band would be
 * dishonest; instead this elevates the page's static capability figures (what
 * the old StatBar carried) into the same operations-console aesthetic — big
 * animated count-ups in a hairline cluster — under a static "TOOLKIT" mark
 * rather than a LIVE pulse. Shares the StatBand primitive with LivePulse so the
 * two landings speak one visual language.
 */

const ACCENT = {
  brand: {
    chip: 'bg-brand-500/10',
    icon: 'text-brand-600 dark:text-brand-400',
    num: 'text-brand-600 dark:text-brand-400',
  },
  emerald: {
    chip: 'bg-emerald-500/10',
    icon: 'text-emerald-600 dark:text-emerald-400',
    num: 'text-emerald-600 dark:text-emerald-400',
  },
  amber: {
    chip: 'bg-amber-500/10',
    icon: 'text-amber-600 dark:text-amber-400',
    num: 'text-amber-600 dark:text-amber-400',
  },
  sky: { chip: 'bg-sky-500/10', icon: 'text-sky-600 dark:text-sky-400', num: 'text-sky-600 dark:text-sky-400' },
} as const;

interface CapStat {
  to: string;
  label: string;
  value: number;
  suffix?: string;
  sub: string;
  icon: LucideIcon;
  accent: keyof typeof ACCENT;
}

const STATS: CapStat[] = [
  {
    to: '/dfir/tools/core-dfir',
    label: 'Tools',
    value: MAIN_TOOL_COUNT,
    sub: 'in-browser, client-side',
    icon: Wrench,
    accent: 'brand',
  },
  {
    to: '/dfir/ioc-check',
    label: 'IOC providers',
    value: 24,
    sub: 'checked in parallel',
    icon: Radar,
    accent: 'emerald',
  },
  {
    to: '/dfir/tools/intelligence',
    label: 'Data sources',
    value: 90,
    suffix: '+',
    sub: 'feeds & lookups',
    icon: Database,
    accent: 'amber',
  },
  { to: '/dfir/tools/about', label: 'Credits', value: 0, sub: 'no signup, no key', icon: BadgeCheck, accent: 'sky' },
];

export function CapabilityBand(): JSX.Element {
  const reduce = prefersReducedMotion();

  const indicator = (
    <>
      <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden="true" />
      <span className="font-mono text-mini uppercase tracking-[0.2em] text-slate-600 dark:text-slate-300">
        Toolkit · 100% client-side
      </span>
    </>
  );
  const note = (
    <span className="hidden font-mono text-micro uppercase tracking-[0.18em] text-slate-400 sm:inline">no upload</span>
  );

  return (
    <StatBand ariaLabel="Toolkit capability" indicator={indicator} note={note}>
      {STATS.map((s) => {
        const Icon = s.icon;
        const a = ACCENT[s.accent];
        return (
          <StatCell
            key={s.label}
            to={s.to}
            label={s.label}
            iconClass={a.chip}
            icon={<Icon size={14} className={a.icon} aria-hidden="true" />}
            ariaLabel={`${s.value}${s.suffix ?? ''} ${s.label} — ${s.sub}.`}
          >
            <span className="flex items-baseline gap-0.5">
              <StatNumber value={s.value} reduce={reduce} className={`${STAT_NUM} ${a.num}`} />
              {s.suffix ? <span className={`${STAT_NUM} ${a.num}`}>{s.suffix}</span> : null}
            </span>
            <p className={STAT_SUB}>{s.sub}</p>
          </StatCell>
        );
      })}
    </StatBand>
  );
}
