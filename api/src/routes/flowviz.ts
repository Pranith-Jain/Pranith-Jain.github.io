/**
 * FlowViz edge tools — AI attack-flow visualization (port).
 *
 * Upstream: github.com/davidljohnson/flowviz (MIT).
 * This is an edge-native reimplementation, NOT a lift-and-shift:
 *
 *  • Express → Hono; node-fetch → global fetch; jsdom+Readability →
 *    dependency-free readability-lite (regex tag strip + largest-paragraph
 *    cluster); express-rate-limit → platform global rateLimit middleware;
 *    winston → logger; dotenv/process.env → Worker env/secrets.
 *  • Ollama provider does NOT port (dials 127.0.0.1:11434). The edge
 *    analysis path uses the platform runCompletion chain
 *    (gemini → groq → nvidia → Workers AI) via
 *    api/src/case-study/generation/ai-client.ts — BYOK provider keys are
 *    unnecessary; the platform's keys/quotas apply.
 *  • Upstream streams raw provider SSE deltas; runCompletion is unary, so
 *    /analyze-stream emits `progress` events + a single `done` event with
 *    the full graph. The SPA renders incrementally from the ordered arrays
 *    (upstream already orders nodes chronologically for this purpose).
 *
 * Endpoints (all under /api/v1/flowviz/):
 *   GET  /flowviz/                  — index + attribution
 *   GET  /flowviz/techniques        — ATT&CK technique search (?q=&tactic=&limit=)
 *   GET  /flowviz/fetch-article     — SSRF-guarded article fetch (?url=)
 *   POST /flowviz/analyze           — JSON analysis {text|url} → {graph, validation, modelUsed}
 *   POST /flowviz/analyze-stream    — SSE progress + done
 *   POST /flowviz/assistant         — graph Q&A / edit ops {graph, prompt, contexts?, sourceText?}
 *   POST /flowviz/validate          — structural validation {graph, articleText?}
 *
 * Auth: global 'external-only' gate applies (same-origin SPA passthrough,
 * external callers need an API key). LLM-backed POSTs are additionally
 * throttled by the global rate limiter.
 *
 * MITRE ATT&CK® is a registered trademark of The MITRE Corporation.
 * FlowViz is not affiliated with or endorsed by MITRE.
 */
import { Hono } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, internalError, badGateway } from '../lib/api-error';
import { safeJsonBody } from '../lib/safe-body';
import { sseStream } from '../lib/sse';
import {
  buildFlowvizAnalysisPrompt,
  buildFlowvizAssistantPrompt,
  FLOWVIZ_DEFAULT_SYSTEM,
  FLOWVIZ_MAX_ARTICLE_CHARS,
} from '../lib/flowviz-prompt';
import {
  flowvizSecureFetch,
  parseFlowvizJson,
  validateFlowvizGraph,
} from '../lib/flowviz-validate';
import { runCompletion } from '../case-study/generation/ai-client';
import { fenceUntrusted, UNTRUSTED_DATA_SYSTEM_NOTE } from '../lib/prompt-fence';

const SOURCE = 'FlowViz (edge port) — upstream github.com/davidljohnson/flowviz (MIT)';
const SOURCE_URL = 'https://github.com/davidljohnson/flowviz';
const LICENSE = 'MIT — © David L. Johnson (upstream); ATT&CK® © The MITRE Corporation.';
const MAX_INPUT_CHARS = 60000;
const MAX_URL_CHARS = 2000;

async function loadFlowvizMod() {
  return await import('../lib/flowviz-manifest');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCodePoint(Math.min(parseInt(n, 10), 0x10ffff));
      } catch {
        return '';
      }
    });
}

/**
 * Readability-lite: title + largest paragraph cluster. No DOM deps —
 * pure regex over the raw HTML (scripts/styles/comments stripped first).
 */
export function extractArticleLite(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]{1,500})<\/title>/i);
  const title = titleMatch?.[1] ? decodeEntities(titleMatch[1].replace(/<[^>]*>/g, '').trim()) : '';
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript\s*>/gi, ' ');
  // Prefer <article> contents when present (optional attribute group —
  // a bare `<article>` tag has zero chars before `>`, which a
  // `[\s\S]{1,200}?` shim would mis-consume into the first child tag).
  const articleMatch = cleaned.match(/<article(?:\s[^>]*)?>([\s\S]{500,}?)<\/article\s*>/i);
  const scope = articleMatch?.[1] ?? cleaned;
  const paragraphs = [...scope.matchAll(/<p[^>]*>([\s\S]{40,8000}?)<\/p\s*>/gi)]
    .map((m) => decodeEntities(m[1]!.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()))
    .filter((p) => p.length >= 40);
  if (paragraphs.length === 0) {
    const fallback = decodeEntities(
      scope
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    ).slice(0, FLOWVIZ_MAX_ARTICLE_CHARS);
    return { title, text: fallback };
  }
  // Largest contiguous cluster of long paragraphs (avoids nav/footer islands).
  let best: string[] = [];
  let cur: string[] = [];
  let bestLen = 0;
  let curLen = 0;
  for (const p of paragraphs) {
    if (p.length >= 80) {
      cur.push(p);
      curLen += p.length;
    } else {
      if (curLen > bestLen) {
        best = cur;
        bestLen = curLen;
      }
      cur = [];
      curLen = 0;
    }
  }
  if (curLen > bestLen) best = cur;
  const picked = (best.length > 0 ? best : paragraphs.slice(0, 40)).join('\n\n');
  return { title, text: picked.slice(0, FLOWVIZ_MAX_ARTICLE_CHARS) };
}

export const flowvizRouter = new Hono<{ Bindings: Env }>();

flowvizRouter.get('/flowviz/', async (c) => {
  try {
    const mod = await loadFlowvizMod();
    const all = await mod.loadFlowvizTechniques(c.env.ASSETS);
    return c.json({
      source: SOURCE,
      source_url: SOURCE_URL,
      license: LICENSE,
      techniqueCount: all.length,
      nodeTypes: ['action', 'tool', 'malware', 'asset', 'infrastructure', 'url', 'vulnerability', 'AND_operator', 'OR_operator'],
      edgeLabels: ['Uses', 'Targets', 'Communicates with', 'Connects to', 'Affects', 'Leads to'],
      exports: ['png', 'stix21', 'afb', 'flowviz-json'],
      notes: 'Ollama provider is self-host-only and not available on the edge. Analysis runs through the platform LLM chain.',
    });
  } catch (e) {
    logError('flowviz index failed', e);
    return internalError(c, `flowviz_index_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

flowvizRouter.get('/flowviz/techniques', async (c) => {
  try {
    const mod = await loadFlowvizMod();
    const all = await mod.loadFlowvizTechniques(c.env.ASSETS);
    const out = mod.filterFlowvizTechniques(all, {
      q: c.req.query('q'),
      tactic: c.req.query('tactic'),
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : undefined,
    });
    return c.json({ total: all.length, returned: out.length, techniques: out, source: SOURCE, source_url: SOURCE_URL });
  } catch (e) {
    logError('flowviz techniques failed', e);
    return internalError(c, `flowviz_techniques_failed: ${e instanceof Error ? e.message : String(e)}`);
  }
});

flowvizRouter.get('/flowviz/fetch-article', async (c) => {
  const raw = (c.req.query('url') ?? '').trim().slice(0, MAX_URL_CHARS);
  if (!raw) return badRequest(c, 'Provide ?url=<article-url>');
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(`https://flowviz-article-cache.internal/v1?url=${encodeURIComponent(raw)}`);
  const cached = await cache.match(cacheKey).catch(() => null);
  if (cached) return new Response(cached.body, cached);
  let res: Response;
  try {
    res = await flowvizSecureFetch(raw, { maxBytes: 5_000_000, timeoutMs: 15000, accept: 'text/html' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'private-host' || msg === 'invalid-scheme' || msg === 'invalid-url' || msg === 'credentials-in-url') {
      return badRequest(c, `Blocked URL (${msg})`);
    }
    if (msg === 'response-too-large') return badRequest(c, 'Article too large (5 MB cap)');
    if (msg === 'too-many-redirects') return badGateway(c, 'Too many redirects');
    logError('flowviz fetch-article failed', e);
    return badGateway(c, 'Article fetch failed');
  }
  const ct = res.headers.get('content-type') ?? '';
  if (ct && !/text\/html|application\/xhtml/i.test(ct)) {
    return badRequest(c, `Not an HTML article (content-type: ${ct.slice(0, 80)})`);
  }
  const html = await res.text().catch(() => '');
  if (!html) return badGateway(c, 'Empty article response');
  const { title, text } = extractArticleLite(html);
  if (text.length < 200) return badGateway(c, 'Could not extract article text (paywall or JS-rendered?)');
  const body = { url: raw, title, length: text.length, contents: text, source: SOURCE };
  const response = c.json(body, 200, { 'Cache-Control': 'public, max-age=3600' });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
  return response;
});

interface AnalyzeBody {
  text?: string;
  url?: string;
  system?: string;
}

async function resolveAnalyzeText(c: { env: Env }, body: AnalyzeBody): Promise<{ text: string; title?: string } | { error: Response }> {
  const text = typeof body.text === 'string' ? body.text.slice(0, MAX_INPUT_CHARS).trim() : '';
  if (text.length >= 200) return { text };
  const url = typeof body.url === 'string' ? body.url.trim().slice(0, MAX_URL_CHARS) : '';
  if (!url) return { text: '' };
  let res: Response;
  try {
    res = await flowvizSecureFetch(url, { maxBytes: 5_000_000, timeoutMs: 15000, accept: 'text/html' });
  } catch (e) {
    logError('flowviz analyze fetch failed', e);
    throw new Error('article-fetch-failed');
  }
  const html = await res.text().catch(() => '');
  const { title, text: extracted } = extractArticleLite(html);
  return { text: extracted, title };
}

async function runFlowvizAnalysis(env: Env, text: string, system?: string) {
  const prompt = buildFlowvizAnalysisPrompt({ text });
  const out = await runCompletion(
    env.AI,
    {
      system: `${FLOWVIZ_DEFAULT_SYSTEM} ${UNTRUSTED_DATA_SYSTEM_NOTE}`,
      user: `${fenceUntrusted('ARTICLE', text)}\n\n${prompt}`,
      maxTokens: 8000,
      temperature: 0.1,
    },
    { role: 'flowviz-analyze', ...(system ? {} : {}) }
  );
  const parsed = parseFlowvizJson(out.text);
  const graph = (parsed && typeof parsed === 'object' ? parsed : { nodes: [], edges: [] }) as {
    nodes: unknown[];
    edges: unknown[];
  };
  const validation = validateFlowvizGraph(graph, { articleText: text });
  return { graph: { nodes: graph.nodes ?? [], edges: graph.edges ?? [] }, validation, modelUsed: out.modelUsed };
}

flowvizRouter.post('/flowviz/analyze', async (c) => {
  const parsed = await safeJsonBody<AnalyzeBody>(c, { maxBytes: 128 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;
  let resolved: { text: string; title?: string };
  try {
    const r = await resolveAnalyzeText(c, body);
    if ('error' in r) return r.error;
    resolved = r;
  } catch (e) {
    logError('flowviz analyze resolve failed', e);
    return badGateway(c, 'Article fetch failed');
  }
  if (resolved.text.length < 200) return badRequest(c, 'Provide {text} (≥200 chars) or {url} of an HTML article');
  try {
    const { graph, validation, modelUsed } = await runFlowvizAnalysis(c.env, resolved.text, body.system);
    return c.json(
      { ...graph, validation, modelUsed, title: resolved.title, source: SOURCE, source_url: SOURCE_URL },
      200,
      { 'Cache-Control': 'no-store' }
    );
  } catch (e) {
    logError('flowviz analyze failed', e);
    return badGateway(c, 'Analysis failed (LLM unavailable or invalid output)');
  }
});

flowvizRouter.post('/flowviz/analyze-stream', async (c) => {
  const parsed = await safeJsonBody<AnalyzeBody>(c, { maxBytes: 128 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;
  return sseStream(async (write) => {
    write('progress', { stage: 'resolving-input' });
    let resolved: { text: string; title?: string };
    try {
      const r = await resolveAnalyzeText(c, body);
      if ('error' in r) {
        write('error', { message: 'Provide {text} (≥200 chars) or {url}' });
        return;
      }
      resolved = r;
    } catch {
      write('error', { message: 'Article fetch failed' });
      return;
    }
    if (resolved.text.length < 200) {
      write('error', { message: 'Provide {text} (≥200 chars) or {url} of an HTML article' });
      return;
    }
    write('progress', { stage: 'analyzing', chars: resolved.text.length, title: resolved.title });
    try {
      const { graph, validation, modelUsed } = await runFlowvizAnalysis(c.env, resolved.text, body.system);
      write('progress', { stage: 'validating', nodes: validation.nodeCount, edges: validation.edgeCount });
      write('done', { ...graph, validation, modelUsed, title: resolved.title, source: SOURCE });
    } catch (e) {
      logError('flowviz analyze-stream failed', e);
      write('error', { message: 'Analysis failed (LLM unavailable or invalid output)' });
    }
  });
});

flowvizRouter.post('/flowviz/assistant', async (c) => {
  const parsed = await safeJsonBody<{
    graph?: { nodes?: unknown[]; edges?: unknown[] };
    prompt?: string;
    messages?: Array<{ role?: string; content?: string }>;
    contexts?: Array<{ kind: string; name: string; id: string }>;
    sourceText?: string;
  }>(c, { maxBytes: 1024 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;
  const graph = body.graph && Array.isArray(body.graph.nodes) && Array.isArray(body.graph.edges) ? body.graph : null;
  if (!graph) return badRequest(c, 'Provide {graph: {nodes[], edges[]}}');
  if (graph.nodes!.length > 500 || graph.edges!.length > 1000) return badRequest(c, 'Graph too large (500 nodes / 1000 edges max)');
  const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user' && m.content)?.content?.slice(0, 8000)
    ?? (typeof body.prompt === 'string' ? body.prompt.slice(0, 8000) : '');
  if (!lastUser.trim()) return badRequest(c, 'Provide {prompt} or {messages} with a user turn');
  try {
    const system = buildFlowvizAssistantPrompt({
      graph: { nodes: graph.nodes as Record<string, unknown>[], edges: graph.edges as Record<string, unknown>[] },
      contexts: body.contexts?.slice(0, 50),
      sourceText: typeof body.sourceText === 'string' ? body.sourceText.slice(0, 30000) : undefined,
    });
    const out = await runCompletion(
      c.env.AI,
      { system, user: lastUser, maxTokens: 4000, temperature: 0.2 },
      { role: 'flowviz-assistant' }
    );
    const parsed = parseFlowvizJson(out.text) as { message?: unknown; ops?: unknown } | null;
    return c.json(
      {
        message: typeof parsed?.message === 'string' ? parsed.message.slice(0, 20000) : out.text.slice(0, 20000),
        ops: Array.isArray(parsed?.ops) ? (parsed!.ops as unknown[]).slice(0, 100) : [],
        modelUsed: out.modelUsed,
        source: SOURCE,
      },
      200,
      { 'Cache-Control': 'no-store' }
    );
  } catch (e) {
    logError('flowviz assistant failed', e);
    return badGateway(c, 'Assistant failed (LLM unavailable)');
  }
});

flowvizRouter.post('/flowviz/validate', async (c) => {
  const parsed = await safeJsonBody<{ graph?: unknown; articleText?: string }>(c, { maxBytes: 1024 * 1024 });
  if ('error' in parsed) return parsed.error;
  const body = parsed.value;
  const validation = validateFlowvizGraph(body.graph, {
    articleText: typeof body.articleText === 'string' ? body.articleText.slice(0, 150000) : undefined,
  });
  return c.json({ ...validation, source: SOURCE });
});
