import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { findCaseStudy } from '../data/case-studies';

/**
 * /projects/<slug> — long-form case study read page. The data lives in
 * src/data/case-studies.ts and the body is rendered through the same
 * marked → DOMPurify chain the wiki article page uses, so internal
 * /dfir + /threatintel links work, every URL is escaped, and no
 * dynamic HTML reaches the DOM without sanitisation.
 *
 * Unknown / unpublished slugs redirect to /projects rather than 404 —
 * the index page is the closest meaningful destination for someone who
 * landed on a stale link.
 */
export default function CaseStudy(): JSX.Element {
  const { slug = '' } = useParams<{ slug: string }>();
  const study = findCaseStudy(slug);
  const navigate = useNavigate();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!study) return;
    let cancelled = false;
    void (async () => {
      const [{ marked }, { default: DOMPurify }] = await Promise.all([
        import('marked'),
        import('isomorphic-dompurify'),
      ]);
      const raw = (await marked.parse(study.body)) as string;
      const safe = DOMPurify.sanitize(raw, {
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|#|\/):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
        ADD_ATTR: ['title'],
      });
      if (!cancelled) setHtml(safe);
    })();
    return () => {
      cancelled = true;
    };
  }, [study]);

  // Intercept clicks on internal SPA links so they navigate via React
  // Router instead of a full page reload. Mirrors the wiki article's
  // approach — modifier-clicks still open in a new tab as expected.
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

  if (!study) return <Navigate to="/projects" replace />;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 text-slate-900 dark:text-slate-100">
      <Link
        to="/projects"
        className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-[0.16em] text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 mb-6"
      >
        <ArrowLeft size={12} /> all projects
      </Link>

      <header className="mb-8">
        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
          {study.kicker}
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight mt-2 leading-tight">{study.title}</h1>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500 mt-4">
          <span>Pranith Jain</span>
          <span aria-hidden="true">·</span>
          <time dateTime={study.publishedAt}>
            {new Date(study.publishedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </time>
          <span aria-hidden="true">·</span>
          <span>{study.readingTime} read</span>
        </div>
        {/* Outcome strip — surfaces the headline metrics above the fold so
            anyone skimming gets the punch line before reading. Same
            minimal rhythm as the home hero status block. */}
        <div className="mt-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 px-4 py-3">
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">Outcome</div>
          <p className="mt-1 text-sm sm:text-base font-medium text-slate-800 dark:text-slate-200">{study.outcome}</p>
        </div>
        {study.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {study.tags.map((t) => (
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

      {html === null ? (
        <div className="space-y-3 text-slate-400" aria-busy="true" aria-label="Loading case study">
          <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="h-4 w-5/6 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
        </div>
      ) : (
        <article
          ref={bodyRef}
          // Inline typographic rules instead of @tailwindcss/typography
          // (not installed). Covers what the case-study body actually uses:
          // h2/h3, paragraphs, ul/ol, code, blockquotes, strong, links.
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
            '[&_blockquote]:border-l-2 [&_blockquote]:border-brand-500/40 [&_blockquote]:pl-4 [&_blockquote]:my-4 [&_blockquote]:italic [&_blockquote]:text-slate-600 [&_blockquote]:dark:text-slate-400 ' +
            '[&_hr]:my-8 [&_hr]:border-slate-200 [&_hr]:dark:border-slate-800'
          }
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
