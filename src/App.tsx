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
const Projects = lazy(() => import('./pages/Projects'));
const CaseStudy = lazy(() => import('./pages/CaseStudy'));
const ResearchPostPage = lazy(() => import('./pages/threatintel/ResearchPost'));
const DFIR = lazy(() => import('./pages/DFIR'));

const IocCheck = lazy(() => import('./pages/dfir/IocCheck'));
const Phishing = lazy(() => import('./pages/dfir/Phishing'));
const Domain = lazy(() => import('./pages/dfir/Domain'));
const DomainWebcheck = lazy(() => import('./pages/dfir/DomainWebcheck'));
const FullSpectrum = lazy(() => import('./pages/dfir/FullSpectrum'));
const Exposure = lazy(() => import('./pages/dfir/Exposure'));
const AssetIntel = lazy(() => import('./pages/dfir/AssetIntel'));
const WikiArticle = lazy(() => import('./pages/dfir/WikiArticle'));
const Dashboard = lazy(() => import('./pages/dfir/Dashboard'));
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
const StixViewer = lazy(() => import('./pages/dfir/StixViewer'));
const StixBuilder = lazy(() => import('./pages/dfir/StixBuilder'));
const Owasp = lazy(() => import('./pages/dfir/Owasp'));
const PromptInjection = lazy(() => import('./pages/dfir/PromptInjection'));
const McpAudit = lazy(() => import('./pages/dfir/McpAudit'));
const KillChain = lazy(() => import('./pages/dfir/KillChain'));
const Diamond = lazy(() => import('./pages/dfir/Diamond'));
const Lolbins = lazy(() => import('./pages/dfir/Lolbins'));
const RulePlayground = lazy(() => import('./pages/dfir/RulePlayground'));
const YaraManager = lazy(() => import('./pages/dfir/YaraManager'));
const ReportAnalyzer = lazy(() => import('./pages/dfir/ReportAnalyzer'));
const ReportIngest = lazy(() => import('./pages/dfir/ReportIngest'));
const IocLifecycle = lazy(() => import('./pages/dfir/IocLifecycle'));
const CtMonitor = lazy(() => import('./pages/dfir/CtMonitor'));
const StealerParser = lazy(() => import('./pages/dfir/StealerParser'));
const TaxiiServer = lazy(() => import('./pages/dfir/TaxiiServer'));
const BloomFilter = lazy(() => import('./pages/dfir/BloomFilter'));
const AiRuleGenerator = lazy(() => import('./pages/dfir/AiRuleGenerator'));
const FpLens = lazy(() => import('./pages/dfir/FpLens'));
const ThreatGraph = lazy(() => import('./pages/dfir/ThreatGraph'));
const AttackChain = lazy(() => import('./pages/dfir/AttackChain'));
const AttackNavigator = lazy(() => import('./pages/dfir/AttackNavigator'));
const HuntingQueryGenerator = lazy(() => import('./pages/dfir/HuntingQueryGenerator'));
const SandboxIntegration = lazy(() => import('./pages/dfir/SandboxIntegration'));
const IrPlaybooks = lazy(() => import('./pages/dfir/IrPlaybooks'));
const EmailDefense = lazy(() => import('./pages/dfir/EmailDefense'));
const Nhi = lazy(() => import('./pages/dfir/Nhi'));
const Pivex = lazy(() => import('./pages/dfir/Pivex'));
const Tracepulse = lazy(() => import('./pages/dfir/Tracepulse'));
const Quicktrace = lazy(() => import('./pages/dfir/Quicktrace'));
const PowershellDeobf = lazy(() => import('./pages/dfir/PowershellDeobf'));
const AgentMap = lazy(() => import('./pages/dfir/AgentMap'));
const Tabletop = lazy(() => import('./pages/dfir/Tabletop'));
const Grc = lazy(() => import('./pages/dfir/Grc'));
const DlpScan = lazy(() => import('./pages/dfir/DlpScan'));
const DataClassification = lazy(() => import('./pages/dfir/DataClassification'));
const PrivacyHub = lazy(() => import('./pages/dfir/PrivacyHub'));
const PersonalSecurity = lazy(() => import('./pages/dfir/PersonalSecurity'));
const UsernameInvestigator = lazy(() => import('./pages/dfir/UsernameInvestigator'));
const DomainInvestigator = lazy(() => import('./pages/dfir/DomainInvestigator'));
const MalwareAnalyzer = lazy(() => import('./pages/dfir/MalwareAnalyzer'));
const VulnToolkitCatalog = lazy(() => import('./pages/dfir/VulnToolkitCatalog'));
const WeatherOsint = lazy(() => import('./pages/dfir/WeatherOsint'));
const IocInvestigate = lazy(() => import('./pages/dfir/IocInvestigate'));
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
const WebScan = lazy(() => import('./pages/dfir/WebScan'));
const MalwareScan = lazy(() => import('./pages/dfir/MalwareScan'));
const MalwareCapabilities = lazy(() => import('./pages/dfir/MalwareCapabilities'));
const SampleScan = lazy(() => import('./pages/dfir/SampleScan'));

const InsightAi = lazy(() => import('./pages/dfir/InsightAi'));
const QuerycraftAi = lazy(() => import('./pages/dfir/QuerycraftAi'));
const ChronoAi = lazy(() => import('./pages/dfir/ChronoAi'));
const MalbriefAi = lazy(() => import('./pages/dfir/MalbriefAi'));
const VerdiktAi = lazy(() => import('./pages/dfir/VerdiktAi'));
const ReverseImage = lazy(() => import('./pages/dfir/ReverseImage'));
const EmlExtractor = lazy(() => import('./pages/dfir/EmlExtractor'));
const Tracer = lazy(() => import('./pages/dfir/Tracer'));
const ThreatIntelHome = lazy(() => import('./pages/threatintel/Home'));
const ThreatIntelAbout = lazy(() => import('./pages/threatintel/About'));
const LiveCenter = lazy(() => import('./pages/threatintel/LiveCenter'));
const TelegramMonitor = lazy(() => import('./pages/threatintel/TelegramMonitor'));
const SourceHealth = lazy(() => import('./pages/threatintel/SourceHealth'));
const SocDashboard = lazy(() => import('./pages/threatintel/SocDashboard'));
const ActorHub = lazy(() => import('./pages/threatintel/ActorHub'));
const CampaignHub = lazy(() => import('./pages/threatintel/CampaignHub'));
const VulnHub = lazy(() => import('./pages/threatintel/VulnHub'));
const IocHub = lazy(() => import('./pages/threatintel/IocHub'));
const DarkwebHub = lazy(() => import('./pages/threatintel/DarkwebHub'));
const MalwareHub = lazy(() => import('./pages/threatintel/MalwareHub'));
const FeedHub = lazy(() => import('./pages/threatintel/FeedHub'));
const SocialHub = lazy(() => import('./pages/threatintel/SocialHub'));
const EmailPhishHub = lazy(() => import('./pages/threatintel/EmailPhishHub'));
const InfraHub = lazy(() => import('./pages/threatintel/InfraHub'));
const DetectionHub = lazy(() => import('./pages/threatintel/DetectionHub'));
const MostWanted = lazy(() => import('./pages/threatintel/MostWanted'));
const ResearchHub = lazy(() => import('./pages/threatintel/ResearchHub'));
const KnowledgeHub = lazy(() => import('./pages/threatintel/KnowledgeHub'));
const OsintHub = lazy(() => import('./pages/threatintel/OsintHub'));
const DashboardHub = lazy(() => import('./pages/threatintel/DashboardHub'));
const ToolsHub = lazy(() => import('./pages/threatintel/ToolsHub'));
const ExternalHub = lazy(() => import('./pages/threatintel/ExternalHub'));
const NotFound = lazy(() => import('./pages/NotFound'));
const CampaignDetail = lazy(() => import('./pages/threatintel/CampaignDetail'));
const AbuseRepPage = lazy(() => import('./pages/dfir/AbuseRep'));
const BehindTheReports = lazy(() => import('./pages/BehindTheReports'));
const Sponsor = lazy(() => import('./pages/Sponsor'));
const Blog = lazy(() => import('./pages/Blog'));
const BlogPost = lazy(() => import('./pages/BlogPost'));
const AdminApp = lazy(() => import('./pages/admin/AdminApp'));
const RansomwareLive = lazy(() => import('./pages/threatintel/RansomwareLive'));
const UrlReputation = lazy(() => import('./pages/dfir/UrlReputation'));
const DomainReputation = lazy(() => import('./pages/dfir/DomainReputation'));
const WhoisHistory = lazy(() => import('./pages/dfir/WhoisHistory'));
const OpenDirectory = lazy(() => import('./pages/dfir/OpenDirectory'));
const ApkAnalyzer = lazy(() => import('./pages/dfir/ApkAnalyzer'));
const PgpTool = lazy(() => import('./pages/dfir/PgpTool'));
const TorGateway = lazy(() => import('./pages/dfir/TorGateway'));
const EmailReputation = lazy(() => import('./pages/dfir/EmailReputation'));
const PhishOps = lazy(() => import('./pages/dfir/PhishOps'));
const PhishBook = lazy(() => import('./pages/dfir/PhishBook'));
const H3adLearn = lazy(() => import('./pages/threatintel/H3adLearn'));
// (removed LiveFeedsPage and MyDashboardPage)
const InfostealerDetail = lazy(() => import('./pages/threatintel/InfostealerDetail'));
const DmarcAnalyzer = lazy(() => import('./pages/dfir/DmarcAnalyzer'));
const ThreatHunt = lazy(() => import('./pages/dfir/ThreatHunt'));
const AssessmentDetail = lazy(() => import('./pages/threatintel/AssessmentDetail'));
const ExportHub = lazy(() => import('./pages/dfir/ExportHub'));
const MultiSearch = lazy(() => import('./pages/dfir/MultiSearch'));
const ReportComposer = lazy(() => import('./pages/dfir/ReportComposer'));

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
  { path: '/dfir', Component: DFIR },
  { path: '/dfir/ioc-check', Component: IocCheck },
  { path: '/dfir/abuse-rep', Component: AbuseRepPage },
  { path: '/dfir/phishing', Component: Phishing },
  { path: '/dfir/threat-hunt', Component: ThreatHunt },
  { path: '/dfir/domain', Component: Domain },
  { path: '/dfir/webcheck', Component: DomainWebcheck },
  { path: '/dfir/domain-rep', Component: DomainReputation },
  { path: '/dfir/whois-history', Component: WhoisHistory },
  { path: '/dfir/open-directory', Component: OpenDirectory },
  { path: '/dfir/full-spectrum', Component: FullSpectrum },
  { path: '/dfir/exposure', Component: Exposure },
  { path: '/dfir/exposed-host', Component: ExposedHostPage },
  { path: '/dfir/asset-intel', Component: AssetIntel },
  { path: '/dfir/file', Component: DfirFileRedirect, eager: true },
  { path: '/threatintel/wiki', Component: KnowledgeHub },
  { path: '/threatintel/wiki/:slug', Component: WikiArticle },
  { path: '/dfir/dashboard', Component: Dashboard },
  { path: '/threatintel/predictive', Component: DashboardHub },
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
  { path: '/dfir/report-ingest', Component: StixBuilder },
  { path: '/threatintel/darkweb', Component: DarkwebHub },
  { path: '/threatintel/campaigns/:id', Component: CampaignDetail },
  { path: '/threatintel/telegram-monitor', Component: TelegramMonitor },
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
  { path: '/dfir/rule-playground', Component: RulePlayground },
  { path: '/dfir/yara', Component: YaraManager },
  { path: '/dfir/report-parser', Component: ReportAnalyzer },
  { path: '/dfir/report-ingest', Component: ReportIngest },
  { path: '/dfir/ioc-lifecycle', Component: IocLifecycle },
  { path: '/dfir/ct-monitor', Component: CtMonitor },
  { path: '/dfir/stealer-parser', Component: StealerParser },
  { path: '/dfir/taxii', Component: TaxiiServer },
  { path: '/dfir/bloom', Component: BloomFilter },
  { path: '/dfir/ai-rule-generator', Component: AiRuleGenerator },
  { path: '/dfir/fp-lens', Component: FpLens },
  { path: '/dfir/threat-graph', Component: ThreatGraph },
  { path: '/dfir/attack-chain', Component: AttackChain },
  { path: '/dfir/attack-navigator', Component: AttackNavigator },
  { path: '/dfir/hunting-query-generator', Component: HuntingQueryGenerator },
  { path: '/dfir/sandbox', Component: SandboxIntegration },
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
  { path: '/dfir/tabletop', Component: Tabletop },
  { path: '/dfir/grc', Component: Grc },
  { path: '/dfir/dlp-scan', Component: DlpScan },
  { path: '/dfir/data-classification', Component: DataClassification },
  { path: '/dfir/privacy-hub', Component: PrivacyHub },
  { path: '/dfir/personal-security', Component: PersonalSecurity },
  { path: '/dfir/username-investigator', Component: UsernameInvestigator },
  { path: '/dfir/username', Component: UsernameInvestigator },
  { path: '/dfir/username-osint', Component: UsernameInvestigator },
  { path: '/dfir/identity-lookup', Component: UsernameInvestigator },
  { path: '/dfir/domain-investigator', Component: DomainInvestigator },
  { path: '/dfir/domain', Component: DomainInvestigator },
  { path: '/dfir/domain-rep', Component: DomainInvestigator },
  { path: '/dfir/webcheck', Component: DomainInvestigator },
  { path: '/dfir/web-scan', Component: DomainInvestigator },
  { path: '/dfir/full-spectrum', Component: DomainInvestigator },
  { path: '/dfir/malware-analyzer', Component: MalwareAnalyzer },
  { path: '/dfir/malware-scan', Component: MalwareAnalyzer },
  { path: '/dfir/sample-scan', Component: MalwareAnalyzer },
  { path: '/dfir/malware-capabilities', Component: MalwareAnalyzer },
  { path: '/dfir/sandbox', Component: MalwareAnalyzer },
  { path: '/dfir/ioc-investigate', Component: IocInvestigate },
  { path: '/dfir/ioc-check', Component: IocInvestigate },
  { path: '/dfir/ioc-pivot', Component: IocInvestigate },
  { path: '/dfir/threat-hunt', Component: IocInvestigate },
  { path: '/dfir/yara-workbench', Component: YaraWorkbench },
  { path: '/dfir/yara', Component: YaraWorkbench },
  { path: '/dfir/rule-playground', Component: YaraWorkbench },
  { path: '/dfir/stix-workbench', Component: StixWorkbench },
  { path: '/dfir/stix', Component: StixWorkbench },
  { path: '/dfir/stix-builder', Component: StixWorkbench },
  { path: '/dfir/taxii', Component: StixWorkbench },
  { path: '/dfir/phone-osint', Component: PhoneOsint },
  { path: '/dfir/weather-osint', Component: WeatherOsint },
  { path: '/dfir/wayback', Component: Wayback },
  { path: '/dfir/ip-geo', Component: IpGeo },
  { path: '/dfir/log-parser', Component: LogParser },
  { path: '/dfir/socmint', Component: Socmint },
  { path: '/dfir/tools/about', Component: ToolsAbout },
  { path: '/dfir/tools/:group', Component: ToolsCategory },
  { path: '/dfir/timestamp', Component: TimestampConverter },
  { path: '/dfir/hash-calc', Component: HashCalculator },
  { path: '/dfir/dork-builder', Component: GoogleDorks },
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
  { path: '/dfir/web-scan', Component: WebScan },
  { path: '/dfir/malware-scan', Component: MalwareScan },
  { path: '/dfir/malware-capabilities', Component: MalwareCapabilities },
  { path: '/dfir/sample-scan', Component: SampleScan },
  { path: '/dfir/insight-ai', Component: InsightAi },
  { path: '/dfir/querycraft-ai', Component: QuerycraftAi },
  { path: '/dfir/chrono-ai', Component: ChronoAi },
  { path: '/dfir/malbrief-ai', Component: MalbriefAi },
  { path: '/dfir/verdikt-ai', Component: VerdiktAi },

  { path: '/dfir/reverse-image', Component: ReverseImage },
  { path: '/dfir/eml', Component: EmlExtractor },
  { path: '/dfir/url-rep', Component: UrlReputation },
  { path: '/dfir/email-rep', Component: EmailReputation },
  { path: '/dfir/crypto-trace', Component: Tracer },
  { path: '/dfir/tracer', Component: Tracer },
  { path: '/threatintel/about', Component: ThreatIntelAbout },
  { path: '/threatintel/c/:cat', Component: ThreatIntelHome },
  { path: '/threatintel', Component: ThreatIntelHome },
  { path: '/threatintel/assessments/:id', Component: AssessmentDetail },
  { path: '/threatintel/actors', Component: ActorHub },
  { path: '/threatintel/most-wanted', Component: MostWanted },
  { path: '/threatintel/campaigns', Component: CampaignHub },
  { path: '/threatintel/cves', Component: VulnHub },
  { path: '/threatintel/iocs', Component: IocHub },
  { path: '/threatintel/malware', Component: MalwareHub },
  { path: '/threatintel/feeds', Component: FeedHub },
  { path: '/threatintel/social', Component: SocialHub },
  { path: '/threatintel/phishing', Component: EmailPhishHub },
  { path: '/threatintel/learn', Component: H3adLearn },
  { path: '/threatintel/infra', Component: InfraHub },
  { path: '/threatintel/detections', Component: DetectionHub },
  { path: '/threatintel/research-hub', Component: ResearchHub },
  { path: '/threatintel/osint', Component: OsintHub },
  { path: '/threatintel/tools', Component: ToolsHub },
  { path: '/threatintel/external', Component: ExternalHub },
  { path: '/threatintel/live-center', Component: LiveCenter },
  { path: '/dfir/pgp-tool', Component: PgpTool },
  { path: '/dfir/tor-gateway', Component: TorGateway },
  { path: '/dfir/blocklists', Component: Blocklists },
  // ── 24 Gap Features ──────────────────────────────────────────────
  { path: '/dfir/export-hub', Component: ExportHub },
  { path: '/dfir/multi-search', Component: MultiSearch },
  { path: '/dfir/report-composer', Component: ReportComposer },
  { path: '/dfir/report-analyzer', Component: ReportAnalyzer },
  { path: '/admin', Component: AdminApp },
];

/** Legacy / renamed paths preserved as redirects so in-flight links don't 404. */
const REDIRECTS: ReadonlyArray<{ path: string; to: string }> = [
  { path: '/dfir/host', to: '/dfir/asset-intel' },
  { path: '/dfir/sigma-convert', to: '/dfir/rule-converter' },
  { path: '/dfir/discord-watch', to: '/threatintel/social' },
  { path: '/dfir/industry-news', to: '/threatintel/social' },
  { path: '/difr', to: '/dfir' },
  { path: '/osint-tools', to: '/threatintel/osint-cli-tools' },
  { path: '/dfir/agent', to: '/dfir/ioc-check' },
  { path: '/threatintel/awesome-lists', to: '/threatintel/external' },
  { path: '/threatintel/tech-ai-news', to: '/threatintel/social' },
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
