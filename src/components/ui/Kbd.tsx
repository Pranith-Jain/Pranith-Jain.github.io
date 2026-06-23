import type { ReactNode } from 'react';

export type KbdSize = 'sm' | 'md';

export interface KbdProps {
  children: ReactNode;
  size?: KbdSize;
  className?: string;
}

const SIZE: Record<KbdSize, string> = {
  sm: 'text-micro px-1 py-0.5',
  md: 'text-mini px-1.5 py-0.5',
};

export function Kbd({ children, size = 'sm', className = '' }: KbdProps) {
  return (
    <kbd
      className={`inline-flex items-center rounded border border-slate-200 bg-slate-50 font-mono text-slate-600 dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-300))] dark:text-slate-300 ${SIZE[size]} ${className}`}
    >
      {children}
    </kbd>
  );
}
