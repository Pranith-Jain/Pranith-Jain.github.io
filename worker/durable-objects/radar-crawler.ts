import type { Env } from '../env';
import { pinnedFetchFollow } from '../../api/src/lib/ssrf-guard';

const MAX_CRAWL_PAGES = 50;
const MAX_JS_ANALYSIS = 50;
const MAX_WS_CONNECTIONS = 5;
const ALARM_INTERVAL_MS = 100;

interface CrawlState {
  id: string;
  target: string;
  hostname: string;
  status: 'pending' | 'crawling' | 'analyzing' | 'done' | 'error';
  crawledCount: number;
  maxPages: number;
  visited: string[];
  queue: string[];
  scannedUrls: string[];
  apiPaths: string[];
  parameters: string[];
  queryParameters: string[];
  domains: string[];
  emails: string[];
  guids: string[];
  socialMediaUrls: string[];
  fileExtensionUrls: string[];
  filteredPortUrls: string[];
  localhostRefs: string[];
  nodeModules: string[];
  awsAssets: { type: string; url: string; status?: number }[];
  s3Takeovers: string[];
  npmConfusion: string[];
  vulnerabilities: { type: string; detail: string; severity: string }[];
  graphql: { queries: string[]; mutations: string[]; fragments: string[] };
  jsFilesToAnalyze: string[];
  jsAnalysisDone: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
  jsFileUrls: string[];
}

export class RadarCrawlerDO {
  private ctx: DurableObjectState;
  private env: Env;
  private sessions = new Set<WebSocket>();
  private ipConnections = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.headers.get('upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request);
    }

    if (url.pathname === '/start' && request.method === 'POST') {
      const body = (await request.json()) as { id: string; target: string; hostname: string };
      const initialState: CrawlState = {
        id: body.id,
        target: body.target,
        hostname: body.hostname,
        status: 'pending',
        crawledCount: 0,
        maxPages: MAX_CRAWL_PAGES,
        visited: [],
        queue: [body.target],
        scannedUrls: [],
        apiPaths: [],
        parameters: [],
        queryParameters: [],
        domains: [],
        emails: [],
        guids: [],
        socialMediaUrls: [],
        fileExtensionUrls: [],
        filteredPortUrls: [],
        localhostRefs: [],
        nodeModules: [],
        awsAssets: [],
        s3Takeovers: [],
        npmConfusion: [],
        vulnerabilities: [],
        graphql: { queries: [], mutations: [], fragments: [] },
        jsFilesToAnalyze: [],
        jsAnalysisDone: 0,
        startedAt: new Date().toISOString(),
        jsFileUrls: [],
      };
      await this.ctx.storage.put('state', initialState);
      await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
      return Response.json({ ok: true, id: body.id });
    }

    if (url.pathname === '/state') {
      const state = await this.ctx.storage.get<CrawlState>('state');
      return state ? Response.json(state) : Response.json({ error: 'not found' }, { status: 404 });
    }

    if (url.pathname === '/result') {
      const state = await this.ctx.storage.get<CrawlState>('state');
      if (!state) return Response.json({ error: 'not found' }, { status: 404 });
      if (state.status !== 'done') return Response.json({ status: state.status, crawledCount: state.crawledCount });
      return Response.json({
        scannedUrls: state.scannedUrls,
        apiPaths: state.apiPaths,
        parameters: state.parameters,
        queryParameters: state.queryParameters,
        domains: state.domains,
        emails: state.emails,
        guids: state.guids,
        socialMediaUrls: state.socialMediaUrls,
        fileExtensionUrls: state.fileExtensionUrls,
        filteredPortUrls: state.filteredPortUrls,
        localhostRefs: state.localhostRefs,
        nodeModules: state.nodeModules,
        awsAssets: state.awsAssets,
        s3Takeovers: state.s3Takeovers,
        npmConfusion: state.npmConfusion,
        vulnerabilities: state.vulnerabilities,
        graphql: state.graphql,
      });
    }

    return new Response('not found', { status: 404 });
  }

  private handleWebSocketUpgrade(request: Request): Response {
    if (this.sessions.size >= MAX_WS_CONNECTIONS) {
      return new Response('Too many connections', { status: 429 });
    }
    const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const ipCount = this.ipConnections.get(clientIp) ?? 0;
    if (ipCount >= 3) {
      return new Response('Too many connections from this IP', { status: 429 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    this.sessions.add(server);
    this.ipConnections.set(clientIp, ipCount + 1);
    server.addEventListener('close', () => {
      this.sessions.delete(server);
      const remaining = this.ipConnections.get(clientIp) ?? 1;
      if (remaining <= 1) this.ipConnections.delete(clientIp);
      else this.ipConnections.set(clientIp, remaining - 1);
    });
    return new Response(null, { status: 101, webSocket: client });
  }

  private broadcast(msg: Record<string, unknown>) {
    const data = JSON.stringify(msg);
    for (const ws of this.sessions) {
      try {
        ws.send(data);
      } catch {
        this.sessions.delete(ws);
      }
    }
  }

  async alarm(): Promise<void> {
    const state = await this.ctx.storage.get<CrawlState>('state');
    if (!state || state.status === 'done' || state.status === 'error') return;

    try {
      if (state.status === 'pending' || state.status === 'crawling') {
        await this.crawlStep(state);
      } else if (state.status === 'analyzing') {
        await this.analyzeJsStep(state);
      }
    } catch (err) {
      state.status = 'error';
      state.error = err instanceof Error ? err.message : String(err);
      await this.ctx.storage.put('state', state);
      this.broadcast({ type: 'error', error: state.error });
      return;
    }

    await this.ctx.storage.put('state', state);

    const finalStatus = state.status as string;
    if (finalStatus === 'done' || finalStatus === 'error') {
      this.broadcast({ type: 'done', state });
    } else {
      await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    }
  }

  private async crawlStep(state: CrawlState): Promise<void> {
    if (state.queue.length === 0 || state.crawledCount >= state.maxPages) {
      state.status = 'analyzing';
      state.jsFilesToAnalyze = this.extractJsFromVisited(state);
      return;
    }

    const url = state.queue.shift()!;
    if (state.visited.includes(url)) {
      return;
    }

    state.visited.push(url);
    state.status = 'crawling';
    state.crawledCount++;

    this.broadcast({ type: 'progress', crawled: state.crawledCount, max: state.maxPages, current: url });

    try {
      const res = await pinnedFetchFollow(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          accept: 'text/html,application/xhtml+xml,*/*',
        },
      });

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        return; // non-HTML, skip silently
      }

      const html = await res.text();
      state.scannedUrls.push(url);

      // Extract JS file URLs from script tags
      const scriptRe = /<script[^>]*src=["']([^"']+\.js[^"']*)["'][^>]*>/gi;
      let sm;
      const skipDomains = [
        'cloudflareinsights.com',
        'googletagmanager.com',
        'google-analytics.com',
        'hotjar.com',
        'segment.com',
        'sentry.io',
        'newrelic.com',
        'ampproject.org',
      ];
      while ((sm = scriptRe.exec(html)) !== null) {
        const src = sm[1];
        if (src) {
          try {
            const jsUrl = new URL(src, url).href;
            const host = new URL(jsUrl).hostname;
            const shouldSkip = skipDomains.some((d) => host.includes(d));
            if (!shouldSkip) {
              state.jsFileUrls.push(jsUrl);
            }
          } catch {
            /* skip */
          }
        }
      }

      this.extractLinksForQueue(html, url, state);
      this.extractReconData(html, url, state);
    } catch (err) {
      state.error = `crawl fetch failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private extractLinksForQueue(html: string, baseUrl: string, state: CrawlState): void {
    const re = /href=["']([^"']+)["']/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
      const raw = m[1];
      if (!raw || raw.startsWith('#') || raw.startsWith('javascript:') || raw.startsWith('mailto:')) continue;
      try {
        const u = new URL(raw, baseUrl);
        if (u.hostname === state.hostname && !state.visited.includes(u.href) && !state.queue.includes(u.href)) {
          const path = u.pathname;
          if (path.match(/\.(jpg|jpeg|png|gif|svg|css|woff|ttf|ico|mp4|mp3|zip|pdf)$/i)) continue;
          state.queue.push(u.href);
        }
      } catch {
        /* skip invalid URLs */
      }
    }
  }

  private extractReconData(html: string, url: string, state: CrawlState): void {
    const emailRe = /(?:mailto:)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    let m;
    while ((m = emailRe.exec(html)) !== null) {
      if (m[1] && !m[1].includes('example.') && !m[1].includes('email@')) {
        state.emails.push(m[1].toLowerCase());
      }
    }

    const guidsRe = /["'=\s]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
    while ((m = guidsRe.exec(html)) !== null) {
      if (m[1]) state.guids.push(m[1]);
    }

    const localhostRe = /(?:https?:\/\/)?localhost(?::\d+)?(?:\/[^\s"'<>]*)?/gi;
    while ((m = localhostRe.exec(html)) !== null) {
      if (m[0]) state.localhostRefs.push(m[0]);
    }

    const socialPatterns = [
      /https?:\/\/(?:www\.)?facebook\.com\/[^\s"'<>]+/gi,
      /https?:\/\/(?:www\.)?twitter\.com\/[^\s"'<>]+/gi,
      /https?:\/\/(?:www\.)?x\.com\/[^\s"'<>]+/gi,
      /https?:\/\/(?:www\.)?instagram\.com\/[^\s"'<>]+/gi,
      /https?:\/\/(?:www\.)?linkedin\.com\/[^\s"'<>]+/gi,
      /https?:\/\/(?:www\.)?youtube\.com\/[^\s"'<>]+/gi,
      /https?:\/\/t\.me\/[^\s"'<>]+/gi,
      /https?:\/\/(?:www\.)?github\.com\/[^\s"'<>]+/gi,
    ];
    for (const re of socialPatterns) {
      while ((m = re.exec(html)) !== null) {
        if (m[0]) state.socialMediaUrls.push(m[0].replace(/[.,;:!?)]+$/, ''));
      }
    }

    const fileExtRe =
      /["'](https?:\/\/[^"']+?\.(?:pdf|doc|docx|xls|xlsx|csv|zip|tar\.gz|rar|sql|db|log|conf|env|bak|pem|key|crt))["']/gi;
    while ((m = fileExtRe.exec(html)) !== null) {
      if (m[1]) state.fileExtensionUrls.push(m[1]);
    }

    const portRe = /["'](https?:\/\/[^"'\s<>]*:\d{2,5}[^"'\s<>]*)["']/gi;
    while ((m = portRe.exec(html)) !== null) {
      if (m[1]) state.filteredPortUrls.push(m[1]);
    }

    const paramRe = /[?&](\w+)=/g;
    while ((m = paramRe.exec(html)) !== null) {
      if (m[1] && m[1].length > 1) state.parameters.push(m[1]);
    }

    const urlParamRe = /["'](https?:\/\/[^"'\s<>]+?\?[^"'\s<>]+)["']/gi;
    while ((m = urlParamRe.exec(html)) !== null) {
      const raw = m[1];
      if (!raw) continue;
      try {
        const u = new URL(raw);
        u.searchParams.forEach((_v, k) => state.queryParameters.push(k));
      } catch {
        /* skip */
      }
    }

    const domainRe = /https?:\/\/([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/gi;
    while ((m = domainRe.exec(html)) !== null) {
      try {
        const u = new URL(m[0]);
        const host = u.hostname.toLowerCase();
        if (host && !host.endsWith(state.hostname) && !host.includes('example.') && !host.includes('email@')) {
          state.domains.push(host);
        }
      } catch {
        /* skip */
      }
    }

    const nodeModRe = /["'](\/node_modules\/[^"']+)["']/gi;
    while ((m = nodeModRe.exec(html)) !== null) {
      if (m[1]) state.nodeModules.push(m[1]);
    }

    const apiPathRe = /["'`](\/api\/v\d+\/[a-zA-Z0-9/_-{}:.]+)["'`]/g;
    while ((m = apiPathRe.exec(html)) !== null) {
      if (m[1]) state.apiPaths.push(m[1]);
    }

    const portUrlRe = /["'](https?:\/\/[^"'\s<>]*:\d{2,5}[^"'\s<>]*)["']/gi;
    while ((m = portUrlRe.exec(html)) !== null) {
      if (m[1]) state.filteredPortUrls.push(m[1]);
    }
  }

  private extractJsFromVisited(state: CrawlState): string[] {
    return [...new Set(state.jsFileUrls)].slice(0, MAX_JS_ANALYSIS);
  }

  private async analyzeJsStep(state: CrawlState): Promise<void> {
    if (state.jsAnalysisDone >= state.jsFilesToAnalyze.length) {
      state.status = 'done';
      state.completedAt = new Date().toISOString();
      state.emails = [...new Set(state.emails)];
      state.guids = [...new Set(state.guids)];
      state.localhostRefs = [...new Set(state.localhostRefs)];
      state.socialMediaUrls = [...new Set(state.socialMediaUrls)];
      state.fileExtensionUrls = [...new Set(state.fileExtensionUrls)];
      state.parameters = [...new Set(state.parameters)];
      state.queryParameters = [...new Set(state.queryParameters)];
      state.domains = [...new Set(state.domains)];
      state.apiPaths = [...new Set(state.apiPaths)];
      state.nodeModules = [...new Set(state.nodeModules)];
      state.filteredPortUrls = [...new Set(state.filteredPortUrls)];
      return;
    }

    state.status = 'analyzing';
    const BATCH_SIZE = 10;
    const batchEnd = Math.min(state.jsAnalysisDone + BATCH_SIZE, state.jsFilesToAnalyze.length);

    for (let i = state.jsAnalysisDone; i < batchEnd; i++) {
      const jsUrl = state.jsFilesToAnalyze[i];
      if (!jsUrl) continue;

      try {
        const res = await pinnedFetchFollow(jsUrl, {
          headers: { 'user-agent': 'Mozilla/5.0', accept: '*/*' },
        });
        const js = await res.text();
        this.analyzeJsContent(js, jsUrl, state);
      } catch {
        /* skip failed JS */
      }
    }

    state.jsAnalysisDone = batchEnd;
    this.broadcast({ type: 'js_progress', done: state.jsAnalysisDone, total: state.jsFilesToAnalyze.length });
  }

  private analyzeJsContent(js: string, jsUrl: string, state: CrawlState): void {
    let m: RegExpExecArray | null;

    // ── API paths: REST, GraphQL, internal routes ──────────────
    const apiPatterns = [
      // Explicit /api/v1/... paths
      /["'`](\/api\/v\d+\/[a-zA-Z0-9/_-{}:.]+)["'`]/g,
      // /api/... without version
      /["'`](\/api\/[a-zA-Z0-9/_-{}:.]+)["'`]/g,
      // Next.js API routes: pages/api/... or app/api/...
      /["'`](\/(?:pages|app)\/api\/[a-zA-Z0-9/_-{}:.]+)["'`]/g,
      // fetch/axios with path
      /(?:fetch|axios\.(?:get|post|put|patch|delete))\s*\(\s*["'`](\/[a-zA-Z0-9/_-{}:.]+)["'`]/g,
      // Route definitions: path: "/..." or route: "/..."
      /(?:path|route|endpoint|url)\s*[:=]\s*["'`](\/[a-zA-Z0-9/_-{}:.]+)["'`]/g,
      // Express-style: app.get("/..."), router.post("/...")
      /(?:app|router)\.\s*(?:get|post|put|patch|delete|all)\s*\(\s*["'`](\/[a-zA-Z0-9/_-{}:.]+)["'`]/g,
      // Hono-style: c.get("/..."), c.post("/...")
      /c\.\s*(?:get|post|put|patch|delete|all)\s*\(\s*["'`](\/[a-zA-Z0-9/_-{}:.]+)["'`]/g,
      // Generic: any quoted path that looks like an endpoint
      /["'`](\/(?:auth|login|register|signup|signin|logout|dashboard|admin|settings|profile|user|users|account|accounts|search|query|webhook|webhooks|callback|redirect|health|status|metrics|monitor|ping|version|docs|swagger|openapi)[a-zA-Z0-9/_-]*)["'`]/g,
    ];
    for (const re of apiPatterns) {
      while ((m = re.exec(js)) !== null) {
        const path = m[1];
        if (path && path.length > 2 && !path.match(/\.(js|css|png|jpg|gif|svg|ico|woff|ttf|map)$/)) {
          state.apiPaths.push(path);
        }
      }
    }

    // ── GraphQL: queries, mutations, fragments, subscriptions ──
    const gqlQueryRe = /(?:query|subscription)\s+(\w+)(?:\s*\([^)]*\))?\s*\{/gi;
    while ((m = gqlQueryRe.exec(js)) !== null) {
      if (m[1]) state.graphql.queries.push(m[1]);
    }
    const gqlMutRe = /mutation\s+(\w+)(?:\s*\([^)]*\))?\s*\{/gi;
    while ((m = gqlMutRe.exec(js)) !== null) {
      if (m[1]) state.graphql.mutations.push(m[1]);
    }
    const gqlFragRe = /fragment\s+(\w+)\s+on\s+(\w+)/gi;
    while ((m = gqlFragRe.exec(js)) !== null) {
      if (m[1]) state.graphql.fragments.push(`${m[1]} on ${m[2]}`);
    }
    // GQL endpoint detection
    const gqlEndpointRe = /["'`](\/graphql(?:\/[a-zA-Z0-9/_-]+)?)["'`]/gi;
    while ((m = gqlEndpointRe.exec(js)) !== null) {
      if (m[1]) state.apiPaths.push(m[1]);
    }

    // ── Parameters from route handlers and fetch calls ─────────
    const paramPatterns = [
      // req.body.key, req.query.key, req.params.key
      /(?:req|request)\.(?:body|query|params)\.(\w+)/g,
      // params.key, query.key, body.key
      /(?:params|query|body|searchParams)\.(\w+)/g,
      // destructuring: const { id, name } = ...
      /(?:const|let|var)\s*\{([^}]+)\}\s*=/g,
      // TypeScript interface properties (API request/response shapes)
      /(\w+)\s*[?:]\s*(?:string|number|boolean|any)/g,
      // URL search params
      /searchParams\.(?:get|set|append|has)\s*\(\s*["'`](\w+)["'`]/g,
    ];
    for (const re of paramPatterns) {
      while ((m = re.exec(js)) !== null) {
        if (re.source.includes('\\{') && m[1]) {
          // Destructuring: extract individual names
          const names = m[1].split(',').map((n) => n.trim().split(':')[0]?.trim().split('=')[0]?.trim() ?? '');
          for (const name of names) {
            if (
              name &&
              name.length > 1 &&
              name.length < 40 &&
              !name.match(
                /^(const|let|var|function|class|return|import|export|default|if|else|for|while|switch|case|break|continue|new|this|null|undefined|true|false)$/
              )
            ) {
              state.parameters.push(name);
            }
          }
        } else {
          const name = m[1];
          if (name && name.length > 1 && name.length < 40) {
            state.parameters.push(name);
          }
        }
      }
    }

    // ── Secrets detection ──────────────────────────────────────
    const secretPatterns = [
      // API keys
      { re: /(?:api[_-]?key|apikey)\s*[:=]\s*["'`](sk[_-]?[a-zA-Z0-9]{20,})["'`]/gi, type: 'API Key' },
      { re: /(?:api[_-]?key|apikey)\s*[:=]\s*["'`]([a-zA-Z0-9]{32,})["'`]/gi, type: 'API Key' },
      // Supabase keys
      { re: /(sb_publishable_[a-zA-Z0-9_]{20,})/g, type: 'Supabase Key' },
      {
        re: /(eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/g,
        type: 'JWT Token',
      },
      // AWS
      { re: /(?:AKIA[0-9A-Z]{16})/g, type: 'AWS Access Key' },
      // GitHub tokens
      { re: /ghp_[a-zA-Z0-9]{36}/g, type: 'GitHub Token' },
      { re: /gho_[a-zA-Z0-9]{36}/g, type: 'GitHub OAuth Token' },
      // Slack tokens
      { re: /xox[baprs]-[a-zA-Z0-9-]+/g, type: 'Slack Token' },
      // Private keys
      { re: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, type: 'Private Key' },
      // Passwords in code
      { re: /(?:password|passwd|pwd)\s*[:=]\s*["'`]([^"'`]{4,})["'`]/gi, type: 'Hardcoded Password' },
      // Secrets
      { re: /(?:secret|client[_-]?secret)\s*[:=]\s*["'`]([^"'`]{8,})["'`]/gi, type: 'Secret' },
      // Connection strings
      { re: /(?:mongodb|postgres|mysql|redis|amqp):\/\/[^\s"'`]+/gi, type: 'Connection String' },
    ];
    for (const { re, type } of secretPatterns) {
      while ((m = re.exec(js)) !== null) {
        state.vulnerabilities.push({
          type: 'Exposed Secret',
          detail: `${type} found in ${jsUrl}: ${m[0].slice(0, 80)}...`,
          severity: 'critical',
        });
      }
    }

    // ── WebSocket endpoints ────────────────────────────────────
    const wsRe = /["'`](wss?:\/\/[^"']+)["'`]/gi;
    while ((m = wsRe.exec(js)) !== null) {
      if (m[1]) state.apiPaths.push(m[1]);
    }

    // ── External URLs and domains ──────────────────────────────
    const urlRe = /https?:\/\/([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/gi;
    while ((m = urlRe.exec(js)) !== null) {
      try {
        const u = new URL(m[0]);
        const host = u.hostname.toLowerCase();
        if (
          host &&
          !host.endsWith(state.hostname) &&
          !host.includes('example.') &&
          !host.includes('sentry.io') &&
          !host.includes('cloudflareinsights')
        ) {
          state.domains.push(host);
        }
      } catch {
        /* skip */
      }
    }

    // ── Emails in JS ───────────────────────────────────────────
    const emailRe = /["'`](?:mailto:)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})["'`]/gi;
    while ((m = emailRe.exec(js)) !== null) {
      if (m[1] && !m[1].includes('example.') && !m[1].includes('email@') && !m[1].includes('user@')) {
        state.emails.push(m[1].toLowerCase());
      }
    }

    // ── GUIDs in JS ────────────────────────────────────────────
    const guidRe = /["'=\s]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
    while ((m = guidRe.exec(js)) !== null) {
      if (m[1]) state.guids.push(m[1]);
    }

    // ── File URLs in JS ────────────────────────────────────────
    const fileRe =
      /["'`](https?:\/\/[^"']+?\.(?:pdf|doc|docx|xls|xlsx|csv|zip|tar\.gz|rar|sql|db|log|conf|env|bak|pem|key|crt|json|xml|yaml|yml))["'`]/gi;
    while ((m = fileRe.exec(js)) !== null) {
      if (m[1]) state.fileExtensionUrls.push(m[1]);
    }

    // ── Localhost refs in JS ───────────────────────────────────
    const lhRe = /["'`](https?:\/\/localhost:\d+[^"']*)["'`]/gi;
    while ((m = lhRe.exec(js)) !== null) {
      if (m[1]) state.localhostRefs.push(m[1]);
    }

    // ── Node modules exposure ──────────────────────────────────
    const nmRe = /["'`](\/node_modules\/[^"']+)["'`]/gi;
    while ((m = nmRe.exec(js)) !== null) {
      if (m[1]) state.nodeModules.push(m[1]);
    }

    // ── NPM confusion detection ────────────────────────────────
    if (js.includes('require(') && (js.includes('MODULE_NOT_FOUND') || js.includes('module-not-found'))) {
      state.npmConfusion.push(jsUrl);
    }

    // ── Port URLs ──────────────────────────────────────────────
    const portRe = /["'`](https?:\/\/[^"'`\s]*:\d{2,5}[^"'`\s]*)["'`]/gi;
    while ((m = portRe.exec(js)) !== null) {
      if (m[1]) state.filteredPortUrls.push(m[1]);
    }
  }
}
