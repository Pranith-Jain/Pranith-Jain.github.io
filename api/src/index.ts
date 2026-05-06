import { Hono } from 'hono';
import type { Env } from './env';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/v1/health', (c) => c.json({ ok: true }));

app.notFound((c) => c.json({ error: 'not_found' }, 404));

export default app;
