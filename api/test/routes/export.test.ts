import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import {
  exportStixHandler,
  exportMispHandler,
  exportSigmaHandler,
  exportYaraHandler,
  exportSnortHandler,
  exportSuricataHandler,
  exportCsvHandler,
  exportPfSenseHandler,
} from '../../src/routes/export';

function setup() {
  const app = new Hono<{ Bindings: Env }>();
  app.post('/api/v1/export/stix', exportStixHandler);
  app.post('/api/v1/export/misp', exportMispHandler);
  app.post('/api/v1/export/sigma', exportSigmaHandler);
  app.post('/api/v1/export/yara', exportYaraHandler);
  app.post('/api/v1/export/snort', exportSnortHandler);
  app.post('/api/v1/export/suricata', exportSuricataHandler);
  app.post('/api/v1/export/csv', exportCsvHandler);
  app.post('/api/v1/export/pfsense', exportPfSenseHandler);
  return app;
}

function post(app: Hono<{ Bindings: Env }>, path: string, body: string) {
  return app.request(path, { method: 'POST', body, headers: { 'content-type': 'application/json' } }, {} as Env);
}

const ioc = {
  value: '1.2.3.4',
  type: 'ip',
  confidence: 90,
  first_seen: '2026-01-01T00:00:00Z',
  last_seen: '2026-01-02T00:00:00Z',
  tags: ['c2'],
  source: 'test',
};

describe('export hub routes', () => {
  it('STIX: array body → 200 JSON download', async () => {
    const app = setup();
    const r = await post(app, '/api/v1/export/stix', JSON.stringify([ioc]));
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/json');
    expect(r.headers.get('content-disposition')).toContain('ioc-export.stix.json');
    const bundle = (await r.json()) as { type: string; objects: unknown[] };
    expect(bundle.type).toBe('bundle');
    expect(bundle.objects.length).toBeGreaterThan(0);
  });

  it('CSV: array body → 200 text/csv download', async () => {
    const app = setup();
    const r = await post(app, '/api/v1/export/csv', JSON.stringify([ioc]));
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/csv');
    expect(r.headers.get('content-disposition')).toContain('ioc-export.csv');
    expect(await r.text()).toContain('1.2.3.4');
  });

  it('YARA: object body with name → 200 .yar download', async () => {
    const app = setup();
    const r = await post(
      app,
      '/api/v1/export/yara',
      JSON.stringify({ name: 'rule1', hash_iocs: ['abc'], string_iocs: ['evil'] })
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toContain('detection.yar');
    expect(await r.text()).toContain('rule rule1');
  });

  it('malformed JSON → 400 (not 500)', async () => {
    const app = setup();
    const r = await post(app, '/api/v1/export/stix', '{not json');
    expect(r.status).toBe(400);
  });

  it('wrong shape (object where array expected) → 400', async () => {
    const app = setup();
    const r = await post(app, '/api/v1/export/csv', JSON.stringify({ not: 'an array' }));
    expect(r.status).toBe(400);
  });

  it('MISP: missing iocs array → 400', async () => {
    const app = setup();
    const r = await post(app, '/api/v1/export/misp', JSON.stringify({ event_name: 'x' }));
    expect(r.status).toBe(400);
  });

  it('Sigma: missing name → 400', async () => {
    const app = setup();
    const r = await post(app, '/api/v1/export/sigma', JSON.stringify({ iocs: [ioc] }));
    expect(r.status).toBe(400);
  });

  it('Snort/Suricata/pfSense: happy path → 200 downloads', async () => {
    const app = setup();
    const snort = await post(app, '/api/v1/export/snort', JSON.stringify({ name: 'n', ip_iocs: ['1.2.3.4'] }));
    expect(snort.status).toBe(200);
    expect(snort.headers.get('content-disposition')).toContain('detection.snort.rules');

    const suricata = await post(app, '/api/v1/export/suricata', JSON.stringify({ name: 'n', ip_iocs: ['1.2.3.4'] }));
    expect(suricata.status).toBe(200);
    expect(suricata.headers.get('content-disposition')).toContain('detection.suricata.rules');

    const pf = await post(app, '/api/v1/export/pfsense', JSON.stringify([ioc]));
    expect(pf.status).toBe(200);
    expect(pf.headers.get('content-disposition')).toContain('pfsense-alias.txt');
    expect(await pf.text()).toContain('1.2.3.4');
  });
});
