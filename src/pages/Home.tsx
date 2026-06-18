import { lazy, Suspense } from 'react';
import { Hero, Contact, Toolkits } from '../components/sections';
import { LiveSignalStrip } from '../components/LiveSignalStrip';
import { FeedHealthBadge } from '../components/FeedHealthBadge';
import { LatestBriefingCard } from '../components/threatintel/LatestBriefingCard';
import { GlobalPulseCard } from '../components/threatintel/GlobalPulseCard';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { RecentWritingSkeleton } from '../components/RecentWriting';
import { personalInfo } from '../data/content';
import { useInView } from '../hooks/useInView';
import { useDocumentMeta } from '../hooks/useDocumentMeta';

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
  useDocumentMeta({
    title: 'Home',
    description:
      'Pranith Jain — Security Analyst & Detection Engineer. DFIR toolkit, threat-intel catalogs, and live breach signals.',
    canonicalPath: '/',
  });

  // Hunt.io-inspired vertical rhythm:
  //   Hero              -> 0 (sits at the top)
  //   LiveSignalStrip   -> mt-12  (3rem)  — pairs with the hero's stat row
  //   Briefing+Global   -> mt-6   (1.5rem)— sits inside the same data band
  //   Toolkits          -> mt-20  (5rem)  — first primary section
  //   RecentWriting     -> mt-16  (4rem)
  //   Contact           -> mt-24  (6rem)  — the closer, gets the most air
  return (
    <>
      <Hero personalInfo={personalInfo} />

      <RevealSection className="mt-12">
        <LiveSignalStrip />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <LatestBriefingCard />
          <GlobalPulseCard />
        </div>
        <div className="mt-2 flex items-center justify-end">
          <FeedHealthBadge />
        </div>
      </RevealSection>

      <RevealSection className="mt-20">
        <Toolkits />
      </RevealSection>

      <RevealSection className="mt-16">
        <ErrorBoundary fallback={null}>
          <Suspense fallback={<RecentWritingSkeleton />}>
            <RecentWriting />
          </Suspense>
        </ErrorBoundary>
      </RevealSection>

      <RevealSection className="mt-24">
        <Contact personalInfo={personalInfo} />
      </RevealSection>
    </>
  );
}
