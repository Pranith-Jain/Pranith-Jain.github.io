import { Link } from 'react-router-dom';
import { ArrowLeft, Radio, Activity, FileText, Globe, Wrench, Compass, Sparkles } from 'lucide-react';
import { LiveSignalStrip } from '../components/LiveSignalStrip';
import { LatestBriefingCard } from '../components/threatintel/LatestBriefingCard';
import { GlobalPulseCard } from '../components/threatintel/GlobalPulseCard';
import { FeedHealthBadge } from '../components/FeedHealthBadge';
import { ToolOfTheDay } from '../components/ToolOfTheDay';
import { PageToCheckOut } from '../components/PageToCheckOut';
import { QuoteOfTheDay } from '../components/QuoteOfTheDay';
import { PageMeta } from '../components/PageMeta';

/**
 * /snapshots — single bookmarkable URL that aggregates every live signal
 * surfaced on the portfolio home. Each child component is self-fetching
 * (no prop drilling) so this is just a composition. The point: power
 * users can pin one URL and see the state of the platform at a glance.
 */
export default function Snapshots(): JSX.Element {
  return (
    <>
      <PageMeta
        title="Live Snapshots"
        description="Live platform telemetry in one place — ransomware victims in the last 24h, top detections, IOC consensus, global pulse, latest briefing, feed health, and a featured tool."
        canonicalPath="/snapshots"
      />
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-mini font-mono text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <ArrowLeft size={14} /> back to home
        </Link>

        <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
              Live Snapshots
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              One bookmarkable view of every signal the platform surfaces on the home page. Components self-fetch on
              mount, so refresh to recapture. Numbers are platform-wide telemetry — not personal.
            </p>
          </div>
          <FeedHealthBadge />
        </header>

        <section
          aria-labelledby="snap-telemetry"
          className="mt-8 rounded-lg border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/40"
        >
          <div className="mb-3 flex items-center gap-2">
            <Radio size={14} className="text-rose-500" aria-hidden="true" />
            <h2
              id="snap-telemetry"
              className="font-mono text-mini uppercase tracking-[0.18em] text-slate-600 dark:text-slate-300"
            >
              Live from the platform
            </h2>
          </div>
          <LiveSignalStrip />
          <div className="mt-2 flex justify-end">
            <Link
              to="/threatintel"
              className="inline-flex items-center gap-1 text-mini font-mono text-brand-600 hover:underline dark:text-brand-400"
            >
              view full <Activity size={12} /> threat intel
            </Link>
          </div>
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <section
            aria-labelledby="snap-briefings"
            className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <SectionHeader
              id="snap-briefings"
              icon={<FileText size={14} className="text-brand-500" />}
              title="Latest Briefing"
              viewHref="/threatintel/briefings"
            />
            <LatestBriefingCard />
          </section>

          <section
            aria-labelledby="snap-pulse"
            className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <SectionHeader
              id="snap-pulse"
              icon={<Globe size={14} className="text-brand-500" />}
              title="Global Pulse"
              viewHref="/threatintel/predictive/global-pulse"
            />
            <GlobalPulseCard />
          </section>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <section
            aria-labelledby="snap-quote"
            className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <SectionHeader id="snap-quote" icon={<Sparkles size={14} className="text-amber-500" />} title="Quote" />
            <QuoteOfTheDay />
          </section>

          <section
            aria-labelledby="snap-tool"
            className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <SectionHeader
              id="snap-tool"
              icon={<Wrench size={14} className="text-brand-500" />}
              title="Tool of the day"
              viewHref="/dfir/catalog"
            />
            <ToolOfTheDay />
          </section>

          <section
            aria-labelledby="snap-page"
            className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/40"
          >
            <SectionHeader
              id="snap-page"
              icon={<Compass size={14} className="text-emerald-500" />}
              title="Page to check out"
            />
            <PageToCheckOut />
          </section>
        </div>

        <p className="mt-10 text-center text-mini font-mono text-slate-500 dark:text-slate-500">
          refresh to recapture · each card fetches independently · bookmarkable
        </p>
      </div>
    </>
  );
}

function SectionHeader({
  id,
  icon,
  title,
  viewHref,
}: {
  id: string;
  icon: JSX.Element;
  title: string;
  viewHref?: string;
}): JSX.Element {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2
        id={id}
        className="flex items-center gap-2 font-mono text-mini uppercase tracking-[0.18em] text-slate-600 dark:text-slate-300"
      >
        {icon}
        {title}
      </h2>
      {viewHref && (
        <Link
          to={viewHref}
          className="inline-flex items-center gap-1 text-mini font-mono text-brand-600 hover:underline dark:text-brand-400"
        >
          view full
        </Link>
      )}
    </div>
  );
}
