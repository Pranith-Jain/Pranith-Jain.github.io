import { Link } from 'react-router-dom';
import type { WikiArticleMeta } from '../../data/dfir/wiki-meta';

export function WikiCard({ article }: { article: WikiArticleMeta }): JSX.Element {
  return (
    <Link
      to={`/threatintel/wiki/${article.slug}`}
      className="block surface-card p-5 hover:border-brand-500/40 transition-colors"
    >
      <span className="block text-xs font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-1">
        {article.category}
      </span>
      <h3 className="font-display font-bold text-lg text-slate-900 dark:text-slate-100">{article.title}</h3>
      <p className="mt-2 text-sm text-muted leading-relaxed">{article.description}</p>
    </Link>
  );
}
