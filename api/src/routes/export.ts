/**
 * Export Hub — convert intelligence data to standard interchange formats.
 *
 * These handlers used to live inline in index.ts. Each one called
 * `await c.req.json()` with no error handling, so a malformed or empty body
 * surfaced as a 500 `internal_error` instead of a 400. They are extracted
 * here so they:
 *   - parse the body via `safeJsonBody` (400 on malformed / 413 on oversize),
 *   - validate the minimal shape each export function needs (400, not a 500
 *     thrown from inside `export-formats.ts`),
 *   - return the correct `Content-Type` plus a `Content-Disposition` so the
 *     browser treats the result as a downloadable artifact.
 *
 * Body shapes are preserved exactly from the previous inline handlers so this
 * is a behavior-compatible move for well-formed requests.
 */

import type { Context } from 'hono';
import type { Env } from '../env';
import { badRequest } from '../lib/api-error';
import { safeJsonBody } from '../lib/safe-body';
import {
  exportToStix21,
  exportToMisp,
  exportToSigma,
  exportToYara,
  exportToSnort,
  exportToSuricata,
  exportToCSV,
  exportToPfSense,
  type ExportableIOC,
} from '../lib/export-formats';

type Ctx = Context<{ Bindings: Env }>;

// The global looseValidation middleware already 413s bodies > 256 KB; mirror
// that cap here so safeJsonBody's own limit never silently disagrees with it.
const MAX_BODY_BYTES = 256 * 1024;

/** Build a downloadable text response with no-store caching. */
function download(c: Ctx, body: string, contentType: string, filename: string): Response {
  return c.body(body, 200, {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store, max-age=0',
  });
}

/** Parse the body, or return the typed 400/413 error response to short-circuit on. */
async function parseBody<T>(c: Ctx): Promise<{ value: T } | { error: Response }> {
  return safeJsonBody<T>(c, { maxBytes: MAX_BODY_BYTES, maxDepth: 12 });
}

function isIocArray(v: unknown): v is ExportableIOC[] {
  return Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}

// ── STIX 2.1 bundle ──────────────────────────────────────────────────────
// Body: an array of ExportableIOC.
export async function exportStixHandler(c: Ctx): Promise<Response> {
  const parsed = await parseBody<unknown>(c);
  if ('error' in parsed) return parsed.error;
  if (!isIocArray(parsed.value)) return badRequest(c, 'expected a JSON array of IOCs');
  return download(c, exportToStix21(parsed.value), 'application/json', 'ioc-export.stix.json');
}

// ── MISP event ───────────────────────────────────────────────────────────
// Body: { iocs: ExportableIOC[], event_name?: string }.
export async function exportMispHandler(c: Ctx): Promise<Response> {
  const parsed = await parseBody<{ iocs?: unknown; event_name?: unknown }>(c);
  if ('error' in parsed) return parsed.error;
  const { iocs, event_name } = parsed.value;
  if (!isIocArray(iocs)) return badRequest(c, 'expected `iocs` to be a JSON array of IOCs');
  const eventName = typeof event_name === 'string' && event_name ? event_name : 'IOC Export';
  return download(c, exportToMisp(iocs, eventName), 'application/json', 'misp-event.json');
}

// ── Sigma rule ───────────────────────────────────────────────────────────
// Body: { name: string, description?: string, iocs: ExportableIOC[] }.
export async function exportSigmaHandler(c: Ctx): Promise<Response> {
  const parsed = await parseBody<{ name?: unknown; description?: unknown; iocs?: unknown }>(c);
  if ('error' in parsed) return parsed.error;
  const { name, description, iocs } = parsed.value;
  if (typeof name !== 'string' || !name) return badRequest(c, 'expected `name` to be a non-empty string');
  if (!isIocArray(iocs)) return badRequest(c, 'expected `iocs` to be a JSON array of IOCs');
  const desc = typeof description === 'string' ? description : '';
  return download(c, exportToSigma(name, desc, iocs), 'text/yaml; charset=utf-8', 'detection.sigma.yml');
}

// ── YARA rule ────────────────────────────────────────────────────────────
// Body: { name: string, description?: string, hash_iocs?: string[], string_iocs?: string[] }.
export async function exportYaraHandler(c: Ctx): Promise<Response> {
  const parsed = await parseBody<{
    name?: unknown;
    description?: unknown;
    hash_iocs?: unknown;
    string_iocs?: unknown;
  }>(c);
  if ('error' in parsed) return parsed.error;
  const { name, description, hash_iocs, string_iocs } = parsed.value;
  if (typeof name !== 'string' || !name) return badRequest(c, 'expected `name` to be a non-empty string');
  const hashIocs = hash_iocs === undefined ? [] : hash_iocs;
  const stringIocs = string_iocs === undefined ? [] : string_iocs;
  if (!isStringArray(hashIocs)) return badRequest(c, 'expected `hash_iocs` to be an array of strings');
  if (!isStringArray(stringIocs)) return badRequest(c, 'expected `string_iocs` to be an array of strings');
  const desc = typeof description === 'string' ? description : '';
  return download(c, exportToYara(name, desc, hashIocs, stringIocs), 'text/plain; charset=utf-8', 'detection.yar');
}

// ── Snort rules ──────────────────────────────────────────────────────────
// Body: { name: string, ip_iocs?: string[] }.
export async function exportSnortHandler(c: Ctx): Promise<Response> {
  const parsed = await parseBody<{ name?: unknown; ip_iocs?: unknown }>(c);
  if ('error' in parsed) return parsed.error;
  const { name, ip_iocs } = parsed.value;
  if (typeof name !== 'string' || !name) return badRequest(c, 'expected `name` to be a non-empty string');
  const ipIocs = ip_iocs === undefined ? [] : ip_iocs;
  if (!isStringArray(ipIocs)) return badRequest(c, 'expected `ip_iocs` to be an array of strings');
  return download(c, exportToSnort(name, ipIocs), 'text/plain; charset=utf-8', 'detection.snort.rules');
}

// ── Suricata rules ───────────────────────────────────────────────────────
// Body: { name: string, ip_iocs?: string[] }.
export async function exportSuricataHandler(c: Ctx): Promise<Response> {
  const parsed = await parseBody<{ name?: unknown; ip_iocs?: unknown }>(c);
  if ('error' in parsed) return parsed.error;
  const { name, ip_iocs } = parsed.value;
  if (typeof name !== 'string' || !name) return badRequest(c, 'expected `name` to be a non-empty string');
  const ipIocs = ip_iocs === undefined ? [] : ip_iocs;
  if (!isStringArray(ipIocs)) return badRequest(c, 'expected `ip_iocs` to be an array of strings');
  return download(c, exportToSuricata(name, ipIocs), 'text/plain; charset=utf-8', 'detection.suricata.rules');
}

// ── CSV ──────────────────────────────────────────────────────────────────
// Body: an array of ExportableIOC.
export async function exportCsvHandler(c: Ctx): Promise<Response> {
  const parsed = await parseBody<unknown>(c);
  if ('error' in parsed) return parsed.error;
  if (!isIocArray(parsed.value)) return badRequest(c, 'expected a JSON array of IOCs');
  return download(c, exportToCSV(parsed.value), 'text/csv; charset=utf-8', 'ioc-export.csv');
}

// ── pfSense alias ────────────────────────────────────────────────────────
// Body: an array of ExportableIOC.
export async function exportPfSenseHandler(c: Ctx): Promise<Response> {
  const parsed = await parseBody<unknown>(c);
  if ('error' in parsed) return parsed.error;
  if (!isIocArray(parsed.value)) return badRequest(c, 'expected a JSON array of IOCs');
  return download(c, exportToPfSense(parsed.value), 'text/plain; charset=utf-8', 'pfsense-alias.txt');
}
