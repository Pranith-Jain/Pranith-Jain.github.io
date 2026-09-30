import { lazy, Suspense } from 'react';
import { PageMeta } from '../../components/PageMeta';
import { RevealSection } from '../../components/RevealSection';
import { LiveSignalStrip } from '../../components/LiveSignalStrip';
import { FeedHealthBadge } from '../../components/FeedHealthBadge';
import { LatestBriefingCard } from '../../components/threatintel/LatestBriefingCard';
import { GlobalPulseCard } from '../../components/threatintel/GlobalPulseCard';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { RecentWritingSkeleton } from '../../components/RecentWritingSkeleton';
import { QuoteOfTheDay } from '../../components/QuoteOfTheDay';
import { ToolOfTheDay } from '../../components/ToolOfTheDay';
import { PageToCheckOut } from '../../components/PageToCheckOut';

const RecentWriting = lazy(() => import('../../components/RecentWriting').then((m) => ({ default: m.RecentWriting })));

/**
 * Home of the `tools` surface (`tools.pranithjain.qzz.io`).
 *
 * Everything on this page used to sit on the portfolio home, where it made the
 * personal site read as a live threat-intel dashboard. These widgets all fetch
 * `/api/v1/ioc-correlation`, `/api/v1/ransomware-recent` and `/api/v1/detections`,
 * so they belong to the platform half of the product — the portfolio home keeps
 * Hero / Toolkits / Contact and never fires those requests.
 */
export default function ToolsHome() {
  return (
    <>
      <PageMeta
        title="Tools"
        description="Live threat-intel signals, DFIR toolkits, briefings and detection feeds from the Pranith Jain security platform."
        canonicalPath="/"
      />

      {/* Live platform signals - the strip carries its own heading */}
      <RevealSection className="mt-16">
        <LiveSignalStrip />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <LatestBriefingCard />
          <GlobalPulseCard />
        </div>
        <div className="mt-2 flex items-center justify-end">
          <FeedHealthBadge />
        </div>
      </RevealSection>

      <RevealSection className="mt-16">
        <ErrorBoundary
          fallback={<p className="text-sm text-muted px-4 py-8 text-center">Recent writing unavailable</p>}
        >
          <Suspense fallback={<RecentWritingSkeleton />}>
            <RecentWriting />
          </Suspense>
        </ErrorBoundary>
      </RevealSection>

      {/* Daily picks - light, rotating filler; kept near the foot of the page */}
      <RevealSection className="mt-16">
        <div className="mb-4 text-eyebrow font-mono uppercase tracking-[0.2em] text-muted">Daily picks</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <QuoteOfTheDay />
          <ToolOfTheDay />
          <PageToCheckOut />
        </div>
      </RevealSection>
    </>
  );
}
