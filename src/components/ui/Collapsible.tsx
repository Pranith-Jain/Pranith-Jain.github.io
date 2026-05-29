import { useState, useId, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export interface CollapsibleProps {
  title: string;
  children: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  defaultOpen?: boolean;
  className?: string;
  titleClassName?: string;
  contentClassName?: string;
}

export function Collapsible({
  title,
  children,
  open: controlledOpen,
  onToggle,
  defaultOpen = false,
  className = '',
  titleClassName = '',
  contentClassName = '',
}: CollapsibleProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  function handleToggle() {
    if (isControlled) {
      onToggle?.();
    } else {
      setInternalOpen((v) => !v);
    }
  }

  const baseId = useId();
  const headerId = `collapsible-header-${baseId}`;
  const bodyId = `collapsible-body-${baseId}`;

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40 ${className}`}
    >
      <button
        type="button"
        id={headerId}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={handleToggle}
        className={`flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60 ${titleClassName}`}
      >
        <span className="text-sm font-medium text-slate-900 dark:text-white">{title}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          id={bodyId}
          role="region"
          aria-labelledby={headerId}
          className={`border-t border-slate-200/70 p-4 dark:border-slate-800/70 ${contentClassName}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export interface AccordionProps {
  items: { id: string; title: string; content: ReactNode }[];
  allowMultiple?: boolean;
  className?: string;
}

export function Accordion({ items, allowMultiple = false, className = '' }: AccordionProps) {
  const [openSet, setOpenSet] = useState<Set<string>>(() => (items.length > 0 ? new Set([items[0].id]) : new Set()));

  function toggle(id: string) {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!allowMultiple) next.clear();
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {items.map((item) => (
        <Collapsible key={item.id} title={item.title} open={openSet.has(item.id)} onToggle={() => toggle(item.id)}>
          {item.content}
        </Collapsible>
      ))}
    </div>
  );
}
