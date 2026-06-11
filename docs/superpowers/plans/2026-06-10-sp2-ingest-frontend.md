# SP2 Report-Ingest Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/dfir/report-ingest` page that uploads a file to `POST /api/v1/report/ingest`, renders the returned `IntelView` summary + STIX bundle, and offers a `.stix.json` download.

**Architecture:** A single React page (`ReportIngest.tsx`) reusing existing pieces — drag-drop UX from `DmarcAnalyzer`, STIX rendering from `StixBundleViewer`, types from `useIntelBundle`, page chrome from `ExifParse`. The body is `FormData` POSTed multipart to the server (the file is **not** parsed in-browser). Registered in the data-driven `App.tsx` route table and the DFIR sidebar.

**Tech Stack:** React 18, React Router v6, TypeScript, Vitest + Testing Library (jsdom), Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-10-sp2-ingest-frontend-design.md`

**Prerequisite:** The backend plan (`docs/superpowers/plans/2026-06-10-sp2-file-ingestion.md`, Tasks 1–9) must be implemented first so `POST /api/v1/report/ingest` exists. This frontend plan assumes that endpoint returns `{ bundle, view, cache, ingest }`.

---

## File Structure

| File                                   | Responsibility                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `src/pages/dfir/ReportIngest.tsx`      | **new** — the page: upload → POST → render result, error mapping, download       |
| `src/pages/dfir/ReportIngest.test.tsx` | **new** — RTL test: dropzone render, success flow, error mapping, oversize guard |
| `src/App.tsx`                          | **modify** — lazy import + `RouteDef` entry                                      |
| `src/data/sidebar-nav.ts`              | **modify** — DFIR "Investigate" nav item + icon import                           |

---

### Task 1: ReportIngest page

**Files:**

- Create: `src/pages/dfir/ReportIngest.tsx`
- Test: `src/pages/dfir/ReportIngest.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/dfir/ReportIngest.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReportIngest from './ReportIngest';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/dfir/report-ingest']}>
      <ReportIngest />
    </MemoryRouter>
  );
}

const VIEW = {
  reportId: 'r1',
  bundleId: 'bundle--abc',
  title: 'ACME APT Report',
  source: { id: 'upload', name: 'acme.txt' },
  publishedAt: null,
  summary: 'A short summary of the threat.',
  keywords: [],
  threatActors: [{ name: 'APT-ACME', aliases: ['ACME Spider'], mitreId: 'G9999' }],
  malware: [],
  cves: [{ id: 'CVE-2024-1234', kevListed: true }],
  iocs: [
    {
      type: 'ipv4',
      value: '1.2.3.4',
      confidence: 80,
      riskScore: 90,
      tags: [],
      listedIn: ['abuseipdb'],
      verdict: 'malicious',
    },
  ],
  iocsOverflow: [],
  attackPatterns: [{ name: 'Phishing', mitreId: 'T1566' }],
  tlp: 'AMBER',
  partial: false,
  generatedAt: '2026-06-10T00:00:00Z',
  extractedHash: 'sha256:deadbeef',
};
const OK_BODY = {
  bundle: {
    type: 'bundle',
    id: 'bundle--abc',
    objects: [{ type: 'indicator', id: 'indicator--1', pattern: "[ipv4-addr:value = '1.2.3.4']" }],
  },
  view: VIEW,
  cache: 'computed',
  ingest: { kind: 'text', method: 'inline', truncated: false },
};

function textFile(name = 'acme.txt', bytes = 50): File {
  return new File([new Uint8Array(bytes)], name, { type: 'text/plain' });
}

afterEach(() => vi.restoreAllMocks());

describe('ReportIngest', () => {
  it('renders the upload dropzone', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /report ingest/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/upload a report file/i)).toBeInTheDocument();
  });

  it('uploads a file and renders the intel view summary + STIX table', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(OK_BODY), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    fireEvent.change(screen.getByLabelText(/upload a report file/i), { target: { files: [textFile()] } });

    await waitFor(() => expect(screen.getByText('ACME APT Report')).toBeInTheDocument());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/report/ingest');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(screen.getByText('1.2.3.4')).toBeInTheDocument();
    expect(screen.getByText(/CVE-2024-1234/)).toBeInTheDocument();
    expect(screen.getByText(/APT-ACME/)).toBeInTheDocument();
  });

  it('maps a 503 to the bridge hint with a Report Parser link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    renderPage();
    fireEvent.change(screen.getByLabelText(/upload a report file/i), { target: { files: [textFile('r.pdf')] } });
    await waitFor(() => expect(screen.getByText(/needs the optional bridge/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /report parser/i })).toHaveAttribute('href', '/dfir/report-parser');
  });

  it('rejects an oversize file client-side without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    fireEvent.change(screen.getByLabelText(/upload a report file/i), {
      target: { files: [textFile('big.txt', 11 * 1024 * 1024)] },
    });
    await waitFor(() => expect(screen.getByText(/max 10 MB/i)).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/dfir/ReportIngest.test.tsx`
Expected: FAIL — `Cannot find module './ReportIngest'`.

- [ ] **Step 3: Write the implementation**

```tsx
// src/pages/dfir/ReportIngest.tsx
import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Upload, Loader2, AlertTriangle, Download, Copy, Check } from 'lucide-react';
import { BackLink } from '../../components/BackLink';
import { StixObjectTable, StixRelationshipGraph, type StixBundle } from '../../components/StixBundleViewer';
import type { IntelBundleResponse } from '../../hooks/useIntelBundle';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // mirror the server's own cap
const ACCEPT = '.txt,.md,.html,.htm,.png,.jpg,.jpeg,.pdf,.docx';

interface IngestResponse extends IntelBundleResponse {
  ingest?: { kind: string; method: string; truncated: boolean; pages?: number };
}

const ERROR_BY_STATUS: Record<number, string> = {
  400: 'No file received — try again.',
  413: 'File too large (max 10 MB).',
  415: 'Unsupported file type. Use PDF, DOCX, image, HTML, or text.',
  422: "Couldn't extract readable text from this file — try another format.",
  429: 'Image OCR is rate-limited right now — try again later, or upload text/HTML.',
  502: 'Failed to build the STIX bundle — try again.',
  503: 'PDF/DOCX extraction needs the optional bridge.',
};

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function ReportIngest(): JSX.Element {
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<IngestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setResult(null);
    setError(null);
    setErrorStatus(null);
    setFileName(file.name);

    if (file.size > MAX_FILE_BYTES) {
      setStatus('error');
      setError('File too large (max 10 MB).');
      return;
    }

    setStatus('loading');
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await fetch('/api/v1/report/ingest', { method: 'POST', body: fd });
      if (!res.ok) {
        setStatus('error');
        setErrorStatus(res.status);
        setError(ERROR_BY_STATUS[res.status] ?? `Upload failed (${res.status}).`);
        return;
      }
      const json = (await res.json()) as IngestResponse;
      setResult(json);
      setStatus('done');
    } catch {
      setStatus('error');
      setError('Network error — try again.');
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) void processFile(file);
    },
    [processFile]
  );

  const onInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void processFile(file);
    },
    [processFile]
  );

  const download = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result.bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(result.bundle.id || 'report').replace(/[^a-z0-9-]/gi, '_')}.stix.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyJson = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result.bundle, null, 2)).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const view = result?.view;
  const bundle = result?.bundle as unknown as StixBundle | undefined;
  const hasIntel =
    !!view &&
    (view.iocs.length ||
      view.cves.length ||
      view.threatActors.length ||
      view.malware.length ||
      view.attackPatterns.length);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-12 text-slate-900 dark:text-slate-100">
      <BackLink
        to="/dfir"
        className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 mb-8 font-mono"
      >
        <ArrowLeft size={14} /> back
      </BackLink>

      <div className="animate-fade-in-up">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 flex items-center gap-3">
          <Upload size={28} className="text-brand-600 dark:text-brand-400" /> Report Ingest
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-2xl">
          Upload a threat report (text, HTML, or image). It is parsed, indicators are enriched across providers, and a
          STIX 2.1 bundle is built. PDF/DOCX require the optional extraction bridge.
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        className={`relative rounded-lg border-2 border-dashed p-12 text-center cursor-pointer transition-colors mb-8 ${
          dragOver
            ? 'border-brand-500 bg-brand-500/5'
            : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 hover:border-brand-400 hover:bg-brand-500/5'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={onInput}
          className="hidden"
          aria-label="Upload a report file"
        />
        <Upload size={28} className="mx-auto mb-3 text-slate-400" />
        <p className="font-mono text-sm text-slate-600 dark:text-slate-400">
          {fileName ? fileName : 'Drop a file here, or click to choose'}
        </p>
        <p className="font-mono text-xs text-slate-400 mt-1">txt · md · html · png · jpg · pdf · docx — max 10 MB</p>
      </div>

      {status === 'loading' && (
        <p className="font-mono text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2" role="status">
          <Loader2 size={14} className="animate-spin" /> extracting text → enriching indicators → building STIX bundle…
        </p>
      )}

      {status === 'error' && error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4 font-mono text-sm text-rose-600 dark:text-rose-400"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle size={14} /> {error}
          </span>
          {errorStatus === 503 && (
            <span className="block mt-2 text-slate-600 dark:text-slate-400">
              Upload text/HTML/an image instead, or paste text into{' '}
              <Link to="/dfir/report-parser" className="underline text-brand-600 dark:text-brand-400">
                Report Parser
              </Link>
              .
            </span>
          )}
        </div>
      )}

      {status === 'done' && view && (
        <div className="animate-fade-in-up space-y-6">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-display font-bold">{view.title}</h2>
                {view.summary && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{view.summary}</p>}
              </div>
              <span className="shrink-0 font-mono text-xs px-2 py-1 rounded border border-amber-500/40 text-amber-600">
                TLP:{view.tlp}
              </span>
            </div>
            {result?.ingest && (
              <p className="font-mono text-xs text-slate-400 mt-3">
                extraction: {result.ingest.method}
                {result.ingest.truncated ? ' · truncated' : ''}
              </p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={download}
                className="inline-flex items-center gap-1.5 font-mono text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-400"
              >
                <Download size={13} /> .stix.json
              </button>
              <button
                onClick={copyJson}
                className="inline-flex items-center gap-1.5 font-mono text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:border-brand-400"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'copied' : 'copy JSON'}
              </button>
            </div>
          </div>

          {!hasIntel && (
            <p className="font-mono text-sm text-slate-500">
              No indicators, CVEs, actors, or techniques found in this document.
            </p>
          )}

          {view.iocs.length > 0 && (
            <section>
              <h3 className="font-mono text-xs font-bold uppercase text-slate-500 mb-2">
                Indicators ({view.iocs.length})
              </h3>
              <div className="space-y-1">
                {view.iocs.map((ioc) => (
                  <div key={`${ioc.type}:${ioc.value}`} className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-slate-400 w-12">{ioc.type}</span>
                    <span className="break-all">{ioc.value}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded border ${
                        ioc.verdict === 'malicious'
                          ? 'border-rose-500/40 text-rose-600'
                          : ioc.verdict === 'suspicious'
                            ? 'border-amber-500/40 text-amber-600'
                            : 'border-slate-400/40 text-slate-500'
                      }`}
                    >
                      {ioc.verdict} · {ioc.riskScore}
                    </span>
                    {ioc.listedIn.length > 0 && <span className="text-slate-400">{ioc.listedIn.length} src</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {view.cves.length > 0 && (
            <section>
              <h3 className="font-mono text-xs font-bold uppercase text-slate-500 mb-2">CVEs ({view.cves.length})</h3>
              <div className="space-y-1">
                {view.cves.map((cve) => (
                  <div key={cve.id} className="flex items-center gap-3 font-mono text-xs">
                    <span>{cve.id}</span>
                    {cve.kevListed && (
                      <span className="px-1.5 py-0.5 rounded border border-rose-500/40 text-rose-600">KEV</span>
                    )}
                    {typeof cve.epssScore === 'number' && (
                      <span className="text-slate-400">EPSS {(cve.epssScore * 100).toFixed(1)}%</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {(view.threatActors.length > 0 || view.malware.length > 0) && (
            <section className="font-mono text-xs space-y-1">
              <h3 className="font-bold uppercase text-slate-500 mb-2">Attribution</h3>
              {view.threatActors.map((a) => (
                <div key={a.name}>
                  actor: <span className="text-red-600">{a.name}</span> {a.mitreId ? `(${a.mitreId})` : ''}
                </div>
              ))}
              {view.malware.map((m) => (
                <div key={m.name}>
                  malware: <span className="text-orange-600">{m.name}</span> {m.mitreId ? `(${m.mitreId})` : ''}
                </div>
              ))}
            </section>
          )}

          {view.attackPatterns.length > 0 && (
            <section className="font-mono text-xs">
              <h3 className="font-bold uppercase text-slate-500 mb-2">ATT&CK</h3>
              <div className="flex flex-wrap gap-2">
                {view.attackPatterns.map((t) => (
                  <span key={t.mitreId} className="px-1.5 py-0.5 rounded border border-violet-500/40 text-violet-600">
                    {t.mitreId} {t.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {bundle && (
            <section>
              <h3 className="font-mono text-xs font-bold uppercase text-slate-500 mb-2">STIX 2.1 Bundle</h3>
              <StixRelationshipGraph bundle={bundle} />
              <StixObjectTable bundle={bundle} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/dfir/ReportIngest.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/dfir/ReportIngest.tsx src/pages/dfir/ReportIngest.test.tsx
git commit -m "feat(dfir): report-ingest page — upload → STIX bundle view + export"
```

---

### Task 2: Register route + sidebar nav

**Files:**

- Modify: `src/App.tsx` (lazy import near line 64; `ROUTES` entry near line 446)
- Modify: `src/data/sidebar-nav.ts` (lucide import near line 41; DFIR "Investigate" group near line 132)

- [ ] **Step 1: Add the lazy import in `App.tsx`**

Find the existing line (`src/App.tsx:105`):

```tsx
const ReportParser = lazy(() => import('./pages/dfir/ReportParser'));
```

Add directly beneath it:

```tsx
const ReportIngest = lazy(() => import('./pages/dfir/ReportIngest'));
```

- [ ] **Step 2: Add the route table entry in `App.tsx`**

Find the existing line (`src/App.tsx:446`):

```tsx
  { path: '/dfir/report-parser', Component: ReportParser },
```

Add directly beneath it:

```tsx
  { path: '/dfir/report-ingest', Component: ReportIngest },
```

- [ ] **Step 3: Add the icon import in `sidebar-nav.ts`**

In the `lucide-react` import block that ends at `src/data/sidebar-nav.ts:41`, add `FileUp` to the imported names (alphabetical position is fine; just ensure it's inside the `{ ... } from 'lucide-react'`):

```ts
  FileUp,
```

- [ ] **Step 4: Add the nav item in `sidebar-nav.ts`**

In the DFIR config's **"Investigate"** group `items` array (`src/data/sidebar-nav.ts:132-141`), add as the first item:

```ts
        { label: 'Report Ingest', href: '/dfir/report-ingest', icon: FileUp },
```

- [ ] **Step 5: Verify the route renders (typecheck + build the route table)**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: no errors (the new symbols `ReportIngest` and `FileUp` resolve).

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/data/sidebar-nav.ts
git commit -m "feat(dfir): register /dfir/report-ingest route + sidebar nav entry"
```

---

### Task 3: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck all three projects**

Run:

```bash
npx tsc -p tsconfig.json --noEmit
cd api && npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.worker.json --noEmit && cd ..
```

Expected: no errors in any project.

- [ ] **Step 2: Run the full frontend test suite for the new + adjacent pages**

Run: `npx vitest run src/pages/dfir/ReportIngest.test.tsx src/lib/threatintel/report-client.test.ts`
Expected: all PASS.

- [ ] **Step 3: Lint (zero-warning baseline)**

Run: `npx eslint src/pages/dfir/ReportIngest.tsx src/App.tsx src/data/sidebar-nav.ts --max-warnings 0`
Expected: clean (no warnings/errors).

- [ ] **Step 4: Confirm the Worker bundle stays under the 3 MB gzip free-plan cap**

Run (from repo root): `npx wrangler deploy --dry-run --outdir /tmp/wbuild 2>&1 | grep -i gzip`
Expected: gzip value well under 3072 KiB (no new deps were added; the page is lazy-split).

- [ ] **Step 5: Non-destructive report-engine verify**

The report engine is already wired (DO `REPORT_BUILDER` v4, migration `0014_reports.sql`, routes registered, Copilot UI). Confirm nothing here broke it: the dry-run deploy in Step 4 must complete without DO/migration errors. Do **not** re-apply migrations or mutate the DO.

- [ ] **Step 6: Manual smoke (optional, local dev)**

Run `npm run dev`, open `/dfir/report-ingest`, drop a `.txt` containing an IP + a CVE id, and confirm the indicators/CVE render and `.stix.json` downloads. (Requires the backend endpoint from the prerequisite plan to be running.)

---

## Self-Review

**Spec coverage:**

- `/dfir/report-ingest` page, drag-drop + file input, 10 MB client guard, multipart POST → Task 1 ✅
- Render `IntelView` summary (IOCs/CVEs/actors/malware/ATT&CK) above raw STIX table → Task 1 ✅
- `<StixObjectTable>` + `<StixRelationshipGraph>` reuse → Task 1 ✅
- `.stix.json` client-side download + copy JSON → Task 1 ✅
- Error mapping 400/413/415/422/429/502/503 with the 503 Report-Parser link → Task 1 (test covers 503 + oversize) ✅
- Empty-but-extracted "no indicators" state → Task 1 (`hasIntel`) ✅
- Route + nav registration → Task 2 ✅
- Typecheck (3 projects), lint, bundle budget, non-destructive engine verify → Task 3 ✅

**Placeholder scan:** None. All code blocks are complete; the only runtime dependency outside this plan is the prerequisite backend endpoint, called out explicitly.

**Type consistency:** `IngestResponse extends IntelBundleResponse` (from `useIntelBundle.ts`) and adds the optional `ingest` field; `bundle` is cast to `StixBundle` (the exported type from `StixBundleViewer.tsx`) for the viewer components — the response `bundle.objects` is `Record<string, unknown>[]`, structurally accepted by the cast. `BackLink to="/dfir"` matches its `'/threatintel' | '/dfir'` prop type. `FileUp` is a valid lucide-react export. Status keys in `ERROR_BY_STATUS` match the spec's error matrix and the backend handler's returned codes.
