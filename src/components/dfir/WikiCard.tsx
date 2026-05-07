import { Link } from 'react-router-dom';
import type { WikiArticle } from '../../data/dfir/wiki-articles';

export function WikiCard({ article }: { article: WikiArticle }): JSX.Element {
  return (
    <Link
      to={`/dfir/wiki/${article.slug}`}
      className="block rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-brand-500/40 transition-colors"
    >
      <span className="block text-xs font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-1">
        {article.category}
      </span>
      <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">{article.title}</h3>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{article.description}</p>
    </Link>
  );
}
