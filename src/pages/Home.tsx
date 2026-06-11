import { lazy, Suspense } from 'react';
import { Hero, AboutPreview, Contact, Toolkits } from '../components/sections';
import { LiveSignalStrip } from '../components/LiveSignalStrip';
import { FeedHealthBadge } from '../components/FeedHealthBadge';
import { LatestBriefingCard } from '../components/threatintel/LatestBriefingCard';
import { GlobalPulseCard } from '../components/threatintel/GlobalPulseCard';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { RecentWritingSkeleton } from '../components/RecentWriting';
import { personalInfo } from '../data/content';
import { useInView } from '../hooks/useInView';

const RecentWriting = lazy(() => import('../components/RecentWriting').then((m) => ({ default: m.RecentWriting })));

function RevealSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const [ref, inView] = useInView({ threshold: 0.1 });
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      } ${className}`}
    >
      {children}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Hero personalInfo={personalInfo} />
      <AboutPreview personalInfo={personalInfo} />
      <RevealSection>
        <Toolkits />
      </RevealSection>
      <RevealSection>
        <LiveSignalStrip />
      </RevealSection>
      <RevealSection>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <LatestBriefingCard />
          <GlobalPulseCard />
        </div>
        <div className="mt-2 flex items-center justify-end">
          <FeedHealthBadge />
        </div>
      </RevealSection>
      <RevealSection>
        <ErrorBoundary fallback={null}>
          <Suspense fallback={<RecentWritingSkeleton />}>
            <RecentWriting />
          </Suspense>
        </ErrorBoundary>
      </RevealSection>
      <RevealSection>
        <Contact personalInfo={personalInfo} />
      </RevealSection>
    </>
  );
}
