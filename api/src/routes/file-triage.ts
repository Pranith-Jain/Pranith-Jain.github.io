/**
 * Static file triage — REST surface for lib/static-triage.
 *
 * Endpoints (mounted by the app under /api/v1):
 *   POST /file/triage-static       — triage a base64-encoded sample blob
 *   GET  /file/triage-static/meta  — capability descriptor
 *
 * Purely STATIC analysis (magic bytes, entropy, PE inspection, packer and
 * embedded-artifact heuristics). Nothing here executes or detonates samples.
 */
import { Hono } from 'hono'
import type { Env } from '../env'
import { logError } from '../lib/logger'
import { badRequest, internalError } from '../lib/api-error'
import { MAX_TRIAGE_BYTES, triageBytes } from '../lib/static-triage'

export const fileTriageRouter = new Hono<{ Bindings: Env }>()

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/
const MAX_FILENAME_LEN = 512

/** Decode a base64 payload to bytes; throws on malformed input. */
function decodeBase64(value: string): Uint8Array {
  const compact = value.replace(/\s+/g, '')
  if (!BASE64_RE.test(compact)) throw new Error('invalid base64')
  const bin = atob(compact)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ─── POST /file/triage-static ─────────────────────────────────────────────
fileTriageRouter.post('/file/triage-static', async (c) => {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return badRequest(c, 'body must be valid JSON')
  }
  if (typeof raw !== 'object' || raw === null) {
    return badRequest(c, 'body must be a JSON object')
  }
  const body = raw as { filename?: unknown; dataBase64?: unknown }
  if (typeof body.dataBase64 !== 'string' || body.dataBase64.length === 0) {
    return badRequest(c, 'dataBase64 (base64-encoded sample) is required')
  }
  if (body.filename !== undefined && typeof body.filename !== 'string') {
    return badRequest(c, 'filename must be a string when provided')
  }
  const filename =
    typeof body.filename === 'string' && body.filename.trim().length > 0
      ? body.filename.trim().slice(0, MAX_FILENAME_LEN)
      : undefined

  let bytes: Uint8Array
  try {
    bytes = decodeBase64(body.dataBase64)
  } catch {
    return badRequest(c, 'dataBase64 is not valid base64')
  }
  if (bytes.byteLength === 0) return badRequest(c, 'dataBase64 decodes to zero bytes')
  // Mirrors the library's internal guard; caught early for a cleaner message.
  if (bytes.byteLength > MAX_TRIAGE_BYTES) {
    return badRequest(
      c,
      `decoded payload too large: ${bytes.byteLength} bytes (max ${MAX_TRIAGE_BYTES})`
    )
  }

  try {
    const result = await triageBytes(bytes, filename)
    return c.json(result)
  } catch (e) {
    logError('file-triage-static failed', e)
    return internalError(c, `static_triage_failed: ${e instanceof Error ? e.message : String(e)}`)
  }
})

// ─── GET /file/triage-static/meta ─────────────────────────────────────────
fileTriageRouter.get('/file/triage-static/meta', (c) =>
  c.json({
    module: 'static-file-triage',
    description:
      'Static file triage: magic-byte identification, Shannon entropy, PE inspection (sections, imports, overlay), packer and embedded-artifact heuristics',
    execution: false,
    detonation: false,
    endpoints: [
      { method: 'POST', path: '/file/triage-static', body: '{ filename?, dataBase64 }' },
      { method: 'GET', path: '/file/triage-static/meta' },
    ],
    limits: { maxDecodedBytes: MAX_TRIAGE_BYTES },
    families: [
      'pe',
      'elf',
      'macho',
      'pdf',
      'zip',
      'ooxml',
      'rtf',
      'script',
      'pcap',
      'pcapng',
      'unknown',
    ],
    packerSignals: [
      'UPX',
      'high_entropy_sections',
      'few_imports',
      'suspicious_section_name',
      'overlay_high_entropy',
      'low_imports_no_kernel32',
    ],
    embeddedArtifacts: ['embedded_pe', 'nested_zip', 'ole_cdf'],
    hashAlgorithms: ['sha256 (WebCrypto)', 'sha1 (WebCrypto)', 'md5 (embedded pure-JS)'],
    notes: [
      'md5 is computed with an embedded pure-JS implementation because WebCrypto exposes no MD5',
      'inputs above the size limit are rejected with 400 before any parsing',
    ],
  })
)
