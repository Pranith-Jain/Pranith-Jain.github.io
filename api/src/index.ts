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
import { githubReconHandler } from './routes/github-recon';
import { ipGeoHandler } from './routes/ip-geo';
import { stixFetchHandler } from './routes/stix-fetch';
import {
  listBriefingsHandler,
  getBriefingHandler,
  todayBriefingHandler,
  buildBriefingHandler,
  backfillBriefingsHandler,
  sweepBriefingsHandler,
} from './routes/briefings';
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
app.get('/api/v1/asn/lookup', asnLookupHandler);
app.get('/api/v1/breach/range', breachRangeHandler);
app.get('/api/v1/breach/email', breachEmailHandler);
app.get('/api/v1/breach/domain', breachDomainHandler);
app.get('/api/v1/url-preview', urlPreviewHandler);
app.get('/api/v1/takeover/check', takeoverCheckHandler);
app.get('/api/v1/threat-map', threatMapHandler);
app.get('/api/v1/feeds/aggregate', feedsAggregateHandler);
app.get('/api/v1/rules', detectionRulesHandler);
app.get('/api/v1/breach-disclosures', breachDisclosuresHandler);
app.get('/api/v1/ransomware-recent', ransomwareRecentHandler);
app.get('/api/v1/crypto-trace', cryptoTraceHandler);
app.get('/api/v1/wayback/cdx', waybackCdxHandler);
app.get('/api/v1/github-recon', githubReconHandler);
app.get('/api/v1/ip-geo', ipGeoHandler);
app.get('/api/v1/stix/fetch', stixFetchHandler);
app.get('/api/v1/briefings/list', listBriefingsHandler);
app.get('/api/v1/briefings/today', todayBriefingHandler);
app.post('/api/v1/briefings/build', buildBriefingHandler);
app.post('/api/v1/briefings/backfill', backfillBriefingsHandler);
app.post('/api/v1/briefings/sweep', sweepBriefingsHandler);
app.get('/api/v1/briefings/:slug', getBriefingHandler);
app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
