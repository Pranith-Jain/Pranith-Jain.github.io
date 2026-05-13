import { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useParams, Navigate } from 'react-router-dom';
import { useTheme, useScrollProgress } from './hooks';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { SkipToContent } from './components/SkipToContent';
import { StructuredData } from './components/StructuredData';
import { ScrollProgress, BackToTop } from './components/ui';
import { Layout } from './components/Layout';
import { AppShell } from './components/AppShell';
import { BackgroundLayer } from './components/BackgroundLayer';
import { CommandPalette } from './components/dfir/CommandPalette';

// Note (2026-05-12): tried React.lazy on these four shell components to
// trim the entry chunk. Lighthouse showed desktop wiki regressed 77→71
// and exif 84→71 because each new chunk adds a network round-trip that
// outweighs the parse savings. Keeping them eager.

// Top-level pages are lazy-loaded so the initial paint only ships the JS
// needed for the current route. Home stays eagerly imported because it's
// the most-likely landing page — lighthouse measurement 2026-05-12 showed
// lazy-Home regressed wiki score 77→64 and root 72→69. The Suspense
// fallback shifts FCP and adds CLS that outweighs the parse savings.
import Home from './pages/Home';
const About = lazy(() => import('./pages/About'));
const Skills = lazy(() => import('./pages/Skills'));
const Experience = lazy(() => import('./pages/Experience'));
const Projects = lazy(() => import('./pages/Projects'));
const Writeups = lazy(() => import('./pages/threatintel/Writeups'));
const DFIR = lazy(() => import('./pages/DFIR'));

const IocCheck = lazy(() => import('./pages/dfir/IocCheck'));
const Phishing = lazy(() => import('./pages/dfir/Phishing'));
const Domain = lazy(() => import('./pages/dfir/Domain'));
const FullSpectrum = lazy(() => import('./pages/dfir/FullSpectrum'));
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
const Encoder = lazy(() => import('./pages/dfir/Encoder'));
const CertSearch = lazy(() => import('./pages/dfir/CertSearch'));
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
const Lolbins = lazy(() => import('./pages/dfir/Lolbins'));
const RulePlayground = lazy(() => import('./pages/dfir/RulePlayground'));
const EmailDefense = lazy(() => import('./pages/dfir/EmailDefense'));
const Nhi = lazy(() => import('./pages/dfir/Nhi'));
const PowershellDeobf = lazy(() => import('./pages/dfir/PowershellDeobf'));
const AgentMap = lazy(() => import('./pages/dfir/AgentMap'));
const Tabletop = lazy(() => import('./pages/dfir/Tabletop'));
const Grc = lazy(() => import('./pages/dfir/Grc'));
const DlpScan = lazy(() => import('./pages/dfir/DlpScan'));
const DataClassification = lazy(() => import('./pages/dfir/DataClassification'));
const PrivacyHub = lazy(() => import('./pages/dfir/PrivacyHub'));
const UsernamePivot = lazy(() => import('./pages/dfir/UsernamePivot'));
const Wayback = lazy(() => import('./pages/dfir/Wayback'));
const IpGeo = lazy(() => import('./pages/dfir/IpGeo'));
const LogParser = lazy(() => import('./pages/dfir/LogParser'));
const Socmint = lazy(() => import('./pages/dfir/Socmint'));
const OsintFramework = lazy(() => import('./pages/dfir/OsintFramework'));
const SecopsCatalog = lazy(() => import('./pages/dfir/SecopsCatalog'));
const CveResourcesCatalog = lazy(() => import('./pages/dfir/CveResourcesCatalog'));
const WebScan = lazy(() => import('./pages/dfir/WebScan'));
const MalwareScan = lazy(() => import('./pages/dfir/MalwareScan'));
const ReverseImage = lazy(() => import('./pages/dfir/ReverseImage'));
const EmlExtractor = lazy(() => import('./pages/dfir/EmlExtractor'));
const ScamWatch = lazy(() => import('./pages/dfir/ScamWatch'));
const CryptoTrace = lazy(() => import('./pages/dfir/CryptoTrace'));
const TechAiNews = lazy(() => import('./pages/dfir/TechAiNews'));
const ThreatFeeds = lazy(() => import('./pages/dfir/ThreatFeeds'));
const OnionWatch = lazy(() => import('./pages/dfir/OnionWatch'));
const TelegramWatch = lazy(() => import('./pages/dfir/TelegramWatch'));
const AwesomeLists = lazy(() => import('./pages/dfir/AwesomeLists'));
const ThreatIntelHome = lazy(() => import('./pages/threatintel/Home'));
const ThreatPulse = lazy(() => import('./pages/threatintel/ThreatPulse'));
const CveList = lazy(() => import('./pages/threatintel/CveList'));
const RansomwareActivityPage = lazy(() => import('./pages/threatintel/RansomwareActivity'));
const CybersecTelegramPage = lazy(() => import('./pages/threatintel/CybersecTelegram'));
const BreachDisclosuresPage = lazy(() => import('./pages/threatintel/BreachDisclosures'));
const RedditFirehosePage = lazy(() => import('./pages/threatintel/RedditFirehose'));
const XFirehosePage = lazy(() => import('./pages/threatintel/XFirehose'));
const FeedStatusPage = lazy(() => import('./pages/threatintel/FeedStatus'));
const MetricsPage = lazy(() => import('./pages/threatintel/Metrics'));
const IocCorrelationPage = lazy(() => import('./pages/threatintel/IocCorrelation'));
const ActorTimelinePage = lazy(() => import('./pages/threatintel/ActorTimeline'));
const VictimReleaksPage = lazy(() => import('./pages/threatintel/VictimReleaks'));
const LiveIocsPage = lazy(() => import('./pages/threatintel/LiveIocs'));
const CyberCrimePage = lazy(() => import('./pages/threatintel/CyberCrime'));

function TechniqueRedirect() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('technique') || params.get('t') || params.get('q') || '';
  const target = id ? `/threatintel/mitre?id=${encodeURIComponent(id)}` : '/threatintel/mitre';
  return <Navigate to={target} replace />;
}

/**
 * Preserves the path slug (when `withSlug`), the query string, and the hash
 * fragment when redirecting an old /dfir/<slug> URL to its new
 * /threatintel/<slug> home. Keeps every existing bookmark working.
 */
function MovedRedirect({ to, withSlug }: { to: string; withSlug?: boolean }) {
  const params = useParams();
  const location = useLocation();
  const tail = withSlug ? `/${params.slug ?? ''}` : '';
  return <Navigate to={`${to}${tail}${location.search}${location.hash}`} replace />;
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

  // /dfir/* and /threatintel/* are stand-alone web apps hosted next to the
  // portfolio. They get their own app-shell chrome and skip the portfolio
  // Header / Footer / background-gradient layer entirely. This is the
  // single most-important "feel" toggle on the site — sub-pages of those
  // two routes should not look like sub-pages of someone's portfolio.
  const appMode: 'dfir' | 'threatintel' | null = location.pathname.startsWith('/dfir')
    ? 'dfir'
    : location.pathname.startsWith('/threatintel')
      ? 'threatintel'
      : null;
  const isAppRoute = appMode !== null;

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

  const routes = (
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
        path="/dfir/full-spectrum"
        element={
          <Suspense fallback={<SectionLoader />}>
            <FullSpectrum />
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
        path="/threatintel/pulse"
        element={
          <Suspense fallback={<SectionLoader />}>
            <ThreatPulse />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/wiki"
        element={
          <Suspense fallback={<SectionLoader />}>
            <Wiki />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/wiki/:slug"
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
        path="/threatintel/actors"
        element={
          <Suspense fallback={<SectionLoader />}>
            <Actors />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/actors/:slug"
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
        path="/threatintel/briefings"
        element={
          <Suspense fallback={<SectionLoader />}>
            <Briefings />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/briefings/:slug"
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
      <Route
        path="/dfir/encoder"
        element={
          <Suspense fallback={<SectionLoader />}>
            <Encoder />
          </Suspense>
        }
      />
      <Route
        path="/dfir/cert-search"
        element={
          <Suspense fallback={<SectionLoader />}>
            <CertSearch />
          </Suspense>
        }
      />
      {/* Legacy route — merged into /threatintel/mitre. Forward the technique param as ?id= */}
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
        path="/threatintel/mitre"
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
        path="/threatintel/darkweb"
        element={
          <Suspense fallback={<SectionLoader />}>
            <DarkWeb />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/ransomware-activity"
        element={
          <Suspense fallback={<SectionLoader />}>
            <RansomwareActivityPage />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/cybersec"
        element={
          <Suspense fallback={<SectionLoader />}>
            <CybersecTelegramPage />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/breach"
        element={
          <Suspense fallback={<SectionLoader />}>
            <BreachDisclosuresPage />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/reddit"
        element={
          <Suspense fallback={<SectionLoader />}>
            <RedditFirehosePage />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/x"
        element={
          <Suspense fallback={<SectionLoader />}>
            <XFirehosePage />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/status"
        element={
          <Suspense fallback={<SectionLoader />}>
            <FeedStatusPage />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/metrics"
        element={
          <Suspense fallback={<SectionLoader />}>
            <MetricsPage />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/correlation"
        element={
          <Suspense fallback={<SectionLoader />}>
            <IocCorrelationPage />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/actor-timeline"
        element={
          <Suspense fallback={<SectionLoader />}>
            <ActorTimelinePage />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/re-leaks"
        element={
          <Suspense fallback={<SectionLoader />}>
            <VictimReleaksPage />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/live-iocs"
        element={
          <Suspense fallback={<SectionLoader />}>
            <LiveIocsPage />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/cyber-crime"
        element={
          <Suspense fallback={<SectionLoader />}>
            <CyberCrimePage />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/writeups"
        element={
          <Suspense fallback={<SectionLoader />}>
            <Writeups />
          </Suspense>
        }
      />
      {/* 2026-05-11: per-type IOC pages (urls/domains/hashs) and the
                standalone malware-samples / phishing-urls pages collapsed
                into /threatintel/live-iocs (unified, time-ordered firehose).
                The /api/v1/{phishing-urls,malware-samples} backends remain
                for the Metrics page; the old page URLs redirect so bookmarks
                still land somewhere useful. */}
      <Route path="/threatintel/urls" element={<Navigate to="/threatintel/live-iocs" replace />} />
      <Route path="/threatintel/domains" element={<Navigate to="/threatintel/live-iocs" replace />} />
      <Route path="/threatintel/hashs" element={<Navigate to="/threatintel/live-iocs" replace />} />
      <Route path="/threatintel/malicious-urls" element={<Navigate to="/threatintel/live-iocs" replace />} />
      <Route path="/threatintel/iocs-by-type" element={<Navigate to="/threatintel/live-iocs" replace />} />
      <Route path="/threatintel/phishing-urls" element={<Navigate to="/threatintel/live-iocs" replace />} />
      <Route path="/threatintel/malware-samples" element={<Navigate to="/threatintel/live-iocs" replace />} />
      <Route
        path="/threatintel/cve-list"
        element={
          <Suspense fallback={<SectionLoader />}>
            <CveList />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/threat-map"
        element={
          <Suspense fallback={<SectionLoader />}>
            <ThreatMap />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/rules"
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
      <Route
        path="/dfir/lolbins"
        element={
          <Suspense fallback={<SectionLoader />}>
            <Lolbins />
          </Suspense>
        }
      />
      <Route
        path="/dfir/rule-playground"
        element={
          <Suspense fallback={<SectionLoader />}>
            <RulePlayground />
          </Suspense>
        }
      />
      <Route
        path="/dfir/email-defense"
        element={
          <Suspense fallback={<SectionLoader />}>
            <EmailDefense />
          </Suspense>
        }
      />
      <Route
        path="/dfir/nhi"
        element={
          <Suspense fallback={<SectionLoader />}>
            <Nhi />
          </Suspense>
        }
      />
      <Route
        path="/dfir/powershell-deobf"
        element={
          <Suspense fallback={<SectionLoader />}>
            <PowershellDeobf />
          </Suspense>
        }
      />
      <Route
        path="/dfir/agent-map"
        element={
          <Suspense fallback={<SectionLoader />}>
            <AgentMap />
          </Suspense>
        }
      />
      <Route
        path="/dfir/tabletop"
        element={
          <Suspense fallback={<SectionLoader />}>
            <Tabletop />
          </Suspense>
        }
      />
      <Route
        path="/dfir/grc"
        element={
          <Suspense fallback={<SectionLoader />}>
            <Grc />
          </Suspense>
        }
      />
      <Route
        path="/dfir/dlp-scan"
        element={
          <Suspense fallback={<SectionLoader />}>
            <DlpScan />
          </Suspense>
        }
      />
      <Route
        path="/dfir/data-classification"
        element={
          <Suspense fallback={<SectionLoader />}>
            <DataClassification />
          </Suspense>
        }
      />
      <Route
        path="/dfir/privacy-hub"
        element={
          <Suspense fallback={<SectionLoader />}>
            <PrivacyHub />
          </Suspense>
        }
      />
      <Route
        path="/dfir/username"
        element={
          <Suspense fallback={<SectionLoader />}>
            <UsernamePivot />
          </Suspense>
        }
      />
      <Route
        path="/dfir/wayback"
        element={
          <Suspense fallback={<SectionLoader />}>
            <Wayback />
          </Suspense>
        }
      />
      <Route
        path="/dfir/ip-geo"
        element={
          <Suspense fallback={<SectionLoader />}>
            <IpGeo />
          </Suspense>
        }
      />
      <Route
        path="/dfir/log-parser"
        element={
          <Suspense fallback={<SectionLoader />}>
            <LogParser />
          </Suspense>
        }
      />
      <Route
        path="/dfir/socmint"
        element={
          <Suspense fallback={<SectionLoader />}>
            <Socmint />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/osint-framework"
        element={
          <Suspense fallback={<SectionLoader />}>
            <OsintFramework />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/secops-tools"
        element={
          <Suspense fallback={<SectionLoader />}>
            <SecopsCatalog />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/cve-resources"
        element={
          <Suspense fallback={<SectionLoader />}>
            <CveResourcesCatalog />
          </Suspense>
        }
      />
      <Route
        path="/dfir/web-scan"
        element={
          <Suspense fallback={<SectionLoader />}>
            <WebScan />
          </Suspense>
        }
      />
      <Route
        path="/dfir/malware-scan"
        element={
          <Suspense fallback={<SectionLoader />}>
            <MalwareScan />
          </Suspense>
        }
      />
      <Route
        path="/dfir/reverse-image"
        element={
          <Suspense fallback={<SectionLoader />}>
            <ReverseImage />
          </Suspense>
        }
      />
      <Route
        path="/dfir/eml"
        element={
          <Suspense fallback={<SectionLoader />}>
            <EmlExtractor />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/scam-watch"
        element={
          <Suspense fallback={<SectionLoader />}>
            <ScamWatch />
          </Suspense>
        }
      />
      <Route
        path="/dfir/crypto-trace"
        element={
          <Suspense fallback={<SectionLoader />}>
            <CryptoTrace />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/tech-ai-news"
        element={
          <Suspense fallback={<SectionLoader />}>
            <TechAiNews />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/threat-feeds"
        element={
          <Suspense fallback={<SectionLoader />}>
            <ThreatFeeds />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/onion-watch"
        element={
          <Suspense fallback={<SectionLoader />}>
            <OnionWatch />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/telegram-watch"
        element={
          <Suspense fallback={<SectionLoader />}>
            <TelegramWatch />
          </Suspense>
        }
      />
      <Route
        path="/threatintel/awesome-lists"
        element={
          <Suspense fallback={<SectionLoader />}>
            <AwesomeLists />
          </Suspense>
        }
      />
      <Route
        path="/threatintel"
        element={
          <Suspense fallback={<SectionLoader />}>
            <ThreatIntelHome />
          </Suspense>
        }
      />
      {/* Ransom Note Library was removed 2026-05-11; mythreatintel.com is now
                an external-source link only on the /threatintel landing. Old bookmarks
                land on the External Sources block via the threatintel landing. */}
      <Route path="/threatintel/ransom-library" element={<Navigate to="/threatintel" replace />} />
      {/* Discord Watch was removed 2026-05-11; redirect bookmarks to Awesome Lists. */}
      <Route path="/dfir/discord-watch" element={<Navigate to="/threatintel/awesome-lists" replace />} />
      {/* Old path renamed; preserve any in-flight links. */}
      <Route path="/dfir/industry-news" element={<Navigate to="/threatintel/tech-ai-news" replace />} />
      <Route path="/difr" element={<Navigate to="/dfir" replace />} />
      {/* 2026-05-11 — intel pages moved from /dfir/<slug> to /threatintel/<slug>.
                Old URLs redirect (preserving query + hash) so bookmarks keep working. */}
      <Route path="/dfir/briefings" element={<MovedRedirect to="/threatintel/briefings" />} />
      <Route path="/dfir/briefings/:slug" element={<MovedRedirect to="/threatintel/briefings" withSlug />} />
      <Route path="/dfir/darkweb" element={<MovedRedirect to="/threatintel/darkweb" />} />
      <Route path="/dfir/onion-watch" element={<MovedRedirect to="/threatintel/onion-watch" />} />
      <Route path="/dfir/telegram-watch" element={<MovedRedirect to="/threatintel/telegram-watch" />} />
      <Route path="/dfir/scam-watch" element={<MovedRedirect to="/threatintel/scam-watch" />} />
      <Route path="/dfir/tech-ai-news" element={<MovedRedirect to="/threatintel/tech-ai-news" />} />
      <Route path="/dfir/threat-feeds" element={<MovedRedirect to="/threatintel/threat-feeds" />} />
      <Route path="/dfir/threat-map" element={<MovedRedirect to="/threatintel/threat-map" />} />
      <Route path="/dfir/actors" element={<MovedRedirect to="/threatintel/actors" />} />
      <Route path="/dfir/actors/:slug" element={<MovedRedirect to="/threatintel/actors" withSlug />} />
      <Route path="/dfir/mitre" element={<MovedRedirect to="/threatintel/mitre" />} />
      <Route path="/dfir/rules" element={<MovedRedirect to="/threatintel/rules" />} />
      <Route path="/dfir/cve-resources" element={<MovedRedirect to="/threatintel/cve-resources" />} />
      <Route path="/dfir/wiki" element={<MovedRedirect to="/threatintel/wiki" />} />
      <Route path="/dfir/wiki/:slug" element={<MovedRedirect to="/threatintel/wiki" withSlug />} />
      <Route path="/dfir/secops-tools" element={<MovedRedirect to="/threatintel/secops-tools" />} />
      <Route path="/dfir/awesome-lists" element={<MovedRedirect to="/threatintel/awesome-lists" />} />
      <Route path="/dfir/osint-framework" element={<MovedRedirect to="/threatintel/osint-framework" />} />
      <Route
        path="*"
        element={
          <Suspense fallback={<SectionLoader />}>
            <NotFound />
          </Suspense>
        }
      />
    </Routes>
  );

  // ─── App-route render path (DFIR + ThreatIntel as stand-alone apps) ───
  // Keeps the same body bg + gradient overlay + noise texture as the
  // portfolio so the dark theme matches; swaps Header/Footer for AppShell.
  if (isAppRoute && appMode) {
    return (
      <>
        <StructuredData />
        <SkipToContent />
        <BackgroundLayer isDark={isDark} />
        <CommandPalette />
        <AppShell mode={appMode} isDark={isDark} onToggleTheme={toggleTheme}>
          {routes}
        </AppShell>
        <div id="aria-live-region" aria-live="polite" aria-atomic="true" className="sr-only" />
      </>
    );
  }

  // ─── Portfolio render path ────────────────────────────────────────────
  return (
    <>
      <StructuredData />
      <SkipToContent />
      <BackgroundLayer isDark={isDark} />

      <ScrollProgress progress={progress} />
      <Header isDark={isDark} onToggleTheme={toggleTheme} />
      <CommandPalette />

      <main id="main-content" tabIndex={-1}>
        <Layout>{routes}</Layout>
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
