import { Hono } from 'hono';
import type { Env } from './env';
import { iocCheckHandler } from './routes/ioc';
import { domainLookupHandler } from './routes/domain';
import { phishingAnalyzeHandler } from './routes/phishing';
import { exposureScanHandler } from './routes/exposure';
import { fileAnalyzeHandler } from './routes/file';
import { feedProxyHandler } from './routes/feeds';
import { ctiParseHandler } from './routes/cti';
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
import { cryptoTraceHandler } from './routes/crypto-trace';
import { abuseRssHandler } from './routes/abuse-rss';
import { waybackCdxHandler } from './routes/wayback';
import { threatPulseHandler } from './routes/threat-pulse';
import { ipGeoHandler } from './routes/ip-geo';
import { stixFetchHandler } from './routes/stix-fetch';
import { certSearchHandler } from './routes/cert-search';
import { webScanHandler } from './routes/web-scan';
import { onionWatchHandler } from './routes/onion-watch';
import { telegramFeedHandler } from './routes/telegram-feed';
import { cveRecentHandler } from './routes/cve-recent';
import { phishingUrlsHandler } from './routes/phishing-urls';
import { malwareSamplesHandler } from './routes/malware-samples';
import { redditFeedHandler } from './routes/reddit-feed';
import { xFeedHandler } from './routes/x-feed';
import { feedStatusHandler } from './routes/feed-status';
import { iocCorrelationHandler } from './routes/ioc-correlation';
import { iocCorrelationStixHandler } from './routes/ioc-correlation-stix';
import { actorTimelineHandler } from './routes/actor-timeline';
import { victimReleaksHandler } from './routes/victim-releaks';
import { liveIocsHandler } from './routes/live-iocs';
import { deepDarkCtiHandler } from './routes/deepdarkcti';
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
} from './routes/briefings';
import { briefingsRssHandler } from './routes/briefings-rss';
import {
  listExternalResourcesHandler,
  createExternalResourceHandler,
  deleteExternalResourceHandler,
} from './routes/external-resources';
import { snapshotHandler } from './routes/snapshot';
import { iocSnapshotHandler } from './routes/ioc-snapshot';
import { registerBlogRoutes } from './routes/blog-public';
import { registerAdminRoutes } from './routes/case-study-admin';
import { c2TrackerHandler } from './routes/c2-tracker';
import { rateLimit } from './lib/ratelimit';

const app = new Hono<{ Bindings: Env }>();

app.use('/api/v1/*', rateLimit);

app.get('/api/v1/health', (c) => c.json({ ok: true }, 200, { 'Cache-Control': 'public, max-age=60' }));
app.get('/api/v1/ioc/check', iocCheckHandler);
app.get('/api/v1/domain/lookup', domainLookupHandler);
app.post('/api/v1/phishing/analyze', phishingAnalyzeHandler);
app.get('/api/v1/exposure/scan', exposureScanHandler);
app.post('/api/v1/file/analyze', fileAnalyzeHandler);
app.get('/api/v1/feeds/proxy', feedProxyHandler);
app.get('/api/v1/feeds/abuse-rss', abuseRssHandler);
app.get('/api/v1/feeds/ioc-summary', iocFeedSummaryHandler);
app.post('/api/v1/cti/parse', ctiParseHandler);
app.get('/api/v1/privacy/inspect', privacyInspectHandler);
app.get('/api/v1/cve/lookup', cveSearchHandler);
app.get('/api/v1/cve/search', cveSearchHandler);
app.get('/api/v1/mitre/technique', mitreTechniqueHandler);
app.get('/api/v1/atlas/technique', atlasTechniqueHandler);
app.get('/api/v1/asn/lookup', asnLookupHandler);
app.get('/api/v1/breach/range', breachRangeHandler);
app.get('/api/v1/breach/email', breachEmailHandler);
app.get('/api/v1/breach/domain', breachDomainHandler);
app.get('/api/v1/url-preview', urlPreviewHandler);
app.get('/api/v1/takeover/check', takeoverCheckHandler);
app.get('/api/v1/threat-map', threatMapHandler);
app.get('/api/v1/feeds/aggregate', feedsAggregateHandler);
app.get('/api/v1/rules', detectionRulesHandler);
app.get('/api/v1/deepdarkcti', deepDarkCtiHandler);
app.get('/api/v1/rl/:resource', ransomwareLiveHandler);
app.get('/api/v1/rl/:resource/:arg', ransomwareLiveHandler);
app.get('/api/v1/breach-disclosures', breachDisclosuresHandler);
app.get('/api/v1/ransomware-recent', ransomwareRecentHandler);
app.get('/api/v1/crypto-trace', cryptoTraceHandler);
app.get('/api/v1/wayback/cdx', waybackCdxHandler);
app.get('/api/v1/threat-pulse', threatPulseHandler);
app.get('/api/v1/ip-geo', ipGeoHandler);
app.get('/api/v1/stix/fetch', stixFetchHandler);
app.get('/api/v1/cert-search', certSearchHandler);
app.get('/api/v1/web-scan', webScanHandler);
app.get('/api/v1/onion-watch', onionWatchHandler);
app.get('/api/v1/telegram-feed', telegramFeedHandler);
app.get('/api/v1/cve-recent', cveRecentHandler);
app.get('/api/v1/phishing-urls', phishingUrlsHandler);
app.get('/api/v1/malware-samples', malwareSamplesHandler);
app.get('/api/v1/reddit-feed', redditFeedHandler);
app.get('/api/v1/x-feed', xFeedHandler);
app.get('/api/v1/feed-status', feedStatusHandler);
app.get('/api/v1/ioc-correlation', iocCorrelationHandler);
app.get('/api/v1/ioc-correlation/stix.json', iocCorrelationStixHandler);
app.get('/api/v1/actor-timeline', actorTimelineHandler);
app.get('/api/v1/victim-releaks', victimReleaksHandler);
app.get('/api/v1/live-iocs', liveIocsHandler);
app.get('/api/v1/writeups', writeupsHandler);
app.get('/api/v1/c2-tracker', c2TrackerHandler);
app.get('/api/v1/cyber-crime', cybercrimeHandler);
app.get('/api/v1/snapshot', snapshotHandler);
app.get('/api/v1/ioc-snapshot', iocSnapshotHandler);
app.get('/api/v1/briefings/list', listBriefingsHandler);
app.get('/api/v1/briefings/rss', briefingsRssHandler);
app.get('/api/v1/briefings/today', todayBriefingHandler);
app.post('/api/v1/briefings/build', buildBriefingHandler);
app.post('/api/v1/briefings/backfill', backfillBriefingsHandler);
app.post('/api/v1/briefings/sweep', sweepBriefingsHandler);
app.get('/api/v1/briefings/:slug', getBriefingHandler);
app.get('/api/v1/external-resources', listExternalResourcesHandler);
app.post('/api/v1/external-resources', createExternalResourceHandler);
app.delete('/api/v1/external-resources/:id', deleteExternalResourceHandler);
registerBlogRoutes(app);
registerAdminRoutes(app);
app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
