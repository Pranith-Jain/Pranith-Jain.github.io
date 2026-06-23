import { useEffect, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export type DrawerSide = 'right' | 'left';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  side?: DrawerSide;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

const SIZE: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-[calc(100vw-2rem)] sm:max-w-xl',
};

export function Drawer({ open, onClose, title, children, side = 'right', size = 'xl', className = '' }: DrawerProps) {
  const titleId = useId();
  // Focus trap: contains Tab/Shift+Tab within the dialog, moves focus into
  // the panel on open, restores it to the trigger on close, and handles Esc.
  const containerRef = useFocusTrap({ isActive: open, onEscape: onClose });

  // Body-scroll lock while the drawer is open (focus management lives in the
  // useFocusTrap hook above).
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const sideClasses = side === 'right' ? 'right-0 border-l' : 'left-0 border-r';

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm dark:bg-slate-950/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={containerRef as React.RefObject<HTMLElement>}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`fixed top-0 z-50 flex h-full max-h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900 pt-[env(safe-area-inset-top)] ${sideClasses} ${SIZE[size]} ${className}`}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 sm:gap-4 border-b border-slate-200 bg-white/95 px-4 sm:px-6 py-3 sm:py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <h2
            id={titleId}
            className="text-base sm:text-lg font-display font-bold text-slate-900 dark:text-white truncate"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 grid h-11 w-11 sm:h-9 sm:w-9 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="Close panel"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 sm:py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </aside>
    </>
  );
}
