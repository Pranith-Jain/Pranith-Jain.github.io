import { Link, useLocation } from 'react-router-dom';
import { Home, Terminal, ArrowRight } from 'lucide-react';
import { useEffect } from 'react';

/**
 * Slugs that used to live at /dfir/<slug> and moved to /threatintel/<slug>
 * in May 2026. The router aliases were removed to eliminate the duplicate
 * URL surface, but old bookmarks and search-engine links still land here.
 * We detect the old pattern and surface the canonical destination so the
 * 404 isn't a dead end for stale references.
 */
const MOVED_SLUGS: ReadonlySet<string> = new Set([
  'briefings',
  'darkweb',
  'onion-watch',
  'telegram-watch',
  'scam-watch',
  'tech-ai-news',
  'threat-feeds',
  'threat-map',
  'actors',
  'mitre',
  'rules',
  'cve-resources',
  'wiki',
  'secops-tools',
  'awesome-lists',
  'osint-framework',
]);

function detectMovedUrl(pathname: string): { from: string; to: string } | null {
  const match = /^\/dfir\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?$/i.exec(pathname);
  if (!match) return null;
  const [, topSlug, subSlug] = match;
  if (!topSlug || !MOVED_SLUGS.has(topSlug)) return null;
  const target = subSlug ? `/threatintel/${topSlug}/${subSlug}` : `/threatintel/${topSlug}`;
  return { from: pathname, to: target };
}

export default function NotFound(): JSX.Element {
  const location = useLocation();
  const moved = detectMovedUrl(location.pathname);

  // Tell crawlers this is a dead end so they de-index the URL on their
  // next sweep. Without this Google keeps the URL in the index until
  // it crawls again, and a stale bookmark can keep a soft-404 in the
  // SERP for weeks.
  useEffect(() => {
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'noindex,nofollow';
    document.head.appendChild(tag);
    return () => {
      tag.remove();
    };
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-8 py-24 text-center text-slate-900 dark:text-slate-100">
      <div className="animate-fade-in-up">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400 mb-3">
          {moved ? '301 · Moved' : '404 · Not Found'}
        </div>
        <h1 className="text-5xl font-display font-bold mb-4">
          {moved ? 'This page moved.' : 'That page is off-grid.'}
        </h1>
        {moved ? (
          <div className="mb-10">
            <p className="text-slate-600 dark:text-slate-400 mb-3">
              Intel pages live under <span className="font-mono text-slate-900 dark:text-slate-100">/threatintel/</span>{' '}
              as of May 2026. The page you followed is at a new URL.
            </p>
            <Link
              to={moved.to}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 dark:bg-brand-500 text-white px-5 py-3 text-sm font-mono font-semibold hover:bg-brand-700 dark:hover:bg-brand-400 transition-colors"
            >
              <code className="text-white">{moved.to}</code>
              <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <p className="text-slate-600 dark:text-slate-400 mb-10">
            The URL you followed doesn't match anything on this site. The link may be old, mistyped, or the page has
            moved.
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-5 py-3 text-sm font-mono text-slate-700 dark:text-slate-300 hover:border-brand-500/40 transition-colors"
          >
            <Home size={14} /> Home
          </Link>
          <Link
            to="/threatintel"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-5 py-3 text-sm font-mono text-slate-700 dark:text-slate-300 hover:border-brand-500/40 transition-colors"
          >
            Threat Intel
          </Link>
          <Link
            to="/dfir"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-5 py-3 text-sm font-mono text-slate-700 dark:text-slate-300 hover:border-brand-500/40 transition-colors"
          >
            <Terminal size={14} /> DFIR Toolkit
          </Link>
        </div>
      </div>
    </div>
  );
}
