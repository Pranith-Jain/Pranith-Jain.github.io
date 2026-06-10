import { Link, useLocation } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { getRelatedWiki } from '../../data/dfir/tool-wiki-backlinks';

interface Props {
  /** Override the path lookup. Defaults to `useLocation().pathname`. Useful for child routes. */
  path?: string;
  /** Cap the number of articles rendered. Default 5. */
  limit?: number;
  /** Optional className override on the wrapping section. */
  className?: string;
}

/**
 * "Related wiki articles" footer. Drop into any tool page that has a
 * matching tool-topics entry. Renders nothing if no articles backlink
 * to the current path — safe to include unconditionally.
 *
 * The auto-link direction (wiki → tool) lives in `WikiArticle.tsx` via
 * tool-topics. This is the reciprocal direction so an analyst on a
 * tool page can jump to background reading on the underlying concept.
 */
export function RelatedWikiArticles({ path, limit = 5, className = '' }: Props): JSX.Element | null {
  const location = useLocation();
  const articles = getRelatedWiki(path ?? location.pathname);
  if (articles.length === 0) return null;

  const visible = articles.slice(0, limit);

  return (
    <section className={`mt-8 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-4 ${className}`}>
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700 dark:text-cyan-300 font-mono mb-3 inline-flex items-center gap-2">
        <BookOpen size={12} /> Related background reading
      </h2>
      <ul className="grid sm:grid-cols-2 gap-2">
        {visible.map((a) => (
          <li key={a.slug}>
            <Link
              to={`/threatintel/wiki/${a.slug}`}
              className="block rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 hover:border-cyan-500/40"
            >
              <div className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 mb-0.5">
                {a.title}
              </div>
              <div className="text-micro font-mono text-slate-500 dark:text-slate-400">
                mentions: {a.matchedTerms.slice(0, 3).join(', ')}
                {a.matchedTerms.length > 3 && ` +${a.matchedTerms.length - 3}`}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {articles.length > limit && (
        <p className="text-micro font-mono text-slate-500 dark:text-slate-400 mt-2">
          {articles.length - limit} more articles also backlink to this tool —{' '}
          <Link to="/threatintel/wiki" className="text-cyan-700 dark:text-cyan-300 hover:underline">
            browse the full wiki
          </Link>
          .
        </p>
      )}
    </section>
  );
}
