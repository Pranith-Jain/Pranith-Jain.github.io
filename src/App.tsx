import { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useTheme, useScrollProgress } from './hooks';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { SkipToContent } from './components/SkipToContent';
import { StructuredData } from './components/StructuredData';
import { ScrollProgress, BackToTop } from './components/ui';
import { Layout } from './components/Layout';

// Top-level pages were eagerly imported, which dragged framer-motion (used
// by their inner section components) into the initial bundle. Lazy them so
// the initial paint only loads what's needed for the current route.
// Home stays eager-ish via a synchronous import inside the lazy promise so
// landing on `/` doesn't show a Suspense flash on the most-likely entry.
import Home from './pages/Home';
const About = lazy(() => import('./pages/About'));
const Skills = lazy(() => import('./pages/Skills'));
const Experience = lazy(() => import('./pages/Experience'));
const Projects = lazy(() => import('./pages/Projects'));
const DFIR = lazy(() => import('./pages/DFIR'));

const IocCheck = lazy(() => import('./pages/dfir/IocCheck'));
const Phishing = lazy(() => import('./pages/dfir/Phishing'));
const Domain = lazy(() => import('./pages/dfir/Domain'));
const Exposure = lazy(() => import('./pages/dfir/Exposure'));
const Wiki = lazy(() => import('./pages/dfir/Wiki'));
const WikiArticle = lazy(() => import('./pages/dfir/WikiArticle'));
const Dashboard = lazy(() => import('./pages/dfir/Dashboard'));
const Actors = lazy(() => import('./pages/dfir/Actors'));
const ActorDetail = lazy(() => import('./pages/dfir/ActorDetail'));
const Privacy = lazy(() => import('./pages/dfir/Privacy'));
const Briefings = lazy(() => import('./pages/dfir/Briefings'));
const BriefingDetail = lazy(() => import('./pages/dfir/BriefingDetail'));
const Cve = lazy(() => import('./pages/dfir/Cve'));
const Decode = lazy(() => import('./pages/dfir/Decode'));
const AsnLookup = lazy(() => import('./pages/dfir/AsnLookup'));
const Breach = lazy(() => import('./pages/dfir/Breach'));
const ExifParse = lazy(() => import('./pages/dfir/ExifParse'));
const MitreMatrix = lazy(() => import('./pages/dfir/MitreMatrix'));
const UrlPreview = lazy(() => import('./pages/dfir/UrlPreview'));
const IocExtractor = lazy(() => import('./pages/dfir/IocExtractor'));
const JwtInspect = lazy(() => import('./pages/dfir/JwtInspect'));
const Punycode = lazy(() => import('./pages/dfir/Punycode'));
const Takeover = lazy(() => import('./pages/dfir/Takeover'));
const NotFound = lazy(() => import('./pages/NotFound'));
const StixViewer = lazy(() => import('./pages/dfir/StixViewer'));
const DarkWeb = lazy(() => import('./pages/dfir/DarkWeb'));
const ThreatMap = lazy(() => import('./pages/dfir/ThreatMap'));
const Rules = lazy(() => import('./pages/dfir/Rules'));
const Owasp = lazy(() => import('./pages/dfir/Owasp'));
const PromptInjection = lazy(() => import('./pages/dfir/PromptInjection'));
const McpAudit = lazy(() => import('./pages/dfir/McpAudit'));
const KillChain = lazy(() => import('./pages/dfir/KillChain'));
const Diamond = lazy(() => import('./pages/dfir/Diamond'));

function TechniqueRedirect() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('technique') || params.get('t') || params.get('q') || '';
  const target = id ? `/dfir/mitre?id=${encodeURIComponent(id)}` : '/dfir/mitre';
  return <Navigate to={target} replace />;
}

function SectionLoader() {
  return (
    <div className="min-h-[200px] flex items-center justify-center" aria-hidden="true">
      <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
    </div>
  );
}

export function AppContent() {
  const { isDark, toggleTheme } = useTheme();
  const { progress, showBackToTop, scrollToTop } = useScrollProgress();
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const id = location.hash.substring(1);
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location]);

  return (
    <>
      <StructuredData />

      <SkipToContent />

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

      <div
        className="fixed inset-0 -z-10 pointer-events-none transition-opacity duration-500"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`,
          opacity: isDark ? 0.18 : 0.1,
        }}
        aria-hidden="true"
      />

      <ScrollProgress progress={progress} />

      <Header isDark={isDark} onToggleTheme={toggleTheme} />

      <main id="main-content" tabIndex={-1}>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/about"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <About />
                </Suspense>
              }
            />
            <Route
              path="/skills"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Skills />
                </Suspense>
              }
            />
            <Route
              path="/experience"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Experience />
                </Suspense>
              }
            />
            <Route
              path="/projects"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Projects />
                </Suspense>
              }
            />
            <Route
              path="/dfir"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <DFIR />
                </Suspense>
              }
            />
            <Route
              path="/dfir/ioc-check"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <IocCheck />
                </Suspense>
              }
            />
            <Route
              path="/dfir/phishing"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Phishing />
                </Suspense>
              }
            />
            <Route
              path="/dfir/domain"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Domain />
                </Suspense>
              }
            />
            <Route
              path="/dfir/exposure"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Exposure />
                </Suspense>
              }
            />
            {/* Hash Analyzer was merged into the IOC Checker, which already handles hashes. */}
            <Route path="/dfir/file" element={<Navigate to="/dfir/ioc-check" replace />} />
            <Route
              path="/dfir/wiki"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Wiki />
                </Suspense>
              }
            />
            <Route
              path="/dfir/wiki/:slug"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <WikiArticle />
                </Suspense>
              }
            />
            <Route
              path="/dfir/dashboard"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Dashboard />
                </Suspense>
              }
            />
            <Route
              path="/dfir/actors"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Actors />
                </Suspense>
              }
            />
            <Route
              path="/dfir/actors/:slug"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <ActorDetail />
                </Suspense>
              }
            />
            <Route
              path="/dfir/privacy"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Privacy />
                </Suspense>
              }
            />
            <Route
              path="/dfir/briefings"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Briefings />
                </Suspense>
              }
            />
            <Route
              path="/dfir/briefings/:slug"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <BriefingDetail />
                </Suspense>
              }
            />
            <Route
              path="/dfir/cve"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Cve />
                </Suspense>
              }
            />
            <Route
              path="/dfir/decode"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Decode />
                </Suspense>
              }
            />
            {/* Legacy route — merged into /dfir/mitre. Forward the technique param as ?id= */}
            <Route path="/dfir/technique" element={<TechniqueRedirect />} />
            <Route
              path="/dfir/asn"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <AsnLookup />
                </Suspense>
              }
            />
            <Route
              path="/dfir/breach"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Breach />
                </Suspense>
              }
            />
            <Route
              path="/dfir/exif"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <ExifParse />
                </Suspense>
              }
            />
            <Route
              path="/dfir/mitre"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <MitreMatrix />
                </Suspense>
              }
            />
            <Route
              path="/dfir/url-preview"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <UrlPreview />
                </Suspense>
              }
            />
            <Route
              path="/dfir/extract"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <IocExtractor />
                </Suspense>
              }
            />
            <Route
              path="/dfir/jwt"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <JwtInspect />
                </Suspense>
              }
            />
            <Route
              path="/dfir/punycode"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Punycode />
                </Suspense>
              }
            />
            <Route
              path="/dfir/takeover"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Takeover />
                </Suspense>
              }
            />
            <Route
              path="/dfir/stix"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <StixViewer />
                </Suspense>
              }
            />
            <Route
              path="/dfir/darkweb"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <DarkWeb />
                </Suspense>
              }
            />
            <Route
              path="/dfir/threat-map"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <ThreatMap />
                </Suspense>
              }
            />
            <Route
              path="/dfir/rules"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Rules />
                </Suspense>
              }
            />
            <Route
              path="/dfir/owasp"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Owasp />
                </Suspense>
              }
            />
            <Route
              path="/dfir/prompt-injection"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <PromptInjection />
                </Suspense>
              }
            />
            <Route
              path="/dfir/mcp-audit"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <McpAudit />
                </Suspense>
              }
            />
            <Route
              path="/dfir/kill-chain"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <KillChain />
                </Suspense>
              }
            />
            <Route
              path="/dfir/diamond"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <Diamond />
                </Suspense>
              }
            />
            <Route path="/difr" element={<Navigate to="/dfir" replace />} />
            <Route
              path="*"
              element={
                <Suspense fallback={<SectionLoader />}>
                  <NotFound />
                </Suspense>
              }
            />
          </Routes>
        </Layout>
      </main>

      <Footer />

      <BackToTop visible={showBackToTop} onClick={scrollToTop} />

      <div id="aria-live-region" aria-live="polite" aria-atomic="true" className="sr-only" />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
