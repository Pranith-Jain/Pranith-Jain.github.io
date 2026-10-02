/**
 * StatCards - reusable stat grid used across 30+ pages.
 *
 * Replaces the pattern of:
 *   <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 *     <div className="rounded-xl border ..."><div className="text-2xl font-bold">{value}</div></div>
 *     ...
 *   </div>
 *
 * With:
 *   <StatCards cards={[
 *     { label: 'Total', value: 42, icon: <Database size={16} /> },
 *     { label: 'Active', value: 12, color: 'text-emerald-600' },
 *   ]} />
 */

import type { ReactNode } from 'react';

export interface StatCard {
  label: string;
  value: string | number;
  icon?: ReactNode;
  color?: string;
  /** Optional click handler (for filter cards). */
  onClick?: () => void;
  /** Whether this card is currently selected (for filter cards). */
  selected?: boolean;
}

export interface StatCardsProps {
  cards: StatCard[];
  /** Grid columns. Default '2 sm:grid-cols-4'. */
  cols?: string;
}

export function StatCards({ cards, cols = 'grid-cols-2 sm:grid-cols-4' }: StatCardsProps): JSX.Element {
  return (
    <div className={`grid ${cols} gap-3`}>
      {cards.map((card) => {
        const Tag = card.onClick ? 'button' : 'div';
        // Interactive cards need a visible focus ring for parity with hover;
        // the global :focus-visible outline is overridden by Tailwind's
        // outline-none utility, so without this keyboard users get nothing.
        return (
          <Tag
            key={card.label}
            onClick={card.onClick}
            type={card.onClick ? 'button' : undefined}
            className={`rounded-card border border-line-1 bg-surface-100 p-4 text-left transition-colors ${
              card.onClick
                ? card.selected
                  ? 'border-brand-500/60 bg-brand-500/5'
                  : 'bg-surface-100 hover:border-brand-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'
                : ''
            }`}
          >
            <div className="mb-1.5 flex items-center gap-2">
              {card.icon && <span className={card.color ?? 'text-muted'}>{card.icon}</span>}
              <span className="font-mono text-micro uppercase tracking-wider text-muted">{card.label}</span>
            </div>
            <div className={`font-display text-2xl font-bold ${card.color ?? 'text-heading'}`}>
              {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
            </div>
          </Tag>
        );
      })}
    </div>
  );
}
