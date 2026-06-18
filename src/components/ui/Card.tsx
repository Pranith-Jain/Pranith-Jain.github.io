import type { ReactNode, ElementType, ComponentPropsWithoutRef } from 'react';

export interface CardProps<T extends ElementType = 'div'> {
  as?: T;
  variant?: 'default' | 'glass' | 'surface' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Accent color for interactive hover (border + focus ring). Defaults to
   *  brand (blue, for DFIR). Pass "rose" for threat-intel pages so the
   *  hover/focus state matches the page accent. */
  tone?: 'brand' | 'rose';
  className?: string;
  children?: ReactNode;
  onClick?: () => void;
}

const TONE_CLASSES: Record<'brand' | 'rose', string> = {
  brand: 'hover:border-brand-500/30 focus-visible:ring-brand-500',
  rose: 'hover:border-rose-500/30 focus-visible:ring-rose-500',
};

function interactiveVariant(tone: 'brand' | 'rose'): string {
  return `border border-[rgb(var(--border-400))] bg-white dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))] cursor-pointer transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 ${TONE_CLASSES[tone]}`;
}

const CARD_VARIANT: Record<'default' | 'glass' | 'surface' | 'interactive', string> = {
  default:
    'border border-[rgb(var(--border-400))] bg-white dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]',
  glass: 'glass',
  surface: 'surface',
  interactive: '', // computed in Card() based on tone
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
  tone = 'brand',
  className = '',
  children,
  ...rest
}: CardProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof CardProps<T>>) {
  const Tag = as || ('div' as ElementType);
  const variantClass = variant === 'interactive' ? interactiveVariant(tone) : CARD_VARIANT[variant];
  return (
    <Tag className={`rounded-2xl ${variantClass} ${CARD_PADDING[padding]} ${className}`} {...rest}>
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
