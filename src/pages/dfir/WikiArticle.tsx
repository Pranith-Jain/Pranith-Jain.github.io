import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Wrench } from 'lucide-react';
import { wikiMeta } from '../../data/dfir/wiki-meta';
import { TOOL_TOPICS, type ToolTopic } from '../../data/dfir/tool-topics';

/**
 * Pre-process the article body to convert the *first* mention of each
 * known topic into a markdown link to the relevant tool. Subsequent
 * mentions are left as plain text — readers don't need every "DKIM" in
 * a paragraph turned into a link, and more than that hurts readability.
 *
 * Skips:
 *   - text inside fenced code blocks (```...```)
 *   - text inside inline code (`...`)
 *   - text already inside a markdown link [...](...)
 *   - links inside headers (already styled distinctly)
 */
function injectToolLinks(body: string): { body: string; matched: ToolTopic[] } {
  // Tokenise into segments we will/won't touch.
  const segments: { kind: 'plain' | 'skip'; text: string }[] = [];
  const SKIP_RE = /(```[\s\S]*?```|`[^`\n]*`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  for (const m of body.matchAll(SKIP_RE)) {
    if (m.index === undefined) continue;
    if (m.index > last) segments.push({ kind: 'plain', text: body.slice(last, m.index) });
    segments.push({ kind: 'skip', text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < body.length) segments.push({ kind: 'plain', text: body.slice(last) });

  const matched = new Map<string, ToolTopic>();
  const usedTopics = new Set<string>();

  for (const seg of segments) {
    if (seg.kind === 'skip') continue;
    let txt = seg.text;
    for (const topic of TOOL_TOPICS) {
      if (usedTopics.has(topic.term.toLowerCase())) continue;
      // Word-boundary match. Escape regex specials in the term.
      const escaped = topic.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b(${escaped})\\b`, 'i');
      if (re.test(txt)) {
        // Wrap in markdown link. Use HTML-style title via the
        // post-render rewrite below so the tooltip survives sanitization.
        txt = txt.replace(re, `[$1](${topic.href} "${topic.blurb}")`);
        usedTopics.add(topic.term.toLowerCase());
        matched.set(topic.href, topic);
      }
    }
    seg.text = txt;
  }

  return { body: segments.map((s) => s.text).join(''), matched: [...matched.values()] };
}

export default function WikiArticle(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const articleRef = useRef<HTMLDivElement | null>(null);
  const articleMeta = wikiMeta.find((a) => a.slug === slug);
  const [html, setHtml] = useState<string>('');
  const [relatedTools, setRelatedTools] = useState<ToolTopic[]>([]);

  // Lazy-load the wiki body data + the markdown libs (~80KB combined). The
  // article meta (title, description, category) is already in scope via the
  // slim wiki-meta module so the page renders immediately while bodies stream in.
  useEffect(() => {
    // Clear stale render from the previous slug. Without this, navigating
    // wiki-to-wiki briefly shows the previous article's body until the new
    // dynamic import resolves.
    setHtml('');
    setRelatedTools([]);
    if (!articleMeta) return;
    let cancelled = false;
    void (async () => {
      const [{ wikiArticles }, { marked }, { default: DOMPurify }] = await Promise.all([
        import('../../data/dfir/wiki-articles'),
        import('marked'),
        import('isomorphic-dompurify'),
      ]);
      const article = wikiArticles.find((a) => a.slug === slug);
      if (!article || cancelled) return;
      const { body: linked, matched } = injectToolLinks(article.body);
      const raw = marked.parse(linked) as string;
      const sanitised = DOMPurify.sanitize(raw, {
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|#|\/):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
        ADD_ATTR: ['title'],
      });
      if (!cancelled) {
        setHtml(sanitised);
        setRelatedTools(matched);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [articleMeta, slug]);

  // Intercept clicks on internal /dfir links so they navigate via React
  // Router instead of triggering a full page reload.
  useEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;
      const href = target.getAttribute('href') ?? '';
      if (href.startsWith('/dfir/')) {
        // Internal — let modifier-clicks open in new tab as the browser would.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || target.target === '_blank') return;
        e.preventDefault();
        navigate(href);
      }
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [navigate, html]);

  if (!articleMeta) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-20 text-slate-900 dark:text-slate-100">
        <Link
          to="/threatintel/wiki"
          className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
        >
          <ArrowLeft size={14} /> /threatintel/wiki
        </Link>
        <h1 className="font-display font-bold text-3xl">Article not found</h1>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel/wiki"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> /threatintel/wiki
      </Link>
      <span className="block text-xs font-mono uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-2">
        {articleMeta.category}
      </span>
      <h1 className="text-4xl font-display font-bold mb-4">{articleMeta.title}</h1>
      <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">{articleMeta.description}</p>

      <article
        ref={articleRef}
        className="prose prose-invert max-w-none [&_h2]:font-display [&_h2]:text-2xl [&_h2]:mt-8 [&_h3]:font-display [&_h3]:text-xl [&_h3]:mt-6 [&_p]:text-slate-600 [&_strong]:text-slate-900 [&_a]:text-brand-600 [&_code]:text-brand-600 [&_code]:font-mono [&_pre]:bg-white [&_pre]:border [&_pre]:border-slate-200 [&_pre]:p-4 [&_pre]:rounded-lg [&_li]:text-slate-600 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 dark:[&_p]:text-slate-400 dark:[&_strong]:text-slate-100 dark:[&_a]:text-brand-400 dark:[&_code]:text-brand-400 dark:[&_pre]:bg-slate-900 dark:[&_pre]:border-slate-800 dark:[&_li]:text-slate-400"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {relatedTools.length > 0 && (
        <section className="mt-12 rounded-lg border border-brand-500/30 bg-brand-500/5 p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 font-mono mb-3 inline-flex items-center gap-2">
            <Wrench size={12} /> Related tools in this portfolio
          </h2>
          <ul className="grid sm:grid-cols-2 gap-2">
            {relatedTools.map((t) => (
              <li key={t.href}>
                <Link
                  to={t.href}
                  className="block rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 hover:border-brand-500/40"
                >
                  <span className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100">
                    {t.term}
                  </span>
                  <span className="block text-[11px] font-mono text-slate-500 dark:text-slate-500 mt-0.5">
                    {t.blurb}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
