import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { wikiMeta, type WikiCategory } from '../../data/dfir/wiki-meta';
import { CategoryPills } from '../../components/dfir/CategoryPills';
import { WikiCard } from '../../components/dfir/WikiCard';

const ALL_CATEGORIES: WikiCategory[] = [
  'Email Security',
  'Threat Intelligence',
  'Forensics',
  'Detection Engineering',
  'Attack Types',
  'AI Security',
  'Identity & NHI',
  'Compliance & Frameworks',
  'Data Security & Privacy',
];

export default function Wiki(): JSX.Element {
  const [active, setActive] = useState<WikiCategory | 'all'>('all');
  const filtered = useMemo(
    () => (active === 'all' ? wikiMeta : wikiMeta.filter((a) => a.category === active)),
    [active]
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </Link>
      <div className="animate-fade-in-up">
        <h1 className="text-4xl font-display font-bold mb-2">DFIR Knowledge Base</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          A practical glossary of digital forensics and incident response concepts, explained for practitioners.
        </p>
      </div>

      <CategoryPills categories={ALL_CATEGORIES} active={active} onSelect={setActive} />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((a) => (
          <WikiCard key={a.slug} article={a} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="font-mono text-sm text-slate-600 dark:text-slate-400">No articles in this category yet.</p>
      )}
    </div>
  );
}
