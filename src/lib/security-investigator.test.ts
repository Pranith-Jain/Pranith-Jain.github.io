/**
 * Tests for the Security Investigator typed HTTP client.
 * Run via: npx vitest run src/lib/security-investigator.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSiClient, SiClientError } from './security-investigator';

function makeJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
}

function makeFetchMock(handler: (input: string, init?: RequestInit) => Promise<Response> | Response): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  }) as unknown as typeof fetch;
}

describe('createSiClient', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('index() GETs /index and parses JSON', async () => {
    const data = { source: 'test', counts: { skills: 1, queries: 0, automations: 0 }, skills: [], queries: [], automations: [] };
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/si/index');
      return makeJsonResponse(data);
    });
    const c = createSiClient({ fetch: fetchMock });
    const out = await c.index();
    expect(out).toEqual(data);
  });

  it('listSkills() forwards query params', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/si/skills?category=Quick+Scan&limit=10');
      return makeJsonResponse({ total: 0, returned: 0, skills: [] });
    });
    await createSiClient({ fetch: fetchMock }).listSkills({ category: 'Quick Scan', limit: 10 });
  });

  it('getSkill() URL-encodes the slug', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/si/skills/threat%2Fpulse');
      return makeJsonResponse({ slug: 'threat/pulse', bodyMarkdown: 'x' });
    });
    await createSiClient({ fetch: fetchMock }).getSkill('threat/pulse');
  });

  it('renderSvg({slug}) returns raw text', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/si/render?slug=threat-pulse&format=svg');
      return new Response(svg, { status: 200, headers: { 'content-type': 'image/svg+xml' } });
    });
    const out = await createSiClient({ fetch: fetchMock }).renderSvg({ slug: 'threat-pulse' });
    expect(out).toBe(svg);
  });

  it('renderSvg({manifest, data}) POSTs JSON', async () => {
    const fetchMock = makeFetchMock(async (u, init) => {
      expect(u).toBe('/api/v1/si/render');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body));
      expect(body.manifest.widgets).toEqual([]);
      return makeJsonResponse({ svg: '<svg/>', bytes: 6, widgetCount: 0 });
    });
    const out = await createSiClient({ fetch: fetchMock }).renderSvg({ manifest: { widgets: [] }, data: {} });
    expect((out as { svg: string }).svg).toBe('<svg/>');
  });

  it('renderSvg with no slug/manifest throws SiClientError 400', async () => {
    const fetchMock = makeFetchMock(() => makeJsonResponse({}));
    await expect(createSiClient({ fetch: fetchMock }).renderSvg({})).rejects.toBeInstanceOf(SiClientError);
  });

  it('HTTP 404 surfaces as SiClientError with status + body', async () => {
    const fetchMock = makeFetchMock(() => makeJsonResponse({ error: 'skill_not_found' }, { status: 404 }));
    try {
      await createSiClient({ fetch: fetchMock }).getSkill('nope');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(SiClientError);
      const err = e as SiClientError;
      expect(err.status).toBe(404);
      expect(err.message).toBe('skill_not_found');
    }
  });

  it('renderPng() requires a slug', async () => {
    const fetchMock = makeFetchMock(() => makeJsonResponse({}));
    await expect(createSiClient({ fetch: fetchMock }).renderPng({})).rejects.toBeInstanceOf(SiClientError);
  });

  it('routingPrompt() returns the markdown', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/si/routing-prompt');
      return makeJsonResponse({ bytes: 5, promptMarkdown: 'hello' });
    });
    const out = await createSiClient({ fetch: fetchMock }).routingPrompt();
    expect(out.promptMarkdown).toBe('hello');
  });

  it('streamSkill() returns text + meta from X-SI-* headers', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/si/skills/threat-pulse?stream=true&from_line=0&max_lines=10');
      return new Response('line1\nline2\nline3', {
        status: 200,
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'X-SI-Start-Line': '0',
          'X-SI-End-Line': '3',
          'X-SI-Total-Lines': '42',
          'X-SI-Bytes': '17',
        },
      });
    });
    const out = await createSiClient({ fetch: fetchMock }).streamSkill('threat-pulse', { fromLine: 0, maxLines: 10 });
    expect(out.text).toBe('line1\nline2\nline3');
    expect(out.meta.startLine).toBe(0);
    expect(out.meta.endLine).toBe(3);
    expect(out.meta.totalLines).toBe(42);
  });

  it('streamDoc() surfaces title + slug from headers', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/si/docs/dfir-playbook?stream=true&from_line=0');
      return new Response('# Title', {
        status: 200,
        headers: {
          'X-SI-Title': 'DFIR Playbook',
          'X-SI-Slug': 'dfir-playbook',
          'X-SI-Start-Line': '0',
          'X-SI-End-Line': '1',
          'X-SI-Total-Lines': '120',
        },
      });
    });
    const out = await createSiClient({ fetch: fetchMock }).streamDoc('dfir-playbook');
    expect(out.meta.title).toBe('DFIR Playbook');
    expect(out.meta.slug).toBe('dfir-playbook');
  });

  it('streamQuery() URL-encodes the slug', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/si/query?slug=cloud%2Fagent365&stream=true&from_line=0');
      return new Response('q', { status: 200, headers: { 'X-SI-Total-Lines': '1' } });
    });
    await createSiClient({ fetch: fetchMock }).streamQuery('cloud/agent365');
  });

  it('streamSkill() 404 surfaces as SiClientError', async () => {
    const fetchMock = makeFetchMock(() => new Response('not found', { status: 404 }));
    await expect(createSiClient({ fetch: fetchMock }).streamSkill('nope')).rejects.toBeInstanceOf(SiClientError);
  });

  it('listScripts() returns the scripts index', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/si/scripts');
      return makeJsonResponse({ total: 5, returned: 5, scripts: [{ name: 'Deploy-CustomDetections.ps1', sizeBytes: 12597 }] });
    });
    const out = await createSiClient({ fetch: fetchMock }).listScripts();
    expect(out.total).toBe(5);
    expect(out.scripts[0].name).toContain('.ps1');
  });

  it('getScript() returns the body as text', async () => {
    const fetchMock = makeFetchMock((u) => {
      expect(u).toBe('/api/v1/si/scripts/Invoke-MitreScan.ps1');
      return new Response('# PowerShell script body', {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-SI-Bytes': '23' },
      });
    });
    const out = await createSiClient({ fetch: fetchMock }).getScript('Invoke-MitreScan.ps1');
    expect(out.body).toBe('# PowerShell script body');
    expect(out.bytes).toBe(23);
  });
});
