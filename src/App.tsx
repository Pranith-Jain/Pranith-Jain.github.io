import { Suspense, lazy } from 'react';
import { useTheme, useScrollProgress } from './hooks';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Layout } from './components/Layout';
import { SkipToContent } from './components/SkipToContent';
import { StructuredData } from './components/StructuredData';
import { ScrollProgress, BackToTop } from './components/ui';

// Lazy load sections below the fold for better initial load performance
const Hero = lazy(() => import('./components/sections').then((m) => ({ default: m.Hero })));
const About = lazy(() => import('./components/sections').then((m) => ({ default: m.About })));
const Skills = lazy(() => import('./components/sections').then((m) => ({ default: m.Skills })));
const Companies = lazy(() => import('./components/sections').then((m) => ({ default: m.Companies })));
const Experience = lazy(() => import('./components/sections').then((m) => ({ default: m.Experience })));
const Certifications = lazy(() => import('./components/sections').then((m) => ({ default: m.Certifications })));
const Projects = lazy(() => import('./components/sections').then((m) => ({ default: m.Projects })));
const DFIR = lazy(() => import('./components/sections').then((m) => ({ default: m.DFIR })));
const Featured = lazy(() => import('./components/sections').then((m) => ({ default: m.Featured })));
const Memberships = lazy(() => import('./components/sections').then((m) => ({ default: m.Memberships })));
const Contact = lazy(() => import('./components/sections').then((m) => ({ default: m.Contact })));

// Loading fallback for lazy-loaded sections
function SectionLoader() {
  return (
    <div className="min-h-[200px] flex items-center justify-center" aria-hidden="true">
      <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
    </div>
  );
}

function App() {
  const { isDark, toggleTheme } = useTheme();
  const { progress, showBackToTop, scrollToTop } = useScrollProgress();

  return (
    <>
      {/* JSON-LD Structured Data for SEO */}
      <StructuredData />

      {/* Skip to content link for keyboard navigation */}
      <SkipToContent />

      {/* Gradient Mesh Background */}
      <div
        className="fixed inset-0 -z-10 transition-opacity duration-500"
        style={{
          background: `
            radial-gradient(at 27% 37%, rgba(59, 130, 246, 0.18) 0px, transparent 50%),
            radial-gradient(at 97% 21%, rgba(16, 185, 129, 0.12) 0px, transparent 50%),
            radial-gradient(at 52% 99%, rgba(236, 72, 153, 0.12) 0px, transparent 50%),
            radial-gradient(at 10% 29%, rgba(168, 85, 247, 0.18) 0px, transparent 50%),
            radial-gradient(at 97% 96%, rgba(6, 182, 212, 0.12) 0px, transparent 50%),
            radial-gradient(at 33% 50%, rgba(99, 102, 241, 0.14) 0px, transparent 50%),
            radial-gradient(at 79% 53%, rgba(249, 115, 22, 0.10) 0px, transparent 50%)
          `,
          opacity: isDark ? 0.6 : 0.5,
        }}
        aria-hidden="true"
      />

      {/* Noise Texture Overlay */}
      <div
        className="fixed inset-0 -z-10 pointer-events-none transition-opacity duration-500"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`,
          opacity: isDark ? 0.18 : 0.1,
        }}
        aria-hidden="true"
      />

      {/* Scroll Progress Indicator */}
      <ScrollProgress progress={progress} />

      {/* Header with navigation */}
      <Header isDark={isDark} onToggleTheme={toggleTheme} />

      {/* Main Content - with skip link target */}
      <main id="main-content" tabIndex={-1}>
        <Layout>
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
            <DFIR />
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
        </Layout>
      </main>

      {/* Back to Top Button */}
      <BackToTop visible={showBackToTop} onClick={scrollToTop} />

      {/* Live region for dynamic announcements */}
      <div id="aria-live-region" aria-live="polite" aria-atomic="true" className="sr-only" />
    </>
  );
}

export default App;
