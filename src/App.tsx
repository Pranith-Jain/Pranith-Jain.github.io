import { useEffect, Suspense, lazy, useMemo, type ComponentType } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate, useSearchParams } from 'react-router-dom';
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
import { FeaturesProvider } from './components/FeaturesProvider';
import { McpProvider } from './components/ti-mindmap-mcp/McpContext';
import { McpKeyBar } from './components/ti-mindmap-mcp/McpKeyBar';

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
const McpCatalog = lazy(() => import('./pages/McpCatalog'));
const Status = lazy(() => import('./pages/Status'));
const Projects = lazy(() => import('./pages/Projects'));
const CaseStudy = lazy(() => import('./pages/CaseStudy'));
const ResearchPostPage = lazy(() => import('./pages/threatintel/ResearchPost'));
const DFIR = lazy(() => import('./pages/DFIR'));

const Phishing = lazy(() => import('./pages/dfir/Phishing'));
const Exposure = lazy(() => import('./pages/dfir/Exposure'));
const AssetIntel = lazy(() => import('./pages/dfir/AssetIntel'));
const WikiArticle = lazy(() => import('./pages/dfir/WikiArticle'));
const ActorDetail = lazy(() => import('./pages/dfir/ActorDetail'));
const Privacy = lazy(() => import('./pages/dfir/Privacy'));
const Briefings = lazy(() => import('./pages/dfir/Briefings'));
const BriefingDetail = lazy(() => import('./pages/dfir/BriefingDetail'));
const Cve = lazy(() => import('./pages/dfir/Cve'));
const Decode = lazy(() => import('./pages/dfir/Decode'));
const Encoder = lazy(() => import('./pages/dfir/Encoder'));
const CertSearch = lazy(() => import('./pages/dfir/CertSearch'));
const AsnLookup = lazy(() => import('./pages/dfir/AsnLookup'));
const HostGraph = lazy(() => import('./pages/dfir/HostGraph'));
const Breach = lazy(() => import('./pages/dfir/Breach'));
const ExifParse = lazy(() => import('./pages/dfir/ExifParse'));
const ExposedHostPage = lazy(() => import('./pages/dfir/ExposedHost'));
const UrlPreview = lazy(() => import('./pages/dfir/UrlPreview'));
const IocExtractor = lazy(() => import('./pages/dfir/IocExtractor'));
const JwtInspect = lazy(() => import('./pages/dfir/JwtInspect'));
const GoogleDorks = lazy(() => import('./pages/dfir/GoogleDorks'));
const IamPolicyAnalyzer = lazy(() => import('./pages/dfir/IamPolicyAnalyzer'));
const ZeroTrustAiAgents = lazy(() => import('./pages/dfir/ZeroTrustAiAgents'));
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
const SecHeadersLive = lazy(() => import('./pages/dfir/SecHeadersLive'));
const SecretScanner = lazy(() => import('./pages/dfir/SecretScanner'));
const GraphqlAuditor = lazy(() => import('./pages/dfir/GraphqlAuditor'));
const OsvScanner = lazy(() => import('./pages/dfir/OsvScanner'));
const Punycode = lazy(() => import('./pages/dfir/Punycode'));
const Takeover = lazy(() => import('./pages/dfir/Takeover'));
const StixBuilder = lazy(() => import('./pages/dfir/StixBuilder'));
const Owasp = lazy(() => import('./pages/dfir/Owasp'));
const PromptInjection = lazy(() => import('./pages/dfir/PromptInjection'));
const McpAudit = lazy(() => import('./pages/dfir/McpAudit'));
const KillChain = lazy(() => import('./pages/dfir/KillChain'));
const Diamond = lazy(() => import('./pages/dfir/Diamond'));
const Lolbins = lazy(() => import('./pages/dfir/Lolbins'));
const ReportAnalyzer = lazy(() => import('./pages/dfir/ReportAnalyzer'));
const IocLifecycle = lazy(() => import('./pages/dfir/IocLifecycle'));
const CtMonitor = lazy(() => import('./pages/dfir/CtMonitor'));
const StealerParser = lazy(() => import('./pages/dfir/StealerParser'));
const BloomFilter = lazy(() => import('./pages/dfir/BloomFilter'));
const AiRuleGenerator = lazy(() => import('./pages/dfir/AiRuleGenerator'));
const FpLens = lazy(() => import('./pages/dfir/FpLens'));
const ThreatGraph = lazy(() => import('./pages/dfir/ThreatGraph'));
const AttackChain = lazy(() => import('./pages/dfir/AttackChain'));
const AttackNavigator = lazy(() => import('./pages/dfir/AttackNavigator'));
const HuntingQueryGenerator = lazy(() => import('./pages/dfir/HuntingQueryGenerator'));
const IrPlaybooks = lazy(() => import('./pages/dfir/IrPlaybooks'));
const EmailDefense = lazy(() => import('./pages/dfir/EmailDefense'));
const Nhi = lazy(() => import('./pages/dfir/Nhi'));
const Pivex = lazy(() => import('./pages/dfir/Pivex'));
const Tracepulse = lazy(() => import('./pages/dfir/Tracepulse'));
const Quicktrace = lazy(() => import('./pages/dfir/Quicktrace'));
const PowershellDeobf = lazy(() => import('./pages/dfir/PowershellDeobf'));
const AgentMap = lazy(() => import('./pages/dfir/AgentMap'));
const AgentInvestigator = lazy(() => import('./pages/dfir/AgentInvestigator'));
const Tabletop = lazy(() => import('./pages/dfir/Tabletop'));
const Grc = lazy(() => import('./pages/dfir/Grc'));
const DlpScan = lazy(() => import('./pages/dfir/DlpScan'));
const DataClassification = lazy(() => import('./pages/dfir/DataClassification'));
const PrivacyHub = lazy(() => import('./pages/dfir/PrivacyHub'));
const PersonalSecurity = lazy(() => import('./pages/dfir/PersonalSecurity'));
const UsernameInvestigator = lazy(() => import('./pages/dfir/UsernameInvestigator'));
const DomainInvestigator = lazy(() => import('./pages/dfir/DomainInvestigator'));
const PassiveDns = lazy(() => import('./pages/dfir/PassiveDns'));
const MalwareAnalyzer = lazy(() => import('./pages/dfir/MalwareAnalyzer'));
const Notebooks = lazy(() => import('./pages/dfir/Notebooks'));
const VulnToolkitCatalog = lazy(() => import('./pages/dfir/VulnToolkitCatalog'));
const WeatherOsint = lazy(() => import('./pages/dfir/WeatherOsint'));
const IocInvestigate = lazy(() => import('./pages/dfir/IocInvestigate'));
const DfirCopilotPage = lazy(() => import('./pages/dfir/DfirCopilot'));
const YaraWorkbench = lazy(() => import('./pages/dfir/YaraWorkbench'));
const StixWorkbench = lazy(() => import('./pages/dfir/StixWorkbench'));
const PhoneOsint = lazy(() => import('./pages/dfir/PhoneOsint'));
const Wayback = lazy(() => import('./pages/dfir/Wayback'));
const IpGeo = lazy(() => import('./pages/dfir/IpGeo'));
const LogParser = lazy(() => import('./pages/dfir/LogParser'));
const Blocklists = lazy(() => import('./pages/dfir/Blocklists'));

const Socmint = lazy(() => import('./pages/dfir/Socmint'));
const OsintMapper = lazy(() => import('./pages/dfir/OsintMapper'));
const ToolsCategory = lazy(() => import('./pages/dfir/ToolsCategory'));
const ToolsAbout = lazy(() => import('./pages/dfir/ToolsAbout'));
const TimestampConverter = lazy(() => import('./pages/dfir/TimestampConverter'));
const HashCalculator = lazy(() => import('./pages/dfir/HashCalculator'));
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

const InsightAi = lazy(() => import('./pages/dfir/InsightAi'));
const QuerycraftAi = lazy(() => import('./pages/dfir/QuerycraftAi'));
const ChronoAi = lazy(() => import('./pages/dfir/ChronoAi'));
const MalbriefAi = lazy(() => import('./pages/dfir/MalbriefAi'));
const VerdiktAi = lazy(() => import('./pages/dfir/VerdiktAi'));
const ReverseImage = lazy(() => import('./pages/dfir/ReverseImage'));
const EmlExtractor = lazy(() => import('./pages/dfir/EmlExtractor'));
const EmailDeliverability = lazy(() => import('./pages/dfir/EmailDeliverability'));
const Tracer = lazy(() => import('./pages/dfir/Tracer'));
const ThreatIntelHome = lazy(() => import('./pages/threatintel/Home'));
const ThreatIntelAbout = lazy(() => import('./pages/threatintel/About'));
const ThreatIntelCatalog = lazy(() => import('./pages/threatintel/Catalog'));
const LiveCenter = lazy(() => import('./pages/threatintel/LiveCenter'));
const TelegramMonitor = lazy(() => import('./pages/threatintel/TelegramMonitor'));
const TelegramIocs = lazy(() => import('./pages/threatintel/TelegramIocs'));
const TelegramHub = lazy(() => import('./pages/threatintel/TelegramHub'));
const SourceHealth = lazy(() => import('./pages/threatintel/SourceHealth'));
const SocDashboard = lazy(() => import('./pages/threatintel/SocDashboard'));
const AptTracker = lazy(() => import('./pages/threatintel/AptTracker'));
const MostWanted = lazy(() => import('./pages/threatintel/MostWanted'));
const Extremists = lazy(() => import('./pages/threatintel/Extremists'));
const Predators = lazy(() => import('./pages/threatintel/Predators'));
// ── Threat Intel: direct page components (auto-added by audit) ──
const ACH = lazy(() => import('./pages/threatintel/ACH'));
const AIReportShowcase = lazy(() => import('./pages/threatintel/AIReportShowcase'));
const ActorDNA = lazy(() => import('./pages/threatintel/ActorDNA'));
const ActorDirectory = lazy(() => import('./pages/threatintel/ActorDirectory'));
const ActorKb = lazy(() => import('./pages/threatintel/ActorKb'));
const ActorTimeline = lazy(() => import('./pages/threatintel/ActorTimeline'));
const ActorUsernameSearch = lazy(() => import('./pages/threatintel/ActorUsernameSearch'));
const AggregatedFeeds = lazy(() => import('./pages/threatintel/AggregatedFeeds'));
const AnalyticsDashboard = lazy(() => import('./pages/threatintel/AnalyticsDashboard'));
const Analyze = lazy(() => import('./pages/threatintel/Analyze'));
const Assessments = lazy(() => import('./pages/threatintel/Assessments'));
const AttackFlowLibrary = lazy(() => import('./pages/threatintel/AttackFlowLibrary'));
const Attribution = lazy(() => import('./pages/threatintel/AttributionFramework'));
const AwesomeLists = lazy(() => import('./pages/dfir/AwesomeLists'));
const BreachDisclosures = lazy(() => import('./pages/threatintel/BreachDisclosures'));
const BreachForums = lazy(() => import('./pages/threatintel/BreachForums'));
const C2Tracker = lazy(() => import('./pages/threatintel/C2Tracker'));
const CampaignGenerator = lazy(() => import('./pages/threatintel/CampaignGenerator'));
const CampaignLifecycle = lazy(() => import('./pages/threatintel/CampaignLifecycle'));
const Campaigns = lazy(() => import('./pages/threatintel/Campaigns'));
const CertStreamLive = lazy(() => import('./pages/threatintel/CertStreamLive'));
const CloudThreatLandscape = lazy(() => import('./pages/threatintel/CloudThreatLandscape'));
const Copilot = lazy(() => import('./pages/threatintel/Copilot'));
const CopilotChat = lazy(() => import('./pages/threatintel/CopilotChat'));
const CrossCampaignCorrelation = lazy(() => import('./pages/threatintel/CrossCampaignCorrelation'));
const CrossCorrelate = lazy(() => import('./pages/threatintel/CrossCorrelate'));
const CryptoScamFeed = lazy(() => import('./pages/threatintel/CryptoScamFeed'));
const CuratedToolbox = lazy(() => import('./pages/threatintel/CuratedToolbox'));
const CuratedCerts = lazy(() => import('./pages/threatintel/CuratedCerts'));
const CveIntel = lazy(() => import('./pages/threatintel/CveIntel'));
const CveList = lazy(() => import('./pages/threatintel/CveList'));
const CveResourcesCatalog = lazy(() => import('./pages/dfir/CveResourcesCatalog'));
const CyberCrime = lazy(() => import('./pages/threatintel/CyberCrime'));
const DarkWeb = lazy(() => import('./pages/threatintel/DarkWebOsintTools'));
const DarknetMarketsTimeline = lazy(() => import('./pages/threatintel/DarknetMarketsTimeline'));
const DeepDarkCTI = lazy(() => import('./pages/threatintel/DeepDarkCTI'));
const Detections = lazy(() => import('./pages/threatintel/Detections'));
const DisarmFramework = lazy(() => import('./pages/threatintel/DisarmFramework'));
const DomainMonitor = lazy(() => import('./pages/threatintel/DomainMonitor'));
const EntityResolution = lazy(() => import('./pages/threatintel/EntityResolution'));
const ExploitableCves = lazy(() => import('./pages/threatintel/ExploitableCves'));
const ExternalResources = lazy(() => import('./pages/threatintel/ExternalResources'));
const F3ead = lazy(() => import('./pages/threatintel/F3ead'));
const FeedCatalog = lazy(() => import('./pages/threatintel/FeedCatalog'));
const FeedQuality = lazy(() => import('./pages/threatintel/FeedQuality'));
const FeedScheduler = lazy(() => import('./pages/threatintel/FeedScheduler'));
const FeedSources = lazy(() => import('./pages/threatintel/FeedSources'));
const FeedStatus = lazy(() => import('./pages/threatintel/FeedStatus'));
const GithubAdvisories = lazy(() => import('./pages/threatintel/GithubAdvisories'));
const GlobalPulse = lazy(() => import('./pages/threatintel/GlobalPulse'));
const Infostealer = lazy(() => import('./pages/threatintel/Infostealer'));
const InfraIntel = lazy(() => import('./pages/threatintel/InfraIntel'));
const InsiderThreatMatrix = lazy(() => import('./pages/threatintel/InsiderThreatMatrix'));
const IntelDashboard = lazy(() => import('./pages/threatintel/IntelDashboard'));
const Investigations = lazy(() => import('./pages/threatintel/Investigations'));
const IocCorrelation = lazy(() => import('./pages/threatintel/IocCorrelation'));
const IocEnrichment = lazy(() => import('./pages/threatintel/IocEnrichment'));
const IocFeedsPage = lazy(() => import('./pages/threatintel/IocFeedsPage'));
const K8sCve = lazy(() => import('./pages/threatintel/K8sCve'));
const KnowledgeGraph = lazy(() => import('./pages/threatintel/KnowledgeGraph'));
const LiveIocs = lazy(() => import('./pages/threatintel/LiveIocs'));
const LlmThreatAtlas = lazy(() => import('./pages/threatintel/LlmThreatAtlas'));
const MaliciousPackages = lazy(() => import('./pages/threatintel/MaliciousPackages'));
const MalpediaPage = lazy(() => import('./pages/threatintel/MalpediaPage'));
const MaltrailTrails = lazy(() => import('./pages/threatintel/MaltrailTrails'));
const MalwareIocs = lazy(() => import('./pages/threatintel/MalwareIocs'));
const MalwareSandbox = lazy(() => import('./pages/threatintel/MalwareSandbox'));
const MalwareVault = lazy(() => import('./pages/threatintel/MalwareVault'));
const McpSearch = lazy(() => import('./pages/threatintel/McpSearch'));
const Metrics = lazy(() => import('./pages/threatintel/Metrics'));
const MispBrowser = lazy(() => import('./pages/threatintel/MispBrowser'));
const MitreMatrix = lazy(() => import('./pages/dfir/MitreMatrix'));
const MyThreatIntel = lazy(() => import('./pages/threatintel/MyThreatIntel'));
const ObservableDb = lazy(() => import('./pages/threatintel/ObservableDb'));
const Observe = lazy(() => import('./pages/threatintel/Observe'));
const OsintCliTools = lazy(() => import('./pages/threatintel/OsintCliTools'));
const OsintCountryMap = lazy(() => import('./pages/threatintel/OsintCountryMap'));
const OsintFramework = lazy(() => import('./pages/dfir/OsintFramework'));
const OwaspAiLandscape = lazy(() => import('./pages/threatintel/OwaspAiLandscape'));
const PhishFeed = lazy(() => import('./pages/threatintel/PhishFeed'));
const PhishingWordlists = lazy(() => import('./pages/threatintel/PhishingWordlists'));
const PhysicalBitcoinAttacks = lazy(() => import('./pages/threatintel/PhysicalBitcoinAttacks'));
const PirDashboard = lazy(() => import('./pages/threatintel/PirDashboard'));
const Predictions = lazy(() => import('./pages/threatintel/Predictions'));
const PredictiveIntel = lazy(() => import('./pages/threatintel/PredictiveIntel'));
const RansomReport = lazy(() => import('./pages/threatintel/RansomReport'));
const RansomwareActivity = lazy(() => import('./pages/threatintel/RansomwareActivity'));
const RansomwareMap = lazy(() => import('./pages/threatintel/RansomwareMap'));
const Ransomwhere = lazy(() => import('./pages/threatintel/Ransomwhere'));
const RedHuntInsights = lazy(() => import('./pages/threatintel/RedHuntInsights'));
const RedHuntLabsResearch = lazy(() => import('./pages/threatintel/RedHuntLabsResearch'));
const RedditFirehose = lazy(() => import('./pages/threatintel/RedditFirehose'));
const RelationshipGraph = lazy(() => import('./pages/threatintel/RelationshipGraph'));
const Reports = lazy(() => import('./pages/threatintel/ThreatIntelReports'));
const ResearchIndex = lazy(() => import('./pages/threatintel/Research'));
const ResearchPost = lazy(() => import('./pages/threatintel/ResearchPost'));
const ResearchSignal = lazy(() => import('./pages/threatintel/Signal'));
const ScamWatch = lazy(() => import('./pages/dfir/ScamWatch'));
const ScrapedIntelUsernames = lazy(() => import('./pages/threatintel/ScrapedIntelUsernames'));
const SecopsCatalog = lazy(() => import('./pages/dfir/SecopsCatalog'));
const SecretLeaks = lazy(() => import('./pages/threatintel/SecretLeaks'));
const Settings = lazy(() => import('./pages/threatintel/Settings'));
const SocIocs = lazy(() => import('./pages/threatintel/SocIocs'));
const SocialFirehose = lazy(() => import('./pages/threatintel/SocialFirehose'));
const SourceReliability = lazy(() => import('./pages/threatintel/SourceReliability'));
const StixBundleBrowser = lazy(() => import('./pages/threatintel/StixBundleBrowser'));
const SupplyChainIntelligence = lazy(() => import('./pages/threatintel/SupplyChainIntelligence'));
const TechAiNews = lazy(() => import('./pages/dfir/TechAiNews'));
const TelegramDiscoveredChannels = lazy(() => import('./pages/threatintel/TelegramDiscoveredChannels'));
const TelegramLeakStats = lazy(() => import('./pages/threatintel/TelegramLeakStats'));
const TelegramLeaks = lazy(() => import('./pages/threatintel/TelegramLeaks'));
const TelegramSettings = lazy(() => import('./pages/threatintel/TelegramSettings'));
const ThreatActorCatalog = lazy(() => import('./pages/threatintel/ThreatActorCatalog'));
const ThreatFeeds = lazy(() => import('./pages/dfir/ThreatFeeds'));
const ThreatMap = lazy(() => import('./pages/dfir/ThreatMap'));
const ThreatPulse = lazy(() => import('./pages/threatintel/ThreatPulse'));
const ThreatSignalRss = lazy(() => import('./pages/threatintel/ThreatSignalRss'));
const UnifiedSearch = lazy(() => import('./pages/threatintel/UnifiedSearch'));
const VolexityThreatIntel = lazy(() => import('./pages/threatintel/VolexityThreatIntel'));
const Watches = lazy(() => import('./pages/threatintel/Watches'));
const Webamon = lazy(() => import('./pages/threatintel/Webamon'));
const Wiki = lazy(() => import('./pages/dfir/Wiki'));
const Writeups = lazy(() => import('./pages/threatintel/Writeups'));
const XFirehose = lazy(() => import('./pages/threatintel/XFirehose'));
const XLive = lazy(() => import('./pages/threatintel/XLive'));
const XWatch = lazy(() => import('./pages/threatintel/XWatch'));
const YaraPage = lazy(() => import('./pages/threatintel/Yarahub'));

const NotFound = lazy(() => import('./pages/NotFound'));
const CampaignDetail = lazy(() => import('./pages/threatintel/CampaignDetail'));
const AbuseRepPage = lazy(() => import('./pages/dfir/AbuseRep'));
const BehindTheReports = lazy(() => import('./pages/BehindTheReports'));
const Sponsor = lazy(() => import('./pages/Sponsor'));
const Blog = lazy(() => import('./pages/Blog'));
const BlogPost = lazy(() => import('./pages/BlogPost'));
const Snapshots = lazy(() => import('./pages/Snapshots'));
const AdminApp = lazy(() => import('./pages/admin/AdminApp'));
const AdminAnalyticsDashboard = lazy(() => import('./pages/admin/AnalyticsDashboard'));
const RansomwareLive = lazy(() => import('./pages/threatintel/RansomwareLive'));
const UrlReputation = lazy(() => import('./pages/dfir/UrlReputation'));
const WhoisHistory = lazy(() => import('./pages/dfir/WhoisHistory'));
const OpenDirectory = lazy(() => import('./pages/dfir/OpenDirectory'));
const ApkAnalyzer = lazy(() => import('./pages/dfir/ApkAnalyzer'));
const PgpTool = lazy(() => import('./pages/dfir/PgpTool'));
const TorGateway = lazy(() => import('./pages/dfir/TorGateway'));
const EmailReputation = lazy(() => import('./pages/dfir/EmailReputation'));
const PhishOps = lazy(() => import('./pages/dfir/PhishOps'));
const PhishBook = lazy(() => import('./pages/dfir/PhishBook'));

// (removed LiveFeedsPage and MyDashboardPage)
const InfostealerDetail = lazy(() => import('./pages/threatintel/InfostealerDetail'));
const InfostealerIntel = lazy(() => import('./pages/dfir/InfostealerIntel'));
const DmarcAnalyzer = lazy(() => import('./pages/dfir/DmarcAnalyzer'));
const AssessmentDetail = lazy(() => import('./pages/threatintel/AssessmentDetail'));
const ExportHub = lazy(() => import('./pages/dfir/ExportHub'));
const MultiSearch = lazy(() => import('./pages/dfir/MultiSearch'));
const ReportComposer = lazy(() => import('./pages/dfir/ReportComposer'));
const XVeridikt = lazy(() => import('./pages/dfir/XVeridikt'));
const Dnscope = lazy(() => import('./pages/dfir/Dnscope'));
const AttmapAi = lazy(() => import('./pages/dfir/AttmapAi'));
const Tracerules = lazy(() => import('./pages/dfir/Tracerules'));
const Regscope = lazy(() => import('./pages/dfir/Regscope'));
const DfirCatalog = lazy(() => import('./pages/dfir/Catalog'));
const DfirVs = lazy(() => import('./pages/dfir/Vs'));

const RadarHome = lazy(() => import('./pages/radar/Home'));
const RadarScanResults = lazy(() => import('./pages/radar/ScanResults'));
const ArgusPage = lazy(() => import('./pages/Argus'));

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

interface RouteDef {
  path: string;
  Component: ComponentType;
  /** Eager routes render directly; the rest wrap in <LazyRoute> for Suspense. */
  eager?: boolean;
}

/**
 * Data-driven route table — replaces ~1820 lines of repetitive <Route> JSX.
 * Route ORDER does not affect matching (React Router v6 ranks by path
 * specificity, not declaration order); entries are kept in the original source
 * order for diff sanity. Every lazy()/eager/redirect mapping is byte-identical
 * to the previous JSX, so chunk-splitting and the documented eager-Home
 * decision (Home stays eager) are preserved.
 */
const ROUTES: ReadonlyArray<RouteDef> = [
  { path: '/', Component: Home, eager: true },
  { path: '/about', Component: About },
  { path: '/skills', Component: Skills },
  { path: '/experience', Component: Experience },
  { path: '/projects', Component: Projects },
  { path: '/projects/:slug', Component: CaseStudy },
  { path: '/behind-the-reports', Component: BehindTheReports },
  { path: '/sponsor', Component: Sponsor },
  { path: '/blog', Component: Blog },
  { path: '/blog/c/:type', Component: Blog },
  { path: '/blog/:slug', Component: BlogPost },
  { path: '/snapshots', Component: Snapshots },
  { path: '/mcp', Component: McpCatalog },
  { path: '/status', Component: Status },
  { path: '/live', Component: Snapshots },
  { path: '/dfir', Component: DFIR },
  { path: '/dfir/abuse-rep', Component: AbuseRepPage },
  { path: '/dfir/phishing', Component: Phishing },
  { path: '/dfir/whois-history', Component: WhoisHistory },
  { path: '/dfir/open-directory', Component: OpenDirectory },
  { path: '/dfir/exposure', Component: Exposure },
  { path: '/dfir/exposed-host', Component: ExposedHostPage },
  { path: '/dfir/asset-intel', Component: AssetIntel },
  { path: '/dfir/file', Component: DfirFileRedirect, eager: true },
  { path: '/threatintel/wiki/:slug', Component: WikiArticle },
  { path: '/threatintel/actors/:slug', Component: ActorDetail },
  { path: '/dfir/privacy', Component: Privacy },
  { path: '/threatintel/briefings', Component: Briefings },
  { path: '/threatintel/briefings/:slug', Component: BriefingDetail },
  { path: '/dfir/cve', Component: Cve },
  { path: '/dfir/vuln-toolkit', Component: VulnToolkitCatalog },
  { path: '/dfir/decode', Component: Decode },
  { path: '/dfir/encoder', Component: Encoder },
  { path: '/dfir/cert-search', Component: CertSearch },
  { path: '/dfir/asn', Component: AsnLookup },
  { path: '/dfir/host-graph', Component: HostGraph },
  { path: '/dfir/breach', Component: Breach },
  { path: '/dfir/exif', Component: ExifParse },
  { path: '/dfir/url-preview', Component: UrlPreview },
  { path: '/dfir/extract', Component: IocExtractor },
  { path: '/dfir/jwt', Component: JwtInspect },
  { path: '/dfir/google-dorks', Component: GoogleDorks },
  { path: '/dfir/iam-analyzer', Component: IamPolicyAnalyzer },
  { path: '/dfir/zero-trust-ai-agents', Component: ZeroTrustAiAgents },
  { path: '/dfir/sg-analyzer', Component: SecurityGroupAnalyzer },
  { path: '/dfir/cloudtrail-triage', Component: CloudTrailTriage },
  { path: '/dfir/k8s-rbac', Component: K8sRbacAnalyzer },
  { path: '/dfir/cve-prioritizer', Component: CvePrioritizer },
  { path: '/dfir/rule-converter', Component: RuleConverter },
  { path: '/dfir/linux-triage', Component: LinuxTriage },
  { path: '/dfir/terraform-scan', Component: TerraformScanner },
  { path: '/dfir/gcp-iam', Component: GcpIamAnalyzer },
  { path: '/dfir/azure-rbac', Component: AzureRbacAnalyzer },
  { path: '/dfir/openapi-audit', Component: OpenApiAuditor },
  { path: '/dfir/sec-headers', Component: SecHeadersAnalyzer },
  { path: '/dfir/sec-headers-live', Component: SecHeadersLive },
  { path: '/dfir/secret-scan', Component: SecretScanner },
  { path: '/dfir/graphql-audit', Component: GraphqlAuditor },
  { path: '/dfir/osv-scan', Component: OsvScanner },
  { path: '/dfir/punycode', Component: Punycode },
  { path: '/dfir/takeover', Component: Takeover },
  { path: '/dfir/stix-builder/b/:bundleId', Component: StixBuilder },
  { path: '/threatintel/campaigns/:id', Component: CampaignDetail },
  { path: '/threatintel/telegram', Component: TelegramHub },
  { path: '/threatintel/telegram-monitor', Component: TelegramMonitor },
  { path: '/threatintel/telegram-iocs', Component: TelegramIocs },
  { path: '/threatintel/source-health', Component: SourceHealth },
  { path: '/threatintel/soc-dashboard', Component: SocDashboard },
  { path: '/threatintel/research/:slug', Component: ResearchPostPage },
  { path: '/threatintel/ransomware-live', Component: RansomwareLive },
  { path: '/threatintel/infostealer/:slug', Component: InfostealerDetail },
  { path: '/dfir/owasp', Component: Owasp },
  { path: '/dfir/prompt-injection', Component: PromptInjection },
  { path: '/dfir/mcp-audit', Component: McpAudit },
  { path: '/dfir/kill-chain', Component: KillChain },
  { path: '/dfir/diamond', Component: Diamond },
  { path: '/dfir/osint-mapper', Component: OsintMapper },
  { path: '/dfir/lolbins', Component: Lolbins },
  { path: '/dfir/ioc-lifecycle', Component: IocLifecycle },
  { path: '/dfir/ct-monitor', Component: CtMonitor },
  { path: '/dfir/stealer-parser', Component: StealerParser },
  { path: '/dfir/bloom', Component: BloomFilter },
  { path: '/dfir/ai-rule-generator', Component: AiRuleGenerator },
  { path: '/dfir/fp-lens', Component: FpLens },
  { path: '/dfir/threat-graph', Component: ThreatGraph },
  { path: '/dfir/attack-chain', Component: AttackChain },
  { path: '/dfir/attack-navigator', Component: AttackNavigator },
  { path: '/dfir/mitre-matrix', Component: MitreMatrix },
  { path: '/dfir/hunting-query-generator', Component: HuntingQueryGenerator },
  { path: '/dfir/ir-playbooks', Component: IrPlaybooks },
  { path: '/dfir/phishops', Component: PhishOps },
  { path: '/dfir/phishbook', Component: PhishBook },
  { path: '/dfir/pivex', Component: Pivex },
  { path: '/dfir/tracepulse', Component: Tracepulse },
  { path: '/dfir/quicktrace', Component: Quicktrace },
  { path: '/dfir/email-defense', Component: EmailDefense },
  { path: '/dfir/dmarc-analyzer', Component: DmarcAnalyzer },
  { path: '/dfir/nhi', Component: Nhi },
  { path: '/dfir/powershell-deobf', Component: PowershellDeobf },
  { path: '/dfir/agent-map', Component: AgentMap },
  { path: '/dfir/agent', Component: AgentInvestigator },
  { path: '/dfir/tabletop', Component: Tabletop },
  { path: '/dfir/grc', Component: Grc },
  { path: '/dfir/dlp-scan', Component: DlpScan },
  { path: '/dfir/data-classification', Component: DataClassification },
  { path: '/dfir/privacy-hub', Component: PrivacyHub },
  { path: '/dfir/personal-security', Component: PersonalSecurity },
  { path: '/dfir/username-investigator', Component: UsernameInvestigator },
  { path: '/dfir/domain-investigator', Component: DomainInvestigator },
  { path: '/dfir/passive-dns', Component: PassiveDns },
  { path: '/dfir/malware-analyzer', Component: MalwareAnalyzer },
  { path: '/dfir/notebooks', Component: Notebooks },
  { path: '/dfir/ioc-investigate', Component: IocInvestigate },
  { path: '/dfir/copilot', Component: DfirCopilotPage },
  { path: '/dfir/yara-workbench', Component: YaraWorkbench },
  { path: '/dfir/stix-workbench', Component: StixWorkbench },
  { path: '/dfir/phone-osint', Component: PhoneOsint },
  { path: '/dfir/weather-osint', Component: WeatherOsint },
  { path: '/dfir/wayback', Component: Wayback },
  { path: '/dfir/ip-geo', Component: IpGeo },
  { path: '/dfir/log-parser', Component: LogParser },
  { path: '/dfir/socmint', Component: Socmint },
  { path: '/dfir/infostealer-intel', Component: InfostealerIntel },
  { path: '/dfir/tools/about', Component: ToolsAbout },
  { path: '/dfir/tools/:group', Component: ToolsCategory },
  { path: '/dfir/timestamp', Component: TimestampConverter },
  { path: '/dfir/hash-calc', Component: HashCalculator },
  { path: '/dfir/brand-impersonation', Component: BrandImpersonation },
  { path: '/dfir/image-fingerprint', Component: ImageFingerprint },
  { path: '/dfir/plist-protobuf', Component: PlistProtobuf },
  { path: '/dfir/pcap-triage', Component: PcapTriage },
  { path: '/dfir/registry-hive', Component: RegistryHive },
  { path: '/dfir/evtx', Component: EvtxParser },
  { path: '/dfir/sqlite', Component: SqliteExplorer },
  { path: '/dfir/ios-backup', Component: IosBackupExplorer },
  { path: '/dfir/screenshot-intel', Component: ScreenshotIntel },
  { path: '/dfir/apk-analyzer', Component: ApkAnalyzer },
  { path: '/dfir/pe', Component: PeAnalyzer },
  { path: '/dfir/web-log', Component: WebLogAnalyzer },
  { path: '/dfir/prefetch', Component: PrefetchAnalyzer },
  { path: '/dfir/insight-ai', Component: InsightAi },
  { path: '/dfir/querycraft-ai', Component: QuerycraftAi },
  { path: '/dfir/chrono-ai', Component: ChronoAi },
  { path: '/dfir/malbrief-ai', Component: MalbriefAi },
  { path: '/dfir/verdikt-ai', Component: VerdiktAi },
  { path: '/dfir/x-verdikt', Component: XVeridikt },
  { path: '/dfir/dnscope', Component: Dnscope },
  { path: '/dfir/attmap-ai', Component: AttmapAi },
  { path: '/dfir/tracerules', Component: Tracerules },
  { path: '/dfir/regscope', Component: Regscope },

  { path: '/dfir/catalog', Component: DfirCatalog },
  { path: '/dfir/vs', Component: DfirVs },
  { path: '/dfir/reverse-image', Component: ReverseImage },
  { path: '/dfir/eml', Component: EmlExtractor },
  { path: '/dfir/email-deliverability', Component: EmailDeliverability },
  { path: '/dfir/url-rep', Component: UrlReputation },
  { path: '/dfir/email-rep', Component: EmailReputation },
  { path: '/dfir/tracer', Component: Tracer },
  { path: '/threatintel/catalog', Component: ThreatIntelCatalog },
  { path: '/threatintel/about', Component: ThreatIntelAbout },
  { path: '/threatintel', Component: ThreatIntelHome },
  { path: '/threatintel/assessments/:id', Component: AssessmentDetail },
  { path: '/threatintel/apt-tracker', Component: AptTracker },
  { path: '/threatintel/most-wanted', Component: MostWanted },
  { path: '/threatintel/extremists', Component: Extremists },
  { path: '/threatintel/predators', Component: Predators },

  { path: '/threatintel/live-center', Component: LiveCenter },
  // ── Threat Intel: direct page URLs (auto-added by audit) ──
  { path: '/threatintel/actors/directory', Component: ActorDirectory },
  { path: '/threatintel/actors/timeline', Component: ActorTimeline },
  { path: '/threatintel/actors/dna', Component: ActorDNA },
  { path: '/threatintel/actors/usernames', Component: ActorUsernameSearch },
  { path: '/threatintel/actors/attribution', Component: Attribution },
  { path: '/threatintel/actors/catalog', Component: ThreatActorCatalog },
  { path: '/threatintel/actors/kb', Component: ActorKb },
  { path: '/threatintel/actors/graph', Component: RelationshipGraph },
  { path: '/threatintel/campaigns/active', Component: Campaigns },
  { path: '/threatintel/campaigns/lifecycle', Component: CampaignLifecycle },
  { path: '/threatintel/campaigns/generator', Component: CampaignGenerator },
  { path: '/threatintel/campaigns/cross', Component: CrossCampaignCorrelation },
  { path: '/threatintel/darkweb/watch', Component: DarkWeb },
  { path: '/threatintel/darkweb/markets', Component: DarknetMarketsTimeline },
  { path: '/threatintel/darkweb/forums', Component: BreachForums },
  { path: '/threatintel/darkweb/deepdark', Component: DeepDarkCTI },
  { path: '/threatintel/darkweb/crime', Component: CyberCrime },
  { path: '/threatintel/darkweb/bitcoin', Component: PhysicalBitcoinAttacks },
  { path: '/threatintel/darkweb/infostealer', Component: Infostealer },
  { path: '/threatintel/darkweb/leaks', Component: SecretLeaks },
  { path: '/threatintel/darkweb/disclosures', Component: BreachDisclosures },
  { path: '/threatintel/darkweb/ransom-report', Component: RansomReport },
  { path: '/threatintel/darkweb/ransom-activity', Component: RansomwareActivity },
  { path: '/threatintel/darkweb/ransom-map', Component: RansomwareMap },
  { path: '/threatintel/darkweb/ransomwhere', Component: Ransomwhere },
  { path: '/threatintel/predictive/dashboard', Component: IntelDashboard },
  { path: '/threatintel/predictive/global-pulse', Component: GlobalPulse },
  { path: '/threatintel/predictive/threat-pulse', Component: ThreatPulse },
  { path: '/threatintel/predictive/certstream', Component: CertStreamLive },
  { path: '/threatintel/predictive/pir', Component: PirDashboard },
  { path: '/threatintel/predictive/metrics', Component: Metrics },
  { path: '/threatintel/predictive/analytics', Component: AnalyticsDashboard },
  { path: '/threatintel/predictive/predictions', Component: Predictions },
  { path: '/threatintel/predictive/predictive', Component: PredictiveIntel },
  { path: '/threatintel/predictive/analyze', Component: Analyze },
  { path: '/threatintel/predictive/assessments', Component: Assessments },
  { path: '/threatintel/predictive/observe', Component: Observe },
  { path: '/threatintel/detections/detections', Component: Detections },
  { path: '/threatintel/detections/disarm', Component: DisarmFramework },
  { path: '/threatintel/detections/yara', Component: YaraPage },
  { path: '/threatintel/detections/signal', Component: ThreatSignalRss },
  { path: '/threatintel/phishing/phish', Component: PhishFeed },
  { path: '/threatintel/phishing/urls', Component: PhishingWordlists },
  { path: '/threatintel/phishing/scam', Component: ScamWatch },
  { path: '/threatintel/external/external', Component: ExternalResources },
  { path: '/threatintel/external/supply', Component: SupplyChainIntelligence },
  { path: '/threatintel/external/awesome', Component: AwesomeLists },
  { path: '/threatintel/feeds/catalog', Component: FeedCatalog },
  { path: '/threatintel/feeds/sources', Component: FeedSources },
  { path: '/threatintel/feeds/quality', Component: FeedQuality },
  { path: '/threatintel/feeds/scheduler', Component: FeedScheduler },
  { path: '/threatintel/feeds/threatfeeds', Component: ThreatFeeds },
  { path: '/threatintel/feeds/status', Component: FeedStatus },
  { path: '/threatintel/feeds/reliability', Component: SourceReliability },
  { path: '/threatintel/feeds/mythreatintel', Component: MyThreatIntel },
  { path: '/threatintel/infra/cloud', Component: CloudThreatLandscape },
  { path: '/threatintel/infra/infra', Component: InfraIntel },
  { path: '/threatintel/infra/webamon', Component: Webamon },
  { path: '/threatintel/infra/domain', Component: DomainMonitor },
  { path: '/threatintel/iocs/live', Component: LiveIocs },
  { path: '/threatintel/iocs/enrichment', Component: IocEnrichment },
  { path: '/threatintel/iocs/feeds', Component: IocFeedsPage },
  { path: '/threatintel/iocs/entity', Component: EntityResolution },
  { path: '/threatintel/iocs/c2', Component: C2Tracker },
  { path: '/threatintel/iocs/map', Component: ThreatMap },
  { path: '/threatintel/iocs/cross', Component: CrossCorrelate },
  { path: '/threatintel/iocs/correlation', Component: IocCorrelation },
  { path: '/threatintel/iocs/aggregated', Component: AggregatedFeeds },
  { path: '/threatintel/iocs/soc', Component: SocIocs },
  { path: '/threatintel/iocs/observable', Component: ObservableDb },
  { path: '/threatintel/wiki/wiki', Component: Wiki },
  { path: '/threatintel/wiki/mitre', Component: MitreMatrix },
  { path: '/threatintel/wiki/f3ead', Component: F3ead },
  { path: '/threatintel/wiki/insider', Component: InsiderThreatMatrix },
  { path: '/threatintel/wiki/owasp', Component: OwaspAiLandscape },
  { path: '/threatintel/wiki/llm', Component: LlmThreatAtlas },
  { path: '/threatintel/malware/iocs', Component: MalwareIocs },
  { path: '/threatintel/malware/vault', Component: MalwareVault },
  { path: '/threatintel/malware/sandbox', Component: MalwareSandbox },
  { path: '/threatintel/malware/packages', Component: MaliciousPackages },
  { path: '/threatintel/malware/malpedia', Component: MalpediaPage },
  { path: '/threatintel/malware/maltrail', Component: MaltrailTrails },
  { path: '/threatintel/osint/framework', Component: OsintFramework },
  { path: '/threatintel/osint/cli', Component: OsintCliTools },
  { path: '/threatintel/osint/map', Component: OsintCountryMap },
  { path: '/threatintel/osint/toolbox', Component: CuratedToolbox },
  { path: '/threatintel/osint/certs', Component: CuratedCerts },
  { path: '/threatintel/osint/secops', Component: SecopsCatalog },
  { path: '/threatintel/research-hub/research', Component: ResearchIndex },
  { path: '/threatintel/research-hub/reports', Component: Reports },
  { path: '/threatintel/research-hub/ai', Component: AIReportShowcase },
  { path: '/threatintel/research-hub/writeups', Component: Writeups },
  { path: '/threatintel/research-hub/signal', Component: ResearchSignal },
  { path: '/threatintel/research-hub/redhunt', Component: RedHuntInsights },
  { path: '/threatintel/research-hub/redhunt-labs', Component: RedHuntLabsResearch },
  { path: '/threatintel/research-hub/volexity', Component: VolexityThreatIntel },
  { path: '/threatintel/research-hub/post', Component: ResearchPost },
  { path: '/threatintel/research-hub/attack-flow', Component: AttackFlowLibrary },
  { path: '/threatintel/research-hub/knowledge', Component: KnowledgeGraph },
  { path: '/threatintel/research-hub/ach', Component: ACH },
  { path: '/threatintel/social/firehose', Component: SocialFirehose },
  { path: '/threatintel/social/news', Component: TechAiNews },
  { path: '/threatintel/social/telegram-leaks', Component: TelegramLeaks },
  { path: '/threatintel/social/telegram-stats', Component: TelegramLeakStats },
  { path: '/threatintel/social/telegram-channels', Component: TelegramDiscoveredChannels },
  { path: '/threatintel/social/telegram-settings', Component: TelegramSettings },
  { path: '/threatintel/social/crypto-scam', Component: CryptoScamFeed },
  { path: '/threatintel/social/reddit', Component: RedditFirehose },
  { path: '/threatintel/social/x-firehose', Component: XFirehose },
  { path: '/threatintel/social/x-live', Component: XLive },
  { path: '/threatintel/social/x-watch', Component: XWatch },
  { path: '/threatintel/social/scraped-intel', Component: ScrapedIntelUsernames },
  { path: '/threatintel/tools/copilot', Component: Copilot },
  { path: '/threatintel/tools/mcp', Component: McpSearch },
  { path: '/threatintel/tools/misp', Component: MispBrowser },
  { path: '/threatintel/tools/stix', Component: StixBundleBrowser },
  { path: '/threatintel/tools/investigations', Component: Investigations },
  { path: '/threatintel/tools/watches', Component: Watches },
  { path: '/threatintel/tools/settings', Component: Settings },
  { path: '/threatintel/tools/copilot-chat', Component: CopilotChat },
  { path: '/threatintel/tools/unified-search', Component: UnifiedSearch },
  { path: '/threatintel/cves/cves', Component: CveIntel },
  { path: '/threatintel/cves/advisories', Component: GithubAdvisories },
  { path: '/threatintel/cves/resources', Component: CveResourcesCatalog },
  { path: '/threatintel/cves/k8s', Component: K8sCve },
  { path: '/threatintel/cves/exploitable', Component: ExploitableCves },
  { path: '/threatintel/cves/list', Component: CveList },
  { path: '/dfir/pgp-tool', Component: PgpTool },
  { path: '/dfir/tor-gateway', Component: TorGateway },
  { path: '/dfir/blocklists', Component: Blocklists },
  // ── 24 Gap Features ──────────────────────────────────────────────
  { path: '/dfir/export-hub', Component: ExportHub },
  { path: '/dfir/multi-search', Component: MultiSearch },
  { path: '/dfir/report-composer', Component: ReportComposer },
  { path: '/dfir/report-analyzer', Component: ReportAnalyzer },
  { path: '/admin', Component: AdminApp },
  { path: '/admin/analytics', Component: AdminAnalyticsDashboard },
  { path: '/radar', Component: RadarHome },
  { path: '/radar/scan/:id', Component: RadarScanResults },
  { path: '/threatnexus', Component: ArgusPage },
];

/** Legacy / renamed paths preserved as redirects so in-flight links don't 404. */
const REDIRECTS: ReadonlyArray<{ path: string; to: string }> = [
  { path: '/dfir/host', to: '/dfir/asset-intel' },
  { path: '/dfir/sigma-convert', to: '/dfir/rule-converter' },
  { path: '/dfir/discord-watch', to: '/threatintel/catalog?cat=social' },
  { path: '/dfir/industry-news', to: '/threatintel/catalog?cat=social' },
  { path: '/difr', to: '/dfir' },
  { path: '/osint-tools', to: '/threatintel/osint/cli' },
  { path: '/threatnexus/', to: '/threatnexus' },

  // ── Duplicate routes (same component) — collapsed 2026-06 ─────
  // Aliases of tab-hubs (DomainInvestigator, IocInvestigate, etc.) point
  // at the same component so they're not separate pages — redirect them.
  { path: '/dfir/dork-builder', to: '/dfir/google-dorks' },
  { path: '/dfir/report-parser', to: '/dfir/report-analyzer' },
  { path: '/dfir/mobile-sqlite', to: '/dfir/sqlite' },
  { path: '/dfir/crypto-trace', to: '/dfir/tracer' },
  { path: '/dfir/username', to: '/dfir/username-investigator' },
  { path: '/dfir/username-osint', to: '/dfir/username-investigator' },
  { path: '/dfir/identity-lookup', to: '/dfir/username-investigator' },
  { path: '/threatintel/research-hub/campaign-gen', to: '/threatintel/campaigns/generator' },
  { path: '/threatintel/tools/graph', to: '/threatintel/actors/graph' },
  // Tab-hub aliases — same component, different default tab
  { path: '/dfir/domain', to: '/dfir/domain-investigator' },
  { path: '/dfir/domain-rep', to: '/dfir/domain-investigator' },
  { path: '/dfir/webcheck', to: '/dfir/domain-investigator' },
  { path: '/dfir/web-scan', to: '/dfir/domain-investigator' },
  { path: '/dfir/exposure', to: '/dfir/domain-investigator' }, // tab of DomainInvestigator
  { path: '/dfir/full-spectrum', to: '/dfir/domain-investigator' },
  { path: '/dfir/ioc-check', to: '/dfir/ioc-investigate' },
  { path: '/dfir/ioc-pivot', to: '/dfir/ioc-investigate' },
  { path: '/dfir/threat-hunt', to: '/dfir/ioc-investigate' },
  { path: '/dfir/malware-scan', to: '/dfir/malware-analyzer' },
  { path: '/dfir/sample-scan', to: '/dfir/malware-analyzer' },
  { path: '/dfir/malware-capabilities', to: '/dfir/malware-analyzer' },
  { path: '/dfir/sandbox', to: '/dfir/malware-analyzer' },
  { path: '/dfir/yara', to: '/dfir/yara-workbench' },
  { path: '/dfir/rule-playground', to: '/dfir/yara-workbench' },
  { path: '/dfir/stix', to: '/dfir/stix-workbench' },
  { path: '/dfir/stix-builder', to: '/dfir/stix-workbench' },
  { path: '/dfir/taxii', to: '/dfir/stix-workbench' },
  { path: '/dfir/report-ingest', to: '/dfir/stix-workbench' },

  // ── Social Hub ──────────────────────────────────────────────────
  { path: '/threatintel/cybersec', to: '/threatintel/telegram-monitor' },
  { path: '/threatintel/breach', to: '/threatintel/telegram-monitor' },
  { path: '/threatintel/cyber-crime', to: '/threatintel/telegram-monitor' },
  { path: '/threatintel/telegram-watch', to: '/threatintel/telegram-monitor' },
  { path: '/threatintel/telegram-settings', to: '/threatintel/telegram-monitor' },
  { path: '/threatintel/telegram-leaks', to: '/threatintel/telegram-monitor' },
  { path: '/threatintel/telegram-leaks/channels', to: '/threatintel/telegram-monitor' },
  { path: '/threatintel/telegram-leaks/stats', to: '/threatintel/telegram-monitor' },
  { path: '/threatintel/onion-watch', to: '/threatintel/telegram-monitor' },
  { path: '/threatintel/tech-ai-news', to: '/threatintel/catalog?cat=social' },
  { path: '/threatintel/x-watch', to: '/threatintel/social/firehose' },
  { path: '/threatintel/x-live', to: '/threatintel/social/firehose' },
  { path: '/threatintel/x', to: '/threatintel/social/firehose' },
  { path: '/threatintel/reddit', to: '/threatintel/social/firehose' },
  { path: '/threatintel/social/scraped-intel', to: '/threatintel/actors/usernames' }, // tab of ActorUsernameSearch
  { path: '/threatintel/scam-watch', to: '/threatintel/social/crypto-scam' },
  { path: '/threatintel/crypto-scams', to: '/threatintel/social/crypto-scam' },
  { path: '/threatintel/mythreatintel', to: '/threatintel/catalog?cat=social' },
  { path: '/threatintel/status', to: '/threatintel/catalog?cat=social' },

  // ── Telegram subsumed by TelegramMonitor (4 tabs) ─────
  { path: '/threatintel/social/telegram-leaks', to: '/threatintel/telegram-monitor' },
  { path: '/threatintel/social/telegram-stats', to: '/threatintel/telegram-monitor' },
  { path: '/threatintel/social/telegram-channels', to: '/threatintel/telegram-monitor' },
  { path: '/threatintel/social/telegram-settings', to: '/threatintel/telegram-monitor' },
  // ── SocialFirehose subsumes Reddit + X tabs ─────
  { path: '/threatintel/social/reddit', to: '/threatintel/social/firehose' },
  { path: '/threatintel/social/x-firehose', to: '/threatintel/social/firehose' },
  { path: '/threatintel/social/x-live', to: '/threatintel/social/firehose' },
  { path: '/threatintel/social/x-watch', to: '/threatintel/social/firehose' },
  // ── SourceHealth subsumes Feed Status + Reliability ─────
  { path: '/threatintel/feeds/status', to: '/threatintel/source-health' },
  { path: '/threatintel/feeds/reliability', to: '/threatintel/source-health' },
  // ── CveIntel subsumes K8s + Exploitable tabs ─────
  { path: '/threatintel/cves/k8s', to: '/threatintel/cves/cves' },
  { path: '/threatintel/cves/exploitable', to: '/threatintel/cves/cves' },
  // ── Canonical 2-segment hub paths → real page (defensive — direct
  //    `to`/`href` from a component should use the real path; this
  //    redirect exists so external links, bookmarks, and copy-paste
  //    URLs to the short path still land on a real page, not a 404).
  { path: '/threatintel/cves', to: '/threatintel/cves/cves' },
  { path: '/threatintel/social', to: '/threatintel/social/firehose' },
  { path: '/threatintel/supply-chain', to: '/threatintel/external/supply' },

  // ── Dark Web Hub ────────────────────────────────────────────────
  { path: '/threatintel/deepdarkcti', to: '/threatintel/darkweb/deepdark' },
  { path: '/threatintel/re-leaks', to: '/threatintel/darkweb/leaks' },
  { path: '/threatintel/ransomware-map', to: '/threatintel/darkweb/ransom-activity' },
  { path: '/threatintel/ransomware-activity', to: '/threatintel/darkweb/ransom-activity' },
  { path: '/threatintel/ransom-report', to: '/threatintel/darkweb/ransom-activity' },
  { path: '/threatintel/negotiations', to: '/threatintel/darkweb/ransom-activity' },
  { path: '/threatintel/breach-forums', to: '/threatintel/darkweb/forums' },
  { path: '/threatintel/darkweb-tools', to: '/threatintel/darkweb/watch' },

  // ── IOC Hub ─────────────────────────────────────────────────────
  { path: '/threatintel/c2-tracker', to: '/threatintel/iocs/c2' },
  { path: '/threatintel/iocs/soc', to: '/threatintel/soc-dashboard' }, // tab of SocDashboard
  { path: '/threatintel/soc-iocs', to: '/threatintel/iocs/live' },
  { path: '/threatintel/live-iocs', to: '/threatintel/iocs/live' },
  { path: '/threatintel/ioc-enrichment', to: '/threatintel/iocs/enrichment' },
  { path: '/threatintel/entity-resolution', to: '/threatintel/iocs/entity' },
  { path: '/threatintel/threat-map', to: '/threatintel/iocs/map' },
  { path: '/threatintel/threat-feeds', to: '/threatintel/feeds/threatfeeds' },
  { path: '/threatintel/aggregated-feeds', to: '/threatintel/feeds/threatfeeds' },
  { path: '/threatintel/correlation', to: '/threatintel/iocs/cross' },
  { path: '/threatintel/cross-correlate', to: '/threatintel/catalog?cat=iocs' },
  { path: '/threatintel/observable-db', to: '/threatintel/catalog?cat=iocs' },
  { path: '/threatintel/bitwire-blocklist', to: '/threatintel/feeds/threatfeeds' },
  { path: '/threatintel/certstream', to: '/threatintel/iocs/live' },
  { path: '/threatintel/domain-monitor', to: '/threatintel/catalog?cat=iocs' },
  { path: '/threatintel/facilities', to: '/threatintel/catalog?cat=iocs' },
  { path: '/threatintel/pulse', to: '/threatintel/catalog?cat=iocs' },
  { path: '/threatintel/ioc-feeds', to: '/threatintel/feeds/threatfeeds' },

  // ── Feed Hub ────────────────────────────────────────────────────
  { path: '/threatintel/feed-sources', to: '/threatintel/feeds/sources' },
  { path: '/threatintel/feed-quality', to: '/threatintel/feeds/quality' },
  { path: '/threatintel/feed-scheduler', to: '/threatintel/feeds/scheduler' },
  { path: '/threatintel/feed-catalog', to: '/threatintel/feeds/catalog' },
  { path: '/threatintel/collection-slo', to: '/threatintel/feeds/quality' },
  { path: '/threatintel/settings', to: '/threatintel/tools/settings' },

  // ── Predictive / Dashboard Hub ──────────────────────────────────
  { path: '/threatintel/predictions', to: '/threatintel/predictive/predictions' },
  { path: '/threatintel/analyze', to: '/threatintel/predictive/analyze' },
  { path: '/threatintel/observe', to: '/threatintel/predictive/observe' },
  { path: '/threatintel/intel-dashboard', to: '/threatintel/predictive/dashboard' },
  { path: '/threatintel/pir-dashboard', to: '/threatintel/predictive/dashboard' },
  { path: '/threatintel/soc-ransomware', to: '/threatintel/predictive/dashboard' },
  { path: '/threatintel/soc-vulns', to: '/threatintel/predictive/dashboard' },
  { path: '/threatintel/threat-landscape', to: '/threatintel/predictive/dashboard' },
  { path: '/threatintel/metrics', to: '/threatintel/predictive/dashboard' },

  // ── Malware Hub ─────────────────────────────────────────────────
  { path: '/threatintel/malware-iocs', to: '/threatintel/malware/iocs' },
  { path: '/threatintel/malware-vault', to: '/threatintel/malware/vault' },
  { path: '/threatintel/malicious-packages', to: '/threatintel/malware/packages' },
  { path: '/threatintel/malpedia', to: '/threatintel/malware/malpedia' },
  { path: '/threatintel/maltrail', to: '/threatintel/malware/maltrail' },
  { path: '/threatintel/malware-sandbox', to: '/threatintel/malware/sandbox' },

  // ── Detection Hub ───────────────────────────────────────────────
  { path: '/threatintel/rules', to: '/threatintel/detections/detections' },
  { path: '/threatintel/detections', to: '/threatintel/detections/detections' },
  // ── Hub root redirects (catalog-filtered views are the canonical
  //    way to land on a hub; these 2-segment aliases exist for
  //    external links and the in-app components that point at them).
  { path: '/threatintel/actors', to: '/threatintel/catalog?cat=actors' },
  { path: '/threatintel/campaigns', to: '/threatintel/catalog?cat=campaigns' },
  { path: '/threatintel/iocs', to: '/threatintel/catalog?cat=iocs' },
  { path: '/threatintel/darkweb', to: '/threatintel/catalog?cat=darkweb' },
  { path: '/threatintel/feeds', to: '/threatintel/catalog?cat=feeds' },
  { path: '/threatintel/tools', to: '/threatintel/catalog?cat=tools' },
  { path: '/threatintel/wiki', to: '/threatintel/catalog?cat=wiki' },
  { path: '/threatintel/signal', to: '/threatintel/detections/signal' },
  { path: '/threatintel/threatsignal', to: '/threatintel/detections/signal' },
  { path: '/threatintel/yara', to: '/threatintel/detections/yara' },
  { path: '/threatintel/disarm', to: '/threatintel/detections/disarm' },

  // ── Knowledge Hub (wiki + frameworks) ──────────────────────────
  { path: '/threatintel/mitre', to: '/threatintel/wiki/mitre' },
  { path: '/threatintel/owasp-ai-landscape', to: '/threatintel/wiki/owasp' },
  { path: '/threatintel/insider-threat-matrix', to: '/threatintel/wiki/insider' },
  { path: '/threatintel/f3ead', to: '/threatintel/wiki/f3ead' },
  { path: '/threatintel/llm-threat-atlas', to: '/threatintel/wiki/llm' },
  { path: '/threatintel/atlas', to: '/threatintel/catalog?cat=wiki' },

  // ── Tools Hub ───────────────────────────────────────────────────
  { path: '/threatintel/copilot', to: '/threatintel/tools/copilot' },
  { path: '/threatintel/copilot-chat', to: '/threatintel/tools/copilot' },
  { path: '/threatintel/mcp-search', to: '/threatintel/tools/mcp' },
  { path: '/threatintel/misp-browser', to: '/threatintel/tools/misp' },
  { path: '/threatintel/investigations', to: '/threatintel/tools/investigations' },
  { path: '/threatintel/watches', to: '/threatintel/tools/watches' },
  { path: '/threatintel/relationship-graph', to: '/threatintel/actors/graph' },
  { path: '/threatintel/search', to: '/threatintel/catalog?cat=tools' },
  { path: '/threatintel/campaign-generator', to: '/threatintel/catalog?cat=tools' },
  { path: '/threatintel/ach', to: '/threatintel/catalog?cat=tools' },
  { path: '/threatintel/stix-bundles', to: '/threatintel/tools/stix' },
  { path: '/threatintel/source-reliability', to: '/threatintel/catalog?cat=tools' },

  // ── External Hub ────────────────────────────────────────────────
  { path: '/threatintel/external-resources', to: '/threatintel/external/external' },
  { path: '/threatintel/awesome-lists', to: '/threatintel/external/awesome' },
  { path: '/threatintel/projectdiscovery', to: '/threatintel/catalog?cat=external' },

  // ── Research Hub ────────────────────────────────────────────────
  { path: '/threatintel/research', to: '/threatintel/research-hub/research' },
  { path: '/threatintel/redhunt-labs', to: '/threatintel/research-hub/redhunt-labs' },
  { path: '/threatintel/redhunt-insights', to: '/threatintel/research-hub/redhunt' },
  { path: '/threatintel/ai-report', to: '/threatintel/research-hub/ai' },
  { path: '/threatintel/writeups', to: '/threatintel/research-hub/writeups' },
  { path: '/threatintel/reports', to: '/threatintel/research-hub/reports' },

  // ── OSINT Hub ───────────────────────────────────────────────────
  { path: '/threatintel/osint-framework', to: '/threatintel/osint/framework' },
  { path: '/threatintel/osint-map', to: '/threatintel/osint/map' },
  { path: '/threatintel/curated-toolbox', to: '/threatintel/osint/toolbox' },
  { path: '/threatintel/secops-tools', to: '/threatintel/osint/secops' },
  { path: '/threatintel/osint-cli-tools', to: '/threatintel/osint/cli' },
  { path: '/threatintel/cve-resources', to: '/threatintel/catalog?cat=cves' },
  { path: '/threatintel/cve-list', to: '/threatintel/cves/cves' },
  { path: '/threatintel/cves/list', to: '/threatintel/cves/cves' }, // tab of CveIntel

  // ── Actor Hub ──────────────────────────────────────────────────
  { path: '/threatintel/actor-kb', to: '/threatintel/catalog?cat=actors' },
  { path: '/threatintel/actors/kb', to: '/threatintel/actors/directory' }, // tab of ActorDirectory
  { path: '/threatintel/actor-dna', to: '/threatintel/catalog?cat=actors' },
  { path: '/threatintel/actor-timeline', to: '/threatintel/actors/timeline' },
  { path: '/threatintel/actor-usernames', to: '/threatintel/actors/usernames' },
  { path: '/threatintel/threat-actor-catalog', to: '/threatintel/catalog?cat=actors' },
  { path: '/threatintel/threat-actor-db', to: '/threatintel/catalog?cat=actors' },
  { path: '/threatintel/intelligence-gaps', to: '/threatintel/catalog?cat=actors' },

  // ── Campaign Hub ───────────────────────────────────────────────
  { path: '/threatintel/campaign-lifecycle', to: '/threatintel/campaigns/lifecycle' },
  { path: '/threatintel/attribution', to: '/threatintel/actors/attribution' },
  { path: '/threatintel/cross-campaign', to: '/threatintel/campaigns/cross' },

  // ── Phishing Hub ────────────────────────────────────────────────
  { path: '/threatintel/phishing-wordlists', to: '/threatintel/phishing/urls' },

  // ── Assessments ─────────────────────────────────────────────────
  { path: '/threatintel/assessments', to: '/threatintel/predictive/assessments' },
  // ── Pre-existing drill routes (prerendered in scripts/prerender.mjs) ───
  { path: '/dfir/detection-lab', to: '/dfir/rule-converter' },
  { path: '/dfir/dashboard', to: '/dfir' },
  { path: '/dfir/atlas', to: '/threatintel/wiki/llm' },
  { path: '/threatintel/infostealer', to: '/threatintel/catalog?cat=malware' },
  { path: '/copilot', to: '/threatintel/tools/copilot' },
];

export function AppContent() {
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();

  // /dfir/* and /threatintel/* are stand-alone web apps hosted next to the
  // portfolio. They get their own app-shell chrome and skip the portfolio
  // Header / Footer / background-gradient layer entirely. This is the
  // single most-important "feel" toggle on the site — sub-pages of those
  // two routes should not look like sub-pages of someone's portfolio.
  const appMode: 'dfir' | 'threatintel' | 'radar' | null = location.pathname.startsWith('/dfir')
    ? 'dfir'
    : location.pathname.startsWith('/threatintel')
      ? 'threatintel'
      : location.pathname.startsWith('/radar')
        ? 'radar'
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
        {ROUTES.map(({ path, Component, eager }) => (
          <Route
            key={path}
            path={path}
            element={
              eager ? (
                <Component />
              ) : (
                <LazyRoute>
                  <Component />
                </LazyRoute>
              )
            }
          />
        ))}
        {REDIRECTS.map(({ path, to }) => (
          <Route key={path} path={path} element={<Navigate to={to} replace />} />
        ))}
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
        <McpProvider>
          <AppShell mode={appMode} isDark={isDark} onToggleTheme={toggleTheme}>
            {routes}
          </AppShell>
        </McpProvider>
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
      <McpProvider>
        <Header isDark={isDark} onToggleTheme={toggleTheme} navLinks={navLinks} topBarExtra={<McpKeyBar />} />
      </McpProvider>
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
      <FeaturesProvider>
        <AppContent />
      </FeaturesProvider>
    </BrowserRouter>
  );
}

export default App;
