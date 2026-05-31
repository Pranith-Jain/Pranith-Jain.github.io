import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, FileText } from 'lucide-react';
import { findResearchPost, publishedResearch } from '../../data/threatintel/research';
import { IntelCard } from '../../components/intel/IntelCard';
import { extractTableOfContents, addHeadingIds } from '../../lib/content-utils';

type TocItem = { id: string; text: string; level: number };

/**
 * /threatintel/research/<slug> — long-form read page for a Pranith-
 * authored research piece. Same marked + DOMPurify rendering chain the
 * /projects case study page uses, so internal links work, all URLs are
 * sanitised, and no raw HTML reaches the DOM.
 *
 * Unknown / unpublished slugs redirect to /threatintel/research rather
 * than 404. The index is the closest meaningful destination.
 */
export default function ResearchPost(): JSX.Element {
  const { slug = '' } = useParams<{ slug: string }>();
  const post = findResearchPost(slug);
  const navigate = useNavigate();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [activeTocId, setActiveTocId] = useState<string>('');

  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    if (!post) return;
    let cancelled = false;
    void (async () => {
      const [{ marked }, { default: DOMPurify }] = await Promise.all([
        import('marked'),
        import('isomorphic-dompurify'),
      ]);
      const raw = (await marked.parse(post.body)) as string;
      const safe = DOMPurify.sanitize(raw, {
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|#|\/):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
        ADD_ATTR: ['title', 'id'],
      });
      const withIds = addHeadingIds(safe);
      const toc = extractTableOfContents(post.body);
      if (!cancelled) {
        setHtml(withIds);
        setTocItems(toc);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [post]);

  // Track which heading is in view for TOC highlighting
  useEffect(() => {
    if (!html || !bodyRef.current) return;
    const headings = bodyRef.current.querySelectorAll('h2, h3');
    if (headings.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveTocId(entry.target.id);
        });
      },
      { rootMargin: '-80px 0px -75% 0px' }
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [html]);

  // Intercept clicks on internal SPA links so they navigate via React
  // Router rather than a full reload, matching the case-study page.
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;
      const href = target.getAttribute('href') ?? '';
      if (
        href.startsWith('/dfir') ||
        href.startsWith('/threatintel') ||
        href.startsWith('/blog') ||
        href === '/' ||
        href.startsWith('/projects') ||
        href.startsWith('/about') ||
        href.startsWith('/skills') ||
        href.startsWith('/experience')
      ) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || target.target === '_blank') return;
        e.preventDefault();
        navigate(href);
      }
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [navigate]);

  if (!post) return <Navigate to="/threatintel/research" replace />;

  // Sibling research pieces (excluding the current one), for the
  // bottom-of-post navigation. Same source as the index page.
  const others = publishedResearch().filter((r) => r.slug !== post.slug);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 text-slate-900 dark:text-slate-100">
      <Link
        to="/threatintel/research"
        className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.16em] text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 mb-6"
      >
        <ArrowLeft size={12} /> all research
      </Link>

      <header className="mb-10 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
          {post.kicker}
        </div>
        {/* text-balance: lets the browser pick a more natural line-break
            point on the long title rather than ragged-right wrapping at
            the column width. */}
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-2 leading-tight text-balance">
          {post.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 mt-4">
          <span className="text-slate-700 dark:text-slate-300 font-medium">Pranith Jain</span>
          <span aria-hidden="true">·</span>
          <time dateTime={post.publishedAt}>
            {new Date(post.publishedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </time>
          <span aria-hidden="true">·</span>
          <span>{post.readingTime} read</span>
        </div>
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {post.tags.map((t) => (
              <span
                key={t}
                className="text-[11px] font-mono px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-slate-500"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Structured STIX 2.1 view of this research piece. Heuristic extractor
          pulls every actor, malware family, CVE, and IoC the piece mentions
          across its full body — alongside the human-authored prose below,
          this gives a downloadable bundle for pivoting / sharing. */}
      <section className="mb-8">
        <IntelCard
          sourceId="research"
          itemRef={`research:${post.slug}`}
          item={{
            title: post.title,
            body: `${post.excerpt}\n\n${post.body}`,
            url: `/threatintel/research/${post.slug}`,
            publishedAt: post.publishedAt,
          }}
          fallback={null}
        />
      </section>

      {html === null ? (
        <div className="space-y-3 text-slate-400" aria-busy="true" aria-label="Loading research post">
          <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-4 w-5/6 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
        </div>
      ) : (
        <div className="lg:grid lg:grid-cols-[1fr_200px] lg:gap-8">
          <article
            ref={bodyRef}
            className={
              'text-base sm:text-[17px] leading-relaxed text-slate-700 dark:text-slate-300 ' +
              '[&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:dark:text-white [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:tracking-tight ' +
              '[&_h3]:font-display [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-slate-900 [&_h3]:dark:text-white [&_h3]:mt-6 [&_h3]:mb-2 ' +
              '[&_p]:mb-4 ' +
              '[&_a]:text-brand-700 [&_a]:dark:text-brand-400 [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:no-underline ' +
              '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ul]:space-y-1.5 ' +
              '[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_ol]:space-y-1.5 ' +
              '[&_li]:leading-relaxed ' +
              '[&_strong]:text-slate-900 [&_strong]:dark:text-white [&_strong]:font-semibold ' +
              '[&_code]:font-mono [&_code]:text-[0.9em] [&_code]:bg-slate-100 [&_code]:dark:bg-slate-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded ' +
              '[&_pre]:bg-slate-900 [&_pre]:dark:bg-slate-950 [&_pre]:text-slate-100 [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-5 [&_pre]:text-[12px] [&_pre]:font-mono [&_pre]:leading-relaxed [&_pre_code]:bg-transparent [&_pre_code]:text-inherit [&_pre_code]:px-0 [&_pre_code]:whitespace-pre ' +
              '[&_blockquote]:border-l-2 [&_blockquote]:border-brand-500/40 [&_blockquote]:pl-4 [&_blockquote]:my-4 [&_blockquote]:italic [&_blockquote]:text-slate-600 [&_blockquote]:dark:text-slate-400 ' +
              '[&_hr]:my-8 [&_hr]:border-slate-200 [&_hr]:dark:border-slate-800 ' +
              '[&_em]:italic'
            }
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {/* Table of Contents sidebar */}
          {tocItems.length > 0 && (
            <aside className="hidden lg:block">
              <div className="sticky top-24">
                <h4 className="text-xs font-mono uppercase tracking-[0.16em] text-slate-500 mb-3">Contents</h4>
                <nav className="space-y-1">
                  {tocItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => scrollToHeading(item.id)}
                      className={`block w-full text-left transition-colors py-1 ${
                        item.level === 3 ? 'pl-3 text-xs' : 'text-sm'
                      } ${
                        activeTocId === item.id
                          ? 'text-brand-600 dark:text-brand-400 font-semibold'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {item.text}
                    </button>
                  ))}
                </nav>
              </div>
            </aside>
          )}
        </div>
      )}

      {/* End-of-post navigation. After 7+ minutes of reading the user is
          left at the bottom of the page with no obvious next action;
          this gives them an index link plus pointers to other research
          pieces so they don't have to scroll back to the top to navigate. */}
      <nav aria-labelledby="post-end-nav" className="mt-16 pt-8 border-t border-slate-200 dark:border-slate-800">
        <h2 id="post-end-nav" className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 mb-4">
          Continue
        </h2>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <Link
            to="/threatintel/research"
            className="inline-flex items-center gap-2 text-sm font-mono text-brand-600 dark:text-brand-400 hover:underline"
          >
            <ArrowLeft size={14} /> all research
          </Link>
          <Link
            to="/threatintel"
            className="inline-flex items-center gap-2 text-sm font-mono text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
          >
            threat intel platform <ArrowRight size={14} />
          </Link>
        </div>

        {others.length > 0 && (
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-slate-500 mb-3">Other research</div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {others.slice(0, 4).map((r) => (
                <li key={r.slug}>
                  <Link
                    to={`/threatintel/research/${r.slug}`}
                    className="group flex h-full items-start gap-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3 transition hover:border-brand-500/40"
                  >
                    <FileText
                      size={14}
                      className="shrink-0 mt-0.5 text-brand-600 dark:text-brand-400"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500 mb-0.5">
                        {r.kicker}
                      </div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors leading-snug">
                        {r.title}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>
    </div>
  );
}
