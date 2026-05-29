/**
 * StatCards — reusable stat grid used across 30+ pages.
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
      {cards.map((card, i) => {
        const Tag = card.onClick ? 'button' : 'div';
        return (
          <Tag
            key={i}
            onClick={card.onClick}
            className={`rounded-xl border p-4 text-left transition-colors ${
              card.onClick
                ? card.selected
                  ? 'border-brand-500/60 bg-brand-500/5'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-brand-500/30'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40'
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              {card.icon && <span className={card.color ?? 'text-slate-400'}>{card.icon}</span>}
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{card.label}</span>
            </div>
            <div className={`text-2xl font-display font-bold ${card.color ?? 'text-slate-900 dark:text-white'}`}>
              {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
            </div>
          </Tag>
        );
      })}
    </div>
  );
}
