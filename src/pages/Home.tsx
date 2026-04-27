import { Suspense, lazy } from 'react';
import { Footer } from '../components/Footer';

const Hero = lazy(() => import('../components/sections').then((m) => ({ default: m.Hero })));
const About = lazy(() => import('../components/sections').then((m) => ({ default: m.About })));
const Skills = lazy(() => import('../components/sections').then((m) => ({ default: m.Skills })));
const Companies = lazy(() => import('../components/sections').then((m) => ({ default: m.Companies })));
const Experience = lazy(() => import('../components/sections').then((m) => ({ default: m.Experience })));
const Certifications = lazy(() => import('../components/sections').then((m) => ({ default: m.Certifications })));
const Projects = lazy(() => import('../components/sections').then((m) => ({ default: m.Projects })));
const Featured = lazy(() => import('../components/sections').then((m) => ({ default: m.Featured })));
const Memberships = lazy(() => import('../components/sections').then((m) => ({ default: m.Memberships })));
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
        <About />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <Skills />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <Companies />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <Experience />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <Certifications />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <Projects />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <Featured />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <Memberships />
      </Suspense>
      <Suspense fallback={<SectionLoader />}>
        <Contact />
      </Suspense>
      <Footer />
    </>
  );
}
