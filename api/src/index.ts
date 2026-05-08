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
app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
