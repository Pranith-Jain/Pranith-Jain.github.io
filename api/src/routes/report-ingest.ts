import type { Context } from 'hono';
import type { Env } from '../env';
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
    console.error('reportIngestHandler failed:', _catchErr instanceof Error ? _catchErr.message : String(_catchErr));
    return c.json({ error: 'invalid_multipart' }, 400);
  }

  // workers-types declares FormData.get() as `string | null`, but at runtime a file part is a
  // File (declared class, extends Blob). Cast to unknown first to do a runtime instanceof check.
  const fileEntry = form.get('file') as unknown;
  if (!(fileEntry instanceof File)) return c.json({ error: 'missing_file' }, 400);
  const file = fileEntry;
  if (file.size > MAX_FILE_BYTES) return c.json({ error: 'file_too_large', max_bytes: MAX_FILE_BYTES }, 413);

  const tlpField = String(form.get('tlp') ?? 'AMBER').toUpperCase();
  if (!VALID_TLP.has(tlpField)) return c.json({ error: 'invalid_tlp', allowed: [...VALID_TLP] }, 400);
  const tlp = tlpField as 'WHITE' | 'AMBER';

  const sourceName = (form.get('sourceName')?.toString().trim() || file.name || 'Uploaded document').slice(0, 200);
  const bytes = new Uint8Array(await file.arrayBuffer());

  let extracted: Awaited<ReturnType<typeof extractText>>;
  try {
    extracted = await extractText(bytes, file.type, file.name, c.env);
  } catch (err) {
    console.error('reportIngestHandler failed:', err instanceof Error ? err.message : String(err));
    if (err instanceof UnsupportedFile) return c.json({ error: 'unsupported_file_type' }, 415);
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
    return c.json({ error: 'extraction_failed', detail: 'bridge or OCR error' }, 502);
  }

  if (!extracted.text || extracted.text.trim().length < 3) {
    return c.json({ error: 'no_text_extracted', detail: 'no usable text found; try another format' }, 422);
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
    console.error('handler failed:', err instanceof Error ? err.message : String(err));
    if (err instanceof BundleBuildError) return c.json({ error: err.code }, 502);
    return c.json({ error: 'build_failed' }, 502);
  }
}
