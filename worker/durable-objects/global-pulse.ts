interface PulseSnapshot {
  id: string;
  kind: string;
  title: string;
  severity: string;
  timestamp: string;
}

const GP_CACHE_KEY = 'https://global-pulse-cache.internal/v22-cyber-tech-geo';
const MAX_CONNECTIONS = 50;

export class GlobalPulseDO {
  private ctx: DurableObjectState;
  private env: unknown;
  private sessions = new Map<string, WebSocket>();
  private lastSnapshot = new Map<string, PulseSnapshot>();
  private ipConnections = new Map<string, number>();
  private lastGeneratedAt = '';

  constructor(ctx: DurableObjectState, env: unknown) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    if (this.sessions.size >= MAX_CONNECTIONS) {
      return new Response('Too many connections', { status: 429 });
    }

    const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const ipCount = this.ipConnections.get(clientIp) ?? 0;
    if (ipCount >= 5) {
      return new Response('Too many connections from this IP', { status: 429 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const sessionId = crypto.randomUUID();

    this.sessions.set(sessionId, server);
    this.ipConnections.set(clientIp, ipCount + 1);
    server.accept();

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      this.sessions.delete(sessionId);
      const remaining = this.ipConnections.get(clientIp) ?? 1;
      if (remaining <= 1) this.ipConnections.delete(clientIp);
      else this.ipConnections.set(clientIp, remaining - 1);
      if (this.sessions.size === 0) {
        this.lastSnapshot.clear();
        this.ipConnections.clear();
        this.ctx.storage?.deleteAlarm().catch(() => {});
      }
    };
    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    server.send(JSON.stringify({ type: 'connected' }));

    if (this.lastSnapshot.size === 0) {
      await this.pollFeeds();
    }

    const events = Array.from(this.lastSnapshot.values());
    server.send(JSON.stringify({ type: 'snapshot', events, generated_at: this.lastGeneratedAt }));

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
    const cache = caches.default;
    try {
      const cached = await cache.match(new Request(GP_CACHE_KEY));
      if (!cached) return;

      const body = (await cached.json()) as {
        generated_at: string;
        events: Array<{
          id: string;
          kind: string;
          title: string;
          severity: string;
          timestamp: string;
        }>;
      };

      const newGeneratedAt = body.generated_at ?? '';
      const newEvents = body.events ?? [];

      if (newGeneratedAt === this.lastGeneratedAt && this.lastSnapshot.size > 0) {
        return;
      }

      const newIds = new Set(newEvents.map((e) => e.id));
      const added: PulseSnapshot[] = [];
      const removed: string[] = [];

      for (const [id] of this.lastSnapshot) {
        if (!newIds.has(id)) removed.push(id);
      }

      for (const event of newEvents) {
        const prev = this.lastSnapshot.get(event.id);
        if (!prev) {
          added.push(event);
        } else if (
          prev.kind !== event.kind ||
          prev.title !== event.title ||
          prev.severity !== event.severity ||
          prev.timestamp !== event.timestamp
        ) {
          added.push(event);
        }
      }

      this.lastSnapshot.clear();
      for (const event of newEvents) {
        this.lastSnapshot.set(event.id, event);
      }
      this.lastGeneratedAt = newGeneratedAt;

      if (added.length > 0 || removed.length > 0) {
        this.broadcast({
          type: 'update',
          added,
          removed,
          total: newEvents.length,
          generated_at: newGeneratedAt,
        });
      }
    } catch {
      /* cache miss */
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
