import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  AtSign,
  Bitcoin,
  Crosshair,
  ExternalLink,
  Globe,
  Hash,
  Link2,
  Network,
  Router,
  ShieldAlert,
  Tag,
  Users,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { detectIoc, getIocPivots, IOC_TYPE_LABEL, type DetectedIoc, type IocType } from '../../lib/dfir/ioc-detect';
import { refang } from '../../lib/dfir/indicator-client';
import type { Verdict } from '../../lib/dfir/types';
import { middleTruncate } from '../../lib/middle-truncate';
import { CopyButton } from '../ui/CopyButton';

/**
 * A single indicator-of-compromise / entity chip.
 *
 * One reusable primitive for rendering an IOC anywhere in the app — a
 * type glyph, the (monospace, middle-truncated) value, one-click copy,
 * and a "pivot" menu of the most useful related tools. It composes the
 * existing IOC backbone rather than reinventing it:
 *   - `refang()` canonicalises defanged input (`hxxp://`, `1.2.3[.]4`)
 *   - `detectIoc()` resolves the {@link IocType} when not supplied
 *   - `getIocPivots()` supplies the pivot destinations
 *   - `ui/CopyButton` handles copy-with-feedback + a11y
 *
 * It is purely presentational and synchronous: any async enrichment
 * (e.g. a live verdict) is the parent's job — pass the result down via
 * `verdict`, and gate the surrounding list with `AsyncState`.
 *
 * Edge cases are handled so it never breaks on arbitrary input:
 *   - undetected value → neutral "Indicator" chip, pivots hidden
 *   - empty/whitespace value → renders `null`
 *   - long value → middle-truncated, full value in `title` + copied whole
 *
 * @example
 * <IocChip value="1.2.3.4" />                          // auto-detected IPv4
 * <IocChip value="1.2.3[.]4" />                         // refanged → 1.2.3.4
 * <IocChip value={hash} type="hash-sha256" showType />  // forced type + label
 * <IocChip value={ip} verdict="malicious" />            // red accent + sr text
 * <IocChip value={raw} loading />                       // skeleton while loading
 * {items.map((v) => <IocChip key={v} value={v} size="sm" />)}
 */
export interface IocChipProps {
  /** Raw indicator value. Refanged + type-detected unless `type` is given. */
  value: string;
  /** Override auto-detection (caller already knows the type). */
  type?: IocType;
  /** Visual density. */
  size?: 'sm' | 'md';
  /** Render the type label text next to the glyph (otherwise sr-only). */
  showType?: boolean;
  /** Show the copy affordance. */
  copyable?: boolean;
  /** Show the pivot menu (auto-hidden when the type has no pivots). */
  pivots?: boolean;
  /** Drop the border/background/padding frame — for inline use inside an
   * existing bordered row, where a boxed chip would read as nested. */
  bare?: boolean;
  /** Optional verdict — drives a colored border/glyph accent + sr text. */
  verdict?: Verdict;
  /** Max chars before middle-truncation; `false` disables truncation. */
  truncate?: number | false;
  /** Render a skeleton chip of the same footprint (for lists being fetched). */
  loading?: boolean;
  /** When set, the value becomes a button (e.g. "filter by this indicator"). */
  onSelect?: (ioc: DetectedIoc) => void;
  className?: string;
}

const IOC_TYPE_GLYPH: Record<IocType, LucideIcon> = {
  cve: ShieldAlert,
  'mitre-technique': Crosshair,
  'mitre-group': Users,
  asn: Router,
  url: Link2,
  'hash-md5': Hash,
  'hash-sha1': Hash,
  'hash-sha256': Hash,
  email: AtSign,
  btc: Bitcoin,
  ip: Network,
  ipv6: Network,
  domain: Globe,
};

const NEUTRAL_ACCENT = {
  ring: 'border-slate-200 dark:border-slate-800',
  glyph: 'text-slate-400 dark:text-slate-500',
};

// Reuses the VerdictChip palette so a "malicious" chip reads the same
// wherever it appears. Neutral by default — color only on verdict.
const VERDICT_ACCENT: Record<Verdict, { ring: string; glyph: string }> = {
  clean: { ring: 'border-emerald-500/40', glyph: 'text-emerald-600 dark:text-emerald-400' },
  suspicious: { ring: 'border-amber-500/40', glyph: 'text-amber-600 dark:text-amber-400' },
  malicious: { ring: 'border-rose-500/40', glyph: 'text-rose-600 dark:text-rose-400' },
  unknown: NEUTRAL_ACCENT,
};

const SIZE: Record<
  'sm' | 'md',
  { box: string; text: string; icon: string; gap: string; label: string; truncate: number }
> = {
  sm: { box: 'px-1.5 py-0.5', text: 'text-[11px]', icon: 'h-3 w-3', gap: 'gap-1', label: 'text-[9px]', truncate: 24 },
  md: {
    box: 'px-2 py-1',
    text: 'text-[13px]',
    icon: 'h-3.5 w-3.5',
    gap: 'gap-1.5',
    label: 'text-[10px]',
    truncate: 40,
  },
};

export function IocChip({
  value,
  type,
  size = 'md',
  showType = false,
  copyable = true,
  pivots = true,
  bare = false,
  verdict,
  truncate,
  loading = false,
  onSelect,
  className = '',
}: IocChipProps): JSX.Element | null {
  const sz = SIZE[size];

  if (loading) {
    const skeletonFrame = bare
      ? ''
      : `rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 ${sz.box}`;
    return (
      <span className={`inline-flex items-center ${sz.gap} ${skeletonFrame} ${className}`} aria-hidden="true">
        <span className={`${sz.icon} shrink-0 rounded-sm bg-slate-200 dark:bg-slate-700 animate-pulse`} />
        <span className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
      </span>
    );
  }

  const canonical = refang(value ?? '').trim();
  if (!canonical) return null;

  const ioc: DetectedIoc | null = type ? { type, value: canonical } : detectIoc(canonical);
  const resolvedType = ioc?.type ?? null;
  const display = ioc?.value ?? canonical;
  const Glyph = resolvedType ? IOC_TYPE_GLYPH[resolvedType] : Tag;
  const typeLabel = resolvedType ? IOC_TYPE_LABEL[resolvedType] : 'Indicator';
  const accent = verdict ? VERDICT_ACCENT[verdict] : NEUTRAL_ACCENT;

  const maxChars = truncate === false ? Infinity : (truncate ?? sz.truncate);
  const shown = middleTruncate(display, maxChars);
  const isTruncated = shown !== display;

  const valueClasses = `min-w-0 truncate font-mono ${sz.text} text-slate-800 dark:text-slate-200`;
  const srLabel = (
    <>
      <span className="sr-only">{typeLabel}: </span>
      {shown}
      {verdict && <span className="sr-only"> ({verdict})</span>}
    </>
  );

  const valueEl =
    onSelect && ioc ? (
      <button
        type="button"
        onClick={() => onSelect(ioc)}
        title={isTruncated ? display : undefined}
        className={`${valueClasses} rounded-sm text-left hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:text-brand-400`}
      >
        {srLabel}
      </button>
    ) : (
      <span className={valueClasses} title={isTruncated ? display : undefined}>
        {srLabel}
      </span>
    );

  const frame = bare ? '' : `rounded-md border ${accent.ring} bg-white dark:bg-slate-900/60 ${sz.box}`;

  return (
    <span className={`group inline-flex max-w-full items-center ${sz.gap} ${frame} ${className}`}>
      <Glyph className={`${sz.icon} shrink-0 ${accent.glyph}`} aria-hidden="true" />
      {showType && (
        <span className={`shrink-0 font-mono ${sz.label} uppercase tracking-wider text-slate-400 dark:text-slate-500`}>
          {typeLabel}
        </span>
      )}
      {valueEl}
      {copyable && (
        <CopyButton text={display} variant="ghost" size="sm" label={`Copy ${display}`} className="shrink-0" />
      )}
      {pivots && ioc && <PivotMenu ioc={ioc} size={size} />}
    </span>
  );
}

/**
 * Accessible "related tools" menu for an IOC. Renders real <Link>/<a>
 * items (so SPA nav, open-in-new-tab, and copy-link all work), with the
 * dialog-menu keyboard model: arrow-key roving, Home/End, Esc-to-close +
 * focus-return, click-outside, and ArrowDown-to-open from the trigger.
 * Modeled on ui/DropdownMenu but with link items + descriptions.
 */
function PivotMenu({ ioc, size }: { ioc: DetectedIoc; size: 'sm' | 'md' }): JSX.Element | null {
  // getIocPivots builds a 1–3 element array — cheap enough to call inline,
  // and PivotMenu only mounts when the chip's pivots are enabled.
  const pivots = getIocPivots(ioc);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  if (pivots.length === 0) return null;

  const iconCls = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  const focusItem = (idx: number) => {
    const n = pivots.length;
    itemRefs.current[((idx % n) + n) % n]?.focus();
  };

  const onItemKeyDown = (e: ReactKeyboardEvent, idx: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(idx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(idx - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusItem(pivots.length - 1);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const onTriggerKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault();
      setOpen(true);
    }
  };

  return (
    <span ref={rootRef} className="relative inline-flex shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Pivot ${ioc.value} to related tools`}
        className={`grid place-items-center rounded-sm p-0.5 text-slate-400 transition-colors hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-500 dark:hover:text-brand-400 ${
          open ? 'text-brand-600 dark:text-brand-400' : ''
        }`}
      >
        <Waypoints className={iconCls} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={`Pivots for ${ioc.value}`}
          className="absolute right-0 top-full z-50 mt-1 w-64 max-w-[min(18rem,80vw)] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {pivots.map((p, i) => {
            const content = (
              <>
                <span className="flex items-center gap-1.5 font-mono text-[12px] font-medium text-slate-800 dark:text-slate-200">
                  {p.label}
                  {p.external && <ExternalLink className="h-3 w-3 text-slate-400" aria-hidden="true" />}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                  {p.desc}
                </span>
              </>
            );
            const cls =
              'block w-full px-3 py-2 text-left transition-colors hover:bg-slate-100 focus:bg-slate-100 focus:outline-none dark:hover:bg-slate-800 dark:focus:bg-slate-800';
            return p.external ? (
              <a
                key={p.path}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                href={p.path}
                target="_blank"
                rel="noopener noreferrer"
                role="menuitem"
                tabIndex={i === 0 ? 0 : -1}
                onKeyDown={(e) => onItemKeyDown(e, i)}
                onClick={() => setOpen(false)}
                className={cls}
              >
                {content}
              </a>
            ) : (
              <Link
                key={p.path}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                to={p.path}
                role="menuitem"
                tabIndex={i === 0 ? 0 : -1}
                onKeyDown={(e) => onItemKeyDown(e, i)}
                onClick={() => setOpen(false)}
                className={cls}
              >
                {content}
              </Link>
            );
          })}
        </div>
      )}
    </span>
  );
}
