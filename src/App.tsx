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
const HostGraph = lazy(() => import('./pages/dfir/HostGraph'));
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
const GlobalPulse = lazy(() => import('./pages/threatintel/GlobalPulse'));
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
const AttackNavigator = lazy(() => import('./pages/dfir/AttackNavigator'));
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
const AgentInvestigator = lazy(() => import('./pages/dfir/AgentInvestigator'));
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
const SampleScan = lazy(() => import('./pages/dfir/SampleScan'));

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
const ExploitableCves = lazy(() => import('./pages/threatintel/ExploitableCves'));
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
const CryptoScamFeedPage = lazy(() => import('./pages/threatintel/CryptoScamFeed'));
const ActorUsernamesPage = lazy(() => import('./pages/threatintel/ActorUsernames'));
const PhishingWordlistsPage = lazy(() => import('./pages/threatintel/PhishingWordlists'));
const ProjectDiscoveryPage = lazy(() => import('./pages/threatintel/ProjectDiscovery'));
const RansomReportPage = lazy(() => import('./pages/threatintel/RansomReport'));
const AbuseRepPage = lazy(() => import('./pages/dfir/AbuseRep'));
const XFirehosePage = lazy(() => import('./pages/threatintel/XFirehose'));
const FeedStatusPage = lazy(() => import('./pages/threatintel/FeedStatus'));
const MetricsPage = lazy(() => import('./pages/threatintel/Metrics'));
const SocRansomware = lazy(() => import('./pages/threatintel/SocRansomware'));
const SocVulns = lazy(() => import('./pages/threatintel/SocVulns'));
const SocIocs = lazy(() => import('./pages/threatintel/SocIocs'));
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
const FeedQuality = lazy(() => import('./pages/threatintel/FeedQuality'));
const AssessmentDetail = lazy(() => import('./pages/threatintel/AssessmentDetail'));
const EntityResolution = lazy(() => import('./pages/threatintel/EntityResolution'));
const Webamon = lazy(() => import('./pages/threatintel/Webamon'));
const AggregatedFeeds = lazy(() => import('./pages/threatintel/AggregatedFeeds'));
const MalwareIocs = lazy(() => import('./pages/threatintel/MalwareIocs'));
const FeedCatalog = lazy(() => import('./pages/threatintel/FeedCatalog'));
const Analyze = lazy(() => import('./pages/threatintel/Analyze'));
const Yarahub = lazy(() => import('./pages/threatintel/Yarahub'));
const Investigations = lazy(() => import('./pages/threatintel/Investigations'));
const FeedScheduler = lazy(() => import('./pages/threatintel/FeedScheduler'));
const ObservableDb = lazy(() => import('./pages/threatintel/ObservableDb'));
const MalwareVault = lazy(() => import('./pages/threatintel/MalwareVault'));
const SecretLeaks = lazy(() => import('./pages/threatintel/SecretLeaks'));
const ExportHub = lazy(() => import('./pages/dfir/ExportHub'));

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
  { path: '/copilot', Component: CopilotPage },
  { path: '/blog', Component: Blog },
  { path: '/blog/c/:type', Component: Blog },
  { path: '/blog/:slug', Component: BlogPost },
  { path: '/dfir', Component: DFIR },
  { path: '/dfir/ioc-check', Component: IocCheck },
  { path: '/dfir/abuse-rep', Component: AbuseRepPage },
  { path: '/dfir/phishing', Component: Phishing },
  { path: '/dfir/threat-hunt', Component: ThreatHunt },
  { path: '/dfir/domain', Component: Domain },
  { path: '/dfir/domain-rep', Component: DomainReputation },
  { path: '/dfir/whois-history', Component: WhoisHistory },
  { path: '/dfir/open-directory', Component: OpenDirectory },
  { path: '/dfir/full-spectrum', Component: FullSpectrum },
  { path: '/dfir/exposure', Component: Exposure },
  { path: '/dfir/asset-intel', Component: AssetIntel },
  { path: '/dfir/file', Component: DfirFileRedirect, eager: true },
  { path: '/threatintel/pulse', Component: ThreatPulse },
  { path: '/threatintel/wiki', Component: Wiki },
  { path: '/threatintel/wiki/:slug', Component: WikiArticle },
  { path: '/dfir/dashboard', Component: Dashboard },
  { path: '/threatintel/actor-kb', Component: ActorKb },
  { path: '/threatintel/actor-dna', Component: ActorDNA },
  { path: '/threatintel/predictive', Component: PredictiveIntel },
  { path: '/threatintel/insider-threat-matrix', Component: InsiderThreatMatrix },
  { path: '/threatintel/campaign-lifecycle', Component: CampaignLifecycle },
  { path: '/threatintel/attribution', Component: AttributionFramework },
  { path: '/threatintel/cross-campaign', Component: CrossCampaignCorrelation },
  { path: '/threatintel/actors', Component: Actors },
  { path: '/threatintel/actors/:slug', Component: ActorDetail },
  { path: '/dfir/privacy', Component: Privacy },
  { path: '/threatintel/briefings', Component: Briefings },
  { path: '/threatintel/briefings/:slug', Component: BriefingDetail },
  { path: '/dfir/cve', Component: Cve },
  { path: '/dfir/decode', Component: Decode },
  { path: '/dfir/encoder', Component: Encoder },
  { path: '/dfir/cert-search', Component: CertSearch },
  { path: '/dfir/atlas', Component: AtlasMatrix },
  { path: '/threatintel/atlas', Component: AtlasMatrix },
  { path: '/dfir/asn', Component: AsnLookup },
  { path: '/dfir/host-graph', Component: HostGraph },
  { path: '/dfir/breach', Component: Breach },
  { path: '/dfir/exif', Component: ExifParse },
  { path: '/threatintel/mitre', Component: MitreMatrix },
  { path: '/dfir/url-preview', Component: UrlPreview },
  { path: '/dfir/extract', Component: IocExtractor },
  { path: '/dfir/ioc-pivot', Component: IocPivot },
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
  { path: '/dfir/secret-scan', Component: SecretScanner },
  { path: '/dfir/graphql-audit', Component: GraphqlAuditor },
  { path: '/dfir/osv-scan', Component: OsvScanner },
  { path: '/dfir/punycode', Component: Punycode },
  { path: '/dfir/takeover', Component: Takeover },
  { path: '/dfir/stix', Component: StixViewer },
  { path: '/dfir/stix-builder', Component: StixBuilder },
  { path: '/dfir/stix-builder/b/:bundleId', Component: StixBuilder },
  { path: '/threatintel/darkweb', Component: DarkWeb },
  { path: '/threatintel/ransomware-activity', Component: RansomwareActivityPage },
  { path: '/threatintel/ransomware-map', Component: RansomwareGeoMap },
  { path: '/threatintel/certstream', Component: CertStreamLive },
  { path: '/threatintel/campaign-generator', Component: CampaignGenerator },
  { path: '/threatintel/campaigns', Component: Campaigns },
  { path: '/threatintel/campaigns/:id', Component: CampaignDetail },
  { path: '/threatintel/malicious-packages', Component: MaliciousPackages },
  { path: '/threatintel/x-watch', Component: XWatch },
  { path: '/threatintel/x-live', Component: XLive },
  { path: '/threatintel/mythreatintel', Component: MyThreatIntelPage },
  { path: '/threatintel/cybersec', Component: CybersecTelegramPage },
  { path: '/threatintel/telegram-leaks', Component: TelegramLeaksPage },
  { path: '/threatintel/telegram-leaks/stats', Component: TelegramLeakStatsPage },
  { path: '/threatintel/intel-dashboard', Component: IntelDashboardPage },
  { path: '/threatintel/source-reliability', Component: SourceReliability },
  { path: '/threatintel/collection-slo', Component: CollectionSlo },
  { path: '/threatintel/pir-dashboard', Component: PirDashboard },
  { path: '/threatintel/telegram-leaks/channels', Component: TelegramDiscoveredChannelsPage },
  { path: '/threatintel/breach', Component: BreachDisclosuresPage },
  { path: '/threatintel/reddit', Component: RedditFirehosePage },
  { path: '/threatintel/crypto-scams', Component: CryptoScamFeedPage },
  { path: '/threatintel/actor-usernames', Component: ActorUsernamesPage },
  { path: '/threatintel/phishing-wordlists', Component: PhishingWordlistsPage },
  { path: '/threatintel/projectdiscovery', Component: ProjectDiscoveryPage },
  { path: '/threatintel/ransom-report', Component: RansomReportPage },
  { path: '/threatintel/x', Component: XFirehosePage },
  { path: '/threatintel/status', Component: FeedStatusPage },
  { path: '/threatintel/metrics', Component: MetricsPage },
  { path: '/threatintel/soc-ransomware', Component: SocRansomware },
  { path: '/threatintel/soc-vulns', Component: SocVulns },
  { path: '/threatintel/soc-iocs', Component: SocIocs },
  { path: '/threatintel/correlation', Component: IocCorrelationPage },
  { path: '/threatintel/actor-timeline', Component: ActorTimelinePage },
  { path: '/threatintel/re-leaks', Component: VictimReleaksPage },
  { path: '/threatintel/live-iocs', Component: LiveIocsPage },
  { path: '/threatintel/detections', Component: DetectionsPage },
  { path: '/threatintel/cyber-crime', Component: CyberCrimePage },
  { path: '/threatintel/c2-tracker', Component: C2TrackerPage },
  { path: '/threatintel/writeups', Component: Writeups },
  { path: '/threatintel/signal', Component: ResearchSignal },
  { path: '/threatintel/research', Component: ResearchIndex },
  { path: '/threatintel/research/:slug', Component: ResearchPostPage },
  { path: '/threatintel/cve-list', Component: CveList },
  { path: '/threatintel/exploitable-cves', Component: ExploitableCves },
  { path: '/threatintel/threat-map', Component: ThreatMap },
  { path: '/threatintel/global-pulse', Component: GlobalPulse },
  { path: '/threatintel/cti-platform', Component: GlobalPulse },
  { path: '/threatintel/rules', Component: Rules },
  { path: '/threatintel/deepdarkcti', Component: DeepDarkCTI },
  { path: '/threatintel/ransomware-live', Component: RansomwareLive },
  { path: '/threatintel/infostealer', Component: Infostealer },
  { path: '/threatintel/infostealer/:slug', Component: InfostealerDetail },
  { path: '/threatintel/feed-sources', Component: FeedSources },
  { path: '/threatintel/settings', Component: SettingsPage },
  { path: '/threatintel/negotiations', Component: Negotiations },
  { path: '/threatintel/maltrail', Component: MaltrailTrails },
  { path: '/threatintel/malpedia', Component: MalpediaPage },
  { path: '/threatintel/breach-forums', Component: BreachForums },
  { path: '/dfir/owasp', Component: Owasp },
  { path: '/dfir/prompt-injection', Component: PromptInjection },
  { path: '/dfir/mcp-audit', Component: McpAudit },
  { path: '/dfir/kill-chain', Component: KillChain },
  { path: '/dfir/diamond', Component: Diamond },
  { path: '/dfir/lolbins', Component: Lolbins },
  { path: '/dfir/rule-playground', Component: RulePlayground },
  { path: '/dfir/yara', Component: YaraManager },
  { path: '/dfir/report-parser', Component: ReportParser },
  { path: '/dfir/ioc-lifecycle', Component: IocLifecycle },
  { path: '/dfir/ct-monitor', Component: CtMonitor },
  { path: '/dfir/stealer-parser', Component: StealerParser },
  { path: '/dfir/taxii', Component: TaxiiServer },
  { path: '/dfir/bloom', Component: BloomFilter },
  { path: '/dfir/ai-rule-generator', Component: AiRuleGenerator },
  { path: '/dfir/threat-graph', Component: ThreatGraph },
  { path: '/dfir/attack-chain', Component: AttackChain },
  { path: '/dfir/attack-navigator', Component: AttackNavigator },
  { path: '/dfir/hunting-query-generator', Component: HuntingQueryGenerator },
  { path: '/dfir/sandbox', Component: SandboxIntegration },
  { path: '/dfir/ir-playbooks', Component: IrPlaybooks },
  { path: '/dfir/detection-lab', Component: DetectionLab },
  { path: '/dfir/email-defense', Component: EmailDefense },
  { path: '/dfir/dmarc-analyzer', Component: DmarcAnalyzer },
  { path: '/dfir/nhi', Component: Nhi },
  { path: '/dfir/powershell-deobf', Component: PowershellDeobf },
  { path: '/dfir/agent-map', Component: AgentMap },
  { path: '/dfir/agent', Component: AgentInvestigator },
  { path: '/threatintel/agent', Component: AgentInvestigator },
  { path: '/dfir/tabletop', Component: Tabletop },
  { path: '/dfir/grc', Component: Grc },
  { path: '/dfir/dlp-scan', Component: DlpScan },
  { path: '/dfir/data-classification', Component: DataClassification },
  { path: '/dfir/privacy-hub', Component: PrivacyHub },
  { path: '/dfir/username', Component: UsernamePivot },
  { path: '/dfir/identity-lookup', Component: IdentityLookup },
  { path: '/dfir/wayback', Component: Wayback },
  { path: '/dfir/ip-geo', Component: IpGeo },
  { path: '/dfir/log-parser', Component: LogParser },
  { path: '/dfir/socmint', Component: Socmint },
  { path: '/threatintel/osint-framework', Component: OsintFramework },
  { path: '/threatintel/secops-tools', Component: SecopsCatalog },
  { path: '/dfir/tools/about', Component: ToolsAbout },
  { path: '/dfir/tools/:group', Component: ToolsCategory },
  { path: '/dfir/timestamp', Component: TimestampConverter },
  { path: '/dfir/hash-calc', Component: HashCalculator },
  { path: '/dfir/dork-builder', Component: DorkBuilder },
  { path: '/dfir/brand-impersonation', Component: BrandImpersonation },
  { path: '/dfir/image-fingerprint', Component: ImageFingerprint },
  { path: '/dfir/plist-protobuf', Component: PlistProtobuf },
  { path: '/dfir/pcap-triage', Component: PcapTriage },
  { path: '/dfir/registry-hive', Component: RegistryHive },
  { path: '/dfir/evtx', Component: EvtxParser },
  { path: '/dfir/sqlite', Component: SqliteExplorer },
  { path: '/dfir/ios-backup', Component: IosBackupExplorer },
  { path: '/dfir/screenshot-intel', Component: ScreenshotIntel },
  { path: '/dfir/mobile-sqlite', Component: SqliteExplorer },
  { path: '/dfir/apk-analyzer', Component: ApkAnalyzer },
  { path: '/dfir/pe', Component: PeAnalyzer },
  { path: '/dfir/web-log', Component: WebLogAnalyzer },
  { path: '/dfir/prefetch', Component: PrefetchAnalyzer },
  { path: '/threatintel/cve-resources', Component: CveResourcesCatalog },
  { path: '/dfir/web-scan', Component: WebScan },
  { path: '/dfir/malware-scan', Component: MalwareScan },
  { path: '/dfir/sample-scan', Component: SampleScan },

  { path: '/dfir/reverse-image', Component: ReverseImage },
  { path: '/dfir/eml', Component: EmlExtractor },
  { path: '/dfir/url-rep', Component: UrlReputation },
  { path: '/dfir/email-rep', Component: EmailReputation },
  { path: '/threatintel/domain-monitor', Component: DomainMonitor },
  { path: '/threatintel/watches', Component: WatchesPage },
  { path: '/threatintel/copilot', Component: CopilotPage },
  { path: '/threatintel/scam-watch', Component: ScamWatch },
  { path: '/dfir/crypto-trace', Component: CryptoTrace },
  { path: '/threatintel/tech-ai-news', Component: TechAiNews },
  { path: '/threatintel/threat-feeds', Component: ThreatFeeds },
  { path: '/threatintel/onion-watch', Component: OnionWatch },
  { path: '/threatintel/telegram-watch', Component: TelegramWatch },
  { path: '/threatintel/telegram-settings', Component: TelegramSettings },
  { path: '/threatintel/awesome-lists', Component: AwesomeLists },
  { path: '/threatintel/external-resources', Component: ExternalResources },
  { path: '/threatintel/darkweb-tools', Component: DarkWebOsintTools },
  { path: '/threatintel/aggregated-feeds', Component: AggregatedFeeds },
  { path: '/threatintel/malware-iocs', Component: MalwareIocs },
  { path: '/threatintel/feed-catalog', Component: FeedCatalog },
  { path: '/threatintel/analyze', Component: Analyze },
  { path: '/threatintel/yara', Component: Yarahub },
  { path: '/threatintel/investigations', Component: Investigations },
  { path: '/threatintel/feed-scheduler', Component: FeedScheduler },
  { path: '/threatintel/observable-db', Component: ObservableDb },
  { path: '/threatintel/malware-vault', Component: MalwareVault },
  { path: '/threatintel/secret-leaks', Component: SecretLeaks },
  { path: '/threatintel/about', Component: ThreatIntelAbout },
  { path: '/threatintel/c/:cat', Component: ThreatIntelHome },
  { path: '/threatintel', Component: ThreatIntelHome },
  { path: '/threatintel/misp-browser', Component: MispBrowser },
  { path: '/threatintel/search', Component: UnifiedSearch },
  { path: '/threatintel/ioc-enrichment', Component: IocEnrichment },
  { path: '/threatintel/relationship-graph', Component: RelationshipGraph },
  { path: '/threatintel/ach', Component: ACH },
  { path: '/threatintel/cross-correlate', Component: CrossCorrelate },
  { path: '/threatintel/assessments', Component: Assessments },
  { path: '/threatintel/assessments/:id', Component: AssessmentDetail },
  { path: '/threatintel/feed-quality', Component: FeedQuality },
  { path: '/threatintel/entity-resolution', Component: EntityResolution },
  { path: '/threatintel/webamon', Component: Webamon },
  { path: '/dfir/pgp-tool', Component: PgpTool },
  { path: '/dfir/tor-gateway', Component: TorGateway },
  { path: '/dfir/blocklists', Component: Blocklists },
  // ── 24 Gap Features ──────────────────────────────────────────────
  { path: '/dfir/export-hub', Component: ExportHub },
  { path: '/admin', Component: AdminApp },
];

/** Legacy / renamed paths preserved as redirects so in-flight links don't 404. */
const REDIRECTS: ReadonlyArray<{ path: string; to: string }> = [
  { path: '/dfir/host', to: '/dfir/asset-intel' },
  { path: '/threatintel/intelligence-gaps', to: '/threatintel/status' },
  { path: '/dfir/sigma-convert', to: '/dfir/rule-converter' },
  { path: '/threatintel/mti', to: '/threatintel/mythreatintel' },
  { path: '/threatintel/urls', to: '/threatintel/live-iocs' },
  { path: '/threatintel/domains', to: '/threatintel/live-iocs' },
  { path: '/threatintel/hashs', to: '/threatintel/live-iocs' },
  { path: '/threatintel/malicious-urls', to: '/threatintel/live-iocs' },
  { path: '/threatintel/iocs-by-type', to: '/threatintel/live-iocs' },
  { path: '/threatintel/phishing-urls', to: '/threatintel/live-iocs' },
  { path: '/threatintel/malware-samples', to: '/threatintel/live-iocs' },
  { path: '/threatintel/ransom-library', to: '/threatintel' },
  { path: '/threatintel/webamon/sandbox', to: '/threatintel/webamon' },
  { path: '/threatintel/webamon/infra', to: '/threatintel/webamon' },
  { path: '/dfir/discord-watch', to: '/threatintel/awesome-lists' },
  { path: '/dfir/industry-news', to: '/threatintel/tech-ai-news' },
  { path: '/difr', to: '/dfir' },
];

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
      <FeaturesProvider>
        <AppContent />
      </FeaturesProvider>
    </BrowserRouter>
  );
}

export default App;
