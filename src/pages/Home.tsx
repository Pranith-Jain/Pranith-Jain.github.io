import { lazy, Suspense } from 'react';
import { Hero, Featured, Memberships, Contact, Toolkits } from '../components/sections';
import { LiveSignalStrip } from '../components/LiveSignalStrip';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { RecentWritingSkeleton } from '../components/RecentWriting';
import { personalInfo, featuredArticles, memberships } from '../data/content';

// Below the fold, and it statically pulls in the full case-study + research
// datasets — lazy-load it so those leave the eager landing chunk.
const RecentWriting = lazy(() => import('../components/RecentWriting').then((m) => ({ default: m.RecentWriting })));

export default function Home() {
  return (
    <>
      <Hero personalInfo={personalInfo} />
      <LiveSignalStrip />
      <Toolkits />
      {/* RecentWriting is a lazy, below-the-fold chunk. Scope its own error
          boundary so a stale-shell chunk 404 after a deploy degrades just
          this optional section instead of bubbling to the app-level boundary
          and blanking the entire landing page (Hero included). */}
      <ErrorBoundary fallback={null}>
        <Suspense fallback={<RecentWritingSkeleton />}>
          <RecentWriting />
        </Suspense>
      </ErrorBoundary>
      <Featured featuredArticles={featuredArticles} />
      <Memberships memberships={memberships} />
      <Contact personalInfo={personalInfo} />
    </>
  );
}
