interface FeedSnapshot {
  type: string;
  total: number;
  generated_at: string;
}

const CACHE_KEYS = [
  { key: 'https://ransomware-recent-cache.internal/v8-af-source', label: 'ransomware' },
  { key: 'https://live-iocs-cache.internal/v11-freshness-filter', label: 'iocs' },
  { key: 'https://cve-recent-cache.internal/v10-750-paged', label: 'cves' },
  { key: 'https://malware-samples-cache.internal/v3-500', label: 'malware' },
  { key: 'https://breach-cache.internal/v6-hibp-only', label: 'breaches' },
  { key: 'https://actor-timeline-cache.internal/v3-mti', label: 'actors' },
];

// Maximum concurrent WebSocket connections per Durable Object instance.
// Prevents resource exhaustion from an attacker opening thousands of
// connections. At 50 connections, each polling 6 feeds every 30s, the
// DO stays well within Cloudflare's CPU/subrequest limits.
const MAX_CONNECTIONS = 50;

export class LiveFeedDO {
  private ctx: DurableObjectState;
  private env: unknown;
  private sessions = new Map<string, WebSocket>();
  private lastSnapshots = new Map<string, FeedSnapshot>();
  /** Per-IP connection tracking for abuse prevention. */
  private ipConnections = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: unknown) {
    this.ctx = ctx;
    this.env = env;
    this.ctx.blockConcurrencyWhile(async () => {});
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // Enforce max concurrent connections to prevent resource exhaustion.
    if (this.sessions.size >= MAX_CONNECTIONS) {
      return new Response('Too many connections', { status: 429 });
    }

    // Per-IP limit: max 5 connections per IP to prevent single-client abuse.
    const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const ipCount = this.ipConnections.get(clientIp) ?? 0;
    if (ipCount >= 5) {
      return new Response('Too many connections from this IP', { status: 429 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const sessionId = crypto.randomUUID();

    this.sessions.set(sessionId, server);
    this.ipConnections.set(clientIp, ipCount + 1);
    server.accept();

    const cleanup = () => {
      this.sessions.delete(sessionId);
      const remaining = this.ipConnections.get(clientIp) ?? 1;
      if (remaining <= 1) this.ipConnections.delete(clientIp);
      else this.ipConnections.set(clientIp, remaining - 1);
      if (this.sessions.size === 0) {
        this.lastSnapshots.clear();
        this.ipConnections.clear();
        this.ctx.storage?.setAlarm(undefined).catch(() => {});
      }
    };
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    server.send(JSON.stringify({ type: 'connected', feeds: CACHE_KEYS.map((c) => c.label) }));

    if (this.lastSnapshots.size === 0) {
      await this.pollFeeds();
    }

    for (const s of this.lastSnapshots.values()) {
      server.send(JSON.stringify({ type: 'snapshot', feed: s.type, total: s.total, generated_at: s.generated_at }));
    }

    if (this.sessions.size > 0) {
      const next = new Date(Date.now() + 30_000);
      this.ctx.storage?.setAlarm(next.getTime()).catch(() => {});
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm(): Promise<void> {
    await this.pollFeeds();
    if (this.sessions.size > 0) {
      const next = new Date(Date.now() + 30_000);
      this.ctx.storage?.setAlarm(next.getTime()).catch(() => {});
    }
  }

  private async pollFeeds(): Promise<void> {
    for (const { key, label } of CACHE_KEYS) {
      try {
        const cache = caches.default;
        const cached = await cache.match(new Request(key));
        if (!cached) continue;

        const body = (await cached.json()) as Record<string, unknown>;
        const total = (body.total ?? body.count ?? 0) as number;
        const generated_at = (body.generated_at ?? '') as string;
        const prev = this.lastSnapshots.get(label);
        const prevTotal = prev?.total ?? 0;

        if (prev && total !== prevTotal) {
          const delta = total - prevTotal;
          if (delta > 0) {
            this.broadcast({
              type: 'update',
              feed: label,
              total,
              delta,
              generated_at,
              previous_total: prevTotal,
              new_total: total,
            });
          }
        }

        this.lastSnapshots.set(label, { type: label, total, generated_at });
      } catch {
        /* cache miss */
      }
    }
  }

  private broadcast(msg: unknown): void {
    const payload = JSON.stringify(msg);
    for (const [id, ws] of this.sessions) {
      try {
        ws.send(payload);
      } catch {
        this.sessions.delete(id);
      }
    }
  }
}
