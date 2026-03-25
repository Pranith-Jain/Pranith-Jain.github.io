import { useTheme, useScrollProgress } from './hooks';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Layout } from './components/Layout';
import { ScrollProgress, BackToTop } from './components/ui';
import {
  Hero,
  About,
  Skills,
  Companies,
  Experience,
  Certifications,
  Projects,
  Featured,
  Memberships,
  Contact,
} from './components/sections';

function App() {
  const { isDark, toggleTheme } = useTheme();
  const { progress, showBackToTop, scrollToTop } = useScrollProgress();

  return (
    <>
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
      />

      {/* Noise Texture Overlay */}
      <div
        className="fixed inset-0 -z-10 pointer-events-none transition-opacity duration-500"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`,
          opacity: isDark ? 0.18 : 0.1,
        }}
      />

      {/* Scroll Progress */}
      <ScrollProgress progress={progress} />

      {/* Header */}
      <Header isDark={isDark} onToggleTheme={toggleTheme} />

      {/* Main Content */}
      <main id="top">
        <Layout>
          <Hero />
          <About />
          <Skills />
          <Companies />
          <Experience />
          <Certifications />
          <Projects />
          <Featured />
          <Memberships />
          <Contact />
          <Footer />
        </Layout>
      </main>

      {/* Back to Top */}
      <BackToTop visible={showBackToTop} onClick={scrollToTop} />
    </>
  );
}

export default App;
