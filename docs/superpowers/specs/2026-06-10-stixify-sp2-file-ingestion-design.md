# Stixify-style File Ingestion (SP2) — Design Spec

**Date:** 2026-06-10
**Status:** Draft — awaiting user review
**Scope:** Add file upload (PDF / .docx / image / text / HTML) → text extraction →
the _existing_ STIX 2.1 bundle pipeline, as a single-shot endpoint. This is
sub-project **SP2** of a larger "integrate Stixify capabilities" effort.

---

## Background — how we got here

The trigger was "can we integrate app.stixify.com into the platform?" Stixify
(dogesec, Apache-2.0) turns unstructured reports (PDF/docx/images/HTML) into STIX
2.1. Investigation showed the platform **already** owns most of that capability:

- `POST /api/v1/intel-bundle/build` (modes `text`/`url`/`iocs`) already runs
  `extract.ts` → multi-provider enrichment → **`buildStixBundle()`** and returns a
  real STIX 2.1 bundle with **deterministic UUIDv5 IDs**, TLP markings, IOC
  patterns, and `indicates`/`uses`/`targets` relationships + ATT&CK external-refs.
- `GET /api/v1/intel-bundle/:id/export.stix.json` downloads it as
  `application/stix+json; version=2.1`.
- `api/src/lib/uuidv5.ts` exports `uuidv5`, `stixId`, `NS_INTEL_BUNDLE`.
- `routes/taxii.ts` is a live TAXII 2.1 server.

So the original "build STIX output" idea (SP1) was **retired as already-done**. The
three genuinely missing / improvable pieces became the new work:

1. **SP2 — file ingestion** (this spec): the one capability Stixify has that we
   lack entirely — accept an uploaded document, not just text/URL.
2. **Attack-Flow bundles** (separate spec): MITRE Attack-Flow extension output.
3. **TAXII determinism fix** (separate spec): `taxii.ts` currently synthesizes
   objects with _random_ UUIDs, bypassing `buildStixBundle`/`uuidv5`.

This spec covers **SP2 only**.

## Goal

One endpoint: upload a file → get back the same `{ bundle, view }` that
`intel-bundle/build` returns today. Reuse the existing extraction + enrichment +
STIX pipeline unchanged; the only new work is **file → text** plus a thin glue
layer.

## Non-goals

- No new STIX-building logic. `buildStixBundle()` is reused as-is.
- No Attack-Flow output (that is the next sub-project).
- No async/queue for very large files — synchronous within the per-request budget;
  oversize or over-CPU inputs fail over to the bridge or are rejected.
- No persistence beyond what `intel-bundle/build` already does (D1 write of the
  built bundle).

---

## Hard platform constraints (verified 2026-06-10)

These were measured/confirmed before settling the design:

| Constraint                 | Value (Free plan)                                         | Source                            |
| -------------------------- | --------------------------------------------------------- | --------------------------------- |
| Worker size after gzip     | **3 MB** (paid 10 MB)                                     | CF docs `workers/platform/limits` |
| Current prod Worker size   | **1.27 MB gzip** (6.2 MB raw)                             | `wrangler deploy --dry-run`       |
| **CPU per request**        | **10 ms** (hard; paid raises to 30 s default / 5 min max) | CF docs                           |
| Subrequests per invocation | 50 (KV + Cache-API both count)                            | CF docs + repo footgun            |
| Request body               | 100 MB (Cloudflare account plan)                          | CF docs                           |
| Workers AI free budget     | ~10k neurons/day                                          | repo memory                       |

**The decisive finding:** pure-JS PDF text extraction (`unpdf`) and `.docx`
unzip+XML parsing are **CPU-bound** and will exceed the **10 ms** free-plan CPU
cap on any non-trivial document (`EXCEEDED_CPU`). The existing AI extraction and
`buildStixBundle` stay under the cap only because they are **I/O-bound** (the `AI`
binding call and provider fetches are subrequests, not local CPU). Bundle size is
_not_ the blocker — CPU is.

**Consequence:** there is no fully-free, fully-in-Worker path that includes
PDF/docx. The chosen resolution (below) keeps the platform **100% free on
Cloudflare** by routing only the CPU-heavy formats to an optional self-hosted
bridge.

---

## Decisions (locked with the user)

1. **Single-shot endpoint** — upload → text → STIX in one call (not two-step).
2. **Hybrid parsing, but CPU-aware routing:**
   - **text / HTML** → in-Worker (trivial CPU). ✅ free
   - **images (PNG/JPG)** → Workers AI **vision** OCR in-Worker (I/O-bound, counts
     against the neuron budget); if the bridge is configured, route images there
     instead for higher fidelity. ✅ free
   - **PDF / .docx** → **optional self-hosted `file2txt` bridge** only. If the
     bridge is not configured, these formats return a `503` with a setup hint
     (dormant, never breaks the deploy). ✅ free on CF (CPU runs on operator host)
3. **No `unpdf` / `fflate` bundled** — because PDF/docx never parse in-Worker, the
   Worker just forwards their bytes to the bridge. Worker bundle is unaffected.
4. **Deterministic identity** — `itemRef = "sha256:" + SHA-256(file bytes)` so
   re-uploading the same file produces a byte-identical STIX bundle (matches the
   existing UUIDv5 determinism contract).
5. **TLP** — honor an optional `tlp` form field, defaulting as `intel-bundle/build`
   does today (`WHITE`). (Wider TLP support is out of scope; `Tlp` is currently
   `'WHITE' | 'AMBER'`.)

---

## Architecture

### New endpoint

```
POST /api/v1/report/ingest        (multipart/form-data)
  fields:
    file        (required)  the uploaded document
    tlp         (optional)  'WHITE' | 'AMBER'  (default WHITE)
    sourceName  (optional)  display name; defaults to the filename
  auth: same key-gate as POST /api/v1/intel-bundle/build
  response: 200 { bundle, view, cache }   (identical shape to intel-bundle/build)
```

`multipart/form-data` is exempt from the global 256 KB `looseValidation` body cap,
so the handler **enforces its own cap** (default **10 MB**; rejects larger with
`413`). An integration test must mount the real `looseValidation` middleware to
prove the multipart exemption + own-cap both hold (repo footgun: file-upload
routes need this).

### New module: `api/src/lib/file2txt/` (mirrors dogesec naming)

Each parser returns a uniform shape:

```ts
interface ExtractResult {
  text: string;
  meta: {
    kind: 'text' | 'html' | 'image' | 'pdf' | 'docx';
    method: 'inline' | 'ai-vision' | 'bridge';
    pages?: number;
    truncated: boolean; // text was capped at MAX_TEXT_LENGTH
  };
}
```

Files:

| File           | Responsibility                                                                                                  | Deps                             |
| -------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `index.ts`     | `extractText(bytes, mime, filename, env): Promise<ExtractResult>` — sniff MIME (header + magic bytes), dispatch | —                                |
| `text-html.ts` | plain text passthrough; HTML → text (tag strip, entity decode)                                                  | none (in-Worker)                 |
| `image-ocr.ts` | Workers AI vision OCR; defers to bridge if configured                                                           | `env.AI`                         |
| `bridge.ts`    | optional `file2txt` bridge client                                                                               | `env.FILE2TXT_BRIDGE_URL/_TOKEN` |
| `mime.ts`      | MIME sniff + magic-byte detection + allow-list                                                                  | none                             |

PDF/docx have **no in-Worker parser**; `index.ts` routes them straight to
`bridge.ts`, which returns a typed `BridgeUnavailable` error when the bridge env
vars are unset → the handler maps that to `503` + setup hint.

### Reuse the existing STIX pipeline (targeted refactor)

`intelBundleBuildHandler` (`api/src/routes/intel-bundle.ts:488`) currently inlines:
build `ReportInput` → `extract()` → enrich fan-out → `buildStixBundle()` → D1
write → respond. Extract the post-`ReportInput` core into an exported function:

```ts
// api/src/routes/intel-bundle.ts (or a sibling lib)
export async function buildBundleFromReport(c: Context<{ Bindings: Env }>, report: ReportInput): Promise<BuildResult>; // { bundle, view }
```

Both `intelBundleBuildHandler` and the new `reportIngestHandler` call it. This is
the only change to existing code; behavior of `intel-bundle/build` is preserved
(guard with its existing tests).

### Image OCR — model selection

Use a Workers AI vision model for image → text. Default to a current
image-to-text model from the Workers AI catalog (e.g.
`@cf/meta/llama-3.2-11b-vision-instruct`, falling back to `@cf/llava-1.5-7b-hf`);
the exact model id is an implementation detail to confirm against the live catalog
at build time. The vision call is I/O (does not count against the 10 ms CPU cap)
but **does** consume neurons — so:

- cap image dimensions / bytes before the call,
- one vision call per uploaded image (no tiling in v1),
- on neuron-budget exhaustion, return a `429`-style hint rather than failing hard.

### Bridge contract (`file2txt`)

Optional, dormant-by-default, following the repo's documented optional-bridge
convention (the first one actually wired):

- Env (both optional): `FILE2TXT_BRIDGE_URL`, `FILE2TXT_BRIDGE_TOKEN`.
- Unset → `bridge.ts` returns `BridgeUnavailable`; PDF/docx ingestion yields `503`
  with a setup hint; images silently fall back to Workers AI vision.
- Set → `POST {URL}/extract` with the raw file (or multipart), `Authorization:
Bearer {TOKEN}`, `AbortSignal.timeout(~20s)`, expecting `{ text: string }`.
- Recommended transport: Cloudflare Tunnel (no open inbound ports on the host),
  consistent with the `self-hosted-tool-bridges` design.
- Counts as **one** subrequest — well within the 50-subrequest budget alongside
  the enrichment fan-out (which already batches via `primeBatch`/`flushBatch`).

---

## Data flow

```
client → POST /report/ingest (multipart)
  ├─ size check (≤10MB) ............................. 413 if over
  ├─ MIME sniff (header + magic) ................... 415 if unsupported
  ├─ extractText():
  │    text/html  → in-Worker strip
  │    image      → env.AI vision  (or bridge if configured)
  │    pdf/docx    → bridge         (503 if bridge unset)
  ├─ text empty / garbage .......................... 422 + hint
  ├─ build ReportInput { title=filename,
  │                      body=text,
  │                      itemRef="sha256:"+hash(bytes),
  │                      tlp }
  ├─ buildBundleFromReport(c, report)  ← existing pipeline, unchanged
  └─ 200 { bundle, view, cache }
```

## Error handling

| Condition                                 | Status | Notes                                             |
| ----------------------------------------- | ------ | ------------------------------------------------- |
| Body > 10 MB                              | 413    | own cap (multipart-exempt from 256 KB middleware) |
| Unsupported / unsniffable MIME            | 415    | allow-list: text, html, png, jpeg, pdf, docx      |
| PDF/docx but bridge unset                 | 503    | setup hint: configure `FILE2TXT_BRIDGE_URL`       |
| Bridge configured but unreachable/timeout | 502    |                                                   |
| Extracted text empty / unusable           | 422    | hint to try another format                        |
| Vision neuron budget exhausted            | 429    | hint, do not 500                                  |
| Missing `file` field / bad multipart      | 400    |                                                   |

`extractText` never throws on valid-but-unparseable input — it returns empty text
which becomes a clean `422`.

## Testing

- **Unit** per parser: `text-html` (HTML strip + entity decode), `mime` sniff
  (magic-byte vs header disagreement), `image-ocr` with a **mocked `AI` binding**,
  `bridge` with mocked fetch (200, timeout, unset env → `BridgeUnavailable`).
- **Route** (`test/routes/`, run locally un-sandboxed per repo rule): multipart
  upload for each supported type; 413 over-cap; 415 unsupported; 503 PDF-without-
  bridge; auth gate; and a `looseValidation`-mounted test proving multipart
  exemption + own cap.
- **Refactor guard:** existing `intel-bundle/build` tests must stay green after the
  `buildBundleFromReport` extraction.
- **Typecheck all three projects:** `tsc -p tsconfig.json`,
  `tsc -p api/tsconfig.json`, `tsc -p api/tsconfig.worker.json` (the per-edit hook
  skips `worker/`).
- **Bundle budget:** confirm `wrangler deploy --dry-run` gzip size stays < 3 MB
  (expected: ~unchanged, since no new heavy deps are bundled).

## Files touched

**New**

- `api/src/lib/file2txt/{index,text-html,image-ocr,bridge,mime}.ts`
- `api/src/routes/report-ingest.ts`
- tests under `api/test/lib/file2txt/` and `api/test/routes/`

**Edited**

- `api/src/routes/intel-bundle.ts` — export `buildBundleFromReport`
- `api/src/index.ts` (or router) — register `POST /api/v1/report/ingest`
- `api/src/env.ts` — add optional `FILE2TXT_BRIDGE_URL`, `FILE2TXT_BRIDGE_TOKEN`
- `api/src/lib/validation-schemas.ts` — multipart field validation for ingest
- docs: note the new endpoint + the optional bridge in the relevant loop/README

## Open implementation details (decide during build, not blocking)

- Exact Workers AI vision model id (confirm against live catalog).
- Whether HTML extraction reuses any existing strip helper in the repo.
- Bridge request encoding (raw body vs multipart) — match whatever `file2txt`
  image the operator runs; document one.

## Forward seams

- A future SP for **scanned-PDF OCR** could route PDFs with empty text through the
  same `image-ocr` path — `ExtractResult.meta` already distinguishes methods.
- If the user later moves to **Workers Paid**, PDF/docx in-Worker parsing becomes
  feasible (30 s CPU); `index.ts` could gain an in-Worker branch behind a flag
  without changing the endpoint contract.
