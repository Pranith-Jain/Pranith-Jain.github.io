import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText, BookOpen } from 'lucide-react';
import { publishedCaseStudies } from '../data/case-studies';
import { publishedResearch } from '../data/threatintel/research';

/**
 * "Recent writing" section on the home page. Surfaces authored work
 * (case studies + research) so a first-time visitor on / has a direct
 * entry into the editorial layer of the site, not just the live-data
 * tiles and the platform pages.
 *
 * Mixes both sources into one date-sorted list because the editorial
 * decision is "what did I write most recently," not "what kind of thing
 * is it." Each card carries a kicker pill so the type is still
 * obvious at a glance.
 *
 * Cap is 4 items — enough to show range, few enough to fit cleanly
 * above the fold-and-a-half. Beyond 4, the per-section pages
 * (/projects, /threatintel/research) carry the depth.
 */

type EntryKind = 'case-study' | 'research';

interface Entry {
  kind: EntryKind;
  href: string;
  title: string;
  excerpt: string;
  publishedAt: string;
  readingTime: string;
  kicker: string;
}

function loadEntries(): Entry[] {
  const cases: Entry[] = publishedCaseStudies.map((c) => ({
    kind: 'case-study',
    href: `/projects/${c.slug}`,
    title: c.title,
    excerpt: c.excerpt,
    publishedAt: c.publishedAt,
    readingTime: c.readingTime,
    kicker: c.kicker,
  }));
  const research: Entry[] = publishedResearch().map((r) => ({
    kind: 'research',
    href: `/threatintel/research/${r.slug}`,
    title: r.title,
    excerpt: r.excerpt,
    publishedAt: r.publishedAt,
    readingTime: r.readingTime,
    kicker: r.kicker,
  }));
  // Sort by publishedAt desc, then take the first 4. Research entries
  // will naturally float to the top when their publish date is fresh,
  // which is the right editorial bias (research has higher cadence
  // signal than case studies, which ship in batches).
  return [...cases, ...research].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)).slice(0, 4);
}

export function RecentWritingSkeleton(): JSX.Element {
  return (
    <section className="mt-20 scroll-mt-24">
      <div className="mb-8 max-w-3xl">
        <div className="mb-3 h-4 w-20 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="h-10 w-64 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
        <div className="mt-4 h-5 w-96 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex h-full flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5"
          >
            <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
            <div className="h-6 w-3/4 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
            <div className="h-4 w-full rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
            <div className="mt-auto h-4 w-32 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function RecentWriting(): JSX.Element | null {
  const entries = useMemo(() => loadEntries(), []);
  if (entries.length === 0) return null;

  return (
    <section id="recent-writing" className="mt-20 scroll-mt-24">
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3 max-w-3xl">
        <div>
          <div className="mb-3 text-eyebrow font-bold uppercase text-brand-600 dark:text-brand-400">Writing</div>
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white">
            Recent writing
          </h2>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-400 max-w-2xl">
            Case studies on systems I've built, plus original adversary research grounded in the platform's own data.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono">
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
          >
            all case studies <ArrowRight size={11} />
          </Link>
          <Link
            to="/threatintel/research"
            className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline"
          >
            all research <ArrowRight size={11} />
          </Link>
        </div>
      </div>

      <ul className="grid gap-4 md:grid-cols-2">
        {entries.map((e) => {
          const Icon = e.kind === 'research' ? BookOpen : FileText;
          const pillColor =
            e.kind === 'research'
              ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
              : 'border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-300';
          const dateLabel = new Date(e.publishedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          });
          return (
            <li key={e.href}>
              <Link
                to={e.href}
                className="group flex h-full flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 transition hover:border-brand-500/40"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-[0.18em] px-2 py-0.5 rounded border ${pillColor}`}
                  >
                    <Icon size={10} aria-hidden="true" />
                    {e.kind === 'research' ? 'Research' : 'Case study'}
                  </span>
                  <span className="text-eyebrow font-mono uppercase text-slate-400">{e.kicker}</span>
                </div>
                <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors leading-snug">
                  {e.title}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">{e.excerpt}</p>
                <div className="mt-auto flex items-center gap-2 text-meta font-mono text-slate-400">
                  <time dateTime={e.publishedAt}>{dateLabel}</time>
                  <span aria-hidden="true">·</span>
                  <span>{e.readingTime} read</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
