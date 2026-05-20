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
import { ErrorBoundary } from './components/ErrorBoundary';

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
const ActorKb = lazy(() => import('./pages/threatintel/ActorKb'));
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
const AtlasMatrix = lazy(() => import('./pages/dfir/AtlasMatrix'));
const UrlPreview = lazy(() => import('./pages/dfir/UrlPreview'));
const IocExtractor = lazy(() => import('./pages/dfir/IocExtractor'));
const IocPivot = lazy(() => import('./pages/dfir/IocPivot'));
const JwtInspect = lazy(() => import('./pages/dfir/JwtInspect'));
const IamPolicyAnalyzer = lazy(() => import('./pages/dfir/IamPolicyAnalyzer'));
const SecurityGroupAnalyzer = lazy(() => import('./pages/dfir/SecurityGroupAnalyzer'));
const CloudTrailTriage = lazy(() => import('./pages/dfir/CloudTrailTriage'));
const K8sRbacAnalyzer = lazy(() => import('./pages/dfir/K8sRbacAnalyzer'));
const CvePrioritizer = lazy(() => import('./pages/dfir/CvePrioritizer'));
const RuleConverter = lazy(() => import('./pages/dfir/RuleConverter'));
const LinuxTriage = lazy(() => import('./pages/dfir/LinuxTriage'));
const TerraformScanner = lazy(() => import('./pages/dfir/TerraformScanner'));
const GcpIamAnalyzer = lazy(() => import('./pages/dfir/GcpIamAnalyzer'));
const AzureRbacAnalyzer = lazy(() => import('./pages/dfir/AzureRbacAnalyzer'));
const OpenApiAuditor = lazy(() => import('./pages/dfir/OpenApiAuditor'));
const SecHeadersAnalyzer = lazy(() => import('./pages/dfir/SecHeadersAnalyzer'));
const SecretScanner = lazy(() => import('./pages/dfir/SecretScanner'));
const GraphqlAuditor = lazy(() => import('./pages/dfir/GraphqlAuditor'));
const OsvScanner = lazy(() => import('./pages/dfir/OsvScanner'));
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
const YaraManager = lazy(() => import('./pages/dfir/YaraManager'));
const DetectionLab = lazy(() => import('./pages/dfir/DetectionLab'));
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
const ToolsCategory = lazy(() => import('./pages/dfir/ToolsCategory'));
const ToolsAbout = lazy(() => import('./pages/dfir/ToolsAbout'));
const TimestampConverter = lazy(() => import('./pages/dfir/TimestampConverter'));
const HashCalculator = lazy(() => import('./pages/dfir/HashCalculator'));
const DorkBuilder = lazy(() => import('./pages/dfir/DorkBuilder'));
const BrandImpersonation = lazy(() => import('./pages/dfir/BrandImpersonation'));
const ImageFingerprint = lazy(() => import('./pages/dfir/ImageFingerprint'));
const PlistProtobuf = lazy(() => import('./pages/dfir/PlistProtobuf'));
const PcapTriage = lazy(() => import('./pages/dfir/PcapTriage'));
const RegistryHive = lazy(() => import('./pages/dfir/RegistryHive'));
const EvtxParser = lazy(() => import('./pages/dfir/EvtxParser'));
const SqliteExplorer = lazy(() => import('./pages/dfir/SqliteExplorer'));
const IosBackupExplorer = lazy(() => import('./pages/dfir/IosBackupExplorer'));
const ScreenshotIntel = lazy(() => import('./pages/dfir/ScreenshotIntel'));
const PeAnalyzer = lazy(() => import('./pages/dfir/PeAnalyzer'));
const WebLogAnalyzer = lazy(() => import('./pages/dfir/WebLogAnalyzer'));
const PrefetchAnalyzer = lazy(() => import('./pages/dfir/PrefetchAnalyzer'));
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
const ExternalResources = lazy(() => import('./pages/threatintel/ExternalResources'));
const ThreatIntelHome = lazy(() => import('./pages/threatintel/Home'));
const ThreatIntelAbout = lazy(() => import('./pages/threatintel/About'));
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
const DetectionsPage = lazy(() => import('./pages/threatintel/Detections'));
const MyThreatIntelPage = lazy(() => import('./pages/threatintel/MyThreatIntel'));
const CyberCrimePage = lazy(() => import('./pages/threatintel/CyberCrime'));
const C2TrackerPage = lazy(() => import('./pages/threatintel/C2Tracker'));
const Blog = lazy(() => import('./pages/Blog'));
const BlogPost = lazy(() => import('./pages/BlogPost'));
const AdminApp = lazy(() => import('./pages/admin/AdminApp'));
const DeepDarkCTI = lazy(() => import('./pages/threatintel/DeepDarkCTI'));
const RansomwareLive = lazy(() => import('./pages/threatintel/RansomwareLive'));
const Infostealer = lazy(() => import('./pages/threatintel/Infostealer'));
const Negotiations = lazy(() => import('./pages/threatintel/Negotiations'));
const BreachForums = lazy(() => import('./pages/threatintel/BreachForums'));
const UrlReputation = lazy(() => import('./pages/dfir/UrlReputation'));
const DomainReputation = lazy(() => import('./pages/dfir/DomainReputation'));
const ApkAnalyzer = lazy(() => import('./pages/dfir/ApkAnalyzer'));
const EmailReputation = lazy(() => import('./pages/dfir/EmailReputation'));
const DomainMonitor = lazy(() => import('./pages/threatintel/DomainMonitor'));
const DmarcAnalyzer = lazy(() => import('./pages/dfir/DmarcAnalyzer'));

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
  }, [location.hash]);

  const routes = (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/about"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <About />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/skills"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Skills />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/experience"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Experience />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/projects"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Projects />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/blog"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Blog />
            </Suspense>
          </ErrorBoundary>
        }
      />
      {/* Category landing — /blog/c/:type. Same component as /blog; the
          page picks up the type from useParams and renders in category
          mode (different H1 + intro, type filter locked). */}
      <Route
        path="/blog/c/:type"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Blog />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/blog/:slug"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <BlogPost />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <DFIR />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/ioc-check"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <IocCheck />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/phishing"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Phishing />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/domain"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Domain />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/domain-rep"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <DomainReputation />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/full-spectrum"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <FullSpectrum />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/exposure"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Exposure />
            </Suspense>
          </ErrorBoundary>
        }
      />
      {/* Hash Analyzer was merged into the IOC Checker, which already handles hashes. */}
      <Route path="/dfir/file" element={<Navigate to="/dfir/ioc-check" replace />} />
      <Route
        path="/threatintel/pulse"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <ThreatPulse />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/wiki"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Wiki />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/wiki/:slug"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <WikiArticle />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/dashboard"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Dashboard />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/actor-kb"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <ActorKb />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/actors"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Actors />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/actors/:slug"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <ActorDetail />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/privacy"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Privacy />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/briefings"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Briefings />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/briefings/:slug"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <BriefingDetail />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/cve"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Cve />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/decode"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Decode />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/encoder"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Encoder />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/cert-search"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <CertSearch />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/atlas"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <AtlasMatrix />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/atlas"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <AtlasMatrix />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/asn"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <AsnLookup />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/breach"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Breach />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/exif"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <ExifParse />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/mitre"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <MitreMatrix />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/url-preview"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <UrlPreview />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/extract"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <IocExtractor />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/ioc-pivot"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <IocPivot />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/jwt"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <JwtInspect />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/iam-analyzer"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <IamPolicyAnalyzer />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/sg-analyzer"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <SecurityGroupAnalyzer />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/cloudtrail-triage"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <CloudTrailTriage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/k8s-rbac"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <K8sRbacAnalyzer />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/cve-prioritizer"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <CvePrioritizer />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route path="/dfir/sigma-convert" element={<Navigate to="/dfir/rule-converter" replace />} />
      <Route
        path="/dfir/rule-converter"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <RuleConverter />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/linux-triage"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <LinuxTriage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/terraform-scan"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <TerraformScanner />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/gcp-iam"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <GcpIamAnalyzer />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/azure-rbac"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <AzureRbacAnalyzer />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/openapi-audit"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <OpenApiAuditor />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/sec-headers"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <SecHeadersAnalyzer />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/secret-scan"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <SecretScanner />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/graphql-audit"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <GraphqlAuditor />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/osv-scan"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <OsvScanner />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/punycode"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Punycode />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/takeover"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Takeover />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/stix"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <StixViewer />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/darkweb"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <DarkWeb />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/ransomware-activity"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <RansomwareActivityPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/mythreatintel"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <MyThreatIntelPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/cybersec"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <CybersecTelegramPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/breach"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <BreachDisclosuresPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/reddit"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <RedditFirehosePage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/x"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <XFirehosePage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/status"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <FeedStatusPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/metrics"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <MetricsPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/correlation"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <IocCorrelationPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/actor-timeline"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <ActorTimelinePage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/re-leaks"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <VictimReleaksPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/live-iocs"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <LiveIocsPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/detections"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <DetectionsPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/cyber-crime"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <CyberCrimePage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/c2-tracker"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <C2TrackerPage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/writeups"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Writeups />
            </Suspense>
          </ErrorBoundary>
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
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <CveList />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/threat-map"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <ThreatMap />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/rules"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Rules />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/deepdarkcti"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <DeepDarkCTI />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/ransomware-live"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <RansomwareLive />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/infostealer"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Infostealer />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/negotiations"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Negotiations />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/breach-forums"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <BreachForums />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/owasp"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Owasp />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/prompt-injection"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <PromptInjection />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/mcp-audit"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <McpAudit />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/kill-chain"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <KillChain />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/diamond"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Diamond />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/lolbins"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Lolbins />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/rule-playground"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <RulePlayground />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/yara"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <YaraManager />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/detection-lab"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <DetectionLab />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/email-defense"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <EmailDefense />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/dmarc-analyzer"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <DmarcAnalyzer />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/nhi"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Nhi />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/powershell-deobf"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <PowershellDeobf />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/agent-map"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <AgentMap />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/tabletop"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Tabletop />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/grc"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Grc />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/dlp-scan"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <DlpScan />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/data-classification"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <DataClassification />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/privacy-hub"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <PrivacyHub />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/username"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <UsernamePivot />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/wayback"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Wayback />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/ip-geo"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <IpGeo />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/log-parser"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <LogParser />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/socmint"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <Socmint />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/osint-framework"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <OsintFramework />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/secops-tools"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <SecopsCatalog />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/tools/about"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <ToolsAbout />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/tools/:group"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <ToolsCategory />
            </Suspense>
          </ErrorBoundary>
        }
      />
      {(
        [
          ['/dfir/timestamp', <TimestampConverter key="ts" />],
          ['/dfir/hash-calc', <HashCalculator key="hc" />],
          ['/dfir/dork-builder', <DorkBuilder key="db" />],
          ['/dfir/brand-impersonation', <BrandImpersonation key="bi" />],
          ['/dfir/image-fingerprint', <ImageFingerprint key="if" />],
          ['/dfir/plist-protobuf', <PlistProtobuf key="pp" />],
          ['/dfir/pcap-triage', <PcapTriage key="pc" />],
          ['/dfir/registry-hive', <RegistryHive key="rh" />],
          ['/dfir/evtx', <EvtxParser key="ev" />],
          ['/dfir/sqlite', <SqliteExplorer key="sq" />],
          ['/dfir/ios-backup', <IosBackupExplorer key="ib" />],
          ['/dfir/screenshot-intel', <ScreenshotIntel key="si" />],
          ['/dfir/mobile-sqlite', <SqliteExplorer key="ms" />],
          ['/dfir/apk-analyzer', <ApkAnalyzer key="apk" />],
          ['/dfir/pe', <PeAnalyzer key="pe" />],
          ['/dfir/web-log', <WebLogAnalyzer key="wl" />],
          ['/dfir/prefetch', <PrefetchAnalyzer key="pf" />],
        ] as Array<[string, JSX.Element]>
      ).map(([p, el]) => (
        <Route
          key={p}
          path={p}
          element={
            <ErrorBoundary>
              <Suspense fallback={<SectionLoader />}>{el}</Suspense>
            </ErrorBoundary>
          }
        />
      ))}
      <Route
        path="/threatintel/cve-resources"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <CveResourcesCatalog />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/web-scan"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <WebScan />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/malware-scan"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <MalwareScan />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/reverse-image"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <ReverseImage />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/eml"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <EmlExtractor />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/url-rep"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <UrlReputation />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/email-rep"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <EmailReputation />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/domain-monitor"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <DomainMonitor />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/scam-watch"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <ScamWatch />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/dfir/crypto-trace"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <CryptoTrace />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/tech-ai-news"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <TechAiNews />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/threat-feeds"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <ThreatFeeds />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/onion-watch"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <OnionWatch />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/telegram-watch"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <TelegramWatch />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/awesome-lists"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <AwesomeLists />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/external-resources"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <ExternalResources />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/about"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <ThreatIntelAbout />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel/c/:cat"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <ThreatIntelHome />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="/threatintel"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <ThreatIntelHome />
            </Suspense>
          </ErrorBoundary>
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
        path="/admin"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <AdminApp />
            </Suspense>
          </ErrorBoundary>
        }
      />
      <Route
        path="*"
        element={
          <ErrorBoundary>
            <Suspense fallback={<SectionLoader />}>
              <NotFound />
            </Suspense>
          </ErrorBoundary>
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
