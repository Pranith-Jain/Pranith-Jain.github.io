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

const app = new Hono<{ Bindings: Env }>();

app.get('/api/v1/health', (c) => c.json({ ok: true }));
app.get('/api/v1/ioc/check', iocCheckHandler);
app.get('/api/v1/domain/lookup', domainLookupHandler);
app.post('/api/v1/phishing/analyze', phishingAnalyzeHandler);
app.get('/api/v1/exposure/scan', exposureScanHandler);
app.post('/api/v1/file/analyze', fileAnalyzeHandler);
app.get('/api/v1/feeds/proxy', feedProxyHandler);
app.post('/api/v1/cti/parse', ctiParseHandler);
app.get('/api/v1/privacy/inspect', privacyInspectHandler);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
