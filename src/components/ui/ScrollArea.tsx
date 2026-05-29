import type { ReactNode } from 'react';

export interface ScrollAreaProps {
  children: ReactNode;
  maxHeight?: string | number;
  className?: string;
}

export function ScrollArea({ children, maxHeight = '480px', className = '' }: ScrollAreaProps) {
  return (
    <div
      className={`overflow-auto ${className}`}
      style={{ maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }}
      role="region"
      aria-label="Scrollable content"
    >
      {children}
    </div>
  );
}
