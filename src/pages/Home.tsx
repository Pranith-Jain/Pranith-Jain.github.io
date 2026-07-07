import { lazy, Suspense } from 'react';
import { PageMeta } from '../components/PageMeta';
import { Hero, Contact, Toolkits } from '../components/sections';
import { LiveSignalStrip } from '../components/LiveSignalStrip';
import { FeedHealthBadge } from '../components/FeedHealthBadge';
import { LatestBriefingCard } from '../components/threatintel/LatestBriefingCard';
import { GlobalPulseCard } from '../components/threatintel/GlobalPulseCard';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { RecentWritingSkeleton } from '../components/RecentWritingSkeleton';
import { QuoteOfTheDay } from '../components/QuoteOfTheDay';
import { ToolOfTheDay } from '../components/ToolOfTheDay';
import { PageToCheckOut } from '../components/PageToCheckOut';
import { personalInfo } from '../data/content';
import { useInView } from '../hooks/useInView';

const RecentWriting = lazy(() => import('../components/RecentWriting').then((m) => ({ default: m.RecentWriting })));

function RevealSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const [ref, inView] = useInView({ threshold: 0.1 });
  return (
    <div
      ref={ref}
      className={`transition-all duration-500 ease-out motion-reduce:transition-none ${
        inView
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-6 motion-reduce:opacity-100 motion-reduce:translate-y-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <PageMeta
        title="Home"
        description="Pranith Jain — Security Analyst & Detection Engineer. DFIR toolkit, threat-intel catalogs, and live breach signals."
        canonicalPath="/"
      />
      <Hero personalInfo={personalInfo} />

      {/* Live platform signals — labeled for hierarchy/scannability */}
      <RevealSection className="mt-16">
        <div className="mb-4 text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Live from the platform
        </div>
        <LiveSignalStrip />
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <LatestBriefingCard />
          <GlobalPulseCard />
        </div>
        <div className="mt-2 flex items-center justify-end">
          <FeedHealthBadge />
        </div>
      </RevealSection>

      {/* Products first — the toolkits are the substance of the portfolio, so
          they lead ahead of the lighter "daily picks" filler below. */}
      <RevealSection className="mt-16">
        <Toolkits />
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

      {/* Daily picks — light, rotating filler; kept near the foot of the page */}
      <RevealSection className="mt-16">
        <div className="mb-4 text-eyebrow font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
          Daily picks
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <QuoteOfTheDay />
          <ToolOfTheDay />
          <PageToCheckOut />
        </div>
      </RevealSection>

      <RevealSection className="mt-20">
        <Contact personalInfo={personalInfo} />
      </RevealSection>
    </>
  );
}
