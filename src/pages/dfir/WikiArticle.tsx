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
      <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
        <div className="max-w-3xl mx-auto px-8 py-20">
          <Link
            to="/dfir/wiki"
            className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-[#00fff9] mb-8 font-mono"
          >
            <ArrowLeft size={14} /> /dfir/wiki
          </Link>
          <h1 className="font-display font-bold text-3xl">Article not found</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      <div className="max-w-3xl mx-auto px-8 py-12">
        <Link
          to="/dfir/wiki"
          className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-[#00fff9] mb-8 font-mono"
        >
          <ArrowLeft size={14} /> /dfir/wiki
        </Link>
        <span className="block text-xs font-mono uppercase tracking-wider text-[#00fff9] mb-2">{article.category}</span>
        <h1 className="text-4xl font-display font-bold mb-4">{article.title}</h1>
        <p className="text-lg text-[#a1a1aa] mb-8">{article.description}</p>

        <article
          className="prose prose-invert max-w-none [&_h2]:font-display [&_h2]:text-2xl [&_h2]:mt-8 [&_h3]:font-display [&_h3]:text-xl [&_h3]:mt-6 [&_p]:text-[#a1a1aa] [&_strong]:text-[#fafafa] [&_a]:text-[#00fff9] [&_code]:text-[#00fff9] [&_code]:font-mono [&_pre]:bg-[#111113] [&_pre]:border [&_pre]:border-[#1f1f23] [&_pre]:p-4 [&_pre]:rounded-lg [&_li]:text-[#a1a1aa] [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
