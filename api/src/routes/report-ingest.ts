import type { Context } from 'hono';
import type { Env } from '../env';
import { logError } from '../lib/logger';
import { badRequest, notFound, internalError, badGateway, serviceUnavailable, unauthorized, conflict, payloadTooLarge } from '../lib/api-error';
import type { ReportInput } from '../lib/stix-build';
import { buildBundleFromReport, BundleBuildError } from './intel-bundle';
import { extractText, sha256Hex, UnsupportedFile, BridgeUnavailable, ImageTooLarge } from '../lib/file2txt';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB own cap (multipart is exempt from the 256KB middleware)
const VALID_TLP = new Set(['WHITE', 'AMBER']);

/**
 * POST /api/v1/report/ingest  (multipart/form-data)
 *   file        (required)  uploaded document
 *   tlp         (optional)  'WHITE' | 'AMBER'  (default 'AMBER', matching intel-bundle/build)
 *   sourceName  (optional)  display name; defaults to the filename
 */
export async function reportIngestHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch (_catchErr) {
    logError('reportIngestHandler failed', _catchErr);
    return badRequest(c, 'invalid_multipart');
  }

  // workers-types declares FormData.get() as `string | null`, but at runtime a file part is a
  // File (declared class, extends Blob). Cast to unknown first to do a runtime instanceof check.
  const fileEntry = form.get('file') as unknown;
  if (!(fileEntry instanceof File)) return badRequest(c, 'missing_file');
  const file = fileEntry;
  if (file.size > MAX_FILE_BYTES) return payloadTooLarge(c, 'file_too_large');

  const tlpField = String(form.get('tlp') ?? 'AMBER').toUpperCase();
  if (!VALID_TLP.has(tlpField)) return badRequest(c, 'invalid_tlp');
  const tlp = tlpField as 'WHITE' | 'AMBER';

  const sourceName = (form.get('sourceName')?.toString().trim() || file.name || 'Uploaded document').slice(0, 200);
  const bytes = new Uint8Array(await file.arrayBuffer());

  let extracted: Awaited<ReturnType<typeof extractText>>;
  try {
    extracted = await extractText(bytes, file.type, file.name, c.env);
  } catch (err) {
    logError('reportIngestHandler failed', err);
    if (err instanceof UnsupportedFile) return badRequest(c, 'unsupported_file_type');
    if (err instanceof ImageTooLarge) {
      return c.json(
        {
          error: 'image_too_large',
          detail: 'image exceeds in-Worker OCR cap; configure FILE2TXT_BRIDGE_URL for larger images',
        },
        413
      );
    }
    if (err instanceof BridgeUnavailable) {
      return c.json(
        { error: 'bridge_not_configured', detail: 'PDF/DOCX ingestion requires FILE2TXT_BRIDGE_URL to be set' },
        503
      );
    }
    // AI-vision / bridge failures land here — log for prod observability.
    console.error('report/ingest extraction failed', err);
    return badGateway(c, 'extraction_failed: bridge or OCR error');
  }

  if (!extracted.text || extracted.text.trim().length < 3) {
    return badRequest(c, 'no_text_extracted: no usable text found; try another format');
  }

  const firstLine = extracted.text.split(/\r?\n/, 1)[0] ?? '';
  const report: ReportInput = {
    sourceId: 'upload',
    sourceName,
    itemRef: `sha256:${await sha256Hex(bytes)}`,
    title: firstLine.length > 0 && firstLine.length <= 200 ? firstLine : sourceName,
    body: extracted.text,
    publishedAt: new Date().toISOString(),
    tlp,
  };

  try {
    const built = await buildBundleFromReport(c, report);
    return c.json({ bundle: built.bundle, view: built.view, cache: 'computed', ingest: extracted.meta }, 200);
  } catch (err) {
    logError('handler failed', err);
    if (err instanceof BundleBuildError) return badGateway(c, err.code);
    return badGateway(c, 'build_failed');
  }
}
