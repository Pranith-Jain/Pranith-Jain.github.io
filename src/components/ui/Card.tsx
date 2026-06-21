import type { ReactNode, ElementType, ComponentPropsWithoutRef } from 'react';

export type CardRadius = 'card' | 'panel' | 'hero';

export interface CardProps<T extends ElementType = 'div'> {
  as?: T;
  variant?: 'default' | 'glass' | 'surface' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /**
   * Radius role. Defaults to `card` (8px) — the workhorse surface for
   * data tiles and toolkit cards. `panel` (10px) is for surfaces that
   * contain internal rows/tables. `hero` (14px) is reserved for hero
   * CTAs / contact panels; only top-of-page callouts earn the larger
   * radius. Blanket `rounded-2xl` on every card was an AI-slop tell.
   */
  radius?: CardRadius;
  /**
   * Accent color for the interactive hover/focus ring. Defaults to brand
   * (blue, for DFIR). Pass "rose" for threat-intel pages so the hover
   * state matches the page accent.
   */
  tone?: 'brand' | 'rose';
  className?: string;
  children?: ReactNode;
  onClick?: () => void;
}

// Literal class lookup — Tailwind's JIT scanner only emits classes that
// appear as string literals in source. Using a typed const map (rather
// than a template literal) guarantees these classes are scanned.
const RADIUS: Record<CardRadius, string> = {
  card: 'rounded-card',
  panel: 'rounded-panel',
  hero: 'rounded-hero',
};

const TONE_CLASSES: Record<'brand' | 'rose', string> = {
  brand: 'hover:border-brand-500/30 focus-visible:ring-brand-500',
  rose: 'hover:border-rose-500/30 focus-visible:ring-rose-500',
};

// Single source of truth for the surface recipe — replaces the
// hand-rolled `border-slate-200 dark:border-[rgb(var(--border-400))]`
// + `bg-white dark:bg-[rgb(var(--surface-200))]` pair that was duplicated
// across ~60 page files.
function surfaceBase(): string {
  return (
    'border border-[rgb(var(--border-400))] bg-white ' +
    'dark:border-[rgb(var(--border-400))] dark:bg-[rgb(var(--surface-200))]'
  );
}

const CARD_VARIANT: Record<'default' | 'glass' | 'surface' | 'interactive', string> = {
  default: surfaceBase(),
  glass: 'glass',
  surface: 'surface',
  // Interactive variant is computed in Card() because it depends on `tone`.
  interactive: '',
};

function interactiveVariant(tone: 'brand' | 'rose'): string {
  return (
    `${surfaceBase()} cursor-pointer transition-all hover:shadow-e2 ` +
    `focus-visible:outline-none focus-visible:ring-2 ${TONE_CLASSES[tone]}`
  );
}

const CARD_PADDING: Record<'none' | 'sm' | 'md' | 'lg', string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export function Card<T extends ElementType = 'div'>({
  as,
  variant = 'default',
  padding = 'md',
  radius = 'card',
  tone = 'brand',
  className = '',
  children,
  ...rest
}: CardProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof CardProps<T>>) {
  const Tag = as || ('div' as ElementType);
  const variantClass = variant === 'interactive' ? interactiveVariant(tone) : CARD_VARIANT[variant];
  return (
    <Tag className={`${RADIUS[radius]} ${variantClass} ${CARD_PADDING[padding]} ${className}`} {...rest}>
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

// Footer divider uses the same --border-400 token as the card border
// (light: white-alpha 8, dark: white-alpha 8) so the divider sits in the
// same hairline family as the surrounding surfaces. The previous
// `border-slate-200 dark:border-slate-800` was the full-opacity, sharp
// hairline that read as too loud against the new token-driven borders.
export function CardFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`mt-4 flex items-center gap-3 border-t border-[rgb(var(--border-400))] pt-4 ${className}`}>
      {children}
    </div>
  );
}
