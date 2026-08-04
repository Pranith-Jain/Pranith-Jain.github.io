interface PulseSnapshot {
  id: string;
  kind: string;
  title: string;
  severity: string;
  timestamp: string;
}

import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import {
  GLOBAL_PULSE_CACHE as GP_CACHE_KEY,
  GP_RESPONSE_KEY as GP_KV_KEY,
} from '../../api/src/routes/global-pulse/config';

const MAX_CONNECTIONS = 50;

// Extends the platform DurableObject base class so `this.ctx` and `this.env`
// are inherited (typed DurableObjectState and Env respectively). The previous
// `private env: unknown` forced a cast at every use site.
export class GlobalPulseDO extends DurableObject<Env> {
  private sessions = new Map<string, WebSocket>();
  private lastSnapshot = new Map<string, PulseSnapshot>();
  private ipConnections = new Map<string, number>();
  private lastGeneratedAt = '';

  override async fetch(request: Request): Promise<Response> {
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

  override async alarm(): Promise<void> {
    await this.pollFeeds();
    if (this.sessions.size > 0) {
      const next = new Date(Date.now() + 30_000);
      this.ctx.storage?.setAlarm(next.getTime()).catch(() => {});
    }
  }

  private async pollFeeds(): Promise<void> {
    try {
      // Try Cache API first (per-colo, fast). Fall back to KV (global) if
      // the cache entry expired — the handler writes to both, but the
      // Cache API entry has a 300s TTL and may be cold if no request has
      // triggered a rebuild recently. Without this KV fallback, the DO
      // silently stops broadcasting once the cache expires, making the
      // page appear "stuck at 1 hour ago".
      const cache = caches.default;
      const cached = await cache.match(new Request(GP_CACHE_KEY));
      let bodyText: string | null = null;

      if (cached) {
        bodyText = await cached.text();
      } else {
        // KV fallback — global, so any colo can read the last successful build.
        const kv = this.env.KV_CACHE;
        if (kv) {
          bodyText = await kv.get(GP_KV_KEY, 'text');
        }
      }

      if (!bodyText) return;

      const body = JSON.parse(bodyText) as {
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
    } catch (_catchErr) {
      console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
      /* cache miss */
    }
  }

  private broadcast(msg: unknown): void {
    const payload = JSON.stringify(msg);
    for (const [id, ws] of this.sessions) {
      try {
        ws.send(payload);
      } catch (_catchErr) {
        console.error('handler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
        this.sessions.delete(id);
      }
    }
  }
}
