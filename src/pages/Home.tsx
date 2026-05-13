import { Hero, Solutions, Featured, Contact } from '../components/sections';
import { DailyQuote } from '../components/DailyQuote';

/**
 * Home page sections used to be React.lazy imports wrapped in Suspense.
 * That was a regression for SSR because `renderToString` doesn't wait
 * for Suspense to resolve and emits spinner fallbacks into the
 * prerendered HTML, hurting LCP and forcing extra hydration work. Eager
 * imports here add a small overhead to the Home chunk but let the
 * prerender pipeline emit real markup.
 */
export default function Home() {
  return (
    <>
      <Hero />
      <DailyQuote />
      <Solutions />
      <Featured />
      <Contact />
    </>
  );
}
