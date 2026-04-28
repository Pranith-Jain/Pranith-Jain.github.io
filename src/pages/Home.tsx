import { Suspense, lazy } from 'react';

const Hero = lazy(() => import('../components/sections').then((m) => ({ default: m.Hero })));
const Featured = lazy(() => import('../components/sections').then((m) => ({ default: m.Featured })));
const Contact = lazy(() => import('../components/sections').then((m) => ({ default: m.Contact })));

function SectionLoader() {
  return (
    <div className="min-h-[200px] flex items-center justify-center" aria-hidden="true">
      <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Suspense fallback={<SectionLoader />}>
        <Hero />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <Featured />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <Contact />
      </Suspense>
    </>
  );
}
