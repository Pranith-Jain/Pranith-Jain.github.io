import { useEffect, Suspense, lazy, useMemo } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useParams, Navigate, useSearchParams } from 'react-router-dom';
import { useTheme, useScrollProgress } from './hooks';
import { navLinks, personalInfo, stats } from './data/content';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { SkipToContent } from './components/SkipToContent';
import { StructuredData } from './components/StructuredData';
import { ScrollProgress, BackToTop } from './components/ui';
import { Layout } from './components/Layout';
import { AppShell } from './components/AppShell';
import { BackgroundLayer } from './components/BackgroundLayer';
import { LazyRoute } from './components/LazyRoute';

const CommandPalette = lazy(() =>
  import('./components/dfir/CommandPalette').then((m) => ({ default: m.CommandPalette }))
);

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
const CaseStudy = lazy(() => import('./pages/CaseStudy'));
const Writeups = lazy(() => import('./pages/threatintel/Writeups'));
const ResearchSignal = lazy(() => import('./pages/threatintel/Signal'));
const ResearchIndex = lazy(() => import('./pages/threatintel/Research'));
const ResearchPostPage = lazy(() => import('./pages/threatintel/ResearchPost'));
const DFIR = lazy(() => import('./pages/DFIR'));

const IocCheck = lazy(() => import('./pages/dfir/IocCheck'));
const Phishing = lazy(() => import('./pages/dfir/Phishing'));
const Domain = lazy(() => import('./pages/dfir/Domain'));
const FullSpectrum = lazy(() => import('./pages/dfir/FullSpectrum'));
const Exposure = lazy(() => import('./pages/dfir/Exposure'));
const AssetIntel = lazy(() => import('./pages/dfir/AssetIntel'));
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
const GoogleDorks = lazy(() => import('./pages/dfir/GoogleDorks'));
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
const StixBuilder = lazy(() => import('./pages/dfir/StixBuilder'));
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
const ReportParser = lazy(() => import('./pages/dfir/ReportParser'));
const IocLifecycle = lazy(() => import('./pages/dfir/IocLifecycle'));
const CtMonitor = lazy(() => import('./pages/dfir/CtMonitor'));
const StealerParser = lazy(() => import('./pages/dfir/StealerParser'));
const TaxiiServer = lazy(() => import('./pages/dfir/TaxiiServer'));
const BloomFilter = lazy(() => import('./pages/dfir/BloomFilter'));
const AiRuleGenerator = lazy(() => import('./pages/dfir/AiRuleGenerator'));
const ThreatGraph = lazy(() => import('./pages/dfir/ThreatGraph'));
const AttackChain = lazy(() => import('./pages/dfir/AttackChain'));
const ActorDNA = lazy(() => import('./pages/threatintel/ActorDNA'));
const PredictiveIntel = lazy(() => import('./pages/threatintel/PredictiveIntel'));
const InsiderThreatMatrix = lazy(() => import('./pages/threatintel/InsiderThreatMatrix'));
const CampaignLifecycle = lazy(() => import('./pages/threatintel/CampaignLifecycle'));
const AttributionFramework = lazy(() => import('./pages/threatintel/AttributionFramework'));
const CrossCampaignCorrelation = lazy(() => import('./pages/threatintel/CrossCampaignCorrelation'));
const HuntingQueryGenerator = lazy(() => import('./pages/dfir/HuntingQueryGenerator'));
const SandboxIntegration = lazy(() => import('./pages/dfir/SandboxIntegration'));
const IrPlaybooks = lazy(() => import('./pages/dfir/IrPlaybooks'));
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
const Blocklists = lazy(() => import('./pages/dfir/Blocklists'));
const IdentityLookup = lazy(() => import('./pages/dfir/IdentityLookup'));

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
const DarkWebOsintTools = lazy(() => import('./pages/threatintel/DarkWebOsintTools'));
const ThreatIntelHome = lazy(() => import('./pages/threatintel/Home'));
const ThreatIntelAbout = lazy(() => import('./pages/threatintel/About'));
const ThreatPulse = lazy(() => import('./pages/threatintel/ThreatPulse'));
const CveList = lazy(() => import('./pages/threatintel/CveList'));
const RansomwareActivityPage = lazy(() => import('./pages/threatintel/RansomwareActivity'));
const RansomwareGeoMap = lazy(() => import('./pages/threatintel/RansomwareMap'));
const CertStreamLive = lazy(() => import('./pages/threatintel/CertStreamLive'));
const CampaignGenerator = lazy(() => import('./pages/threatintel/CampaignGenerator'));
const Campaigns = lazy(() => import('./pages/threatintel/Campaigns'));
const CampaignDetail = lazy(() => import('./pages/threatintel/CampaignDetail'));
const MaliciousPackages = lazy(() => import('./pages/threatintel/MaliciousPackages'));
const XWatch = lazy(() => import('./pages/threatintel/XWatch'));
const XLive = lazy(() => import('./pages/threatintel/XLive'));
const CybersecTelegramPage = lazy(() => import('./pages/threatintel/CybersecTelegram'));
const TelegramLeaksPage = lazy(() => import('./pages/threatintel/TelegramLeaks'));
const TelegramDiscoveredChannelsPage = lazy(() => import('./pages/threatintel/TelegramDiscoveredChannels'));
const TelegramLeakStatsPage = lazy(() => import('./pages/threatintel/TelegramLeakStats'));
const IntelDashboardPage = lazy(() => import('./pages/threatintel/IntelDashboard'));
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
const TelegramSettings = lazy(() => import('./pages/threatintel/TelegramSettings'));
const Negotiations = lazy(() => import('./pages/threatintel/Negotiations'));
const BreachForums = lazy(() => import('./pages/threatintel/BreachForums'));
const UrlReputation = lazy(() => import('./pages/dfir/UrlReputation'));
const DomainReputation = lazy(() => import('./pages/dfir/DomainReputation'));
const WhoisHistory = lazy(() => import('./pages/dfir/WhoisHistory'));
const OpenDirectory = lazy(() => import('./pages/dfir/OpenDirectory'));
const ApkAnalyzer = lazy(() => import('./pages/dfir/ApkAnalyzer'));
const PgpTool = lazy(() => import('./pages/dfir/PgpTool'));
const TorGateway = lazy(() => import('./pages/dfir/TorGateway'));
const EmailReputation = lazy(() => import('./pages/dfir/EmailReputation'));
const DomainMonitor = lazy(() => import('./pages/threatintel/DomainMonitor'));
const WatchesPage = lazy(() => import('./pages/threatintel/Watches'));
const CopilotPage = lazy(() => import('./pages/threatintel/Copilot'));
// (removed LiveFeedsPage and MyDashboardPage)
const MaltrailTrails = lazy(() => import('./pages/threatintel/MaltrailTrails'));
const MalpediaPage = lazy(() => import('./pages/threatintel/MalpediaPage'));
const InfostealerDetail = lazy(() => import('./pages/threatintel/InfostealerDetail'));
const FeedSources = lazy(() => import('./pages/threatintel/FeedSources'));
const SettingsPage = lazy(() => import('./pages/threatintel/Settings'));
const DmarcAnalyzer = lazy(() => import('./pages/dfir/DmarcAnalyzer'));
const MispBrowser = lazy(() => import('./pages/threatintel/MispBrowser'));
const UnifiedSearch = lazy(() => import('./pages/threatintel/UnifiedSearch'));
const IocEnrichment = lazy(() => import('./pages/threatintel/IocEnrichment'));
const RelationshipGraph = lazy(() => import('./pages/threatintel/RelationshipGraph'));
const ThreatHunt = lazy(() => import('./pages/dfir/ThreatHunt'));
const SourceReliability = lazy(() => import('./pages/threatintel/SourceReliability'));
const CollectionSlo = lazy(() => import('./pages/threatintel/CollectionSlo'));
const PirDashboard = lazy(() => import('./pages/threatintel/PirDashboard'));
const ACH = lazy(() => import('./pages/threatintel/ACH'));
const CrossCorrelate = lazy(() => import('./pages/threatintel/CrossCorrelate'));
const Assessments = lazy(() => import('./pages/threatintel/Assessments'));
const AssessmentDetail = lazy(() => import('./pages/threatintel/AssessmentDetail'));
const EntityResolution = lazy(() => import('./pages/threatintel/EntityResolution'));
const AggregatedFeeds = lazy(() => import('./pages/threatintel/AggregatedFeeds'));
const MalwareIocs = lazy(() => import('./pages/threatintel/MalwareIocs'));
const FeedCatalog = lazy(() => import('./pages/threatintel/FeedCatalog'));
const Analyze = lazy(() => import('./pages/threatintel/Analyze'));
const Yarahub = lazy(() => import('./pages/threatintel/Yarahub'));
const Investigations = lazy(() => import('./pages/threatintel/Investigations'));
const FeedScheduler = lazy(() => import('./pages/threatintel/FeedScheduler'));
const ObservableDb = lazy(() => import('./pages/threatintel/ObservableDb'));
const MalwareVault = lazy(() => import('./pages/threatintel/MalwareVault'));

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

/**
 * /dfir/file?h=<hash> is the legacy entry point for the standalone hash
 * analyser. The page was merged into the IOC checker; this redirect rewrites
 * `?h=<hash>` to `?indicator=<hash>` so legacy bookmarks auto-populate the
 * input rather than landing on a blank form.
 */
function DfirFileRedirect() {
  const [params] = useSearchParams();
  const hash = params.get('h');
  const target = hash ? `/dfir/ioc-check?indicator=${encodeURIComponent(hash)}` : '/dfir/ioc-check';
  return <Navigate to={target} replace />;
}

export function AppContent() {
  const { isDark, toggleTheme } = useTheme();
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
  }, [location.pathname, location.hash]);

  const routes = useMemo(
    () => (
      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/about"
          element={
            <LazyRoute>
              <About />
            </LazyRoute>
          }
        />
        <Route
          path="/skills"
          element={
            <LazyRoute>
              <Skills />
            </LazyRoute>
          }
        />
        <Route
          path="/experience"
          element={
            <LazyRoute>
              <Experience />
            </LazyRoute>
          }
        />
        <Route
          path="/projects"
          element={
            <LazyRoute>
              <Projects />
            </LazyRoute>
          }
        />
        <Route
          path="/projects/:slug"
          element={
            <LazyRoute>
              <CaseStudy />
            </LazyRoute>
          }
        />
        <Route
          path="/copilot"
          element={
            <LazyRoute>
              <CopilotPage />
            </LazyRoute>
          }
        />
        <Route
          path="/blog"
          element={
            <LazyRoute>
              <Blog />
            </LazyRoute>
          }
        />
        <Route
          path="/blog/c/:type"
          element={
            <LazyRoute>
              <Blog />
            </LazyRoute>
          }
        />
        <Route
          path="/blog/:slug"
          element={
            <LazyRoute>
              <BlogPost />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir"
          element={
            <LazyRoute>
              <DFIR />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/ioc-check"
          element={
            <LazyRoute>
              <IocCheck />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/phishing"
          element={
            <LazyRoute>
              <Phishing />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/threat-hunt"
          element={
            <LazyRoute>
              <ThreatHunt />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/domain"
          element={
            <LazyRoute>
              <Domain />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/domain-rep"
          element={
            <LazyRoute>
              <DomainReputation />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/whois-history"
          element={
            <LazyRoute>
              <WhoisHistory />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/open-directory"
          element={
            <LazyRoute>
              <OpenDirectory />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/full-spectrum"
          element={
            <LazyRoute>
              <FullSpectrum />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/exposure"
          element={
            <LazyRoute>
              <Exposure />
            </LazyRoute>
          }
        />
        <Route path="/dfir/host" element={<Navigate to="/dfir/asset-intel" replace />} />
        <Route
          path="/dfir/asset-intel"
          element={
            <LazyRoute>
              <AssetIntel />
            </LazyRoute>
          }
        />
        <Route path="/dfir/file" element={<DfirFileRedirect />} />
        <Route
          path="/threatintel/pulse"
          element={
            <LazyRoute>
              <ThreatPulse />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/wiki"
          element={
            <LazyRoute>
              <Wiki />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/wiki/:slug"
          element={
            <LazyRoute>
              <WikiArticle />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/dashboard"
          element={
            <LazyRoute>
              <Dashboard />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/actor-kb"
          element={
            <LazyRoute>
              <ActorKb />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/actor-dna"
          element={
            <LazyRoute>
              <ActorDNA />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/predictive"
          element={
            <LazyRoute>
              <PredictiveIntel />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/insider-threat-matrix"
          element={
            <LazyRoute>
              <InsiderThreatMatrix />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/campaign-lifecycle"
          element={
            <LazyRoute>
              <CampaignLifecycle />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/attribution"
          element={
            <LazyRoute>
              <AttributionFramework />
            </LazyRoute>
          }
        />
        <Route path="/threatintel/intelligence-gaps" element={<Navigate to="/threatintel/status" replace />} />
        <Route
          path="/threatintel/cross-campaign"
          element={
            <LazyRoute>
              <CrossCampaignCorrelation />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/actors"
          element={
            <LazyRoute>
              <Actors />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/actors/:slug"
          element={
            <LazyRoute>
              <ActorDetail />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/privacy"
          element={
            <LazyRoute>
              <Privacy />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/briefings"
          element={
            <LazyRoute>
              <Briefings />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/briefings/:slug"
          element={
            <LazyRoute>
              <BriefingDetail />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/cve"
          element={
            <LazyRoute>
              <Cve />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/decode"
          element={
            <LazyRoute>
              <Decode />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/encoder"
          element={
            <LazyRoute>
              <Encoder />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/cert-search"
          element={
            <LazyRoute>
              <CertSearch />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/atlas"
          element={
            <LazyRoute>
              <AtlasMatrix />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/atlas"
          element={
            <LazyRoute>
              <AtlasMatrix />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/asn"
          element={
            <LazyRoute>
              <AsnLookup />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/breach"
          element={
            <LazyRoute>
              <Breach />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/exif"
          element={
            <LazyRoute>
              <ExifParse />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/mitre"
          element={
            <LazyRoute>
              <MitreMatrix />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/url-preview"
          element={
            <LazyRoute>
              <UrlPreview />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/extract"
          element={
            <LazyRoute>
              <IocExtractor />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/ioc-pivot"
          element={
            <LazyRoute>
              <IocPivot />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/jwt"
          element={
            <LazyRoute>
              <JwtInspect />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/google-dorks"
          element={
            <LazyRoute>
              <GoogleDorks />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/iam-analyzer"
          element={
            <LazyRoute>
              <IamPolicyAnalyzer />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/sg-analyzer"
          element={
            <LazyRoute>
              <SecurityGroupAnalyzer />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/cloudtrail-triage"
          element={
            <LazyRoute>
              <CloudTrailTriage />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/k8s-rbac"
          element={
            <LazyRoute>
              <K8sRbacAnalyzer />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/cve-prioritizer"
          element={
            <LazyRoute>
              <CvePrioritizer />
            </LazyRoute>
          }
        />
        <Route path="/dfir/sigma-convert" element={<Navigate to="/dfir/rule-converter" replace />} />
        <Route
          path="/dfir/rule-converter"
          element={
            <LazyRoute>
              <RuleConverter />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/linux-triage"
          element={
            <LazyRoute>
              <LinuxTriage />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/terraform-scan"
          element={
            <LazyRoute>
              <TerraformScanner />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/gcp-iam"
          element={
            <LazyRoute>
              <GcpIamAnalyzer />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/azure-rbac"
          element={
            <LazyRoute>
              <AzureRbacAnalyzer />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/openapi-audit"
          element={
            <LazyRoute>
              <OpenApiAuditor />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/sec-headers"
          element={
            <LazyRoute>
              <SecHeadersAnalyzer />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/secret-scan"
          element={
            <LazyRoute>
              <SecretScanner />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/graphql-audit"
          element={
            <LazyRoute>
              <GraphqlAuditor />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/osv-scan"
          element={
            <LazyRoute>
              <OsvScanner />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/punycode"
          element={
            <LazyRoute>
              <Punycode />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/takeover"
          element={
            <LazyRoute>
              <Takeover />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/stix"
          element={
            <LazyRoute>
              <StixViewer />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/stix-builder"
          element={
            <LazyRoute>
              <StixBuilder />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/stix-builder/b/:bundleId"
          element={
            <LazyRoute>
              <StixBuilder />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/darkweb"
          element={
            <LazyRoute>
              <DarkWeb />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/ransomware-activity"
          element={
            <LazyRoute>
              <RansomwareActivityPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/ransomware-map"
          element={
            <LazyRoute>
              <RansomwareGeoMap />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/certstream"
          element={
            <LazyRoute>
              <CertStreamLive />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/campaign-generator"
          element={
            <LazyRoute>
              <CampaignGenerator />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/campaigns"
          element={
            <LazyRoute>
              <Campaigns />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/campaigns/:id"
          element={
            <LazyRoute>
              <CampaignDetail />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/malicious-packages"
          element={
            <LazyRoute>
              <MaliciousPackages />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/x-watch"
          element={
            <LazyRoute>
              <XWatch />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/x-live"
          element={
            <LazyRoute>
              <XLive />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/mythreatintel"
          element={
            <LazyRoute>
              <MyThreatIntelPage />
            </LazyRoute>
          }
        />
        <Route path="/threatintel/mti" element={<Navigate to="/threatintel/mythreatintel" replace />} />
        <Route
          path="/threatintel/cybersec"
          element={
            <LazyRoute>
              <CybersecTelegramPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/telegram-leaks"
          element={
            <LazyRoute>
              <TelegramLeaksPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/telegram-leaks/stats"
          element={
            <LazyRoute>
              <TelegramLeakStatsPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/intel-dashboard"
          element={
            <LazyRoute>
              <IntelDashboardPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/source-reliability"
          element={
            <LazyRoute>
              <SourceReliability />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/collection-slo"
          element={
            <LazyRoute>
              <CollectionSlo />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/pir-dashboard"
          element={
            <LazyRoute>
              <PirDashboard />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/telegram-leaks/channels"
          element={
            <LazyRoute>
              <TelegramDiscoveredChannelsPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/breach"
          element={
            <LazyRoute>
              <BreachDisclosuresPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/reddit"
          element={
            <LazyRoute>
              <RedditFirehosePage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/x"
          element={
            <LazyRoute>
              <XFirehosePage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/status"
          element={
            <LazyRoute>
              <FeedStatusPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/metrics"
          element={
            <LazyRoute>
              <MetricsPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/correlation"
          element={
            <LazyRoute>
              <IocCorrelationPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/actor-timeline"
          element={
            <LazyRoute>
              <ActorTimelinePage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/re-leaks"
          element={
            <LazyRoute>
              <VictimReleaksPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/live-iocs"
          element={
            <LazyRoute>
              <LiveIocsPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/detections"
          element={
            <LazyRoute>
              <DetectionsPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/cyber-crime"
          element={
            <LazyRoute>
              <CyberCrimePage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/c2-tracker"
          element={
            <LazyRoute>
              <C2TrackerPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/writeups"
          element={
            <LazyRoute>
              <Writeups />
            </LazyRoute>
          }
        />
        {/* High-signal subset of /writeups — elite vendor labs +
          independent research only. Reuses the same /api/v1/writeups
          endpoint with `?tier=signal`. */}
        <Route
          path="/threatintel/signal"
          element={
            <LazyRoute>
              <ResearchSignal />
            </LazyRoute>
          }
        />
        {/* Original Pranith-authored threat-intel research. /research is the
          index, /research/<slug> is the read page. Lives separately from
          /signal and /writeups (both aggregate third-party content) so
          authored work has its own surface. */}
        <Route
          path="/threatintel/research"
          element={
            <LazyRoute>
              <ResearchIndex />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/research/:slug"
          element={
            <LazyRoute>
              <ResearchPostPage />
            </LazyRoute>
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
            <LazyRoute>
              <CveList />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/threat-map"
          element={
            <LazyRoute>
              <ThreatMap />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/rules"
          element={
            <LazyRoute>
              <Rules />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/deepdarkcti"
          element={
            <LazyRoute>
              <DeepDarkCTI />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/ransomware-live"
          element={
            <LazyRoute>
              <RansomwareLive />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/infostealer"
          element={
            <LazyRoute>
              <Infostealer />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/infostealer/:slug"
          element={
            <LazyRoute>
              <InfostealerDetail />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/feed-sources"
          element={
            <LazyRoute>
              <FeedSources />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/settings"
          element={
            <LazyRoute>
              <SettingsPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/negotiations"
          element={
            <LazyRoute>
              <Negotiations />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/maltrail"
          element={
            <LazyRoute>
              <MaltrailTrails />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/malpedia"
          element={
            <LazyRoute>
              <MalpediaPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/breach-forums"
          element={
            <LazyRoute>
              <BreachForums />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/owasp"
          element={
            <LazyRoute>
              <Owasp />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/prompt-injection"
          element={
            <LazyRoute>
              <PromptInjection />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/mcp-audit"
          element={
            <LazyRoute>
              <McpAudit />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/kill-chain"
          element={
            <LazyRoute>
              <KillChain />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/diamond"
          element={
            <LazyRoute>
              <Diamond />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/lolbins"
          element={
            <LazyRoute>
              <Lolbins />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/rule-playground"
          element={
            <LazyRoute>
              <RulePlayground />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/yara"
          element={
            <LazyRoute>
              <YaraManager />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/report-parser"
          element={
            <LazyRoute>
              <ReportParser />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/ioc-lifecycle"
          element={
            <LazyRoute>
              <IocLifecycle />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/ct-monitor"
          element={
            <LazyRoute>
              <CtMonitor />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/stealer-parser"
          element={
            <LazyRoute>
              <StealerParser />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/taxii"
          element={
            <LazyRoute>
              <TaxiiServer />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/bloom"
          element={
            <LazyRoute>
              <BloomFilter />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/ai-rule-generator"
          element={
            <LazyRoute>
              <AiRuleGenerator />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/threat-graph"
          element={
            <LazyRoute>
              <ThreatGraph />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/attack-chain"
          element={
            <LazyRoute>
              <AttackChain />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/hunting-query-generator"
          element={
            <LazyRoute>
              <HuntingQueryGenerator />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/sandbox"
          element={
            <LazyRoute>
              <SandboxIntegration />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/ir-playbooks"
          element={
            <LazyRoute>
              <IrPlaybooks />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/detection-lab"
          element={
            <LazyRoute>
              <DetectionLab />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/email-defense"
          element={
            <LazyRoute>
              <EmailDefense />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/dmarc-analyzer"
          element={
            <LazyRoute>
              <DmarcAnalyzer />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/nhi"
          element={
            <LazyRoute>
              <Nhi />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/powershell-deobf"
          element={
            <LazyRoute>
              <PowershellDeobf />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/agent-map"
          element={
            <LazyRoute>
              <AgentMap />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/tabletop"
          element={
            <LazyRoute>
              <Tabletop />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/grc"
          element={
            <LazyRoute>
              <Grc />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/dlp-scan"
          element={
            <LazyRoute>
              <DlpScan />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/data-classification"
          element={
            <LazyRoute>
              <DataClassification />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/privacy-hub"
          element={
            <LazyRoute>
              <PrivacyHub />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/username"
          element={
            <LazyRoute>
              <UsernamePivot />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/identity-lookup"
          element={
            <LazyRoute>
              <IdentityLookup />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/wayback"
          element={
            <LazyRoute>
              <Wayback />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/ip-geo"
          element={
            <LazyRoute>
              <IpGeo />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/log-parser"
          element={
            <LazyRoute>
              <LogParser />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/socmint"
          element={
            <LazyRoute>
              <Socmint />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/osint-framework"
          element={
            <LazyRoute>
              <OsintFramework />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/secops-tools"
          element={
            <LazyRoute>
              <SecopsCatalog />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/tools/about"
          element={
            <LazyRoute>
              <ToolsAbout />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/tools/:group"
          element={
            <LazyRoute>
              <ToolsCategory />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/timestamp"
          element={
            <LazyRoute>
              <TimestampConverter />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/hash-calc"
          element={
            <LazyRoute>
              <HashCalculator />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/dork-builder"
          element={
            <LazyRoute>
              <DorkBuilder />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/brand-impersonation"
          element={
            <LazyRoute>
              <BrandImpersonation />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/image-fingerprint"
          element={
            <LazyRoute>
              <ImageFingerprint />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/plist-protobuf"
          element={
            <LazyRoute>
              <PlistProtobuf />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/pcap-triage"
          element={
            <LazyRoute>
              <PcapTriage />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/registry-hive"
          element={
            <LazyRoute>
              <RegistryHive />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/evtx"
          element={
            <LazyRoute>
              <EvtxParser />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/sqlite"
          element={
            <LazyRoute>
              <SqliteExplorer />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/ios-backup"
          element={
            <LazyRoute>
              <IosBackupExplorer />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/screenshot-intel"
          element={
            <LazyRoute>
              <ScreenshotIntel />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/mobile-sqlite"
          element={
            <LazyRoute>
              <SqliteExplorer />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/apk-analyzer"
          element={
            <LazyRoute>
              <ApkAnalyzer />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/pe"
          element={
            <LazyRoute>
              <PeAnalyzer />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/web-log"
          element={
            <LazyRoute>
              <WebLogAnalyzer />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/prefetch"
          element={
            <LazyRoute>
              <PrefetchAnalyzer />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/cve-resources"
          element={
            <LazyRoute>
              <CveResourcesCatalog />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/web-scan"
          element={
            <LazyRoute>
              <WebScan />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/malware-scan"
          element={
            <LazyRoute>
              <MalwareScan />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/reverse-image"
          element={
            <LazyRoute>
              <ReverseImage />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/eml"
          element={
            <LazyRoute>
              <EmlExtractor />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/url-rep"
          element={
            <LazyRoute>
              <UrlReputation />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/email-rep"
          element={
            <LazyRoute>
              <EmailReputation />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/domain-monitor"
          element={
            <LazyRoute>
              <DomainMonitor />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/watches"
          element={
            <LazyRoute>
              <WatchesPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/copilot"
          element={
            <LazyRoute>
              <CopilotPage />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/scam-watch"
          element={
            <LazyRoute>
              <ScamWatch />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/crypto-trace"
          element={
            <LazyRoute>
              <CryptoTrace />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/tech-ai-news"
          element={
            <LazyRoute>
              <TechAiNews />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/threat-feeds"
          element={
            <LazyRoute>
              <ThreatFeeds />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/onion-watch"
          element={
            <LazyRoute>
              <OnionWatch />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/telegram-watch"
          element={
            <LazyRoute>
              <TelegramWatch />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/telegram-settings"
          element={
            <LazyRoute>
              <TelegramSettings />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/awesome-lists"
          element={
            <LazyRoute>
              <AwesomeLists />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/external-resources"
          element={
            <LazyRoute>
              <ExternalResources />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/darkweb-tools"
          element={
            <LazyRoute>
              <DarkWebOsintTools />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/aggregated-feeds"
          element={
            <LazyRoute>
              <AggregatedFeeds />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/malware-iocs"
          element={
            <LazyRoute>
              <MalwareIocs />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/feed-catalog"
          element={
            <LazyRoute>
              <FeedCatalog />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/analyze"
          element={
            <LazyRoute>
              <Analyze />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/yara"
          element={
            <LazyRoute>
              <Yarahub />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/investigations"
          element={
            <LazyRoute>
              <Investigations />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/feed-scheduler"
          element={
            <LazyRoute>
              <FeedScheduler />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/observable-db"
          element={
            <LazyRoute>
              <ObservableDb />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/malware-vault"
          element={
            <LazyRoute>
              <MalwareVault />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/about"
          element={
            <LazyRoute>
              <ThreatIntelAbout />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/c/:cat"
          element={
            <LazyRoute>
              <ThreatIntelHome />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel"
          element={
            <LazyRoute>
              <ThreatIntelHome />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/misp-browser"
          element={
            <LazyRoute>
              <MispBrowser />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/search"
          element={
            <LazyRoute>
              <UnifiedSearch />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/ioc-enrichment"
          element={
            <LazyRoute>
              <IocEnrichment />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/relationship-graph"
          element={
            <LazyRoute>
              <RelationshipGraph />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/ach"
          element={
            <LazyRoute>
              <ACH />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/cross-correlate"
          element={
            <LazyRoute>
              <CrossCorrelate />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/assessments"
          element={
            <LazyRoute>
              <Assessments />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/assessments/:id"
          element={
            <LazyRoute>
              <AssessmentDetail />
            </LazyRoute>
          }
        />
        <Route
          path="/threatintel/entity-resolution"
          element={
            <LazyRoute>
              <EntityResolution />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/pgp-tool"
          element={
            <LazyRoute>
              <PgpTool />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/tor-gateway"
          element={
            <LazyRoute>
              <TorGateway />
            </LazyRoute>
          }
        />
        <Route
          path="/dfir/blocklists"
          element={
            <LazyRoute>
              <Blocklists />
            </LazyRoute>
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
            <LazyRoute>
              <AdminApp />
            </LazyRoute>
          }
        />
        <Route
          path="*"
          element={
            <LazyRoute>
              <NotFound />
            </LazyRoute>
          }
        />
      </Routes>
    ),
    []
  );

  // ─── App-route render path (DFIR + ThreatIntel as stand-alone apps) ───
  // Keeps the same body bg + gradient overlay + noise texture as the
  // portfolio so the dark theme matches; swaps Header/Footer for AppShell.
  if (isAppRoute && appMode) {
    return (
      <>
        <StructuredData personalInfo={personalInfo} stats={stats} />
        <SkipToContent />
        <BackgroundLayer isDark={isDark} />
        <Suspense fallback={null}>
          <CommandPalette />
        </Suspense>
        <AppShell mode={appMode} isDark={isDark} onToggleTheme={toggleTheme}>
          {routes}
        </AppShell>
        <div id="aria-live-region" aria-live="polite" aria-atomic="true" className="sr-only" />
      </>
    );
  }

  // ─── Portfolio render path ────────────────────────────────────────────
  return (
    <PortfolioShell isDark={isDark} toggleTheme={toggleTheme} navLinks={navLinks} personalInfo={personalInfo}>
      {routes}
    </PortfolioShell>
  );
}

function PortfolioShell({
  isDark,
  toggleTheme,
  navLinks,
  personalInfo,
  children,
}: {
  isDark: boolean;
  toggleTheme: () => void;
  navLinks: import('./core/entities').NavLink[];
  personalInfo: import('./core/entities').PersonalInfo;
  children: React.ReactNode;
}) {
  const { progress, showBackToTop, scrollToTop } = useScrollProgress();

  return (
    <>
      <StructuredData personalInfo={personalInfo} stats={stats} />
      <SkipToContent />
      <BackgroundLayer isDark={isDark} />

      <ScrollProgress progress={progress} />
      <Header isDark={isDark} onToggleTheme={toggleTheme} navLinks={navLinks} />
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>

      <main id="main-content" tabIndex={-1}>
        <Layout>{children}</Layout>
      </main>

      <Footer personalInfo={personalInfo} />
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
