# SP2 Report Ingestion — Frontend & End-to-End Integration Design

**Date:** 2026-06-10
**Status:** Approved — ready for implementation planning
**Scope:** The human-facing half of SP2. Adds a `/dfir/report-ingest` page that drives
the (separately specced) `POST /api/v1/report/ingest` backend, plus a non-destructive
verification that the already-wired report engine is live.

**Companion specs:**

- Backend: [`2026-06-10-stixify-sp2-file-ingestion-design.md`](./2026-06-10-stixify-sp2-file-ingestion-design.md)
- Backend plan: [`../plans/2026-06-10-sp2-file-ingestion.md`](../plans/2026-06-10-sp2-file-ingestion.md)

---

## Why this spec exists

The locked SP2 plan is **backend-only**: it ships `POST /api/v1/report/ingest`
(multipart upload → text extraction → existing STIX pipeline → `{ bundle, view }`)
with full tests, but **no UI**. A dark endpoint reachable only via API/MCP is exactly
the kind of unused capability this platform already has too much of. This spec closes
the loop: a real analyst uploads a threat report and gets back rendered, exportable
STIX 2.1 intelligence.

This also completes the platform's core CTI workflow — **ingest → structure → enrich
→ produce** — joining the existing 50-provider enrichment, STIX/TAXII infra, and the
report engine into something an analyst actually reaches for.

## Goal

One page: drag-drop a file → see the extracted indicators, CVEs, actors, malware, and
ATT&CK techniques as a readable summary, plus the raw STIX 2.1 bundle, with a
`.stix.json` download. Reuse existing components wholesale; the only new UI logic is
the upload + result-rendering glue.

## Non-goals

- No new backend logic (the backend spec/plan owns that, unchanged).
- No standing up the optional `file2txt` bridge — it stays dormant; PDF/DOCX surface a
  friendly "needs bridge" message until an operator configures it.
- No report-engine rebuild — it is already wired (DO binding `v4`, migration `0014`,
  routes, Copilot UI). This spec only **verifies** it is live, non-destructively.
- No Attack-Flow / TAXII-determinism work (separate sub-projects).

---

## Verified current state (2026-06-10)

| Piece            | State             | Evidence                                                                         |
| ---------------- | ----------------- | -------------------------------------------------------------------------------- |
| Report engine DO | bound + migrated  | `wrangler.jsonc:56` `REPORT_BUILDER` → `ReportBuilderDO`; migration `v4` (`:72`) |
| Report routes    | registered        | `api/src/index.ts:901-903` `build` / `:id` / `:id/stream`                        |
| Reports table    | migration present | `migrations/0014_reports.sql`                                                    |
| Copilot UI       | wired to engine   | `Copilot.tsx` + `report-client.ts` call `/report/build`, poll, PDF export        |
| Ingest endpoint  | **not built**     | locked plan, backend-only                                                        |
| Ingest UI        | **not built**     | this spec                                                                        |

The earlier project note that the report engine was "built but not deployed" is
**stale** — the deploy artifacts are all in place.

---

## Architecture

### Data flow

```
client (/dfir/report-ingest)
  ├─ drag-drop / file-input  (accept: txt, md, html, png, jpg, pdf, docx)
  ├─ client-side size guard (≤10 MB, fail fast — mirrors server cap)
  ├─ FormData{ file, tlp?, sourceName? } → POST /api/v1/report/ingest  (multipart)
  │        (same-origin; key-gate passes; NOT admin-gated — matches intel-bundle/build)
  ├─ loading: staged hint (extract → enrich → build)
  └─ 200 { bundle, view, cache, ingest:{kind,method,truncated,pages?} }
        ├─ render `view` (IntelView) as summary cards
        ├─ render `bundle` via <StixObjectTable> (+ <StixRelationshipGraph> if edges)
        └─ download report-<bundleId>.stix.json  (client-side Blob)
```

### New / touched frontend files

| File                                   | Responsibility                                                  |
| -------------------------------------- | --------------------------------------------------------------- |
| `src/pages/dfir/ReportIngest.tsx`      | **new** — the page (upload + result render)                     |
| `src/App.tsx`                          | **modify** — lazy import + `RouteDef` for `/dfir/report-ingest` |
| `src/data/sidebar-nav.ts`              | **modify** — DFIR "Investigate" nav entry                       |
| `src/pages/dfir/ReportIngest.test.tsx` | **new** — state-machine + error-mapping test                    |

### Reuse (no new dependencies)

- **Upload UX:** drag-drop + hidden `<input>` pattern from `DmarcAnalyzer.tsx`
  (`processFile` / `handleDrop` / `handleFile`), but the body is `FormData` POSTed to
  the server rather than parsed in-browser.
- **STIX render:** `StixObjectTable` and `StixRelationshipGraph` from
  `src/components/StixBundleViewer.tsx` (both take `{ bundle }`).
- **View types:** `IntelView` / `IntelBundleResponse` from `src/hooks/useIntelBundle.ts`
  (extend the response type locally with the `ingest` provenance field).
- **Chrome / scaffold:** `BackLink`, `animate-fade-in-up` header, `max-w-5xl` container
  from `ExifParse.tsx`. Severity chips / IOC verdict styling from existing components.
- **Download:** client-side `Blob` + `URL.createObjectURL` pattern from `DmarcAnalyzer.tsx`.

### Result rendering — `view` summary above raw bundle

Render the denormalized `IntelView` as scannable cards (in this order), then the raw
STIX table beneath:

1. Header: `view.title`, `view.summary`, TLP badge, a provenance line from
   `ingest.meta` (e.g. "extraction: ai-vision · truncated").
2. IOCs: type, value, verdict (malicious/suspicious/clean/unknown) + risk chip,
   `listedIn` provider count.
3. CVEs: id, KEV badge (+ due date), EPSS score.
4. Threat actors / malware: name, aliases, MITRE id when present.
5. ATT&CK techniques: name + technique id.
6. `<StixObjectTable bundle={bundle} />`, then `<StixRelationshipGraph>` when the
   bundle contains relationship objects.
7. Actions: download `.stix.json`, copy JSON.

If `view` arrays are empty but text extracted fine, show a "no indicators found in
this document" empty state (not an error).

## Error handling — HTTP status → message

| Status | Cause                     | UI message                                                                                                                                 |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 400    | missing/invalid multipart | "No file received — try again."                                                                                                            |
| 413    | over 10 MB                | "File too large (max 10 MB)." (also caught client-side)                                                                                    |
| 415    | unsupported type          | "Unsupported file type. Use PDF, DOCX, image, HTML, or text."                                                                              |
| 422    | no usable text            | "Couldn't extract readable text — try another format."                                                                                     |
| 429    | vision neuron budget      | "Image OCR is rate-limited right now — try again later or upload text/HTML."                                                               |
| 503    | PDF/DOCX, bridge unset    | "PDF/DOCX extraction needs the optional bridge. Upload text/HTML/an image, or paste text into Report Parser." (link `/dfir/report-parser`) |
| 502    | enrichment/build failed   | "Failed to build the STIX bundle — try again."                                                                                             |

The page never shows a raw stack trace; every non-200 maps to one of the above.

## Testing

- **Frontend component test** (`ReportIngest.test.tsx`, vitest + RTL, mirroring
  `report-client.test.ts` style): mock `fetch`; assert upload→loading→result transition
  renders the view summary + STIX table; assert each error status renders its mapped
  message; assert the `.stix.json` download wiring is invoked.
- **Backend tests** come from the locked plan (unit per parser, route handler, the
  `looseValidation`-mounted multipart-exemption test).
- **Typecheck:** all three projects (`tsc -p tsconfig.json`, `api/tsconfig.json`,
  `api/tsconfig.worker.json`).
- **Bundle budget:** `wrangler deploy --dry-run` gzip stays `< 3 MB` (no new deps).
- **Report-engine verify (non-destructive):** dry-run deploy is clean; do **not**
  re-apply migrations or mutate the DO.

## Implementation order

1. Execute the locked backend plan (Tasks 1–9) — endpoint live with tests green.
2. Build `ReportIngest.tsx` against the now-real endpoint.
3. Register route + nav.
4. Frontend test, full typecheck, bundle-budget check.
5. Non-destructive report-engine verify.

## Forward seams

- The page is format-agnostic: when the operator later configures the `file2txt`
  bridge, PDF/DOCX "just work" with no UI change (the 503 branch simply stops firing).
- A "send this bundle to the report engine" button could later chain ingest → the
  existing `/report/build` flow, producing a full analytic narrative from an upload —
  out of scope here, but the data shapes already line up.
