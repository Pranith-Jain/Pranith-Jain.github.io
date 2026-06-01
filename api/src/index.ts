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
import { privacyInspectHandler } from './routes/privacy';
import { iocFeedSummaryHandler } from './routes/ioc-feeds';
import { cveSearchHandler } from './routes/cve';
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
import { abuseRssHandler } from './routes/abuse-rss';
import { mtiRansomwareRssHandler } from './routes/mti-ransomware-rss';
import { ransomwareMergedRssHandler } from './routes/ransomware-merged-rss';
import { mtiHandler } from './routes/mti';
import { mispProxyHandler } from './routes/misp';
import { waybackCdxHandler } from './routes/wayback';
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
import { negotiationsHandler, negotiationTranscriptHandler } from './routes/negotiations';
import { ransomwareLiveHandler } from './routes/ransomwarelive';
import { writeupsHandler } from './routes/writeups';
import { cybercrimeHandler } from './routes/cybercrime';
import {
  listBriefingsHandler,
  getBriefingHandler,
  todayBriefingHandler,
  buildBriefingHandler,
  backfillBriefingsHandler,
  sweepBriefingsHandler,
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
import { automationRunHandler } from './routes/automation';
import { dashboardHandler, getWatchlistHandler, updateWatchlistHandler } from './routes/dashboard';
import { maltiverseSearchHandler } from './routes/maltiverse';
import { inquestSearchHandler } from './routes/inquest';
import { hackertargetDnsHandler, hackertargetReverseIpHandler } from './routes/hackertarget';
import { radarDomainHandler } from './routes/cloudflare-radar';
import { certspotterSearchHandler } from './routes/certspotter';
import { triageSearchHandler } from './routes/triage';
import { reportParserHandler } from './routes/report-parser';
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
import { requestLogger } from './lib/request-logger';
import { csrfGuard } from './lib/csrf-guard';
import { errorHandler } from './lib/error-handler';
import { serverTiming } from './lib/server-timing';
import { authenticate } from './lib/auth';
import { validate } from './lib/validate';
import { createExternalResourceSchema, telegramCustomChannelSchema } from './lib/schemas';
import { createApiKeyHandler, listApiKeysHandler, revokeApiKeyHandler } from './routes/admin-keys';
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
import { irPlaybookHandler } from './routes/ir-playbooks';
import { aiSummaryHandler } from './routes/ai-summary';
import { leakIxSearchHandler } from './routes/leakix';
import { hostIntelHandler } from './routes/host';
import { proxyNovaSearchHandler } from './routes/proxynova';
import { identityProxyHandler } from './routes/identity-proxy';
import { hudsonRockSearchHandler, hudsonRockDomainHandler } from './routes/hudsonrock';
import { projectDiscoveryHandler } from './routes/projectdiscovery';
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

app.use('/api/v1/*', serverTiming);
app.use('/api/v1/*', csrfGuard);
app.use('/api/v1/*', authenticate('external-only'));
app.use('/api/v1/*', requestLogger);
app.use('/api/v1/*', rateLimit);
app.use('/api/v1/*', apiVersion);
app.use('/api/taxii2/*', rateLimit);

import {
  iocCheckSchema,
  domainLookupSchema,
  ipGeoSchema,
  asnLookupSchema,
  cveLookupSchema,
  mitreTechniqueSchema,
  searchSchema,
  breachEmailSchema,
  breachDomainSchema,
  waybackSchema,
  googleDorksSchema,
  cryptoTraceSchema,
  ctCertsSchema,
  iocLifecycleSchema,
  iocTrendingSchema,
  relationshipGraphSchema,
  unifiedSearchSchema,
  ragQuerySchema,
} from './lib/validation-schemas';

// ── Health Checks ──────────────────────────────────────────────────
import { generateOpenApiSpec } from './lib/openapi';
import { apiVersion } from './lib/api-version';

app.get('/api/v1/health', (c) =>
  c.json({ ok: true, timestamp: new Date().toISOString() }, 200, { 'Cache-Control': 'public, max-age=60' })
);

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
app.post('/api/v1/phishing/analyze', phishingAnalyzeHandler);
app.post('/api/v1/file/analyze', fileAnalyzeHandler);
app.get('/api/v1/feeds/proxy', feedProxyHandler);
app.get('/api/v1/feeds/abuse-rss', abuseRssHandler);
app.get('/api/v1/feeds/mti-ransomware', mtiRansomwareRssHandler);
app.get('/api/v1/feeds/ransomware-merged', ransomwareMergedRssHandler);
app.get('/api/v1/feeds/ioc-summary', iocFeedSummaryHandler);
app.post('/api/v1/cti/parse', ctiParseHandler);
app.post('/api/v1/osv/scan', osvScanHandler);
app.get('/api/v1/privacy/inspect', privacyInspectHandler);
app.get('/api/v1/cve/lookup', validate('query', cveLookupSchema), cveSearchHandler);
app.get('/api/v1/cve/search', validate('query', searchSchema), cveSearchHandler);
app.get('/api/v1/mitre/technique', validate('query', mitreTechniqueSchema), mitreTechniqueHandler);
app.get('/api/v1/atlas/technique', atlasTechniqueHandler);
app.get('/api/v1/asn/lookup', validate('query', asnLookupSchema), asnLookupHandler);
app.get('/api/v1/breach/range', breachRangeHandler);
app.get('/api/v1/breach/email', validate('query', breachEmailSchema), breachEmailHandler);
app.get('/api/v1/breach/domain', validate('query', breachDomainSchema), breachDomainHandler);
app.get('/api/v1/breach/leakix', leakIxSearchHandler);
app.get('/api/v1/breach/proxynova', proxyNovaSearchHandler);
app.get('/api/v1/breach/hudsonrock', hudsonRockSearchHandler);
app.get('/api/v1/breach/hudsonrock/domain', hudsonRockDomainHandler);
app.get('/api/v1/breach/projectdiscovery', projectDiscoveryHandler);
app.get('/api/v1/breach/hackmyip', hackMyIpBreachHandler);
app.get('/api/v1/identity/lookup', identityProxyHandler);
app.get('/api/v1/url-preview', urlPreviewHandler);
app.get('/api/v1/takeover/check', takeoverCheckHandler);
app.get('/api/v1/threat-map', threatMapHandler);
app.get('/api/v1/feeds/aggregate', feedsAggregateHandler);
app.get('/api/v1/rules', detectionRulesHandler);
app.get('/api/v1/deepdarkcti', deepDarkCtiHandler);
app.get('/api/v1/stealer-forum-intel', stealerForumIntelHandler);
app.get('/api/v1/breach-forums', breachForumsHandler);
app.get('/api/v1/negotiations', negotiationsHandler);
app.get('/api/v1/negotiations/:group/:id', negotiationTranscriptHandler);
app.get('/api/v1/rl/:resource', ransomwareLiveHandler);
app.get('/api/v1/rl/:resource/:arg', ransomwareLiveHandler);
app.get('/api/v1/breach-disclosures', breachDisclosuresHandler);
app.get('/api/v1/ransomware-recent', ransomwareRecentHandler);
app.get('/api/v1/ransomware-map', ransomwareMapHandler);
app.get('/api/v1/crypto-trace', validate('query', cryptoTraceSchema), cryptoTraceHandler);
app.get('/api/v1/wayback/cdx', validate('query', waybackSchema), waybackCdxHandler);
app.get('/api/v1/threat-pulse', threatPulseHandler);
app.get('/api/v1/ip-geo', validate('query', ipGeoSchema), ipGeoHandler);
app.get('/api/v1/stix/fetch', stixFetchHandler);
app.get('/api/v1/cert-search', certSearchHandler);
app.get('/api/v1/web-scan', webScanHandler);
app.get('/api/v1/exposure/scan', exposureScanHandler);
app.get('/api/v1/host', hostIntelHandler);
app.get('/api/v1/onion-watch', onionWatchHandler);
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
app.post('/api/v1/telegram-leaks/approve-channel', telegramApproveChannelHandler);
app.post('/api/v1/telegram-leaks/reject-channel', telegramRejectChannelHandler);

// ── Telegram Leak Monitor (Tier 2: Bot API) ──────────────────────────────
app.get('/api/v1/telegram-leaks/bot-webhook-status', telegramLeakBotWebhookStatusHandler);
app.post('/api/v1/telegram-leaks/bot-webhook', telegramLeakBotWebhookHandler);
app.post('/api/v1/telegram-leaks/register-webhook', telegramLeakBotRegisterHandler);

app.get('/api/v1/cve-recent', cveRecentHandler);
app.get('/api/v1/cve-threat-map', cveThreatMapHandler);
app.get('/api/v1/phishing-urls', phishingUrlsHandler);
app.get('/api/v1/malware-samples', malwareSamplesHandler);
app.get('/api/v1/reddit-feed', redditFeedHandler);
app.get('/api/v1/x-feed', xFeedHandler);
app.get('/api/v1/feed-status', feedStatusHandler);
app.get('/api/v1/ioc-correlation', iocCorrelationHandler);
app.get('/api/v1/actor-timeline', actorTimelineHandler);
app.get('/api/v1/victim-releaks', victimReleaksHandler);
app.get('/api/v1/live-iocs', liveIocsHandler);
app.get('/api/v1/detections', detectionsHandler);
app.get('/api/v1/mti', mtiHandler);
app.get('/api/v1/writeups', writeupsHandler);
app.get('/api/v1/c2-tracker', c2TrackerHandler);
app.get('/api/v1/aggregated-feeds', aggregatedFeedsHandler);
app.get('/api/v1/malware-iocs', malwareFamilyListHandler);
app.get('/api/v1/malware-iocs/:family', malwareFamilyDetailHandler);
app.get('/api/v1/feed-catalog', feedCatalogHandler);
app.get('/api/v1/yara-hub', yaraHubListHandler);
app.get('/api/v1/yara-hub/rule/:uuid', yaraHubRuleHandler);
app.get('/api/v1/investigations', listInvestigationsHandler);
app.post('/api/v1/investigations', createInvestigationHandler);
app.get('/api/v1/investigations/:id', getInvestigationHandler);
app.patch('/api/v1/investigations/:id', updateInvestigationHandler);
app.delete('/api/v1/investigations/:id', deleteInvestigationHandler);
app.post('/api/v1/investigations/:id/observables', addObservableHandler);
app.delete('/api/v1/investigations/:id/observables/:observableId', removeObservableHandler);
app.post('/api/v1/investigations/:id/tasks', addTaskHandler);
app.patch('/api/v1/investigations/:id/tasks/:taskId', updateTaskHandler);
app.post('/api/v1/investigations/:id/notes', addNoteHandler);
app.get('/api/v1/feed-scheduler', listFeedJobsHandler);
app.post('/api/v1/feed-scheduler', createFeedJobHandler);
app.patch('/api/v1/feed-scheduler/:id', updateFeedJobHandler);
app.delete('/api/v1/feed-scheduler/:id', deleteFeedJobHandler);
app.post('/api/v1/feed-scheduler/:id/run', runFeedJobHandler);
app.get('/api/v1/feed-scheduler/:id/history', getFeedJobHistoryHandler);
app.get('/api/v1/feed-scheduler-history', getFeedJobsHistoryAllHandler);
app.get('/api/v1/observable-db', listObservablesHandler);
app.get('/api/v1/observable-db/tags', getObservableTagsHandler);
app.get('/api/v1/observable-db/:id', getObservableHandler);
app.post('/api/v1/observable-db', saveObservableHandler);
app.patch('/api/v1/observable-db/:id', updateObservableHandler);
app.delete('/api/v1/observable-db/:id', deleteObservableHandler);
app.post('/api/v1/observable-db/:id/notes', addObservableNoteHandler);
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
app.post('/api/v1/intel-bundle/build', intelBundleBuildHandler);
app.get('/api/v1/intel-bundle/by-id/:bundleId', intelBundleByIdHandler);
app.get('/api/v1/intel-bundle/:id/export.stix.json', intelBundleExportHandler);
app.get('/api/v1/admin/intel-bundle/:source/:ref', intelBundleAdminHandler);
app.get('/api/v1/google-dorks', validate('query', googleDorksSchema), googleDorksHandler);
app.post('/api/v1/misp', mispProxyHandler);
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
app.post('/api/v1/briefings/build', buildBriefingHandler);
app.post('/api/v1/briefings/backfill', backfillBriefingsHandler);
app.post('/api/v1/briefings/sweep', sweepBriefingsHandler);
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
app.post('/api/v1/actor-enrich/otx-stream', actorEnrichOtxStreamHandler);
app.get('/api/v1/certstream', certStreamHandler);
app.post('/api/v1/campaign-generator', campaignGeneratorHandler);
app.get('/api/v1/actor-cves', actorCvesHandler);
app.get('/api/v1/campaigns', listCampaignsHandler);
app.post('/api/v1/campaigns', saveCampaignHandler);
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
app.post('/api/v1/admin/keys', createApiKeyHandler);
app.get('/api/v1/admin/keys', listApiKeysHandler);
app.delete('/api/v1/admin/keys/:id', revokeApiKeyHandler);
app.post('/api/v1/admin/purge', purgeCacheHandler);
app.post('/api/v1/admin/retention/run', runRetentionHandler);
app.get('/api/v1/blocklists/pfsense', blocklistPfSenseHandler);
app.get('/api/v1/blocklists/iptables', blocklistIptablesHandler);
app.get('/api/v1/blocklists/suricata', blocklistSuricataHandler);
app.get('/api/v1/blocklists/meta', blocklistMetaHandler);
app.post('/api/v1/phishing/fetch-page', fetchPageHandler);
app.get('/api/v1/phishing/auto-analyze', phishingAnalyzeAutoHandler);
app.post('/api/v1/phishing/fingerprint', fingerprintHandler);
app.get('/api/v1/unified-search', validate('query', unifiedSearchSchema), unifiedSearchHandler);
app.get('/api/v1/relationship-graph', validate('query', relationshipGraphSchema), relationshipGraphHandler);
app.post('/api/v1/rag/index', ragIndexHandler);
app.get('/api/v1/rag/query', validate('query', ragQuerySchema), ragQueryHandler);
app.post('/api/v1/rag/index-all', async (c) => {
  const result = await indexAllCorpora(c.env);
  return c.json({ ok: true, ...result });
});
app.post('/api/v1/ai-summary', aiSummaryHandler);
app.post('/api/v1/copilot/investigate', copilotInvestigateHandler);
app.get('/api/v1/copilot/investigate', copilotInvestigateHandler);
app.post('/api/v1/automation/run', automationRunHandler);
app.get('/api/v1/maltiverse/search', maltiverseSearchHandler);
app.get('/api/v1/inquest/search', inquestSearchHandler);
app.get('/api/v1/hackertarget/dns', hackertargetDnsHandler);
app.get('/api/v1/hackertarget/reverse-ip', hackertargetReverseIpHandler);
app.get('/api/v1/radar/domain', radarDomainHandler);
app.get('/api/v1/certspotter/search', certspotterSearchHandler);
app.get('/api/v1/triage/search', triageSearchHandler);

// ── Report Parser ─────────────────────────────────────────────────
app.post('/api/v1/report/parse', reportParserHandler);

// ── IOC Lifecycle ─────────────────────────────────────────────────
app.get('/api/v1/ioc-lifecycle', validate('query', iocLifecycleSchema), iocLifecycleHandler);
app.get('/api/v1/ioc-lifecycle/trending', validate('query', iocTrendingSchema), iocLifecycleTrendingHandler);
app.get('/api/v1/ioc-lifecycle/stats', iocLifecycleStatsHandler);

// ── AI Rule Generator ────────────────────────────────────────────
app.post('/api/v1/rules/generate', ruleGeneratorHandler);
app.post('/api/v1/rules/validate', ruleValidateHandler);
// Legacy routes for backward compatibility
app.post('/api/v1/yara/generate', ruleGeneratorHandler);
app.post('/api/v1/yara/validate', ruleValidateHandler);

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
app.post('/api/v1/bloom/check', bloomCheckHandler);

// ── Threat Graph ─────────────────────────────────────────────────
app.get('/api/v1/graph/node/:type/:value', graphNodeHandler);
app.get('/api/v1/graph/path', graphPathHandler);
app.get('/api/v1/graph/communities', graphCommunitiesHandler);
app.get('/api/v1/graph/stats', graphStatsHandler);
app.post('/api/v1/graph/ingest', graphIngestManualHandler);

// ── Hunting & IR Tools ─────────────────────────────────────────────
app.post('/api/v1/hunting-queries/generate', huntingQueryHandler);
app.get('/api/v1/sandbox/lookup', sandboxLookupHandler);
app.post('/api/v1/ir-playbooks/generate', irPlaybookHandler);

// ── Temporal Analysis ────────────────────────────────────────────
app.get('/api/v1/temporal/timeline', temporalTimelineHandler);
app.get('/api/v1/temporal/campaigns', temporalCampaignsHandler);
app.get('/api/v1/temporal/velocity', temporalVelocityHandler);
app.get('/api/v1/temporal/predict', temporalPredictHandler);

// ── Attack Chain ─────────────────────────────────────────────────
app.post('/api/v1/attack-chain/reconstruct', attackChainHandler);
app.get('/api/v1/attack-chain/techniques', attackChainTechniquesHandler);

// ── Actor DNA ───────────────────────────────────────────────────
app.post('/api/v1/threat-intel/actor-dna/match', actorDnaMatchHandler);
app.get('/api/v1/threat-intel/actor-dna', actorDnaListHandler);
app.get('/api/v1/threat-intel/actor-dna/:actorId', actorDnaGetHandler);
app.get('/api/v1/threat-intel/actor-dna/compare/:actor1/:actor2', actorDnaCompareHandler);

// ── Entity Resolution ──────────────────────────────────────────────
app.get('/api/v1/threat-intel/entities/resolve', entityResolveHandler);
app.post('/api/v1/threat-intel/entities/extract', entityExtractHandler);
app.post('/api/v1/threat-intel/entities/profile', entityProfileHandler);

// ── Campaign Lifecycle ──────────────────────────────────────────
app.post('/api/v1/threat-intel/campaign/analyze', campaignAnalyzeHandler);
app.get('/api/v1/threat-intel/campaign/techniques', campaignTechniquesHandler);

// ── Predictive Intelligence ─────────────────────────────────────
app.get('/api/v1/threat-intel/predictive/forecasts', predictiveForecastsHandler);
app.get('/api/v1/threat-intel/predictive/sector-risks', predictiveSectorRisksHandler);
app.post('/api/v1/threat-intel/predictive/attribution', predictiveAttributionHandler);
app.get('/api/v1/threat-intel/predictive/gaps', predictiveGapsHandler);
app.get('/api/v1/threat-intel/predictive/report', predictiveReportHandler);
app.get('/api/v1/threat-intel/collection-slo', feedStatusHandler);
app.get('/api/v1/threat-intel/pirs', pirListHandler);
app.get('/api/v1/threat-intel/pirs/relevant', pirRelevantHandler);
app.get('/api/v1/threat-intel/pirs/alert', pirAlertHandler);
app.get('/api/v1/threat-intel/pirs/alerts', pirAlertListHandler);
app.get('/api/v1/threat-intel/pirs/routing', pirRoutingHandler);
app.patch('/api/v1/threat-intel/pirs/alerts/:id/acknowledge', pirAlertAckHandler);
app.post('/api/v1/threat-intel/pirs/alerts/acknowledge-all', pirAlertAckAllHandler);
app.post('/api/v1/threat-intel/pirs', pirCreateHandler);
// NOTE: the static `/pirs/*` routes above MUST stay before these `:id` routes —
// Hono matches in registration order, so `/pirs/routing` would otherwise be
// captured by `/pirs/:id` (id="routing") and 404 as "PIR not found".
app.get('/api/v1/threat-intel/pirs/:id', pirDetailHandler);
app.put('/api/v1/threat-intel/pirs/:id', pirUpdateHandler);
app.delete('/api/v1/threat-intel/pirs/:id', pirDeleteHandler);
app.post('/api/v1/threat-intel/feedback', feedbackCreateHandler);
app.get('/api/v1/threat-intel/feedback', feedbackListHandler);
app.get('/api/v1/threat-intel/feedback/aggregate', feedbackAggregateHandler);
app.delete('/api/v1/threat-intel/feedback/:id', feedbackDeleteHandler);
app.get('/api/v1/source-reliability', sourceReliabilityHandler);
app.get('/api/v1/maturity', maturityHandler);

// ── ACH Generator ───────────────────────────────────────────────
app.post('/api/v1/threat-intel/ach', achHandler);

// ── Novelty Detection ──────────────────────────────────────────
app.get('/api/v1/threat-intel/novelty', noveltyHandler);
app.post('/api/v1/threat-intel/novelty/batch', noveltyBatchHandler);

// ── Intelligence Assessments ────────────────────────────────────
app.get('/api/v1/threat-intel/assessments', assessmentListHandler);
app.post('/api/v1/threat-intel/assessments', assessmentCreateHandler);
app.get('/api/v1/threat-intel/assessments/:id', assessmentDetailHandler);
app.put('/api/v1/threat-intel/assessments/:id', assessmentUpdateHandler);
app.delete('/api/v1/threat-intel/assessments/:id', assessmentDeleteHandler);

// ── Cross-Correlation Intelligence ──────────────────────────────
app.post('/api/v1/threat-intel/correlate', correlateHandler);

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
app.post('/api/v1/domain/history/snapshot', domainSnapshotHandler);

// ── Open Directory Scanner ───────────────────────────────────────
app.post('/api/v1/open-dir/scan', openDirectoryScanHandler);

// ── Exposed Host Intelligence ────────────────────────────────────
app.get('/api/v1/exposed-host', exposedHostHandler);

app.get('/api/v1/dashboard', dashboardHandler);
app.get('/api/v1/dashboard/watchlist', getWatchlistHandler);
app.post('/api/v1/dashboard/watchlist', updateWatchlistHandler);
app.get('/api/v1/watches', listWatchesHandler);
app.post('/api/v1/watches', createWatchHandler);
app.put('/api/v1/watches/:id', updateWatchHandler);
app.delete('/api/v1/watches/:id', deleteWatchHandler);
app.get('/api/v1/watches/log', alertLogHandler);
app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError(errorHandler);

export default app;
