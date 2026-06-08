import { useEffect, useRef, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: ModalSize;
  closeOnOverlay?: boolean;
  showCloseButton?: boolean;
}

const SIZE: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[calc(100vw-2rem)]',
};

export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  closeOnOverlay = true,
  showCloseButton = true,
}: ModalProps) {
  const dialogId = useId();
  const titleId = `modal-title-${dialogId}`;
  const overlayRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      document.body.style.overflow = '';
      previousFocus.current?.focus();
      return;
    }
    previousFocus.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    // Move focus INTO the dialog on open — otherwise focus stays on the trigger
    // behind the backdrop and the Tab-trap below only engages once focus is
    // already inside (so the first Tab can escape to background content).
    const t = setTimeout(() => {
      overlayRef.current
        ?.querySelector<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
        ?.focus();
    }, 0);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = overlayRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6"
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closeOnOverlay ? onClose : undefined}
        aria-hidden="true"
      />
      <div
        className={`relative z-10 w-full ${SIZE[size]} max-h-[90vh] sm:max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-200/60 bg-white shadow-xl dark:border-slate-700/60 dark:bg-slate-900 animate-fade-in-up`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 id={titleId} className="text-lg font-display font-bold text-slate-900 dark:text-white">
            {title}
          </h2>
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

export function ModalFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-6 py-4 dark:border-slate-800 ${className}`}
    >
      {children}
    </div>
  );
}
