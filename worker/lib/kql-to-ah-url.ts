/**
 * TypeScript port of security-investigator/scripts/kql_to_ah_url.py.
 *
 * Encodes a KQL query into a Defender XDR Advanced Hunting deep link.
 * The portal decodes the `query` parameter as: Base64url → GZip → UTF-16LE.
 *
 * Uses the Web Crypto / CompressionStream API available in Cloudflare
 * Workers (no third-party deps).
 *
 * Usage:
 *   const url = await kqlToAhUrl("DeviceInfo | take 10", { tenantId: "..." });
 *   const md  = `[Run in Advanced Hunting](${url})`;
 */

export interface KqlToAhUrlOptions {
  /** Azure AD tenant GUID; appended as &tid= for cross-tenant linking. */
  tenantId?: string;
}

const PORTAL_BASE = 'https://security.microsoft.com/v2/advanced-hunting';

/**
 * Encode UTF-16LE → GZip → Base64url.
 *
 * Workers don't ship Buffer, so we do the Base64url by hand after the
 * GZip step (GZip gives us Uint8Array; we map each byte to a char and
 * apply the URL-safe substitutions).
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  const b64 = btoa(s);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function gzipUtf16Le(input: string): Promise<Uint8Array> {
  // Normalize newlines to CRLF (Monaco editor in the portal expects this).
  const crlf = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
  const utf16 = new TextEncoder().encode(crlf); // encodes as UTF-8; we need UTF-16LE
  // Re-encode as UTF-16LE.
  const out = new Uint8Array(utf16.length * 2);
  for (let i = 0; i < utf16.length; i++) {
    out[i * 2] = utf16[i];
    out[i * 2 + 1] = 0;
  }
  // GZip via CompressionStream('gzip').
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  await writer.write(out);
  await writer.close();
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // eslint-disable-next-line no-constant-condition -- intentional stream drain loop (reader returns done=true to exit)
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  return merged;
}

export async function kqlToAhUrl(kql: string, opts: KqlToAhUrlOptions = {}): Promise<string> {
  if (!kql || !kql.trim()) {
    throw new Error('kql is empty');
  }
  const compressed = await gzipUtf16Le(kql);
  const b64 = bytesToBase64Url(compressed);
  const url = `${PORTAL_BASE}?query=${b64}`;
  return opts.tenantId ? `${url}&tid=${encodeURIComponent(opts.tenantId)}` : url;
}

/**
 * Render a markdown link ready to paste after a KQL code block in a
 * report: `[Run in Advanced Hunting](<url>)`. Matches upstream
 * `kql_to_ah_url.py --md` output.
 */
export async function kqlToAhUrlMarkdown(kql: string, opts: KqlToAhUrlOptions = {}): Promise<string> {
  const url = await kqlToAhUrl(kql, opts);
  return `[Run in Advanced Hunting](${url})`;
}
