import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { marked } from 'marked';
import { wikiArticles } from '../../data/dfir/wiki-articles';

export default function WikiArticle(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const article = wikiArticles.find((a) => a.slug === slug);
  const html = useMemo(() => (article ? (marked.parse(article.body) as string) : ''), [article]);

  if (!article) {
    return (
      <div className="max-w-3xl mx-auto px-8 py-20 text-slate-900 dark:text-slate-100">
        <Link
          to="/dfir/wiki"
          className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
        >
          <ArrowLeft size={14} /> /dfir/wiki
        </Link>
        <h1 className="font-display font-bold text-3xl">Article not found</h1>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/dfir/wiki"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /dfir/wiki
      </Link>
      <span className="block text-xs font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-2">
        {article.category}
      </span>
      <h1 className="text-4xl font-display font-bold mb-4">{article.title}</h1>
      <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">{article.description}</p>

      <article
        className="prose prose-invert max-w-none [&_h2]:font-display [&_h2]:text-2xl [&_h2]:mt-8 [&_h3]:font-display [&_h3]:text-xl [&_h3]:mt-6 [&_p]:text-slate-600 [&_strong]:text-slate-900 [&_a]:text-brand-600 [&_code]:text-brand-600 [&_code]:font-mono [&_pre]:bg-white [&_pre]:border [&_pre]:border-slate-200 [&_pre]:p-4 [&_pre]:rounded-lg [&_li]:text-slate-600 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 dark:[&_p]:text-slate-400 dark:[&_strong]:text-slate-100 dark:[&_a]:text-brand-400 dark:[&_code]:text-brand-400 dark:[&_pre]:bg-slate-900 dark:[&_pre]:border-slate-800 dark:[&_li]:text-slate-400"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
