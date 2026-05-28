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

export class LiveFeedDO {
  private ctx: DurableObjectState;
  private env: unknown;
  private sessions = new Map<string, WebSocket>();
  private lastSnapshots = new Map<string, FeedSnapshot>();

  constructor(ctx: DurableObjectState, env: unknown) {
    this.ctx = ctx;
    this.env = env;
    this.ctx.blockConcurrencyWhile(async () => {});
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const sessionId = crypto.randomUUID();

    this.sessions.set(sessionId, server);
    server.accept();

    server.addEventListener('close', () => {
      this.sessions.delete(sessionId);
      if (this.sessions.size === 0) {
        this.lastSnapshots.clear();
        this.ctx.storage?.setAlarm(undefined).catch(() => {});
      }
    });
    server.addEventListener('error', () => {
      this.sessions.delete(sessionId);
    });

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
