import type { Env } from '../../env';
import { MAX_TEXT_LENGTH, type ExtractResult, type SupportedKind } from './types';

/** Thrown when PDF/docx (or forced-bridge image) ingestion is requested but no
 *  bridge is configured. The handler maps this to a 503 + setup hint. */
export class BridgeUnavailable extends Error {
  constructor() {
    super('file2txt bridge not configured');
    this.name = 'BridgeUnavailable';
  }
}

const BRIDGE_TIMEOUT_MS = 20_000;

export function bridgeConfigured(env: Env): boolean {
  return typeof env.FILE2TXT_BRIDGE_URL === 'string' && env.FILE2TXT_BRIDGE_URL.length > 0;
}

/** Strip control characters (code points < 0x20 and 0x7f) and cap length, so a
 *  hostile upload filename can't poison the bridge's logs or header handling.
 *  workerd already rejects CR/LF in header values; this is explicit defense. */
function sanitizeFilename(filename: string): string {
  let out = '';
  for (const ch of filename) {
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code !== 0x7f) out += ch;
    if (out.length >= 255) break;
  }
  return out;
}

/** POST the raw file to the self-hosted file2txt bridge and return its text. */
export async function extractViaBridge(
  bytes: Uint8Array,
  contentType: string,
  filename: string,
  env: Env,
  kind: SupportedKind
): Promise<ExtractResult> {
  if (!bridgeConfigured(env)) throw new BridgeUnavailable();

  const headers: Record<string, string> = {
    'Content-Type': contentType || 'application/octet-stream',
    'X-Filename': sanitizeFilename(filename || ''),
  };
  if (env.FILE2TXT_BRIDGE_TOKEN) headers.Authorization = `Bearer ${env.FILE2TXT_BRIDGE_TOKEN}`;

  const res = await fetch(`${env.FILE2TXT_BRIDGE_URL!.replace(/\/$/, '')}/extract`, {
    method: 'POST',
    headers,
    body: bytes,
    signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`bridge returned ${res.status}`);

  const data = (await res.json()) as { text?: string };
  const text = (data.text ?? '').slice(0, MAX_TEXT_LENGTH);
  return { text, meta: { kind, method: 'bridge', truncated: (data.text ?? '').length > MAX_TEXT_LENGTH } };
}
