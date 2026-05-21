import { Link } from 'react-router-dom';
import { BackLink } from '../../components/BackLink';
import { ArrowLeft, FileText, ExternalLink } from 'lucide-react';
import { publishedResearch } from '../../data/threatintel/research';

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
    <div className="max-w-3xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/threatintel"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      {/* Block-wrap the H1 + intro so the inline-flex headline isn't
          baselined next to the (also inline) BackLink above. Same pattern
          Detections.tsx and the other /threatintel pages use. */}
      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 inline-flex items-center gap-3">
          <FileText size={28} className="text-brand-600 dark:text-brand-400" /> Research
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-3 max-w-3xl leading-relaxed">
          Original adversary-tracking and methodology pieces. Every quantitative claim is sourced to the platform's own
          aggregated feed (verifiable at the linked detail pages) or to named third-party reporting. No anonymous
          claims.
        </p>
        <p className="text-[12px] font-mono text-slate-500 mb-8">
          For aggregated third-party research, see{' '}
          <Link to="/threatintel/signal" className="text-brand-600 dark:text-brand-400 hover:underline">
            /threatintel/signal
          </Link>{' '}
          (curated) or{' '}
          <Link to="/threatintel/writeups" className="text-brand-600 dark:text-brand-400 hover:underline">
            /threatintel/writeups
          </Link>{' '}
          (firehose).
        </p>
      </div>

      {posts.length === 0 ? (
        <p className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-sm text-slate-500">
          No published research yet. New pieces ship roughly monthly.
        </p>
      ) : (
        <ul className="space-y-4">
          {posts.map((p) => (
            <li
              key={p.slug}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5 transition hover:border-brand-500/40"
            >
              <Link to={`/threatintel/research/${p.slug}`} className="group block">
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400 mb-1.5">
                  {p.kicker}
                </div>
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors leading-snug">
                  {p.title}
                  <ExternalLink size={14} className="inline-block ml-2 opacity-50" aria-hidden="true" />
                </h2>
                <p className="text-[14px] text-slate-600 dark:text-slate-400 leading-relaxed mt-2">{p.excerpt}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[11px] font-mono text-slate-500">
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
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-slate-500"
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
      )}
    </div>
  );
}
