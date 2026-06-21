import type { ReactNode, ElementType, ComponentPropsWithoutRef } from 'react';
import { card, type CardVariants } from '../../styled/recipes';

export type CardRadius = 'card' | 'panel' | 'hero';
export type CardVariant = CardVariants['variant'];
export type CardPadding = CardVariants['padding'];
export type CardTone = CardVariants['tone'];

export interface CardProps<T extends ElementType = 'div'> {
  as?: T;
  /**
   * Visual variant. `default` is the workhorse surface card (e1 shadow);
   * `surface` is flat for nested cards; `elevated` is the hero/CTA card;
   * `glass` is translucent for overlays.
   */
  variant?: CardVariant;
  /**
   * Padding scale. `none` (0) | `sm` (16px) | `md` (20px) | `lg` (24px).
   * Default `md` matches the "spacious panels" spec in DESIGN_SYSTEM.md.
   */
  padding?: CardPadding;
  /**
   * Radius role. Defaults to `card` (8px) — the workhorse surface for
   * data tiles and toolkit cards. `panel` (8px) is for surfaces that
   * contain internal rows/tables. `hero` (12px) is reserved for hero
   * CTAs / contact panels.
   */
  radius?: CardRadius;
  /**
   * Accent color for the interactive hover/focus ring. Defaults to
   * brand (blue, for DFIR). Pass "rose" for threatintel pages so the
   * hover state matches the page accent.
   */
  tone?: CardTone;
  /**
   * Apply hover-lift + cursor:pointer + focus ring. Use for clickable
   * cards (links, buttons-as-card). Static cards omit this.
   */
  interactive?: boolean;
  className?: string;
  children?: ReactNode;
  onClick?: () => void;
}

/**
 * Card — the typed, recipe-backed surface primitive.
 *
 * Visual contract is identical to the pre-Panda hand-rolled class
 * string (border + bg + shadow + optional interactive hover). The
 * `tone` variant ('brand' | 'rose') sets the hover border + focus
 * ring colour so DFIR (blue) and threatintel (rose) pages get the
 * right accent on interactive cards.
 *
 * The `interactive` boolean owns the hover-lift behaviour. Without
 * it, the card reads as static. Cards with onClick should always
 * pass `interactive`.
 */
export function Card<T extends ElementType = 'div'>({
  as,
  variant = 'default',
  padding = 'md',
  radius = 'card',
  tone = 'brand',
  interactive = false,
  className,
  children,
  ...rest
}: CardProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof CardProps<T>>) {
  const Tag = as || ('div' as ElementType);
  return (
    <Tag
      className={card({ variant, padding, radius, tone, interactive: interactive || !!rest.onClick, className })}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={['mb-4 flex items-start justify-between gap-4', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ?? ''}>{children}</div>;
}

// Footer divider uses the same --border-400 token as the card border
// (light: white-alpha 8, dark: white-alpha 8) so the divider sits in
// the same hairline family as the surrounding surfaces. Kept as a
// Tailwind utility string (not a recipe) because it's a single one-off
// element used by <Card> consumers; promoting it to a recipe would be
// over-engineering.
export function CardFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={['mt-4 flex items-center gap-3 border-t border-[rgb(var(--border-400))] pt-4', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
