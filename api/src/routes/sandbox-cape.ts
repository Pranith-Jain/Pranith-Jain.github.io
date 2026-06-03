import type { Context } from 'hono';
import type { Env } from '../env';
import { requireAdmin } from '../lib/admin-auth';
import {
  isCapeConfigured,
  submitFile,
  taskStatus,
  fetchReport,
  normalizeReport,
  CapeBridgeError,
  CapeUnconfiguredError,
} from '../lib/cape-bridge';

/**
 * Admin-gated proxy to a self-hosted CAPEv2 sandbox (see lib/cape-bridge.ts).
 *
 * Submitting malware is sensitive, so every route requires the master
 * `ADMIN_TOKEN`. When `CAPE_BRIDGE_URL` is unset the routes return 503 with a
 * setup hint — the feature is dormant, not broken, until an operator stands up
 * CAPE. The Worker only proxies bytes; it never executes a sample.
 */

/** Max sample size accepted for sandbox submission (32 MiB). */
export const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;
/** Slack over the file limit for multipart framing in the Content-Length pre-check. */
const MULTIPART_SLACK = 64 * 1024;

const SUBMIT_TIMEOUT_MS = 30_000;
const POLL_TIMEOUT_MS = 12_000;
const REPORT_TIMEOUT_MS = 20_000;

const SETUP_HINT =
  'Set CAPE_BRIDGE_URL (and optionally CAPE_BRIDGE_TOKEN) to a self-hosted CAPEv2 instance reached through a Cloudflare Tunnel. See docs/self-hosted/cape-bridge.md.';

type Ctx = Context<{ Bindings: Env }>;

function unconfigured(c: Ctx): Response {
  return c.json({ error: 'CAPE sandbox not configured', setup: SETUP_HINT }, 503);
}

function isTimeout(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    ((err as { name: unknown }).name === 'TimeoutError' || (err as { name: unknown }).name === 'AbortError')
  );
}

function bridgeError(c: Ctx, err: unknown): Response {
  if (err instanceof CapeUnconfiguredError) return unconfigured(c);
  if (isTimeout(err)) return c.json({ error: 'CAPE bridge timed out' }, 504);
  if (err instanceof CapeBridgeError) return c.json({ error: err.message }, 502);
  return c.json({ error: err instanceof Error ? err.message : 'CAPE bridge error' }, 502);
}

function parseTaskId(c: Ctx): number | null {
  const id = Number(c.req.param('id'));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function capeSubmitHandler(c: Ctx): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;
  if (!isCapeConfigured(c.env)) return unconfigured(c);

  // Reject obvious oversize before buffering the body into memory.
  const declaredLen = Number(c.req.header('content-length') ?? '0');
  if (Number.isFinite(declaredLen) && declaredLen > MAX_UPLOAD_BYTES + MULTIPART_SLACK) {
    return c.json({ error: `file too large (max ${MAX_UPLOAD_BYTES} bytes)` }, 413);
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: 'expected multipart/form-data with a "file" part' }, 400);
  }

  // workers-types surfaces form.get() as `string | null`; a file part is a
  // Blob/File at runtime. Take it as unknown and narrow structurally.
  const part: unknown = form.get('file');
  if (part == null || typeof part === 'string') return c.json({ error: 'missing "file" part' }, 400);
  const file = part as { size: number; name?: string; arrayBuffer(): Promise<ArrayBuffer> };
  if (file.size > MAX_UPLOAD_BYTES) return c.json({ error: `file too large (max ${MAX_UPLOAD_BYTES} bytes)` }, 413);
  if (file.size === 0) return c.json({ error: 'empty file' }, 400);

  try {
    const bytes = await file.arrayBuffer();
    const ref = await submitFile(
      c.env,
      { bytes, filename: file.name || 'sample.bin' },
      AbortSignal.timeout(SUBMIT_TIMEOUT_MS)
    );
    return c.json(ref, 200);
  } catch (err) {
    return bridgeError(c, err);
  }
}

export async function capeTaskHandler(c: Ctx): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;
  if (!isCapeConfigured(c.env)) return unconfigured(c);

  const id = parseTaskId(c);
  if (id === null) return c.json({ error: 'invalid task id' }, 400);

  try {
    const status = await taskStatus(c.env, id, AbortSignal.timeout(POLL_TIMEOUT_MS));
    return c.json(status, 200);
  } catch (err) {
    return bridgeError(c, err);
  }
}

export async function capeReportHandler(c: Ctx): Promise<Response> {
  const gate = requireAdmin(c);
  if ('error' in gate) return gate.error;
  if (!isCapeConfigured(c.env)) return unconfigured(c);

  const id = parseTaskId(c);
  if (id === null) return c.json({ error: 'invalid task id' }, 400);

  try {
    const raw = await fetchReport(c.env, id, AbortSignal.timeout(REPORT_TIMEOUT_MS));
    return c.json(normalizeReport(raw, id), 200);
  } catch (err) {
    return bridgeError(c, err);
  }
}
