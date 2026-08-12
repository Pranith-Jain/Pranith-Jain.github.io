/**
 * Live-IOC feed queue consumer.
 *
 * Each message names one feed source. The consumer runs that source via the
 * registry (`runFeedSourceById`) and parks its contribution in a per-source KV
 * slice (`live-iocs:slice:<id>`). This is the producer side of the
 * compose-on-read model: the read path (PR3) stitches the slices together
 * instead of doing the synchronous ~33-source fan-out on a cache miss.
 *
 * PR2 ships this dormant — nothing enqueues yet; PR3 wires the producer
 * (cron + cold-cache) and flips the read path.
 */
import type { Env } from './env';
import type { Env as ApiEnv } from '../api/src/env';
import apiApp from '../api/src/index';
import { runFeedSourceById, type FeedDeps } from '../api/src/routes/live-iocs';
import { writeSlice, type FeedQueueMessage } from '../api/src/lib/live-iocs-slices';
import { gpWarmKey } from '../api/src/routes/global-pulse';
import { concurrentMap } from '../api/src/lib/concurrent-map';
import { signInternalToken } from '../api/src/lib/internal-token';
import { fetchXAccountPosts, X_ACCOUNTS } from '../api/src/routes/cyberpulse-ingest';

// `gp:warm:<key>` slice TTL — 150 min. Long enough to cover the skip-when-
// fresh enqueue gate (ENQUEUE_CYCLE_TTL_SECONDS 105 min → at most one skipped
// hourly cycle, worst-case slice age ~2h), with margin for one retry gap.
const GP_WARM_TTL_SECONDS = 150 * 60;

// Within-batch fan-out bound. The relevant runtime limit is ~6 simultaneously
// OPEN outbound connections (not a total-subrequest cap). Several sources fan
// out beyond a single fetch — andreafortuna does fetch + KV get/put, and the
// cached malwarebazaar/phishing helpers do fetch + KV — so 4 leaves headroom
// under that limit for those secondary subrequests. (max_concurrency in
// wrangler.jsonc separately bounds parallel batch invocations.)
const BATCH_CONCURRENCY = 4;

export async function handleQueue(
  batch: MessageBatch<FeedQueueMessage>,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const kv = env.KV_CACHE;
  if (!kv) {
    // No KV → nowhere to write slices. Ack everything so a misconfigured env
    // doesn't wedge the queue in an endless retry loop; the startup binding
    // validator already surfaces a missing KV_CACHE.
    for (const msg of batch.messages) msg.ack();
    console.error(JSON.stringify({ job: 'live-iocs-slice', status: 'no_kv', acked: batch.messages.length }));
    return;
  }

  const deps: FeedDeps = { executionCtx: ctx, kv, env: env as unknown as ApiEnv };

  await concurrentMap(
    batch.messages,
    async (msg) => {
      // Extract inside the try: a malformed body (null at runtime) must not
      // throw out of the per-message task — that would reject concurrentMap and
      // bubble out of handleQueue, retrying the WHOLE batch (re-running already
      // -acked messages). Keep failures scoped to their own message.
      let sourceId = '';
      try {
        // ── global-pulse feed warm (gp:warm:<key>) ───────────────────────
        // One feed per message → its own consumer invocation → its own
        // 50-subrequest budget. apiApp.fetch is IN-PROCESS (no network
        // self-fetch, which would loop back and fail). Each message writes its
        // OWN KV key, so there is no read-modify-write race across messages.
        const gp = msg.body?.gp;
        if (gp && typeof gp.key === 'string' && typeof gp.path === 'string') {
          const tokenSecret = env.INTERNAL_TOKEN_SECRET;
          if (!tokenSecret) {
            console.error(JSON.stringify({ job: 'gp-warm-slice', error: 'INTERNAL_TOKEN_SECRET not configured' }));
            return;
          }
          const token = await signInternalToken('queue-consumer', tokenSecret);
          const res = await apiApp.fetch(
            new Request(`https://gp-warm.internal${gp.path}`, {
              headers: { 'x-internal-token': token },
            }),
            env as unknown as ApiEnv as never,
            ctx
          );
          if (res.ok) {
            const body = await res.text();
            // Write-on-change: most feeds return byte-identical JSON hour over
            // hour, and KV writes are the scarce free-plan quota (1k/day vs
            // 100k reads). One cheap read per warm saves the write whenever
            // the feed hasn't moved.
            const key = gpWarmKey(gp.key);
            if ((await kv.get(key)) !== body) {
              await kv.put(key, body, { expirationTtl: GP_WARM_TTL_SECONDS });
            }
          } else {
            // Previously silent — a non-ok warm fetch was acked with no trace,
            // so a broken feed (e.g. a key-gated route returning 401/502) left
            // gp:warm:<key> empty with nothing in the logs to explain it.
            console.error(
              JSON.stringify({
                job: 'gp-warm-slice',
                key: gp.key,
                path: gp.path,
                status: res.status,
                error: 'warm fetch not ok',
              })
            );
          }
          msg.ack();
          return;
        }

        // ── CyberPulse source warm (cp:warm:<type>) ──────────────────────
        // Each source type gets its own consumer invocation → its own
        // 50-subrequest budget. The fetcher is called IN-PROCESS (no HTTP
        // self-fetch). Result is written to `cp:warm:<type>` KV with a 150 min
        // TTL — long enough to survive the skip-when-fresh enqueue gate.
        const CP_WARM_TTL_SECONDS = 150 * 60;
        const cp = msg.body?.cp;
        if (cp && typeof cp.type === 'string') {
          try {
            let posts: unknown[] = [];
            if (cp.type === 'x_accounts') {
              posts = await fetchXAccountPosts(env as unknown as ApiEnv, X_ACCOUNTS, 1);
            } else {
              msg.ack();
              return;
            }
            const key = `cp:warm:${cp.type}`;
            const raw = JSON.stringify(posts);
            if ((await kv.get(key)) !== raw) {
              await kv.put(key, raw, {
                expirationTtl: CP_WARM_TTL_SECONDS,
              });
            }
          } catch (e) {
            console.error(
              JSON.stringify({
                job: 'cp-warm-slice',
                type: cp.type,
                status: 'failed',
                error: e instanceof Error ? e.message : String(e),
              })
            );
          }
          msg.ack();
          return;
        }

        // Runtime-guard the body (a cross-version producer could send a
        // malformed shape) — the generic already types it, so no cast needed.
        sourceId = msg.body && typeof msg.body.sourceId === 'string' ? msg.body.sourceId : '';
        if (!sourceId) {
          // Ack (no retry — a malformed body won't parse on redelivery) but log
          // so a burst of bad messages is observable once PR3 wires the producer.
          msg.ack();
          return;
        }
        const result = await runFeedSourceById(sourceId, deps);
        if (!result) {
          // Unknown source id — ack so a stale/poison message doesn't loop to the DLQ.
          msg.ack();
          return;
        }
        // writeSlice persists to the per-colo Cache API (free, not counted
        // against the KV write quota) — see live-iocs-slices.ts doc for the
        // budget reasoning. `kv` stays in the deps for sources that need it
        // (e.g. andreafortuna's last-good mirror), but the slice itself does
        // not touch KV.
        await writeSlice(sourceId, result);
        msg.ack();
      } catch (e) {
        // Transient (KV write / unexpected) — let the queue retry, then DLQ.
        console.error(
          JSON.stringify({
            job: 'live-iocs-slice',
            sourceId: sourceId || null,
            status: 'failed',
            error: e instanceof Error ? e.message : String(e),
          })
        );
        msg.retry();
      }
    },
    BATCH_CONCURRENCY
  );
}
