import { Link } from 'react-router-dom';
import type { WikiArticle } from '../../data/dfir/wiki-articles';

export function WikiCard({ article }: { article: WikiArticle }): JSX.Element {
  return (
    <Link
      to={`/dfir/wiki/${article.slug}`}
      className="block rounded-lg border border-[#1f1f23] bg-[#111113] p-5 hover:border-[#00fff9]/40 transition-colors"
    >
      <span className="block text-xs font-mono uppercase tracking-wider text-[#00fff9] mb-1">{article.category}</span>
      <h3 className="font-display font-bold text-lg text-[#fafafa]">{article.title}</h3>
      <p className="mt-2 text-sm text-[#a1a1aa] leading-relaxed">{article.description}</p>
    </Link>
  );
}
