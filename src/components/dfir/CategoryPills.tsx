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
                ? 'bg-[#00fff9]/15 text-[#00fff9] border-[#00fff9]/40'
                : 'bg-[#111113] text-[#a1a1aa] border-[#1f1f23] hover:border-[#00fff9]/30'
            }`}
          >
            {c === 'all' ? 'All' : c}
          </button>
        );
      })}
    </div>
  );
}
