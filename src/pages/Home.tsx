import { lazy, Suspense } from 'react';
import { Hero, Featured, Memberships, Contact } from '../components/sections';
import { LiveSignalStrip } from '../components/LiveSignalStrip';
import { personalInfo, featuredArticles, memberships } from '../data/content';

// Below the fold, and it statically pulls in the full case-study + research
// datasets — lazy-load it so those leave the eager landing chunk.
const RecentWriting = lazy(() => import('../components/RecentWriting').then((m) => ({ default: m.RecentWriting })));

export default function Home() {
  return (
    <>
      <Hero personalInfo={personalInfo} />
      <LiveSignalStrip />
      <Suspense fallback={null}>
        <RecentWriting />
      </Suspense>
      <Featured featuredArticles={featuredArticles} />
      <Memberships memberships={memberships} />
      <Contact personalInfo={personalInfo} />
    </>
  );
}
