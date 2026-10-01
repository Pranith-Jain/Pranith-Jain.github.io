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

  // Body-scroll lock while the drawer is open, compensating for scrollbar
  // width to prevent content reflow when the scrollbar disappears.
  useEffect(() => {
    if (!open) return;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [open]);

  if (!open) return null;

  const sideClasses = side === 'right' ? 'right-0 border-l' : 'left-0 border-r';

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-surface-100/40 backdrop-blur-sm dark:bg-input-200/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={containerRef as React.RefObject<HTMLElement>}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`fixed top-0 z-50 flex h-full max-h-[100dvh] w-full flex-col overflow-hidden bg-surface-100 shadow-2xl dark:bg-surface-200 pt-[env(safe-area-inset-top)] ${sideClasses} ${SIZE[size]} ${className}`}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 sm:gap-4 border-b border-line-1 bg-surface-100/95 px-4 sm:px-6 py-3 sm:py-4 backdrop-blur">
          <h2 id={titleId} className="text-base sm:text-lg font-display font-bold text-heading truncate">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 grid h-11 w-11 sm:h-9 sm:w-9 place-items-center rounded text-muted transition-colors hover:bg-surface-300 hover:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-surface-300 dark:hover:text-inverted"
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
