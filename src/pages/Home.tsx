import { lazy, Suspense } from 'react';
import { Hero, Contact, Toolkits } from '../components/sections';
import { LiveSignalStrip } from '../components/LiveSignalStrip';
import { FeedHealthBadge } from '../components/FeedHealthBadge';
import { LatestBriefingCard } from '../components/threatintel/LatestBriefingCard';
import { GlobalPulseCard } from '../components/threatintel/GlobalPulseCard';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { RecentWritingSkeleton } from '../components/RecentWriting';
import { QuoteOfTheDay } from '../components/QuoteOfTheDay';
import { ToolOfTheDay } from '../components/ToolOfTheDay';
import { PageToCheckOut } from '../components/PageToCheckOut';
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

      <RevealSection className="mt-16">
        <div className="grid gap-3 sm:grid-cols-3">
          <QuoteOfTheDay />
          <ToolOfTheDay />
          <PageToCheckOut />
        </div>
      </RevealSection>

      <RevealSection className="mt-16">
        <Toolkits />
      </RevealSection>

      <RevealSection className="mt-12">
        <ErrorBoundary fallback={null}>
          <Suspense fallback={<RecentWritingSkeleton />}>
            <RecentWriting />
          </Suspense>
        </ErrorBoundary>
      </RevealSection>

      <RevealSection className="mt-20">
        <Contact personalInfo={personalInfo} />
      </RevealSection>
    </>
  );
}
