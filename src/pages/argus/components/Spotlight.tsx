import { useEffect, useRef, useState } from 'react';
import { Search, User, Bug, ShieldAlert, Crosshair, Megaphone, X } from 'lucide-react';
import { ACTORS } from '../data/actors';
import { searchAll, type SearchHit, cn } from '../lib';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (actorId: string) => void;
}

const ICON: Record<SearchHit['type'], typeof User> = {
  actor: User,
  malware: Bug,
  cve: ShieldAlert,
  ttp: Crosshair,
  campaign: Megaphone,
};

export function Spotlight({ open, onClose, onSelect }: Props) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const hits = searchAll(q, ACTORS);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Lock body scroll while the modal is open so mobile users can scroll
  // the results list without dragging the page behind the backdrop.
  // Compensate for the scrollbar width so the layout doesn't reflow.
  useEffect(() => {
    if (!open) return;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
    };
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleBackdrop = (e: React.MouseEvent) => {
    if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      <div
        role="presentation"
        className="absolute inset-0 bg-black/50 dark:bg-black/60 backdrop-blur-sm animate-fade-in-up"
        onClick={handleBackdrop}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="relative w-[min(640px,92vw)] surface-raised shadow-2xl z-10 animate-fade-in-up"
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-slate-200 dark:border-[rgb(var(--border-400))]">
          <Search size={16} className="text-slate-500 dark:text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search actors, malware, CVEs, TTPs…"
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-slate-500 dark:text-slate-400"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, hits.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === 'Enter' && hits[active]?.actorId) {
                onSelect(hits[active].actorId!);
              }
            }}
          />
          <button
            onClick={onClose}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-1">
          {q.length < 2 && (
            <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400 text-sm">
              Start typing to search <span className="text-slate-600 dark:text-slate-400">actors</span>,{' '}
              <span className="text-slate-600 dark:text-slate-400">malware</span>,{' '}
              <span className="text-slate-600 dark:text-slate-400">CVEs</span>,{' '}
              <span className="text-slate-600 dark:text-slate-400">TTPs</span>…
            </div>
          )}
          {q.length >= 2 && hits.length === 0 && (
            <div className="px-4 py-8 text-center text-slate-500 dark:text-slate-400 text-sm">No matches.</div>
          )}
          {hits.map((h, i) => {
            const Icon = ICON[h.type];
            return (
              <button
                key={`${h.type}-${h.id}`}
                onClick={() => h.actorId && onSelect(h.actorId)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                  i === active
                    ? 'bg-slate-100 dark:bg-[rgb(var(--surface-300))]'
                    : 'hover:bg-slate-100 dark:hover:bg-[rgb(var(--surface-300))]'
                )}
              >
                <span className="text-slate-500 dark:text-slate-400">
                  <Icon size={14} />
                </span>
                <span className="text-sm text-slate-900 dark:text-slate-100">{h.label}</span>
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 ml-auto">
                  {h.type}
                </span>
                <span className="text-[12px] text-slate-500 dark:text-slate-400 truncate max-w-[260px]">{h.sub}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 px-4 h-9 border-t border-slate-200 dark:border-[rgb(var(--border-400))] text-micro font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-px rounded border border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-300))] text-[9px] normal-case">
              &uarr;&darr;
            </kbd>{' '}
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-px rounded border border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-300))] text-[9px] normal-case">
              &crarr;
            </kbd>{' '}
            open
          </span>
          <span className="ml-auto flex items-center gap-1">
            <kbd className="px-1 py-px rounded border border-[rgb(var(--border-400))] bg-slate-50 dark:bg-[rgb(var(--surface-300))] text-[9px] normal-case">
              esc
            </kbd>{' '}
            close
          </span>
        </div>
      </div>
    </div>
  );
}
