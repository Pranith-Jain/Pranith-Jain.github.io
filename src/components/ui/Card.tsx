import type { ReactNode, ElementType, ComponentPropsWithoutRef } from 'react';

export interface CardProps<T extends ElementType = 'div'> {
  as?: T;
  variant?: 'default' | 'glass' | 'surface' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
  children?: ReactNode;
  onClick?: () => void;
}

const CARD_VARIANT: Record<string, string> = {
  default: 'border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900',
  glass: 'glass',
  surface: 'surface',
  interactive:
    'border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 cursor-pointer transition-all hover:shadow-md hover:border-brand-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
};

const CARD_PADDING: Record<string, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card<T extends ElementType = 'div'>({
  as,
  variant = 'default',
  padding = 'md',
  className = '',
  children,
  ...rest
}: CardProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof CardProps<T>>) {
  const Tag = as || ('div' as ElementType);
  return (
    <Tag className={`rounded-2xl ${CARD_VARIANT[variant]} ${CARD_PADDING[padding]} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mb-4 flex items-start justify-between gap-4 ${className}`}>{children}</div>;
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

export function CardFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mt-4 flex items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-800 ${className}`}>
      {children}
    </div>
  );
}
