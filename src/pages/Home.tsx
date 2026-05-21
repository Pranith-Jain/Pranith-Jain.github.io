import { Hero, Solutions, Featured, Contact } from '../components/sections';
import { DailyQuote } from '../components/DailyQuote';
import { LiveSignalStrip } from '../components/LiveSignalStrip';

/**
 * Home page sections used to be React.lazy imports wrapped in Suspense.
 * That was a regression for SSR because `renderToString` doesn't wait
 * for Suspense to resolve and emits spinner fallbacks into the
 * prerendered HTML, hurting LCP and forcing extra hydration work. Eager
 * imports here add a small overhead to the Home chunk but let the
 * prerender pipeline emit real markup.
 *
 * `LiveSignalStrip` sits between Hero and DailyQuote so a first-time
 * visitor sees the threat-intel platform actually working with current
 * data, not just claims about it, before they've had to drill anywhere.
 * Each tile fetches client-side; the strip never blocks SSR markup.
 */
export default function Home() {
  return (
    <>
      <Hero />
      <LiveSignalStrip />
      <DailyQuote />
      <Solutions />
      <Featured />
      <Contact />
    </>
  );
}
