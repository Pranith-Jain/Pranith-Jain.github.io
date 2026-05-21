import { Hero, Solutions, Featured, Contact } from '../components/sections';
import { DailyQuote } from '../components/DailyQuote';
import { LiveSignalStrip } from '../components/LiveSignalStrip';
import { LatestBriefingCard } from '../components/threatintel/LatestBriefingCard';
import { RecentWriting } from '../components/RecentWriting';

/**
 * Home page sections used to be React.lazy imports wrapped in Suspense.
 * That was a regression for SSR because `renderToString` doesn't wait
 * for Suspense to resolve and emits spinner fallbacks into the
 * prerendered HTML, hurting LCP and forcing extra hydration work. Eager
 * imports here add a small overhead to the Home chunk but let the
 * prerender pipeline emit real markup.
 *
 * Composition order — each line earns its slot:
 *   Hero               : identity + the live sparkline thesis statement
 *   LiveSignalStrip    : three live tiles proving the platform works on /
 *                        before the visitor has to drill anywhere
 *   LatestBriefingCard : today's autonomous-generated CTI briefing — the
 *                        platform's editorial wrap-up of the day's data,
 *                        sits between the raw tiles and the authored work
 *   RecentWriting      : authored editorial — case studies + original
 *                        research — so the "I write" claim has a click-
 *                        through path from the root
 *   Solutions          : capability framing (what work the site supports)
 *   Featured           : press/external coverage
 *   DailyQuote         : a thought to close on, deliberately last
 *                        decorative content before the CTA
 *   Contact            : the ask
 *
 * DailyQuote used to sit right after LiveSignalStrip; moved to the
 * closing position so two data-rich sections don't get a quote-break in
 * between them.
 */
export default function Home() {
  return (
    <>
      <Hero />
      <LiveSignalStrip />
      <div className="mt-8">
        <LatestBriefingCard />
      </div>
      <RecentWriting />
      <Solutions />
      <Featured />
      <DailyQuote />
      <Contact />
    </>
  );
}
