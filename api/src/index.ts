import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env';
import { iocCheckHandler } from './routes/ioc';
import { domainLookupHandler } from './routes/domain';
import { phishingAnalyzeHandler } from './routes/phishing';
import { exposureScanHandler } from './routes/exposure';
import { fileAnalyzeHandler } from './routes/file';
import { feedProxyHandler } from './routes/feeds';
import { ctiParseHandler } from './routes/cti';
import { osvScanHandler } from './routes/osv';
import { depsDevPackageHandler } from './routes/supply-chain';
import { privacyInspectHandler } from './routes/privacy';
import { iocFeedSummaryHandler } from './routes/ioc-feeds';
import { cveSearchHandler } from './routes/cve';
import { cveBatchLookupHandler } from './routes/cve-batch';
import { mitreTechniqueHandler } from './routes/mitre';
import { atlasTechniqueHandler } from './routes/atlas';
import { asnLookupHandler } from './routes/asn';
import { breachRangeHandler, breachEmailHandler, breachDomainHandler } from './routes/breach';
import { urlPreviewHandler } from './routes/url-preview';
import { takeoverCheckHandler } from './routes/takeover';
import { threatMapHandler } from './routes/threat-map';
import { feedsAggregateHandler } from './routes/feeds-aggregate';
import { detectionRulesHandler } from './routes/detection-rules';
import { breachDisclosuresHandler } from './routes/breach-disclosures';
import { ransomwareRecentHandler } from './routes/ransomware-recent';
import { ransomwareMapHandler } from './routes/ransomware-map';
import { cryptoTraceHandler } from './routes/crypto-trace';
import {
  tracerExpandHandler,
  tracerLabelHandler,
  tracerLabelAddHandler,
  tracerCalldataHandler,
  tracerGraphSaveHandler,
  tracerGraphListHandler,
  tracerGraphGetHandler,
  tracerGraphDeleteHandler,
} from './routes/tracer';
import {
  cryptoWatchAddHandler,
  cryptoWatchListHandler,
  cryptoWatchRemoveHandler,
  cryptoAlertsHandler,
} from './routes/crypto-monitor';
import { abuseRssHandler } from './routes/abuse-rss';
import { mtiRansomwareRssHandler } from './routes/mti-ransomware-rss';
import { ransomwareMergedRssHandler } from './routes/ransomware-merged-rss';
import { mtiHandler, mtiDnsHandler } from './routes/mti';
import { mispProxyHandler } from './routes/misp';
import { waybackCdxHandler } from './routes/wayback';
import { builtwithHandler } from './routes/builtwith';
import { ctLogHandler } from './routes/ct-log';
import { waybackAdvancedHandler } from './routes/wayback-advanced';
import { threatPulseHandler } from './routes/threat-pulse';
import { ipGeoHandler } from './routes/ip-geo';
import { stixFetchHandler } from './routes/stix-fetch';
import { certSearchHandler } from './routes/cert-search';
import { webScanHandler } from './routes/web-scan';
import { onionWatchHandler } from './routes/onion-watch';
import {
  telegramFeedHandler,
  telegramCustomChannelsGetHandler,
  telegramCustomChannelsPostHandler,
  telegramCustomChannelsDeleteHandler,
} from './routes/telegram-feed';
import { cveRecentHandler } from './routes/cve-recent';
import { cveThreatMapHandler } from './routes/cve-threat-map';
import { phishingUrlsHandler } from './routes/phishing-urls';
import { cryptoScamFeedHandler } from './routes/crypto-scam-feed';
import { actorUsernamesHandler, actorUsernamesStatsHandler } from './routes/actor-usernames';
import { scrapedintelUsernamesHandler } from './routes/scrapedintel-usernames';
import { phishingWordlistsHandler } from './routes/phishing-wordlists';
import { malwareSamplesHandler } from './routes/malware-samples';
import { redditFeedHandler } from './routes/reddit-feed';
import { xFeedHandler } from './routes/x-feed';
import { feedStatusHandler } from './routes/feed-status';
import { iocCorrelationHandler } from './routes/ioc-correlation';
import { actorTimelineHandler } from './routes/actor-timeline';
import { victimReleaksHandler } from './routes/victim-releaks';
import { liveIocsHandler } from './routes/live-iocs';
import { detectionsHandler } from './routes/detections';
import { deepDarkCtiHandler } from './routes/deepdarkcti';
import { stealerForumIntelHandler } from './routes/stealer-forum-intel';
import { breachForumsHandler } from './routes/breach-forums';
import { breachForumStatusHandler } from './routes/breach-forum-status';
import { breachCoverageHandler } from './routes/breach-coverage';
import { negotiationsHandler, negotiationTranscriptHandler } from './routes/negotiations';
import { ransomwareLiveHandler } from './routes/ransomwarelive';
import { writeupsHandler } from './routes/writeups';
import { cybercrimeHandler } from './routes/cybercrime';
import { iocExplainHandler, iocRuleHandler } from './routes/ioc-verdict';
import { globalPulseHandler } from './routes/global-pulse';
import {
  webamonSearchHandler,
  webamonScanHandler,
  webamonReportsHandler,
  webamonReportHandler,
  webamonScreenshotHandler,
  webamonDomainHandler,
  webamonServerHandler,
  webamonResourceHandler,
} from './routes/webamon';
import {
  listBriefingsHandler,
  getBriefingHandler,
  todayBriefingHandler,
  buildBriefingHandler,
  backfillBriefingsHandler,
  sweepBriefingsHandler,
  deleteBriefingHandler,
  pruneEmptyBriefingsHandler,
  briefingsForActorHandler,
  briefingPrintHandler,
} from './routes/briefings';
import { briefingsRssHandler } from './routes/briefings-rss';
import {
  submitFeedbackHandler,
  getFeedbackHandler,
  submitAnnotationHandler,
  getAnnotationsHandler,
  feedbackSummaryHandler,
} from './routes/briefing-feedback';
import {
  listExternalResourcesHandler,
  createExternalResourceHandler,
  deleteExternalResourceHandler,
} from './routes/external-resources';
import { snapshotHandler } from './routes/snapshot';
import { iocSnapshotHandler } from './routes/ioc-snapshot';
import { intelDashboardHandler } from './routes/intel-dashboard';
import { threatHuntHandler } from './routes/threat-hunt';
import { huntV2Handler } from './routes/hunt-v2';
import { phishingAnalyzeAutoHandler } from './routes/phishing-auto-analyze';
import { registerBlogRoutes } from './routes/blog-public';
import { pageViewsHandler } from './routes/pageviews';
import { registerAdminRoutes } from './routes/case-study-admin';
import { healthDetailedHandler } from './routes/health-detailed';
import { featuresHandler } from './routes/features';
import { c2TrackerHandler } from './routes/c2-tracker';
import {
  intelBundleHandler,
  intelBundlePostHandler,
  intelBundleBuildHandler,
  intelBundleExportHandler,
  intelBundleByIdHandler,
  intelBundleAdminHandler,
} from './routes/intel-bundle';
import { googleDorksHandler } from './routes/google-dorks';
import { emailRepHandler } from './routes/email-rep';
import {
  blocklistPfSenseHandler,
  blocklistIptablesHandler,
  blocklistSuricataHandler,
  blocklistMetaHandler,
} from './routes/blocklists';
import { fetchPageHandler, fingerprintHandler } from './routes/phishing-fingerprint';
import { unifiedSearchHandler } from './routes/unified-search';
import { unifiedSearchSummarizeHandler } from './routes/unified-search-summarize';
import { aggregatedFeedsHandler } from './routes/aggregated-feeds';
import { malwareFamilyListHandler, malwareFamilyDetailHandler } from './routes/malware-iocs';
import { feedCatalogHandler } from './routes/feed-catalog';
import { yaraHubListHandler, yaraHubRuleHandler } from './routes/yara-hub';
import {
  listInvestigationsHandler,
  createInvestigationHandler,
  getInvestigationHandler,
  updateInvestigationHandler,
  deleteInvestigationHandler,
  addObservableHandler,
  removeObservableHandler,
  addTaskHandler,
  updateTaskHandler,
  addNoteHandler,
} from './routes/investigations';
import {
  listFeedJobsHandler,
  createFeedJobHandler,
  updateFeedJobHandler,
  deleteFeedJobHandler,
  runFeedJobHandler,
  getFeedJobHistoryHandler,
  getFeedJobsHistoryAllHandler,
} from './routes/feed-scheduler';
import {
  listObservablesHandler,
  getObservableHandler,
  saveObservableHandler,
  updateObservableHandler,
  deleteObservableHandler,
  addObservableNoteHandler,
  deleteObservableNoteHandler,
  getObservableTagsHandler,
} from './routes/observable-db';
import {
  listVaultSamplesHandler,
  getVaultSampleHandler,
  uploadVaultSampleHandler,
  updateVaultSampleHandler,
  deleteVaultSampleHandler,
  downloadVaultSampleHandler,
  getVaultFamiliesHandler,
  getVaultTagsHandler,
} from './routes/malware-vault';
import { copilotInvestigateHandler } from './routes/copilot';
import { buildReportHandler, getReportHandler, streamReportHandler } from './routes/report';
import { automationRunHandler } from './routes/automation';
import { dashboardHandler, getWatchlistHandler, updateWatchlistHandler } from './routes/dashboard';
import { maltiverseSearchHandler } from './routes/maltiverse';
import { inquestSearchHandler } from './routes/inquest';
import { hackertargetDnsHandler, hackertargetReverseIpHandler } from './routes/hackertarget';
import { radarDomainHandler } from './routes/cloudflare-radar';
import { certspotterSearchHandler } from './routes/certspotter';
import { triageSearchHandler } from './routes/triage';
import { reportParserHandler } from './routes/report-parser';
import { reportIngestHandler } from './routes/report-ingest';
import { domainRepHandler, domainMonitorHandler } from './routes/domain-advanced';
import {
  domainHistoryHandler,
  domainChangesHandler,
  domainPivotHandler,
  domainHistoryStatsHandler,
  domainRegistrantSearchHandler,
  domainSnapshotHandler,
} from './routes/domain-history';
import { openDirectoryScanHandler } from './routes/open-directory';
import { exposedHostHandler } from './routes/exposed-host';
import { iocLifecycleHandler, iocLifecycleTrendingHandler, iocLifecycleStatsHandler } from './routes/ioc-lifecycle';
import { ruleGeneratorHandler, ruleValidateHandler } from './routes/yara-generator';
import { ctWatchedListHandler, ctWatchAddHandler, ctWatchRemoveHandler, ctCertsHandler } from './routes/ct-monitor';
import {
  taxiiDiscoveryHandler,
  taxiiCollectionsHandler,
  taxiiCollectionHandler,
  taxiiObjectsHandler,
  taxiiAddObjectsHandler,
} from './routes/taxii';
import { stealerParserHandler } from './routes/stealer-parser';
import { bloomFilterHandler, bloomCheckHandler, bloomStatsHandler } from './routes/bloom-filter';
import { graphNodeHandler, graphPathHandler, graphCommunitiesHandler, graphStatsHandler } from './routes/threat-graph';
import { graphIngestManualHandler } from './routes/graph-ingest';
import {
  temporalTimelineHandler,
  temporalCampaignsHandler,
  temporalVelocityHandler,
  temporalPredictHandler,
} from './routes/temporal-analysis';
import { attackChainHandler, attackChainTechniquesHandler } from './routes/attack-chain';
import {
  actorDnaMatchHandler,
  actorDnaGetHandler,
  actorDnaListHandler,
  actorDnaCompareHandler,
} from './routes/actor-dna';
import { campaignAnalyzeHandler, campaignTechniquesHandler } from './routes/campaign-lifecycle';
import {
  predictiveForecastsHandler,
  predictiveSectorRisksHandler,
  predictiveAttributionHandler,
  predictiveGapsHandler,
  predictiveReportHandler,
} from './routes/predictive-intel';
import {
  pirListHandler,
  pirDetailHandler,
  pirCreateHandler,
  pirUpdateHandler,
  pirDeleteHandler,
  pirAlertHandler,
  pirAlertListHandler,
  pirAlertAckHandler,
  pirAlertAckAllHandler,
  pirRoutingHandler,
  pirRelevantHandler,
} from './routes/pir';
import {
  feedbackCreateHandler,
  feedbackListHandler,
  feedbackAggregateHandler,
  feedbackDeleteHandler,
} from './routes/feedback';
import { sourceReliabilityHandler } from './lib/confidence';
import { maturityHandler } from './lib/maturity';
import { crossCampaignCorrelationHandler } from './routes/cross-campaign';

import {
  listWatchesHandler,
  createWatchHandler,
  updateWatchHandler,
  deleteWatchHandler,
  alertLogHandler,
} from './routes/watches';
import { rateLimit } from './lib/ratelimit';
import { apiKeyRateLimit } from './lib/api-key-ratelimit';
import { requestLogger } from './lib/request-logger';
import { csrfGuard } from './lib/csrf-guard';
import { errorHandler } from './lib/error-handler';
import { serverTiming } from './lib/server-timing';
import { requestId } from './lib/request-id';
import { authenticate } from './lib/auth';
import { requireAdminMiddleware } from './lib/admin-auth';
import { validate, validateText } from './lib/validate';
import { looseValidation } from './lib/loose-validate';
import { createExternalResourceSchema, telegramCustomChannelSchema } from './lib/schemas';
import {
  createApiKeyHandler,
  listApiKeysHandler,
  revokeApiKeyHandler,
  createSessionHandler,
  deleteSessionHandler,
} from './routes/admin-keys';
import { purgeCacheHandler } from './routes/admin-purge';
import { runRetentionHandler } from './routes/admin-retention';
import { malpediaActorHandler, malpediaFamilyHandler, malpediaSearchHandler } from './routes/malpedia';
import { maltrailListHandler, maltrailFetchHandler } from './routes/maltrail';
import { actorEnrichHandler } from './routes/actor-enrich';
import { actorEnrichOtxStreamHandler } from './routes/actor-enrich-stream';
import { certStreamHandler } from './routes/certstream';
import { campaignGeneratorHandler } from './routes/campaign-generator';
import { actorCvesHandler } from './routes/actor-cves';
import {
  saveCampaignHandler,
  listCampaignsHandler,
  getCampaignHandler,
  deleteCampaignHandler,
} from './routes/campaigns';
import { maltrailSyncHandler, listSkeletonActorsHandler, getSkeletonActorHandler } from './routes/maltrail-sync';
import { maliciousPackagesHandler } from './routes/malicious-packages';
import { secretLeaksHandler } from './routes/secret-leaks';
import { feedQualityHandler } from './routes/tifce';
import {
  agentInvestigateHandler,
  agentStateHandler,
  agentStreamHandler,
  agentSessionsHandler,
  agentDeleteHandler,
} from './routes/agent';
import { attackNavigatorHandler } from './routes/attack-navigator';
import { a3mMatrixHandler } from './routes/a3m-matrix';
import { d3fendMatrixHandler } from './routes/d3fend-matrix';
import { getSiteUrl } from './lib/site-config';
import { xTweetsHandler } from './routes/x-tweets';
import { xLiveHandler } from './routes/x-live';
import { xFirehoseHandler } from './routes/x-firehose';
import { xClaimsHandler } from './routes/x-claims';
import { relationshipGraphHandler } from './routes/relationship-graph';
import { ragIndexHandler, ragQueryHandler } from './routes/rag-index';
import { indexAllCorpora } from './routes/rag-corpus-index';
import { achHandler } from './routes/ach';
import { entityResolveHandler, entityExtractHandler, entityProfileHandler } from './routes/entity-resolver';
import { noveltyHandler, noveltyBatchHandler } from './routes/novelty';
import {
  assessmentCreateHandler,
  assessmentListHandler,
  assessmentDetailHandler,
  assessmentUpdateHandler,
  assessmentDeleteHandler,
} from './routes/assessments';
import { correlateHandler } from './routes/cross-correlate';
import { huntingQueryHandler } from './routes/hunting-queries';
import { sandboxLookupHandler } from './routes/sandbox';
import { sampleScanHandler } from './routes/sample-scan';
import { irPlaybookHandler } from './routes/ir-playbooks';
import { aiSummaryHandler } from './routes/ai-summary';
import { leakIxSearchHandler } from './routes/leakix';
import { hostIntelHandler } from './routes/host';
import { proxyNovaSearchHandler } from './routes/proxynova';
import { identityProxyHandler } from './routes/identity-proxy';
import { hudsonRockSearchHandler, hudsonRockDomainHandler } from './routes/hudsonrock';
import { projectDiscoveryHandler } from './routes/projectdiscovery';
import {
  pdLeaksHandler,
  pdSubdomainsHandler,
  pdCvesHandler,
  pdCveDetailHandler,
} from './routes/projectdiscovery-intel';
import { stopForumSpamHandler } from './routes/stopforumspam';
import { urlscanIpHandler } from './routes/urlscan-ip';
import { hackMyIpBreachHandler } from './routes/hackmyip';
import {
  telegramLeakSearchHandler,
  telegramDiscoveredChannelsHandler,
  telegramWatchedChannelsHandler,
  telegramApproveChannelHandler,
  telegramRejectChannelHandler,
  telegramLeakStatsHandler,
  telegramLeakGeoHandler,
} from './routes/telegram-leak-monitor';
import {
  telegramLeakBotWebhookHandler,
  telegramLeakBotRegisterHandler,
  telegramLeakBotWebhookStatusHandler,
} from './routes/telegram-leak-bot';
import { exploitDbHandler } from './routes/exploit-db';
import { securityUpdatesHandler } from './routes/security-updates';
import { cisaKevHandler } from './routes/cisa-kev';
import { supplyChainAttacksHandler } from './routes/supply-chain-attacks';
import { k8sCveHandler } from './routes/k8s-cve';
import { mispGalaxyActorsHandler } from './routes/misp-galaxy-actors';
import { cloudThreatLandscapeHandler } from './routes/cloud-threat-landscape';
import { ransomwhereHandler } from './routes/ransomwhere';
import { disarmFrameworkHandler } from './routes/disarm-framework';
import { attackFlowLibraryHandler } from './routes/attack-flow-library';
import { volexityThreatIntelHandler } from './routes/volexity-threat-intel';
import { passiveDnsLookupHandler } from './routes/passive-dns';
import { gitHubSecurityHandler } from './routes/github-security';
import { predictionsHandler } from './routes/predictions';

const app = new Hono<{ Bindings: Env }>();

app.use(
  '/api/v1/*',
  cors({
    origin: (_, c) => getSiteUrl(c.env as { SITE_URL?: string }),
    // X-Admin-Token intentionally omitted: admin mutations are same-origin
    // only. Exposing it in CORS would let a malicious page on the same
    // domain make cross-origin admin requests if the user has the token
    // in their browser.
    allowHeaders: ['Authorization', 'Content-Type', 'X-API-Key'],
    allowMethods: ['GET', 'POST', 'DELETE', 'PATCH', 'PUT', 'OPTIONS'],
    maxAge: 86400,
  })
);

app.use('/api/v1/*', requestId);
app.use('/api/v1/*', serverTiming);
app.use('/api/v1/*', csrfGuard);
app.use('/api/v1/*', authenticate('external-only'));
// Cheap, route-agnostic input guards (URL/query/body size + JSON shape).
// Runs after auth so we don't pay the parsing cost on rejected requests,
// but before rateLimit/requestLogger so the request logger still sees the
// same request-id and timing. Per-route `validate(...)` middleware still
// runs for typed Zod parsing of the ~15 high-impact POST endpoints.
app.use('/api/v1/*', looseValidation());
app.use('/api/v1/*', requestLogger);
app.use('/api/v1/*', rateLimit);
// Per-API-key daily/per-minute quota (readonly 1k/day, admin 10k/day), enforced
// in D1 after the cheap per-IP limiter. No-ops for keyless same-origin frontend
// traffic and the internal-agent token (it carries no api-key header), so only
// explicit key holders are metered — closes the "rotate IPs for unlimited
// paid-upstream fan-out" gap the per-IP limiter alone left open.
app.use('/api/v1/*', apiKeyRateLimit);
app.use('/api/v1/*', apiVersion);
app.use('/api/taxii2/*', rateLimit);

// ── Operator-only gates ────────────────────────────────────────────────────
// Sensitive DFIR working data (read AND write — no per-user ownership exists,
// so an open read is a full data dump) and costly AI/paid endpoints require the
// admin token (Authorization: Bearer ADMIN_TOKEN or X-Admin-Token). Registered
// after the global /api/v1/* chain so these run after cors/csrf/auth/ratelimit
// but before the route handler. Header-based "same-origin" trust is NOT an
// authentication grant for these — the admin token is required regardless of
// Origin. The bare path + `/*` cover the collection root and all sub-routes.
const ADMIN_GATED_PREFIXES = [
  '/api/v1/malware-vault',
  '/api/v1/observable-db',
  '/api/v1/investigations',
  '/api/v1/threat-intel/assessments',
  '/api/v1/threat-intel/pirs',
  '/api/v1/watches',
  '/api/v1/feed-scheduler',
  '/api/v1/feed-scheduler-history',
  '/api/v1/ct-monitor',
  '/api/v1/dashboard',
  '/api/v1/rag',
  '/api/v1/report',
];
for (const base of ADMIN_GATED_PREFIXES) {
  app.use(base, requireAdminMiddleware);
  app.use(`${base}/*`, requireAdminMiddleware);
}
// Single-path / costly-AI gates. `/api/v1/rules/*` and `/api/v1/yara/*` match
// the generate/validate sub-paths but NOT the public `/api/v1/rules` feed.
app.use('/api/v1/graph/ingest', requireAdminMiddleware);
app.use('/api/v1/threat-intel/novelty/batch', requireAdminMiddleware);
app.use('/api/v1/report/parse', requireAdminMiddleware);
app.use('/api/v1/tracer/labels', requireAdminMiddleware);
app.use('/api/v1/tracer/graphs', requireAdminMiddleware);
app.use('/api/v1/crypto-monitor', requireAdminMiddleware);
app.use('/api/v1/crypto-monitor/*', requireAdminMiddleware);
app.use('/api/v1/tracer/graphs/*', requireAdminMiddleware);
app.use('/api/v1/ai-summary', requireAdminMiddleware);
app.use('/api/v1/yara/*', requireAdminMiddleware);
app.use('/api/v1/rules/generate', requireAdminMiddleware);
app.use('/api/v1/rules/validate', requireAdminMiddleware);

import {
  iocCheckSchema,
  domainLookupSchema,
  ipGeoSchema,
  cveLookupSchema,
  mitreTechniqueSchema,
  searchSchema,
  waybackSchema,
  googleDorksSchema,
  cryptoTraceSchema,
  tracerExpandSchema,
  tracerLabelSchema,
  tracerLabelAddSchema,
  tracerCalldataSchema,
  tracerGraphSaveSchema,
  cryptoWatchAddSchema,
  ctCertsSchema,
  iocLifecycleSchema,
  iocTrendingSchema,
  relationshipGraphSchema,
  unifiedSearchSchema,
  unifiedSearchSummarizeSchema,
  ragQuerySchema,
  hashAnalyzeSchema,
  bloomCheckSchema,
  osvScanSchema,
  depsDevPackageSchema,
  telegramChannelActionSchema,
  telegramBotRegisterSchema,
  aiSummarySchema,
  copilotInvestigateSchema,
  reportBuildSchema,
  huntingQuerySchema,
  irPlaybookSchema,
  ruleGenerateSchema,
  ruleValidateSchema,
  threatIntelFeedbackSchema,
  assessmentSchema,
  assessmentUpdateSchema,
  pirCreateSchema,
  pirUpdateSchema,
  pirAlertAckSchema,
  investigationCreateSchema,
  investigationUpdateSchema,
  investigationObservableSchema,
  investigationTaskSchema,
  investigationTaskUpdateSchema,
  investigationNoteSchema,
  feedJobCreateSchema,
  feedJobUpdateSchema,
  observableCreateSchema,
  observableUpdateSchema,
  observableNoteSchema,
  watchCreateSchema,
  watchUpdateSchema,
  campaignCreateSchema,
  watchlistUpdateSchema,
  intelBundleBuildSchema,
  predictiveAttributionSchema,
  attackChainReconstructSchema,
  actorDnaMatchSchema,
  correlationSchema,
  noveltyBatchSchema,
  campaignAnalyzeSchema,
  threatIntelEntityExtractSchema,
  threatIntelEntityProfileSchema,
  achGenerateSchema,
  domainSnapshotSchema,
  openDirScanSchema,
  graphIngestSchema,
  mispProxySchema,
  actorEnrichStreamSchema,
  campaignGeneratorSchema,
  automationRunSchema,
  agentInvestigateSchema,
  briefingBuildSchema,
  briefingBackfillSchema,
  briefingDeleteSchema,
  ragIndexSchema,
  adminPurgeSchema,
  adminRetentionSchema,
  adminApiKeyCreateSchema,
  phishingEmailTextSchema,
  stixBundleTextSchema,
  exploitDbSchema,
  cisaKevSchema,
  supplyChainAttacksSchema,
  k8sCveSchema,
  mispGalaxyActorsSchema,
  cloudThreatLandscapeSchema,
  ransomwhereSchema,
  disarmFrameworkSchema,
  attackFlowLibrarySchema,
  volexityThreatIntelSchema,
  securityUpdatesSchema,
  passiveDnsSchema,
  githubSecuritySchema,
  waybackAdvancedSchema,
} from './lib/validation-schemas';

// ── Health Checks ──────────────────────────────────────────────────
import { generateOpenApiSpec } from './lib/openapi';
import { apiVersion } from './lib/api-version';
import {
  exportStixHandler,
  exportMispHandler,
  exportSigmaHandler,
  exportYaraHandler,
  exportSnortHandler,
  exportSuricataHandler,
  exportCsvHandler,
  exportPfSenseHandler,
} from './routes/export';

app.get('/api/v1/health', (c) =>
  c.json({ ok: true, timestamp: new Date().toISOString() }, 200, { 'Cache-Control': 'public, max-age=60' })
);
app.get('/api/v1/health/detailed', healthDetailedHandler);

// Public boolean map of configured optional self-hosted bridges. The
// frontend probes this to hide dormant tools until their *_BRIDGE_URL
// secret is set. Booleans only.
app.get('/api/v1/features', featuresHandler);

// ── OpenAPI Specification ────────────────────────────────────────
app.get('/api/v1/openapi.json', (c) => {
  return c.json(generateOpenApiSpec(), 200, {
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
  });
});

app.get('/api/v1/health/d1', async (c) => {
  const db = c.env.BRIEFINGS_DB;
  if (!db) return c.json({ status: 'unavailable', binding: 'BRIEFINGS_DB' }, 503);
  try {
    const start = Date.now();
    await db.prepare('SELECT 1').first();
    return c.json({ status: 'ok', latency_ms: Date.now() - start }, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return c.json({ status: 'error', error: e instanceof Error ? e.message : 'unknown' }, 503);
  }
});

app.get('/api/v1/health/kv', async (c) => {
  const kv = c.env.KV_CACHE;
  if (!kv) return c.json({ status: 'unavailable', binding: 'KV_CACHE' }, 503);
  try {
    const start = Date.now();
    await kv.get('__health_check__');
    return c.json({ status: 'ok', latency_ms: Date.now() - start }, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return c.json({ status: 'error', error: e instanceof Error ? e.message : 'unknown' }, 503);
  }
});

app.get('/api/v1/health/ai', async (c) => {
  const ai = c.env.AI;
  if (!ai) return c.json({ status: 'unavailable', binding: 'AI' }, 503);
  try {
    const start = Date.now();
    // Use a minimal prompt to test AI binding availability
    await ai.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5,
    });
    return c.json({ status: 'ok', latency_ms: Date.now() - start, model: 'llama-3.1-8b' }, 200, {
      'Cache-Control': 'no-store',
    });
  } catch (e) {
    return c.json({ status: 'error', error: e instanceof Error ? e.message : 'unknown' }, 503);
  }
});

app.get('/api/v1/health/vectorize', async (c) => {
  const vec = c.env.VECTORIZE;
  if (!vec) return c.json({ status: 'unavailable', binding: 'VECTORIZE' }, 503);
  try {
    const start = Date.now();
    await vec.query(new Array(768).fill(0), { topK: 1 });
    return c.json({ status: 'ok', latency_ms: Date.now() - start }, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    return c.json({ status: 'error', error: e instanceof Error ? e.message : 'unknown' }, 503);
  }
});
app.get('/api/v1/ioc/check', validate('query', iocCheckSchema), iocCheckHandler);
app.get('/api/v1/domain/lookup', validate('query', domainLookupSchema), domainLookupHandler);
app.post(
  '/api/v1/phishing/analyze',
  validateText(phishingEmailTextSchema, { maxBytes: 64 * 1024 }),
  phishingAnalyzeHandler
);
app.post('/api/v1/file/analyze', validate('json', hashAnalyzeSchema), fileAnalyzeHandler);
app.get('/api/v1/feeds/proxy', feedProxyHandler);
app.get('/api/v1/feeds/abuse-rss', abuseRssHandler);
app.get('/api/v1/feeds/mti-ransomware', mtiRansomwareRssHandler);
app.get('/api/v1/feeds/ransomware-merged', ransomwareMergedRssHandler);
app.get('/api/v1/feeds/ioc-summary', iocFeedSummaryHandler);
app.post('/api/v1/cti/parse', validateText(stixBundleTextSchema, { maxBytes: 1024 * 1024 }), ctiParseHandler);
app.post('/api/v1/osv/scan', validate('json', osvScanSchema), osvScanHandler);
app.get('/api/v1/privacy/inspect', privacyInspectHandler);
app.get('/api/v1/cve/lookup', validate('query', cveLookupSchema), cveSearchHandler);
app.get('/api/v1/cve/search', validate('query', cveLookupSchema), cveSearchHandler);
app.post('/api/v1/cve/lookup/batch', cveBatchLookupHandler);
app.get('/api/v1/mitre/technique', validate('query', mitreTechniqueSchema), mitreTechniqueHandler);
app.get('/api/v1/atlas/technique', atlasTechniqueHandler);
app.get('/api/v1/asn/lookup', asnLookupHandler);
app.get('/api/v1/breach/range', breachRangeHandler);
app.get('/api/v1/breach/email', breachEmailHandler);
app.get('/api/v1/breach/domain', breachDomainHandler);
app.get('/api/v1/breach/leakix', leakIxSearchHandler);
app.get('/api/v1/breach/proxynova', proxyNovaSearchHandler);
app.get('/api/v1/breach/hudsonrock', hudsonRockSearchHandler);
app.get('/api/v1/breach/hudsonrock/domain', hudsonRockDomainHandler);
app.get('/api/v1/breach/projectdiscovery', projectDiscoveryHandler);
app.get('/api/v1/pd/leaks', pdLeaksHandler);
app.get('/api/v1/pd/subdomains', pdSubdomainsHandler);
app.get('/api/v1/pd/cves', pdCvesHandler);
app.get('/api/v1/pd/cve-detail', pdCveDetailHandler);
app.get('/api/v1/abuse-rep', stopForumSpamHandler);
app.get('/api/v1/urlscan-ip', urlscanIpHandler);
app.get('/api/v1/breach/hackmyip', hackMyIpBreachHandler);
app.get('/api/v1/identity/lookup', identityProxyHandler);
app.get('/api/v1/url-preview', urlPreviewHandler);
app.get('/api/v1/takeover/check', takeoverCheckHandler);
app.get('/api/v1/threat-map', threatMapHandler);
app.get('/api/v1/feeds/aggregate', feedsAggregateHandler);
app.get('/api/v1/rules', detectionRulesHandler);
app.get('/api/v1/deepdarkcti', deepDarkCtiHandler);
app.get('/api/v1/stealer-forum-intel', stealerForumIntelHandler);
app.get('/api/v1/secret-leaks', secretLeaksHandler);
app.get('/api/v1/attack-navigator', attackNavigatorHandler);
app.get('/api/v1/a3m-matrix', a3mMatrixHandler);
app.get('/api/v1/d3fend-matrix', d3fendMatrixHandler);
app.get('/api/v1/breach-forums', breachForumsHandler);
app.get('/api/v1/breach-forum-status/deltas', breachForumStatusHandler);
app.get('/api/v1/breach-coverage', breachCoverageHandler);
app.get('/api/v1/negotiations', negotiationsHandler);
app.get('/api/v1/negotiations/:group/:id', negotiationTranscriptHandler);
app.get('/api/v1/rl/:resource', ransomwareLiveHandler);
app.get('/api/v1/rl/:resource/:arg', ransomwareLiveHandler);
app.get('/api/v1/breach-disclosures', breachDisclosuresHandler);
app.get('/api/v1/ransomware-recent', ransomwareRecentHandler);
app.get('/api/v1/ransomware-map', ransomwareMapHandler);
app.get('/api/v1/crypto-trace', validate('query', cryptoTraceSchema), cryptoTraceHandler);
app.get('/api/v1/supply-chain/package', validate('query', depsDevPackageSchema), depsDevPackageHandler);
app.post('/api/v1/tracer/expand', validate('json', tracerExpandSchema), tracerExpandHandler);
app.get('/api/v1/tracer/label', validate('query', tracerLabelSchema), tracerLabelHandler);
app.post('/api/v1/tracer/labels', validate('json', tracerLabelAddSchema), tracerLabelAddHandler);
app.get('/api/v1/tracer/calldata', validate('query', tracerCalldataSchema), tracerCalldataHandler);
app.post('/api/v1/tracer/graphs', validate('json', tracerGraphSaveSchema), tracerGraphSaveHandler);
app.get('/api/v1/tracer/graphs', tracerGraphListHandler);
app.get('/api/v1/tracer/graphs/:id', tracerGraphGetHandler);
app.delete('/api/v1/tracer/graphs/:id', tracerGraphDeleteHandler);
app.post('/api/v1/crypto-monitor/watch', validate('json', cryptoWatchAddSchema), cryptoWatchAddHandler);
app.get('/api/v1/crypto-monitor/watches', cryptoWatchListHandler);
app.delete('/api/v1/crypto-monitor/watch/:address/:chain', cryptoWatchRemoveHandler);
app.get('/api/v1/crypto-monitor/alerts', cryptoAlertsHandler);
app.get('/api/v1/wayback/cdx', validate('query', waybackSchema), waybackCdxHandler);
app.get('/api/v1/threat-pulse', threatPulseHandler);
app.get('/api/v1/ip-geo', validate('query', ipGeoSchema), ipGeoHandler);
app.get('/api/v1/stix/fetch', stixFetchHandler);
app.get('/api/v1/cert-search', certSearchHandler);
app.get('/api/v1/web-scan', webScanHandler);
app.get('/api/v1/exposure/scan', exposureScanHandler);
app.get('/api/v1/host', hostIntelHandler);
app.get('/api/v1/onion-watch', onionWatchHandler);
app.get('/api/v1/builtwith', builtwithHandler);
app.get('/api/v1/ct-log', ctLogHandler);
app.get('/api/v1/wayback/advanced', validate('query', waybackAdvancedSchema), waybackAdvancedHandler);
app.get('/api/v1/telegram-feed', telegramFeedHandler);
app.get('/api/v1/telegram-custom-channels', telegramCustomChannelsGetHandler);
app.post(
  '/api/v1/telegram-custom-channels',
  validate('json', telegramCustomChannelSchema),
  telegramCustomChannelsPostHandler
);
app.delete('/api/v1/telegram-custom-channels/:handle', telegramCustomChannelsDeleteHandler);

// ── Telegram Leak Monitor (Tier 1: t.me scraping) ─────────────────────────
app.get('/api/v1/telegram-leaks/search', telegramLeakSearchHandler);
app.get('/api/v1/telegram-leaks/discovered-channels', telegramDiscoveredChannelsHandler);
app.get('/api/v1/telegram-leaks/watched-channels', telegramWatchedChannelsHandler);
app.get('/api/v1/telegram-leaks/stats', telegramLeakStatsHandler);
app.get('/api/v1/telegram-leaks/geo', telegramLeakGeoHandler);
app.post(
  '/api/v1/telegram-leaks/approve-channel',
  validate('json', telegramChannelActionSchema),
  telegramApproveChannelHandler
);
app.post(
  '/api/v1/telegram-leaks/reject-channel',
  validate('json', telegramChannelActionSchema),
  telegramRejectChannelHandler
);

// ── Telegram Leak Monitor (Tier 2: Bot API) ──────────────────────────────
app.get('/api/v1/telegram-leaks/bot-webhook-status', telegramLeakBotWebhookStatusHandler);
app.post('/api/v1/telegram-leaks/bot-webhook', telegramLeakBotWebhookHandler);
app.post(
  '/api/v1/telegram-leaks/register-webhook',
  validate('query', telegramBotRegisterSchema),
  telegramLeakBotRegisterHandler
);

app.get('/api/v1/webamon/search', webamonSearchHandler);
app.post('/api/v1/webamon/scan', webamonScanHandler);
app.get('/api/v1/webamon/reports', webamonReportsHandler);
app.get('/api/v1/webamon/report/:id', webamonReportHandler);
app.get('/api/v1/webamon/screenshot/:id', webamonScreenshotHandler);
app.get('/api/v1/webamon/domain/:name', webamonDomainHandler);
app.get('/api/v1/webamon/server/:ip', webamonServerHandler);
app.get('/api/v1/webamon/resource/:sha256', webamonResourceHandler);
app.get('/api/v1/global-pulse', globalPulseHandler);
app.get('/api/v1/cve-recent', cveRecentHandler);
app.get('/api/v1/cve-threat-map', cveThreatMapHandler);
app.get('/api/v1/phishing-urls', phishingUrlsHandler);
app.get('/api/v1/crypto-scam-feed', cryptoScamFeedHandler);
app.get('/api/v1/actor-usernames', actorUsernamesHandler);
app.get('/api/v1/actor-usernames/stats', actorUsernamesStatsHandler);
// Live forum-handle search via threatactorusernames.com (ScrapedIntel). Cache +
// global egress budget + last-good live in the lookup layer; manual 2–80 char gate.
app.get('/api/v1/scrapedintel-usernames', scrapedintelUsernamesHandler);
app.get('/api/v1/phishing-wordlists', phishingWordlistsHandler);
app.get('/api/v1/malware-samples', malwareSamplesHandler);
app.get('/api/v1/reddit-feed', redditFeedHandler);
app.get('/api/v1/x-feed', xFeedHandler);
app.get('/api/v1/feed-status', feedStatusHandler);
app.get('/api/v1/feed-quality', feedQualityHandler);
app.post('/api/v1/agent/investigate', validate('json', agentInvestigateSchema), agentInvestigateHandler);
app.delete('/api/v1/agent/:id', agentDeleteHandler);
app.get('/api/v1/agent/sessions', agentSessionsHandler);
app.get('/api/v1/agent/:id/stream', agentStreamHandler);
app.get('/api/v1/agent/:id', agentStateHandler);
app.get('/api/v1/ioc-correlation', iocCorrelationHandler);
app.post('/api/v1/ioc/explain', iocExplainHandler);
app.post('/api/v1/ioc/rule', iocRuleHandler);
app.get('/api/v1/actor-timeline', actorTimelineHandler);
app.get('/api/v1/victim-releaks', victimReleaksHandler);
app.get('/api/v1/live-iocs', liveIocsHandler);
app.get('/api/v1/detections', detectionsHandler);
app.get('/api/v1/mti', mtiHandler);
app.get('/api/v1/mti-dns', mtiDnsHandler);
app.get('/api/v1/writeups', writeupsHandler);
app.get('/api/v1/c2-tracker', c2TrackerHandler);
app.get('/api/v1/aggregated-feeds', aggregatedFeedsHandler);
app.get('/api/v1/malware-iocs', malwareFamilyListHandler);
app.get('/api/v1/malware-iocs/:family', malwareFamilyDetailHandler);
app.get('/api/v1/feed-catalog', feedCatalogHandler);
app.get('/api/v1/yara-hub', yaraHubListHandler);
app.get('/api/v1/yara-hub/rule/:uuid', yaraHubRuleHandler);
app.get('/api/v1/investigations', listInvestigationsHandler);
app.post('/api/v1/investigations', validate('json', investigationCreateSchema), createInvestigationHandler);
app.get('/api/v1/investigations/:id', getInvestigationHandler);
app.patch('/api/v1/investigations/:id', validate('json', investigationUpdateSchema), updateInvestigationHandler);
app.delete('/api/v1/investigations/:id', deleteInvestigationHandler);
app.post(
  '/api/v1/investigations/:id/observables',
  validate('json', investigationObservableSchema),
  addObservableHandler
);
app.delete('/api/v1/investigations/:id/observables/:observableId', removeObservableHandler);
app.post('/api/v1/investigations/:id/tasks', validate('json', investigationTaskSchema), addTaskHandler);
app.patch(
  '/api/v1/investigations/:id/tasks/:taskId',
  validate('json', investigationTaskUpdateSchema),
  updateTaskHandler
);
app.post('/api/v1/investigations/:id/notes', validate('json', investigationNoteSchema), addNoteHandler);
app.get('/api/v1/feed-scheduler', listFeedJobsHandler);
app.post('/api/v1/feed-scheduler', validate('json', feedJobCreateSchema), createFeedJobHandler);
app.patch('/api/v1/feed-scheduler/:id', validate('json', feedJobUpdateSchema), updateFeedJobHandler);
app.delete('/api/v1/feed-scheduler/:id', deleteFeedJobHandler);
app.post('/api/v1/feed-scheduler/:id/run', runFeedJobHandler);
app.get('/api/v1/feed-scheduler/:id/history', getFeedJobHistoryHandler);
app.get('/api/v1/feed-scheduler-history', getFeedJobsHistoryAllHandler);
app.get('/api/v1/observable-db', listObservablesHandler);
app.get('/api/v1/observable-db/tags', getObservableTagsHandler);
app.get('/api/v1/observable-db/:id', getObservableHandler);
app.post('/api/v1/observable-db', validate('json', observableCreateSchema), saveObservableHandler);
app.patch('/api/v1/observable-db/:id', validate('json', observableUpdateSchema), updateObservableHandler);
app.delete('/api/v1/observable-db/:id', deleteObservableHandler);
app.post('/api/v1/observable-db/:id/notes', validate('json', observableNoteSchema), addObservableNoteHandler);
app.delete('/api/v1/observable-db/:id/notes/:noteId', deleteObservableNoteHandler);
app.get('/api/v1/malware-vault', listVaultSamplesHandler);
app.get('/api/v1/malware-vault/families', getVaultFamiliesHandler);
app.get('/api/v1/malware-vault/tags', getVaultTagsHandler);
app.get('/api/v1/malware-vault/:id', getVaultSampleHandler);
app.post('/api/v1/malware-vault', uploadVaultSampleHandler);
app.patch('/api/v1/malware-vault/:id', updateVaultSampleHandler);
app.delete('/api/v1/malware-vault/:id', deleteVaultSampleHandler);
app.get('/api/v1/malware-vault/:id/download', downloadVaultSampleHandler);
app.get('/api/v1/intel-bundle', intelBundleHandler);
app.post('/api/v1/intel-bundle', intelBundlePostHandler);
app.post('/api/v1/intel-bundle/build', validate('json', intelBundleBuildSchema), intelBundleBuildHandler);
app.get('/api/v1/intel-bundle/by-id/:bundleId', intelBundleByIdHandler);
app.get('/api/v1/intel-bundle/:id/export.stix.json', intelBundleExportHandler);
app.get('/api/v1/admin/intel-bundle/:source/:ref', intelBundleAdminHandler);
app.get('/api/v1/google-dorks', validate('query', googleDorksSchema), googleDorksHandler);
app.post('/api/v1/misp', validate('json', mispProxySchema), mispProxyHandler);
app.get('/api/v1/email-rep', emailRepHandler);
app.get('/api/v1/cyber-crime', cybercrimeHandler);
app.get('/api/v1/snapshot', snapshotHandler);
app.get('/api/v1/ioc-snapshot', iocSnapshotHandler);
app.get('/api/v1/intel-dashboard', intelDashboardHandler);
app.get('/api/v1/threat-hunt', validate('query', searchSchema), threatHuntHandler);
app.get('/api/v1/hunt/v2', huntV2Handler);
app.get('/api/v1/pageviews', pageViewsHandler);
app.get('/api/v1/briefings/list', listBriefingsHandler);
app.get('/api/v1/briefings/rss', briefingsRssHandler);
app.get('/api/v1/briefings/today', todayBriefingHandler);
app.post('/api/v1/briefings/build', validate('query', briefingBuildSchema), buildBriefingHandler);
app.post('/api/v1/briefings/backfill', validate('query', briefingBackfillSchema), backfillBriefingsHandler);
app.post('/api/v1/briefings/sweep', sweepBriefingsHandler);
app.post('/api/v1/briefings/prune-empty', pruneEmptyBriefingsHandler);
app.post('/api/v1/briefings/delete', validate('query', briefingDeleteSchema), deleteBriefingHandler);
app.get('/api/v1/briefings/for-actor/:slug', briefingsForActorHandler);
app.get('/api/v1/briefings/:slug/print', briefingPrintHandler);
app.get('/api/v1/briefings/:slug', getBriefingHandler);

// ── Briefing Feedback & Annotations ─────────────────────────────
app.get('/api/v1/briefings/feedback/summary', feedbackSummaryHandler);
app.post('/api/v1/briefings/:slug/feedback', submitFeedbackHandler);
app.get('/api/v1/briefings/:slug/feedback', getFeedbackHandler);
app.post('/api/v1/briefings/:slug/annotations', submitAnnotationHandler);
app.get('/api/v1/briefings/:slug/annotations', getAnnotationsHandler);

app.get('/api/v1/external-resources', listExternalResourcesHandler);
app.post('/api/v1/external-resources', validate('json', createExternalResourceSchema), createExternalResourceHandler);
app.delete('/api/v1/external-resources/:id', deleteExternalResourceHandler);
registerBlogRoutes(app);
registerAdminRoutes(app);
app.get('/api/v1/malpedia/actor', malpediaActorHandler);
app.get('/api/v1/malpedia/family', malpediaFamilyHandler);
app.get('/api/v1/malpedia/search', malpediaSearchHandler);
app.get('/api/v1/maltrail/list', maltrailListHandler);
app.get('/api/v1/maltrail/fetch', maltrailFetchHandler);
app.get('/api/v1/actor-enrich', actorEnrichHandler);
app.post('/api/v1/actor-enrich/otx-stream', validate('json', actorEnrichStreamSchema), actorEnrichOtxStreamHandler);
app.get('/api/v1/certstream', certStreamHandler);
app.post('/api/v1/campaign-generator', validate('json', campaignGeneratorSchema), campaignGeneratorHandler);
app.get('/api/v1/actor-cves', actorCvesHandler);
app.get('/api/v1/campaigns', listCampaignsHandler);
app.post('/api/v1/campaigns', validate('json', campaignCreateSchema), saveCampaignHandler);
app.get('/api/v1/campaigns/:id', getCampaignHandler);
app.delete('/api/v1/campaigns/:id', deleteCampaignHandler);
app.post('/api/v1/maltrail-sync', maltrailSyncHandler);
app.get('/api/v1/skeleton-actors', listSkeletonActorsHandler);
app.get('/api/v1/skeleton-actors/:slug', getSkeletonActorHandler);
app.get('/api/v1/malicious-packages', maliciousPackagesHandler);
app.get('/api/v1/x-tweets', xTweetsHandler);
app.get('/api/v1/x-live', xLiveHandler);
app.get('/api/v1/x-firehose', xFirehoseHandler);
app.get('/api/v1/x-claims', xClaimsHandler);
app.post('/api/v1/admin/keys', validate('json', adminApiKeyCreateSchema), createApiKeyHandler);
app.get('/api/v1/admin/keys', listApiKeysHandler);
app.delete('/api/v1/admin/keys/:id', revokeApiKeyHandler);
app.post('/api/v1/admin/session', createSessionHandler);
app.delete('/api/v1/admin/session', deleteSessionHandler);
app.post('/api/v1/admin/purge', validate('json', adminPurgeSchema), purgeCacheHandler);
app.post('/api/v1/admin/retention/run', validate('json', adminRetentionSchema), runRetentionHandler);
app.get('/api/v1/blocklists/pfsense', blocklistPfSenseHandler);
app.get('/api/v1/blocklists/iptables', blocklistIptablesHandler);
app.get('/api/v1/blocklists/suricata', blocklistSuricataHandler);
app.get('/api/v1/blocklists/meta', blocklistMetaHandler);
app.post('/api/v1/phishing/fetch-page', fetchPageHandler);
app.get('/api/v1/phishing/auto-analyze', phishingAnalyzeAutoHandler);
app.post('/api/v1/phishing/fingerprint', fingerprintHandler);
app.get('/api/v1/unified-search', validate('query', unifiedSearchSchema), unifiedSearchHandler);
// Opt-in AI summary for the omnibox — PUBLIC same-origin (NOT admin-gated, unlike
// /api/v1/ai-summary); query-keyed 1h cache + the global apiKeyRateLimit bound cost.
app.post(
  '/api/v1/unified-search/summarize',
  validate('json', unifiedSearchSummarizeSchema),
  unifiedSearchSummarizeHandler
);
app.get('/api/v1/relationship-graph', validate('query', relationshipGraphSchema), relationshipGraphHandler);
app.post('/api/v1/rag/index', validate('json', ragIndexSchema), ragIndexHandler);
app.get('/api/v1/rag/query', validate('query', ragQuerySchema), ragQueryHandler);
app.post('/api/v1/rag/index-all', async (c) => {
  const result = await indexAllCorpora(c.env);
  return c.json({ ok: true, ...result });
});
app.post('/api/v1/ai-summary', validate('json', aiSummarySchema), aiSummaryHandler);
app.post('/api/v1/copilot/investigate', validate('json', copilotInvestigateSchema), copilotInvestigateHandler);
app.get('/api/v1/copilot/investigate', copilotInvestigateHandler);
app.post('/api/v1/report/build', validate('json', reportBuildSchema), buildReportHandler);
app.get('/api/v1/report/:id', getReportHandler);
app.get('/api/v1/report/:id/stream', streamReportHandler);
app.post('/api/v1/automation/run', validate('json', automationRunSchema), automationRunHandler);
app.get('/api/v1/maltiverse/search', maltiverseSearchHandler);
app.get('/api/v1/inquest/search', inquestSearchHandler);
app.get('/api/v1/hackertarget/dns', hackertargetDnsHandler);
app.get('/api/v1/hackertarget/reverse-ip', hackertargetReverseIpHandler);
app.get('/api/v1/radar/domain', radarDomainHandler);
app.get('/api/v1/certspotter/search', certspotterSearchHandler);
app.get('/api/v1/triage/search', triageSearchHandler);

// ── Report Parser ─────────────────────────────────────────────────
app.post('/api/v1/report/parse', reportParserHandler);
app.post('/api/v1/report/ingest', reportIngestHandler);

// ── IOC Lifecycle ─────────────────────────────────────────────────
app.get('/api/v1/ioc-lifecycle', validate('query', iocLifecycleSchema), iocLifecycleHandler);
app.get('/api/v1/ioc-lifecycle/trending', validate('query', iocTrendingSchema), iocLifecycleTrendingHandler);
app.get('/api/v1/ioc-lifecycle/stats', iocLifecycleStatsHandler);

// ── AI Rule Generator ────────────────────────────────────────────
app.post('/api/v1/rules/generate', validate('json', ruleGenerateSchema), ruleGeneratorHandler);
app.post('/api/v1/rules/validate', validate('json', ruleValidateSchema), ruleValidateHandler);
// Legacy routes for backward compatibility
app.post('/api/v1/yara/generate', validate('json', ruleGenerateSchema), ruleGeneratorHandler);
app.post('/api/v1/yara/validate', validate('json', ruleValidateSchema), ruleValidateHandler);

// ── CT Domain Monitor ────────────────────────────────────────────
app.get('/api/v1/ct-monitor/watched', ctWatchedListHandler);
app.post('/api/v1/ct-monitor/watch', ctWatchAddHandler);
app.delete('/api/v1/ct-monitor/watch/:domain', ctWatchRemoveHandler);
app.get('/api/v1/ct-monitor/certs', validate('query', ctCertsSchema), ctCertsHandler);

// ── TAXII 2.1 Server ────────────────────────────────────────────
app.get('/api/taxii2/', taxiiDiscoveryHandler);
app.get('/api/taxii2/collections/', taxiiCollectionsHandler);
app.get('/api/taxii2/collections/:id/', taxiiCollectionHandler);
app.get('/api/taxii2/collections/:id/objects/', taxiiObjectsHandler);
app.post('/api/taxii2/collections/:id/objects/', taxiiAddObjectsHandler);

// ── Stealer Log Parser ──────────────────────────────────────────
app.post('/api/v1/stealer/parse', stealerParserHandler);

// ── Bloom Filter ─────────────────────────────────────────────────
app.get('/api/v1/bloom/stats', bloomStatsHandler);
app.get('/api/v1/bloom/:type', bloomFilterHandler);
app.post('/api/v1/bloom/check', validate('json', bloomCheckSchema), bloomCheckHandler);

// ── Threat Graph ─────────────────────────────────────────────────
app.get('/api/v1/graph/node/:type/:value', graphNodeHandler);
app.get('/api/v1/graph/path', graphPathHandler);
app.get('/api/v1/graph/communities', graphCommunitiesHandler);
app.get('/api/v1/graph/stats', graphStatsHandler);
app.post('/api/v1/graph/ingest', validate('query', graphIngestSchema), graphIngestManualHandler);

// ── Hunting & IR Tools ─────────────────────────────────────────────
app.post('/api/v1/hunting-queries/generate', validate('json', huntingQuerySchema), huntingQueryHandler);
app.get('/api/v1/sandbox/lookup', sandboxLookupHandler);
// Free "lite 0x12" — multi-provider hash fan-out + public-sandbox deep links.
// Always on; no bridge secret required. See docs/free/sample-scan.md.
app.post('/api/v1/sample/scan', sampleScanHandler);
app.get('/api/v1/sample/scan', sampleScanHandler);
app.post('/api/v1/ir-playbooks/generate', validate('json', irPlaybookSchema), irPlaybookHandler);

// ── Temporal Analysis ────────────────────────────────────────────
app.get('/api/v1/temporal/timeline', temporalTimelineHandler);
app.get('/api/v1/temporal/campaigns', temporalCampaignsHandler);
app.get('/api/v1/temporal/velocity', temporalVelocityHandler);
app.get('/api/v1/temporal/predict', temporalPredictHandler);

// ── Attack Chain ─────────────────────────────────────────────────
app.post('/api/v1/attack-chain/reconstruct', validate('json', attackChainReconstructSchema), attackChainHandler);
app.get('/api/v1/attack-chain/techniques', attackChainTechniquesHandler);

// ── Actor DNA ───────────────────────────────────────────────────
app.post('/api/v1/threat-intel/actor-dna/match', validate('json', actorDnaMatchSchema), actorDnaMatchHandler);
app.get('/api/v1/threat-intel/actor-dna', actorDnaListHandler);
app.get('/api/v1/threat-intel/actor-dna/:actorId', actorDnaGetHandler);
app.get('/api/v1/threat-intel/actor-dna/compare/:actor1/:actor2', actorDnaCompareHandler);

// ── Entity Resolution ──────────────────────────────────────────────
app.get('/api/v1/threat-intel/entities/resolve', entityResolveHandler);
app.post(
  '/api/v1/threat-intel/entities/extract',
  validate('json', threatIntelEntityExtractSchema),
  entityExtractHandler
);
app.post(
  '/api/v1/threat-intel/entities/profile',
  validate('json', threatIntelEntityProfileSchema),
  entityProfileHandler
);

// ── Campaign Lifecycle ──────────────────────────────────────────
app.post('/api/v1/threat-intel/campaign/analyze', validate('json', campaignAnalyzeSchema), campaignAnalyzeHandler);
app.get('/api/v1/threat-intel/campaign/techniques', campaignTechniquesHandler);

// ── Predictive Intelligence ─────────────────────────────────────
app.get('/api/v1/threat-intel/predictive/forecasts', predictiveForecastsHandler);
app.get('/api/v1/threat-intel/predictive/sector-risks', predictiveSectorRisksHandler);
app.post(
  '/api/v1/threat-intel/predictive/attribution',
  validate('json', predictiveAttributionSchema),
  predictiveAttributionHandler
);
app.get('/api/v1/threat-intel/predictive/gaps', predictiveGapsHandler);
app.get('/api/v1/threat-intel/predictive/report', predictiveReportHandler);
app.get('/api/v1/threat-intel/collection-slo', feedStatusHandler);
app.get('/api/v1/threat-intel/pirs', pirListHandler);
app.get('/api/v1/threat-intel/pirs/relevant', pirRelevantHandler);
app.get('/api/v1/threat-intel/pirs/alert', pirAlertHandler);
app.get('/api/v1/threat-intel/pirs/alerts', pirAlertListHandler);
app.get('/api/v1/threat-intel/pirs/routing', pirRoutingHandler);
app.patch('/api/v1/threat-intel/pirs/alerts/:id/acknowledge', validate('json', pirAlertAckSchema), pirAlertAckHandler);
app.post('/api/v1/threat-intel/pirs/alerts/acknowledge-all', pirAlertAckAllHandler);
app.post('/api/v1/threat-intel/pirs', validate('json', pirCreateSchema), pirCreateHandler);
// NOTE: the static `/pirs/*` routes above MUST stay before these `:id` routes —
// Hono matches in registration order, so `/pirs/routing` would otherwise be
// captured by `/pirs/:id` (id="routing") and 404 as "PIR not found".
app.get('/api/v1/threat-intel/pirs/:id', pirDetailHandler);
app.put('/api/v1/threat-intel/pirs/:id', validate('json', pirUpdateSchema), pirUpdateHandler);
app.delete('/api/v1/threat-intel/pirs/:id', pirDeleteHandler);
app.post('/api/v1/threat-intel/feedback', validate('json', threatIntelFeedbackSchema), feedbackCreateHandler);
app.get('/api/v1/threat-intel/feedback', feedbackListHandler);
app.get('/api/v1/threat-intel/feedback/aggregate', feedbackAggregateHandler);
app.delete('/api/v1/threat-intel/feedback/:id', feedbackDeleteHandler);
app.get('/api/v1/source-reliability', sourceReliabilityHandler);
app.get('/api/v1/maturity', maturityHandler);

// ── ACH Generator ───────────────────────────────────────────────
app.post('/api/v1/threat-intel/ach', validate('json', achGenerateSchema), achHandler);

// ── Novelty Detection ──────────────────────────────────────────
app.get('/api/v1/threat-intel/novelty', noveltyHandler);
app.post('/api/v1/threat-intel/novelty/batch', validate('json', noveltyBatchSchema), noveltyBatchHandler);

// ── Intelligence Assessments ────────────────────────────────────
app.get('/api/v1/threat-intel/assessments', assessmentListHandler);
app.post('/api/v1/threat-intel/assessments', validate('json', assessmentSchema), assessmentCreateHandler);
app.get('/api/v1/threat-intel/assessments/:id', assessmentDetailHandler);
app.put('/api/v1/threat-intel/assessments/:id', validate('json', assessmentUpdateSchema), assessmentUpdateHandler);
app.delete('/api/v1/threat-intel/assessments/:id', assessmentDeleteHandler);

// ── Cross-Correlation Intelligence ──────────────────────────────
app.post('/api/v1/threat-intel/correlate', validate('json', correlationSchema), correlateHandler);

// ── Dark Web Economics ──────────────────────────────────────────

// ── Cross-Campaign Correlation ─────────────────────────────────
app.get('/api/v1/threat-intel/cross-campaign/correlations', crossCampaignCorrelationHandler);

// ── Domain Intelligence ──────────────────────────────────────────
app.get('/api/v1/domain-rep', domainRepHandler);
app.get('/api/v1/domain-monitor', domainMonitorHandler);

// ── Domain WHOIS History & Pivot ──────────────────────────────────
app.get('/api/v1/domain/history', domainHistoryHandler);
app.get('/api/v1/domain/history/changes', domainChangesHandler);
app.get('/api/v1/domain/history/pivot', domainPivotHandler);
app.get('/api/v1/domain/history/stats', domainHistoryStatsHandler);
app.get('/api/v1/domain/history/search', domainRegistrantSearchHandler);
app.post('/api/v1/domain/history/snapshot', validate('json', domainSnapshotSchema), domainSnapshotHandler);

// ── Open Directory Scanner ───────────────────────────────────────
app.post('/api/v1/open-dir/scan', validate('json', openDirScanSchema), openDirectoryScanHandler);

// ── Exposed Host Intelligence ────────────────────────────────────
app.get('/api/v1/exposed-host', exposedHostHandler);
app.get('/api/v1/exploit-db', validate('query', exploitDbSchema), exploitDbHandler);
app.get('/api/v1/security-updates', validate('query', securityUpdatesSchema), securityUpdatesHandler);
app.get('/api/v1/cisa-kev', validate('query', cisaKevSchema), cisaKevHandler);
app.get('/api/v1/supply-chain-attacks', validate('query', supplyChainAttacksSchema), supplyChainAttacksHandler);
app.get('/api/v1/k8s-cve', validate('query', k8sCveSchema), k8sCveHandler);
app.get('/api/v1/misp-galaxy-actors', validate('query', mispGalaxyActorsSchema), mispGalaxyActorsHandler);
app.get('/api/v1/cloud-threat-landscape', validate('query', cloudThreatLandscapeSchema), cloudThreatLandscapeHandler);
app.get('/api/v1/ransomwhere', validate('query', ransomwhereSchema), ransomwhereHandler);
app.get('/api/v1/disarm-framework', validate('query', disarmFrameworkSchema), disarmFrameworkHandler);
app.get('/api/v1/attack-flow-library', validate('query', attackFlowLibrarySchema), attackFlowLibraryHandler);
app.get('/api/v1/volexity-threat-intel', validate('query', volexityThreatIntelSchema), volexityThreatIntelHandler);
app.get('/api/v1/passive-dns', validate('query', passiveDnsSchema), passiveDnsLookupHandler);
app.get('/api/v1/github-security', validate('query', githubSecuritySchema), gitHubSecurityHandler);
app.get('/api/v1/predictions', predictionsHandler);

app.get('/api/v1/dashboard', dashboardHandler);
app.get('/api/v1/dashboard/watchlist', getWatchlistHandler);
app.post('/api/v1/dashboard/watchlist', validate('json', watchlistUpdateSchema), updateWatchlistHandler);
app.get('/api/v1/watches', listWatchesHandler);
app.post('/api/v1/watches', validate('json', watchCreateSchema), createWatchHandler);
app.put('/api/v1/watches/:id', validate('json', watchUpdateSchema), updateWatchHandler);
app.delete('/api/v1/watches/:id', deleteWatchHandler);
app.get('/api/v1/watches/log', alertLogHandler);
/* ─── Export Hub ──────────────────────────────────────────────────── */
// Handlers live in routes/export.ts: each parses the body via safeJsonBody
// (400 on malformed input, not a 500), validates the minimal shape it needs,
// and returns a download with the correct Content-Type + Content-Disposition.
app.post('/api/v1/export/stix', exportStixHandler);
app.post('/api/v1/export/misp', exportMispHandler);
app.post('/api/v1/export/sigma', exportSigmaHandler);
app.post('/api/v1/export/yara', exportYaraHandler);
app.post('/api/v1/export/snort', exportSnortHandler);
app.post('/api/v1/export/suricata', exportSuricataHandler);
app.post('/api/v1/export/csv', exportCsvHandler);
app.post('/api/v1/export/pfsense', exportPfSenseHandler);

// Standardized 404 shape: matches the api-error contract ({ error, message })
// so clients get a human-readable message, not just a bare error code.
app.notFound((c) => c.json({ error: 'not_found', message: 'route not found' }, 404));

app.onError(errorHandler);

export default app;
