import { lazy, Suspense } from 'react';
import { Hero, Contact, Toolkits } from '../components/sections';
import { LiveSignalStrip } from '../components/LiveSignalStrip';
import { FeedHealthBadge } from '../components/FeedHealthBadge';
import { LatestBriefingCard } from '../components/threatintel/LatestBriefingCard';
import { GlobalPulseCard } from '../components/threatintel/GlobalPulseCard';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { RecentWritingSkeleton } from '../components/RecentWriting';
import { personalInfo } from '../data/content';

// Below the fold, and it statically pulls in the full case-study + research
// datasets — lazy-load it so those leave the eager landing chunk.
const RecentWriting = lazy(() => import('../components/RecentWriting').then((m) => ({ default: m.RecentWriting })));

export default function Home() {
  return (
    <>
      <Hero personalInfo={personalInfo} />
      <LiveSignalStrip />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <LatestBriefingCard />
        <GlobalPulseCard />
      </div>
      <div className="mt-2 flex items-center justify-end">
        <FeedHealthBadge />
      </div>
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
      <Contact personalInfo={personalInfo} />
    </>
  );
}
