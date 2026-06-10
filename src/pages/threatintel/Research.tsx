import { Link } from 'react-router-dom';
import { FileText, ExternalLink } from 'lucide-react';
import { publishedResearch } from '../../data/threatintel/research';
import { AiSummaryCard } from '../../components/intel/AiSummaryCard';
import { DataPageLayout } from '../../components/DataPageLayout';

/**
 * /threatintel/research — original adversary-tracking and methodology
 * pieces written by Pranith Jain. Distinct from /threatintel/writeups
 * (aggregated third-party blogs) and /threatintel/signal (the curated
 * subset of the same). This is the only surface on the platform with
 * authored content under one byline.
 *
 * Index page renders the published list with excerpts; each entry links
 * to /threatintel/research/<slug> for the full read.
 */
export default function Research(): JSX.Element {
  const posts = publishedResearch();
  return (
    <DataPageLayout
      backTo="/threatintel"
      icon={<FileText size={28} />}
      title="Research"
      maxWidthClass="max-w-3xl"
      description={
        <>
          <span className="block">
            Original adversary-tracking and methodology pieces. Every quantitative claim is sourced to the platform's
            own aggregated feed (verifiable at the linked detail pages) or to named third-party reporting. No anonymous
            claims.
          </span>
          <span className="mt-3 block text-meta font-mono text-slate-500">
            For aggregated third-party research, see{' '}
            <Link to="/threatintel/signal" className="text-brand-600 dark:text-brand-400 hover:underline">
              /threatintel/signal
            </Link>{' '}
            (curated) or{' '}
            <Link to="/threatintel/writeups" className="text-brand-600 dark:text-brand-400 hover:underline">
              /threatintel/writeups
            </Link>{' '}
            (firehose).
          </span>
        </>
      }
      empty={posts.length === 0}
      emptyMessage="No published research yet. New pieces ship roughly monthly."
    >
      {posts.length > 0 && (
        <AiSummaryCard
          surface="Research Collection"
          items={posts.map((p) => ({
            title: p.title,
            body: p.excerpt,
            source: 'Pranith Jain',
          }))}
          className="mb-8"
        />
      )}

      <ul className="space-y-4">
        {posts.map((p) => (
          <li
            key={p.slug}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-e1 p-5 transition hover:border-brand-500/40"
          >
            <Link to={`/threatintel/research/${p.slug}`} className="group block">
              <div className="text-micro font-mono uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400 mb-1.5">
                {p.kicker}
              </div>
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors leading-snug">
                {p.title}
                <ExternalLink size={14} className="inline-block ml-2 opacity-50" aria-hidden="true" />
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-2">{p.excerpt}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-mini font-mono text-slate-500">
                <time dateTime={p.publishedAt}>
                  {new Date(p.publishedAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
                <span>·</span>
                <span>{p.readingTime} read</span>
                <span>·</span>
                <span>Pranith Jain</span>
              </div>
              {p.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {p.tags.slice(0, 6).map((t) => (
                    <span
                      key={t}
                      className="text-micro font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-slate-500"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </DataPageLayout>
  );
}
