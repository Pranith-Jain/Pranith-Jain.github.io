import { Hono } from 'hono';
import type { Env } from './env';
import { iocCheckHandler } from './routes/ioc';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/v1/health', (c) => c.json({ ok: true }));
app.get('/api/v1/ioc/check', iocCheckHandler);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
