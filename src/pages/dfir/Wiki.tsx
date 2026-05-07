import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { wikiArticles, type WikiCategory } from '../../data/dfir/wiki-articles';
import { CategoryPills } from '../../components/dfir/CategoryPills';
import { WikiCard } from '../../components/dfir/WikiCard';

const ALL_CATEGORIES: WikiCategory[] = [
  'Email Security',
  'Threat Intelligence',
  'Forensics',
  'Detection Engineering',
  'Attack Types',
];

export default function Wiki(): JSX.Element {
  const [active, setActive] = useState<WikiCategory | 'all'>('all');
  const filtered = useMemo(
    () => (active === 'all' ? wikiArticles : wikiArticles.filter((a) => a.category === active)),
    [active]
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-6xl mx-auto px-8 py-12">
        <Link
          to="/dfir"
          className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-[#00fff9] mb-8 font-mono"
        >
          <ArrowLeft size={14} /> /dfir
        </Link>
        <h1 className="text-4xl font-display font-bold mb-2">DFIR Knowledge Base</h1>
        <p className="text-[#a1a1aa] mb-8 max-w-2xl">
          A practical glossary of digital forensics and incident response concepts — explained for practitioners.
        </p>

        <CategoryPills categories={ALL_CATEGORIES} active={active} onSelect={setActive} />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((a) => (
            <WikiCard key={a.slug} article={a} />
          ))}
        </div>

        {filtered.length === 0 && <p className="font-mono text-sm text-[#a1a1aa]">No articles in this category yet.</p>}
      </div>
    </div>
  );
}
