import type { WikiCategory } from '../../data/dfir/wiki-articles';

interface Props {
  categories: WikiCategory[];
  active: WikiCategory | 'all';
  onSelect: (c: WikiCategory | 'all') => void;
}

export function CategoryPills({ categories, active, onSelect }: Props): JSX.Element {
  const items: Array<WikiCategory | 'all'> = ['all', ...categories];
  return (
    <div className="flex flex-wrap gap-2 mb-8">
      {items.map((c) => {
        const isActive = c === active;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onSelect(c)}
            className={`px-3 py-1 rounded-full text-xs font-mono uppercase tracking-wider border transition-colors ${
              isActive
                ? 'bg-brand-500/15 dark:bg-brand-400/15 text-brand-600 dark:text-brand-400 border-brand-500/40'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:border-brand-500/30'
            }`}
          >
            {c === 'all' ? 'All' : c}
          </button>
        );
      })}
    </div>
  );
}
