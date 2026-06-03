/**
 * Recon-tool bridge client.
 *
 * Calls a self-hosted recon service (Subfinder / Amass / theHarvester /
 * SpiderFoot behind a thin HTTP wrapper, reached through a Cloudflare Tunnel)
 * with a single contract: `POST {RECON_BRIDGE_URL}/recon { tool, target }` →
 * normalized `{ subdomains, hosts, emails }`. Gated on the optional
 * `RECON_BRIDGE_URL` secret — callers degrade to 503 when unset, like the
 * other optional providers.
 *
 * These CLIs cannot run on Workers (Go/Python binaries), so the heavy lifting
 * happens on the operator's box; the Worker is just a typed client.
 *
 * @see docs/self-hosted/recon-bridge.md
 */

export interface ReconEnv {
  RECON_BRIDGE_URL?: string;
  RECON_BRIDGE_TOKEN?: string;
}

export const RECON_TOOLS = ['subfinder', 'amass', 'theharvester', 'spiderfoot'] as const;
export type ReconTool = (typeof RECON_TOOLS)[number];

export interface ReconResult {
  tool: ReconTool;
  target: string;
  subdomains: string[];
  hosts: string[];
  emails: string[];
  count: number;
}

export class ReconUnconfiguredError extends Error {
  constructor() {
    super('Recon bridge not configured');
    this.name = 'ReconUnconfiguredError';
  }
}

export class ReconBridgeError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'ReconBridgeError';
    this.status = status;
  }
}

/** Defensive cap per collection — recon can legitimately return many
 *  subdomains, but bound it so a hostile/compromised bridge can't flood us. */
const MAX_ITEMS = 5000;

export function isReconConfigured(env: ReconEnv): boolean {
  return Boolean(env.RECON_BRIDGE_URL && env.RECON_BRIDGE_URL.trim());
}

export function isReconTool(v: string): v is ReconTool {
  return (RECON_TOOLS as readonly string[]).includes(v);
}

/** Normalized base URL (no trailing slash), e.g. `https://recon.example.com`. */
export function reconBase(env: ReconEnv): string {
  const raw = (env.RECON_BRIDGE_URL ?? '').trim().replace(/\/+$/, '');
  if (!raw) throw new ReconUnconfiguredError();
  return raw;
}

function authHeaders(env: ReconEnv): Record<string, string> {
  const token = env.RECON_BRIDGE_TOKEN?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Coerce an unknown into a deduped, capped array of non-empty strings. */
function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const s = item.trim();
    // Skip empties, dupes, and absurdly long entries (a hostile/compromised
    // bridge could pad each item; a real subdomain/host/email is well under 256).
    if (!s || s.length > 256 || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export async function runRecon(
  env: ReconEnv,
  input: { tool: ReconTool; target: string },
  signal?: AbortSignal
): Promise<ReconResult> {
  if (!isReconConfigured(env)) throw new ReconUnconfiguredError();
  const base = reconBase(env);
  const res = await fetch(`${base}/recon`, {
    method: 'POST',
    headers: { ...authHeaders(env), 'content-type': 'application/json' },
    body: JSON.stringify({ tool: input.tool, target: input.target }),
    signal,
  });
  if (!res.ok) throw new ReconBridgeError(`recon bridge failed: HTTP ${res.status}`);

  const json = (await res.json()) as { subdomains?: unknown; hosts?: unknown; emails?: unknown };
  const subdomains = strArray(json.subdomains);
  const hosts = strArray(json.hosts);
  const emails = strArray(json.emails);
  return {
    tool: input.tool,
    target: input.target,
    subdomains,
    hosts,
    emails,
    count: subdomains.length + hosts.length + emails.length,
  };
}
